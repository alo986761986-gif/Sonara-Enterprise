#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import os
import shutil
import subprocess
import sys
import threading
import time
import uuid
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(os.environ.get("SONARA_YUE_ROOT", "/marimo/YuE")).resolve()
INFERENCE = ROOT / "inference"
INFER = INFERENCE / "infer.py"
OUTPUT_ROOT = ROOT / "sonara_api_output"
PORT = int(os.environ.get("SONARA_YUE_PORT", "8012"))
API_KEY = os.environ.get("SONARA_YUE_API_KEY", "").strip()
MAX_DURATION = max(60, min(480, int(os.environ.get("SONARA_YUE_MAX_DURATION", "480"))))
PYTHON = os.environ.get("SONARA_YUE_PYTHON", sys.executable)

JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()
GPU_LOCK = threading.Lock()


def now_ms() -> int:
    return int(time.time() * 1000)


def clamp(value, fallback, minimum, maximum):
    try:
        number = float(value)
    except Exception:
        number = fallback
    return max(minimum, min(maximum, number))


def safe_text(value, fallback="") -> str:
    text = str(value or "").strip()
    return text or fallback


def patch_runtime() -> None:
    if not INFER.exists():
        raise FileNotFoundError(f"YuE infer.py non trovato: {INFER}")

    text = INFER.read_text(encoding="utf-8")
    changed = False

    if 'attn_implementation="flash_attention_2"' in text:
        text = text.replace('attn_implementation="flash_attention_2"', 'attn_implementation="sdpa"')
        changed = True

    old_save = "    torchaudio.save(str(path), wav, sample_rate=sample_rate, encoding='PCM_S', bits_per_sample=16)"
    if old_save in text:
        new_save = '''    wav_np = wav.detach().cpu().float().numpy()\n    if wav_np.ndim == 2:\n        wav_np = wav_np.T\n    sf.write(str(path), wav_np, sample_rate, subtype="PCM_16")'''
        text = text.replace(old_save, new_save)
        changed = True

    text = text.replace('os.path.splitext(os.path.basename(npy))[0] + ".mp3"', 'os.path.splitext(os.path.basename(npy))[0] + ".wav"')
    text = text.replace("'itrack.mp3'", "'itrack.wav'")
    text = text.replace("'vtrack.mp3'", "'vtrack.wav'")

    if changed:
        backup = INFER.with_suffix(".py.sonara_worker_backup")
        if not backup.exists():
            shutil.copy2(INFER, backup)
        compile(text, str(INFER), "exec")
        INFER.write_text(text, encoding="utf-8")

    for relative in ["xcodec_mini_infer/vocoder.py", "xcodec_mini_infer/post_process_audio.py"]:
        path = INFERENCE / relative
        if not path.exists():
            continue
        source = path.read_text(encoding="utf-8")
        original = source
        if "import soundfile as sf" not in source and "import torchaudio" in source:
            source = source.replace("import torchaudio", "import torchaudio\nimport soundfile as sf", 1)

        if path.name == "vocoder.py":
            source = source.replace(
                "path = str(Path(path).with_suffix('.mp3'))\n    torchaudio.save(path, wav, sample_rate=sample_rate)",
                "path = str(Path(path).with_suffix('.wav'))\n    wav_np = wav.detach().cpu().float().numpy()\n    if wav_np.ndim == 2:\n        wav_np = wav_np.T\n    sf.write(path, wav_np, sample_rate, subtype='PCM_16')"
            )
        else:
            source = source.replace(
                "wave_a, sr_a = torchaudio.load(a_file)\n    wave_b, sr_b = torchaudio.load(b_file)",
                "audio_a, sr_a = sf.read(a_file, always_2d=True, dtype='float32')\n    audio_b, sr_b = sf.read(b_file, always_2d=True, dtype='float32')\n    wave_a = torch.from_numpy(audio_a.T.copy())\n    wave_b = torch.from_numpy(audio_b.T.copy())"
            )
            source = source.replace(
                "torchaudio.save(c_file, wave_combined, sample_rate=sr_b)",
                "output_np = wave_combined.detach().cpu().float().numpy()\n    if output_np.ndim == 2:\n        output_np = output_np.T\n    sf.write(c_file, output_np, sr_b, subtype='PCM_16')"
            )

        if source != original:
            backup = path.with_suffix(path.suffix + ".sonara_worker_backup")
            if not backup.exists():
                shutil.copy2(path, backup)
            compile(source, str(path), "exec")
            path.write_text(source, encoding="utf-8")


