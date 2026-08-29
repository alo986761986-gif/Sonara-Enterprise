import json
import os
import platform
import re
import signal
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

MODEL = "acestep-v15-xl-turbo"
ACE_DIR = Path("/marimo/ACE-Step-1.5")
PORT = 8001
WORK = Path("/tmp/sonara-molab-xl")
WORK.mkdir(parents=True, exist_ok=True)


def clean_uv_env():
    env = os.environ.copy()
    env.pop("VIRTUAL_ENV", None)
    env.pop("UV_PROJECT_ENVIRONMENT", None)
    env["UV_PYTHON_DOWNLOADS"] = "automatic"
    return env


def run_checked(cmd, *, cwd=None, env=None, timeout=None):
    print("$ " + " ".join(map(str, cmd)), flush=True)
    result = subprocess.run(
        cmd,
        cwd=cwd,
        env=env,
        capture_output=True,
        text=True,
        timeout=timeout,
    )
    if result.returncode != 0:
        raise RuntimeError(
            f"Comando fallito ({result.returncode}): {' '.join(map(str, cmd))}\n"
            + (result.stdout or "")[-6000:]
            + "\n"
            + (result.stderr or "")[-12000:]
        )
    return result


def ensure_project_env():
    if not ACE_DIR.exists():
        raise RuntimeError(f"ACE-Step non trovato: {ACE_DIR}")
    uv = shutil.which("uv")
    if not uv:
        raise RuntimeError("uv non trovato su MoLab.")

    env = clean_uv_env()
    print("Preparo l'ambiente UFFICIALE del progetto ACE-Step con Python 3.12.", flush=True)
    print("I checkpoint/modelli XL-Turbo in /marimo/ACE-Step-1.5/checkpoints NON vengono rimossi.", flush=True)

    run_checked([uv, "python", "install", "3.12"], env=env, timeout=600)
    run_checked(
        [uv, "sync", "--project", str(ACE_DIR), "--python", "3.12", "--no-dev"],
        cwd=str(ACE_DIR),
        env=env,
        timeout=3600,
    )

    probe_code = (
        "import sys,loguru,torch,fastapi,uvicorn; "
        "import acestep.api_server; "
        "print('PYTHON=' + sys.executable); "
        "print('VERSION=' + sys.version.split()[0]); "
        "print('TORCH=' + torch.__version__); "
        "print('CUDA=' + str(torch.cuda.is_available()))"
    )
    probe = run_checked(
        [uv, "run", "--project", str(ACE_DIR), "--python", "3.12", "python", "-c", probe_code],
        cwd=str(ACE_DIR),
        env=env,
        timeout=600,
    )
    print(probe.stdout.strip(), flush=True)
    if "VERSION=3.12" not in probe.stdout:
        raise RuntimeError("uv non sta usando Python 3.12 nel progetto ACE-Step.")
    if "CUDA=True" not in probe.stdout:
        raise RuntimeError("Il Python 3.12 ACE-Step non vede CUDA/GPU.")
    return uv, env


def request_json(url, payload=None, timeout=30):
    data = None
    method = "GET"
    headers = {"Accept": "application/json", "Cache-Control": "no-cache"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        method = "POST"
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8", errors="replace")
        return response.status, json.loads(raw) if raw else {}


def health_body(base="http://127.0.0.1:8001"):
    try:
        return request_json(base + "/health", timeout=10)[1]
    except Exception:
        return None


def health_ready(body):
    if not isinstance(body, dict):
        return False
    data = body.get("data") or body
    return (
        str(data.get("status") or "").lower() == "ok"
        and data.get("models_initialized") is True
        and MODEL in str(data.get("loaded_model") or "")
    )


def stop_old_api():
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
        if "acestep-api" in cmd and "8001" in cmd:
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
        elif "acestep.api_server" in cmd and "8001" in cmd:
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
    time.sleep(1)


def start_api(uv, uv_env):
    existing = health_body()
    if health_ready(existing):
        print("ACE-Step XL API già attiva e pronta.", flush=True)
        return

    stop_old_api()
    env = uv_env.copy()
    env.update({
        "ACESTEP_CONFIG_PATH": MODEL,
        "ACESTEP_DEVICE": "cuda",
        "ACESTEP_INIT_LLM": "false",
        "ACESTEP_USE_FLASH_ATTENTION": "true",
        "ACESTEP_OFFLOAD_TO_CPU": "false",
        "ACESTEP_OFFLOAD_DIT_TO_CPU": "false",
        "ACESTEP_LM_OFFLOAD_TO_CPU": "false",
        "ACESTEP_API_HOST": "0.0.0.0",
        "ACESTEP_API_PORT": str(PORT),
        "ACESTEP_API_WORKERS": "1",
        "ACESTEP_QUEUE_WORKERS": "1",
        "ACESTEP_QUEUE_MAXSIZE": "64",
        "ACESTEP_BATCH_SIZE": "2",
        "ACESTEP_NO_INIT": "true",
        "ACESTEP_DOWNLOAD_SOURCE": "huggingface",
        "TOKENIZERS_PARALLELISM": "false",
        "MPLBACKEND": "Agg",
        "PYTHONUNBUFFERED": "1",
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
    })

    log_path = WORK / "acestep-v8-api.log"
    log = open(log_path, "w", buffering=1)
    cmd = [
        uv, "run", "--project", str(ACE_DIR), "--python", "3.12",
        "acestep-api",
        "--host", "0.0.0.0",
        "--port", str(PORT),
        "--download-source", "huggingface",
        "--no-init",
    ]
    print("Avvio ACE-Step API con lo STESSO ambiente uv verificato sopra...", flush=True)
    proc = subprocess.Popen(
        cmd,
        cwd=str(ACE_DIR),
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f"PID={proc.pid} PORT={PORT}", flush=True)

    deadline = time.time() + 900
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors="ignore")[-20000:] if log_path.exists() else ""
            raise RuntimeError("ACE-Step API terminata:\n" + tail)
        body = health_body()
        if body:
            print("ACE-Step /health OK", flush=True)
            return
        time.sleep(2)

    tail = log_path.read_text(errors="ignore")[-20000:] if log_path.exists() else ""
    raise RuntimeError("Timeout avvio ACE-Step API:\n" + tail)


