#!/usr/bin/env python3
from __future__ import annotations

import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(os.environ.get("SONARA_YUE_V9_ROOT", "/marimo/YuE-exllamav2")).resolve()
VENV = Path(os.environ.get("SONARA_YUE_V9_VENV", "/marimo/venvs/sonara-yue-v9")).resolve()
MODELS = Path(os.environ.get("SONARA_YUE_V9_MODEL_ROOT", "/marimo/models/yue-exl2")).resolve()
STAGE1_DIR = MODELS / "stage1-8bpw"
STAGE2_DIR = MODELS / "stage2-8bpw"
WORKER = Path(os.environ.get("SONARA_YUE_V9_WORKER", "/marimo/sonara_yue_worker_v9_exl2.py")).resolve()
LOG = Path(os.environ.get("SONARA_YUE_V9_LOG", "/marimo/sonara_yue_worker_v9_exl2.log")).resolve()
PORT = int(os.environ.get("SONARA_YUE_PORT", "8012"))

REPO = "https://github.com/sgsdxzy/YuE-exllamav2.git"
XCODEC_REPO = "https://huggingface.co/m-a-p/xcodec_mini_infer"
WORKER_URL = (
    "https://raw.githubusercontent.com/alo986761986-gif/"
    "Sonara-Enterprise/main/scripts/sonara_yue_worker_v9_exl2.py"
)
STAGE1_REPO = "Doctor-Shotgun/YuE-s1-7B-anneal-en-cot-exl2"
STAGE2_REPO = "Doctor-Shotgun/YuE-s2-1B-general-exl2"
REVISION = "8.0bpw-h8"


def run(command, *, cwd=None, env=None, check=True):
    print("$", " ".join(map(str, command)), flush=True)
    return subprocess.run(command, cwd=str(cwd) if cwd else None, env=env, check=check)


def output(command):
    return subprocess.run(command, capture_output=True, text=True, check=False).stdout.strip()


def ensure_command(name: str):
    if shutil.which(name):
        return
    raise RuntimeError(f"Comando richiesto non trovato: {name}")


