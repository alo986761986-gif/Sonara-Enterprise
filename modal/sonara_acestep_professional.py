"""Production Modal deployment for SONARA's professional ACE-Step engine.

The deployment keeps two official ACE-Step 1.5 DiT models resident in the API
server: XL-Turbo for the fast first render and XL-SFT for professional quality
fallbacks. The 4B 5 Hz language model remains enabled for prompt fidelity.
"""

from __future__ import annotations

import os
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Any

import modal

APP_NAME = "sonara-acestep"
FUNCTION_NAME = "serve_acestep"
API_PORT = 8001
MINUTES = 60
SCALEDOWN_WINDOW_SECONDS = 2 * MINUTES
EPHEMERAL_DISK_MIB = 512 * 1024

FAST_DIT_MODEL = "acestep-v15-xl-turbo"
QUALITY_DIT_MODEL = "acestep-v15-xl-sft"
DIT_MODEL = QUALITY_DIT_MODEL
LM_MODEL = "acestep-5Hz-lm-4B"
CHECKPOINTS_DIR = "/app/checkpoints"
OUTPUTS_DIR = "/app/gradio_outputs"
API_TMP_DIR = f"{OUTPUTS_DIR}/runtime"
HF_CACHE_DIR = "/cache/huggingface"
ACESTEP_ROOT = "/app"
ACESTEP_VENV = "/app/.venv"
ACESTEP_VENV_SITE = "/app/.venv/lib/python3.11/site-packages"

app = modal.App(APP_NAME)
model_volume = modal.Volume.from_name("sonara-acestep-models", create_if_missing=True)
output_volume = modal.Volume.from_name("sonara-acestep-outputs", create_if_missing=True)
cache_volume = modal.Volume.from_name("sonara-acestep-hf-cache", create_if_missing=True)

runtime_env = {
    "ACESTEP_MODE": "api",
    "ACESTEP_API_HOST": "0.0.0.0",
    "ACESTEP_API_PORT": str(API_PORT),
    "ACESTEP_PROJECT_ROOT": ACESTEP_ROOT,
    "ACESTEP_CHECKPOINTS_DIR": CHECKPOINTS_DIR,
    "ACESTEP_CONFIG_PATH": FAST_DIT_MODEL,
    "ACESTEP_CONFIG_PATH2": QUALITY_DIT_MODEL,
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
    # ACE-Step writes API WAV files below $ACESTEP_TMPDIR/api_audio. Keep that
    # directory on the mounted output Volume instead of the container-local
    # /app/.cache tree, otherwise a later /v1/audio request can reach a
    # different container (or a replacement container) and return HTTP 404.
    "ACESTEP_TMPDIR": API_TMP_DIR,
    "ACESTEP_LLM_BACKEND": "pt",
    "TOKENIZERS_PARALLELISM": "false",
    "HF_HOME": HF_CACHE_DIR,
    "HF_HUB_CACHE": f"{HF_CACHE_DIR}/hub",
    "VIRTUAL_ENV": ACESTEP_VENV,
    "PYTHONPATH": f"{ACESTEP_ROOT}:{ACESTEP_VENV_SITE}",
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
        # The Volume mount point must stay empty in the image. ACE-Step creates
        # runtime/api_audio after Modal has mounted OUTPUTS_DIR.
        "mkdir -p /app/checkpoints /app/gradio_outputs /app/output /cache/huggingface",
    )
    .env(runtime_env)
)


def _activate_acestep_runtime() -> None:
    """Expose the uv-managed ACE-Step environment to Modal's function Python."""

    for path in (ACESTEP_VENV_SITE, ACESTEP_ROOT):
        if path not in sys.path:
            sys.path.insert(0, path)
    os.environ["VIRTUAL_ENV"] = ACESTEP_VENV
    current_path = os.environ.get("PATH", "")
    venv_bin = f"{ACESTEP_VENV}/bin"
    if not current_path.startswith(f"{venv_bin}:") and current_path != venv_bin:
        os.environ["PATH"] = f"{venv_bin}:{current_path}" if current_path else venv_bin


def _require_download(result: tuple[bool, str], component: str) -> str:
    success, message = result
    if not success:
        raise RuntimeError(f"Failed to prepare {component}: {message}")
    return message


def _professional_checkpoint_status() -> dict[str, Any]:
    _activate_acestep_runtime()
    from acestep.model_downloader import check_main_model_exists, check_model_exists

    checkpoints = Path(CHECKPOINTS_DIR)
    status = {
        "main": check_main_model_exists(checkpoints),
        "fastDit": check_model_exists(FAST_DIT_MODEL, checkpoints),
        "qualityDit": check_model_exists(QUALITY_DIT_MODEL, checkpoints),
        "dit": check_model_exists(QUALITY_DIT_MODEL, checkpoints),
        "lm": check_model_exists(LM_MODEL, checkpoints),
        "vae": (checkpoints / "vae").exists(),
        "textEncoder": (checkpoints / "Qwen3-Embedding-0.6B").exists(),
    }
    return status


