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


def get_json(url, timeout=10):
    req = urllib.request.Request(url, headers={"Accept": "application/json", "Cache-Control": "no-cache"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8", errors="replace")
        return r.status, json.loads(raw) if raw else {}


def post_json(url, payload, timeout=900):
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Accept": "application/json", "Content-Type": "application/json", "Cache-Control": "no-cache"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8", errors="replace")
        return r.status, json.loads(raw) if raw else {}


def health():
    try:
        return get_json(f"http://127.0.0.1:{PORT}/health", 5)[1]
    except Exception:
        return None


def inventory():
    for path in ("/v1/model_inventory", "/v1/models"):
        try:
            return get_json(f"http://127.0.0.1:{PORT}{path}", 10)[1]
        except Exception:
            pass
    return None


def has_xl(value):
    text = json.dumps(value or {}, ensure_ascii=False)
    return MODEL in text


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
        if pid != os.getpid() and "acestep" in cmd.lower() and ("8001" in cmd or "api_server" in cmd or "acestep-api" in cmd):
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
    time.sleep(1)


def base_env():
    env = os.environ.copy()
    current_pythonpath = env.get("PYTHONPATH", "")
    env["PYTHONPATH"] = f"{ACE_DIR}:{current_pythonpath}" if current_pythonpath else str(ACE_DIR)
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


def can_import_with_active_python(env):
    try:
        result = subprocess.run(
            [sys.executable, "-c", "import acestep.api_server; print('ACE_STEP_IMPORT_OK')"],
            cwd=str(ACE_DIR),
            env=env,
            capture_output=True,
            text=True,
            timeout=60,
        )
        if result.returncode == 0:
            print("ACE-Step rilevato nel Python MoLab attivo tramite PYTHONPATH.", flush=True)
            return True
        print("Python attivo non basta; userò il progetto uv ACE-Step già presente.", flush=True)
        tail = (result.stderr or result.stdout or "")[-1500:]
        if tail:
            print(tail, flush=True)
    except Exception as exc:
        print(f"Test Python attivo non riuscito: {exc!r}", flush=True)
    return False


def start_api():
    if health():
        print(f"ACE-Step REST API già attiva su {PORT}.", flush=True)
        return None

    if not ACE_DIR.exists():
        raise RuntimeError(f"Cartella ACE-Step non trovata: {ACE_DIR}")

    env = base_env()
    log_path = WORK / "acestep-v5-api.log"
    log = open(log_path, "w", buffering=1)

    if can_import_with_active_python(env):
        command = [sys.executable, "-m", "acestep.api_server"]
        mode = "active-python+PYTHONPATH"
    else:
        uv = subprocess.run(["bash", "-lc", "command -v uv"], capture_output=True, text=True).stdout.strip()
        if not uv:
            raise RuntimeError("uv non trovato su MoLab.")
        # Questo è lo stesso schema del deploy Blackwell Sonara: uv run acestep-api dalla cartella ACE-Step.
        # Non usa --no-sync: uv riusa cache e ambiente progetto esistente quando disponibili.
        command = [uv, "run", "acestep-api"]
        mode = "uv-project"

    print(f"Avvio ACE-Step API | mode={mode} | python={sys.executable} | cwd={ACE_DIR}", flush=True)
    proc = subprocess.Popen(
        command,
        cwd=str(ACE_DIR),
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f"PID={proc.pid} porta={PORT}", flush=True)

    deadline = time.time() + 900
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors="ignore")[-16000:] if log_path.exists() else ""
            raise RuntimeError(f"ACE-Step API terminata:\n{tail}")
        if health():
            print("ACE-Step /health OK.", flush=True)
            return proc
        time.sleep(2)

    tail = log_path.read_text(errors="ignore")[-16000:] if log_path.exists() else ""
    raise RuntimeError(f"Timeout avvio ACE-Step API:\n{tail}")


def ensure_xl():
    inv = inventory()
    if has_xl(inv):
        print(f"{MODEL} già rilevato nell'inventario.", flush=True)
        return inv

    print(f"Inizializzo {MODEL} senza LLM...", flush=True)
    try:
        status, body = post_json(
            f"http://127.0.0.1:{PORT}/v1/init",
            {"model": MODEL, "slot": 1, "init_llm": False},
            900,
        )
        print(f"/v1/init HTTP {status}", flush=True)
        if body:
            print(json.dumps(body, ensure_ascii=False)[:1800], flush=True)
    except Exception as exc:
        print(f"/v1/init: {exc!r}", flush=True)

    deadline = time.time() + 600
    last = None
    while time.time() < deadline:
        last = inventory()
        if has_xl(last):
            print(f"{MODEL} PRONTO.", flush=True)
            return last
        time.sleep(3)
    raise RuntimeError(f"XL-Turbo non compare nell'inventario: {json.dumps(last, ensure_ascii=False)[:4000]}")


def cloudflared_binary():
    machine = platform.machine().lower()
    arch = "arm64" if machine in {"aarch64", "arm64"} else "amd64"
    target = WORK / "cloudflared"
    if not target.exists():
        url = f"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}"
        print(f"Scarico solo cloudflared client ({arch})...", flush=True)
        urllib.request.urlretrieve(url, target)
        target.chmod(0o755)
    return target


def stop_old_tunnels():
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
    stop_old_tunnels()
    log_path = WORK / "cloudflared-v5.log"
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
            url = match.group(0).rstrip("/")
            print(f"Nuovo tunnel: {url}", flush=True)
            return url
        time.sleep(1)
    raise RuntimeError("Timeout creazione tunnel Cloudflare.")


def verify_public(base):
    deadline = time.time() + 180
    last = None
    while time.time() < deadline:
        try:
            _, h = get_json(base + "/health", 20)
            last = h
            for path in ("/v1/model_inventory", "/v1/models"):
                try:
                    _, m = get_json(base + path, 30)
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
    print(" SONARA MOLAB XL-TURBO BRIDGE V5 ")
    print("=" * 76)
    print(f"ACE_DIR={ACE_DIR}")
    print(f"PYTHON={sys.executable}")
    print(f"VIRTUAL_ENV={os.environ.get('VIRTUAL_ENV', '')}")

    start_api()
    ensure_xl()
    public_url = start_tunnel()
    public_health, public_models = verify_public(public_url)

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
    print("HEALTH=" + json.dumps(public_health, ensure_ascii=False)[:1000])
    print("MODELS=" + json.dumps(public_models, ensure_ascii=False)[:1600])
    print("=" * 76)


if __name__ == "__main__":
    main()
