#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path("/marimo/YuE-exllamav2")
VENV = Path("/marimo/venvs/sonara-yue-v9-blackwell")
MODELS = Path("/marimo/models/yue-exl2")
STAGE1 = MODELS / "stage1-8bpw"
STAGE2 = MODELS / "stage2-8bpw"
WORKER = Path("/marimo/sonara_yue_worker_v9_exl2.py")
LOG = Path("/marimo/sonara_yue_worker_v9_exl2.log")
INSTALL_LOG = Path("/marimo/sonara_yue_v9_install.log")
PORT = int(os.environ.get("SONARA_YUE_PORT", "8012"))

YUE_REPO = "https://github.com/sgsdxzy/YuE-exllamav2.git"
WORKER_URL = "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/sonara_yue_worker_v9_exl2.py"
EXL2_WHEEL = "https://github.com/turboderp-org/exllamav2/releases/download/v0.3.2/exllamav2-0.3.2+cu128.torch2.9.0-cp312-cp312-linux_x86_64.whl"
FA2_WHEEL = "https://github.com/Dao-AILab/flash-attention/releases/download/v2.8.3/flash_attn-2.8.3+cu12torch2.9cxx11abiTRUE-cp312-cp312-linux_x86_64.whl"


def log(text=""):
    print(text, flush=True)
    INSTALL_LOG.parent.mkdir(parents=True, exist_ok=True)
    with INSTALL_LOG.open("a", encoding="utf-8") as fh:
        fh.write(str(text) + "\n")


def run(cmd, *, cwd=None, env=None, check=True):
    log("$ " + " ".join(map(str, cmd)))
    with INSTALL_LOG.open("a", encoding="utf-8") as fh:
        result = subprocess.run(
            [str(x) for x in cmd],
            cwd=str(cwd) if cwd else None,
            env=env,
            stdout=fh,
            stderr=subprocess.STDOUT,
            text=True,
            check=False,
        )
    if check and result.returncode != 0:
        raise RuntimeError(f"Comando fallito rc={result.returncode}: {' '.join(map(str, cmd))}")
    return result


def capture(cmd):
    return subprocess.run([str(x) for x in cmd], capture_output=True, text=True, check=False)