def sections_for_duration(duration_sec: int) -> int:
    return max(1, min(16, math.ceil(duration_sec / 30)))


def ensure_lyrics_sections(lyrics: str, count: int) -> str:
    lyrics = lyrics.strip()
    if not lyrics:
        return "[verse]\nInstrumental texture and musical development."
    existing = lyrics.count("[")
    if existing >= count:
        return lyrics
    chunks = [lyrics]
    while sum(part.count("[") for part in chunks) < count:
        chunks.append("\n[continuation]\nContinue the song naturally, preserving singer identity, melody, groove and story.")
    return "".join(chunks)


def set_job(task_id: str, **values) -> None:
    with JOBS_LOCK:
        job = JOBS.setdefault(task_id, {})
        job.update(values)
        job["updated_at"] = now_ms()


def public_result_path(file_path: Path) -> str:
    return "/" + str(file_path.resolve().relative_to(OUTPUT_ROOT)).replace(os.sep, "/")


def choose_final_audio(output_dir: Path) -> Path | None:
    wavs = [p for p in output_dir.rglob("*.wav") if p.is_file()]
    if not wavs:
        return None
    top_level = [p for p in wavs if p.parent == output_dir]
    pool = top_level or wavs
    return max(pool, key=lambda p: (p.stat().st_mtime, p.stat().st_size))


