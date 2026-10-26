#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import pathlib
import shutil
import signal
import subprocess
import sys
import time
import urllib.request

ACE_COMMIT = "ca1e85fe9430179831e6bc6be790c332190a3866"
ACE_REPO = "https://github.com/ace-step/ACE-Step-1.5.git"
ROOT = pathlib.Path("/home/marimo/ACE-STEP/ACE-Step-1.5")
CHECKPOINTS = ROOT / "checkpoints"
MODEL = "acestep-v15-xl-turbo"
LM_MODEL = "acestep-5Hz-lm-4B"
PORT = 8001
SONARA = pathlib.Path.home() / ".sonara"
API_LOG = SONARA / "ace-step-api.log"
PID_FILE = SONARA / "ace-step-api.pid"

def banner(text):
    print("\n" + "=" * 92, flush=True)
    print(text, flush=True)
    print("=" * 92, flush=True)

def run(cmd, *, cwd=None, env=None, timeout=None):
    cmd = [str(x) for x in cmd]
    print("$ " + " ".join(cmd), flush=True)
    p = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        env=env,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=timeout,
        check=False,
    )
    if p.stdout:
        print(p.stdout[-12000:], flush=True)
    if p.returncode != 0:
        raise RuntimeError("Comando fallito: " + " ".join(cmd))
    return p