def choose_python() -> str:
    candidates = [
        shutil.which("python3.12"),
        shutil.which("python3.11"),
        shutil.which("python3.10"),
        shutil.which("python3"),
        sys.executable,
    ]
    for candidate in candidates:
        if not candidate:
            continue
        result = subprocess.run(
            [candidate, "-c", "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')"],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            continue
        try:
            major, minor = map(int, result.stdout.strip().split("."))
        except Exception:
            continue
        if major == 3 and 10 <= minor <= 13:
            return candidate
    raise RuntimeError("Serve Python 3.10-3.13 per YuE-exllamav2.")


def ensure_repo():
    ensure_command("git")
    if not ROOT.exists():
        ROOT.parent.mkdir(parents=True, exist_ok=True)
        run(["git", "clone", "--depth", "1", REPO, str(ROOT)])
    elif (ROOT / ".git").exists():
        run(["git", "fetch", "--depth", "1", "origin", "main"], cwd=ROOT, check=False)
        run(["git", "reset", "--hard", "origin/main"], cwd=ROOT, check=False)

    xcodec = ROOT / "xcodec_mini_infer"
    if not xcodec.exists():
        run(["git", "clone", "--depth", "1", XCODEC_REPO, str(xcodec)])

    # The fork imports codec assets from src/yue/xcodec_mini_infer in its defaults.
    source_link = ROOT / "src" / "yue" / "xcodec_mini_infer"
    if not source_link.exists():
        try:
            source_link.symlink_to(xcodec, target_is_directory=True)
        except Exception:
            shutil.copytree(xcodec, source_link)


def ensure_venv() -> Path:
    python = choose_python()
    python_path = VENV / "bin" / "python"
    if not python_path.exists():
        VENV.parent.mkdir(parents=True, exist_ok=True)
        run([python, "-m", "venv", str(VENV)])

    pip = [str(python_path), "-m", "pip"]
    run(pip + ["install", "--upgrade", "pip", "setuptools", "wheel"])

    # Official YuE-exllamav2 requirements pin torch 2.6/CUDA 12.4 and provide
    # matching Linux ExLlamaV2 and FlashAttention wheels for Python 3.10-3.13.
    run(pip + ["install", "-r", str(ROOT / "requirements.txt")])
    run(pip + ["install", "huggingface_hub>=0.28.0", "soundfile"])

    return python_path


def download_models(python_path: Path):
    MODELS.mkdir(parents=True, exist_ok=True)
    code = r'''
import os
from huggingface_hub import snapshot_download

root = os.environ["SONARA_MODELS"]
revision = "8.0bpw-h8"
models = [
    ("Doctor-Shotgun/YuE-s1-7B-anneal-en-cot-exl2", os.path.join(root, "stage1-8bpw")),
    ("Doctor-Shotgun/YuE-s2-1B-general-exl2", os.path.join(root, "stage2-8bpw")),
]
for repo_id, local_dir in models:
    print(f"Scarico {repo_id}@{revision} -> {local_dir}", flush=True)
    snapshot_download(
        repo_id=repo_id,
        revision=revision,
        local_dir=local_dir,
        local_dir_use_symlinks=False,
        token=os.environ.get("HF_TOKEN") or None,
    )
'''
    env = os.environ.copy()
    env["SONARA_MODELS"] = str(MODELS)
    run([str(python_path), "-c", code], env=env)

    for directory in [STAGE1_DIR, STAGE2_DIR]:
        required = [directory / "config.json", directory / "output.safetensors", directory / "tokenizer.model"]
        missing = [str(path) for path in required if not path.exists()]
        if missing:
            raise RuntimeError(f"Modello EXL2 incompleto in {directory}: {missing}")


def ensure_worker():
    request = urllib.request.Request(WORKER_URL, headers={"User-Agent": "SONARA-YuE-V9-Bootstrap"})
    with urllib.request.urlopen(request, timeout=30) as response:
        text = response.read().decode("utf-8")
    compile(text, str(WORKER), "exec")
    WORKER.write_text(text, encoding="utf-8")


def verify_stack(python_path: Path):
    test = r'''
import torch
import exllamav2
try:
    import flash_attn
    fa = "yes"
except Exception as exc:
    fa = f"no:{type(exc).__name__}"
print("torch", torch.__version__)
print("cuda", torch.version.cuda)
print("gpu", torch.cuda.get_device_name(0) if torch.cuda.is_available() else "NONE")
print("vram_gb", round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 2) if torch.cuda.is_available() else 0)
print("exllamav2", getattr(exllamav2, "__version__", "ok"))
print("flash_attn", fa)
'''
    run([str(python_path), "-c", test])


def stop_old_workers():
    names = [
        "sonara_yue_worker_v9_exl2.py",
        "sonara_yue_worker_v7_maxspeed.py",
        "sonara_yue_worker_v6_ultra.py",
        "sonara_yue_worker_v5_turbo.py",
        "sonara_yue_worker_v4.py",
        "sonara_yue_worker.py",
    ]
    for name in names:
        subprocess.run(["pkill", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    time.sleep(2)


def start_worker(python_path: Path):
    env = os.environ.copy()
    env.update(
        {
            "SONARA_YUE_V9_ROOT": str(ROOT),
            "SONARA_YUE_V9_XCODEC": str(ROOT / "xcodec_mini_infer"),
            "SONARA_YUE_V9_STAGE1_MODEL": str(STAGE1_DIR),
            "SONARA_YUE_V9_STAGE2_MODEL": str(STAGE2_DIR),
            "SONARA_YUE_V9_OUTPUT": str(ROOT / "sonara_api_output_v9"),
            "SONARA_YUE_PORT": str(PORT),
            "SONARA_YUE_MAX_DURATION": "480",
            "SONARA_YUE_V9_SLOTS": os.environ.get("SONARA_YUE_V9_SLOTS", "2"),
            "SONARA_YUE_V9_STAGE1_CACHE": os.environ.get("SONARA_YUE_V9_STAGE1_CACHE", "16384"),
            "SONARA_YUE_V9_STAGE2_CACHE": os.environ.get("SONARA_YUE_V9_STAGE2_CACHE", "65536"),
            "SONARA_YUE_V9_STAGE1_CACHE_MODE": os.environ.get("SONARA_YUE_V9_STAGE1_CACHE_MODE", "FP16"),
            "SONARA_YUE_V9_STAGE2_CACHE_MODE": os.environ.get("SONARA_YUE_V9_STAGE2_CACHE_MODE", "FP16"),
            "SONARA_YUE_V9_GUIDANCE": os.environ.get("SONARA_YUE_V9_GUIDANCE", "0"),
            "PYTHONUNBUFFERED": "1",
            "CUDA_MODULE_LOADING": "LAZY",
            "TOKENIZERS_PARALLELISM": "false",
            "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
        }
    )

    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("ab", buffering=0) as log:
        process = subprocess.Popen(
            [str(python_path), str(WORKER)],
            stdout=log,
            stderr=subprocess.STDOUT,
            env=env,
            start_new_session=True,
        )
    return process


def probe_health(timeout=5):
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=timeout) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except Exception as exc:
        return 0, str(exc)


def main():
    print("=" * 80)
    print("SONARA YUE V9 BOOTSTRAP - EXLLAMAV2 RTX PRO 6000")
    print("=" * 80)

    ensure_repo()
    python_path = ensure_venv()
    print("Python V9:", python_path)
    verify_stack(python_path)
    download_models(python_path)
    ensure_worker()
    stop_old_workers()
    process = start_worker(python_path)
    print("Worker V9 PID:", process.pid)

    last = ""
    for attempt in range(1, 181):
        status, body = probe_health(timeout=4)
        last = body
        if status == 200 and '"ready": true' in body:
            print("=" * 80)
            print("✅ SONARA YUE V9 EXLLAMAV2 PRONTO")
            print("✅ MODELLI EXL2 RESIDENTI IN GPU")
            print("✅ STAGE1 8.0 BPW")
            print("✅ STAGE2 8.0 BPW")
            print("✅ DUAL GPU SLOTS:", os.environ.get("SONARA_YUE_V9_SLOTS", "2"))
            print("✅ PORTA:", PORT)
            print("✅ CLOUDFLARE TUNNEL ESISTENTE PUO RESTARE INVARIATO")
            print("")
            print("🚀 V9 READY - ORA SONARA USA IL NUOVO MOTORE SULLA STESSA PORTA 8012")
            print("=" * 80)
            return 0
        if process.poll() is not None:
            break
        if attempt % 10 == 0:
            print(f"Warmup V9 {attempt}s | health={status}")
        time.sleep(1)

    print("❌ V9 non pronto.")
    print("Ultimo health:", last[-4000:])
    if LOG.exists():
        lines = LOG.read_text(encoding="utf-8", errors="ignore").splitlines()
        print("===== ULTIMO LOG V9 =====")
        for line in lines[-120:]:
            print(line)
        print("==========================")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
