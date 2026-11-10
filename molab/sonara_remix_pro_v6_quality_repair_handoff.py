#!/usr/bin/env python3
"""Guarded idle-only installation of Remix Pro V6 quality gate fixes and peak recovery.

Three pinned private Python modules are updated together. Existing jobs must
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
SOURCE_COMMIT = "2114865872e5dcf5d533bb73a17ea62ef3f8c5db"
PINNED = {
    "sonara_remix_pro_r2_agent.py": (
        "20099f2ce354a9be8527bb4cfdb75cd0220fd367",
        "b49d5e618e6dbe6a90f11098eeeea69cd1ba331e",
    ),
    "sonara_remix_pro_v5.py": (
        "7e9abaf5fba646043e02ea28f683d996c45e04c9",
        "25366c30b1e185cb3574f710acd71db6feae6d29",
    ),
    "sonara_remix_pro_quality.py": (
        "d31e42a4ba52e15fee08436f997f95b0b7561054",
        "7e4e0f6c608e02063b3bac689b5b35a5b91bbef5",
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


def private_job_in_progress():
    """Fail closed if any customer-job scratch directory remains in use."""
    base = ROOT / "private-jobs"
    if base.is_symlink():
        raise MaintenanceBlocked("Unexpected private jobs directory symlink")
    if not base.exists():
        return False
    if not base.is_dir():
        raise MaintenanceBlocked("Private jobs path is not a directory")
    # Never reveal customer job IDs or filenames.
    return any(p.is_dir() and p.name.startswith("srpro_") for p in base.iterdir())


def status_snapshot():
    state = read_status()
    try:
        age = time.time() - float(state.get("updatedAt") or 0)
    except (ValueError, TypeError, OverflowError):
        age = float("inf")
    allowed = {"waiting_for_authorized_job", "processing",
               "waiting_for_pro_activation", "connection_unavailable",
               "preflight_ready", "stopped"}
    label = state.get("state")
    return {
        "revision_ok": state.get("revision") == REVISION,
        "label": label if label in allowed else "unknown",
        "updated": state.get("updatedAt"),
        "age": age,
        "has_job": bool(state.get("jobId") or state.get("leaseId")),
    }


def is_idle(pid):
    state = status_snapshot()
    return (pid in workers()
            and state["revision_ok"]
            and state["label"] == "waiting_for_authorized_job"
            and 0 <= state["age"] <= 20
            and not state["has_job"]
            and not private_job_in_progress())


def wait_for_two_idle_heartbeats(pid, *, seconds=80):
    """Observe TWO distinct, fresh idle updates, never infer idle from a stale file.

    The worker may spend longer than 20 s in GPU inference or Cloudflare I/O.
    In those cases, do not terminate it. This is a bounded, foreground
    maintenance check, not a background task.
    """
    deadline = time.monotonic() + seconds
    previous_label = None
    observed_update = None
    while time.monotonic() <= deadline:
        if workers() != [pid]:
            raise MaintenanceBlocked("Worker PID changed during idle observation")
        snap = status_snapshot()
        active = private_job_in_progress()
        if snap["label"] != previous_label:
            print("SONARA_WORKER_OBSERVED_STATE=" + snap["label"], flush=True)
            previous_label = snap["label"]
        if not active and is_idle(pid):
            fresh_update = snap["updated"]
            if observed_update is None:
                observed_update = fresh_update
            elif fresh_update != observed_update:
                print("SONARA_TWO_FRESH_IDLE_HEARTBEATS=True", flush=True)
                return True
        else:
            observed_update = None
        time.sleep(4)

    snap = status_snapshot()
    print("SONARA_WORKER_LAST_OBSERVED_STATE=" + snap["label"], flush=True)
    print("SONARA_WORKER_STATUS_AGE_SECONDS=" +
          str(round(snap["age"]) if snap["age"] != float("inf") else "unknown"),
          flush=True)
    print("SONARA_PRIVATE_JOB_IN_PROGRESS=" +
          str(private_job_in_progress()), flush=True)
    print("SONARA_UPDATE_SAFELY_DEFERRED=True", flush=True)
    return False


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
    print("=== SONARA V6 - QUALITY RECOVERY HANDOFF ===", flush=True)
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
    if not args.activate and not is_idle(pid):
        snap = status_snapshot()
        print("SONARA_WORKER_OBSERVED_STATE=" + snap["label"], flush=True)
        print("SONARA_WORKER_STATUS_AGE_SECONDS=" +
              str(round(snap["age"]) if snap["age"] != float("inf") else "unknown"),
              flush=True)
        raise MaintenanceBlocked("Worker is not confirmed idle; no changes made")
    if args.activate and not wait_for_two_idle_heartbeats(pid, seconds=80):
        raise MaintenanceBlocked("Worker did not prove two fresh idle heartbeats; no changes made")
    if all_new:
        print("SONARA_V6_QUALITY_RECOVERY_ALREADY_INSTALLED=True")
        print("SONARA_WORKER_UNCHANGED=True")
        return 0
    mode = auth_mode(pid)
    if not args.activate:
        print("SONARA_V6_QUALITY_RECOVERY_HANDOFF=READ_ONLY")
        return 0

    payloads = {}
    for name, (_, wanted_sha) in PINNED.items():
        with urllib.request.urlopen(
                urllib.request.Request(BASE_URL + name, headers={
                    "User-Agent": "SONARA-V6-Quality-Repair/1.0"
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
            raise MaintenanceBlocked("Worker changed or claimed work before update")
        if any((ROOT / name).read_bytes() != originals[name] for name in PINNED):
            raise MaintenanceBlocked("Modules changed concurrently")
        # Confirm no new customer job started while we acquired the lock.
        time.sleep(2)
        if not is_idle(pid):
            raise MaintenanceBlocked("Worker claimed a new job; update deferred")
        os.kill(pid, signal.SIGTERM)
        deadline = time.monotonic() + 18
        while pid in workers() and time.monotonic() < deadline:
            time.sleep(1)
        if pid in workers():
            print("SONARA_QUALITY_REPAIR_DEFERRED=WORKER_STILL_RUNNING")
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
                 "import sonara_remix_pro_quality, sonara_remix_pro_v5, "
                 "sonara_remix_pro_r2_agent; "
                 "assert callable(sonara_remix_pro_quality.recover_peak_safe_master)"],
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
                    print("SONARA_V6_QUALITY_RECOVERY_INSTALLED=True")
                    print("SONARA_QUALITY_MASTER_PEAK_RECOVERY=ACTIVE")
                    print("SONARA_QUALITY_REFERENCE_SPECTRAL_FALSE_POSITIVE_FIX=ACTIVE")
                    print("SONARA_REMIX_PRO_WORKER_PID=" + str(proc.pid))
                    print("SONARA_WORKER_STATE=waiting_for_authorized_job")
                    print("SONARA_MAIN_ACE_STEP_UNCHANGED=True")
                    print("NO_CUSTOMER_AUDIO_JOB_CREATED_BY_INSTALLER=True")
                    return 0
                time.sleep(2)
            if proc.poll() is None and proc.pid in workers():
                print("SONARA_WORKER_RUNNING_BUT_NOT_IDLE=True")
                print("SONARA_V6_QUALITY_RECOVERY_INSTALLED=True")
                print("SONARA_WORKER_RUNNING_BUT_NOT_IDLE=True")
                return 0
            raise MaintenanceBlocked("New worker did not become ready")
        except Exception:
            if proc is not None and proc.poll() is None:
                raise  # Never roll back while the worker is alive.
            for name, data in originals.items():
                write_atomic(ROOT / name, data)
            previous = start(mode)
            print("SONARA_QUALITY_RECOVERY_ROLLED_BACK=True")
            print("SONARA_PREVIOUS_WORKER_RESTARTED_PID=" + str(previous.pid))
            raise


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (MaintenanceBlocked, OSError, ValueError, SyntaxError) as exc:
        print("SONARA_QUALITY_RECOVERY_HANDOFF_BLOCKED=" + type(exc).__name__, flush=True)
        if isinstance(exc, MaintenanceBlocked):
            print("SONARA_QUALITY_RECOVERY_HANDOFF_REASON=" + str(exc), flush=True)
        sys.exit(1)
