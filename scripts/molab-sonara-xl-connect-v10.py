import os
import re
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

SOURCE = "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/molab-sonara-xl-connect-v8.py"
ACE_DIR = Path("/marimo/SONARA-ACE-Step-1.5")
MODEL = "acestep-v15-xl-turbo"

print("SONARA MoLab XL bridge V10: riparazione automatica ambiente + API persistente", flush=True)

source = urllib.request.urlopen(SOURCE, timeout=60).read().decode("utf-8")
source = source.replace('/marimo/ACE-Step-1.5', str(ACE_DIR))
# Dopo la riparazione manuale delle dipendenze, uv run non deve risincronizzare e rimuoverle.
source = source.replace('[uv, "run", "--project",', '[uv, "run", "--no-sync", "--project",')

scope = {
    "__name__": "sonara_molab_bridge_v10_base",
    "__file__": SOURCE,
}
exec(compile(source, SOURCE, "exec"), scope, scope)

run_checked = scope["run_checked"]
clean_uv_env = scope["clean_uv_env"]

PACKAGE_MAP = {
    "loguru": "loguru>=0.7.3",
    "wrapt": "wrapt",
    "dotenv": "python-dotenv",
    "yaml": "PyYAML",
    "PIL": "pillow",
    "cv2": "opencv-python-headless",
    "sklearn": "scikit-learn",
    "librosa": "librosa",
    "soundfile": "soundfile>=0.13.1",
    "einops": "einops>=0.8.1",
    "accelerate": "accelerate>=1.12.0",
    "transformers": "transformers>=4.51.0,<4.58.0",
    "diffusers": "diffusers>=0.37.0",
    "numba": "numba>=0.63.1",
    "vector_quantize_pytorch": "vector-quantize-pytorch>=1.27.15",
    "diskcache": "diskcache",
    "toml": "toml",
    "matplotlib": "matplotlib>=3.7.5",
    "scipy": "scipy>=1.10.1",
    "fastapi": "fastapi>=0.110.0",
    "uvicorn": "uvicorn[standard]>=0.27.0",
    "peft": "peft>=0.18.0",
    "lightning": "lightning>=2.0.0",
    "xxhash": "xxhash",
    "huggingface_hub": "huggingface-hub",
    "safetensors": "safetensors",
    "aiofiles": "aiofiles",
    "gradio": "gradio==6.2.0",
    "typer": "typer",
    "sentencepiece": "sentencepiece",
    "tiktoken": "tiktoken",
    "omegaconf": "omegaconf",
    "pkg_resources": "setuptools",
}

GPU_PACKAGES = {"torch", "torchvision", "torchaudio", "torchcodec", "torchao", "flash_attn", "triton"}


def repair_runtime_imports(uv, env, python_bin):
    probe_code = (
        "import sys,loguru,torch,fastapi,uvicorn; "
        "import acestep.api_server; "
        "print('PYTHON=' + sys.executable); "
        "print('VERSION=' + sys.version.split()[0]); "
        "print('TORCH=' + torch.__version__); "
        "print('CUDA=' + str(torch.cuda.is_available()))"
    )

    for attempt in range(1, 16):
        result = subprocess.run(
            [str(python_bin), "-c", probe_code],
            cwd=str(ACE_DIR),
            env=env,
            capture_output=True,
            text=True,
        )
        if result.returncode == 0:
            print(result.stdout.strip(), flush=True)
            if "VERSION=3.12" not in result.stdout:
                raise RuntimeError("Il venv ACE-Step non sta usando Python 3.12.")
            if "CUDA=True" not in result.stdout:
                raise RuntimeError("Il venv ACE-Step non vede CUDA/GPU.")
            return

        combined = (result.stdout or "") + "\n" + (result.stderr or "")
        match = re.search(r"ModuleNotFoundError: No module named ['\"]([^'\"]+)['\"]", combined)
        if not match:
            raise RuntimeError("Probe ACE-Step fallito:\n" + combined[-12000:])

        missing = match.group(1).split(".")[0]
        if missing in GPU_PACKAGES:
            raise RuntimeError(
                f"Dipendenza GPU critica mancante: {missing}. Non la reinstallo automaticamente per non rompere CUDA.\n"
                + combined[-8000:]
            )

        package = PACKAGE_MAP.get(missing, missing)
        print(f"AUTO-REPAIR {attempt}/15: manca '{missing}' -> installo '{package}'", flush=True)
        run_checked(
            [uv, "pip", "install", "--python", str(python_bin), package],
            cwd=str(ACE_DIR),
            env=env,
            timeout=1800,
        )

    raise RuntimeError("Troppe dipendenze mancanti durante il bootstrap ACE-Step.")


def ensure_project_env_v10():
    if not ACE_DIR.exists():
        raise RuntimeError(f"ACE-Step non trovato: {ACE_DIR}")

    uv = shutil.which("uv")
    if not uv:
        raise RuntimeError("uv non trovato su MoLab.")

    env = clean_uv_env()
    print(f"ACE_DIR={ACE_DIR}", flush=True)
    print("Sincronizzo il progetto ACE-Step con Python 3.12 senza toccare i checkpoint XL-Turbo.", flush=True)

    run_checked([uv, "python", "install", "3.12"], env=env, timeout=600)
    run_checked(
        [uv, "sync", "--project", str(ACE_DIR), "--python", "3.12", "--no-dev"],
        cwd=str(ACE_DIR),
        env=env,
        timeout=3600,
    )

    python_bin = ACE_DIR / ".venv" / "bin" / "python"
    if not python_bin.exists():
        raise RuntimeError(f"Python del venv non trovato: {python_bin}")

    repair_runtime_imports(uv, env, python_bin)
    print("Ambiente ACE-Step riparato e verificato.", flush=True)
    return uv, env


scope["ensure_project_env"] = ensure_project_env_v10
scope["main"]()

print("\nSONARA MOLAB BRIDGE ATTIVO. NON FERMARE QUESTA CELLA.", flush=True)
print("La cella resta viva per mantenere disponibile il motore MoLab XL-Turbo.", flush=True)
try:
    while True:
        time.sleep(3600)
except KeyboardInterrupt:
    print("SONARA MoLab bridge arrestato.", flush=True)