def python312():
    candidates = [
        shutil.which("python3.12"),
        "/usr/bin/python3.12",
        "/usr/local/bin/python3.12",
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            r = capture([candidate, "-c", "import sys; print(sys.executable)"])
            if r.returncode == 0:
                return r.stdout.strip() or candidate

    uv = shutil.which("uv")
    if uv:
        log("Python 3.12 non presente: lo preparo con uv...")
        run([uv, "python", "install", "3.12"])
        r = capture([uv, "python", "find", "3.12"])
        if r.returncode == 0 and r.stdout.strip():
            return r.stdout.strip()

    raise RuntimeError("Python 3.12 non disponibile e uv non presente per installarlo.")


def gpu_info():
    r = capture([
        "nvidia-smi",
        "--query-gpu=name,driver_version,memory.total",
        "--format=csv,noheader,nounits",
    ])
    if r.returncode == 0:
        log("GPU: " + r.stdout.strip())
    else:
        log("ATTENZIONE: nvidia-smi non disponibile")


def ensure_repo():
    if not ROOT.exists():
        run(["git", "clone", "--depth", "1", YUE_REPO, str(ROOT)])
    elif (ROOT / ".git").exists():
        run(["git", "fetch", "--depth", "1", "origin", "main"], cwd=ROOT, check=False)
        run(["git", "reset", "--hard", "origin/main"], cwd=ROOT, check=False)


def ensure_venv(py312):
    py = VENV / "bin" / "python"
    if not py.exists():
        VENV.parent.mkdir(parents=True, exist_ok=True)
        run([py312, "-m", "venv", str(VENV)])
    run([py, "-m", "pip", "install", "--upgrade", "pip", "setuptools", "wheel"])
    return py


def install_stack(py):
    log("Installo stack BLACKWELL CUDA 12.8...")
    run([
        py, "-m", "pip", "install", "--upgrade",
        "torch==2.9.0", "torchaudio==2.9.0",
        "--index-url", "https://download.pytorch.org/whl/cu128",
    ])

    req = ROOT / "requirements.txt"
    generic = Path("/tmp/sonara_yue_v9_generic_requirements.txt")
    lines = []
    for line in req.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s or s.startswith("#"):
            continue
        lower = s.lower()
        if lower.startswith("--extra-index-url"):
            continue
        if lower.startswith("torch==") or lower == "torchaudio" or lower.startswith("torchaudio=="):
            continue
        if lower.startswith("scipy=="):
            continue
        if lower.startswith("exllamav2 @") or lower.startswith("flash-attn @"):
            continue
        lines.append(s)
    lines.append("scipy>=1.14.1,<2")
    lines.append("huggingface_hub>=0.28.0")
    lines.append("soundfile")
    generic.write_text("\n".join(lines) + "\n", encoding="utf-8")
    run([py, "-m", "pip", "install", "-r", generic])

    run([py, "-m", "pip", "install", EXL2_WHEEL])
    run([py, "-m", "pip", "install", FA2_WHEEL])


def verify_stack(py):
    test = r'''
import json, torch
import exllamav2
import flash_attn
assert torch.cuda.is_available(), "CUDA non disponibile"
cap = torch.cuda.get_device_capability(0)
x = torch.randn((1024,1024), device="cuda", dtype=torch.float16)
y = x @ x
print(json.dumps({
  "torch": torch.__version__,
  "cuda": torch.version.cuda,
  "gpu": torch.cuda.get_device_name(0),
  "capability": cap,
  "vram_gb": round(torch.cuda.get_device_properties(0).total_memory/1024**3,2),
  "exllamav2": getattr(exllamav2, "__version__", "ok"),
  "flash_attn": getattr(flash_attn, "__version__", "ok"),
  "matmul": float(y[0,0].item()),
}))
'''
    r = capture([py, "-c", test])
    log(r.stdout.strip())
    if r.returncode != 0:
        log(r.stderr.strip())
        raise RuntimeError("Verifica CUDA/ExLlamaV2/FlashAttention fallita.")


def ensure_xcodec(py):
    target = ROOT / "xcodec_mini_infer"
    if target.exists():
        return

    existing = Path("/marimo/YuE/inference/xcodec_mini_infer")
    if existing.exists():
        log("Riutilizzo xcodec_mini_infer già funzionante da YuE V8.")
        try:
            target.symlink_to(existing, target_is_directory=True)
            return
        except Exception:
            shutil.copytree(existing, target)
            return

    log("Scarico xcodec_mini_infer con huggingface_hub (senza Git-LFS)...")
    code = f'''
from huggingface_hub import snapshot_download
snapshot_download(repo_id="m-a-p/xcodec_mini_infer", local_dir={str(target)!r})
'''
    run([py, "-c", code])


def link_xcodec_into_src():
    source_link = ROOT / "src" / "yue" / "xcodec_mini_infer"
    target = ROOT / "xcodec_mini_infer"
    if source_link.exists():
        return
    try:
        source_link.symlink_to(target, target_is_directory=True)
    except Exception:
        shutil.copytree(target, source_link)


def download_models(py):
    MODELS.mkdir(parents=True, exist_ok=True)
    code = r'''
import os
from huggingface_hub import snapshot_download
root = os.environ["SONARA_MODELS"]
items = [
    ("Doctor-Shotgun/YuE-s1-7B-anneal-en-cot-exl2", "8.0bpw-h8", os.path.join(root, "stage1-8bpw")),
    ("Doctor-Shotgun/YuE-s2-1B-general-exl2", "8.0bpw-h8", os.path.join(root, "stage2-8bpw")),
]
for repo, rev, path in items:
    print("MODEL", repo, rev, "->", path, flush=True)
    snapshot_download(repo_id=repo, revision=rev, local_dir=path, token=os.environ.get("HF_TOKEN") or None)
'''
    env = os.environ.copy()
    env["SONARA_MODELS"] = str(MODELS)
    run([py, "-c", code], env=env)

    for folder in [STAGE1, STAGE2]:
        required = [folder / "config.json", folder / "output.safetensors", folder / "tokenizer.model"]
        missing = [str(p) for p in required if not p.exists()]
        if missing:
            raise RuntimeError(f"Modello EXL2 incompleto: {missing}")


def ensure_worker():
    req = urllib.request.Request(WORKER_URL, headers={"User-Agent": "SONARA-V9-Blackwell"})
    with urllib.request.urlopen(req, timeout=30) as response:
        text = response.read().decode("utf-8")
    compile(text, str(WORKER), "exec")
    WORKER.write_text(text, encoding="utf-8")


def stop_old_workers():
    for name in [
        "sonara_yue_worker_v9_exl2.py",
        "sonara_yue_worker_v7_maxspeed.py",
        "sonara_yue_worker_v6_ultra.py",
        "sonara_yue_worker_v5_turbo.py",
        "sonara_yue_worker_v4.py",
        "sonara_yue_worker.py",
    ]:
        subprocess.run(["pkill", "-f", name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    time.sleep(2)


def start_worker(py):
    env = os.environ.copy()
    env.update({
        "SONARA_YUE_V9_ROOT": str(ROOT),
        "SONARA_YUE_V9_XCODEC": str(ROOT / "xcodec_mini_infer"),
        "SONARA_YUE_V9_STAGE1_MODEL": str(STAGE1),
        "SONARA_YUE_V9_STAGE2_MODEL": str(STAGE2),
        "SONARA_YUE_V9_OUTPUT": str(ROOT / "sonara_api_output_v9"),
        "SONARA_YUE_PORT": str(PORT),
        "SONARA_YUE_MAX_DURATION": "480",
        "SONARA_YUE_V9_SLOTS": os.environ.get("SONARA_YUE_V9_SLOTS", "2"),
        "SONARA_YUE_V9_STAGE1_CACHE": "16384",
        "SONARA_YUE_V9_STAGE2_CACHE": "65536",
        "SONARA_YUE_V9_STAGE1_CACHE_MODE": "FP16",
        "SONARA_YUE_V9_STAGE2_CACHE_MODE": "FP16",
        "SONARA_YUE_V9_GUIDANCE": "0",
        "PYTHONUNBUFFERED": "1",
        "CUDA_MODULE_LOADING": "LAZY",
        "TOKENIZERS_PARALLELISM": "false",
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
    })
    LOG.parent.mkdir(parents=True, exist_ok=True)
    with LOG.open("ab", buffering=0) as fh:
        return subprocess.Popen([py, WORKER], stdout=fh, stderr=subprocess.STDOUT, env=env, start_new_session=True)


def health():
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/health", timeout=5) as response:
            return response.status, response.read().decode("utf-8", errors="replace")
    except Exception as exc:
        return 0, str(exc)


def tail(path, n=120):
    if not path.exists():
        return ""
    return "\n".join(path.read_text(encoding="utf-8", errors="ignore").splitlines()[-n:])


def main():
    INSTALL_LOG.write_text("", encoding="utf-8")
    log("=" * 80)
    log("SONARA YUE V9 BLACKWELL - RECOVERY BOOTSTRAP")
    log("=" * 80)
    try:
        gpu_info()
        py312 = python312()
        log("Python 3.12: " + py312)
        ensure_repo()
        py = ensure_venv(py312)
        install_stack(py)
        verify_stack(py)
        ensure_xcodec(py)
        link_xcodec_into_src()
        download_models(py)
        ensure_worker()
        stop_old_workers()
        process = start_worker(py)
        log(f"V9 worker PID={process.pid}")

        last = ""
        for sec in range(1, 301):
            status, body = health()
            last = body
            if status == 200:
                try:
                    data = json.loads(body)
                except Exception:
                    data = {}
                engine = data.get("engine") or {}
                if engine.get("ready") is True:
                    log("=" * 80)
                    log("✅ SONARA YUE V9 BLACKWELL PRONTO")
                    log("✅ TORCH CUDA 12.8 STACK")
                    log("✅ EXLLAMAV2 0.3.2")
                    log("✅ FLASH ATTENTION")
                    log("✅ MODELLI EXL2 RESIDENTI GPU")
                    log(f"✅ GPU SLOTS: {engine.get('slots')}")
                    log(f"✅ PORTA: {PORT}")
                    log("🚀 V9 BLACKWELL READY")
                    log("=" * 80)
                    return 0
            if process.poll() is not None:
                raise RuntimeError(f"Worker V9 terminato rc={process.returncode}")
            if sec % 15 == 0:
                log(f"Warmup modelli: {sec}s | HTTP={status}")
            time.sleep(1)

        raise RuntimeError("Timeout warmup V9: " + last[-2000:])
    except Exception as exc:
        log("")
        log("❌ V9 BLACKWELL FALLITO: " + repr(exc))
        log("===== INSTALL LOG FINALE =====")
        log(tail(INSTALL_LOG, 100))
        log("===== WORKER LOG FINALE =====")
        log(tail(LOG, 120))
        log("==============================")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
