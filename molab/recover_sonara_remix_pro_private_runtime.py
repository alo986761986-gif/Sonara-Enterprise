"""SONARA Remix Pro private runtime recovery for RTX PRO 6000.

Only fixes the missing isolated /marimo/SONARA-REMIX-PRO/.venv and optionally
restores an EXISTING previously authorized relay token from a trusted local
location. Does NOT modify the main ACE-Step, relay, Cloudflare, music queue,
private sources, or existing model weights. Never generates or submits jobs.
Do not run when another Remix Pro agent is alive. Python 3.12 is installed
privately by uv; current notebook Python may be 3.13.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path("/marimo/SONARA-REMIX-PRO")
VENV = ROOT / ".venv"
PYTHON = VENV / "bin/python"
TOKEN = Path.home() / ".sonara/relay.token"
STATUS = Path.home() / ".sonara/remix-pro-agent-status.json"
AGENT = ROOT / "sonara_remix_pro_r2_agent.py"
REQUIRED = (
    "sonara_remix_pro_toolkit.py",
    "sonara_remix_pro_quality.py",
    "sonara_remix_pro_fusion.py",
    "sonara_remix_pro_ace_bridge.py",
    "sonara_remix_pro_r2_agent.py",
)
# Public SHA-256 fingerprints of authorized relay tokens; NEVER the tokens.
FINGERPRINTS = frozenset((
    "a058ffd703147e0af0ea029433e760493c3d2df201b12711a51db3f5e54457e5",
    "1ad0e0c896891c4f684e7e458767940db5842b29250f49c62045a959bae74e06",
    "5a101ae1e78d1e6e1327d058cfc1550c107ad351f19c1c6a5087dc4bede73a1f",
    "e674e2804708ad325b2fcf1dbee4befbe4a806f29e2064acaaeb7c5d17bf9d28",
))
KNOWN_ALTERNATE_TOKENS = (
    Path("/marimo/.sonara/relay.token"),
    Path("/home/marimo/.sonara/relay.token"),
    Path("/marimo/SONARA-REMIX-PRO/.sonara/relay.token"),
)
PACKAGES = (
    "demucs==4.1.0",
    "librosa==0.11.0",
    "soundfile==0.13.1",
    "numpy>=1.26,<3",
    "scipy>=1.14,<2",
)

class RecoverError(RuntimeError):
    pass

def ensure(condition, message):
    if not condition:
        raise RecoverError(message)

def restricted_gpu():
    try:
        p = subprocess.run([
            "nvidia-smi", "--query-gpu=name,compute_cap",
            "--format=csv,noheader,nounits",
        ], capture_output=True, text=True, timeout=15, check=True)
        return any("RTX PRO 6000" in row and
                   any(c.strip() in ("12.0", "12") for c in row.split(",")[1:])
                   for row in p.stdout.splitlines())
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired):
        return False

def private_agent_processes():
    count = 0
    try:
        children = Path("/proc").iterdir()
        for child in children:
            if not child.name.isdigit():
                continue
            try:
                arguments = (child/"cmdline").read_bytes().split(b"\0")
                cwd = (child/"cwd").resolve(strict=True)
                for arg in arguments[1:]:
                    if not arg:
                        continue
                    candidate = Path(os.fsdecode(arg))
                    candidate = candidate if candidate.is_absolute() else cwd/candidate
                    if candidate.resolve(strict=True) == AGENT.resolve(strict=True):
                        count += 1
                        break
            except (OSError, ValueError):
                continue
    except OSError as exc:
        raise RecoverError("Cannot inspect processes safely") from exc
    return count

def token_is_authorized(value):
    if not isinstance(value, str) or not 32 <= len(value) <= 512:
        return False
    if not value.isascii() or any(x.isspace() for x in value):
        return False
    return hashlib.sha256(value.encode("utf-8")).hexdigest() in FINGERPRINTS

def candidates():
    if TOKEN.is_file():
        try:
            content = TOKEN.read_text(encoding="utf-8").strip()
            if token_is_authorized(content):
                return True, None, None
        except (OSError, UnicodeError):
            pass
        raise RecoverError("Existing private token is not recognized: do not overwrite")
    for path in KNOWN_ALTERNATE_TOKENS:
        if path == TOKEN:
            continue
        try:
            if path.is_file() and not path.is_symlink():
                value = path.read_text(encoding="utf-8").strip()
                if token_is_authorized(value):
                    return False, path, value
        except (OSError, UnicodeError):
            pass
    for name in ("SONARA_RELAY_TOKEN", "SONARA_PRO_RELAY_TOKEN"):
        value = os.environ.get(name)
        if token_is_authorized(value):
            return False, "authorized environment", value
    return False, None, None

def copy_authorized_token(value):
    ensure(not TOKEN.exists(), "Refusing to overwrite existing relay token")
    ensure(token_is_authorized(value), "Unrecognized relay credential")
    TOKEN.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(TOKEN.parent, 0o700)
    # Create-only and 0600, not a symlink. Never print secret.
    fd = os.open(TOKEN, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as out:
            out.write(value + "\n")
    except BaseException:
        TOKEN.unlink(missing_ok=True)
        raise

def isolated_venv_present():
    return PYTHON.is_file() and (VENV/"pyvenv.cfg").is_file()

def run_checked(args, *, timeout=900):
    command = [str(x) for x in args]
    # Do not pass any secret as an argument.
    subprocess.run(command, cwd=str(ROOT), check=True, timeout=timeout)

def python_inspect():
    script = """
