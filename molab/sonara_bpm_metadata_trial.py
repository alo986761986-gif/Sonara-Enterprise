"""MoLab-only controlled test: ACE-Step 170 BPM metadata-only vs repeated prompt tempo.

Does not alter a production configuration, restart a process, or time-stretch audio.
Creates four local 30s WAVs only while the relay and queue are idle.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
import wave
from pathlib import Path

ROOT = Path.home() / ".sonara"
API = "http://127.0.0.1:8001"
KEY = Path("/marimo/.sonara_ace_api_key")
BPM = 170
SEED = 170606
BASE_PROMPT = (
    "Original professional jazz fusion instrumental, expressive Rhodes piano, "
    "natural acoustic drum kit, electric bass and jazz guitar, performed "
    "with consistent musical phrasing, realistic dynamics and melodic solos."
)
TEMPO_CUE = (
    "Exactly 170 BPM quarter-note pulse throughout, not half-time or "
    "double-time; stable 170 BPM master clock for drums and bass."
)


def api(method, route, data=None, binary=False):
    token = KEY.read_text(encoding="utf-8").strip()
    if len(token) < 16:
        raise RuntimeError("Missing local ACE-Step credential")
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json"}
    payload = json.dumps(data).encode() if data is not None else None
    if payload is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(API + route, data=payload, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as response:
        if binary:
            raw = response.read(80 * 1024 * 1024 + 1)
            if len(raw) > 80 * 1024 * 1024:
                raise RuntimeError("WAV larger than limit")
            return raw
        value = json.load(response)
    if not isinstance(value, dict) or value.get("error"):
        raise RuntimeError("ACE-Step API error")
    return value.get("data", value)


def idle():
    status = json.loads((ROOT / "relay-agent-status.json").read_text())
    stats = api("GET", "/v1/stats")
    jobs = stats.get("jobs", {}) if isinstance(stats, dict) else {}
    if status.get("state") != "waiting_for_authorized_job":
        raise RuntimeError("Relay not idle - no generation started")
    if (not isinstance(jobs, dict) or
            int(jobs.get("running", -1)) != 0 or
            int(jobs.get("queued", -1)) != 0):
        raise RuntimeError("Engine queue not empty - no generation started")
    health = api("GET", "/health")
    if health.get("models_initialized") is not True or health.get("llm_initialized") is not True:
        raise RuntimeError("XL Turbo or LM 4B not ready")


def get_paths(task):
    value = task.get("result") or []
    if isinstance(value, str):
        value = json.loads(value)
    found = []
    def visit(item):
        if isinstance(item, list):
            for x in item:
                visit(x)
        elif isinstance(item, dict):
            for name in ("audio_path", "audio_file", "file", "path", "url", "outputs", "result", "audio"):
                if name in item:
                    visit(item[name])
        elif isinstance(item, str):
            parsed = urllib.parse.urlsplit(item)
            p = urllib.parse.parse_qs(parsed.query).get("path", [None])[0]
            if p is None and item.startswith("/"):
                p = item
            if p and p not in found:
                found.append(p)
    visit(value)
    return found[:2]


def one_case(with_tempo_text, output, verifier):
    label = "PROMPT_BPM" if with_tempo_text else "METADATA_ONLY"
    data = {
        "model": "acestep-v15-xl-turbo", "task_type": "text2music",
        "prompt": BASE_PROMPT + (" " + TEMPO_CUE if with_tempo_text else ""),
        "lyrics": "[Instrumental]", "audio_duration": 30,
        "bpm": BPM, "key_scale": "A Minor", "time_signature": "4",
        "batch_size": 2, "inference_steps": 8, "shift": 3,
        "thinking": True, "allow_lm_batch": True,
        "audio_format": "wav", "sampler_mode": "euler",
        "guidance_scale": 1.0,
        "use_random_seed": False, "seed": SEED
    }
    begin = time.monotonic()
    response = api("POST", "/release_task", data)
    task_id = response.get("task_id") if isinstance(response, dict) else None
    if not task_id:
        raise RuntimeError("No task ID")
    paths = []
    for _ in range(450):
        time.sleep(2)
        answer = api("POST", "/query_result", {"task_id_list": [task_id]})
        task = answer[0] if isinstance(answer, list) and answer else answer
        if not isinstance(task, dict):
            continue
        status = str(task.get("status", "")).lower()
        if status in ("-1", "failed", "error"):
            raise RuntimeError("ACE-Step generation failed")
        if status in ("1", "success", "completed", "done", "succeeded"):
            paths = get_paths(task)
            break
    print("CASE=", label, flush=True)
    print("GENERATION_SECONDS=", round(time.monotonic() - begin, 2), flush=True)
    print("GENERATED_TRACKS=", len(paths), flush=True)
    if len(paths) != 2:
        raise RuntimeError("Incomplete A/B result")
    for index, p in enumerate(paths):
        letter = "A" if index == 0 else "B"
        raw = api("GET", "/v1/audio?" + urllib.parse.urlencode({"path": p}), binary=True)
        if len(raw) < 44 or raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
            raise RuntimeError("Not a PCM WAV")
        path = output / (label + "_" + letter + ".wav")
        path.write_bytes(raw)
        path.chmod(0o600)
        with wave.open(str(path), "rb") as wav:
            seconds = wav.getnframes() / float(wav.getframerate())
        report = verifier(path, BPM)
        measured = report.get("detectedBpm")
        near = isinstance(measured, (int, float)) and abs(measured - BPM) <= 5
        print("TRACK_", letter, "_DURATION=", round(seconds, 1), sep="", flush=True)
        print("TRACK_", letter, "_BPM_DETECTED=", measured, sep="", flush=True)
        print("TRACK_", letter, "_NEAR_170_NOT_VERIFIED=", near, sep="", flush=True)
        print("TRACK_", letter, "_BPM_STATUS=", report.get("bpmStatus"), sep="", flush=True)


def main():
    print("=== SONARA 170 BPM: TEXT CUE VS NATIVE METADATA ===", flush=True)
    idle()
    sys.path.insert(0, str(ROOT))
    from sonara_bpm_verification import verify_wav_tempo
    output = Path("/marimo/SONARA_BPM_METADATA_TRIAL") / time.strftime("%Y%m%dT%H%M%S")
    output.mkdir(mode=0o700, parents=True, exist_ok=False)
    print("MODEL=acestep-v15-xl-turbo", flush=True)
    print("LM_THINKING=True", flush=True)
    print("NATIVE_BPM=170 in both cases", flush=True)
    print("SEED_FIXED=True", flush=True)
    for with_text in (True, False):
        idle()
        one_case(with_text, output, verify_wav_tempo)
    print("SAVED_WAV_DIR=", str(output), flush=True)
    print("NO_ENGINE_RESTART=True", flush=True)
    print("NO_PRODUCTION_CHANGE=True", flush=True)
    print("NOTE=Near 170 is not exact BPM certification.", flush=True)


if __name__ == "__main__":
    main()
