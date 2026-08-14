#!/usr/bin/env python3
"""Minimal HTTP bridge exposing LeVo generate.sh to Sonara.

Run this script on the machine that has the working LeVo checkout and checkpoints.
It intentionally uses only the Python standard library so it can run in Kaggle or
another LeVo host without installing FastAPI/Flask.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import threading
import time
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

GENERATION_LOCK = threading.Lock()


def safe_name(value: str) -> str:
    value = re.sub(r"[^a-zA-Z0-9_-]+", "-", value.strip()).strip("-")
    return value[:80] or "sonara"


class LeVoBridge:
    def __init__(self, levo_dir: Path, work_dir: Path, public_base_url: str):
        self.levo_dir = levo_dir.resolve()
        self.work_dir = work_dir.resolve()
        self.public_base_url = public_base_url.rstrip("/")
        self.work_dir.mkdir(parents=True, exist_ok=True)

    def health(self) -> dict:
        generate_sh = self.levo_dir / "generate.sh"
        return {
            "status": "healthy" if generate_sh.exists() else "not_ready",
            "engine": "LeVo",
            "levo_dir": str(self.levo_dir),
            "generate_sh": str(generate_sh),
            "generate_sh_exists": generate_sh.exists(),
            "busy": GENERATION_LOCK.locked(),
        }

    def generate(self, payload: dict) -> dict:
        prompt = str(payload.get("prompt") or "Modern electronic dance track").strip()
        genre = str(payload.get("genre") or "House").strip()
        mood = str(payload.get("mood") or "").strip()
        lyrics = str(payload.get("lyrics") or "").strip()
        title = str(payload.get("title") or "Sonara Track").strip()
        bpm = max(60, min(240, int(float(payload.get("bpm") or 126))))
        duration = max(5, min(240, int(float(payload.get("duration_sec") or 15))))
        model = str(payload.get("model") or "songgeneration_v2_medium")
        low_mem = bool(payload.get("low_mem", True))
        use_flash_attn = bool(payload.get("use_flash_attn", False))

        job_id = f"sonara-{int(time.time())}-{uuid.uuid4().hex[:8]}"
        job_name = safe_name(job_id)
        input_path = self.work_dir / f"{job_name}.jsonl"
        output_dir = self.work_dir / f"{job_name}-out"

        structure = lyrics or "[intro-short] ; [inst-medium] ; [outro-short]"
        description_parts = [genre, f"{bpm} BPM"]
        if mood:
            description_parts.append(mood)
        description_parts.append(prompt)
        description = ", ".join(part for part in description_parts if part)

        record = {
            "idx": job_name,
            "gt_lyric": structure,
            "descriptions": description,
            "duration_sec": duration,
        }
        input_path.write_text(json.dumps(record, ensure_ascii=False) + "\n", encoding="utf-8")

        cmd = [
            "bash",
            "generate.sh",
            model,
            str(input_path),
            str(output_dir),
        ]
        if not use_flash_attn:
            cmd.append("--not_use_flash_attn")
        if low_mem:
            cmd.append("--low_mem")

        env = os.environ.copy()
        env["PYTHONUNBUFFERED"] = "1"

        started = time.time()
        with GENERATION_LOCK:
            proc = subprocess.run(
                cmd,
                cwd=str(self.levo_dir),
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=900,
                check=False,
            )
        elapsed = round(time.time() - started, 2)

        if proc.returncode != 0:
            return {
                "status": "error",
                "detail": f"LeVo generate.sh exited with code {proc.returncode}",
                "job_id": job_id,
                "elapsed_sec": elapsed,
                "log_tail": proc.stdout[-8000:],
            }

        audio_dir = output_dir / "audios"
        candidates = sorted(audio_dir.glob("*.flac")) if audio_dir.exists() else []
        if not candidates:
            return {
                "status": "error",
                "detail": "LeVo completed but produced no FLAC file",
                "job_id": job_id,
                "elapsed_sec": elapsed,
                "log_tail": proc.stdout[-8000:],
            }

        source_audio = candidates[0]
        final_audio = self.work_dir / f"{job_name}.flac"
        if final_audio.exists():
            final_audio.unlink()
        source_audio.replace(final_audio)

        return {
            "status": "success",
            "engine": "LeVo",
            "job_id": job_id,
            "title": title,
            "output_path": str(final_audio),
            "audio_url": f"{self.public_base_url}/audio/{final_audio.name}",
            "duration_sec": duration,
            "bpm": bpm,
            "elapsed_sec": elapsed,
            "log_tail": proc.stdout[-4000:],
        }


class Handler(BaseHTTPRequestHandler):
    bridge: LeVoBridge

    def log_message(self, fmt: str, *args) -> None:
        print(f"[LEVO_API] {self.address_string()} - {fmt % args}")

    def send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/health":
            health = self.bridge.health()
            code = HTTPStatus.OK if health["status"] == "healthy" else HTTPStatus.SERVICE_UNAVAILABLE
            self.send_json(code, health)
            return

        if parsed.path.startswith("/audio/"):
            filename = Path(unquote(parsed.path[len("/audio/"):])).name
            audio_path = self.bridge.work_dir / filename
            if not audio_path.exists() or audio_path.suffix.lower() != ".flac":
                self.send_json(HTTPStatus.NOT_FOUND, {"status": "error", "detail": "Audio not found"})
                return

            data = audio_path.read_bytes()
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", "audio/flac")
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)
            return

        self.send_json(HTTPStatus.NOT_FOUND, {"status": "error", "detail": "Not found"})

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path != "/generate":
            self.send_json(HTTPStatus.NOT_FOUND, {"status": "error", "detail": "Not found"})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            raw = self.rfile.read(length) if length > 0 else b"{}"
            payload = json.loads(raw.decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("JSON body must be an object")
        except Exception as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {"status": "error", "detail": str(exc)})
            return

        try:
            result = self.bridge.generate(payload)
        except subprocess.TimeoutExpired:
            self.send_json(HTTPStatus.GATEWAY_TIMEOUT, {"status": "error", "detail": "LeVo generation exceeded 900 seconds"})
            return
        except Exception as exc:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"status": "error", "detail": str(exc)})
            return

        code = HTTPStatus.OK if result.get("status") == "success" else HTTPStatus.INTERNAL_SERVER_ERROR
        self.send_json(code, result)


def main() -> None:
    parser = argparse.ArgumentParser(description="Expose a working LeVo checkout as a Sonara HTTP engine")
    parser.add_argument("--host", default=os.getenv("LEVO_BIND_HOST", "0.0.0.0"))
    parser.add_argument("--port", type=int, default=int(os.getenv("LEVO_PORT", "8010")))
    parser.add_argument("--levo-dir", default=os.getenv("LEVO_DIR", "/kaggle/working/LeVo"))
    parser.add_argument("--work-dir", default=os.getenv("LEVO_WORK_DIR", "/kaggle/working/sonara_levo_api"))
    parser.add_argument("--public-base-url", default=os.getenv("LEVO_PUBLIC_BASE_URL", "http://127.0.0.1:8010"))
    args = parser.parse_args()

    bridge = LeVoBridge(Path(args.levo_dir), Path(args.work_dir), args.public_base_url)
    Handler.bridge = bridge

    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"[LEVO_API] listening on {args.host}:{args.port}")
    print(f"[LEVO_API] LeVo dir: {bridge.levo_dir}")
    print(f"[LEVO_API] health: {bridge.health()}")
    server.serve_forever()


if __name__ == "__main__":
    main()
