"""Optional, explicit ACE-Step XL Turbo cover from a verified Remix Pro WAV.

This module never starts ACE-Step, changes the live relay, or sends public URLs.
Calling render() triggers exactly one real task on fixed 127.0.0.1:8001 and
polls that task without submitting duplicates. No test/demo audio is generated.
"""
from __future__ import annotations
import argparse
import json
import os
import pathlib
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import wave

LOCAL = "http://127.0.0.1:8001"
KEY_FILE = pathlib.Path("/home/marimo/ACE-STEP/.sonara-api-key")
MAX_BYTES = 100 * 1024 * 1024


class ACEBridgeError(RuntimeError):
    pass


def _headers(mode):
    if mode == "none":
        return {}
    if mode != "required":
        raise ACEBridgeError("Unknown local API auth mode")
    try:
        key = KEY_FILE.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise ACEBridgeError("Private local ACE-Step API key is unavailable") from exc
    if not key:
        raise ACEBridgeError("Private local API credential is empty")
    return {"Authorization": "Bearer " + key}


def _request(path, data=None, *, mode="required", timeout=40):
    if not path.startswith("/") or path.startswith("//"):
        raise ACEBridgeError("Local API path must be relative")
    # Proxyless loopback only. No arbitrary host, remote URLs or redirects.
    headers = {"Accept": "application/json", **_headers(mode)}
    raw = None if data is None else json.dumps(data).encode("utf-8")
    if raw is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(LOCAL + path, data=raw, method="POST" if raw else "GET", headers=headers)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), urllib.request.HTTPHandler())
    try:
        with opener.open(req, timeout=timeout) as response:
            result = response.read(MAX_BYTES + 1)
            if len(result) > MAX_BYTES:
                raise ACEBridgeError("Unexpected oversized local ACE-Step response")
            if "application/json" in response.headers.get("Content-Type", ""):
                body = json.loads(result)
                if not isinstance(body, dict) or body.get("error") or int(body.get("code", 200)) >= 400:
                    raise ACEBridgeError("Local ACE-Step returned an application error")
                return body
            return result
    except urllib.error.HTTPError as exc:
        raise ACEBridgeError("Local ACE-Step rejected the request (HTTP " + str(exc.code) + ")") from exc


def _status(value):
    text = str(value).lower().strip()
    if text in ("1", "success", "completed", "succeeded", "done", "finished"):
        return "complete"
    if text in ("-1", "failed", "failure", "error", "cancelled", "canceled"):
        return "failed"
    return "pending"


def _result_path(task):
    raw = task.get("result") or []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError):
            raw = [{"audio_path": raw}]
    def find(value):
        if isinstance(value, list):
            for item in value:
                found = find(item)
                if found:
                    return found
        if isinstance(value, dict):
            for key in ("audio_path", "audio_file", "file", "path", "url", "audio", "outputs", "result"):
                if key in value:
                    found = find(value[key])
                    if found:
                        return found
        if isinstance(value, str):
            parsed = urllib.parse.urlsplit(value)
            if parsed.scheme and parsed.netloc and parsed.netloc not in ("127.0.0.1:8001", "api.sonaraenterprise.com"):
                return None
            path = urllib.parse.parse_qs(parsed.query).get("path", [None])[0]
            if path and path.startswith("/"):
                return path
            if value.startswith("/") and not value.startswith("/v1/audio"):
                return value
        return None
    return find(raw)


