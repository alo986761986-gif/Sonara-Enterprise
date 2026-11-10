#!/usr/bin/env python3
"""Guarded live worker swap for SONARA Remix Pro V6 quality diagnostics.

Only the pinned private Remix Pro worker file is replaced. Existing jobs must
be idle, the old worker must exit gracefully, and the old bytes remain ready
for rollback. Main ACE-Step, relay, credentials, R2 and audio files untouched.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path("/marimo/SONARA-REMIX-PRO")
PYTHON = ROOT / ".venv/bin/python"
AGENT = ROOT / "sonara_remix_pro_r2_agent.py"
HOME = Path.home() / ".sonara"
STATUS = HOME / "remix-pro-agent-status.json"
TOKEN = HOME / "relay.token"
LOG = HOME / "remix-pro-v6-agent.log"
LOCK = HOME / "remix-pro-quality-hotfix.lock"
REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"
SOURCE_COMMIT = "84d788fd406f31b973e11e44b8bb0b59c4d4c895"
SOURCE_SHA = "0b654fccff84b54c09ace39948566d8976f70186"
OLD_SHA = "25327ad052be63c1f86450afb56c478b1a43f528"
URL = ("https://raw.githubusercontent.com/alo986761986-gif/"
       "Sonara-Enterprise/" + SOURCE_COMMIT +
       "/molab/sonara_remix_pro_r2_agent.py")


class MaintenanceBlocked(RuntimeError):
    pass


def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") +
                        b"\\0" + data).hexdigest()


def workers():
    if not Path("/proc").is_dir():
        raise MaintenanceBlocked("MoLab process table unavailable")
    found = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            args = (entry / "cmdline").read_bytes().split(b"\\0")
            if not any(b"sonara_remix_pro_r2_agent.py" in v for v in args[1:]):
                continue
            cwd = (entry / "cwd").resolve(strict=True)
            for arg in args[1:]:
                if b"sonara_remix_pro_r2_agent.py" not in arg:
                    continue
                path = Path(os.fsdecode(arg))
                full = (path if path.is_absolute() else cwd / path).resolve()
                if full == AGENT.resolve():
                    found.append(int(entry.name))
                    break
        except (OSError, ValueError, RuntimeError):
            continue
    return sorted(set(found))


def read_status():
    if STATUS.is_symlink():
        return {}
    try:
        data = json.loads(STATUS.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def is_idle(pid):
    state = read_status()
    age = time.time() - float(state.get("updatedAt") or 0)
    return (pid in workers()
            and state.get("revision") == REVISION
            and state.get("state") == "waiting_for_authorized_job"
            and 0 <= age <= 20
            and not state.get("jobId") and not state.get("leaseId"))


def auth_mode(pid):
    try:
        args = (Path("/proc") / str(pid) / "cmdline").read_bytes().split(b"\\0")
        values = [os.fsdecode(v) for v in args if v]
        for i, arg in enumerate(values):
            if arg == "--auth-mode" and i + 1 < len(values):
                if values[i + 1] in ("none", "required"):
                    return values[i + 1]
            if arg.startswith("--auth-mode="):
                mode = arg.partition("=")[2]
                if mode in ("none", "required"):
                    return mode
    except OSError:
        pass
    raise MaintenanceBlocked("Existing agent authentication mode unknown")


def write_atomic(data):
    fd, name = tempfile.mkstemp(prefix=".sonara-pro-v6-", dir=ROOT)
    path = Path(name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        path.chmod(0o600)
        os.replace(path, AGENT)
    finally:
        path.unlink(missing_ok=True)


def start(mode):
    with LOG.open("ab") as stream:
        return subprocess.Popen(
            [str(PYTHON), str(AGENT), "--auth-mode", mode],
            cwd=ROOT, stdin=subprocess.DEVNULL, stdout=stream,
            stderr=subprocess.STDOUT, start_new_session=True
        )


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--activate", action="store_true")
    args = ap.parse_args(argv)
    print("=== SONARA V6 QUALITY DIAGNOSTICS - SAFE HANDOFF ===", flush=True)
    if (ROOT.is_symlink() or AGENT.is_symlink() or not AGENT.is_file()
            or not PYTHON.is_file() or not TOKEN.is_file()
            or STATUS.is_symlink()):
        raise MaintenanceBlocked("Private runtime, token or status unavailable")
    current = AGENT.read_bytes()
    digest = git_blob(current)
    print("SONARA_QUALITY_PATCH_PRESENT=" + str(digest == SOURCE_SHA), flush=True)
    if digest not in (OLD_SHA, SOURCE_SHA):
        raise MaintenanceBlocked("Unknown local worker modifications; no overwrite")
    pids = workers()
    if len(pids) != 1:
        raise MaintenanceBlocked("Exactly one existing worker required; no startup or overwrite")
    pid = pids[0]
    if not is_idle(pid):
        raise MaintenanceBlocked("Worker heartbeat busy or stale; no handoff")
    if digest == SOURCE_SHA:
        print("SONARA_QUALITY_DIAGNOSTICS_ALREADY_INSTALLED=True")
        print("SONARA_WORKER_UNCHANGED=True")
        return 0
    mode = auth_mode(pid)
    if not args.activate:
        print("SONARA_QUALITY_HANDOFF=READ_ONLY")
        return 0

    # Download and hash-check before touching the live worker.
    with urllib.request.urlopen(
            urllib.request.Request(URL, headers={"User-Agent": "SONARA-V6-QA-Handoff/1.0"}),
            timeout=60) as response:
        new_data = response.read(300001)
    if len(new_data) > 300000 or git_blob(new_data) != SOURCE_SHA:
        raise MaintenanceBlocked("Pinned worker source verification failed")
    compile(new_data, "sonara_remix_pro_r2_agent.py", "exec")

    # Separate maintenance lock serializes concurrent notebook updates.
    HOME.mkdir(mode=0o700, parents=True, exist_ok=True)
    with LOCK.open("a+") as lock:
        os.chmod(LOCK, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise MaintenanceBlocked("Another SONARA maintenance action is running") from exc
        if workers() != [pid] or not is_idle(pid) or git_blob(AGENT.read_bytes()) != OLD_SHA:
            raise MaintenanceBlocked("Worker or source changed while preparing; refusing update")
        time.sleep(2)
        if not is_idle(pid):
            raise MaintenanceBlocked("Worker claimed a job; no update performed")
        os.kill(pid, signal.SIGTERM)  # Existing agent exits gracefully between jobs.
        deadline = time.monotonic() + 18
        while pid in workers() and time.monotonic() < deadline:
            time.sleep(1)
        if pid in workers():
            print("SONARA_HANDOFF_DEFERRED=WORKER_STILL_RUNNING", flush=True)
            print("SONARA_SOURCE_UNCHANGED=True", flush=True)
            return 2
        if workers():
            raise MaintenanceBlocked("Another worker appeared; preserve old source")
        write_atomic(new_data)
        proc = None
        try:
            proc = start(mode)
            start_at = int(time.time())
            until = time.monotonic() + 35
            while time.monotonic() < until:
                if proc.poll() is not None:
                    raise MaintenanceBlocked("New worker exited before readiness")
                state = read_status()
                if (proc.pid in workers() and state.get("revision") == REVISION
                        and state.get("state") == "waiting_for_authorized_job"
                        and int(state.get("updatedAt") or 0) >= start_at):
                    print("SONARA_QUALITY_DIAGNOSTICS_INSTALLED=True", flush=True)
                    print("SONARA_REMIX_PRO_WORKER_PID=" + str(proc.pid), flush=True)
                    print("SONARA_WORKER_STATE=waiting_for_authorized_job", flush=True)
                    print("SONARA_MAIN_ACE_STEP_UNCHANGED=True", flush=True)
                    print("NO_CUSTOMER_AUDIO_JOB_CREATED_BY_INSTALLER=True", flush=True)
                    return 0
                time.sleep(2)
            # A worker may be online but not idle because it claimed a job.
            # Never roll back code under a live worker or interrupt that job.
            if proc.poll() is None and proc.pid in workers():
                print("SONARA_NEW_WORKER_RUNNING_NOT_IDLE=True", flush=True)
                print("SONARA_QUALITY_DIAGNOSTICS_INSTALLED=True", flush=True)
                return 0
            raise MaintenanceBlocked("Replacement worker did not become healthy")
        except Exception:
            if proc is not None and proc.poll() is None:
                raise  # Never replace a module while its worker is running.
            write_atomic(current)
            prior = start(mode)
            print("SONARA_QUALITY_PATCH_ROLLED_BACK=True", flush=True)
            print("SONARA_PREVIOUS_WORKER_RESTARTED_PID=" + str(prior.pid), flush=True)
            raise


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (MaintenanceBlocked, OSError, ValueError, SyntaxError) as exc:
        print("SONARA_QUALITY_HANDOFF_BLOCKED=" + type(exc).__name__, flush=True)
        if isinstance(exc, MaintenanceBlocked):
            print("SONARA_QUALITY_HANDOFF_REASON=" + str(exc), flush=True)
        sys.exit(1)
