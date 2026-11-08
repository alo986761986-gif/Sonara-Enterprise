"""Isolated MoLab RTX PRO 6000 Blackwell GPU setup for SONARA Remix Pro.

Install torch CUDA 12.8 and Demucs in the *existing private Remix Pro venv*,
never in ACE-Step's environment. Can perform a genuine 4-stem GPU inference
on a short locally-created technical signal, not a song or website job.

No Cloudflare keys, R2 changes, ACE-Step restarts or user audio are involved.
"""
from __future__ import annotations

import argparse
import array
import importlib.metadata
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import wave

ROOT = Path("/marimo/SONARA-REMIX-PRO")
VENV = ROOT / ".venv"
TORCH_VERSION = "2.9.1"
DEMUCS_VERSION = "4.1.0"
CUDA_WHEEL_INDEX = "https://download.pytorch.org/whl/cu128"
SMOKE_STEMS = ("vocals", "drums", "bass", "other")
MIN_FREE_GIB = 12
MIN_GPU_FREE_MIB = 12000


class GPUSetupError(RuntimeError):
    pass


def _installed(name):
    try:
        return importlib.metadata.version(name)
    except importlib.metadata.PackageNotFoundError:
        return None


def _inspect_gpu():
    """Read actual NVIDIA driver info; never infer a GPU from a model name."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,memory.free,compute_cap,driver_version",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, check=True, timeout=20,
        )
    except (OSError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise GPUSetupError("NVIDIA driver or nvidia-smi is unavailable") from exc
    rows = [line.strip() for line in result.stdout.splitlines() if line.strip()]
    if not rows:
        raise GPUSetupError("No GPU returned by NVIDIA driver")
    fields = [part.strip() for part in rows[0].split(",")]
    if len(fields) != 4:
        raise GPUSetupError("Unexpected NVIDIA GPU report")
    name, free, capability, driver = fields
    if "RTX PRO 6000" not in name or float(capability) != 12.0:
        raise GPUSetupError("This installer requires the identified RTX PRO 6000 Blackwell sm_120")
    try:
        free_mem_mib = int(free)
    except ValueError as exc:
        raise GPUSetupError("Cannot verify free GPU memory") from exc
    return {"device": name, "computeCapability": capability, "freeMemoryMiB": free_mem_mib,
            "driverVersion": driver}


def _venv_check():
    if Path(sys.prefix).resolve() != VENV.resolve():
        raise GPUSetupError("Run with /marimo/SONARA-REMIX-PRO/.venv/bin/python only")
    if sys.version_info < (3, 10):
        raise GPUSetupError("Python 3.10 or newer is required")
    if not (ROOT / "sonara_remix_pro_toolkit.py").is_file():
        raise GPUSetupError("SONARA Remix Pro toolkit is missing")


def _pip(*args):
    command = [sys.executable, "-m", "pip", "--disable-pip-version-check",
               "--no-input", "--no-cache-dir", "install", "--quiet", *args]
    subprocess.run(command, check=True, timeout=1800)


def _gpu_kernel_check():
    import torch
    if not str(torch.__version__).startswith(TORCH_VERSION + "+cu128"):
        raise GPUSetupError("Wrong CUDA PyTorch wheel or version")
    if torch.version.cuda != "12.8" or not torch.cuda.is_available():
        raise GPUSetupError("CUDA 12.8 runtime or GPU is not available")
    if tuple(torch.cuda.get_device_capability(0)) != (12, 0):
        raise GPUSetupError("GPU CUDA compute capability is not sm_120")
    if "sm_120" not in torch.cuda.get_arch_list():
        raise GPUSetupError("PyTorch wheel does not contain sm_120 kernels")
    with torch.no_grad():
        matrix = torch.ones((16, 16), device="cuda:0")
        result = matrix @ matrix
        torch.cuda.synchronize()
        if float(result[0, 0]) != 16:
            raise GPUSetupError("CUDA test result invalid")
    return {"torch": torch.__version__, "cuda": torch.version.cuda,
            "gpu": torch.cuda.get_device_name(0), "sm120KernelVerified": True}


def setup(*, install=False, smoke=False):
    _venv_check()
    gpu = _inspect_gpu()
    free_disk_gib = round(shutil.disk_usage(ROOT).free / (1024 ** 3), 2)
    print("=== SONARA REMIX PRO - GPU ===", flush=True)
    print("GPU_NAME:", gpu["device"])
    print("GPU_COMPUTE_CAPABILITY:", gpu["computeCapability"])
    print("GPU_DRIVER:", gpu["driverVersion"])
    print("GPU_FREE_MEMORY_MIB:", gpu["freeMemoryMiB"])
    print("DISK_FREE_GIB:", free_disk_gib)
    print("ISOLATED_VENV:", str(VENV))
    print("EXISTING_TORCH:", _installed("torch") or "not installed")
    print("EXISTING_DEMUCS:", _installed("demucs") or "not installed")
    if not install and not smoke:
        print("INSTALLATION_PERFORMED=False")
        return {"gpu": gpu, "installed": False, "modelInferenceVerified": False}
    if free_disk_gib < MIN_FREE_GIB and _installed("torch") is None:
        raise GPUSetupError("Not enough free disk for a separate CUDA PyTorch installation")
    if gpu["freeMemoryMiB"] < MIN_GPU_FREE_MIB and smoke:
        raise GPUSetupError("Insufficient unused GPU VRAM for a safe Demucs smoke test")
    if install:
        if _installed("torch") not in (None, TORCH_VERSION + "+cu128"):
            raise GPUSetupError("Different torch already installed: refuse to overwrite without review")
        if _installed("torch") is None:
            print("INSTALLING_PRIVATE_PYTORCH_CU128=True", flush=True)
            _pip("torch==" + TORCH_VERSION, "--index-url", CUDA_WHEEL_INDEX)
        check = _gpu_kernel_check()
        print("TORCH_CUDA_RUNTIME:", check["cuda"])
        print("GPU_KERNEL_TEST_OK=True", flush=True)
        if _installed("demucs") not in (None, DEMUCS_VERSION):
            raise GPUSetupError("Different Demucs already installed: refuse automatic replacement")
        if _installed("demucs") is None:
            print("INSTALLING_PRIVATE_DEMUCS_4_1=True", flush=True)
            _pip("demucs==" + DEMUCS_VERSION)
        if _installed("demucs") != DEMUCS_VERSION:
            raise GPUSetupError("Demucs installed version differs from audited pin")
    else:
        _gpu_kernel_check()
        if _installed("demucs") != DEMUCS_VERSION:
            raise GPUSetupError("Pinned Demucs 4.1.0 is not installed")
    # Verify the actual CLI imports without downloading model weights.
    subprocess.run([sys.executable, "-m", "demucs.separate", "--list-models"],
                   check=True, stdout=subprocess.DEVNULL, timeout=90)
    print("DEMUCS_CLI_READY=True", flush=True)
    model_verified = False
    if smoke:
        smoke_dir = ROOT / "gpu-smoke-technical"
        if smoke_dir.exists():
            raise GPUSetupError("Smoke directory already exists: won't delete or overwrite user files")
        smoke_dir.mkdir(mode=0o700, parents=True)
        try:
            src = smoke_dir / "technical-signal.wav"
            sr = 44100
            duration = 10
            samples = array.array("h")
            for i in range(sr * duration):
                t = i / sr
                pulse = 0.08 if (i % (sr // 2)) < 700 else 0
                sample = 0.10 * math.sin(2 * math.pi * 220 * t) + 0.04 * math.sin(2 * math.pi * 440 * t) + pulse
                pcm = int(max(-1, min(1, sample)) * 32767)
                samples.append(pcm)
                samples.append(pcm)
            with wave.open(str(src), "wb") as wav:
                wav.setnchannels(2)
                wav.setsampwidth(2)
                wav.setframerate(sr)
                wav.writeframes(samples.tobytes())
            destination = smoke_dir / "separated"
            env = {**os.environ, "TORCH_HOME": str(ROOT / "model-cache"),
                   "XDG_CACHE_HOME": str(ROOT / "private-cache")}
            print("DEMUCS_GPU_SMOKE_STARTED=True", flush=True)
            subprocess.run([sys.executable, "-m", "demucs.separate",
                            "-n", "htdemucs", "--device", "cuda",
                            "--shifts", "1", "--overlap", "0.1",
                            "--out", str(destination), str(src)],
                           env=env, check=True, timeout=1200)
            stems = destination / "htdemucs" / src.stem
            for name in SMOKE_STEMS:
                f = stems / (name + ".wav")
                if not f.is_file():
                    raise GPUSetupError("Demucs did not generate every stem")
                with wave.open(str(f), "rb") as wav:
                    if wav.getnframes() < 44100 or wav.getnchannels() != 2:
                        raise GPUSetupError("Generated stem WAV is invalid")
            model_verified = True
            print("DEMUCS_REAL_GPU_INFERENCE_VERIFIED=True", flush=True)
            print("STEM_OUTPUTS_VALIDATED=4", flush=True)
        finally:
            # Never remove model weights; remove only this isolated synthetic signal.
            shutil.rmtree(smoke_dir)
    print("ACE_STEP_UNMODIFIED=True")
    print("CUSTOMER_GENERATIONS_STARTED=0")
    print("USER_AUDIO_QA_STILL_REQUIRED=True")
    print("SITE_INTEGRATION_STILL_REQUIRED=True")
    return {"gpu": gpu, "demucsVersion": _installed("demucs"),
            "torchVersion": _installed("torch"),
            "modelInferenceVerified": model_verified}


def main(argv=None):
    p = argparse.ArgumentParser(description="Safely install & verify Demucs CUDA in SONARA Remix Pro venv")
    p.add_argument("--install", action="store_true")
    p.add_argument("--smoke", action="store_true")
    args = p.parse_args(argv)
    try:
        setup(install=args.install, smoke=args.smoke)
    except (GPUSetupError, subprocess.CalledProcessError, subprocess.TimeoutExpired, OSError) as exc:
        print("GPU_SETUP_FAILED=True")
        print("ERROR_TYPE=" + type(exc).__name__)
        if isinstance(exc, GPUSetupError):
            print("ERROR_REASON=" + str(exc))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
