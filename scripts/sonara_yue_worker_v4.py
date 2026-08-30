#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import signal
import subprocess
import time
import types
import urllib.request
from pathlib import Path

BASE_COMMIT = "f34e5c62f24846e1e9f65e97715ddbb2a7a866d5"
BASE_URL = (
    "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/"
    f"{BASE_COMMIT}/scripts/sonara_yue_worker.py"
)
STAGE2_TRANSITION_TIMEOUT = int(os.environ.get("SONARA_YUE_STAGE2_TRANSITION_TIMEOUT", "300"))
STALL_TIMEOUT = int(os.environ.get("SONARA_YUE_STALL_TIMEOUT", "600"))


def load_base():
    req = urllib.request.Request(BASE_URL, headers={"User-Agent": "SONARA-YuE-v4"})
    with urllib.request.urlopen(req, timeout=30) as response:
        source = response.read().decode("utf-8")
    module = types.ModuleType("sonara_yue_worker_base")
    module.__file__ = "/tmp/sonara_yue_worker_base.py"
    module.__dict__["__name__"] = "sonara_yue_worker_base"
    exec(compile(source, module.__file__, "exec"), module.__dict__)
    return module


base = load_base()


def tail_text(path: Path, limit: int = 24000) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")[-limit:]
    except Exception:
        return ""


