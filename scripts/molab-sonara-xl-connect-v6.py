import json
import os
import platform
import re
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

MODEL = "acestep-v15-xl-turbo"
ACE_DIR = Path("/marimo/ACE-Step-1.5")
PORT = 8001
WORK = Path("/tmp/sonara-molab-xl")
WORK.mkdir(parents=True, exist_ok=True)


def request_json(url, payload=None, timeout=20):
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


def local(path, payload=None, timeout=20):
    try:
        return request_json(f"http://127.0.0.1:{PORT}{path}", payload, timeout)[1]
    except Exception:
        return None


def health():
    return local("/health", timeout=5)


def inventory():
    for path in ("/v1/model_inventory", "/v1/models"):
        body = local(path, timeout=15)
        if body:
            return body
    return None


def has_xl(value):
    return MODEL in json.dumps(value or {}, ensure_ascii=False)


def env_for_api():
    env = os.environ.copy()
    old_pp = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = f"{ACE_DIR}:{old_pp}" if old_pp else str(ACE_DIR)
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
    return env


def verify_source_import(env):
    if not ACE_DIR.exists():
        raise RuntimeError(f"ACE-Step sorgente non trovato: {ACE_DIR}")
    api_file = ACE_DIR / "acestep" / "api_server.py"
    if not api_file.exists():
        raise RuntimeError(f"api_server.py non trovato: {api_file}")

    test = subprocess.run(
        [
            sys.executable,
            "-c",
            "import sys; sys.path.insert(0, '/marimo/ACE-Step-1.5'); import acestep.api_server; print('ACE_API_IMPORT_OK')",
        ],
        cwd=str(ACE_DIR),
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
    )
    if test.returncode != 0:
        raise RuntimeError(
            "Il Python MoLab vede il sorgente ACE-Step ma l'import API fallisce:\n"
            + (test.stderr or test.stdout or "")[-12000:]
        )
    print("ACE-Step API importabile direttamente dal sorgente: OK", flush=True)


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
        cmd = parts[1]
        if pid != os.getpid() and "acestep.api_server" in cmd and "8001" in cmd:
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
    time.sleep(1)


def start_api():
    if health():
        print(f"ACE-Step API già attiva sulla porta {PORT}.", flush=True)
        return

    env = env_for_api()
    verify_source_import(env)
    stop_old_api()

    log_path = WORK / "acestep-v6-api.log"
    log = open(log_path, "w", buffering=1)
    command = [
        sys.executable,
        "-m",
        "acestep.api_server",
        "--host",
        "0.0.0.0",
        "--port",
        str(PORT),
        "--download-source",
        "huggingface",
        "--no-init",
    ]

    print("Avvio diretto: python -m acestep.api_server (nessun uv sync, nessun reinstall)", flush=True)
    print(f"PYTHON={sys.executable}", flush=True)
    print(f"PYTHONPATH={env['PYTHONPATH']}", flush=True)
    proc = subprocess.Popen(
        command,
        cwd=str(ACE_DIR),
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f"ACE-Step API PID={proc.pid} PORT={PORT}", flush=True)

    deadline = time.time() + 900
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors="ignore")[-16000:] if log_path.exists() else ""
            raise RuntimeError(f"ACE-Step API terminata:\n{tail}")
        h = health()
        if h:
            print("ACE-Step /health OK", flush=True)
            return
        time.sleep(2)

    tail = log_path.read_text(errors="ignore")[-16000:] if log_path.exists() else ""
    raise RuntimeError(f"Timeout API:\n{tail}")


def ensure_xl():
    inv = inventory()
    if has_xl(inv):
        print(f"{MODEL} già rilevato.", flush=True)
        return

    print(f"Carico {MODEL} nell'API (senza LLM)...", flush=True)
    try:
        status, body = request_json(
            f"http://127.0.0.1:{PORT}/v1/init",
            {"model": MODEL, "slot": 1, "init_llm": False},
            900,
        )
        print(f"/v1/init HTTP {status}", flush=True)
        print(json.dumps(body, ensure_ascii=False)[:1800], flush=True)
    except Exception as exc:
        print(f"/v1/init risposta: {exc!r}", flush=True)

    deadline = time.time() + 600
    last = None
    while time.time() < deadline:
        last = inventory()
        if has_xl(last):
            print(f"{MODEL} PRONTO", flush=True)
            return
        time.sleep(3)
    raise RuntimeError(f"XL-Turbo non rilevato dopo init: {json.dumps(last, ensure_ascii=False)[:4000]}")


def cloudflared_binary():
    machine = platform.machine().lower()
    arch = "arm64" if machine in {"aarch64", "arm64"} else "amd64"
    target = WORK / "cloudflared"
    if not target.exists():
        url = f"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}"
        print(f"Scarico solo cloudflared ({arch})...", flush=True)
        urllib.request.urlretrieve(url, target)
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
    log_path = WORK / "cloudflared-v6.log"
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
            tail = log_path.read_text(errors="ignore")[-8000:] if log_path.exists() else ""
            raise RuntimeError(f"Tunnel terminato:\n{tail}")
        text = log_path.read_text(errors="ignore") if log_path.exists() else ""
        match = pattern.search(text)
        if match:
            return match.group(0).rstrip("/")
        time.sleep(1)
    raise RuntimeError("Timeout creazione tunnel.")


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
    raise RuntimeError(f"Tunnel pubblico non verificato: {json.dumps(last, ensure_ascii=False)[:3000]}")


def main():
    print("=" * 76)
    print(" SONARA MOLAB XL-TURBO BRIDGE V6 - DIRECT SOURCE ")
    print("=" * 76)
    print(f"ACE_DIR={ACE_DIR}")
    print(f"PYTHON={sys.executable}")
    print(f"PYTHON_VERSION={sys.version.split()[0]}")

    start_api()
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
