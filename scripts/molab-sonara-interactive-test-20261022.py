#!/usr/bin/env python3
"""SONARA / MoLab interactive-only ACE-Step smoke test.

Run this INSIDE your existing MoLab notebook. Uses localhost:8001 only.
Does not start a server, open a tunnel, modify checkpoints, or reach the
SONARA public site. Writes a short test WAV in the notebook filesystem.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

MODEL = "acestep-v15-xl-turbo"
LM_MODEL = "acestep-5Hz-lm-4B"
ORIGIN = "http://127.0.0.1:8001"
OUTPUT = Path("/marimo/SONARA_MOLAB_TEST_XL_TURBO.wav")


def request(path: str, body: dict | None = None, *, binary: bool = False):
    if not path.startswith("/"):
        raise ValueError("Only local relative ACE-Step API paths are allowed")
    headers = {"Accept": "audio/wav,*/*" if binary else "application/json"}
    key = (os.getenv("SONARA_ACESTEP_API_KEY")
           or os.getenv("ACESTEP_API_KEY") or "").strip()
    if key:
        headers["Authorization"] = "Bearer " + key
    data = None
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(ORIGIN + path, data=data, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=90 if body is not None else 25) as res:
            payload = res.read()
            if binary:
                return payload
            decoded = json.loads(payload.decode("utf-8"))
            if not isinstance(decoded, dict):
                raise RuntimeError("Unexpected ACE-Step JSON response")
            if int(decoded.get("code") or 200) >= 400:
                raise RuntimeError(str(decoded.get("error") or decoded.get("message") or decoded))
            return decoded
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise RuntimeError(
                "API local auth failed: set SONARA_ACESTEP_API_KEY in your PRIVATE notebook "
                "environment to match the running ACE-Step API, not in a shared code cell."
            ) from exc
        raise RuntimeError(f"ACE-Step local HTTP {exc.code} on {path.split('?')[0]}") from exc


def health():
    raw = request("/health")
    state = raw.get("data") or raw
    if not isinstance(state, dict):
        raise RuntimeError("ACE-Step health is not a JSON object")
    print("SONARA local API status:", state.get("status"))
    print("Models initialized:", state.get("models_initialized"))
    print("Loaded model:", state.get("loaded_model"))
    print("LM initialized:", state.get("llm_initialized"))
    print("Loaded LM model:", state.get("loaded_lm_model"))
    if not (
        state.get("models_initialized") is True
        and MODEL in str(state.get("loaded_model") or "")
        and state.get("llm_initialized") is True
        and LM_MODEL in str(state.get("loaded_lm_model") or "")
    ):
        raise RuntimeError(
            "XL Turbo and LM 4B must BOTH be initialized before running the test. "
            "Keep your existing checkpoints; do not reinstall just to run this test."
        )


def audio_route(task):
    result = task.get("result") or []
    if isinstance(result, str):
        try:
            result = json.loads(result)
        except json.JSONDecodeError:
            result = []
    if isinstance(result, dict):
        result = [result]
    if not isinstance(result, list) or not result:
        raise RuntimeError("Completed ACE-Step task contains no audio result")
    item = result[0]
    if not isinstance(item, dict):
        raise RuntimeError("Unexpected audio result format")
    raw = str(item.get("file") or item.get("audio_path") or item.get("path") or "")
    if not raw:
        raise RuntimeError("Missing file/audio_path in ACE-Step task")
    parsed = urllib.parse.urlsplit(raw)
    if parsed.scheme and (parsed.hostname not in {"127.0.0.1", "localhost"}):
        raise RuntimeError("Nonlocal audio URL rejected: notebook-only test")
    if parsed.path == "/v1/audio":
        paths = urllib.parse.parse_qs(parsed.query).get("path", [])
        if not paths:
            raise RuntimeError("ACE-Step /v1/audio URL is missing path")
        file_path = paths[0]
    elif parsed.path.startswith("/"):
        file_path = parsed.path
    else:
        raise RuntimeError("Unexpected ACE-Step output path")
    return "/v1/audio?" + urllib.parse.urlencode({"path": file_path})


def main():
    print("SONARA MoLab interactive smoke test — NO external tunnel / NO public server")
    health()
    payload = {
        "model": MODEL,
        "prompt": (
            "Original instrumental melodic techno, 124 BPM, warm analog arpeggiator, "
            "deep rounded bass, crisp controlled drums, evolving pads, clear mix."
        ),
        "lyrics": "[Instrumental]",
        "bpm": 124,
        "audio_duration": 10,
        "audio_format": "wav",
        "inference_steps": 2,
        "batch_size": 1,
        "thinking": True,
        "use_format": False,
    }
    started = request("/release_task", payload)
    task_id = ((started.get("data") or {}).get("task_id")
               if isinstance(started.get("data"), dict) else started.get("task_id"))
    if not task_id:
        raise RuntimeError("ACE-Step did not return a task_id")
    print("Test generation submitted; polling locally…")

    deadline = time.monotonic() + 15 * 60
    task = None
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        response = request("/query_result", {"task_id_list": [task_id]})
        items = response.get("data") or []
        task = items[0] if isinstance(items, list) and items else {}
        status = str(task.get("status", "0")).strip().lower()
        if status in {"1", "completed", "success", "succeeded", "done"}:
            break
        if status in {"2", "-1", "failed", "error", "cancelled", "canceled"}:
            raise RuntimeError("ACE-Step generation failed: " + str(task.get("error") or task.get("message") or status))
        if attempt % 6 == 0:
            print(f"Still generating locally (poll {attempt})")
        time.sleep(5)
    else:
        raise RuntimeError("Local generation timed out after 15 minutes")

    wav = request(audio_route(task), binary=True)
    if not (len(wav) > 44 and wav[:4] == b"RIFF" and wav[8:12] == b"WAVE"):
        raise RuntimeError("Generated payload is not a valid RIFF/WAVE header")
    output = OUTPUT if OUTPUT.parent.is_dir() else Path.cwd() / OUTPUT.name
    output.write_bytes(wav)
    print("SUCCESS: XL Turbo + LM 4B generated actual WAV audio.")
    print("SAVED:", output)
    print("SIZE_BYTES:", len(wav))
    return str(output)


if __name__ == "__main__":
    main()
