#!/usr/bin/env python3
"""Isolated MoLab worker for SONARA multi-model queue.

Runs entirely in a separate venv from ACE-Step. HeartMuLa and Stable Audio are
invoked in their own environments. Never start with --serve until both installed
model(s) have passed an actual local WAV smoke test.
"""
from __future__ import annotations

import argparse
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import wave

ROOT = pathlib.Path.home() / ".sonara" / "multi-engine-v1"
TOKEN = pathlib.Path.home() / ".sonara" / "relay.token"
BASE = "https://api.sonaraenterprise.com/api/sonara-multi"
STATUS = ROOT / "readiness.json"
MAX_SIZE = 80 * 1024 * 1024


def call(method: str, path: str, payload=None, lease: str = "", timeout=60):
    headers = {"X-Sonara-Relay-Token": TOKEN.read_text().strip(), "X-Sonara-Agent-Revision": "sonara-multi-engine-v1"}
    if lease:
        headers["X-Sonara-Lease"] = lease
    if isinstance(payload, (dict, list)):
        payload = json.dumps(payload).encode()
        headers["Content-Type"] = "application/json"
    if isinstance(payload, bytes):
        headers.setdefault("Content-Type", "audio/wav")
    req = urllib.request.Request(BASE + path, data=payload, method=method, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        if response.headers.get("Content-Type", "").startswith("application/json"):
            return json.load(response)
        return response.read()


def run(args: list[str], cwd: pathlib.Path | None = None, timeout: int = 1200):
    subprocess.run(args, check=True, cwd=str(cwd) if cwd else None, timeout=timeout)


def valid_wav(path: pathlib.Path, min_seconds: float = 1.0):
    if not path.is_file() or path.stat().st_size > MAX_SIZE:
        raise RuntimeError("WAV missing or exceeds 80MiB")
    with wave.open(str(path), "rb") as f:
        duration = f.getnframes() / max(f.getframerate(), 1)
        if duration < min_seconds or f.getnchannels() not in (1, 2):
            raise RuntimeError("WAV audio validation failed")
    return duration


def prepare(request: dict, directory: pathlib.Path):
    prompt = str(request.get("prompt") or "").strip()
    if not prompt:
        raise ValueError("Prompt missing")
    secs = int(request.get("durationSec") or 30)
    if not 10 <= secs <= 380:
        raise ValueError("Duration out of range")
    tags = ", ".join(s for s in [request.get("genre"), request.get("subgenre"), prompt] if s)
    lyric_text = str(request.get("lyrics") or "").strip()
    (directory / "tags.txt").write_text(tags[:4000], encoding="utf-8")
    (directory / "lyrics.txt").write_text(lyric_text or "[Instrumental]", encoding="utf-8")
    return secs


def heartmula(request: dict, out: pathlib.Path, working: pathlib.Path):
    # Official HeartMuLa example: model_path points to HeartMuLaGen, 3B and HeartCodec folders.
    repo = pathlib.Path(os.getenv("SONARA_HEARTMULA_REPO", str(ROOT / "heartlib")))
    model_path = pathlib.Path(os.getenv("SONARA_HEARTMULA_CKPT", str(ROOT / "heartlib" / "ckpt")))
    py = pathlib.Path(os.getenv("SONARA_HEARTMULA_PYTHON", str(ROOT / "heartlib-venv" / "bin" / "python")))
    if not py.is_file() or not (repo / "examples/run_music_generation.py").is_file() or not model_path.is_dir():
        raise RuntimeError("HeartMuLa not installed")
    seconds = prepare(request, working)
    mp3 = working / "heartmula-output.mp3"
    cmd = [
        str(py), str(repo / "examples/run_music_generation.py"),
        "--model_path", str(model_path), "--version", "3B",
        "--lyrics", str(working / "lyrics.txt"),
        "--tags", str(working / "tags.txt"),
        "--save_path", str(mp3),
        "--max_audio_length_ms", str(min(seconds, 240) * 1000),
        "--lazy_load", "true",
    ]
    run(cmd, cwd=repo, timeout=1200)
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(mp3),
         "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", str(out)], timeout=240)


def stable_audio(request: dict, out: pathlib.Path, working: pathlib.Path):
    py = pathlib.Path(os.getenv("SONARA_STABLE_PYTHON", str(ROOT / "stable-venv" / "bin" / "python")))
    if not py.is_file():
        raise RuntimeError("Stable Audio 3 not installed")
    seconds = prepare(request, working)
    # Explicit user acceptance is required on Hugging Face before loading.
    program = r"""
import sys
import torch
import torchaudio
from stable_audio_3 import StableAudioModel
model=StableAudioModel.from_pretrained('medium', device='cuda')
output=model.generate(prompt=sys.argv[1],duration=int(sys.argv[2]),steps=8)
if isinstance(output,torch.Tensor):
    audio=output[0].detach().float().cpu()
    torchaudio.save(sys.argv[3],audio,int(model.model.sample_rate))
else:
    raise RuntimeError('Unknown Stable Audio 3 output type')
"""
    temp = working / "stable-source.wav"
    run([str(py), "-c", program, str(request["prompt"]), str(seconds), str(temp)], timeout=1200)
    run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", str(temp),
         "-ar", "44100", "-ac", "2", "-c:a", "pcm_s16le", str(out)], timeout=240)


