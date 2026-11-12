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
import urllib.error
import urllib.request

ROOT = Path("/marimo/SONARA-REMIX-PRO")
PYTHON = ROOT / ".venv/bin/python"
HOME = Path.home() / ".sonara"
TOKEN = HOME / "relay.token"
STATUS = HOME / "remix-pro-agent-status.json"
LOG = HOME / "remix-pro-v6-agent.log"
API = "http://127.0.0.1:8001/health"
CAPABILITIES = "https://api.sonaraenterprise.com/api/sonara-relay/pro-capabilities"
REVISION = "0aac0dc69836113e3896e76f980ef41955ee7e41"
SOURCE = (
    "https://raw.githubusercontent.com/"
    "alo986761986-gif/Sonara-Enterprise/" + REVISION + "/molab/"
)
BLOBS = {
    "sonara_remix_pro_toolkit.py": "4ca1f094839f8372a5fd9c3ee8462e5470a9100d",
    "sonara_remix_pro_ace_bridge.py": "72bdb9b36792127d27340660d2c738c64de6c1f8",
    "sonara_remix_pro_quality.py": "7e4e0f6c608e02063b3bac689b5b35a5b91bbef5",
    "sonara_remix_pro_fusion.py": "073e73b0f418e91bd48e8bfbe084ba6f31cef847",
    "sonara_remix_pro_v5.py": "41eaac9cba28ca34a6e916ec6d79fc820739b4e6",
    "sonara_remix_pro_v6.py": "5de2895488e80ebe46dfee2898888df6680be4a5",
    "sonara_remix_pro_r2_agent.py": "363327ccbe0e2d48f61e5d83be2779440726bdbc",
    "sonara_remix_pro_original_voices.py": "93927ebacb2fcf86ea9397abfd31df1824b4c180",
    "sonara_remix_pro_a_clock_fusion.py": "28a5cdfd3729c68f4a0a93b55b01bb3b0f83a360",
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
    # ACE-Step can wrap the actual model state in a top-level "data" object.
    # The main SONARA relay already accepts both shapes; V6 must do the same.
    health = health.get("data", health)
    if not isinstance(health, dict):
        raise RecoveryBlocked("ACE-Step API health data is unreadable")
    if health.get("models_initialized") is not True or health.get("llm_initialized") is not True:
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
    # Install audio imports BEFORE any Demucs CLI check or GPU smoke test.
    # All changes stay inside the private Remix Pro Python environment.
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
        # Demucs 4.1 may be present even if numpy is missing; its CLI imports
        # numpy before the previous installer got to the audio package step.
        run([
            uv, "pip", "install", "--python", PYTHON,
            "librosa==0.11.0", "pyloudnorm==0.1.1",
            "soundfile==0.13.1", "scipy>=1.13,<1.18",
            "numpy>=1.26,<2.3"
        ], timeout=1000, cwd=ROOT)
        print("SONARA_PRO_PRIVATE_AUDIO_LIBS_BOOTSTRAPPED=True", flush=True)

    # A successful import alone does not prove Demucs GPU inference: always
    # verify CUDA sm_120 and a technical 4-stem inference on fresh restores.
    result = run(
        [PYTHON, ROOT / "sonara_remix_pro_gpu_setup.py", "--install", "--smoke"],
        timeout=2200, cwd=ROOT,
    )
    if "GPU_KERNEL_TEST_OK=True" not in result.stdout:
        raise RecoveryBlocked("Private CUDA GPU verification did not succeed")
    if "DEMUCS_REAL_GPU_INFERENCE_VERIFIED=True" not in result.stdout:
        raise RecoveryBlocked("Real Demucs GPU smoke test did not pass")
    print("SONARA_PRO_PRIVATE_CUDA_VERIFIED=True", flush=True)
    print("SONARA_PRO_HTDEMUCS_GPU_MODEL_READY=True", flush=True)

    # Guard against silent resolver changes to verified CUDA packages.
    run([PYTHON, "-c", checks], timeout=90, cwd=ROOT)
    print("SONARA_PRO_PRIVATE_AUDIO_LIBS_READY=True", flush=True)

def verify_ready():
    if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
        raise RecoveryBlocked("FFmpeg and FFprobe are required for music/video inputs")
    imports = (
        "import sonara_remix_pro_toolkit, sonara_remix_pro_quality, "
        "sonara_remix_pro_fusion, sonara_remix_pro_v5, "
        "sonara_remix_pro_v6, sonara_remix_pro_ace_bridge, "
        "sonara_remix_pro_original_voices, sonara_remix_pro_a_clock_fusion"
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


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def site_capabilities():
    """Match the authenticated V6 agent's Cloudflare request signature."""
    headers = {
        "Accept": "application/json",
        "Cache-Control": "no-cache",
        "User-Agent": "SONARA-Remix-Pro-Agent/1.0 (+https://sonaraenterprise.com)",
        "X-Sonara-Pro-Agent-Revision": PRO_REVISION,
        "X-Sonara-Relay-Token": TOKEN.read_text(encoding="utf-8").strip(),
    }
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}), NoRedirect()
    )
    with opener.open(urllib.request.Request(CAPABILITIES, headers=headers),
                     timeout=10) as response:
        data = json.load(response)
    if not isinstance(data, dict):
        raise RecoveryBlocked("Public Pro capabilities payload is not JSON object")
    return data


