"""Production Modal deployment for SONARA's professional ACE-Step engine.

The deployment uses the official ACE-Step 1.5 XL-SFT DiT together with the
4B 5 Hz language model. It preserves the existing Modal app/function names so
SONARA can keep its protected endpoint URL after the professional rollout.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import Any

import modal

APP_NAME = "sonara-acestep"
FUNCTION_NAME = "serve_acestep"
API_PORT = 8001
MINUTES = 60

DIT_MODEL = "acestep-v15-xl-sft"
LM_MODEL = "acestep-5Hz-lm-4B"
CHECKPOINTS_DIR = "/app/checkpoints"
OUTPUTS_DIR = "/app/gradio_outputs"
HF_CACHE_DIR = "/cache/huggingface"

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name("sonara-acestep-models", create_if_missing=True)
output_volume = modal.Volume.from_name("sonara-acestep-outputs", create_if_missing=True)
cache_volume = modal.Volume.from_name("sonara-acestep-hf-cache", create_if_missing=True)

runtime_env = {
    "ACESTEP_MODE": "api",
    "ACESTEP_API_HOST": "0.0.0.0",
    "ACESTEP_API_PORT": str(API_PORT),
    "ACESTEP_PROJECT_ROOT": "/app",
    "ACESTEP_CHECKPOINTS_DIR": CHECKPOINTS_DIR,
    "ACESTEP_CONFIG_PATH": DIT_MODEL,
    "ACESTEP_LM_MODEL_PATH": LM_MODEL,
    "ACESTEP_INIT_LLM": "true",
    "ACESTEP_NO_INIT": "false",
    "ACESTEP_DOWNLOAD_SOURCE": "huggingface",
    "ACESTEP_DEVICE": "auto",
    "ACESTEP_USE_FLASH_ATTENTION": "true",
    "ACESTEP_OFFLOAD_TO_CPU": "false",
    "ACESTEP_OFFLOAD_DIT_TO_CPU": "false",
    "ACESTEP_COMPILE_MODEL": "false",
    "ACESTEP_QUEUE_WORKERS": "1",
    "ACESTEP_QUEUE_MAXSIZE": "200",
    "ACESTEP_LLM_BACKEND": "pt",
    "TOKENIZERS_PARALLELISM": "false",
    "HF_HOME": HF_CACHE_DIR,
    "HF_HUB_CACHE": f"{HF_CACHE_DIR}/hub",
    "PYTHONUNBUFFERED": "1",
}

image = (
    modal.Image.from_registry(
        "nvidia/cuda:12.8.1-runtime-ubuntu22.04",
        add_python="3.11",
    )
    .entrypoint([])
    .apt_install(
        "build-essential",
        "curl",
        "ffmpeg",
        "git",
        "libffi-dev",
        "libsndfile1",
        "libsndfile1-dev",
        "libssl-dev",
        "wget",
    )
    .run_commands(
        "python -m pip install --no-cache-dir 'uv>=0.7,<1'",
        "git clone --depth 1 https://github.com/ace-step/ACE-Step-1.5.git /app",
        "cd /app && uv sync --frozen --no-dev --python python3.11",
        "mkdir -p /app/checkpoints /app/gradio_outputs /app/output /cache/huggingface",
    )
    .env(runtime_env)
)


def _require_download(result: tuple[bool, str], component: str) -> str:
    success, message = result
    if not success:
        raise RuntimeError(f"Failed to prepare {component}: {message}")
    return message


def _professional_checkpoint_status() -> dict[str, Any]:
    from acestep.model_downloader import check_main_model_exists, check_model_exists

    checkpoints = Path(CHECKPOINTS_DIR)
    status = {
        "main": check_main_model_exists(checkpoints),
        "dit": check_model_exists(DIT_MODEL, checkpoints),
        "lm": check_model_exists(LM_MODEL, checkpoints),
        "vae": (checkpoints / "vae").exists(),
        "textEncoder": (checkpoints / "Qwen3-Embedding-0.6B").exists(),
    }
    return status


@app.function(
    image=image,
    volumes={
        CHECKPOINTS_DIR: model_volume,
        HF_CACHE_DIR: cache_volume,
    },
    cpu=4.0,
    memory=32768,
    ephemeral_disk=120 * 1024,
    timeout=4 * 60 * MINUTES,
)
def prepare_models() -> dict[str, object]:
    """Download the official professional model stack into persistent storage."""

    os.chdir("/app")
    from acestep.model_downloader import (
        ensure_dit_model,
        ensure_lm_model,
        ensure_main_model,
    )

    messages = {
        "main": _require_download(
            ensure_main_model(
                checkpoints_dir=Path(CHECKPOINTS_DIR),
                prefer_source="huggingface",
            ),
            "ACE-Step main components",
        ),
        "dit": _require_download(
            ensure_dit_model(
                DIT_MODEL,
                checkpoints_dir=Path(CHECKPOINTS_DIR),
                prefer_source="huggingface",
            ),
            DIT_MODEL,
        ),
        "lm": _require_download(
            ensure_lm_model(
                LM_MODEL,
                checkpoints_dir=Path(CHECKPOINTS_DIR),
                prefer_source="huggingface",
            ),
            LM_MODEL,
        ),
    }

    model_volume.commit()
    cache_volume.commit()

    status = _professional_checkpoint_status()
    missing = [name for name, ready in status.items() if not ready]
    if missing:
        raise RuntimeError(f"ACE-Step model preparation incomplete: {missing}")

    return {
        "ok": True,
        "ditModel": DIT_MODEL,
        "lmModel": LM_MODEL,
        "checkpointsDirectory": CHECKPOINTS_DIR,
        "status": status,
        "messages": messages,
    }


@app.function(
    image=image,
    gpu="L40S",
    volumes={
        CHECKPOINTS_DIR: model_volume,
        OUTPUTS_DIR: output_volume,
        HF_CACHE_DIR: cache_volume,
    },
    cpu=8.0,
    memory=65536,
    ephemeral_disk=120 * 1024,
    timeout=24 * 60 * MINUTES,
    startup_timeout=30 * MINUTES,
    scaledown_window=10 * MINUTES,
    min_containers=0,
    max_containers=1,
    retries=2,
    name=FUNCTION_NAME,
)
@modal.concurrent(max_inputs=100)
@modal.web_server(
    API_PORT,
    startup_timeout=30 * MINUTES,
    requires_proxy_auth=True,
)
def serve_acestep() -> None:
    """Run the official ACE-Step REST server behind Modal proxy authentication."""

    env = os.environ.copy()
    env.update(runtime_env)

    command = [
        "/app/.venv/bin/python",
        "-m",
        "acestep.api_server",
        "--host",
        "0.0.0.0",
        "--port",
        str(API_PORT),
        "--download-source",
        "huggingface",
        "--init-llm",
        "--lm-model-path",
        LM_MODEL,
    ]

    subprocess.Popen(
        command,
        cwd="/app",
        env=env,
        start_new_session=True,
    )


@app.function(
    image=image,
    volumes={
        CHECKPOINTS_DIR: model_volume,
        HF_CACHE_DIR: cache_volume,
    },
    timeout=10 * MINUTES,
)
def verify_configuration() -> dict[str, object]:
    """Fail deployment verification if the professional stack is incomplete."""

    os.chdir("/app")
    status = _professional_checkpoint_status()
    missing = [name for name, ready in status.items() if not ready]
    if missing:
        raise RuntimeError(f"Missing professional ACE-Step checkpoints: {missing}")

    return {
        "ok": True,
        "app": APP_NAME,
        "function": FUNCTION_NAME,
        "gpu": "L40S",
        "ditModel": DIT_MODEL,
        "lmModel": LM_MODEL,
        "proxyAuthentication": True,
        "status": status,
        "paths": {
            "dit": str(Path(CHECKPOINTS_DIR) / DIT_MODEL),
            "lm": str(Path(CHECKPOINTS_DIR) / LM_MODEL),
            "vae": str(Path(CHECKPOINTS_DIR) / "vae"),
            "textEncoder": str(Path(CHECKPOINTS_DIR) / "Qwen3-Embedding-0.6B"),
        },
    }
