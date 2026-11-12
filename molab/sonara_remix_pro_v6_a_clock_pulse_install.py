#!/usr/bin/env python3
"""Idle-only, SHA-pinned installation of the V6 A-clock continuity repair.

Never affects ACE-Step, Cloudflare/R2, relay tokens, or customer audio jobs.
"""
from __future__ import annotations

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
HOME = Path.home() / ".sonara"
AGENT = ROOT / "sonara_remix_pro_r2_agent.py"
PYTHON = ROOT / ".venv/bin/python"
STATUS = HOME / "remix-pro-agent-status.json"
TOKEN = HOME / "relay.token"
LOG = HOME / "remix-pro-v6-agent.log"
MODULE = ROOT / "sonara_remix_pro_a_clock_fusion.py"
LOCK = HOME / "remix-pro-a-clock-pulse-maintenance.lock"
REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"
OLD = "28a5cdfd3729c68f4a0a93b55b01bb3b0f83a360"
NEW = "a4b41aeb568fa7a9d020a3a042177009f4587908"
COMMIT = "5f123d4812995bf1369ac3ec51fa7c94d1f3b160"
URL = ("https://raw.githubusercontent.com/alo986761986-gif/"
       "Sonara-Enterprise/" + COMMIT + "/molab/sonara_remix_pro_a_clock_fusion.py")


class Blocked(RuntimeError):
    pass


