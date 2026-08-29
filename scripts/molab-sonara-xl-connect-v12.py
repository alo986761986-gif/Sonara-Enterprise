import json
import os
import platform
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ACE_DIR = Path("/marimo/SONARA-ACE-Step-1.5")
WORK = Path("/tmp/sonara-molab-xl-v12")
WORK.mkdir(parents=True, exist_ok=True)
MODEL = "acestep-v15-xl-turbo"
PORT = 8001

MODULE_TO_PACKAGE = {
    "loguru": "loguru>=0.7.3",
    "dotenv": "python-dotenv",
    "fastapi": "fastapi>=0.110.0",
    "uvicorn": "uvicorn[standard]>=0.27.0",
    "multipart": "python-multipart>=0.0.18",
    "diskcache": "diskcache",
    "toml": "toml",
    "transformers": "transformers>=4.51.0,<4.58.0",
    "diffusers": "diffusers>=0.37.0",
    "matplotlib": "matplotlib>=3.7.5",
    "scipy": "scipy>=1.10.1",
    "soundfile": "soundfile>=0.13.1",
    "einops": "einops>=0.8.1",
    "accelerate": "accelerate>=1.12.0",
    "numba": "numba>=0.63.1",
    "vector_quantize_pytorch": "vector-quantize-pytorch>=1.27.15",
    "peft": "peft>=0.18.0",
    "lycoris": "lycoris-lora",
    "lightning": "lightning>=2.0.0",
    "tensorboard": "tensorboard>=2.20.0",
    "modelscope": "modelscope",
    "typer": "typer-slim>=0.21.1",
    "pytorch_wavelets": "pytorch-wavelets>=1.3.0",
    "pywt": "pywavelets>=1.9.0",
    "setuptools": "setuptools<72",
    "huggingface_hub": "huggingface-hub",
    "safetensors": "safetensors",
    "yaml": "PyYAML",
    "PIL": "pillow",
    "librosa": "librosa",
    "aiofiles": "aiofiles",
    "sentencepiece": "sentencepiece",
    "tiktoken": "tiktoken",
    "omegaconf": "omegaconf",
}
GPU_CRITICAL = {"torch", "torchvision", "torchaudio", "torchcodec", "torchao", "flash_attn", "flash_attn_4", "triton"}


def run(cmd, *, cwd=None, env=None, timeout=None, check=True):
    print("$ " + " ".join(map(str, cmd)), flush=True)
    p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout)
    if p.stdout:
        print(p.stdout.rstrip(), flush=True)
    if p.stderr and p.returncode != 0:
        print(p.stderr.rstrip(), flush=True)
    if check and p.returncode != 0:
        raise RuntimeError(f"Comando fallito ({p.returncode}): {' '.join(map(str, cmd))}\n{(p.stdout or '')[-6000:]}\n{(p.stderr or '')[-12000:]}")
    return p


def json_get(url, timeout=20):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8", errors="replace")
        return r.status, json.loads(raw) if raw else {}


def choose_cuda_python():
    candidates = []
    for value in [
        "/marimo/.venv/bin/python",
        "/tmp/uv-venv/bin/python",
        sys.executable,
        str(ACE_DIR / ".venv" / "bin" / "python"),
        "/usr/local/bin/python3.12",
        "/usr/bin/python3.12",
    ]:
        if value and value not in candidates and Path(value).exists():
            candidates.append(value)

    print("Cerco l'ambiente Python che vede davvero la GPU MoLab...", flush=True)
    for py in candidates:
        probe = subprocess.run(
            [py, "-c", "import sys,torch; print(sys.version.split()[0]); print(torch.__version__); print(torch.cuda.is_available()); print(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NO_GPU')"],
            capture_output=True,
            text=True,
        )
        if probe.returncode == 0 and "\nTrue\n" in "\n" + probe.stdout:
            print(f"PYTHON CUDA SELEZIONATO: {py}", flush=True)
            print(probe.stdout.strip(), flush=True)
            return py
        else:
            print(f"Scarto {py}: CUDA non disponibile o torch non importabile", flush=True)
    raise RuntimeError("Nessun ambiente Python MoLab con CUDA disponibile.")


def uv_install(uv, py, *packages, no_deps=False):
    cmd = [uv, "pip", "install", "--python", py]
    if no_deps:
        cmd.append("--no-deps")
    cmd.extend(packages)
    return run(cmd, cwd=str(ACE_DIR), timeout=1800)