def ensure_xl():
    body = health_body()
    if health_ready(body):
        print(f"{MODEL} già caricato.", flush=True)
        return body

    print(f"Inizializzo {MODEL} nell'API senza LLM...", flush=True)
    status, init_body = request_json(
        f"http://127.0.0.1:{PORT}/v1/init",
        {"model": MODEL, "slot": 1, "init_llm": False},
        timeout=1200,
    )
    print(f"/v1/init HTTP {status}", flush=True)
    print(json.dumps(init_body, ensure_ascii=False)[:2200], flush=True)

    deadline = time.time() + 900
    last = None
    while time.time() < deadline:
        last = health_body()
        if health_ready(last):
            print(f"{MODEL} PRONTO", flush=True)
            return last
        time.sleep(3)
    raise RuntimeError("XL-Turbo non risulta caricato: " + json.dumps(last, ensure_ascii=False)[:4000])


def cloudflared_binary():
    machine = platform.machine().lower()
    arch = "arm64" if machine in {"aarch64", "arm64"} else "amd64"
    target = WORK / "cloudflared"
    if not target.exists():
        urllib.request.urlretrieve(
            f"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}",
            target,
        )
        target.chmod(0o755)
    return target


def stop_old_tunnel():
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
        if "cloudflared" in cmd and (f"127.0.0.1:{PORT}" in cmd or f"localhost:{PORT}" in cmd):
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
    time.sleep(1)


def start_tunnel():
    binary = cloudflared_binary()
    stop_old_tunnel()
    log_path = WORK / "cloudflared-v8.log"
    log = open(log_path, "w", buffering=1)
    proc = subprocess.Popen(
        [str(binary), "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{PORT}"],
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    pattern = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com", re.I)
    deadline = time.time() + 150
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors="ignore")[-10000:] if log_path.exists() else ""
            raise RuntimeError("Tunnel terminato:\n" + tail)
        text = log_path.read_text(errors="ignore") if log_path.exists() else ""
        match = pattern.search(text)
        if match:
            url = match.group(0).rstrip("/")
            print(f"Tunnel pubblico: {url}", flush=True)
            return url
        time.sleep(1)
    raise RuntimeError("Timeout creazione tunnel Cloudflare.")


def verify_public(base):
    deadline = time.time() + 180
    last = None
    while time.time() < deadline:
        try:
            _, body = request_json(base + "/health", timeout=30)
            last = body
            if health_ready(body):
                return body
        except Exception as exc:
            last = {"error": repr(exc)}
        time.sleep(2)
    raise RuntimeError("Tunnel pubblico non verificato: " + json.dumps(last, ensure_ascii=False)[:4000])


def main():
    print("=" * 76)
    print(" SONARA MOLAB XL-TURBO BRIDGE V8 - UV PROJECT ENV ")
    print("=" * 76)
    print(f"ACE_DIR={ACE_DIR}")

    uv, uv_env = ensure_project_env()
    start_api(uv, uv_env)
    local_health = ensure_xl()
    public_url = start_tunnel()
    public_health = verify_public(public_url)

    (WORK / "sonara-molab-xl-url.txt").write_text(
        f"SONARA_MOLAB_XL_URL={public_url}\nMODEL={MODEL}\nPORT={PORT}\n",
        encoding="utf-8",
    )

    print("\n" + "=" * 76)
    print(" ✅ MOLAB XL-TURBO PRONTO PER SONARA ")
    print("=" * 76)
    print(f"SONARA_MOLAB_XL_URL={public_url}")
    print(f"MODEL={MODEL}")
    print(f"LOCAL_PORT={PORT}")
    print("LOCAL_HEALTH=" + json.dumps(local_health, ensure_ascii=False)[:1200])
    print("PUBLIC_HEALTH=" + json.dumps(public_health, ensure_ascii=False)[:1200])
    print("=" * 76)


if __name__ == "__main__":
    main()
