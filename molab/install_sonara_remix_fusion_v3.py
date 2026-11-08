"""Fail-closed, pinned installation of the isolated SONARA Remix Pro V3 modules.

Run in a MoLab code cell under the isolated private Remix Pro venv.
Does not start/stop ACE-Step, manipulate the main relay, touch Cloudflare,
run customer jobs, expose secrets, or restart a running Pro agent.

This one-time installer stages verified GitHub blobs, backs up original code,
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
PINNED_COMMIT = "f56de2fa63385570082e7b4e2f070c0ca711e3b1"
EXPECTED = {
    "sonara_remix_pro_fusion.py": "7a2b5b94b01dbc5f50f49b4ad4a387242caec974",
    "sonara_remix_pro_ace_bridge.py": "649fffef1858dc9f55ea62efc51f8f7ed5429656",
    "sonara_remix_pro_r2_agent.py": "a60d15052c64a573b729136b679a6659e8b7078e",
    "sonara_remix_pro_live_qa.py": "e214c53dd9c2a02fe9dfd912d1ab93ac11753413",
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


def main():
    p = argparse.ArgumentParser(description="Install isolated, pinned SONARA two-reference fusion V3")
    p.add_argument("--install", action="store_true", help="Apply after inspecting the preflight and receiving verified modules")
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
        print("SONARA_FUSION_INSTALLER=V3_PINNED")
        print("SONARA_PINNED_COMMIT=" + PINNED_COMMIT)
        print("SONARA_MAIN_ACE_STEP_UNTOUCHED=True")
        print("SONARA_MAIN_RELAY_UNTOUCHED=True")
        print("SONARA_PRO_AGENT_NOT_RUNNING=True")
        if not args.install:
            print("SONARA_INSTALLATION_PERFORMED=False")
            print("SONARA_NEXT_ACTION=RUN_WITH_INSTALL_FLAG")
            return
        new_contents = {n: receive_file(n, sha) for n, sha in EXPECTED.items()}
        backups = ROOT / "backups" / ("fusion-v3-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
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
                fd, tmp = tempfile.mkstemp(prefix=".sonara-v3-", dir=str(ROOT))
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
        print("SONARA_FUSION_V3_MODULES_VERIFIED=" + str(len(EXPECTED)))
        print("SONARA_FUSION_BACKUP_PATH=" + str(backups))
        print("SONARA_INSTALL_RESULT=SUCCESS")
        print("SONARA_GPU_GENERATION_NOT_STARTED=True")
        print("SONARA_NEXT_ACTION=PRIVATE_REAL_A_B_GPU_QA")


if __name__ == "__main__":
    main()
