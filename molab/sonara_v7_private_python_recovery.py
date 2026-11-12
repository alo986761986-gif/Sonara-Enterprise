#!/usr/bin/env python3
"""Restore only SONARA Remix Pro V7's missing PRIVATE Python/CUDA environment.

For the RTX PRO 6000 Blackwell MoLab notebook after a lost .venv. Never
replaces V7 modules, touches main ACE-Step, creates/rotates relay tokens,
kills a worker, modifies R2/customer records, or disables quality checks.

Requires the exact verified 11 V7 modules and the existing authorized token.
Fresh venv installs are isolated to /marimo/SONARA-REMIX-PRO/.venv.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = Path("/marimo/SONARA-REMIX-PRO")
VENV = ROOT / ".venv"
PYTHON = VENV / "bin/python"
HOME = Path.home() / ".sonara"
TOKEN = HOME / "relay.token"
GPU_HELPER = ROOT / "sonara_remix_pro_gpu_setup.py"
GPU_HELPER_SHA = "e3e1b9bf461b357602d2aee87b638dda663e59b8"
GPU_HELPER_COMMIT = "b9b44223c59ae027be07c768f7d77a2cd18d3ddf"
PRO_REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"

# SHA1 of Git blob, not plain source SHA1. The exact V7 Creative Modes release
# already installed on the user's notebook: NEVER fetch or downgrade these.
V7_BLOBS = {
    "sonara_remix_pro_v5.py": "58474a9db887e6a16ab9a57889789f4b0f987d95",
    "sonara_remix_pro_v6.py": "d8a99ea30b93cf47f1befee3c8c45b3ad630a597",
    "sonara_remix_pro_v7.py": "3ddd13f6e0211e6dcab942d886ae36993384158a",
    "sonara_remix_pro_v7_rhythm.py": "a39cad47b8b9f618912511166f8d5d2e552f3896",
    "sonara_remix_pro_a_clock_fusion.py": "e44b010e34d46886bd76a07cfff99f927b6c3d21",
    "sonara_remix_pro_r2_agent.py": "66dac4702e2418902172c50a07fe268ac9e44b78",
    "sonara_remix_pro_quality.py": "7e4e0f6c608e02063b3bac689b5b35a5b91bbef5",
    "sonara_remix_pro_toolkit.py": "4ca1f094839f8372a5fd9c3ee8462e5470a9100d",
    "sonara_remix_pro_ace_bridge.py": "72bdb9b36792127d27340660d2c738c64de6c1f8",
    "sonara_remix_pro_fusion.py": "073e73b0f418e91bd48e8bfbe084ba6f31cef847",
    "sonara_remix_pro_original_voices.py": "93927ebacb2fcf86ea9397abfd31df1824b4c180",
}

AUDIO_PACKAGES = (
    "librosa==0.11.0", "pyloudnorm==0.1.1", "soundfile==0.13.1",
    "scipy>=1.13,<1.18", "numpy>=1.26,<2.3",
)


class RecoveryBlocked(RuntimeError):
    pass


def git_blob(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()


def checked_private_state() -> None:
    for directory in (ROOT, HOME):
        if directory.is_symlink() or not directory.is_dir():
            raise RecoveryBlocked("Missing or unsafe private directory: " + directory.name)
        if directory.stat().st_uid != os.getuid():
            raise RecoveryBlocked("Private directory has a different owner: " + directory.name)
    if TOKEN.is_symlink() or not TOKEN.is_file():
        raise RecoveryBlocked("Original Cloudflare relay token missing")
    value = TOKEN.read_text(encoding="ascii").strip()
    if not 32 <= len(value) <= 512 or any(c.isspace() for c in value) or not value.isascii():
        raise RecoveryBlocked("Original Cloudflare relay token invalid")
    for name, sha in V7_BLOBS.items():
        path = ROOT / name
        if path.is_symlink() or not path.is_file():
            raise RecoveryBlocked("V7 module missing: " + name)
        raw = path.read_bytes()
        if len(raw) > 500000 or git_blob(raw) != sha:
            raise RecoveryBlocked("Unrecognized V7 module: " + name)
    if VENV.is_symlink():
        raise RecoveryBlocked("Unsafe existing .venv symlink")
    print("SONARA_V7_ALL_LATEST_MODULES_VERIFIED=True", flush=True)
    print("SONARA_EXISTING_CLOUDFLARE_TOKEN_PRESERVED=True", flush=True)


def authorized_gateway() -> bool:
    """A GET /auth only; never claims work, generates audio or reads user jobs."""
    value = TOKEN.read_text(encoding="ascii").strip()
    url = "https://api.sonaraenterprise.com/api/sonara-relay/auth"
    req = urllib.request.Request(url, headers={
        "Accept": "application/json",
        "User-Agent": "SONARA-MoLab-Relay/1.0",
        "X-Sonara-Relay-Token": value,
        "X-Sonara-Agent-Revision": "sonara-https-agent-guard-v5",
    })
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=20) as result:
            answer = json.load(result)
            ready = (result.status == 200
                     and isinstance(answer, dict)
                     and answer.get("authenticated") is True)
    except urllib.error.HTTPError as error:
        print("SONARA_AUTH_HTTP=" + str(error.code), flush=True)
        return False
    except (OSError, ValueError, TimeoutError, urllib.error.URLError):
        print("SONARA_AUTH_HTTP=UNREACHABLE", flush=True)
        return False
    print("SONARA_AUTH_HTTP=200", flush=True)
    return ready


def pro_worker_running() -> bool:
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():
            continue
        try:
            args = (proc / "cmdline").read_bytes().split(b"\0")
            if any(b"sonara_remix_pro_r2_agent.py" in a for a in args[1:]):
                return True
        except OSError:
            continue
    return False


def gpu_preflight() -> None:
    if pro_worker_running():
        raise RecoveryBlocked("Remix Pro worker already running: no venv modification")
    if shutil.disk_usage(ROOT).free < 12 * 1024 ** 3:
        raise RecoveryBlocked("Less than 12 GiB disk free for isolated CUDA environment")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise RecoveryBlocked("FFmpeg/FFprobe unavailable; cannot validate private audio runtime")
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,compute_cap,memory.free",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, check=True, timeout=20)
        parts = [p.strip() for p in result.stdout.splitlines()[0].split(",")]
        if len(parts) != 3 or "RTX PRO 6000" not in parts[0] or float(parts[1]) != 12.0:
            raise RecoveryBlocked("This recovery requires RTX PRO 6000 Blackwell sm_120")
        if float(parts[2]) < 12000:
            raise RecoveryBlocked("RTX PRO 6000 is busy; not enough free GPU memory")
    except (OSError, ValueError, IndexError, subprocess.CalledProcessError,
            subprocess.TimeoutExpired) as exc:
        raise RecoveryBlocked("NVIDIA RTX PRO 6000 preflight unavailable") from exc
    print("SONARA_V7_RTX_PRO_6000_VERIFIED=True", flush=True)


def private_python() -> Path:
    if not VENV.is_dir() or not (VENV / "pyvenv.cfg").is_file() or not PYTHON.is_file():
        raise RecoveryBlocked("Private .venv missing or incomplete")
    try:
        check = subprocess.run(
            [str(PYTHON), "-c", "import pathlib,sys;assert sys.version_info[:2]==(3,12);print(pathlib.Path(sys.prefix).resolve())"],
            cwd=ROOT, capture_output=True, text=True, timeout=30, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RecoveryBlocked("Private Python failed to start") from exc
    if check.returncode or check.stdout.strip() != str(VENV.resolve()):
        raise RecoveryBlocked("Private .venv Python 3.12 identity mismatch")
    return PYTHON


def restore_gpu_helper() -> None:
    if GPU_HELPER.is_symlink():
        raise RecoveryBlocked("Unsafe GPU setup helper symlink")
    if GPU_HELPER.is_file():
        if git_blob(GPU_HELPER.read_bytes()) != GPU_HELPER_SHA:
            raise RecoveryBlocked("Unrecognized local CUDA setup helper; no replacement")
        print("SONARA_V7_GPU_HELPER_VERIFIED=True", flush=True)
        return
    if GPU_HELPER.exists():
        raise RecoveryBlocked("Unexpected GPU helper path")
    req = urllib.request.Request(
        "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/"
        + GPU_HELPER_COMMIT + "/molab/" + GPU_HELPER.name,
        headers={"User-Agent": "SONARA-V7-Private-Recovery/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=45) as response:
            if response.status != 200:
                raise RecoveryBlocked("Trusted GPU helper download failed")
            raw = response.read(200001)
    except (OSError, TimeoutError, urllib.error.URLError) as exc:
        raise RecoveryBlocked("Trusted GPU setup helper unavailable") from exc
    if not raw or len(raw) > 200000 or git_blob(raw) != GPU_HELPER_SHA:
        raise RecoveryBlocked("Trusted GPU helper fingerprint mismatch")
    compile(raw, GPU_HELPER.name, "exec")
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
    fd = os.open(GPU_HELPER, flags, 0o600)
    with os.fdopen(fd, "wb") as destination:
        destination.write(raw)
    print("SONARA_V7_GPU_HELPER_VERIFIED=True", flush=True)


def create_venv_only_if_missing() -> bool:
    if VENV.exists():
        private_python()
        print("SONARA_V7_EXISTING_PRIVATE_VENV_PRESERVED=True", flush=True)
        return False
    uv = shutil.which("uv")
    if not uv and Path("/usr/local/bin/uv").is_file():
        uv = "/usr/local/bin/uv"
    if not uv and (Path.home() / ".local/bin/uv").is_file():
        uv = str(Path.home() / ".local/bin/uv")
    if uv:
        cmd = [uv, "venv", str(VENV), "--python", "3.12", "--seed"]
    else:
        py312 = shutil.which("python3.12")
        if not py312:
            raise RecoveryBlocked("Neither uv nor Python 3.12 is installed; no changes")
        cmd = [py312, "-m", "venv", str(VENV)]
    try:
        result = subprocess.run(cmd, cwd=ROOT, capture_output=True,
                                text=True, timeout=240, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RecoveryBlocked("Private Python 3.12 environment creation failed") from exc
    if result.returncode:
        raise RecoveryBlocked("Private Python 3.12 venv creation returned failure")
    private_python()
    print("SONARA_V7_PRIVATE_VENV_CREATED=True", flush=True)
    return True


def install_audio_libraries() -> None:
    check_code = (
        "import numpy,librosa,scipy,soundfile,pyloudnorm;"
        "import importlib.metadata as m;"
        "assert m.version('librosa')=='0.11.0';"
        "assert m.version('pyloudnorm')=='0.1.1';"
        "assert m.version('soundfile')=='0.13.1';"
        "assert 1.13 <= float('.'.join(m.version('scipy').split('.')[:2])) < 1.18"
    )
    healthy = subprocess.run([str(PYTHON), "-c", check_code],
                             cwd=ROOT, capture_output=True, timeout=60,
                             check=False).returncode == 0
    if healthy:
        print("SONARA_V7_PRIVATE_AUDIO_LIBRARIES_READY=True", flush=True)
        return
    uv = shutil.which("uv")
    if not uv and Path("/usr/local/bin/uv").is_file():
        uv = "/usr/local/bin/uv"
    if not uv and (Path.home() / ".local/bin/uv").is_file():
        uv = str(Path.home() / ".local/bin/uv")
    command = ([uv, "pip", "install", "--python", str(PYTHON), *AUDIO_PACKAGES]
               if uv else
               [str(PYTHON), "-m", "pip", "--disable-pip-version-check",
                "--no-input", "install", *AUDIO_PACKAGES])
    try:
        result = subprocess.run(command, cwd=ROOT, capture_output=True,
                                text=True, timeout=1600, check=False)
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise RecoveryBlocked("Private isolated audio library install failed") from exc
    if result.returncode:
        raise RecoveryBlocked("Private isolated audio library install returned failure")
    final = subprocess.run([str(PYTHON), "-c", check_code],
                           cwd=ROOT, capture_output=True, timeout=60,
                           check=False)
    if final.returncode:
        raise RecoveryBlocked("Private audio library verification failed")
    print("SONARA_V7_PRIVATE_AUDIO_LIBRARIES_READY=True", flush=True)


def verify_private_gpu() -> None:
    # Audited helper validates torch 2.9.1+cu128, Demucs 4.1,
    # real sm_120 CUDA kernels and four-stem htdemucs synthetic-signal inference.
    proc = subprocess.run(
        [str(PYTHON), str(GPU_HELPER), "--install", "--smoke"],
        cwd=ROOT, capture_output=True, text=True, timeout=2400, check=False)
    if proc.returncode:
        for line in proc.stdout.splitlines():
            if line.startswith(("GPU_KERNEL_TEST_OK=", "DEMUCS_REAL_GPU_INFERENCE_VERIFIED=")):
                print(line, flush=True)
        raise RecoveryBlocked("Private CUDA/Demucs GPU smoke failed; customer audio untouched")
    if ("GPU_KERNEL_TEST_OK=True" not in proc.stdout or
            "DEMUCS_REAL_GPU_INFERENCE_VERIFIED=True" not in proc.stdout):
        raise RecoveryBlocked("Private GPU kernel/stem verification incomplete")
    print("SONARA_V7_PRIVATE_TORCH_CUDA128_READY=True", flush=True)
    print("SONARA_V7_PRIVATE_DEMUCS_4_1_READY=True", flush=True)
    print("SONARA_V7_PRIVATE_GPU_STEMS_VERIFIED=True", flush=True)


def verify_v7_imports() -> None:
    imports = (
        "import importlib.metadata as m,torch,librosa,numpy,scipy,soundfile,pyloudnorm;"
        "import sonara_remix_pro_v5,sonara_remix_pro_v6,sonara_remix_pro_v7;"
        "import sonara_remix_pro_v7_rhythm,sonara_remix_pro_a_clock_fusion;"
        "import sonara_remix_pro_r2_agent,sonara_remix_pro_quality;"
        "import sonara_remix_pro_toolkit,sonara_remix_pro_ace_bridge;"
        "import sonara_remix_pro_fusion,sonara_remix_pro_original_voices;"
        "assert m.version('demucs')=='4.1.0';"
        "assert torch.__version__.startswith('2.9.1+cu128');"
        "assert sonara_remix_pro_v6.V7_MODES_REVISION=='sonara-v7-mode-differentiation-r1';"
        "assert sonara_remix_pro_v7.V7_MODE_AUDIO_REVISION=='sonara-v7-creative-voice-motion-r1';"
        "assert callable(sonara_remix_pro_v7_rhythm.measure_a_rhythm)"
    )
    proc = subprocess.run([str(PYTHON), "-c", imports],
                          cwd=ROOT, capture_output=True, timeout=130,
                          check=False)
    if proc.returncode:
        raise RecoveryBlocked("V7 private imports or creative/rhythm revision check failed")
    print("SONARA_V7_PRIVATE_IMPORTS_READY=True", flush=True)
    print("SONARA_V7_RHYTHM_LOCK_PRESERVED=True", flush=True)
    print("SONARA_V7_CREATIVE_MODES_PRESERVED=True", flush=True)


def main(activate: bool) -> int:
    print("=== SONARA V7 - RESTORE ISOLATED GPU PYTHON ===", flush=True)
    checked_private_state()
    if not authorized_gateway():
        raise RecoveryBlocked("Existing token not authenticated; no private environment modified")
    if not activate:
        print("SONARA_V7_PRIVATE_VENV_PRESENT=" + str(VENV.is_dir()), flush=True)
        print("SONARA_V7_PRIVATE_VENV_PREFLIGHT_ONLY=True", flush=True)
        return 0
    gpu_preflight()
    restore_gpu_helper()
    create_venv_only_if_missing()
    install_audio_libraries()
    verify_private_gpu()
    verify_v7_imports()
    print("SONARA_V7_PRIVATE_PYTHON_RECOVERED=True", flush=True)
    print("SONARA_MAIN_ACE_STEP_UNCHANGED=True", flush=True)
    print("SONARA_QUALITY_GATE_DISABLED=False", flush=True)
    print("NO_CUSTOMER_AUDIO_JOB_CREATED=True", flush=True)
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--activate", action="store_true")
    args = parser.parse_args()
    try:
        raise SystemExit(main(args.activate))
    except (RecoveryBlocked, OSError, ValueError, subprocess.TimeoutExpired) as exc:
        print("SONARA_V7_PRIVATE_ENV_RECOVERY_BLOCKED=" + str(exc), flush=True)
        raise SystemExit(1)
