"""Fail-closed, pinned installation of the isolated SONARA Remix Pro V4 quality modules.

Run in a MoLab code cell under the isolated private Remix Pro venv.
Does not start/stop ACE-Step, manipulate the main relay, touch Cloudflare,
run customer jobs, expose secrets, or restart a running Pro agent.

This one-time installer stages 5 verified immutable GitHub blobs, backs up original code,
and atomically installs only the isolated Remix Pro Python files. It refuses
to write when the existing dedicated Pro agent holds its lock.
"""
from __future__ import annotations
import argparse
import ast
import fcntl
import hashlib
import os
from pathlib import Path
import shutil
import tempfile
import urllib.request
from datetime import datetime, timezone
import sys

ROOT = Path("/marimo/SONARA-REMIX-PRO")
VENV_PYTHON = ROOT / ".venv/bin/python"
AGENT_LOCK = Path.home() / ".sonara/remix-pro-agent.lock"
PINNED_COMMIT = "c61899ed18ed8d2569f4f034c46bc0182643acb1"
EXPECTED = {
    "sonara_remix_pro_fusion.py": "4ceb90293e1d9f9b9f1c7b0916258eae1c2a3f04",
    "sonara_remix_pro_ace_bridge.py": "44d3ce740dac906481c9ecb8755a8318901f8b7f",
    "sonara_remix_pro_r2_agent.py": "fc3eaf66588ed75bf106ea93f722b8df4754039c",
    "sonara_remix_pro_quality.py": "20781b8960601df72a3fa0daf6703bc8669f190b",
    "sonara_remix_pro_toolkit.py": "4ca1f094839f8372a5fd9c3ee8462e5470a9100d",
}
URL_ROOT = (
    "https://raw.githubusercontent.com/alo986761986-gif/"
    "Sonara-Enterprise/" + PINNED_COMMIT + "/molab/"
)


def fail(message):
    raise RuntimeError(message)


def git_blob_sha(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def receive_file(name, expected):
    with urllib.request.urlopen(URL_ROOT + name, timeout=35) as response:
        data = response.read(200000)
    if not data or len(data) >= 200000 or git_blob_sha(data) != expected:
        fail("Pinned GitHub source verification failed: " + name)
    text = data.decode("utf-8")
    ast.parse(text, filename=name)
    compile(text, name, "exec")
    return data



def active_pro_agent_pids(proc_root=Path("/proc")):
    """Detect actual dedicated Remix Pro processes even if the lock is absent.

    This is a second independent safety guard; it does not send signals or
    inspect customer payloads. If process enumeration is unavailable, refuse.
    """
    agent = (ROOT / "sonara_remix_pro_r2_agent.py").resolve()
    try:
        entries = list(proc_root.iterdir())
    except OSError:
        fail("Cannot inspect running processes safely")
    found = []
    for entry in entries:
        if not entry.name.isdigit():
            continue
        try:
            argv = (entry / "cmdline").read_bytes().split(bytes([0]))
            cwd = (entry / "cwd").resolve()
        except (OSError, RuntimeError):
            continue
        for raw in argv[1:]:
            if not raw or b"sonara_remix_pro_r2_agent.py" not in raw:
                continue
            try:
                path = Path(os.fsdecode(raw))
                candidate = (path if path.is_absolute() else cwd / path).resolve()
            except (OSError, ValueError, RuntimeError):
                continue
            if candidate == agent:
                found.append(int(entry.name))
                break
    return found


def main():
    p = argparse.ArgumentParser(description="Install isolated, pinned SONARA V4 quality modules")
    p.add_argument("--install", action="store_true", help="Install ONLY if the dedicated Pro agent is stopped; backup first")
    args = p.parse_args()
    if Path(sys.executable).resolve() != VENV_PYTHON.resolve():
        fail("Use only /marimo/SONARA-REMIX-PRO/.venv/bin/python")
    if not ROOT.is_dir() or not VENV_PYTHON.is_file():
        fail("Remix Pro isolated environment is not present")
    if not (ROOT / "sonara_remix_pro_toolkit.py").is_file():
        fail("Existing Remix Pro toolkit missing")
    for n in ("sonara_remix_pro_quality.py", "sonara_remix_pro_toolkit.py"):
        if not (ROOT / n).is_file():
            fail("Existing, preserved dependency missing: " + n)
    AGENT_LOCK.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with AGENT_LOCK.open("a+") as lock:
        os.chmod(AGENT_LOCK, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            fail("Active Remix Pro agent holds lock: do not modify while processing jobs")
        # An idle dedicated worker is still a running process: never replace its
        # imported modules while it is online, even if its lock was lost.
        if active_pro_agent_pids():
            fail("Dedicated Remix Pro agent is still running: safe handoff required")
        print("SONARA_FUSION_INSTALLER=V4_PINNED")
        print("SONARA_PINNED_COMMIT=" + PINNED_COMMIT)
        print("SONARA_MAIN_ACE_STEP_UNTOUCHED=True")
        print("SONARA_MAIN_RELAY_UNTOUCHED=True")
        print("SONARA_PRO_AGENT_EXCLUSIVE_LOCK_ACQUIRED=True")
        if not args.install:
            print("SONARA_INSTALLATION_PERFORMED=False")
            print("SONARA_NEXT_ACTION=RUN_WITH_INSTALL_FLAG")
            return
        new_contents = {n: receive_file(n, sha) for n, sha in EXPECTED.items()}
        backups = ROOT / "backups" / ("fusion-v4-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
        if backups.exists():
            fail("Backup directory already exists")
        backups.mkdir(mode=0o700, parents=True)
        touched = []
        staged = []
        try:
            for n in EXPECTED:
                existing = ROOT / n
                if existing.is_symlink():
                    fail("Symlink module is not accepted: " + n)
                if existing.exists():
                    shutil.copy2(existing, backups / n)
                    os.chmod(backups / n, 0o600)
            for n, data in new_contents.items():
                fd, tmp = tempfile.mkstemp(prefix=".sonara-v4-", dir=str(ROOT))
                staged.append(Path(tmp))
                with os.fdopen(fd, "wb") as handle:
                    handle.write(data)
                    handle.flush()
                    os.fsync(handle.fileno())
                os.chmod(tmp, 0o600)
                os.replace(tmp, ROOT / n)
                touched.append(n)
            for n, expected in EXPECTED.items():
                if git_blob_sha((ROOT / n).read_bytes()) != expected:
                    fail("Installed file hash mismatch: " + n)
        except BaseException:
            for n in reversed(touched):
                previous = backups / n
                target = ROOT / n
                if previous.exists():
                    shutil.copy2(previous, target)
                else:
                    target.unlink(missing_ok=True)
            raise
        finally:
            for x in staged:
                x.unlink(missing_ok=True)
        print("SONARA_FUSION_V4_MODULES_VERIFIED=" + str(len(EXPECTED)))
        print("SONARA_FUSION_BACKUP_PATH=" + str(backups))
        print("SONARA_INSTALL_RESULT=SUCCESS")
        print("SONARA_GPU_GENERATION_NOT_STARTED=True")
        print("SONARA_NEXT_ACTION=RUN_PRIVATE_REAL_A_B_GPU_QA_BEFORE_DEPLOY")


if __name__ == "__main__":
    main()
