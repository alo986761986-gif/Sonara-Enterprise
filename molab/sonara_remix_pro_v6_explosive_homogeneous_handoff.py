#!/usr/bin/env python3
"""Guarded idle-only installation of Explosive V6 homogeneous voice and instrumentation.

Four pinned private Python modules are updated together. Existing jobs must
be idle, the old worker must exit gracefully, and all old bytes are available
for rollback. Main ACE-Step, relay, credentials, R2 and user audio are untouched.
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
SOURCE_COMMIT = "7644d9dad7114a8538bd9f73637f5abcefc9bf11"
PINNED = {
    "sonara_remix_pro_r2_agent.py": (
        "14bc193f5ec3d01c98a6e80f9fe585494ef44204",
        "20099f2ce354a9be8527bb4cfdb75cd0220fd367",
    ),
    "sonara_remix_pro_fusion.py": (
        "87e0366c9b8776a94562fbe89468e295e13ecbaf",
        "67b58b27a8b4ff7838fce0e681a0e438e0b37002",
    ),
    "sonara_remix_pro_v5.py": (
        "86ffa54c9546e4906227e367cbc805bbe68dc894",
        "7e9abaf5fba646043e02ea28f683d996c45e04c9",
    ),
    "sonara_remix_pro_v6.py": (
        "535c9e30ad04ed950c4f615639d078f7f823435c",
        "f3616e7107cb271237c3cfa6c8d58aa51eec650b",
    ),
}
BASE_URL = ("https://raw.githubusercontent.com/alo986761986-gif/"
            "Sonara-Enterprise/" + SOURCE_COMMIT + "/molab/")


class MaintenanceBlocked(RuntimeError):
    pass


def git_blob(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") +
                        b"\0" + data).hexdigest()


def workers():
    if not Path("/proc").is_dir():
        raise MaintenanceBlocked("MoLab process table unavailable")
    found = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            args = (entry / "cmdline").read_bytes().split(b"\0")
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
        args = (Path("/proc") / str(pid) / "cmdline").read_bytes().split(b"\0")
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


def write_atomic(destination, data):
    fd, name = tempfile.mkstemp(prefix=".sonara-pro-v6-", dir=ROOT)
    path = Path(name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        path.chmod(0o600)
        os.replace(path, destination)
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
    print("=== SONARA V6 - HOMOGENEOUS EXPLOSIVE FUSION HANDOFF ===", flush=True)
    if (ROOT.is_symlink() or not ROOT.is_dir() or not AGENT.is_file()
            or not PYTHON.is_file() or not TOKEN.is_file()
            or STATUS.is_symlink()):
        raise MaintenanceBlocked("Private runtime, token or status unavailable")

    originals = {}
    all_new = True
    for name, (old_sha, new_sha) in PINNED.items():
        path = ROOT / name
        if path.is_symlink() or not path.is_file():
            raise MaintenanceBlocked("Private module missing or symlink: " + name)
        original = path.read_bytes()
        sha = git_blob(original)
        if sha not in (old_sha, new_sha):
            raise MaintenanceBlocked("Unknown local changes: " + name)
        originals[name] = original
        if sha != new_sha:
            all_new = False

    pids = workers()
    if len(pids) != 1:
        raise MaintenanceBlocked("Exactly one live Remix Pro worker is required")
    pid = pids[0]
    if not is_idle(pid):
        raise MaintenanceBlocked("Worker busy or stale heartbeat; no changes made")
    if all_new:
        print("SONARA_EXPLOSIVE_HOMOGENEITY_ALREADY_INSTALLED=True")
        print("SONARA_WORKER_UNCHANGED=True")
        return 0
    mode = auth_mode(pid)
    if not args.activate:
        print("SONARA_EXPLOSIVE_HOMOGENEITY_HANDOFF=READ_ONLY")
        return 0

    payloads = {}
    for name, (_, wanted_sha) in PINNED.items():
        with urllib.request.urlopen(
                urllib.request.Request(BASE_URL + name, headers={
                    "User-Agent": "SONARA-V6-Explosive-Homogeneity/1.0"
                }), timeout=60) as response:
            data = response.read(300001)
        if len(data) > 300000 or git_blob(data) != wanted_sha:
            raise MaintenanceBlocked("Pinned source mismatch: " + name)
        compile(data, name, "exec")
        payloads[name] = data

    HOME.mkdir(mode=0o700, parents=True, exist_ok=True)
    with LOCK.open("a+") as lock:
        os.chmod(LOCK, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise MaintenanceBlocked("Another SONARA maintenance action is running") from exc
        if workers() != [pid] or not is_idle(pid):
            raise MaintenanceBlocked("Worker changed while preparing; refusing update")
        if any((ROOT / name).read_bytes() != originals[name] for name in PINNED):
            raise MaintenanceBlocked("Modules changed concurrently")
        time.sleep(2)
        if not is_idle(pid):
            raise MaintenanceBlocked("Worker claimed a new job; update deferred")
        os.kill(pid, signal.SIGTERM)
        deadline = time.monotonic() + 18
        while pid in workers() and time.monotonic() < deadline:
            time.sleep(1)
        if pid in workers():
            print("SONARA_EXPLOSIVE_HANDOFF_DEFERRED=WORKER_STILL_RUNNING")
            print("SONARA_PREVIOUS_FILES_UNCHANGED=True")
            return 2
        if workers():
            raise MaintenanceBlocked("Another worker appeared; no overwrite")

        proc = None
        try:
            for name, data in payloads.items():
                write_atomic(ROOT / name, data)
            # Real imports validate the new runtime before the worker starts,
            # never claim a job or generate audio.
            check = subprocess.run(
                [str(PYTHON), "-c",
                 "import sonara_remix_pro_fusion, sonara_remix_pro_v5, "
                 "sonara_remix_pro_r2_agent; "
                 "assert callable(sonara_remix_pro_fusion.make_dual_hook_conditioning_guide)"],
                cwd=ROOT, timeout=90, text=True, capture_output=True
            )
            if check.returncode:
                raise MaintenanceBlocked("Isolated module import validation failed")
            proc = start(mode)
            start_at = int(time.time())
            until = time.monotonic() + 40
            while time.monotonic() < until:
                if proc.poll() is not None:
                    raise MaintenanceBlocked("New worker exited before readiness")
                state = read_status()
                if (proc.pid in workers() and state.get("revision") == REVISION
                        and state.get("state") == "waiting_for_authorized_job"
                        and int(state.get("updatedAt") or 0) >= start_at):
                    print("SONARA_V6_EXPLOSIVE_HOMOGENEITY_INSTALLED=True")
                    print("SONARA_EXPLOSIVE_VOICE_IDENTITY_LOCK=ACTIVE")
                    print("SONARA_EXPLOSIVE_INSTRUMENT_PALETTE_LOCK=ACTIVE")
                    print("SONARA_REMIX_PRO_WORKER_PID=" + str(proc.pid))
                    print("SONARA_WORKER_STATE=waiting_for_authorized_job")
                    print("SONARA_MAIN_ACE_STEP_UNCHANGED=True")
                    print("NO_CUSTOMER_AUDIO_JOB_CREATED_BY_INSTALLER=True")
                    return 0
                time.sleep(2)
            if proc.poll() is None and proc.pid in workers():
                print("SONARA_WORKER_RUNNING_BUT_NOT_IDLE=True")
                print("SONARA_V6_REAL_DUAL_SOURCE_FUSION_INSTALLED=True")
                return 0
            raise MaintenanceBlocked("New worker did not become ready")
        except Exception:
            if proc is not None and proc.poll() is None:
                raise  # Never roll back while the worker is alive.
            for name, data in originals.items():
                write_atomic(ROOT / name, data)
            previous = start(mode)
            print("SONARA_EXPLOSIVE_HOMOGENEITY_ROLLED_BACK=True")
            print("SONARA_PREVIOUS_WORKER_RESTARTED_PID=" + str(previous.pid))
            raise


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (MaintenanceBlocked, OSError, ValueError, SyntaxError) as exc:
        print("SONARA_QUALITY_HANDOFF_BLOCKED=" + type(exc).__name__, flush=True)
        if isinstance(exc, MaintenanceBlocked):
            print("SONARA_QUALITY_HANDOFF_REASON=" + str(exc), flush=True)
        sys.exit(1)