def readiness():
    if not STATUS.exists():
        return {"heartmula-3b": False, "stable-audio-3-medium": False}
    try:
        data = json.loads(STATUS.read_text())
    except (ValueError, OSError):
        return {"heartmula-3b": False, "stable-audio-3-medium": False}
    return {m: data.get(m) is True for m in ("heartmula-3b", "stable-audio-3-medium")}


def smoke(model: str, allow_stable: bool):
    if model == "stable-audio-3-medium" and not allow_stable:
        raise RuntimeError("Stable Audio requires accepted model terms and commercial eligibility")
    request = {
        "prompt": "Professional deep house groove, live-sounding drums and warm bass, 124 BPM, instrumental",
        "lyrics": "[Instrumental]", "durationSec": 10,
    }
    ROOT.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="sonara-multi-smoke-") as td:
        work = pathlib.Path(td)
        wav = work / "test.wav"
        (heartmula if model == "heartmula-3b" else stable_audio)(request, wav, work)
        valid_wav(wav)
    state = readiness()
    state[model] = True
    STATUS.write_text(json.dumps(state, indent=2), encoding="utf-8")
    print("SONARA_MODEL_SMOKE_PASSED=" + model, flush=True)



def renew_while_running(job_id: str, lease: str, stopped: threading.Event):
    while not stopped.wait(120):
        try:
            call("POST", "/job/" + job_id + "/renew", {}, lease=lease, timeout=30)
        except Exception:
            pass


def maintain_heartbeat(allow_stable: bool, stopped: threading.Event):
    while not stopped.is_set():
        state = readiness()
        state["stable-audio-3-medium"] = bool(state["stable-audio-3-medium"] and allow_stable)
        try:
            call("POST", "/agent/heartbeat", {
                "models": state, "stableLicenseAccepted": allow_stable,
            }, timeout=30)
        except Exception:
            pass
        stopped.wait(15)


def serve(allow_stable: bool):
    if not TOKEN.exists():
        raise RuntimeError("SONARA relay token missing: first pair the existing MoLab relay")
    if not TOKEN.read_text().strip():
        raise RuntimeError("SONARA relay token empty")
    heartbeat_stop = threading.Event()
    threading.Thread(target=maintain_heartbeat, args=(allow_stable, heartbeat_stop), daemon=True).start()
    while True:
        state = readiness()
        state["stable-audio-3-medium"] = bool(state["stable-audio-3-medium"] and allow_stable)
        try:
            job = call("POST", "/agent/claim", {}, timeout=45)
            if not job.get("jobId"):
                time.sleep(5)
                continue
            job_id = job["jobId"]
            lease = job["leaseId"]
            model = job["modelId"]
            lease_stop = threading.Event()
            renew_thread = threading.Thread(target=renew_while_running, args=(job_id, lease, lease_stop), daemon=True)
            renew_thread.start()
            try:
                if not state.get(model):
                    raise RuntimeError("Model not ready")
                with tempfile.TemporaryDirectory(prefix="sonara-multi-job-") as td:
                    work=pathlib.Path(td)
                    output=work / "master.wav"
                    runner=heartmula if model=="heartmula-3b" else stable_audio
                    runner(job["request"],output,work)
                    valid_wav(output)
                    call("PUT", "/job/"+job_id+"/audio", output.read_bytes(), lease=lease, timeout=180)
                    call("POST", "/job/"+job_id+"/complete", {}, lease=lease, timeout=40)
                print("SONARA_MULTI_JOB_COMPLETED", model, flush=True)
            except Exception as exc:
                print("SONARA_MULTI_JOB_FAILED", model, type(exc).__name__, flush=True)
                try:
                    call("POST", "/job/"+job_id+"/fail", {}, lease=lease, timeout=30)
                except Exception:
                    pass
            finally:
                lease_stop.set()
                renew_thread.join(timeout=3)
        except (urllib.error.URLError, TimeoutError, OSError, ValueError) as exc:
            print("SONARA_MULTI_RELAY_RETRY", type(exc).__name__, flush=True)
            time.sleep(10)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--smoke",choices=["heartmula-3b","stable-audio-3-medium"])
    parser.add_argument("--serve",action="store_true")
    parser.add_argument("--stable-license-accepted",action="store_true")
    args=parser.parse_args()
    if args.smoke:
        smoke(args.smoke,args.stable_license_accepted)
    elif args.serve:
        serve(args.stable_license_accepted)
    else:
        parser.print_help()


if __name__=="__main__":
    main()