def render(audio_path, output_path, prompt, *, mode="required", strength=0.76,
           noise=0.14, timeout_seconds=1600, bpm=None, key=None):
    """Use one real local ACE-Step task to reimagine the combined 2-song stem mix."""
    source = pathlib.Path(audio_path).expanduser().resolve(strict=True)
    output = pathlib.Path(output_path).expanduser().resolve()
    if not source.is_file() or source.suffix.lower() != ".wav" or source.stat().st_size > MAX_BYTES:
        raise ACEBridgeError("Real WAV source required, under 100 MiB")
    if not str(prompt).strip():
        raise ACEBridgeError("An explicit musical remix instruction is required")
    if not 0.35 <= strength <= 0.92 or not 0.04 <= noise <= 0.30:
        raise ACEBridgeError("Invalid cover conditioning strength")
    if bpm is not None and not 40 <= bpm <= 220:
        raise ACEBridgeError("BPM outside verified range")
    with wave.open(str(source), "rb") as wav:
        duration = wav.getnframes() / wav.getframerate()
    if not 10 <= duration <= 600:
        raise ACEBridgeError("Remix Pro cover duration outside 10-600 seconds")
    if output == source:
        raise ACEBridgeError("Output would overwrite the original source")
    fd, tmp = tempfile.mkstemp(prefix="sonara_pro_cover_", suffix=".wav")
    try:
        with os.fdopen(fd, "wb") as out, source.open("rb") as inp:
            while True:
                block = inp.read(1024 * 1024)
                if not block:
                    break
                out.write(block)
        request = {
            "task_type": "cover", "src_audio_path": tmp,
            "prompt": str(prompt).strip()[:9000], "instruction": str(prompt).strip()[:9000],
            "audio_duration": round(duration, 2), "batch_size": 1,
            "audio_cover_strength": float(strength), "cover_noise_strength": float(noise),
            "audio_format": "wav",
            **({"bpm": int(bpm)} if bpm is not None else {}),
            **({"key_scale": str(key)[:40]} if key else {}),
        }
        answer = _request("/release_task", request, mode=mode, timeout=120)
        obj = answer.get("data", answer)
        task_id = obj.get("task_id") if isinstance(obj, dict) else None
        if not task_id:
            raise ACEBridgeError("ACE-Step did not return a real task ID")
        deadline = time.monotonic() + min(timeout_seconds, 1600)
        while time.monotonic() < deadline:
            response = _request("/query_result", {"task_id_list": [task_id]}, mode=mode, timeout=50)
            items = response.get("data", [])
            item = items[0] if isinstance(items, list) and items else items if isinstance(items, dict) else {}
            status = _status(item.get("status")) if item else "pending"
            if status == "failed":
                raise ACEBridgeError("ACE-Step reported a failed cover task")
            if status == "complete":
                audio = _result_path(item)
                if not audio:
                    raise ACEBridgeError("ACE-Step result did not contain an audio path")
                path_arg = urllib.parse.urlencode({"path": audio})
                raw = _request("/v1/audio?" + path_arg, mode=mode, timeout=120)
                if not isinstance(raw, bytes) or len(raw) < 44 or raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
                    raise ACEBridgeError("ACE-Step result is not a real RIFF/WAV")
                output.parent.mkdir(parents=True, exist_ok=True)
                if output.exists():
                    raise ACEBridgeError("Output already exists; refusing to overwrite")
                output.write_bytes(raw)
                return {
                    "status": "completed", "taskId": str(task_id),
                    "sourceDurationSeconds": round(duration, 2),
                    "outputPath": str(output), "bytes": len(raw),
                    "model": "existing-local-ACE-Step-cover",
                    "noFakeAudio": True
                }
            time.sleep(2)
        raise ACEBridgeError("ACE-Step cover timed out; task was not duplicated")
    finally:
        pathlib.Path(tmp).unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description="SONARA Remix Pro ACE-Step local cover bridge")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--auth-mode", choices=("none","required"), default="required")
    parser.add_argument("--strength", type=float, default=0.76)
    parser.add_argument("--noise", type=float, default=0.14)
    parser.add_argument("--bpm", type=float)
    parser.add_argument("--key")
    args = parser.parse_args(argv)
    try:
        result = render(args.audio, args.output, args.prompt,
                        mode=args.auth_mode, strength=args.strength, noise=args.noise,
                        bpm=args.bpm, key=args.key)
        print(json.dumps(result, indent=2))
        return 0
    except (ACEBridgeError, OSError, ValueError) as exc:
        # Never print local tokens, API response bodies or prompt lyrics.
        print(json.dumps({"status":"failed", "errorClass":type(exc).__name__}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
