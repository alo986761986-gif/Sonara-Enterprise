"""SONARA Video AI RTX engine using Wan 2.2 T2V-A14B on Modal RTX PRO 6000.

This deployment is intentionally isolated from the ACE-Step music engine. It
uses a persistent Modal Volume for the official Wan 2.2 model and exposes a
GPU function that returns an MP4 byte stream suitable for smoke tests and for
later integration with SONARA's /api/video provider layer.
"""

from __future__ import annotations

import os
import subprocess
import sys
import uuid
from pathlib import Path

import modal

APP_NAME = "sonara-video-wan22-rtx"
GPU_TYPE = "RTX-PRO-6000"
MINUTES = 60
WAN_ROOT = "/opt/Wan2.2"
MODEL_ID = "Wan-AI/Wan2.2-T2V-A14B"
MODEL_ROOT = "/models"
MODEL_DIR = f"{MODEL_ROOT}/Wan2.2-T2V-A14B"
HF_CACHE_DIR = "/cache/huggingface"
EPHEMERAL_DISK_MIB = 512 * 1024
MAX_RETURN_BYTES = 95 * 1024 * 1024

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name("sonara-video-wan22-models", create_if_missing=True)
cache_volume = modal.Volume.from_name("sonara-video-wan22-hf-cache", create_if_missing=True)

runtime_env = {
    "HF_HOME": HF_CACHE_DIR,
    "HF_HUB_CACHE": f"{HF_CACHE_DIR}/hub",
    "HF_HUB_ENABLE_HF_TRANSFER": "1",
    "TOKENIZERS_PARALLELISM": "false",
    "PYTHONUNBUFFERED": "1",
    "CUDA_DEVICE_ORDER": "PCI_BUS_ID",
}

image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.1-devel-ubuntu22.04",
        add_python="3.11",
    )
    .entrypoint([])
    .apt_install(
        "build-essential",
        "ffmpeg",
        "git",
        "git-lfs",
        "libgl1",
        "libglib2.0-0",
    )
    .uv_pip_install(
        "torch==2.7.1",
        "torchvision==0.22.1",
        "torchaudio==2.7.1",
        "numpy==1.26.4",
        extra_index_url="https://download.pytorch.org/whl/cu128",
        extra_options="--index-strategy unsafe-best-match",
    )
    .uv_pip_install(
        "accelerate>=1.1.1",
        "dashscope",
        "diffusers>=0.31.0",
        "easydict",
        "einops",
        "ftfy",
        "hf-transfer",
        "huggingface_hub[hf_xet]",
        "imageio[ffmpeg]",
        "imageio-ffmpeg",
        "opencv-python-headless>=4.9.0.80",
        "protobuf",
        "safetensors",
        "sentencepiece",
        "tokenizers>=0.20.3",
        "tqdm",
        "transformers==4.51.3",
    )
    .run_commands(
        f"git clone --depth 1 https://github.com/Wan-Video/Wan2.2.git {WAN_ROOT}",
        f"mkdir -p {MODEL_ROOT} {HF_CACHE_DIR}",
    )
    .env(runtime_env)
)


def _model_ready() -> bool:
    root = Path(MODEL_DIR)
    if not root.exists():
        return False
    return any(root.rglob("*.safetensors")) or any(root.rglob("*.pth"))


def _validate_dimensions(width: int, height: int) -> str:
    if (width, height) == (1280, 720):
        return "1280*720"
    if (width, height) == (720, 1280):
        return "720*1280"
    if (width, height) == (832, 480):
        return "832*480"
    if (width, height) == (480, 832):
        return "480*832"
    raise ValueError("Wan 2.2 A14B supports 1280x720, 720x1280, 832x480 or 480x832 in this SONARA endpoint.")


def _validate_frames(frames: int) -> int:
    frames = int(frames)
    if frames < 17 or frames > 121 or (frames - 1) % 4 != 0:
        raise ValueError("frames must be between 17 and 121 and satisfy 4n+1 (for example 49, 81 or 121).")
    return frames


@app.function(
    image=image,
    volumes={MODEL_ROOT: model_volume, HF_CACHE_DIR: cache_volume},
    cpu=8.0,
    memory=65536,
    ephemeral_disk=EPHEMERAL_DISK_MIB,
    timeout=6 * 60 * MINUTES,
)
def prepare_models() -> dict[str, object]:
    """Download and persist the official Wan 2.2 T2V-A14B checkpoint."""
    from huggingface_hub import snapshot_download

    Path(MODEL_DIR).mkdir(parents=True, exist_ok=True)
    snapshot_download(
        repo_id=MODEL_ID,
        local_dir=MODEL_DIR,
        max_workers=8,
    )
    model_volume.commit()
    cache_volume.commit()
    if not _model_ready():
        raise RuntimeError("Wan 2.2 model download completed without a usable checkpoint.")
    return {
        "ok": True,
        "model": MODEL_ID,
        "modelDir": MODEL_DIR,
        "gpu": GPU_TYPE,
    }


@app.function(
    image=image,
    gpu=GPU_TYPE,
    volumes={MODEL_ROOT: model_volume, HF_CACHE_DIR: cache_volume},
    cpu=16.0,
    memory=131072,
    ephemeral_disk=EPHEMERAL_DISK_MIB,
    timeout=90 * MINUTES,
    startup_timeout=30 * MINUTES,
    scaledown_window=5 * MINUTES,
)
def generate_video(
    prompt: str,
    width: int = 1280,
    height: int = 720,
    frames: int = 81,
    seed: int = 260830,
    steps: int = 40,
) -> bytes:
    """Generate one high-quality MP4 on the RTX PRO 6000 and return its bytes."""
    prompt = str(prompt or "").strip()
    if not prompt:
        raise ValueError("prompt is required")
    if len(prompt) > 6000:
        raise ValueError("prompt is too long")

    size = _validate_dimensions(int(width), int(height))
    frames = _validate_frames(frames)
    steps = max(20, min(60, int(steps)))
    seed = int(seed)

    model_volume.reload()
    cache_volume.reload()
    if not _model_ready():
        raise RuntimeError("Wan 2.2 checkpoint is not ready. Run prepare_models first.")

    output = Path(f"/tmp/sonara-wan22-{uuid.uuid4().hex}.mp4")
    command = [
        sys.executable,
        f"{WAN_ROOT}/generate.py",
        "--task",
        "t2v-A14B",
        "--size",
        size,
        "--ckpt_dir",
        MODEL_DIR,
        "--prompt",
        prompt,
        "--frame_num",
        str(frames),
        "--base_seed",
        str(seed),
        "--sample_steps",
        str(steps),
        "--offload_model",
        "True",
        "--convert_model_dtype",
        "--t5_cpu",
        "--save_file",
        str(output),
    ]

    env = os.environ.copy()
    env.update(runtime_env)
    env["CUDA_VISIBLE_DEVICES"] = "0"
    subprocess.run(command, cwd=WAN_ROOT, env=env, check=True)

    if not output.exists() or output.stat().st_size <= 0:
        raise RuntimeError("Wan 2.2 finished without producing an MP4 file.")
    size_bytes = output.stat().st_size
    if size_bytes > MAX_RETURN_BYTES:
        raise RuntimeError(f"Generated MP4 is too large to return safely ({size_bytes} bytes).")
    return output.read_bytes()
