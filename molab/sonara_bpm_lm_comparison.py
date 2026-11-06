"""SONARA local BPM A/B diagnostic comparing ACE-Step native LM planning.

Opt-in; executes two native two-song batches (4 real 30s WAVs) only when relay idle.
Keeps model, duration, steps, prompt and BPM identical; changes only thinking.
Does not restart models, mutate site, auto-repair or write secrets.
"""
from __future__ import annotations

import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8001"
ROOT = Path.home() / ".sonara"
KEY_PATH = Path("/marimo/.sonara_ace_api_key")
TARGET = 170


def api(method, route, payload=None, binary=False):
    token = KEY_PATH.read_text().strip()
    if len(token) < 16:
        raise RuntimeError("ACE-Step local credential missing")
    headers = {"Authorization": "Bearer " + token, "Accept": "application/json"}
    data = json.dumps(payload).encode() if payload is not None else None
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(BASE + route, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=120) as r:
        if binary:
            raw = r.read(80 * 1024 * 1024 + 1)
            if len(raw) > 80 * 1024 * 1024:
                raise RuntimeError("Audio too large")
            return raw
        value = json.load(r)
    if not isinstance(value, dict) or value.get("error"):
        raise RuntimeError("ACE-Step API error")
    return value.get("data", value)


def paths_of(task):
    raw = task.get("result") or []
    if isinstance(raw, str):
        raw = json.loads(raw)
    found = []
    def collect(item):
        if isinstance(item, list):
            for x in item:
                collect(x)
        elif isinstance(item, dict):
            for k in ("audio_path", "audio_file", "path", "file", "outputs", "result", "url", "audio"):
                if k in item:
                    collect(item[k])
        elif isinstance(item, str):
            q = urllib.parse.urlsplit(item)
            path = urllib.parse.parse_qs(q.query).get("path", [None])[0]
            if path is None and item.startswith("/"):
                path = item
            if path and path not in found:
                found.append(path)
    collect(raw)
    return found[:2]


def ensure_idle():
    status = json.loads((ROOT / "relay-agent-status.json").read_text())
    stats = api("GET", "/v1/stats")
    jobs = stats.get("jobs", {})
    if status.get("state") != "waiting_for_authorized_job" or not isinstance(jobs, dict):
        raise RuntimeError("Relay busy: no test started")
    if int(jobs.get("running", -1)) != 0 or int(jobs.get("queued", -1)) != 0:
        raise RuntimeError("Generation queue not empty: no test started")
    health = api("GET", "/health")
    if not (health.get("models_initialized") is True and health.get("llm_initialized") is True):
        raise RuntimeError("Model or LM not ready")


def run_case(thinking, destination, verify):
    payload = {
        "model": "acestep-v15-xl-turbo", "task_type": "text2music",
        "prompt": (
            "Professional original jazz fusion instrumental; steady exactly 170 BPM "
            "quarter-note pulse throughout; acoustic drums, bass, Rhodes and guitar; "
            "consistent 170 BPM master clock, natural human dynamics, no half-time."
        ),
        "lyrics": "[Instrumental]", "audio_duration": 30,
        "bpm": TARGET, "key_scale": "A Minor", "time_signature": "4",
        "batch_size": 2, "inference_steps": 8, "shift": 3,
        "thinking": thinking, "allow_lm_batch": thinking,
        "sampler_mode": "euler", "audio_format": "wav",
        "use_random_seed": True, "seed": -1
    }
    started = time.monotonic()
    result = api("POST", "/release_task", payload)
    task_id = result.get("task_id") if isinstance(result, dict) else None
    if not task_id:
        raise RuntimeError("No local task id")
    audio_paths = []
    for _ in range(450):
        time.sleep(2)
        result = api("POST", "/query_result", {"task_id_list": [task_id]})
        task = result[0] if isinstance(result, list) and result else result
        if not isinstance(task, dict):
            continue
        state = str(task.get("status", "")).lower()
        if state in ("-1", "failed", "error"):
            raise RuntimeError("Generation failed")
        if state in ("1", "success", "completed", "done", "succeeded"):
            audio_paths = paths_of(task)
            break
    print("CASE=", "LM_ON" if thinking else "LM_OFF")
    print("GENERATION_SECONDS=", round(time.monotonic() - started, 2))
    print("GENERATED_TRACKS=", len(audio_paths))
    if len(audio_paths) != 2:
        raise RuntimeError("Incomplete two-track batch")
    for i, audio_path in enumerate(audio_paths):
        label = "A" if i == 0 else "B"
        raw = api("GET", "/v1/audio?" + urllib.parse.urlencode({"path": audio_path}), binary=True)
        if len(raw) < 44 or raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
            raise RuntimeError("Invalid WAV response")
        wav = destination / ("LM_" + ("ON" if thinking else "OFF") + "_" + label + ".wav")
        wav.write_bytes(raw)
        wav.chmod(0o600)
        report = verify(wav, TARGET)
        print("TRACK_", label, "_DETECTED_BPM=", report.get("detectedBpm"), sep="")
        print("TRACK_", label, "_BPM_STATUS=", report.get("bpmStatus"), sep="")
        print("TRACK_", label, "_BPM_VERIFIED=", report.get("bpmVerified"), sep="")


def main():
    ensure_idle()
    sys.path.insert(0, str(ROOT))
    from sonara_bpm_verification import verify_wav_tempo
    output = Path("/marimo/SONARA_BPM_LM_COMPARISON")
    output.mkdir(mode=0o700, exist_ok=True)
    print("SONARA_BPM_CONTROLLED_LM_TEST=True")
    print("BPM_REQUESTED=170")
    print("ENGINE_RESTART=False")
    for thinking in (True, False):
        ensure_idle()
        run_case(thinking, output, verify_wav_tempo)
    print("COMPARISON_WAV_DIRECTORY=", str(output))
    print("NOTE=Diagnostic only; instrument quality and BPM require human review.")


if __name__ == "__main__":
    main()
