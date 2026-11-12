#!/usr/bin/env python3
"""SONARA V7 Creative Modes guarded multi-module install for the PRIVATE worker.

Authorizes no customer job. Does not modify ACE-Step, Cloudflare, billing,
original source data or the regular SONARA relay. Requires two fresh IDLE
heartbeats, one worker, SHA-pinned source files, and a verified private venv.
Default is read-only: pass --activate --confirm-maintenance explicitly.
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
HOME = Path.home() / ".sonara"
VENV = ROOT / ".venv"
AGENT = ROOT / "sonara_remix_pro_r2_agent.py"
TOKEN = HOME / "relay.token"
STATUS = HOME / "remix-pro-agent-status.json"
LOG = HOME / "remix-pro-v6-agent.log"
LOCK = HOME / "remix-pro-v7-modes-maintenance.lock"
REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"
COMMIT = "1188cadd7f4b3576095f7f79268cc618050a514a"
BASE = ("https://raw.githubusercontent.com/alo986761986-gif/"
        "Sonara-Enterprise/" + COMMIT + "/molab/")
# Verified previous state: V7 Rhythm Lock with all original modules.
FILES = {
    "sonara_remix_pro_a_clock_fusion.py": (
        "1d4a349637f7b415d1298780479b9cfd5e273210",
        "e44b010e34d46886bd76a07cfff99f927b6c3d21"),
    "sonara_remix_pro_v5.py": (
        "922b3b1ec239be7ed31479b87202e7ce248feaf5",
        "58474a9db887e6a16ab9a57889789f4b0f987d95"),
    "sonara_remix_pro_r2_agent.py": (
        "15693fdad6c1af435572db6f3a1359ada1713717",
        "66dac4702e2418902172c50a07fe268ac9e44b78"),
    "sonara_remix_pro_v7.py": (
        "9913729e43142e3359914a85f5d13652bbf91b40",
        "3ddd13f6e0211e6dcab942d886ae36993384158a"),
    "sonara_remix_pro_v7_rhythm.py": (
        "a39cad47b8b9f618912511166f8d5d2e552f3896",
        "a39cad47b8b9f618912511166f8d5d2e552f3896"),
    "sonara_remix_pro_v6.py": (
        "5de2895488e80ebe46dfee2898888df6680be4a5",
        "d8a99ea30b93cf47f1befee3c8c45b3ad630a597"),
}


class Blocked(RuntimeError):
    pass


def digest(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def worker_pids():
    found = []
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():
            continue
        try:
            cwd = (proc / "cwd").resolve(strict=True)
            args = (proc / "cmdline").read_bytes().split(b"\0")
            for arg in args[1:]:
                if b"sonara_remix_pro_r2_agent.py" not in arg:
                    continue
                path = Path(os.fsdecode(arg))
                absolute = (path if path.is_absolute() else cwd / path).resolve()
                if absolute == AGENT.resolve():
                    found.append(int(proc.name))
                    break
        except (OSError, RuntimeError, ValueError):
            continue
    return sorted(set(found))


def state():
    if STATUS.is_symlink():
        raise Blocked("Unsafe status symlink")
    try:
        value = json.loads(STATUS.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def idle(pid):
    data = state()
    try:
        age = time.time() - float(data.get("updatedAt") or 0)
    except (ValueError, TypeError):
        return False
    if not (data.get("state") == "waiting_for_authorized_job"
            and data.get("revision") == REVISION
            and not data.get("jobId") and not data.get("leaseId")
            and 0 <= age <= 20 and worker_pids() == [pid]):
        return False
    jobs = ROOT / "private-jobs"
    if jobs.is_symlink():
        raise Blocked("Unsafe private job directory")
    return not (jobs.is_dir() and any(
        p.is_dir() and p.name.startswith("srpro_") for p in jobs.iterdir()))


def two_idle_heartbeats(pid):
    previous = None
    deadline = time.monotonic() + 85
    while time.monotonic() < deadline:
        if worker_pids() != [pid]:
            raise Blocked("Worker changed during maintenance observation")
        if idle(pid):
            stamp = state().get("updatedAt")
            if previous is not None and stamp != previous:
                print("SONARA_V7_TWO_FRESH_IDLE_HEARTBEATS=True", flush=True)
                return
            previous = stamp
        else:
            previous = None
        time.sleep(2)
    raise Blocked("Worker not safely idle; no changes performed")


def private_python():
    if VENV.is_symlink() or not (VENV / "pyvenv.cfg").is_file():
        raise Blocked("Private Remix Pro environment missing")
    for candidate in (VENV / "bin/python", VENV / "bin/python3",
                      VENV / "bin/python3.13", VENV / "bin/python3.12"):
        if not candidate.is_file() or not os.access(candidate, os.X_OK):
            continue
        run = subprocess.run(
            [str(candidate), "-c",
             "import pathlib,sys;print(pathlib.Path(sys.prefix).resolve())"],
            cwd=ROOT, capture_output=True, text=True, timeout=15,
            check=False)
        if run.returncode == 0 and run.stdout.strip() == str(VENV.resolve()):
            print("SONARA_V7_PRIVATE_PYTHON_VERIFIED=True", flush=True)
            return candidate
    raise Blocked("Existing private Python could not be verified")


def atomic(path, content):
    fd, name = tempfile.mkstemp(prefix=".sonara-v7-", dir=ROOT)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
        os.chmod(name, 0o600)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def launch(python, mode):
    with LOG.open("ab") as output:
        return subprocess.Popen(
            [str(python), str(AGENT), "--auth-mode", mode],
            cwd=ROOT, stdin=subprocess.DEVNULL, stdout=output,
            stderr=subprocess.STDOUT, start_new_session=True)


def read_mode(pid):
    args = [os.fsdecode(a) for a in
            (Path("/proc") / str(pid) / "cmdline").read_bytes().split(b"\0") if a]
    mode = "required"
    for i, arg in enumerate(args):
        if arg == "--auth-mode" and i + 1 < len(args):
            mode = args[i + 1]
        elif arg.startswith("--auth-mode="):
            mode = arg.split("=", 1)[1]
    if mode not in ("required", "none"):
        raise Blocked("Unsupported private authentication mode")
    return mode


def main(activate):
    print("=== SONARA REMIX PRO V7 - DISTINCT CREATIVE MODES ===", flush=True)
    for path in (ROOT, AGENT, STATUS, TOKEN):
        if path.is_symlink() or not path.exists():
            raise Blocked("Missing or unsafe dependency: " + path.name)
    python = private_python()
    old = {}
    for name, (before, after) in FILES.items():
        path = ROOT / name
        if path.is_symlink():
            raise Blocked("Unsafe private module symlink: " + name)
        existing = path.read_bytes() if path.is_file() else None
        sha = digest(existing) if existing is not None else None
        if sha not in (before, after):
            raise Blocked("Unknown module version; refusing overwrite: " + name)
        old[name] = existing
    if all(digest(old[name]) == expected[1] for name, expected in FILES.items()
           if old[name] is not None) and all(old.values()):
        print("SONARA_V7_CREATIVE_MODES_ALREADY_INSTALLED=True")
        return
    if not activate:
        print("SONARA_V7_CREATIVE_MODES_PREFLIGHT_ONLY=True")
        print("SONARA_V7_NEXT=--activate --confirm-maintenance")
        return
    pids = worker_pids()
    if len(pids) != 1:
        raise Blocked("Expected exactly one private Remix Pro worker")
    pid = pids[0]
    two_idle_heartbeats(pid)
    incoming = {}
    for name, (_, target_sha) in FILES.items():
        request = urllib.request.Request(
            BASE + name, headers={"User-Agent": "SONARA-V7-Private/1.0"})
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = response.read(200001)
        if len(payload) > 200000 or digest(payload) != target_sha:
            raise Blocked("Pinned Git blob mismatch: " + name)
        compile(payload, name, "exec")
        incoming[name] = payload
    with LOCK.open("a+") as lock:
        os.chmod(LOCK, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise Blocked("Concurrent V7 maintenance prevented") from exc
        if not idle(pid) or any(
                (ROOT / name).read_bytes() != content
                for name, content in old.items() if content is not None):
            raise Blocked("Worker or files changed; no modifications")
        mode = read_mode(pid)
        time.sleep(2)
        if not idle(pid):
            raise Blocked("New authorized job claimed; update aborted")
        os.kill(pid, signal.SIGTERM)
        deadline = time.monotonic() + 20
        while pid in worker_pids() and time.monotonic() < deadline:
            time.sleep(1)
        if worker_pids():
            raise Blocked("Original worker still alive, files left unchanged")
        child = None
        try:
            for name, payload in incoming.items():
                atomic(ROOT / name, payload)
            check = subprocess.run(
                [str(python), "-c",
                 "import sonara_remix_pro_r2_agent as a; "
                 "assert a.pro_heartbeat_payload()['v7Ready'] is True; "
                 "assert a.pro_heartbeat_payload()['v7RhythmReady'] is True; "
                 "assert a.pro_heartbeat_payload()['v7CreativeModesReady'] is True"],
                cwd=ROOT, capture_output=True, text=True, timeout=90)
            if check.returncode:
                raise Blocked("V7 private import/readiness validation failed")
            since = int(time.time())
            child = launch(python, mode)
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                if child.poll() is not None:
                    raise Blocked("New V7 worker exited at startup")
                data = state()
                if (child.pid in worker_pids()
                        and data.get("revision") == REVISION
                        and data.get("state") == "waiting_for_authorized_job"
                        and float(data.get("updatedAt") or 0) >= since):
                    print("SONARA_V7_CREATIVE_MODES_INSTALLED=True")
                    print("SONARA_V7_CREATIVE_MODES_GPU_READY=True")
                    print("SONARA_V7_WORKER_PID=" + str(child.pid))
                    print("SONARA_MAIN_ACE_STEP_UNCHANGED=True")
                    print("NO_CUSTOMER_JOB_CREATED=True")
                    print("QUALITY_GATE_DISABLED=False")
                    return
                time.sleep(2)
            raise Blocked("V7 readiness not confirmed")
        except Exception:
            if child is not None and child.poll() is None:
                raise Blocked("Updated worker remains alive; rollback unsafe")
            for name, previous in old.items():
                if previous is None:
                    (ROOT / name).unlink(missing_ok=True)
                else:
                    atomic(ROOT / name, previous)
            restored = launch(python, mode)
            print("SONARA_V7_CREATIVE_MODES_ROLLBACK_COMPLETE=True")
            print("SONARA_V6_RESTORED_WORKER_PID=" + str(restored.pid))
            raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--activate", action="store_true")
    parser.add_argument("--confirm-maintenance", action="store_true")
    args = parser.parse_args()
    try:
        main(args.activate and args.confirm_maintenance)
    except (Blocked, OSError, ValueError, SyntaxError,
            subprocess.SubprocessError) as exc:
        print("SONARA_V7_CREATIVE_MODES_INSTALL_BLOCKED=" + str(exc), flush=True)
        sys.exit(1)
