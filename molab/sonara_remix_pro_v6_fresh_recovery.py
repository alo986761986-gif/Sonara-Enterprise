#!/usr/bin/env python3
"""Recover SONARA Remix Pro V6 in a *new* isolated MoLab RTX PRO 6000 notebook.

The ACE-Step XL Turbo/LM 4B engine and main relay must already be healthy.
This script never modifies, stops or restarts either one. It does not create
customer music jobs. All SONARA files are pinned to a known verified commit.
No existing unrecognized module, user audio or credentials are overwritten.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.request

ROOT = Path("/marimo/SONARA-REMIX-PRO")
PYTHON = ROOT / ".venv/bin/python"
HOME = Path.home() / ".sonara"
TOKEN = HOME / "relay.token"
STATUS = HOME / "remix-pro-agent-status.json"
LOG = HOME / "remix-pro-v6-agent.log"
API = "http://127.0.0.1:8001/health"
CAPABILITIES = "https://api.sonaraenterprise.com/api/sonara-relay/pro-capabilities"
REVISION = "837088d6bc9e02be9694e119a80985c666193b3f"
SOURCE = (
    "https://raw.githubusercontent.com/"
    "alo986761986-gif/Sonara-Enterprise/" + REVISION + "/molab/"
)
BLOBS = {
    "sonara_remix_pro_toolkit.py": "4ca1f094839f8372a5fd9c3ee8462e5470a9100d",
    "sonara_remix_pro_ace_bridge.py": "d946a5de652bbb7ce6365c0edaa9f496cca408ef",
    "sonara_remix_pro_quality.py": "d31e42a4ba52e15fee08436f997f95b0b7561054",
    "sonara_remix_pro_fusion.py": "dad0b477a3dfb02761c971f05db849945ab39f56",
    "sonara_remix_pro_v5.py": "7f88b399798dbbd815decf07867ed276c5ca3860",
    "sonara_remix_pro_v6.py": "535c9e30ad04ed950c4f615639d078f7f823435c",
    "sonara_remix_pro_r2_agent.py": "25327ad052be63c1f86450afb56c478b1a43f528",
    "sonara_remix_pro_gpu_setup.py": "e3e1b9bf461b357602d2aee87b638dda663e59b8",
}
PRO_REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"


class RecoveryBlocked(Exception):
    pass


def git_blob(content: bytes) -> str:
    return hashlib.sha1(
        b"blob " + str(len(content)).encode("ascii") + b"\0" + content
    ).hexdigest()


def fetch_verified() -> dict[str, bytes]:
    data = {}
    for name, expected in BLOBS.items():
        request = urllib.request.Request(
            SOURCE + name, headers={"User-Agent": "SONARA-Pro-V6-Fresh-Restore/1.0"}
        )
        with urllib.request.urlopen(request, timeout=50) as response:
            raw = response.read(350001)
        if len(raw) > 350000 or git_blob(raw) != expected:
            raise RecoveryBlocked("Pinned source integrity mismatch: " + name)
        compile(raw, name, "exec")
        data[name] = raw
    return data


def run(argv, *, timeout=900, cwd=None):
    return subprocess.run(
        [str(arg) for arg in argv],
        check=True, timeout=timeout, cwd=cwd, text=True,
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )


def check_gpu():
    result = run([
        "nvidia-smi", "--query-gpu=name,compute_cap,memory.free",
        "--format=csv,noheader,nounits",
    ], timeout=20)
    first = result.stdout.splitlines()[0].split(",")
    if len(first) != 3 or "RTX PRO 6000" not in first[0]:
        raise RecoveryBlocked("RTX PRO 6000 Blackwell is not present")
    if float(first[1]) != 12.0:
        raise RecoveryBlocked("Expected compute capability 12.0 (sm_120)")
    free_mib = float(first[2])
    if free_mib < 12000:
        raise RecoveryBlocked("GPU is busy or has less than 12 GiB free; no install")
    print("SONARA_GPU=" + first[0].strip(), flush=True)
    print("SONARA_GPU_FREE_MIB=" + str(round(free_mib)), flush=True)


def check_main_engine():
    request = urllib.request.Request(API, headers={"Accept": "application/json"})
    with urllib.request.urlopen(request, timeout=10) as response:
        health = json.load(response)
    if not isinstance(health, dict):
        raise RecoveryBlocked("ACE-Step API health is unreadable")
    if not health.get("models_initialized") or not health.get("llm_initialized"):
        raise RecoveryBlocked("ACE-Step XL Turbo or LM 4B not initialized")
    if health.get("loaded_model") != "acestep-v15-xl-turbo":
        raise RecoveryBlocked("Different ACE-Step main model; refusing recovery")
    if health.get("loaded_lm_model") != "acestep-5Hz-lm-4B":
        raise RecoveryBlocked("Different ACE-Step LM; refusing recovery")
    print("SONARA_MAIN_ACE_STEP_READY=True", flush=True)


def check_token():
    if TOKEN.is_symlink() or not TOKEN.is_file():
        raise RecoveryBlocked("Existing private ~/.sonara/relay.token missing")
    token = TOKEN.read_text(encoding="utf-8").strip()
    if not (32 <= len(token) <= 512) or not token.isascii() or any(c.isspace() for c in token):
        raise RecoveryBlocked("Invalid private relay token")
    # Do not print, copy, rotate or persist the credential here.
    print("SONARA_EXISTING_PRIVATE_TOKEN_PRESENT=True", flush=True)


def pro_processes() -> list[int]:
    proc = Path("/proc")
    if not proc.is_dir():
        raise RecoveryBlocked("Cannot verify existing worker processes")
    found = []
    for item in proc.iterdir():
        if not item.name.isdigit():
            continue
        try:
            args = (item / "cmdline").read_bytes().split(b"\0")
            if any(b"sonara_remix_pro_r2_agent.py" in arg for arg in args[1:]):
                found.append(int(item.name))
        except (OSError, ValueError):
            continue
    return found


def prepare_root(files: dict[str, bytes]):
    if ROOT.is_symlink():
        raise RecoveryBlocked("Private Remix Pro root is a symlink")
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    for name, content in files.items():
        destination = ROOT / name
        if destination.is_symlink():
            raise RecoveryBlocked("Unexpected local module symlink: " + name)
        if destination.exists() and git_blob(destination.read_bytes()) != BLOBS[name]:
            raise RecoveryBlocked(
                "Local Remix Pro module has unknown changes; refusing overwrite: " + name
            )
    for name, content in files.items():
        destination = ROOT / name
        if not destination.is_file():
            exclusive = os.O_WRONLY | os.O_CREAT | os.O_EXCL
            descriptor = os.open(str(destination), exclusive, 0o600)
            with os.fdopen(descriptor, "wb") as handle:
                handle.write(content)
    print("SONARA_PRO_PINNED_MODULES_VERIFIED=" + str(len(files)), flush=True)


def prepare_venv():
    uv = shutil.which("uv") or "/usr/local/bin/uv"
    if not Path(uv).is_file():
        raise RecoveryBlocked("uv binary unavailable on MoLab")
    if (ROOT / ".venv").is_symlink():
        raise RecoveryBlocked("Isolated virtual environment is a symlink")
    if not PYTHON.is_file():
        if (ROOT / ".venv").exists():
            raise RecoveryBlocked("Incomplete existing private venv; refusing overwrite")
        run([uv, "venv", str(ROOT / ".venv"), "--python", "3.12", "--seed"], timeout=180)
    if not PYTHON.is_file():
        raise RecoveryBlocked("Isolated Python environment creation failed")
    result = run([PYTHON, "-c", "import sys; print(sys.version.split()[0])"], timeout=30)
    print("SONARA_PRO_PRIVATE_PYTHON=" + result.stdout.strip(), flush=True)


def install_packages():
    # Official pinned setup checks native sm_120 torch and Demucs 4.1.0.
    # It operates ONLY inside /marimo/SONARA-REMIX-PRO/.venv.
    uv = shutil.which("uv") or "/usr/local/bin/uv"
    checks = (
        "import importlib.metadata as m; import numpy, librosa, scipy, "
        "soundfile, pyloudnorm; import torch; "
        "assert m.version('demucs')=='4.1.0'; "
        "assert torch.__version__.startswith('2.9.1+cu128')"
    )
    healthy = subprocess.run(
        [str(PYTHON), "-c", checks], cwd=ROOT,
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=40,
    ).returncode == 0
    if not healthy:
        if shutil.disk_usage(ROOT).free < 12 * 1024**3:
            raise RecoveryBlocked("Not enough free disk for the private Pro GPU runtime")
        print("SONARA_PRO_PRIVATE_DEPENDENCIES_INSTALL=START", flush=True)
        # Use the official installer to keep torch 2.9.1+cu128 and Demucs
        # 4.1.0 independent from the main ACE-Step environment.
        result = run(
            [PYTHON, ROOT / "sonara_remix_pro_gpu_setup.py", "--install"],
            timeout=2200, cwd=ROOT,
        )
        # Important: installer includes CUDA kernel verification.
        if "GPU_KERNEL_TEST_OK=True" not in result.stdout:
            raise RecoveryBlocked("Private CUDA GPU verification did not succeed")
        print("SONARA_PRO_PRIVATE_CUDA_VERIFIED=True", flush=True)
        # Install the actual audio-processing libraries. Do not touch main venv.
        run([
            uv, "pip", "install", "--python", PYTHON,
            "librosa==0.11.0", "pyloudnorm==0.1.1",
            "soundfile==0.13.1", "scipy>=1.13,<1.18",
            "numpy>=1.26,<2.3"
        ], timeout=1000, cwd=ROOT)
    # Guard against silent resolver changes to the verified CUDA packages.
    run([PYTHON, "-c", checks], timeout=90, cwd=ROOT)
    print("SONARA_PRO_PRIVATE_AUDIO_LIBS_READY=True", flush=True)


def verify_ready():
    if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
        raise RecoveryBlocked("FFmpeg and FFprobe are required for music/video inputs")
    imports = (
        "import sonara_remix_pro_toolkit, sonara_remix_pro_quality, "
        "sonara_remix_pro_fusion, sonara_remix_pro_v5, "
        "sonara_remix_pro_v6, sonara_remix_pro_ace_bridge"
    )
    run([PYTHON, "-c", imports], timeout=100, cwd=ROOT)
    print("SONARA_PRO_IMPORTS_OK=True", flush=True)
    check = run([
        PYTHON, ROOT / "sonara_remix_pro_r2_agent.py",
        "--auth-mode", "none", "--preflight",
    ], timeout=190, cwd=ROOT)
    # Preflight never submits or claims a customer job.
    for line in check.stdout.splitlines():
        if line.startswith(("PRO_GPU_VERIFIED=", "PRO_AGENT_AUTHENTICATED=",
                            "PRO_V6_AVAILABLE=", "PRO_SITE_GENERATION_AVAILABLE=",
                            "PRO_BILLING_GATE_STILL_REQUIRED=")):
            print(line, flush=True)
    if "PRO_AGENT_AUTHENTICATED=True" not in check.stdout:
        raise RecoveryBlocked("Pro private heartbeat authentication failed")
    if "PRO_V6_AVAILABLE=True" not in check.stdout:
        raise RecoveryBlocked("V6 server capability not confirmed")
    print("SONARA_PRO_PREFLIGHT_SUCCESS=True", flush=True)


def start_worker():
    if pro_processes():
        raise RecoveryBlocked("Another private Remix Pro worker is already running")
    LOG.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with LOG.open("ab") as output:
        worker = subprocess.Popen(
            [str(PYTHON), str(ROOT / "sonara_remix_pro_r2_agent.py"),
             "--auth-mode", "none"],
            cwd=ROOT, stdin=subprocess.DEVNULL,
            stdout=output, stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    deadline = time.monotonic() + 32
    while time.monotonic() < deadline:
        if worker.poll() is not None:
            raise RecoveryBlocked("Private V6 worker exited immediately; inspect private log")
        try:
            request = urllib.request.Request(
                CAPABILITIES, headers={"Accept": "application/json"}
            )
            with urllib.request.urlopen(request, timeout=10) as response:
                data = json.load(response)
            if data.get("v6Available") is True and data.get("available") is True:
                print("SONARA_REMIX_PRO_V6_SITE_AVAILABLE=True", flush=True)
                print("SONARA_REMIX_PRO_WORKER_PID=" + str(worker.pid), flush=True)
                return
        except (OSError, ValueError):
            pass
        time.sleep(3)
    raise RecoveryBlocked(
        "Worker launched but public capability not yet confirmed; inspect private status"
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--activate", action="store_true")
    args = parser.parse_args()
    print("=== SONARA REMIX PRO V6 PRIVATE RESTORE ===", flush=True)
    if pro_processes():
        raise RecoveryBlocked("Existing Pro worker detected; refusing unsafe reinstall")
    check_gpu()
    check_main_engine()
    check_token()
    if not args.activate:
        print("SONARA_RESTORE=READ_ONLY_PREFLIGHT", flush=True)
        return
    sources = fetch_verified()
    prepare_root(sources)
    prepare_venv()
    install_packages()
    verify_ready()
    start_worker()
    print("SONARA_MAIN_ACE_STEP_UNCHANGED=True", flush=True)
    print("NO_CUSTOMER_AUDIO_JOB_CREATED_BY_INSTALLER=True", flush=True)
    print("SONARA_PRO_RESTORE_EXIT=0", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (RecoveryBlocked, subprocess.CalledProcessError,
            subprocess.TimeoutExpired, OSError, ValueError) as exc:
        # Do not expose secrets, audio paths or raw user prompts.
        print("SONARA_PRO_RESTORE_ERROR=" + type(exc).__name__, flush=True)
        if isinstance(exc, RecoveryBlocked):
            print("SONARA_PRO_RESTORE_REASON=" + str(exc), flush=True)
        if isinstance(exc, subprocess.CalledProcessError):
            tail = (exc.stdout or "")[-1400:]
            print("SONARA_PRIVATE_SETUP_OUTPUT_TAIL=" + tail, flush=True)
        sys.exit(1)