def digest(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\\0" + data).hexdigest()


def worker_pids():
    pids = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            args = (entry / "cmdline").read_bytes().split(b"\\0")
            cwd = (entry / "cwd").resolve(strict=True)
            for value in args[1:]:
                if b"sonara_remix_pro_r2_agent.py" not in value:
                    continue
                path = Path(os.fsdecode(value))
                resolved = (path if path.is_absolute() else cwd / path).resolve()
                if resolved == AGENT.resolve():
                    pids.append(int(entry.name))
                    break
        except (OSError, RuntimeError, ValueError):
            continue
    return sorted(set(pids))


def state():
    if STATUS.is_symlink():
        raise Blocked("Unsafe status symlink")
    try:
        data = json.loads(STATUS.read_text())
        return data if isinstance(data, dict) else {}
    except (ValueError, OSError):
        return {}


def idle(pid):
    data = state()
    try:
        age = time.time() - float(data.get("updatedAt") or 0)
    except (ValueError, TypeError):
        return False
    if not (data.get("revision") == REVISION
            and data.get("state") == "waiting_for_authorized_job"
            and not data.get("jobId") and not data.get("leaseId")
            and 0 <= age <= 20 and worker_pids() == [pid]):
        return False
    jobs = ROOT / "private-jobs"
    if jobs.is_symlink():
        raise Blocked("Unsafe private jobs symlink")
    return not (jobs.is_dir() and any(
        p.is_dir() and p.name.startswith("srpro_") for p in jobs.iterdir()))


def observe_idle(pid):
    first = None
    deadline = time.monotonic() + 85
    while time.monotonic() < deadline:
        if worker_pids() != [pid]:
            raise Blocked("Worker changed while observing idle heartbeats")
        if idle(pid):
            updated = state().get("updatedAt")
            if first is None:
                first = updated
            elif updated != first:
                print("SONARA_TWO_FRESH_IDLE_HEARTBEATS=True", flush=True)
                return
        else:
            first = None
        time.sleep(2)
    raise Blocked("No two fresh idle heartbeats: update safely deferred")


def atomic(path, content):
    fd, name = tempfile.mkstemp(prefix=".sonara-v6-pulse-", dir=ROOT)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
        os.chmod(name, 0o600)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def launch(mode):
    with LOG.open("ab") as output:
        return subprocess.Popen(
            [str(PYTHON), str(AGENT), "--auth-mode", mode],
            cwd=ROOT, stdin=subprocess.DEVNULL,
            stdout=output, stderr=subprocess.STDOUT,
            start_new_session=True)


def main():
    print("=== SONARA V6 - A CLOCK PULSE RECOVERY ===", flush=True)
    for path in (ROOT, MODULE, AGENT, PYTHON, STATUS, TOKEN):
        if path.is_symlink() or not path.exists():
            raise Blocked("Missing or unsafe runtime dependency: " + path.name)
    previous = MODULE.read_bytes()
    before = digest(previous)
    if before == NEW:
        print("SONARA_A_CLOCK_PULSE_ALREADY_INSTALLED=True")
        return
    if before != OLD:
        raise Blocked("Local A-clock module has unknown changes; no overwrite")
    pids = worker_pids()
    if len(pids) != 1:
        raise Blocked("Expected exactly one live Remix Pro worker")
    pid = pids[0]
    observe_idle(pid)

    with urllib.request.urlopen(
        urllib.request.Request(URL, headers={"User-Agent": "SONARA-V6-Pulse/1.0"}),
        timeout=45
    ) as response:
        incoming = response.read(160001)
    if len(incoming) > 160000 or digest(incoming) != NEW:
        raise Blocked("Downloaded module did not match pinned Git blob")
    compile(incoming, MODULE.name, "exec")

    with LOCK.open("a+") as handle:
        os.chmod(LOCK, 0o600)
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise Blocked("Another pulse maintenance action is active") from exc
        if not idle(pid) or MODULE.read_bytes() != previous:
            raise Blocked("Worker claimed a job or module changed; no action")
        cmdline = [os.fsdecode(x) for x in
                   (Path("/proc") / str(pid) / "cmdline").read_bytes().split(b"\\0") if x]
        mode = "required"
        for i, arg in enumerate(cmdline):
            if arg == "--auth-mode" and i + 1 < len(cmdline):
                mode = cmdline[i + 1]
            elif arg.startswith("--auth-mode="):
                mode = arg.partition("=")[2]
        if mode not in ("required", "none"):
            raise Blocked("Invalid existing authentication mode")
        time.sleep(2)
        if not idle(pid):
            raise Blocked("New job claimed: update deferred")
        os.kill(pid, signal.SIGTERM)
        deadline = time.monotonic() + 20
        while pid in worker_pids() and time.monotonic() < deadline:
            time.sleep(1)
        if pid in worker_pids() or worker_pids():
            raise Blocked("Worker did not exit cleanly; module unchanged")

        child = None
        try:
            atomic(MODULE, incoming)
            check = subprocess.run(
                [str(PYTHON), "-c",
                 "import sonara_remix_pro_a_clock_fusion as m; "
                 "assert callable(m._choose_a_drum_loop); "
                 "import sonara_remix_pro_r2_agent"],
                cwd=ROOT, timeout=90, capture_output=True, text=True)
            if check.returncode:
                raise Blocked("Isolated import test failed")
            child = launch(mode)
            started = time.time()
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                if child.poll() is not None:
                    raise Blocked("Updated worker exited during startup")
                snapshot = state()
                if (child.pid in worker_pids()
                        and snapshot.get("revision") == REVISION
                        and snapshot.get("state") == "waiting_for_authorized_job"
                        and float(snapshot.get("updatedAt") or 0) >= started):
                    print("SONARA_A_CLOCK_PULSE_FIX_INSTALLED=True")
                    print("SONARA_REMIX_PRO_WORKER_PID=" + str(child.pid))
                    print("SONARA_MAIN_ACE_STEP_UNCHANGED=True")
                    print("NO_CUSTOMER_AUDIO_JOB_CREATED=True")
                    print("QUALITY_GATE_DISABLED=False")
                    return
                time.sleep(2)
            raise Blocked("Updated worker readiness not confirmed")
        except Exception:
            if child is not None and child.poll() is None:
                raise Blocked("New worker alive: no unsafe rollback")
            atomic(MODULE, previous)
            restored = launch(mode)
            print("SONARA_A_CLOCK_PULSE_ROLLED_BACK=True")
            print("SONARA_RESTORED_WORKER_PID=" + str(restored.pid))
            raise


if __name__ == "__main__":
    try:
        main()
    except (Blocked, OSError, ValueError, SyntaxError,
            subprocess.SubprocessError) as exc:
        print("SONARA_A_CLOCK_PULSE_INSTALL_BLOCKED=" + str(exc))
        sys.exit(1)
