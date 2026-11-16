#!/usr/bin/env python3
"""Add a local-only XL SFT API on port 8003 without stopping ACE Turbo/8001."""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.request

ROOT = Path("/home/marimo/SONARA-ACE-XL-RESTORE")
CP = ROOT / "checkpoints"
MODEL = "acestep-v15-xl-sft"
TURBO = "acestep-v15-xl-turbo"
LM = "acestep-5Hz-lm-4B"
PORT = 8003
LOG = Path.home() / ".sonara" / "xl-sft-secondary-api.log"

def health(port):
    try:
        req = urllib.request.Request("http://127.0.0.1:%d/health" % port, headers={"Accept": "application/json"})
        op = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with op.open(req, timeout=6) as response:
            payload = json.load(response)
        data = payload.get("data", payload) if isinstance(payload, dict) else {}
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError, TimeoutError):
        return {}

def ready(data, model):
    return data.get("models_initialized") is True and model in str(data.get("loaded_model", ""))

def occupied(port):
    with socket.socket() as conn:
        conn.settimeout(1)
        return conn.connect_ex(("127.0.0.1", port)) == 0

def execute(activate=False):
    proc = None
    try:
        if not (ROOT / "acestep/api_server.py").is_file():
            raise RuntimeError("ACE-Step runtime non trovato, nessuna modifica")
        py = ROOT / ".venv/bin/python"
        if not py.is_file():
            raise RuntimeError("Python ACE-Step non trovato, nessuna modifica")
        for name in [MODEL, TURBO, LM]:
            if not (CP / name).is_dir():
                raise RuntimeError("Checkpoint mancante: " + name)
        primary = health(8001)
        if not ready(primary, TURBO) or primary.get("llm_initialized") is not True:
            raise RuntimeError("Turbo/LM 4B non pronti sulla porta 8001")
        print("SONARA_TURBO_8001_READY=True", flush=True)
        if ready(health(PORT), MODEL):
            print("SONARA_XL_SFT_8003_READY=True", flush=True)
            return 0
        if occupied(PORT):
            raise RuntimeError("Porta 8003 occupata da un servizio non identificato")
        probe = subprocess.run([str(py), "-c",
            "import torch; assert torch.cuda.is_available(); free,total=torch.cuda.mem_get_info(); print(free/1024**3)"],
            cwd=ROOT, capture_output=True, text=True, timeout=75)
        if probe.returncode:
            raise RuntimeError("Impossibile verificare la memoria CUDA")
        free = float(probe.stdout.strip().splitlines()[-1])
        print("SONARA_GPU_FREE_GIB=" + str(round(free, 2)), flush=True)
        if free < 34:
            raise RuntimeError("VRAM libera insufficiente per avvio isolato: richiesti 34 GiB")
        if not activate:
            print("SONARA_XL_SFT_SAFE_PREFLIGHT=True", flush=True)
            print("SONARA_NO_CHANGES_MADE=True", flush=True)
            return 0
        LOG.parent.mkdir(parents=True, exist_ok=True)
        if LOG.is_symlink():
            raise RuntimeError("Percorso log non sicuro")
        env = os.environ.copy()
        env.update({
            "ACESTEP_PROJECT_ROOT":str(ROOT),
            "ACESTEP_CHECKPOINTS_DIR":str(CP),
            "ACESTEP_CONFIG_PATH":MODEL,
            "ACESTEP_LM_MODEL_PATH":LM,
            "ACESTEP_INIT_LLM":"true",
            "ACESTEP_NO_INIT":"false",
            "ACESTEP_DEVICE":"cuda",
            "ACESTEP_API_HOST":"127.0.0.1",
            "ACESTEP_API_PORT":str(PORT),
            "ACESTEP_API_WORKERS":"1",
            "ACESTEP_QUEUE_WORKERS":"1",
            "ACESTEP_QUEUE_MAXSIZE":"2",
            "ACESTEP_USE_FLASH_ATTENTION":"false",
            "ACESTEP_LLM_BACKEND":"pt",
            "ACESTEP_OFFLOAD_TO_CPU":"false",
            "ACESTEP_OFFLOAD_DIT_TO_CPU":"false",
            "ACESTEP_LM_OFFLOAD_TO_CPU":"false",
            "TOKENIZERS_PARALLELISM":"false"
        })
        with LOG.open("ab") as output:
            proc = subprocess.Popen([
                str(py), "-m", "acestep.api_server", "--host", "127.0.0.1",
                "--port", str(PORT), "--download-source", "huggingface",
                "--init-llm", "--lm-model-path", LM],
                cwd=ROOT, env=env, stdout=output, stderr=subprocess.STDOUT,
                stdin=subprocess.DEVNULL, start_new_session=True)
        print("SONARA_XL_SFT_PRIVATE_PID=" + str(proc.pid), flush=True)
        for attempt in range(180):
            if proc.poll() is not None:
                raise RuntimeError("SFT ha terminato il caricamento; vedere log")
            if ready(health(PORT), MODEL):
                if not ready(health(8001), TURBO):
                    raise RuntimeError("Turbo non pronto dopo l'avvio SFT")
                print("SONARA_XL_SFT_8003_READY=True", flush=True)
                print("SONARA_TURBO_8001_UNCHANGED=True", flush=True)
                print("SONARA_RELAY_UNCHANGED=True", flush=True)
                print("SONARA_SITE_ROUTING_UNCHANGED=True", flush=True)
                print("SONARA_CUSTOMER_JOBS_CREATED=0", flush=True)
                return 0
            time.sleep(5)
        raise RuntimeError("SFT non pronto entro il tempo di verifica: " + str(LOG))
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as exc:
        if proc is not None and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=12)
            except subprocess.TimeoutExpired:
                proc.kill()
            print("SONARA_FAILED_NEW_SFT_PROCESS_STOPPED=True", flush=True)
        print("SONARA_SFT_SECONDARY_BLOCKED=" + str(exc), flush=True)
        print("SONARA_EXISTING_TURBO_UNMODIFIED=True", flush=True)
        print("SONARA_RELAY_UNCHANGED=True", flush=True)
        return 1

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--activate", action="store_true")
    args = parser.parse_args()
    print("=== SONARA XL SFT SECONDARY 8003 ===", flush=True)
    sys.exit(execute(activate=args.activate))
