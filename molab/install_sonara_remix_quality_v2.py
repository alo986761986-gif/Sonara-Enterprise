"""Pinned, fail-closed SONARA Remix Pro musical coherence upgrade.

Never stops/starts ACE-Step or SONARA's main relay, never claims or creates a
music job. Must run with no separate Remix Pro agent holding its flock.
"""
from __future__ import annotations

import argparse
import ast
import fcntl
import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path
import shutil
import sys
import tempfile
import urllib.request

ROOT = Path("/marimo/SONARA-REMIX-PRO")
PYTHON = ROOT / ".venv/bin/python"
AGENT_LOCK = Path.home() / ".sonara/remix-pro-agent.lock"
PINNED_COMMIT = "58a0f0ebc149a479c42e36b261bfca869989663f"
EXPECTED = {
    "sonara_remix_pro_fusion.py": "9b74b6a3c891dcb272d8927f6fd7bb64c7833200",
    "sonara_remix_pro_ace_bridge.py": "09f6c3bbff4b8b33bc811dbb37c2add4b7b4db49",
    "sonara_remix_pro_r2_agent.py": "0e3cade1b4f884ce7aefaab9cd02c0514a6fe0f6",
}
URL_ROOT = (
    "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/"
    + PINNED_COMMIT + "/molab/"
)


def git_blob_sha(data):
    return hashlib.sha1(
        b"blob " + str(len(data)).encode("ascii") + b"\0" + data
    ).hexdigest()


def download_pinned(name, expected):
    req = urllib.request.Request(
        URL_ROOT + name, headers={"User-Agent": "SONARA-Remix-QA-V2/1.0"}
    )
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(
        req, timeout=35
    ) as response:
        data = response.read(200_001)
    if not data or len(data) > 200_000 or git_blob_sha(data) != expected:
        raise RuntimeError("V2 integrity check failed: " + name)
    source = data.decode("utf-8")
    ast.parse(source, filename=name)
    compile(source, name, "exec")
    return data


def main(argv=None):
    parser = argparse.ArgumentParser(description="Pinned isolated SONARA Remix Pro quality update")
    parser.add_argument("--install", action="store_true")
    args = parser.parse_args(argv)
    if not ROOT.is_dir() or not PYTHON.is_file():
        raise RuntimeError("Dedicated Remix Pro environment is missing")
    if Path(sys.executable).resolve() != PYTHON.resolve():
        raise RuntimeError("Run only inside the private SONARA Remix Pro venv")
    for preserved in ("sonara_remix_pro_toolkit.py", "sonara_remix_pro_quality.py"):
        if not (ROOT / preserved).is_file():
            raise RuntimeError("Required existing module is missing: " + preserved)
    AGENT_LOCK.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    with AGENT_LOCK.open("a+") as lock:
        os.chmod(AGENT_LOCK, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError(
                "Active Remix Pro GPU worker: no files changed; stop it gracefully only after confirming idle"
            ) from exc
        print("SONARA_REMIX_PRO_QUALITY=V2")
        print("SONARA_PRIVATE_WORKER_IDLE=True")
        print("SONARA_MAIN_ACE_STEP_UNCHANGED=True")
        print("SONARA_MAIN_RELAY_UNCHANGED=True")
        if not args.install:
            print("SONARA_QUALITY_INSTALL_PERFORMED=False")
            print("SONARA_NEXT_ACTION=INSTALL_ONLY_WHEN_PRO_AGENT_CONFIRMED_IDLE")
            return
        # All downloads and syntactic checks are performed BEFORE touching disk.
        staged_bytes = {name: download_pinned(name, sha) for name, sha in EXPECTED.items()}
        old_agent = (ROOT / "sonara_remix_pro_r2_agent.py").read_text(encoding="utf-8")
        if 'REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"' not in old_agent:
            raise RuntimeError("Unknown live Pro revision: refusing incompatible update")
        backups = ROOT / "backups" / (
            "musical-coherence-v2-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        )
        if backups.exists():
            raise RuntimeError("Backup already exists")
        backups.mkdir(parents=True, mode=0o700)
        touched = []
        staged_paths = []
        try:
            for name in EXPECTED:
                source = ROOT / name
                if source.is_symlink() or not source.is_file():
                    raise RuntimeError("Missing or untrusted local module: " + name)
                shutil.copy2(source, backups / name)
                os.chmod(backups / name, 0o600)
            for name, data in staged_bytes.items():
                fd, tmp = tempfile.mkstemp(prefix=".sonara-quality-", dir=ROOT)
                staged_paths.append(Path(tmp))
                with os.fdopen(fd, "wb") as file:
                    file.write(data)
                    file.flush()
                    os.fsync(file.fileno())
                os.chmod(tmp, 0o600)
                os.replace(tmp, ROOT / name)
                touched.append(name)
            for name, expected in EXPECTED.items():
                if git_blob_sha((ROOT / name).read_bytes()) != expected:
                    raise RuntimeError("Post-install integrity failure: " + name)
        except BaseException:
            for name in reversed(touched):
                shutil.copy2(backups / name, ROOT / name)
            raise
        finally:
            for file in staged_paths:
                file.unlink(missing_ok=True)
        print("SONARA_QUALITY_MODULES_INSTALLED=" + str(len(EXPECTED)))
        print("SONARA_QUALITY_BACKUP=" + str(backups))
        print("SONARA_QUALITY_INSTALL_RESULT=SUCCESS")
        print("SONARA_GPU_GENERATION_TEST_RUN=False")
        print("SONARA_PRO_AGENT_RESTARTED=False")


if __name__ == "__main__":
    try:
        main()
    except (OSError, RuntimeError) as exc:
        print("SONARA_QUALITY_INSTALL_RESULT=BLOCKED")
        print("SONARA_QUALITY_FAILURE=" + str(exc))
        raise SystemExit(1)