def safe_worker_state():
    """Local status is advisory; never print job IDs, credentials or source paths."""
    if STATUS.is_symlink():
        return {}
    try:
        value = json.loads(STATUS.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError, TypeError):
        return {}


def confirm_worker(pid, *, started_at=None, timeout_seconds=35):
    deadline = time.monotonic() + timeout_seconds
    error_code = "NONE"
    caps = {}
    state = {}
    while True:
        if pid not in pro_processes():
            raise RecoveryBlocked("Private Pro worker exited; inspect private log")
        state = safe_worker_state()
        active = (
            state.get("revision") == PRO_REVISION
            and state.get("state") in (
                "waiting_for_authorized_job", "waiting_for_pro_activation",
                "processing"
            )
            and (
                started_at is None
                or float(state.get("updatedAt") or 0) >= started_at
            )
        )
        try:
            caps = site_capabilities()
            error_code = "NONE"
            if (active and caps.get("available") is True
                    and caps.get("v6Available") is True
                    and caps.get("expectedAgentRevision", PRO_REVISION)
                        == PRO_REVISION):
                print("SONARA_REMIX_PRO_WORKER_ALIVE=True", flush=True)
                print("SONARA_PRO_WORKER_STATE=" + str(state["state"]), flush=True)
                print("SONARA_REMIX_PRO_V6_SITE_AVAILABLE=True", flush=True)
                print("SONARA_REMIX_PRO_WORKER_PID=" + str(pid), flush=True)
                return
        except urllib.error.HTTPError as exc:
            error_code = "HTTP_" + str(exc.code)
        except (OSError, ValueError, TimeoutError) as exc:
            error_code = type(exc).__name__
        if time.monotonic() >= deadline:
            break
        time.sleep(3)

    print("SONARA_REMIX_PRO_WORKER_ALIVE=True", flush=True)
    print("SONARA_PRO_WORKER_STATE=" + str(state.get("state", "unknown")), flush=True)
    print("SONARA_PUBLIC_CHECK_ERROR=" + error_code, flush=True)
    print("SONARA_PUBLIC_AVAILABLE=" + str(caps.get("available")), flush=True)
    print("SONARA_PUBLIC_V6_AVAILABLE=" + str(caps.get("v6Available")), flush=True)
    print("SONARA_SITE_CAPABILITIES_UNCONFIRMED=True", flush=True)
    raise RecoveryBlocked(
        "Worker is alive, but public V6 readiness is unconfirmed; "
        "worker left running, no duplicate started"
    )


def start_worker():
    if pro_processes():
        raise RecoveryBlocked("Existing Remix Pro worker detected; no duplicate startup")
    LOG.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with LOG.open("ab") as output:
        worker = subprocess.Popen(
            [str(PYTHON), str(ROOT / "sonara_remix_pro_r2_agent.py"),
             "--auth-mode", "none"],
            cwd=ROOT, stdin=subprocess.DEVNULL,
            stdout=output, stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    print("SONARA_REMIX_PRO_WORKER_LAUNCHED_PID=" + str(worker.pid), flush=True)
    confirm_worker(worker.pid, started_at=int(time.time()), timeout_seconds=35)

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--activate", action="store_true")
    args = parser.parse_args()
    print("=== SONARA REMIX PRO V6 PRIVATE RESTORE ===", flush=True)
    workers = pro_processes()
    if len(workers) > 1:
        raise RecoveryBlocked("Multiple Remix Pro workers detected; manual review required")
    check_gpu()
    check_main_engine()
    check_token()
    if workers:
        print("SONARA_EXISTING_REMIX_PRO_WORKER_DETECTED=True", flush=True)
        confirm_worker(workers[0], timeout_seconds=18)
        print("SONARA_PRO_RESTORE_EXIT=0", flush=True)
        return
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
