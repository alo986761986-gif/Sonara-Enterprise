"""Production Modal deployment for SONARA's professional ACE-Step engine.

This deployment intentionally uses the official ACE-Step 1.5 XL-SFT DiT and
4B 5 Hz language model. It preserves the existing Modal app/function names so
SONARA keeps the same protected endpoint URL.
"""

from __future__ import annotations

import os
import subprocess
from pathlib import Path

import modal

APP_NAME = "sonara-acestep"
FUNCTION_NAME = "serve_acestep"
API_PORT = 8001
MINUTES = 60

DIT_MODEL = "acestep-v15-xl-sft"
LM_MODEL = "acestep-5Hz-lm-4B"
CHECKPOINTS_DIR = "/app/checkpoints"
OUTPUTS_DIR = "/app/gradio_outputs"

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name("sonara-acestep-models", create_if_missing=True)
output_volume = modal.Volume.from_name("sonara-acestep-outputs", create_if_missing=True)

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
    "HF_HOME": "/cache/huggingface",
    "HF_HUB_CACHE": "/cache/huggingface/hub",
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


@app.function(
    image=image,
    volumes={CHECKPOINTS_DIR: model_volume},
    cpu=4.0,
    memory=32768,
    ephemeral_disk=120 * 1024,
    timeout=4 * 60 * MINUTES,
)
def prepare_models() -> dict[str, object]:
    """Download the official professional model stack into persistent storage."""

    os.chdir("/app")
    from acestep.model_downloader import ensure_model_downloaded

    required = ["vae", DIT_MODEL, LM_MODEL]
    resolved: dict[str, str] = {}
    for model_name in required:
        resolved[model_name] = str(ensure_model_downloaded(model_name, CHECKPOINTS_DIR))

    model_volume.commit()

    missing = [
        name
        for name in required
        if not (Path(CHECKPOINTS_DIR) / name).exists()
    ]
    if missing:
        raise RuntimeError(f"ACE-Step model preparation incomplete: {missing}")

    return {
        "ok": True,
        "ditModel": DIT_MODEL,
        "lmModel": LM_MODEL,
        "checkpointsDirectory": CHECKPOINTS_DIR,
        "resolved": resolved,
    }


@app.function(
    image=image,
    gpu="L40S",
    volumes={
        CHECKPOINTS_DIR: model_volume,
        OUTPUTS_DIR: output_volume,
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
    volumes={CHECKPOINTS_DIR: model_volume},
    timeout=10 * MINUTES,
)
def verify_configuration() -> dict[str, object]:
    """Fail deployment verification if either professional model is absent."""

    required_paths = {
        "dit": Path(CHECKPOINTS_DIR) / DIT_MODEL,
        "lm": Path(CHECKPOINTS_DIR) / LM_MODEL,
        "vae": Path(CHECKPOINTS_DIR) / "vae",
    }
    missing = [name for name, path in required_paths.items() if not path.exists()]
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
        "paths": {name: str(path) for name, path in required_paths.items()},
    }