def repair_api_environment(py):
    uv = shutil.which("uv") or "/usr/local/bin/uv"
    if not Path(uv).exists():
        raise RuntimeError("uv non trovato su MoLab")

    print("Installazione minima e sicura nell'ambiente CUDA esistente...", flush=True)
    uv_install(uv, py, "loguru>=0.7.3", "python-dotenv", "fastapi>=0.110.0", "uvicorn[standard]>=0.27.0", "python-multipart>=0.0.18")
    uv_install(uv, py, "-e", str(ACE_DIR), no_deps=True)

    nano = ACE_DIR / "acestep" / "third_parts" / "nano-vllm"
    if (nano / "pyproject.toml").exists():
        try:
            uv_install(uv, py, "-e", str(nano), no_deps=True)
        except Exception:
            pass

    probe_code = (
        "import sys,loguru,torch,fastapi,uvicorn; "
        "import acestep.api_server; "
        "print('PYTHON=' + sys.executable); "
        "print('LOGURU=OK'); "
        "print('TORCH=' + torch.__version__); "
        "print('CUDA=' + str(torch.cuda.is_available())); "
        "print('ACE_STEP_API=OK')"
    )

    for attempt in range(1, 25):
        p = subprocess.run([py, "-c", probe_code], cwd=str(ACE_DIR), capture_output=True, text=True)
        if p.returncode == 0:
            print(p.stdout.strip(), flush=True)
            if "CUDA=True" not in p.stdout:
                raise RuntimeError("L'ambiente selezionato ha perso CUDA.")
            return uv

        combined = (p.stdout or "") + "\n" + (p.stderr or "")
        m = re.search(r"ModuleNotFoundError: No module named ['\"]([^'\"]+)['\"]", combined)
        if not m:
            raise RuntimeError("Import ACE-Step API fallito:\n" + combined[-16000:])

        missing = m.group(1).split(".")[0]
        if missing in GPU_CRITICAL:
            raise RuntimeError(f"Dipendenza GPU critica mancante nell'ambiente CUDA: {missing}.\n" + combined[-8000:])
        package = MODULE_TO_PACKAGE.get(missing, missing)
        print(f"AUTO-REPAIR {attempt}/24: {missing} -> {package}", flush=True)
        uv_install(uv, py, package)

    raise RuntimeError("Bootstrap dipendenze ACE-Step non completato.")


def stop_processes():
    try:
        rows = subprocess.check_output(["ps", "-eo", "pid=,args="], text=True)
    except Exception:
        return
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        cmd = parts[1].lower()
        if ("acestep.api_server" in cmd and "8001" in cmd) or ("acestep-api" in cmd and "8001" in cmd):
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
        if "cloudflared" in cmd and ("127.0.0.1:8001" in cmd or "localhost:8001" in cmd):
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
    time.sleep(2)


def health_ready(body):
    if not isinstance(body, dict):
        return False
    data = body.get("data") or body
    return (
        str(data.get("status") or "").lower() == "ok"
        and data.get("models_initialized") is True
        and MODEL in str(data.get("loaded_model") or "")
    )


def start_api(py):
    stop_processes()
    env = os.environ.copy()
    env.update({
        "ACESTEP_CONFIG_PATH": MODEL,
        "ACESTEP_DEVICE": "cuda",
        "ACESTEP_INIT_LLM": "false",
        "ACESTEP_USE_FLASH_ATTENTION": "false",
        "ACESTEP_OFFLOAD_TO_CPU": "false",
        "ACESTEP_OFFLOAD_DIT_TO_CPU": "false",
        "ACESTEP_LM_OFFLOAD_TO_CPU": "false",
        "ACESTEP_NO_INIT": "false",
        "ACESTEP_API_HOST": "0.0.0.0",
        "ACESTEP_API_PORT": str(PORT),
        "ACESTEP_API_WORKERS": "1",
        "ACESTEP_QUEUE_WORKERS": "1",
        "ACESTEP_QUEUE_MAXSIZE": "64",
        "ACESTEP_DOWNLOAD_SOURCE": "huggingface",
        "TOKENIZERS_PARALLELISM": "false",
        "MPLBACKEND": "Agg",
        "PYTHONUNBUFFERED": "1",
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
    })
    log_path = WORK / "acestep-api.log"
    log = open(log_path, "w", buffering=1)
    cmd = [py, "-m", "acestep.api_server", "--host", "0.0.0.0", "--port", str(PORT), "--download-source", "huggingface"]
    print("Avvio ACE-Step REST API e carico XL-Turbo...", flush=True)
    proc = subprocess.Popen(cmd, cwd=str(ACE_DIR), env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    print(f"ACE_STEP_API_PID={proc.pid}", flush=True)

    deadline = time.time() + 1200
    last = None
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors="ignore")[-24000:] if log_path.exists() else ""
            raise RuntimeError("ACE-Step API terminata durante l'avvio:\n" + tail)
        try:
            _, body = json_get(f"http://127.0.0.1:{PORT}/health", timeout=10)
            last = body
            if health_ready(body):
                print("ACE-Step API + XL-Turbo PRONTI", flush=True)
                print(json.dumps(body, ensure_ascii=False)[:2000], flush=True)
                return proc
        except Exception:
            pass
        time.sleep(3)

    tail = log_path.read_text(errors="ignore")[-24000:] if log_path.exists() else ""
    raise RuntimeError("Timeout caricamento XL-Turbo. Ultimo health=" + json.dumps(last, ensure_ascii=False)[:3000] + "\n" + tail)


