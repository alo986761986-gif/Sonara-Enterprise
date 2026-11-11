#!/usr/bin/env python3
"""Guarded A-clock house fusion Remix Pro V6 deployment on the existing MoLab worker.

Only isolated Remix Pro source modules change. No ACE-Step process, relay,
credentials, job, storage, uploaded song, or public site configuration changes.
The worker must prove two fresh idle heartbeats. Roll back before restart if
preflight fails, and never interrupt a job just to perform maintenance.
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
STATUS = HOME / "remix-pro-agent-status.json"
TOKEN = HOME / "relay.token"
PYTHON = ROOT / ".venv/bin/python"
AGENT = ROOT / "sonara_remix_pro_r2_agent.py"
LOG = HOME / "remix-pro-v6-agent.log"
REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"
SOURCE_COMMIT = "ca70e3f66c32dd91530611ea4bb0c93c6ad488a6"
REMOTE = ("https://raw.githubusercontent.com/alo986761986-gif/"
          "Sonara-Enterprise/" + SOURCE_COMMIT + "/molab/")
PINNED = {
    "sonara_remix_pro_a_clock_fusion.py":
        ("", "28a5cdfd3729c68f4a0a93b55b01bb3b0f83a360"),
    "sonara_remix_pro_v5.py":
        ("c8d1c2e9b8a10b0e9c308abe3b48dac8c1d8eaea",
         "255cf86773f9fc908242178e4786fac9fe881c6a"),
    "sonara_remix_pro_r2_agent.py":
        ("a717cd4a4a27b865114c376b7f69cb236953a7d3",
         "4dc8c1bec5d0a71d7995229658d40122c4d1fa9d"),
    "sonara_remix_pro_fusion.py":
        ("67b58b27a8b4ff7838fce0e681a0e438e0b37002",
         "073e73b0f418e91bd48e8bfbe084ba6f31cef847"),
    "sonara_remix_pro_v6.py":
        ("f3616e7107cb271237c3cfa6c8d58aa51eec650b",
         "5de2895488e80ebe46dfee2898888df6680be4a5"),
}


class SafetyBlocked(RuntimeError):
    pass


def git_blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()


def workers():
    if not Path("/proc").is_dir():
        raise SafetyBlocked("Process table is unavailable")
    found = []
    for item in Path("/proc").iterdir():
        if not item.name.isdigit():
            continue
        try:
            args = (item / "cmdline").read_bytes().split(b"\0")
            cwd = (item / "cwd").resolve(strict=True)
            for value in args[1:]:
                if b"sonara_remix_pro_r2_agent.py" not in value:
                    continue
                file = Path(os.fsdecode(value))
                actual = (file if file.is_absolute() else cwd / file).resolve()
                if actual == AGENT.resolve():
                    found.append(int(item.name))
                    break
        except (ValueError, OSError, RuntimeError):
            pass
    return sorted(set(found))


def state():
    if STATUS.is_symlink():
        raise SafetyBlocked("Unsafe status path")
    try:
        value = json.loads(STATUS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return value if isinstance(value, dict) else {}


def idle(pid):
    s = state()
    try:
        age = time.time() - float(s.get("updatedAt") or 0)
    except (TypeError, ValueError):
        return False
    if s.get("revision") != REVISION or s.get("state") != "waiting_for_authorized_job":
        return False
    if not 0 <= age <= 20 or s.get("jobId") or s.get("leaseId"):
        return False
    scratch = ROOT / "private-jobs"
    if scratch.is_symlink():
        raise SafetyBlocked("Unsafe private job path")
    if scratch.is_dir() and any(x.is_dir() and x.name.startswith("srpro_")
                                for x in scratch.iterdir()):
        return False
    return workers() == [pid]


def two_idle_heartbeats(pid, timeout=85):
    prior = None
    end = time.monotonic() + timeout
    while time.monotonic() < end:
        if workers() != [pid]:
            raise SafetyBlocked("Worker process identity changed")
        if idle(pid):
            t = state().get("updatedAt")
            if prior is None:
                prior = t
            elif prior != t:
                print("SONARA_TWO_FRESH_IDLE_HEARTBEATS=True", flush=True)
                return
        time.sleep(2)
    raise SafetyBlocked("Two fresh idle heartbeats not observed")


def verified_download():
    data = {}
    for name, (_, want) in PINNED.items():
        with urllib.request.urlopen(urllib.request.Request(
            REMOTE + name, headers={"User-Agent": "SONARA-Voice-Guard/1.0"}
        ), timeout=40) as response:
            raw = response.read(250001)
        if len(raw) > 250000 or git_blob(raw) != want:
            raise SafetyBlocked("Pinned source mismatch: " + name)
        compile(raw, name, "exec")
        data[name] = raw
    return data


def atomic(path, data):
    fd, name = tempfile.mkstemp(prefix=".sonara-voices-", dir=str(ROOT))
    try:
        with os.fdopen(fd, "wb") as out:
            out.write(data)
        os.chmod(name, 0o600)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)


def main():
    if ROOT.is_symlink() or not ROOT.is_dir() or not PYTHON.is_file():
        raise SafetyBlocked("Existing private Remix Pro installation missing")
    if not TOKEN.is_file() or TOKEN.is_symlink():
        raise SafetyBlocked("Existing private credential unavailable")
    before = {}
    for name, (old, new) in PINNED.items():
        path = ROOT / name
        if path.is_symlink():
            raise SafetyBlocked("Unsafe local module path")
        old_data = path.read_bytes() if path.is_file() else None
        signature = git_blob(old_data) if old_data is not None else ""
        if signature not in (old, new):
            raise SafetyBlocked("Unrecognized local module: " + name)
        before[name] = old_data
    pids = workers()
    if len(pids) != 1:
        raise SafetyBlocked("Exactly one live Remix Pro worker required")
    if all(before[name] is not None and git_blob(before[name]) == sha[1]
           for name, sha in PINNED.items()):
        print("SONARA_A_CLOCK_FUSION_ALREADY_INSTALLED=True", flush=True)
        return
    pid = pids[0]
    two_idle_heartbeats(pid)
    files = verified_download()
    lockfile = HOME / "remix-pro-a-clock-maintenance.lock"
    with lockfile.open("a+") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise SafetyBlocked("Another maintenance operation is active") from exc
        if not idle(pid):
            raise SafetyBlocked("Worker is no longer idle")
        if any((ROOT / name).read_bytes() != raw for name, raw in before.items()
               if raw is not None):
            raise SafetyBlocked("Module changed during maintenance")
        if any((ROOT / name).is_file() for name, raw in before.items()
               if raw is None):
            raise SafetyBlocked("New unknown module appeared")
        mode = "required"
        args = [os.fsdecode(x) for x in (Path("/proc") / str(pid) / "cmdline"
                ).read_bytes().split(b"\0") if x]
        for index, arg in enumerate(args):
            if arg == "--auth-mode" and index + 1 < len(args):
                mode = args[index + 1]
            elif arg.startswith("--auth-mode="):
                mode = arg.split("=", 1)[1]
        if mode not in ("none", "required"):
            raise SafetyBlocked("Unknown worker authentication mode")
        os.kill(pid, signal.SIGTERM)
        deadline = time.monotonic() + 18
        while pid in workers() and time.monotonic() < deadline:
            time.sleep(1)
        if pid in workers():
            raise SafetyBlocked("Previous worker could not shut down safely")
        try:
            for name, raw in files.items():
                atomic(ROOT / name, raw)
            check = subprocess.run([
                str(PYTHON), "-c",
                "import sonara_remix_pro_a_clock_fusion, sonara_remix_pro_v5, "
                "sonara_remix_pro_r2_agent; "
                "assert callable(sonara_remix_pro_a_clock_fusion.compose_one_a_clock)"
            ], cwd=ROOT, text=True, capture_output=True, timeout=90)
            if check.returncode:
                raise SafetyBlocked("Private audio import verification failed")
            with LOG.open("ab") as output:
                child = subprocess.Popen([
                    str(PYTHON), str(AGENT), "--auth-mode", mode
                ], cwd=ROOT, stdin=subprocess.DEVNULL, stdout=output,
                    stderr=subprocess.STDOUT, start_new_session=True)
            until = time.monotonic() + 40
            while time.monotonic() < until:
                if child.poll() is not None:
                    raise SafetyBlocked("Updated worker exited")
                if child.pid in workers():
                    snap = state()
                    if snap.get("revision") == REVISION and snap.get(
                        "state") == "waiting_for_authorized_job":
                        print("SONARA_A_CLOCK_FUSION_V6_INSTALLED=True")
                        print("SONARA_REMIX_PRO_WORKER_PID=" + str(child.pid))
                        print("SONARA_MAIN_ACE_STEP_UNCHANGED=True")
                        print("NO_CUSTOMER_AUDIO_JOB_CREATED=True")
                        return
                time.sleep(2)
            raise SafetyBlocked("New worker readiness not confirmed")
        except Exception:
            if "child" in locals() and child.poll() is None:
                raise SafetyBlocked("Updated worker alive; no unsafe rollback")
            for name, raw in before.items():
                if raw is None:
                    (ROOT / name).unlink(missing_ok=True)
                else:
                    atomic(ROOT / name, raw)
            with LOG.open("ab") as output:
                prior = subprocess.Popen([
                    str(PYTHON), str(AGENT), "--auth-mode", mode
                ], cwd=ROOT, stdin=subprocess.DEVNULL, stdout=output,
                    stderr=subprocess.STDOUT, start_new_session=True)
            print("SONARA_VOICES_ROLLBACK_COMPLETED=True")
            print("SONARA_PREVIOUS_WORKER_RESTARTED_PID=" + str(prior.pid))
            raise


if __name__ == "__main__":
    try:
        main()
    except (SafetyBlocked, OSError, subprocess.SubprocessError, ValueError) as e:
        print("SONARA_A_CLOCK_INSTALL_BLOCKED=" + str(e), flush=True)
        sys.exit(1)