def terminate_process(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    try:
        os.killpg(process.pid, signal.SIGTERM)
    except Exception:
        try:
            process.terminate()
        except Exception:
            return
    try:
        process.wait(timeout=12)
    except Exception:
        try:
            os.killpg(process.pid, signal.SIGKILL)
        except Exception:
            try:
                process.kill()
            except Exception:
                pass
        try:
            process.wait(timeout=5)
        except Exception:
            pass


def progress_state(log_text: str, elapsed: float, duration: int):
    progress, stage = base.progress_from_log(log_text, elapsed, duration)
    stage1_matches = re.findall(r"Stage1 inference[^\r\n%]*?(\d{1,3})%", log_text)
    stage1_done = bool(stage1_matches and int(stage1_matches[-1]) >= 100)
    stage2_seen = "Stage 2 inference" in log_text
    return progress, stage, stage1_done, stage2_seen


def run_attempt(task_id: str, body: dict, candidate_index: int, batch_size: int, attempt_number: int):
    duration = int(base.clamp(body.get("duration_sec"), 180, 30, base.MAX_DURATION))
    segments = base.sections_for_duration(duration)
    base_seed = max(1, int(base.clamp(body.get("seed"), int(time.time()), 1, 2_000_000_000)))
    seed = min(2_000_000_000, base_seed + candidate_index * 104729)

    attempt_dir = (
        base.OUTPUT_ROOT
        / task_id
        / f"candidate_{candidate_index + 1}"
        / f"attempt_{attempt_number}_b{batch_size}"
    )
    attempt_dir.mkdir(parents=True, exist_ok=True)
    genre_file = attempt_dir / "genre.txt"
    lyrics_file = attempt_dir / "lyrics.txt"
    log_path = attempt_dir / "generation.log"

    genre_parts = [
        base.safe_text(body.get("genre"), "Music"),
        base.safe_text(body.get("subgenre")),
        base.safe_text(body.get("mood")),
        base.safe_text(body.get("prompt")),
        f"{int(base.clamp(body.get('bpm'), 124, 40, 220))} BPM",
        base.safe_text(body.get("key")),
        base.safe_text(body.get("vocal_mode"), "vocal"),
        base.safe_text(body.get("language"), "auto"),
    ]
    genre_file.write_text(", ".join(x for x in genre_parts if x), encoding="utf-8")
    lyrics_file.write_text(
        base.ensure_lyrics_sections(base.safe_text(body.get("lyrics")), segments),
        encoding="utf-8",
    )

    command = [
        base.PYTHON,
        "infer.py",
        "--stage1_model", "m-a-p/YuE-s1-7B-anneal-en-cot",
        "--stage2_model", "m-a-p/YuE-s2-1B-general",
        "--genre_txt", str(genre_file),
        "--lyrics_txt", str(lyrics_file),
        "--run_n_segments", str(segments),
        "--stage2_batch_size", str(batch_size),
        "--output_dir", str(attempt_dir),
        "--cuda_idx", "0",
        "--max_new_tokens", str(int(base.clamp(body.get("max_new_tokens"), 3000, 1000, 6000))),
        "--repetition_penalty", str(base.clamp(body.get("repetition_penalty"), 1.1, 1.0, 1.5)),
        "--seed", str(seed),
        "--keep_intermediate",
    ]

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"
    env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

    started = time.time()
    stage1_done_at = None
    last_log_change = started
    last_log_size = -1
    last_progress = 6
    watchdog_reason = ""

    base.set_job(
        task_id,
        status=0,
        progress=6,
        stage=f"YuE recovery profile {attempt_number}/3 · Stage 2 batch {batch_size}",
        recovery_attempt=attempt_number,
        stage2_batch_size=batch_size,
        watchdog=False,
    )

    with log_path.open("w", encoding="utf-8") as log:
        process = subprocess.Popen(
            command,
            cwd=str(base.INFERENCE),
            env=env,
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
            start_new_session=True,
        )

        while process.poll() is None:
            time.sleep(3)
            elapsed = time.time() - started
            try:
                log.flush()
            except Exception:
                pass

            log_text = tail_text(log_path)
            try:
                log_size = log_path.stat().st_size
            except Exception:
                log_size = 0
            if log_size != last_log_size:
                last_log_size = log_size
                last_log_change = time.time()

            progress, stage, stage1_done, stage2_seen = progress_state(log_text, elapsed, duration)
            progress = max(last_progress, progress)
            last_progress = progress

            if stage1_done and stage1_done_at is None:
                stage1_done_at = time.time()

            if stage1_done and not stage2_seen and stage1_done_at is not None:
                waiting = int(time.time() - stage1_done_at)
                stage = f"YuE Stage 1 completato · avvio Stage 2 ({waiting}s)"
                if waiting >= STAGE2_TRANSITION_TIMEOUT:
                    watchdog_reason = (
                        f"Stage 2 non avviato entro {STAGE2_TRANSITION_TIMEOUT}s dopo Stage 1"
                    )

            idle = int(time.time() - last_log_change)
            if not watchdog_reason and idle >= STALL_TIMEOUT:
                watchdog_reason = f"Nessun avanzamento YuE per {idle}s"

            base.set_job(
                task_id,
                status=0,
                progress=progress,
                stage=stage,
                elapsed_sec=int(elapsed),
                candidate=candidate_index + 1,
                segments=segments,
                infer_pid=process.pid,
                recovery_attempt=attempt_number,
                stage2_batch_size=batch_size,
                log_idle_sec=idle,
            )

            if watchdog_reason:
                base.set_job(
                    task_id,
                    stage=f"{watchdog_reason} · recovery automatico",
                    watchdog=True,
                )
                terminate_process(process)
                break

        result_code = process.returncode

    if watchdog_reason:
        raise RuntimeError(watchdog_reason)

    if result_code != 0:
        tail = tail_text(log_path, 14000)
        raise RuntimeError(f"YuE infer.py exit={result_code}. {tail[-12000:]}")

    final = base.choose_final_audio(attempt_dir)
    if final is None:
        raise RuntimeError("YuE completato ma nessun WAV finale trovato.")
    return final


def run_candidate_v4(task_id: str, body: dict, candidate_index: int):
    errors = []
    batches = (4, 2, 1)
    for attempt_number, batch_size in enumerate(batches, start=1):
        try:
            return run_attempt(task_id, body, candidate_index, batch_size, attempt_number)
        except Exception as exc:
            message = str(exc)
            errors.append(f"tentativo {attempt_number} batch={batch_size}: {message}")
            if attempt_number >= len(batches):
                break
            next_batch = batches[attempt_number]
            base.set_job(
                task_id,
                status=0,
                stage=f"Recovery automatico YuE · batch {batch_size} -> {next_batch}",
                last_error=message[-2500:],
                recovery_attempt=attempt_number + 1,
                watchdog=False,
            )
            time.sleep(8)
    raise RuntimeError("YuE recovery esaurito. " + " | ".join(errors)[-14000:])


base.__dict__["run_candidate"] = run_candidate_v4
base.Handler.server_version = "SONARA-YuE/4.0"
_original_get = base.Handler.do_GET


def do_GET_v4(self):
    parsed = base.urlparse(self.path)
    if parsed.path in ("/", "/health"):
        with base.JOBS_LOCK:
            active = sum(1 for item in base.JOBS.values() if int(item.get("status", 0)) == 0)
            latest = None
            if base.JOBS:
                latest_id = next(reversed(base.JOBS))
                item = base.JOBS[latest_id]
                latest = {
                    "task_id": latest_id,
                    "status": item.get("status"),
                    "progress": item.get("progress"),
                    "stage": item.get("stage"),
                    "recovery_attempt": item.get("recovery_attempt"),
                    "stage2_batch_size": item.get("stage2_batch_size"),
                    "log_idle_sec": item.get("log_idle_sec"),
                    "error": base.safe_text(item.get("error"))[-1500:] or None,
                    "last_error": base.safe_text(item.get("last_error"))[-1500:] or None,
                }
        return self.json_response({
            "ok": True,
            "service": "SONARA YuE RTX PRO 6000",
            "version": "4.0-stage2-watchdog-recovery",
            "active_jobs": active,
            "jobs": len(base.JOBS),
            "stage2_transition_timeout_sec": STAGE2_TRANSITION_TIMEOUT,
            "stall_timeout_sec": STALL_TIMEOUT,
            "latest_job": latest,
        })
    return _original_get(self)


base.Handler.do_GET = do_GET_v4

print("=" * 76)
print("SONARA YUE V4 - STAGE2 WATCHDOG + AUTO RECOVERY")
print("Stage 1 offload: ON")
print("Stage 2 torch.compile: OFF")
print("Stage 2 batch fallback: 4 -> 2 -> 1")
print(f"Watchdog transition: {STAGE2_TRANSITION_TIMEOUT}s")
print(f"Watchdog stall: {STALL_TIMEOUT}s")
print("=" * 76)

base.main()