def get_json(url, timeout=10):
    req = urllib.request.Request(
        url,
        headers={"Accept": "application/json", "Cache-Control": "no-cache"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode("utf-8", "replace")
    return json.loads(raw) if raw else {}

def health():
    try:
        body = get_json(f"http://127.0.0.1:{PORT}/health", 8)
        data = body.get("data", body) if isinstance(body, dict) else {}
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}

def ready(data):
    return (
        str(data.get("status", "")).lower() == "ok"
        and data.get("models_initialized") is True
        and data.get("llm_initialized") is True
        and MODEL in str(data.get("loaded_model", ""))
        and LM_MODEL in str(data.get("loaded_lm_model", ""))
    )

def ensure_uv():
    existing = shutil.which("uv")
    if existing:
        return existing
    banner("INSTALL UV")
    run([sys.executable, "-m", "pip", "install", "--user", "uv"], timeout=1800)
    candidates = [
        shutil.which("uv"),
        str(pathlib.Path.home() / ".local/bin/uv"),
        "/usr/local/bin/uv",
    ]
    for value in candidates:
        if value and pathlib.Path(value).is_file():
            return value
    raise RuntimeError("uv non disponibile")

def ensure_repo():
    banner("ACE-STEP 1.5 - SOURCE")
    ROOT.parent.mkdir(parents=True, exist_ok=True)
    if ROOT.exists() and not (ROOT / ".git").is_dir():
        backup = ROOT.with_name(ROOT.name + ".partial-" + str(int(time.time())))
        ROOT.rename(backup)
        print("Installazione parziale preservata:", backup, flush=True)
    if not ROOT.exists():
        run(["git", "init", str(ROOT)])
    remotes = subprocess.run(
        ["git", "-C", str(ROOT), "remote"],
        text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL
    ).stdout.split()
    if "origin" not in remotes:
        run(["git", "-C", str(ROOT), "remote", "add", "origin", ACE_REPO])
    else:
        run(["git", "-C", str(ROOT), "remote", "set-url", "origin", ACE_REPO])
    run(["git", "-C", str(ROOT), "fetch", "--depth", "1", "origin", ACE_COMMIT], timeout=1800)
    run(["git", "-C", str(ROOT), "checkout", "--detach", "-f", ACE_COMMIT])
    head = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()
    if head != ACE_COMMIT:
        raise RuntimeError("Commit ACE-Step inatteso")
    if not (ROOT / "acestep/api_server.py").is_file():
        raise RuntimeError("ACE-Step API server non trovato")

def install_env(uv):
    banner("PYTHON 3.12 + DIPENDENZE")
    env = os.environ.copy()
    env.pop("VIRTUAL_ENV", None)
    env["UV_PROJECT_ENVIRONMENT"] = str(ROOT / ".venv")
    env["UV_PYTHON_DOWNLOADS"] = "automatic"
    env["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
    env["TOKENIZERS_PARALLELISM"] = "false"
    run([uv, "python", "install", "3.12"], env=env, timeout=1800)
    run([uv, "sync", "--project", str(ROOT), "--python", "3.12", "--no-dev"], cwd=ROOT, env=env, timeout=10800)
    py = ROOT / ".venv/bin/python"
    if not py.is_file():
        raise RuntimeError("Python ACE-Step non creato")
    probe = run(
        [py, "-c",
         "import torch; assert torch.cuda.is_available(); "
         "print('GPU='+torch.cuda.get_device_name(0)); "
         "print('VRAM_GB='+str(round(torch.cuda.get_device_properties(0).total_memory/1024**3,2)))"],
        cwd=ROOT, env=env, timeout=600
    )
    return py, env

def download_models(py, env):
    banner("XL TURBO + LM 4B")
    CHECKPOINTS.mkdir(parents=True, exist_ok=True)
    env = env.copy()
    env["ACESTEP_PROJECT_ROOT"] = str(ROOT)
    env["ACESTEP_CHECKPOINTS_DIR"] = str(CHECKPOINTS)
    env["HF_HUB_DOWNLOAD_TIMEOUT"] = "1800"
    env["HF_HUB_ETAG_TIMEOUT"] = "120"
    code = f"""
from pathlib import Path
from acestep.model_downloader import check_main_model_exists, check_model_exists, download_main_model, download_submodel
cp=Path({str(CHECKPOINTS)!r})
if not check_main_model_exists(cp):
    ok,msg=download_main_model(cp, force=False, prefer_source='huggingface')
    print(msg, flush=True)
    assert ok
for name in ({MODEL!r}, {LM_MODEL!r}):
    if not check_model_exists(name, cp):
        ok,msg=download_submodel(name, cp, force=False, prefer_source='huggingface')
        print(msg, flush=True)
        assert ok
    assert check_model_exists(name, cp), name
print('XL_TURBO=READY')
print('LM_4B=READY')
"""
    run([py, "-c", code], cwd=ROOT, env=env, timeout=43200)
    return env

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
        except Exception:
            continue
        cmd = parts[1].lower()
        if pid != os.getpid() and "acestep.api_server" in cmd and "8001" in cmd:
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
    time.sleep(2)

def start_api(py, env):
    banner("AVVIO API LOCALE")
    current = health()
    if ready(current):
        print("ACE-Step era gia pronto.", flush=True)
        return None, current
    stop_old_api()
    SONARA.mkdir(parents=True, exist_ok=True)
    os.chmod(SONARA, 0o700)
    api_env = env.copy()
    api_env.update({
        "ACESTEP_PROJECT_ROOT": str(ROOT),
        "ACESTEP_CHECKPOINTS_DIR": str(CHECKPOINTS),
        "ACESTEP_CONFIG_PATH": MODEL,
        "ACESTEP_LM_MODEL_PATH": LM_MODEL,
        "ACESTEP_DEVICE": "cuda",
        "ACESTEP_INIT_LLM": "true",
        "ACESTEP_LLM_BACKEND": "pt",
        "ACESTEP_USE_FLASH_ATTENTION": "false",
        "ACESTEP_OFFLOAD_TO_CPU": "false",
        "ACESTEP_OFFLOAD_DIT_TO_CPU": "false",
        "ACESTEP_LM_OFFLOAD_TO_CPU": "false",
        "ACESTEP_API_HOST": "127.0.0.1",
        "ACESTEP_API_PORT": str(PORT),
        "ACESTEP_API_WORKERS": "1",
        "ACESTEP_QUEUE_WORKERS": "1",
        "ACESTEP_QUEUE_MAXSIZE": "64",
        "ACESTEP_DOWNLOAD_SOURCE": "huggingface",
        "TOKENIZERS_PARALLELISM": "false",
        "PYTHONUNBUFFERED": "1",
        "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
    })
    fd = os.open(API_LOG, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "ab") as log:
        proc = subprocess.Popen(
            [
                str(py), "-m", "acestep.api_server",
                "--host", "127.0.0.1",
                "--port", str(PORT),
                "--download-source", "huggingface",
                "--init-llm",
                "--lm-model-path", LM_MODEL,
            ],
            cwd=str(ROOT),
            env=api_env,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    PID_FILE.write_text(str(proc.pid), encoding="utf-8")
    os.chmod(PID_FILE, 0o600)
    print("ACE_STEP_API_PID=", proc.pid, flush=True)
    deadline = time.time() + 1800
    last = {}
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = API_LOG.read_text(errors="replace")[-12000:] if API_LOG.exists() else ""
            raise RuntimeError("ACE-Step API terminata.\n" + tail)
        last = health()
        if ready(last):
            return proc, last
        time.sleep(3)
    tail = API_LOG.read_text(errors="replace")[-12000:] if API_LOG.exists() else ""
    raise RuntimeError("Timeout caricamento ACE-Step.\n" + tail)

def wait_relay():
    banner("RIAGGANCIO RELAY V5")
    status_file = SONARA / "relay-agent-status.json"
    public = {}
    local = {}
    for _ in range(90):
        try:
            public = get_json("https://sonaraenterprise.com/api/billing/job?relayReadiness=1", 10)
        except Exception:
            public = {}
        try:
            local = json.loads(status_file.read_text(encoding="utf-8"))
        except Exception:
            local = {}
        if public.get("agentOnline") is True and local.get("modelsReady") is True:
            break
        time.sleep(1)
    return public, local

def main():
    banner("SONARA - FULL ACE-STEP RECOVERY")
    if not shutil.which("git"):
        raise RuntimeError("git non disponibile nel notebook")
    uv = ensure_uv()
    ensure_repo()
    py, env = install_env(uv)
    env = download_models(py, env)
    proc, state = start_api(py, env)
    public, local = wait_relay()
    state = health()
    print("\n" + "=" * 92)
    print("SONARA - STATO FINALE")
    print("=" * 92)
    print("ACE_ROOT:", ROOT)
    print("ACE-STEP:", state.get("status"))
    print("MODELLO:", state.get("loaded_model"))
    print("LM:", state.get("loaded_lm_model"))
    print("MODELLI CARICATI:", state.get("models_initialized"))
    print("LM CARICATO:", state.get("llm_initialized"))
    print("RELAY ONLINE:", public.get("agentOnline"))
    print("RELAY REVISION:", public.get("agentRevision"))
    print("RELAY MODELS READY:", local.get("modelsReady"))
    print("RELAY STATE:", local.get("state"))
    print("=" * 92)
    if not ready(state):
        raise RuntimeError("ACE-Step non pronto")
    if public.get("agentOnline") is not True or local.get("modelsReady") is not True:
        raise RuntimeError("Relay non ancora pronto")
    print("SONARA AUDIO ENGINE=READY", flush=True)

if __name__ == "__main__":
    main()
