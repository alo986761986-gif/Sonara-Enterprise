"""Stage a reviewed SONARA MoLab relay agent without interrupting the running one.

No network requests, no secrets, no service restart, and no replacement of the
active file. The operator supplies the existing and candidate agent paths.
"""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import py_compile
import shutil
import tempfile
import time


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def stage_agent(current_path: str | Path, candidate_path: str | Path,
                staging_dir: str | Path) -> dict:
    current = Path(current_path).expanduser().resolve(strict=True)
    candidate = Path(candidate_path).expanduser().resolve(strict=True)
    directory = Path(staging_dir).expanduser().resolve()

    if not current.is_file() or not candidate.is_file():
        raise ValueError("Both agent inputs must be regular files")
    if current == candidate or directory in (current, candidate):
        raise ValueError("Current and candidate agent paths must differ")
    if directory.is_symlink():
        raise ValueError("Staging directory must not be a symlink")
    if not candidate.read_bytes().startswith(b'"""MoLab-only ACE-Step relay.'):
        raise ValueError("Candidate does not match the standalone SONARA relay agent")

    # Verify the candidate without importing or executing its code.
    # Never compile the active agent; its original bytes must remain untouched.
    with tempfile.TemporaryDirectory(prefix="sonara-compile-") as tmp:
        py_compile.compile(str(candidate), cfile=str(Path(tmp) / "candidate.pyc"), doraise=True)

    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    old_digest = sha256(current)
    new_digest = sha256(candidate)
    stamp = str(time.time_ns())
    backup = directory / f"backup-{stamp}-{old_digest[:12]}.py"
    staged = directory / f"candidate-{stamp}-{new_digest[:12]}.py"
    for source, destination in ((current, backup), (candidate, staged)):
        # Exclusive creation avoids overwriting another run's backup.
        with source.open("rb") as reader, destination.open("xb") as writer:
            os.chmod(destination, 0o600)
            shutil.copyfileobj(reader, writer)
    if sha256(current) != old_digest or sha256(backup) != old_digest or sha256(staged) != new_digest:
        raise RuntimeError("Agent staging checksum mismatch")
    return {
        "ready_for_manual_review": True,
        "active_agent_unchanged": True,
        "current_sha256": old_digest,
        "candidate_sha256": new_digest,
        "backup_file": str(backup),
        "staged_file": str(staged),
        "restarted": False,
    }


if __name__ == "__main__":
    import json

    parser = argparse.ArgumentParser(description="Safely stage SONARA MoLab agent without restart")
    parser.add_argument("--current", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--staging-dir", required=True)
    args = parser.parse_args()
    print(json.dumps(stage_agent(args.current, args.candidate, args.staging_dir), indent=2))