def run_candidate(task_id: str, body: dict, candidate_index: int) -> Path:
    duration = int(clamp(body.get("duration_sec"), 180, 30, MAX_DURATION))
    segments = sections_for_duration(duration)
    base_seed = max(1, int(clamp(body.get("seed"), int(time.time()), 1, 2_000_000_000)))
    seed = min(2_000_000_000, base_seed + candidate_index * 104729)

    task_dir = OUTPUT_ROOT / task_id / f"candidate_{candidate_index + 1}"
    task_dir.mkdir(parents=True, exist_ok=True)
    genre_file = task_dir / "genre.txt"
    lyrics_file = task_dir / "lyrics.txt"

    genre_parts = [
        safe_text(body.get("genre"), "Music"),
        safe_text(body.get("subgenre")),
        safe_text(body.get("mood")),
        safe_text(body.get("prompt")),
        f"{int(clamp(body.get('bpm'), 124, 40, 220))} BPM",
        safe_text(body.get("key")),
        safe_text(body.get("vocal_mode"), "vocal"),
        safe_text(body.get("language"), "auto")
    ]
    genre_file.write_text(", ".join(x for x in genre_parts if x), encoding="utf-8")
    lyrics_file.write_text(ensure_lyrics_sections(safe_text(body.get("lyrics")), segments), encoding="utf-8")

    command = [
        PYTHON, "infer.py",
        "--stage1_model", "m-a-p/YuE-s1-7B-anneal-en-cot",
        "--stage2_model", "m-a-p/YuE-s2-1B-general",
        "--genre_txt", str(genre_file),
        "--lyrics_txt", str(lyrics_file),
        "--run_n_segments", str(segments),
        "--stage2_batch_size", str(int(clamp(body.get("stage2_batch_size"), 4, 1, 16))),
        "--output_dir", str(task_dir),
        "--cuda_idx", "0",
        "--max_new_tokens", str(int(clamp(body.get("max_new_tokens"), 3000, 1000, 6000))),
        "--repetition_penalty", str(clamp(body.get("repetition_penalty"), 1.1, 1.0, 1.5)),
        "--seed", str(seed),
        "--disable_offload_model"
    ]

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    log_path = task_dir / "generation.log"
    with log_path.open("w", encoding="utf-8") as log:
        result = subprocess.run(command, cwd=str(INFERENCE), env=env, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode != 0:
        tail = ""
        try:
            tail = "\n".join(log_path.read_text(encoding="utf-8", errors="ignore").splitlines()[-30:])
        except Exception:
            pass
        raise RuntimeError(f"YuE infer.py exit={result.returncode}. {tail[-4000:]}")

    final = choose_final_audio(task_dir)
    if final is None:
        raise RuntimeError("YuE completato ma nessun WAV finale trovato.")
    return final


def run_job(task_id: str, body: dict) -> None:
    try:
        set_job(task_id, status=0, progress=2, stage="In coda sulla RTX PRO 6000")
        with GPU_LOCK:
            count = int(clamp(body.get("candidate_count"), 1, 1, 2))
            results = []
            for index in range(count):
                start = 5 + int(index * 90 / count)
                set_job(task_id, status=0, progress=start, stage=f"YuE genera candidato {index + 1}/{count}")
                final = run_candidate(task_id, body, index)
                results.append({"path": public_result_path(final), "file": public_result_path(final)})
                set_job(task_id, status=0, progress=min(95, 5 + int((index + 1) * 90 / count)), stage="Rendering e mix finale")
            set_job(task_id, status=1, progress=100, stage="Completato", result=results)
    except Exception as exc:
        set_job(task_id, status=2, progress=0, stage="Errore", error=str(exc), message=str(exc))


class Handler(BaseHTTPRequestHandler):
    server_version = "SONARA-YuE/1.0"

    def log_message(self, fmt, *args):
        print("[YuE API]", fmt % args)

    def authorized(self) -> bool:
        if not API_KEY:
            return True
        bearer = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        xkey = self.headers.get("X-API-Key", "").strip()
        return bearer == API_KEY or xkey == API_KEY

    def json_response(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(data)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8") or "{}")

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type,X-API-Key,Range")
        self.send_header("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ("/", "/health"):
            return self.json_response({
                "ok": True,
                "service": "SONARA YuE RTX PRO 6000",
                "root": str(ROOT),
                "max_duration_sec": MAX_DURATION,
                "jobs": len(JOBS)
            })
        if parsed.path == "/v1/audio":
            return self.serve_audio(parsed, head=False)
        self.json_response({"error": "Not found"}, 404)

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path == "/v1/audio":
            return self.serve_audio(parsed, head=True)
        self.send_response(404)
        self.end_headers()

    def serve_audio(self, parsed, head=False):
        if not self.authorized():
            return self.json_response({"error": "Unauthorized"}, 401)
        rel = safe_text(parse_qs(parsed.query).get("path", [""])[0]).lstrip("/")
        if not rel:
            return self.json_response({"error": "path mancante"}, 400)
        target = (OUTPUT_ROOT / rel).resolve()
        try:
            target.relative_to(OUTPUT_ROOT.resolve())
        except ValueError:
            return self.json_response({"error": "path non valido"}, 400)
        if not target.is_file():
            return self.json_response({"error": "audio non trovato"}, 404)
        size = target.stat().st_size
        start, end = 0, size - 1
        range_header = self.headers.get("Range", "")
        status = 200
        if range_header.startswith("bytes="):
            try:
                part = range_header[6:].split(",", 1)[0]
                left, right = part.split("-", 1)
                start = int(left) if left else 0
                end = int(right) if right else end
                start = max(0, min(start, size - 1))
                end = max(start, min(end, size - 1))
                status = 206
            except Exception:
                start, end, status = 0, size - 1, 200
        length = end - start + 1
        self.send_response(status)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if status == 206:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if head:
            return
        with target.open("rb") as fh:
            fh.seek(start)
            remaining = length
            while remaining > 0:
                chunk = fh.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def do_POST(self):
        if not self.authorized():
            return self.json_response({"error": "Unauthorized"}, 401)
        parsed = urlparse(self.path)
        try:
            body = self.read_json()
        except Exception as exc:
            return self.json_response({"error": f"JSON non valido: {exc}"}, 400)

        if parsed.path == "/release_task":
            task_id = f"yue-{uuid.uuid4()}"
            with JOBS_LOCK:
                JOBS[task_id] = {
                    "task_id": task_id,
                    "status": 0,
                    "progress": 1,
                    "stage": "Accettato",
                    "created_at": now_ms(),
                    "updated_at": now_ms()
                }
            threading.Thread(target=run_job, args=(task_id, body), daemon=True).start()
            return self.json_response({"code": 200, "data": {"task_id": task_id}})

        if parsed.path == "/query_result":
            ids = body.get("task_id_list") or []
            data = []
            with JOBS_LOCK:
                for task_id in ids:
                    job = JOBS.get(str(task_id))
                    if job:
                        data.append(dict(job))
                    else:
                        data.append({"task_id": str(task_id), "status": 2, "progress": 0, "error": "task non trovato"})
            return self.json_response({"code": 200, "data": data})

        self.json_response({"error": "Not found"}, 404)


def main() -> None:
    patch_runtime()
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    print("=" * 72)
    print("SONARA YuE PRODUCTION WORKER")
    print(f"YuE root: {ROOT}")
    print(f"Python:   {PYTHON}")
    print(f"Port:     {PORT}")
    print(f"Max song: {MAX_DURATION}s")
    print("API:      /release_task | /query_result | /v1/audio | /health")
    print("=" * 72)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
