#!/usr/bin/env python3
"""SONARA XL SFT local-only 10s audio smoke test. Never touches Cloudflare/R2/jobs.

Run on authorized MoLab GPU after SFT/8003 and Turbo/8001 health are green.
"""
from __future__ import annotations

import argparse
import io
import json
import pathlib
import time
import urllib.parse
import urllib.request
import wave

TURBO_URL = "http://127.0.0.1:8001"
SFT_URL = "http://127.0.0.1:8003"
SFT_NAME = "acestep-v15-xl-sft"
TURBO_NAME = "acestep-v15-xl-turbo"
LM_NAME = "acestep-5Hz-lm-4B"
OUT = pathlib.Path("/tmp/sonara-xl-sft-smoke.wav")

def local(url: str, path: str, payload: dict | None = None, timeout=25, binary=False):
    if url not in (TURBO_URL, SFT_URL) or not path.startswith("/"):
        raise ValueError("Untrusted URL; only local ACE-Step API ports are permitted")
    body = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url + path, data=body, method="POST" if body is not None else "GET",
        headers={"Accept": "*/*" if binary else "application/json", **({"Content-Type": "application/json"} if body else {})})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError(f"Local ACE API HTTP {response.status}")
        data = response.read(80 * 1024 * 1024 + 1 if binary else 600_000)
        if binary:
            if len(data) > 80 * 1024 * 1024:
                raise RuntimeError("Generated audio exceeds 80MiB")
            return data
        result = json.loads(data)
        if result.get("error") or int(result.get("code", 200)) >= 400:
            raise RuntimeError("ACE-Step returned an application error")
        return result.get("data", result)

def available():
    turbo = local(TURBO_URL, "/health", timeout=10)
    sft = local(SFT_URL, "/health", timeout=10)
    if not isinstance(turbo, dict) or turbo.get("models_initialized") is not True or turbo.get("llm_initialized") is not True or turbo.get("loaded_model") != TURBO_NAME:
        raise RuntimeError("Turbo/LM 4B unavailable on 8001")
    if not isinstance(sft, dict) or sft.get("models_initialized") is not True or sft.get("loaded_model") != SFT_NAME:
        raise RuntimeError("XL SFT unavailable on 8003")
    print("SONARA_TURBO_8001_READY=True", flush=True)
    print("SONARA_XL_SFT_8003_READY=True", flush=True)
    print("SONARA_TURBO_LM4B=" + str(turbo.get("loaded_lm_model") == LM_NAME), flush=True)
    return True

def request_payload():
    return {
        "model": SFT_NAME,
        "task_type": "text2music",
        "prompt": "Jazz fusion instrumental, live acoustic drum kit, natural hi-hat variation, fingerstyle bass, Rhodes electric piano, expressive clean electric guitar, sophisticated chords, 112 BPM, warm room, organic human performance",
        "lyrics": "[Instrumental]",
        "bpm": 112,
        "audio_duration": 10,
        "batch_size": 1,
        "thinking": False,
        "inference_steps": 50,
        "guidance_scale": 7.0,
        "shift": 1.0,
        "use_random_seed": True,
        "use_format": False,
    }

def get_task(payload):
    if not isinstance(payload, dict):
        return {}
    row = payload.get("data", payload)
    if isinstance(row, list):
        return row[0] if row and isinstance(row[0], dict) else {}
    return row if isinstance(row, dict) else {}

def audio_path(row):
    if not isinstance(row, dict):
        return None
    result = row.get("result")
    if isinstance(result, str):
        try:
            result = json.loads(result)
        except (ValueError, TypeError):
            result = result
    found = []
    def visit(item):
        if isinstance(item, list):
            for sub in item: visit(sub)
        elif isinstance(item, dict):
            for key in ("audio_path", "audio_file", "file", "path", "url", "audio", "outputs", "result"):
                if key in item: visit(item[key])
        elif isinstance(item, str):
            parsed = urllib.parse.urlsplit(item)
            path = urllib.parse.parse_qs(parsed.query).get("path", [None])[0]
            if not path and item.startswith("/") and not item.startswith("/v1/audio"):
                path = item
            if path: found.append(path)
    visit(result)
    return found[0] if found else None

def run(test=False):
    print("=== SONARA XL SFT PRIVATE SMOKE ===", flush=True)
    available()
    if not test:
        print("SONARA_TEST_AUDIO_CREATED=False", flush=True)
        print("SONARA_SITE_UNCHANGED=True", flush=True)
        return 0
    response = local(SFT_URL, "/release_task", request_payload(), timeout=120)
    row = get_task(response)
    task_id = row.get("task_id")
    if not isinstance(task_id, str) or not task_id:
        raise RuntimeError("No SFT task ID returned")
    print("SONARA_XL_SFT_TASK_ACCEPTED=True", flush=True)
    deadline = time.monotonic() + 900
    while time.monotonic() < deadline:
        answer = local(SFT_URL, "/query_result", {"task_id_list": [task_id]}, timeout=60)
        task = get_task(answer)
        status = str(task.get("status") or "").lower()
        if status in ("-1", "failed", "error"):
            raise RuntimeError("XL SFT generation failed")
        if status in ("1", "completed", "success", "succeeded", "done", "finished"):
            path = audio_path(task)
            if not path:
                raise RuntimeError("SFT completed without an audio path")
            audio = local(SFT_URL, "/v1/audio?" + urllib.parse.urlencode({"path": path}), timeout=120, binary=True)
            with wave.open(io.BytesIO(audio), "rb") as wav:
                rate, channels, frames = wav.getframerate(), wav.getnchannels(), wav.getnframes()
                seconds = frames / max(rate, 1)
            if rate < 16000 or not 1 <= channels <= 2 or seconds < 6 or len(audio) < 30_000:
                raise RuntimeError("SFT generated unusable WAV audio")
            OUT.write_bytes(audio)
            print("SONARA_XL_SFT_GENERATED_REAL_WAV=True", flush=True)
            print("SONARA_WAV_SECONDS=" + str(round(seconds, 2)), flush=True)
            print("SONARA_WAV_SAMPLE_RATE=" + str(rate), flush=True)
            print("SONARA_WAV_PATH=" + str(OUT), flush=True)
            print("SONARA_TURBO_8001_STILL_READY=" + str(available()), flush=True)
            print("SONARA_SITE_UNCHANGED=True", flush=True)
            print("SONARA_R2_AUDIO_UPLOADED=False", flush=True)
            return 0
        time.sleep(2)
    raise RuntimeError("SFT generation was not completed within the local test timeout")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--check", action="store_true", help="Read-only health check")
    group.add_argument("--test", action="store_true", help="Generate one private 10-second WAV")
    args = parser.parse_args()
    raise SystemExit(run(test=args.test))
