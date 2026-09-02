#!/usr/bin/env python3
"""SONARA Video AI live black-video fix for an already running MoLab RTX Pro 6000 worker.

Preserves the existing token, output directory and Cloudflare quick-tunnel URL.
It replaces only the resident Wan 2.2 API with a quality-safe profile:
121 frames, minimum 28 denoise steps, 50-step visual recovery, stronger black-frame
validation and MP4 container validation.
"""

from __future__ import annotations

import json
import os
import shutil
import signal
import socket
import subprocess
import time
import urllib.request

WORKER_URL = (
    "https://raw.githubusercontent.com/"
    "alo986761986-gif/Sonara-Enterprise/main/"
    "scripts/molab-sonara-wan22-video-worker.py?blackfix=20260902-v4"
)
PORT = 7862


def replace_once(source: str, old: str, new: str, label: str) -> str:
    if old not in source:
        raise RuntimeError(f"Patch SONARA non applicabile: {label}")
    return source.replace(old, new, 1)


def port_open(port: int) -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(0.25)
    try:
        return sock.connect_ex(("127.0.0.1", port)) == 0
    finally:
        sock.close()


def listener_pids(port: int) -> list[int]:
    found: set[int] = set()
    for command in (["fuser", "-n", "tcp", str(port)], ["lsof", "-t", f"-iTCP:{port}", "-sTCP:LISTEN"]):
        if not shutil.which(command[0]):
            continue
        try:
            result = subprocess.run(command, check=False, text=True, capture_output=True, timeout=10)
            text = (result.stdout or "") + " " + (result.stderr or "")
            for token in text.replace("/tcp:", " ").split():
                if token.isdigit():
                    found.add(int(token))
        except Exception:
            pass
    return sorted(pid for pid in found if pid > 1 and pid != os.getpid())


