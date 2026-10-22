#!/usr/bin/env python3
"""Italian-vocal end-to-end ACE-Step test *inside* the existing MoLab notebook.

Uses the existing local 127.0.0.1:8001 API; no public tunnel or website calls.
A successful WAV proves a vocal-conditioned task completed, NOT that the voice
or words are perceptually correct: listen to the result.
"""
from __future__ import annotations

import json
from pathlib import Path
import time
import urllib.request

SMOKE_LIBRARY_URL = (
    "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/"
    "feature/sonara-molab-xl-only-20261022/"
    "scripts/molab-sonara-interactive-test-20261022.py"
)
OUTPUT = Path("/marimo/SONARA_MOLAB_TEST_VOCE_IT.wav")


def main():
    source = urllib.request.urlopen(SMOKE_LIBRARY_URL, timeout=30).read().decode("utf-8")
    lib = {"__name__": "sonara_molab_local_api"}
    exec(compile(source, SMOKE_LIBRARY_URL, "exec"), lib)
    lib["health"]()
    request = lib["request"]

    payload = {
        "model": "acestep-v15-xl-turbo",
        "prompt": (
            "Original contemporary Italian pop-soul song, 100 BPM, expressive "
            "natural lead singing in Italian, gentle electric piano, warm bass, "
            "live-sounding drums, melodic chorus, balanced smooth studio mix."
        ),
        "lyrics": (
            "[Verse]\n"
            "Cammino piano dentro questa città,\n"
            "la luce torna e il giorno cambierà.\n"
            "[Chorus]\n"
            "Resta con me, la notte passerà,\n"
            "un nuovo cielo ci accompagnerà."
        ),
        "vocal_language": "it",
        "bpm": 100,
        "audio_duration": 20,
        "audio_format": "wav",
        "inference_steps": 2,
        "batch_size": 1,
        "thinking": True,
        "use_format": False,
        "task_type": "text2music",
    }

    response = request("/release_task", payload)
    body = response.get("data") or {}
    task_id = body.get("task_id") if isinstance(body, dict) else None
    if not task_id:
        raise RuntimeError("ACE-Step returned no vocal-generation task_id")
    print("SONARA Italian-vocal smoke test submitted locally.")

    deadline = time.monotonic() + 15 * 60
    attempt = 0
    while time.monotonic() < deadline:
        attempt += 1
        poll = request("/query_result", {"task_id_list": [task_id]})
        rows = poll.get("data") or []
        task = rows[0] if isinstance(rows, list) and rows else {}
        status = str(task.get("status", "0")).strip().lower()
        if status in ("1", "completed", "success", "succeeded", "done"):
            break
        if status in ("2", "-1", "failed", "error", "cancelled", "canceled"):
            raise RuntimeError("ACE-Step vocal generation failed: " + str(task.get("error") or task.get("message") or status))
        if attempt % 6 == 0:
            print("Vocal generation ongoing (local poll {})".format(attempt))
        time.sleep(5)
    else:
        raise RuntimeError("Vocal generation not completed within 15 minutes")

    wav = request(lib["audio_route"](task), binary=True)
    if len(wav) <= 44 or wav[:4] != b"RIFF" or wav[8:12] != b"WAVE":
        raise RuntimeError("Vocal task did not return a real WAV container")
    out = OUTPUT if OUTPUT.parent.is_dir() else Path.cwd() / OUTPUT.name
    out.write_bytes(wav)
    print("VOCAL_WAV_GENERATED=YES")
    print("LANGUAGE_REQUESTED=it")
    print("PATH=", out)
    print("SIZE_BYTES=", len(wav))
    print("Listen to verify intelligible Italian vocals. File validity is not vocal quality.")
    return str(out)


if __name__ == "__main__":
    main()
