"""SONARA ACE-Step 1.5 production endpoint on Modal RTX PRO 6000 Blackwell.

Deploy after creating the Modal secret `sonara-acestep-api` with ACESTEP_API_KEY.
The public URL exposes the native ACE-Step REST API on port 8001.
"""

import os
import subprocess

import modal

APP_NAME = "sonara-acestep-blackwell"
ACE_REPO = "https://github.com/ACE-Step/ACE-Step-1.5.git"
ACE_DIR = "/opt/ACE-Step-1.5"

image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git", "curl", "ffmpeg")
    .pip_install("uv")
    .run_commands(
        f"git clone --depth 1 {ACE_REPO} {ACE_DIR}",
        f"cd {ACE_DIR} && uv sync --frozen",
    )
)

model_cache = modal.Volume.from_name("sonara-acestep-models", create_if_missing=True)
api_secret = modal.Secret.from_name("sonara-acestep-api")
app = modal.App(APP_NAME)


@app.function(
    image=image,
    gpu="RTX-PRO-6000",
    timeout=3600,
    scaledown_window=300,
    volumes={"/models": model_cache},
    secrets=[api_secret],
)
@modal.web_server(8001, startup_timeout=900)
def acestep_api():
    env = os.environ.copy()
    env.update(
        {
            "ACESTEP_CONFIG_PATH": "acestep-v15-xl-turbo",
            "ACESTEP_LM_MODEL_PATH": "acestep-5Hz-lm-4B",
            "ACESTEP_DEVICE": "cuda",
            "ACESTEP_INIT_LLM": "true",
            "ACESTEP_LM_BACKEND": "vllm",
            "ACESTEP_USE_FLASH_ATTENTION": "true",
            "ACESTEP_OFFLOAD_TO_CPU": "false",
            "ACESTEP_OFFLOAD_DIT_TO_CPU": "false",
            "ACESTEP_LM_OFFLOAD_TO_CPU": "false",
            "ACESTEP_CHECKPOINTS_DIR": "/models",
            "ACESTEP_API_HOST": "0.0.0.0",
            "ACESTEP_API_PORT": "8001",
            "ACESTEP_API_WORKERS": "1",
            "ACESTEP_QUEUE_WORKERS": "1",
            "ACESTEP_BATCH_SIZE": "2",
            "ACESTEP_NO_INIT": "true",
        }
    )

    subprocess.Popen(
        ["uv", "run", "acestep-api"],
        cwd=ACE_DIR,
        env=env,
    )