def cloudflared_binary():
    for candidate in [Path("/tmp/cloudflared"), WORK / "cloudflared"]:
        if candidate.exists() and os.access(candidate, os.X_OK):
            return candidate
    machine = platform.machine().lower()
    arch = "arm64" if machine in {"arm64", "aarch64"} else "amd64"
    target = WORK / "cloudflared"
    urllib.request.urlretrieve(
        f"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}",
        target,
    )
    target.chmod(0o755)
    return target


def start_tunnel():
    binary = cloudflared_binary()
    log_path = WORK / "cloudflared.log"
    log = open(log_path, "w", buffering=1)
    proc = subprocess.Popen(
        [str(binary), "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{PORT}"],
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    pattern = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com", re.I)
    deadline = time.time() + 180
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors="ignore")[-12000:] if log_path.exists() else ""
            raise RuntimeError("Cloudflare tunnel terminato:\n" + tail)
        text = log_path.read_text(errors="ignore") if log_path.exists() else ""
        m = pattern.search(text)
        if m:
            url = m.group(0).rstrip("/")
            print(f"TUNNEL={url}", flush=True)
            return proc, url
        time.sleep(1)
    raise RuntimeError("Cloudflare non ha restituito un URL pubblico.")


def verify_public(url):
    deadline = time.time() + 180
    last = None
    while time.time() < deadline:
        try:
            _, body = json_get(url + "/health", timeout=20)
            last = body
            if health_ready(body):
                return body
        except Exception as exc:
            last = {"error": repr(exc)}
        time.sleep(2)
    raise RuntimeError("Tunnel pubblico non verificato: " + json.dumps(last, ensure_ascii=False)[:4000])


def main():
    print("=" * 78)
    print(" SONARA MOLAB XL-TURBO BRIDGE V12 - FIX DEFINITIVO AMBIENTE CUDA ")
    print("=" * 78)
    if not ACE_DIR.exists():
        raise RuntimeError(f"ACE-Step non trovato: {ACE_DIR}")

    py = choose_cuda_python()
    repair_api_environment(py)
    api_proc = start_api(py)
    tunnel_proc, public_url = start_tunnel()
    public_health = verify_public(public_url)

    print("\n" + "=" * 78)
    print(" ✅ SONARA MOLAB XL-TURBO PRONTO ")
    print("=" * 78)
    print(f"SONARA_MOLAB_XL_URL={public_url}")
    print(f"MODEL={MODEL}")
    print(f"LOCAL_PORT={PORT}")
    print(f"PYTHON_CUDA={py}")
    print("PUBLIC_HEALTH=" + json.dumps(public_health, ensure_ascii=False)[:1800])
    print("=" * 78)
    print("NON FERMARE QUESTA CELLA: mantiene vivi API e tunnel.", flush=True)

    while True:
        if api_proc.poll() is not None:
            raise RuntimeError("ACE-Step API si è fermata. Controlla " + str(WORK / "acestep-api.log"))
        if tunnel_proc.poll() is not None:
            raise RuntimeError("Cloudflare tunnel si è fermato. Controlla " + str(WORK / "cloudflared.log"))
        time.sleep(30)


if __name__ == "__main__":
    main()