import importlib.metadata as metadata
import sys
import torch
assert sys.version_info[:2] == (3, 12), sys.version
assert metadata.version('demucs') == '4.1.0'
assert torch.__version__.startswith('2.9.1+cu128'), torch.__version__
assert torch.version.cuda == '12.8', torch.version.cuda
assert torch.cuda.is_available()
assert tuple(torch.cuda.get_device_capability(0)) == (12,0)
assert 'sm_120' in torch.cuda.get_arch_list()
import torchaudio, librosa, soundfile, scipy, numpy
print('SONARA_PRIVATE_CUDA_SM120_READY=True')
print('SONARA_PRIVATE_AUDIO_DEPENDENCIES_READY=True')
"""
    run_checked((PYTHON, "-c", script), timeout=100)

def check_host():
    ensure(ROOT.is_dir() and not ROOT.is_symlink(), "Unexpected private Remix Pro root")
    ensure(all((ROOT/f).is_file() for f in REQUIRED), "Essential Remix Pro Python modules missing")
    ensure(restricted_gpu(), "Not an RTX PRO 6000 sm_120 notebook; no changes")
    ensure(private_agent_processes() == 0, "A dedicated Remix Pro agent is alive; refuse recovery")
    # Avoid modifying this runtime while another process appears to hold its lock.
    ensure(shutil.disk_usage(ROOT).free >= 20 * (1024**3),
           "Less than 20 GiB available for isolated CUDA wheels")
    ensure(shutil.which("uv"), "uv package manager missing")
    return True

def restore_venv():
    if VENV.exists() and not isolated_venv_present():
        raise RecoverError(
            "Private .venv exists but is incomplete; do not overwrite: inspect and back up manually"
        )
    if not VENV.exists():
        run_checked(("uv", "venv", "--python", "3.12", "--seed", str(VENV)), timeout=500)
    ensure(isolated_venv_present(), "Private Python venv could not be verified")
    # Constrain exact architecture via official CUDA 12.8 wheels in this venv only.
    run_checked(("uv", "pip", "install", "--python", str(PYTHON),
                 "--index-url", "https://download.pytorch.org/whl/cu128",
                 "torch==2.9.1", "torchaudio==2.9.1"), timeout=2400)
    run_checked(("uv", "pip", "install", "--python", str(PYTHON), *PACKAGES), timeout=1400)
    python_inspect()
    print("SONARA_REMIX_ISOLATED_VENV_REPAIRED=True")
    print("SONARA_MAIN_ACE_STEP_UNMODIFIED=True")

def main(argv=None):
    parser = argparse.ArgumentParser(description="Recover isolated Remix Pro runtime without ACE-Step changes")
    parser.add_argument("--recover-venv", action="store_true",
                        help="Only recreate the missing private venv and deps")
    parser.add_argument("--restore-known-token", action="store_true",
                        help="Restore a previously authorized token from local known paths")
    args = parser.parse_args(argv)
    print("SONARA_RUNTIME_RECOVERY=PRIVATE_ONLY", flush=True)
    check_host()
    authorized, candidate, value = candidates()
    print("SONARA_EXISTING_TOKEN_AUTHORIZED=" + str(authorized), flush=True)
    print("SONARA_AUTHORIZED_TOKEN_RECOVERABLE=" + str(candidate is not None), flush=True)
    print("SONARA_PRIVATE_VENV_PRESENT=" + str(isolated_venv_present()), flush=True)
    if args.recover_venv:
        restore_venv()
    if args.restore_known_token and not authorized:
        ensure(candidate is not None, "No known authorized private token found; Cloudflare pairing required")
        copy_authorized_token(value)
        print("SONARA_AUTHORIZED_TOKEN_RESTORED=True")
    print("SONARA_PRIVATE_VENV_READY=" + str(isolated_venv_present()), flush=True)
    print("SONARA_RELAY_TOKEN_READY=" + str(TOKEN.is_file() and
          token_is_authorized(TOKEN.read_text(encoding="utf-8").strip()) if TOKEN.is_file() else False), flush=True)
    print("SONARA_AGENT_NOT_STARTED=True")
    print("SONARA_AUDIO_JOBS_CREATED=0")
    print("SONARA_MAIN_RELAY_UNMODIFIED=True")
    print("SONARA_NO_SECRET_DISPLAY=True")
    if not (args.recover_venv or args.restore_known_token):
        print("SONARA_NEXT_ACTION=RUN_WITH_RECOVER_VENV_AND_RESTORE_KNOWN_TOKEN_IF_FOUND")

if __name__ == "__main__":
    try:
        main()
    except (RecoverError, OSError, subprocess.CalledProcessError,
            subprocess.TimeoutExpired) as exc:
        print("SONARA_PRIVATE_RUNTIME_RECOVERY=BLOCKED", flush=True)
        print("SONARA_REASON=" + type(exc).__name__, flush=True)
        if isinstance(exc, RecoverError):
            print("SONARA_REASON_DETAIL=" + str(exc), flush=True)
        raise SystemExit(1)