def _commit_outputs_forever(interval_seconds: float = 2.0) -> None:
    """Persist API audio written by the ACE-Step web-server subprocess."""

    while True:
        time.sleep(interval_seconds)
        try:
            output_volume.commit()
        except Exception as exc:
            # A transient commit failure must not stop music generation. The
            # next pass retries automatically while the container stays alive.
            print(f"[SONARA] Output Volume commit retry: {exc}", flush=True)


@app.function(
    image=image,
    volumes={
        CHECKPOINTS_DIR: model_volume,
        HF_CACHE_DIR: cache_volume,
    },
    cpu=4.0,
    memory=32768,
    ephemeral_disk=EPHEMERAL_DISK_MIB,
    timeout=4 * 60 * MINUTES,
)
def prepare_models() -> dict[str, object]:
    """Persist the fast, quality and language-model checkpoints before deploy."""

    os.chdir(ACESTEP_ROOT)
    _activate_acestep_runtime()
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
        "fastDit": _require_download(
            ensure_dit_model(
                FAST_DIT_MODEL,
                checkpoints_dir=Path(CHECKPOINTS_DIR),
                prefer_source="huggingface",
            ),
            FAST_DIT_MODEL,
        ),
        "qualityDit": _require_download(
            ensure_dit_model(
                QUALITY_DIT_MODEL,
                checkpoints_dir=Path(CHECKPOINTS_DIR),
                prefer_source="huggingface",
            ),
            QUALITY_DIT_MODEL,
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
        "fastDitModel": FAST_DIT_MODEL,
        "qualityDitModel": QUALITY_DIT_MODEL,
        "ditModel": QUALITY_DIT_MODEL,
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
    ephemeral_disk=EPHEMERAL_DISK_MIB,
    timeout=24 * 60 * MINUTES,
    startup_timeout=30 * MINUTES,
    scaledown_window=SCALEDOWN_WINDOW_SECONDS,
    min_containers=0,
    # ACE-Step keeps its task queue/result store in memory. A single
    # authoritative container guarantees release_task, query_result and both
    # /v1/audio downloads observe the same job state and files.
    max_containers=1,
    name=FUNCTION_NAME,
)
@modal.concurrent(max_inputs=1)
@modal.web_server(
    API_PORT,
    startup_timeout=30 * MINUTES,
    requires_proxy_auth=True,
)
def serve_acestep() -> None:
    """Run the official ACE-Step REST server behind Modal proxy authentication."""

    output_volume.reload()
    threading.Thread(
        target=_commit_outputs_forever,
        name="sonara-output-volume-commit",
        daemon=True,
    ).start()

    env = os.environ.copy()
    env.update(runtime_env)
    venv_bin = f"{ACESTEP_VENV}/bin"
    env["PATH"] = f"{venv_bin}:{env.get('PATH', '')}"

    command = [
        f"{ACESTEP_VENV}/bin/python",
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
        cwd=ACESTEP_ROOT,
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
    """Fail deployment verification if either production DiT path is missing."""

    os.chdir(ACESTEP_ROOT)
    _activate_acestep_runtime()
    status = _professional_checkpoint_status()
    missing = [name for name, ready in status.items() if not ready]
    if missing:
        raise RuntimeError(f"Missing professional ACE-Step checkpoints: {missing}")

    return {
        "ok": True,
        "app": APP_NAME,
        "function": FUNCTION_NAME,
        "gpu": "L40S",
        "fastDitModel": FAST_DIT_MODEL,
        "qualityDitModel": QUALITY_DIT_MODEL,
        "ditModel": QUALITY_DIT_MODEL,
        "lmModel": LM_MODEL,
        "proxyAuthentication": True,
        "minGpuContainers": 0,
        "maxConcurrentGpuContainers": 1,
        "scaledownWindowSeconds": SCALEDOWN_WINDOW_SECONDS,
        "apiTemporaryDirectory": API_TMP_DIR,
        "maxInputsPerContainer": 1,
        "status": status,
        "paths": {
            "fastDit": str(Path(CHECKPOINTS_DIR) / FAST_DIT_MODEL),
            "qualityDit": str(Path(CHECKPOINTS_DIR) / QUALITY_DIT_MODEL),
            "dit": str(Path(CHECKPOINTS_DIR) / QUALITY_DIT_MODEL),
            "lm": str(Path(CHECKPOINTS_DIR) / LM_MODEL),
            "vae": str(Path(CHECKPOINTS_DIR) / "vae"),
            "textEncoder": str(Path(CHECKPOINTS_DIR) / "Qwen3-Embedding-0.6B"),
        },
    }
