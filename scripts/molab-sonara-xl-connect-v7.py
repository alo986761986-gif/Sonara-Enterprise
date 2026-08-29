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
API_ENV = Path("/tmp/sonara-acestep312")
PORT = 8001
WORK = Path("/tmp/sonara-molab-xl")
WORK.mkdir(parents=True, exist_ok=True)


def run(cmd, *, cwd=None, env=None, check=True):
    print("$ " + " ".join(map(str, cmd)), flush=True)
    return subprocess.run(cmd, cwd=cwd, env=env, check=check)


def api_env_base():
    env = os.environ.copy()
    env.pop("VIRTUAL_ENV", None)
    env["UV_PROJECT_ENVIRONMENT"] = str(API_ENV)
    env["UV_PYTHON_DOWNLOADS"] = "automatic"
    return env


def ensure_python312_env():
    if not ACE_DIR.exists():
        raise RuntimeError(f"ACE-Step non trovato: {ACE_DIR}")

    uv = shutil.which("uv")
    if not uv:
        raise RuntimeError("uv non trovato su MoLab.")

    env = api_env_base()
    py = API_ENV / "bin" / "python"

    if py.exists():
        probe = subprocess.run(
            [str(py), "-c", "import sys,loguru,fastapi,uvicorn; print(sys.version.split()[0])"],
            capture_output=True,
            text=True,
        )
        if probe.returncode == 0 and probe.stdout.strip().startswith("3.12"):
            print(f"Ambiente ACE-Step API già pronto: {py} ({probe.stdout.strip()})", flush=True)
            return py

    print("Preparo SOLO l'ambiente API Python 3.12 richiesto da ACE-Step 1.5.", flush=True)
    print("I pesi/model files XL-Turbo non vengono reinstallati.", flush=True)

    run([uv, "python", "install", "3.12"], env=env)
    run(
        [uv, "sync", "--project", str(ACE_DIR), "--python", "3.12", "--no-dev"],
        cwd=str(ACE_DIR),
        env=env,
    )

    if not py.exists():
        raise RuntimeError(f"uv sync completato ma Python API non trovato: {py}")

    probe = subprocess.run(
        [str(py), "-c", "import sys,loguru,fastapi,uvicorn; print(sys.version.split()[0])"],
        capture_output=True,
        text=True,
    )
    if probe.returncode != 0:
        raise RuntimeError("Ambiente Python 3.12 creato ma dipendenze API incomplete:\n" + (probe.stderr or probe.stdout)[-8000:])
    print(f"Ambiente API pronto: Python {probe.stdout.strip()} | loguru/fastapi/uvicorn OK", flush=True)
    return py


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


def local(path, payload=None, timeout=30):
    try:
        return request_json(f"http://127.0.0.1:{PORT}{path}", payload, timeout)[1]
    except Exception:
        return None


def health():
    return local("/health", timeout=5)


def inventory():
    for path in ("/v1/model_inventory", "/v1/models"):
        body = local(path, timeout=20)
        if body:
            return body
    return None


def has_xl(value):
    return MODEL in json.dumps(value or {}, ensure_ascii=False)


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
        if "acestep.api_server" in cmd and "8001" in cmd:
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
    time.sleep(1)


def start_api(py):
    if health():
        print(f"ACE-Step REST API già attiva su {PORT}.", flush=True)
        return

    stop_old_api()
    env = os.environ.copy()
    env["PYTHONPATH"] = str(ACE_DIR) + (":" + env["PYTHONPATH"] if env.get("PYTHONPATH") else "")
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

    log_path = WORK / "acestep-v7-api.log"
    log = open(log_path, "w", buffering=1)
    cmd = [
        str(py), "-m", "acestep.api_server",
        "--host", "0.0.0.0",
        "--port", str(PORT),
        "--download-source", "huggingface",
        "--no-init",
    ]
    print("Avvio REST API ACE-Step con Python 3.12 isolato...", flush=True)
    proc = subprocess.Popen(cmd, cwd=str(ACE_DIR), env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    print(f"PID={proc.pid} PORT={PORT}", flush=True)

    deadline = time.time() + 900
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors="ignore")[-16000:] if log_path.exists() else ""
            raise RuntimeError("ACE-Step API terminata:\n" + tail)
        if health():
            print("ACE-Step /health OK", flush=True)
            return
        time.sleep(2)

    tail = log_path.read_text(errors="ignore")[-16000:] if log_path.exists() else ""
    raise RuntimeError("Timeout avvio API:\n" + tail)


def ensure_xl():
    inv = inventory()
    if has_xl(inv):
        print(f"{MODEL} già pronto nell'API.", flush=True)
        return

    print(f"Collego/carico {MODEL} nell'API senza LLM...", flush=True)
    try:
        status, body = request_json(
            f"http://127.0.0.1:{PORT}/v1/init",
            {"model": MODEL, "slot": 1, "init_llm": False},
            900,
        )
        print(f"/v1/init HTTP {status}", flush=True)
        print(json.dumps(body, ensure_ascii=False)[:1800], flush=True)
    except Exception as exc:
        print(f"/v1/init: {exc!r}", flush=True)

    deadline = time.time() + 600
    last = None
    while time.time() < deadline:
        last = inventory()
        if has_xl(last):
            print(f"{MODEL} PRONTO", flush=True)
            return
        time.sleep(3)
    raise RuntimeError("XL-Turbo non rilevato dopo init: " + json.dumps(last, ensure_ascii=False)[:4000])


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
    log_path = WORK / "cloudflared-v7.log"
    log = open(log_path, "w", buffering=1)
    proc = subprocess.Popen(
        [str(binary), "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{PORT}"],
        stdout=log, stderr=subprocess.STDOUT, start_new_session=True,
    )
    pattern = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com", re.I)
    deadline = time.time() + 150
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors="ignore")[-8000:] if log_path.exists() else ""
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
            _, h = request_json(base + "/health", timeout=20)
            last = h
            for path in ("/v1/model_inventory", "/v1/models"):
                try:
                    _, m = request_json(base + path, timeout=30)
                    if has_xl(m):
                        return h, m
                except Exception:
                    pass
        except Exception as exc:
            last = {"error": repr(exc)}
        time.sleep(2)
    raise RuntimeError("Tunnel pubblico non verificato: " + json.dumps(last, ensure_ascii=False)[:3000])


def main():
    print("=" * 76)
    print(" SONARA MOLAB XL-TURBO BRIDGE V7 - PYTHON 3.12 API ENV ")
    print("=" * 76)
    print(f"ACE_DIR={ACE_DIR}")
    print(f"API_ENV={API_ENV}")

    py = ensure_python312_env()
    start_api(py)
    ensure_xl()
    public_url = start_tunnel()
    h, m = verify_public(public_url)

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
    print("HEALTH=" + json.dumps(h, ensure_ascii=False)[:1000])
    print("MODELS=" + json.dumps(m, ensure_ascii=False)[:1600])
    print("=" * 76)


if __name__ == "__main__":
    main()