def force_release_port(port: int) -> None:
    print(f"SONARA_PORT_{port}=CHECK", flush=True)
    if not port_open(port):
        print(f"SONARA_PORT_{port}=FREE", flush=True)
        return

    pids = listener_pids(port)
    print(f"SONARA_PORT_{port}_PIDS={pids}", flush=True)
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        except Exception as exc:
            print(f"SONARA_PORT_TERM_WARNING={pid}:{exc}", flush=True)

    deadline = time.time() + 8
    while time.time() < deadline and port_open(port):
        time.sleep(0.25)

    if port_open(port):
        pids = listener_pids(port)
        print(f"SONARA_PORT_{port}_FORCE_PIDS={pids}", flush=True)
        for pid in pids:
            try:
                os.kill(pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            except Exception as exc:
                print(f"SONARA_PORT_KILL_WARNING={pid}:{exc}", flush=True)

    deadline = time.time() + 8
    while time.time() < deadline:
        if not port_open(port):
            print(f"SONARA_PORT_{port}=FREE", flush=True)
            return
        time.sleep(0.25)
    raise RuntimeError(f"Impossibile liberare la porta {port}. Il vecchio worker Video AI e ancora in ascolto.")


def patched_api_source(original: str) -> str:
    source = original
    source = replace_once(
        source,
        'PROFILE = "molab-rtx-pro-6000-blackwell-fast-v2"',
        'PROFILE = "molab-rtx-pro-6000-blackwell-quality-fast-v3"',
        "profile-v3",
    )
    source = replace_once(source, "MIN_VISIBLE_LUMA = 18.0", "MIN_VISIBLE_LUMA = 26.0", "luma-threshold")
    source = replace_once(source, "    frames: int = 97", "    frames: int = 121", "request-frames")
    source = replace_once(source, "    steps: int = 12", "    steps: int = 28", "request-steps")
    source = replace_once(
        source,
        "def validate_frames(value: int) -> int:\n    value = max(17, min(97, int(value)))\n    return max(17, ((value - 1) // 4) * 4 + 1)\n",
        "def validate_frames(value: int) -> int:\n    # TI2V-5B quality-safe profile for RTX Pro 6000.\n    return 121\n",
        "frame-validator",
    )
    source = replace_once(
        source,
        "def average_video_luma(path: Path) -> float:\n    \"\"\"Return the mean 8-bit luma over all frames after spatial downsampling.\"\"\"\n    import subprocess\n\n    samples = subprocess.check_output(\n        [\n            \"ffmpeg\", \"-v\", \"error\", \"-i\", str(path), \"-an\",\n            \"-vf\", \"scale=1:1,format=gray\", \"-f\", \"rawvideo\", \"-\",\n        ],\n        timeout=300,\n    )\n    if not samples:\n        raise RuntimeError(\"Il controllo visivo non ha trovato fotogrammi nel video.\")\n    return round(sum(samples) / len(samples), 3)\n",
        '''def validate_mp4(path: Path) -> dict:\n    import json as _json\n    import subprocess\n\n    if not path.exists() or path.stat().st_size < 10000:\n        raise RuntimeError("Wan 2.2 non ha prodotto un MP4 valido.")\n    header = path.read_bytes()[:64]\n    if b"ftyp" not in header:\n        raise RuntimeError("Il file generato non contiene una firma MP4 valida.")\n    raw = subprocess.check_output([\n        "ffprobe", "-v", "error", "-select_streams", "v:0",\n        "-show_entries", "stream=codec_name,width,height,pix_fmt",\n        "-show_entries", "format=duration,size", "-of", "json", str(path),\n    ], text=True, timeout=120)\n    info = _json.loads(raw)\n    streams = info.get("streams") or []\n    if not streams:\n        raise RuntimeError("MP4 senza stream video.")\n    stream = streams[0]\n    if str(stream.get("codec_name") or "").lower() != "h264":\n        raise RuntimeError(f"Codec MP4 inatteso: {stream.get('codec_name')}")\n    if int(stream.get("width") or 0) < 640 or int(stream.get("height") or 0) < 360:\n        raise RuntimeError("Risoluzione MP4 non valida.")\n    if float((info.get("format") or {}).get("duration") or 0) < 0.8:\n        raise RuntimeError("Durata MP4 non valida.")\n    return info\n\n\ndef video_visual_metrics(path: Path) -> tuple[float, float, float]:\n    \"\"\"Measure mean light, bright-detail percentile and truly-dark pixel ratio.\"\"\"\n    import subprocess\n\n    samples = subprocess.check_output([\n        "ffmpeg", "-v", "error", "-i", str(path), "-an",\n        "-vf", "scale=32:18,format=gray", "-f", "rawvideo", "-",\n    ], timeout=300)\n    if not samples:\n        raise RuntimeError("Il controllo visivo non ha trovato fotogrammi nel video.")\n    values = list(samples)\n    ordered = sorted(values)\n    mean_luma = round(sum(values) / len(values), 3)\n    p90 = float(ordered[min(len(ordered) - 1, int(len(ordered) * 0.90))])\n    dark_ratio = round(sum(1 for value in values if value <= 12) / len(values), 4)\n    return mean_luma, p90, dark_ratio\n''',
        "visual-validator",
    )
    source = replace_once(source, "        frames = validate_frames(req.frames)", "        frames = 121", "render-frames")
    source = replace_once(
        source,
        "        steps = max(10, min(12, int(req.steps)))",
        "        steps = max(28, min(50, int(req.steps)))",
        "render-steps",
    )
    source = replace_once(
        source,
        "        luma_average = 0.0\n        from diffusers.utils import export_to_video",
        "        luma_average = 0.0\n        p90_luma = 0.0\n        dark_pixel_ratio = 1.0\n        mp4_info = {}\n        from diffusers.utils import export_to_video",
        "metrics-init",
    )
    source = replace_once(source, "                effective_steps = max(16, steps)", "                effective_steps = 50", "recovery-steps")
    source = replace_once(
        source,
        "            if not final.exists() or final.stat().st_size < 10000:\n                raise RuntimeError(\"Wan 2.2 non ha prodotto un MP4 valido.\")\n\n            luma_average = average_video_luma(final)\n            print(\n                f\"SONARA_VIDEO_VISUAL_CHECK job={job_id} attempt={render_attempts} luma={luma_average}\",\n                flush=True,\n            )\n            if luma_average >= MIN_VISIBLE_LUMA:\n                break",
        "            mp4_info = validate_mp4(final)\n            luma_average, p90_luma, dark_pixel_ratio = video_visual_metrics(final)\n            print(\n                f\"SONARA_VIDEO_VISUAL_CHECK job={job_id} attempt={render_attempts} \"\n                f\"luma={luma_average} p90={p90_luma} dark_ratio={dark_pixel_ratio}\",\n                flush=True,\n            )\n            if luma_average >= MIN_VISIBLE_LUMA and p90_luma >= 45 and dark_pixel_ratio <= 0.85:\n                break",
        "visual-gate",
    )
    source = replace_once(
        source,
        "            lumaAverage=luma_average,\n            minimumVisibleLuma=MIN_VISIBLE_LUMA,",
        "            lumaAverage=luma_average,\n            p90Luma=p90_luma,\n            darkPixelRatio=dark_pixel_ratio,\n            minimumVisibleLuma=MIN_VISIBLE_LUMA,\n            mp4Validated=True,",
        "completion-metrics",
    )
    source = replace_once(source, '        "nativeFps": 12,', '        "nativeFps": 15,', "health-native-fps")
    source = replace_once(source, '        "defaultFrames": 97,', '        "defaultFrames": 121,', "health-frames")
    source = replace_once(source, '        "defaultSteps": 12,', '        "defaultSteps": 28,', "health-steps")
    source = replace_once(source, '        "maxFrames": 97,', '        "maxFrames": 121,', "health-max-frames")
    return source


def main() -> None:
    print("=" * 92)
    print("SONARA VIDEO AI - BLACK VIDEO FIX V4 - RTX PRO 6000")
    print("=" * 92)
    worker_code = urllib.request.urlopen(WORKER_URL, timeout=120).read().decode("utf-8")
    ns = {"__name__": "sonara_wan22_blackfix_worker", "__file__": WORKER_URL}
    exec(compile(worker_code, "<sonara-wan22-worker>", "exec"), ns)

    original_source = ns["api_source"]()
    patched_source = patched_api_source(original_source)
    ns["PROFILE"] = "molab-rtx-pro-6000-blackwell-quality-fast-v3"
    ns["api_source"] = lambda: patched_source

    # The previous supervisor can leave an old Uvicorn listener alive for a few
    # seconds. Free the API port explicitly; the Cloudflare tunnel is a separate
    # process and remains connected to 127.0.0.1:7862 throughout the restart.
    force_release_port(PORT)
    ns["write_api"]()
    token_value = ns["token"]()
    proc = ns["start_api"](token_value)

    deadline = time.time() + 1200
    last = None
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = ns["API_LOG"].read_text(errors="replace")[-16000:]
            raise RuntimeError(f"API Video AI terminata durante il reload:\n{tail}")
        try:
            last = ns["request_json"](f"http://127.0.0.1:{PORT}/health", timeout=8)
            if last.get("ready") and last.get("profile") == "molab-rtx-pro-6000-blackwell-quality-fast-v3":
                break
        except Exception as exc:
            last = {"error": str(exc)}
        time.sleep(3)
    else:
        raise RuntimeError(f"Timeout reload Video AI: {last!r}")

    ready_file = ns["READY_FILE"]
    public_url = ""
    try:
        ready = json.loads(ready_file.read_text(encoding="utf-8"))
        public_url = str(ready.get("url") or "").rstrip("/")
    except Exception:
        pass

    print("SONARA_BLACK_VIDEO_FIX=ACTIVE")
    print("PROFILE=molab-rtx-pro-6000-blackwell-quality-fast-v3")
    print("FRAMES=121")
    print("FIRST_PASS_STEPS=28")
    print("BLACK_RECOVERY_STEPS=50")
    print("MP4_VALIDATION=ON")
    print("VISUAL_BLACK_GUARD=STRICT")
    if public_url:
        print("SONARA_MOLAB_VIDEO_URL=" + public_url)
    print("NON FERMARE QUESTA CELLA.")

    while True:
        try:
            health = ns["request_json"](f"http://127.0.0.1:{PORT}/health", timeout=10)
            state = "READY" if health.get("ready") else "LOADING"
            profile = health.get("profile")
            frames = health.get("defaultFrames")
            steps = health.get("defaultSteps")
            public_state = "UNKNOWN"
            if public_url:
                try:
                    remote = ns["request_json"](public_url + "/health", timeout=15)
                    public_state = "UP" if remote.get("status") == "ok" else "DOWN"
                except Exception:
                    public_state = "DOWN"
            print(
                f"[{time.strftime('%H:%M:%S')}] VIDEO_AI={state} | PROFILE={profile} | "
                f"FRAMES={frames} | STEPS={steps} | PUBLIC={public_state}",
                flush=True,
            )
        except Exception as exc:
            print(f"SONARA_VIDEO_AI_WATCHDOG_ERROR={exc}", flush=True)
        time.sleep(60)


if __name__ == "__main__":
    main()
