"""Guarded SONARA Remix Pro V6 installer for the private MoLab RTX PRO 6000.

DEFAULT IS READ-ONLY. No audio job is created, no secret is printed.
This installer never modifies the main ACE-Step runtime or Cloudflare secrets.
Activation requires an exact idle worker identity, source SHA pins and a
confirmed maintenance command. The previous V6 worker can be restored.
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
STATUS = Path.home() / ".sonara/remix-pro-agent-status.json"
TOKEN = Path.home() / ".sonara/relay.token"
LOG = Path.home() / ".sonara/remix-pro-v6-agent.log"
REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"
PINNED_COMMIT = "3b26109f3b26c0f394dc90e0dc551f768e4c0129"
BLOBS = {
    "sonara_remix_pro_r2_agent.py": "49d538e3b1159f3d6a463903aedce62372fe5862",
    "sonara_remix_pro_v5.py": "e937601430b302380f10be2f45e36e88973416b6",
    "sonara_remix_pro_v6.py": "26a90eb5fa806d8a48021ada3aaea7817530c59f",
    "sonara_remix_pro_fusion.py": "be870b0331fad2357f8210362591186a0125ee01",
}
KNOWN_OLD = {
    "sonara_remix_pro_r2_agent.py": frozenset(("9174704c48108cf3ec0b6a7d4f913ac75ab56812", BLOBS["sonara_remix_pro_r2_agent.py"])),
    "sonara_remix_pro_v5.py": frozenset(("49649c941ba7465fb9ae4b63c3033fd330bfdb9b", BLOBS["sonara_remix_pro_v5.py"])),
    "sonara_remix_pro_v6.py": frozenset(("70d6a8f2b63f694863e8ffb0ef2f7db802d86f61", BLOBS["sonara_remix_pro_v6.py"])),
    "sonara_remix_pro_fusion.py": frozenset(("4ceb90293e1d9f9b9f1c7b0916258eae1c2a3f04", BLOBS["sonara_remix_pro_fusion.py"])),
}
IDLE = frozenset(("waiting_for_authorized_job", "waiting_for_pro_activation", "preflight_ready"))


class Blocked(RuntimeError):
    pass


def git_blob(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()


def state():
    try:
        value = json.loads(STATUS.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def live_workers():
    if not Path("/proc").is_dir():
        raise Blocked("MoLab process table unavailable")
    workers = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            args = (entry / "cmdline").read_bytes().split(b"\0")
            if not any(b"sonara_remix_pro_r2_agent.py" in a for a in args[1:]):
                continue
            cwd = (entry / "cwd").resolve(strict=True)
            for value in args[1:]:
                if b"sonara_remix_pro_r2_agent.py" not in value:
                    continue
                path = Path(os.fsdecode(value))
                absolute = (path if path.is_absolute() else cwd / path).resolve()
                if absolute == AGENT.resolve():
                    workers.append(int(entry.name))
        except (OSError, RuntimeError, ValueError):
            continue
    return sorted(workers)


def mode_for(pid):
    args = (Path("/proc") / str(pid) / "cmdline").read_bytes().split(b"\0")
    values = [os.fsdecode(v) for v in args if v]
    for i, value in enumerate(values):
        if value == "--auth-mode" and i + 1 < len(values):
            return values[i + 1]
        if value.startswith("--auth-mode="):
            return value.partition("=")[2]
    return "required"


def safe_idle(pid):
    s = state()
    age = time.time() - float(s.get("updatedAt") or 0)
    if s.get("revision") != REVISION or s.get("state") not in IDLE or not 0 <= age <= 45:
        return False
    if s.get("jobId") or s.get("leaseId"):
        return False
    return pid in live_workers()


def download_verified():
    files = {}
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for name, expected in BLOBS.items():
        url = ("https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/"
               + PINNED_COMMIT + "/molab/" + name)
        request = urllib.request.Request(url, headers={"User-Agent": "SONARA-V6-Guard/1.0"})
        with opener.open(request, timeout=35) as response:
            payload = response.read(260001)
        if len(payload) >= 260001 or git_blob(payload) != expected:
            raise Blocked("Pinned GitHub source hash does not match: " + name)
        compile(payload, name, "exec")
        files[name] = payload
    return files


def verify_current_files():
    for name in BLOBS:
        path = ROOT / name
        if not path.is_file() and name == "sonara_remix_pro_v6.py":
            continue
        if not path.is_file() or git_blob(path.read_bytes()) not in KNOWN_OLD[name]:
            raise Blocked("Unknown local modifications; refusing to replace " + name)


def start_worker(mode):
    if mode not in ("required", "none"):
        raise Blocked("Unknown worker auth mode")
    LOG.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with LOG.open("ab") as handle:
        worker = subprocess.Popen([str(PYTHON), str(AGENT), "--auth-mode", mode],
                                  cwd=ROOT, stdin=subprocess.DEVNULL,
                                  stdout=handle, stderr=subprocess.STDOUT,
                                  start_new_session=True)
    return worker.pid


def activate():
    if not (ROOT.is_dir() and PYTHON.is_file() and TOKEN.is_file()):
        raise Blocked("Existing isolated MoLab V6 runtime or credential is missing")
    workers = live_workers()
    if len(workers) > 1:
        raise Blocked("Multiple V6 workers detected; no unsafe handoff")
    mode = mode_for(workers[0]) if workers else "required"
    if workers and not safe_idle(workers[0]):
        raise Blocked("Existing Remix Pro worker has a job, an unknown state or stale heartbeat")
    verify_current_files()
    # Download and inspect everything BEFORE stopping the existing V5 worker.
    payloads = download_verified()
    if workers and not safe_idle(workers[0]):
        raise Blocked("Worker claimed a job during preparation; no handoff")
    original = {name:(ROOT / name).read_bytes() if (ROOT / name).is_file() else None
                for name in BLOBS}
    stopped = False
    installed = False
    try:
        if workers:
            os.kill(workers[0], signal.SIGTERM)
            for _ in range(30):
                if workers[0] not in live_workers():
                    break
                time.sleep(1)
            if workers[0] in live_workers():
                raise Blocked("Old worker did not exit cleanly; no files modified")
            stopped = True
        # Mark installation active before the first write: partial writes
        # must also roll back, never leave a mixed V5/V6 Python environment.
        installed = True
        for name, raw in payloads.items():
            path = ROOT / name
            with tempfile.NamedTemporaryFile(dir=ROOT, prefix=".sonara-v6-", delete=False) as handle:
                temp = Path(handle.name)
                handle.write(raw)
            temp.chmod(0o600)
            temp.replace(path)
        check = subprocess.run([str(PYTHON), str(AGENT), "--auth-mode", mode, "--preflight"],
                               cwd=ROOT, text=True, capture_output=True, timeout=150)
        if check.returncode or "PRO_AGENT_AUTHENTICATED=True" not in check.stdout or "PRO_V6_AVAILABLE=True" not in check.stdout:
            raise Blocked("V6 GPU preflight not confirmed; rolling back safely")
        worker_pid = start_worker(mode)
        time.sleep(5)
        if worker_pid not in live_workers():
            raise Blocked("V6 agent exited immediately; rolling back")
        print("SONARA_REMIX_PRO_EXPLOSIVE_INSTALLED=True")
        print("PRO_V6_AUTHENTICATED=True")
        print("PRO_V6_WORKER_PID=" + str(worker_pid))
        print("SONARA_MAIN_ACE_STEP_UNCHANGED=True")
        print("NO_AUDIO_JOB_CREATED_BY_INSTALLER=True")
    except Exception:
        if installed:
            for name, raw in original.items():
                path = ROOT / name
                if raw is None:
                    path.unlink(missing_ok=True)
                else:
                    path.write_bytes(raw)
                    path.chmod(0o600)
        if stopped:
            start_worker(mode)
        raise


def main(argv=None):
    parser = argparse.ArgumentParser(description="Guarded isolated SONARA Remix Pro V6 GPU handoff")
    parser.add_argument("--activate", action="store_true")
    parser.add_argument("--confirm-maintenance", action="store_true")
    args = parser.parse_args(argv)
    if not (args.activate and args.confirm_maintenance):
        print("SONARA_V6_INSTALLER=READ_ONLY")
        print("PINNED_SOURCE_REVISION=" + PINNED_COMMIT)
        print("Use --activate --confirm-maintenance only while the old V5 GPU worker is idle.")
        return
    activate()


if __name__=="__main__":
    try:
        main()
    except (OSError, Blocked, subprocess.SubprocessError) as error:
        print("SONARA_V6_BLOCKED=" + type(error).__name__)
        sys.exit(1)
