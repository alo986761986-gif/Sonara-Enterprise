#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import signal
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
VENV = ROOT / '.venv'
PYTHON = VENV / 'bin' / 'python'
CHECKPOINTS = ROOT / 'checkpoints'
MODEL = 'acestep-v15-xl-turbo'
LM_MODEL = 'acestep-5Hz-lm-4B'
PORT = 8001
LOG = Path('/tmp/sonara-ace-step-realism-v1.log')
READY = ROOT / 'SONARA_XL_TURBO_REALISM_READY.txt'


def banner(text: str) -> None:
    print('\n' + '=' * 92, flush=True)
    print(text, flush=True)
    print('=' * 92, flush=True)


def run(cmd, *, timeout: int | None = None, env: dict | None = None) -> None:
    cmd = [str(x) for x in cmd]
    print('$ ' + ' '.join(cmd), flush=True)
    done = subprocess.run(cmd, cwd=str(ROOT), env=env, timeout=timeout, check=False)
    if done.returncode != 0:
        raise RuntimeError(f"Comando fallito ({done.returncode}): {' '.join(cmd)}")


def require_runtime() -> None:
    if not ROOT.exists() or not PYTHON.exists():
        raise RuntimeError('ACE-Step CLEAN non trovato. Esegui prima il setup MoLab SONARA.')
    if not (CHECKPOINTS / MODEL).exists():
        raise RuntimeError(f'Modello {MODEL} non trovato in {CHECKPOINTS}.')


def base_env() -> dict:
    env = os.environ.copy()
    env.update({
        'ACESTEP_PROJECT_ROOT': str(ROOT),
        'ACESTEP_CHECKPOINTS_DIR': str(CHECKPOINTS),
        'ACESTEP_CONFIG_PATH': MODEL,
        'ACESTEP_DEVICE': 'cuda',
        'ACESTEP_INIT_LLM': 'true',
        'ACESTEP_LM_MODEL_PATH': LM_MODEL,
        'ACESTEP_LLM_BACKEND': 'pt',
        'ACESTEP_USE_FLASH_ATTENTION': 'true',
        'ACESTEP_OFFLOAD_TO_CPU': 'false',
        'ACESTEP_OFFLOAD_DIT_TO_CPU': 'false',
        'ACESTEP_LM_OFFLOAD_TO_CPU': 'false',
        'ACESTEP_NO_INIT': 'false',
        'ACESTEP_API_HOST': '0.0.0.0',
        'ACESTEP_API_PORT': str(PORT),
        'ACESTEP_API_WORKERS': '1',
        'ACESTEP_QUEUE_WORKERS': '1',
        'ACESTEP_QUEUE_MAXSIZE': '64',
        'ACESTEP_DOWNLOAD_SOURCE': 'huggingface',
        'HF_HUB_DOWNLOAD_TIMEOUT': '1800',
        'HF_HUB_ETAG_TIMEOUT': '120',
        'TOKENIZERS_PARALLELISM': 'false',
        'MPLBACKEND': 'Agg',
        'PYTHONUNBUFFERED': '1',
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
    })
    env.pop('VIRTUAL_ENV', None)
    return env


def ensure_lm(env: dict) -> None:
    banner('1/4 - VERIFICA / DOWNLOAD ACE-STEP 5Hz LM 4B')
    code = f'''
from pathlib import Path
from acestep.model_downloader import ensure_lm_model, check_model_exists
root = Path({str(CHECKPOINTS)!r})
name = {LM_MODEL!r}
if not check_model_exists(name, root):
    ok, msg = ensure_lm_model(name, checkpoints_dir=root, prefer_source="huggingface")
    print(msg, flush=True)
    if not ok:
        raise SystemExit(2)
if not check_model_exists(name, root):
    raise SystemExit("LM 4B incompleto dopo download")
print("LM_4B=READY", flush=True)
'''
    run([PYTHON, '-c', code], timeout=21600, env=env)


def verify_gpu(env: dict) -> None:
    banner('2/4 - VERIFICA RTX PRO 6000 / BF16 / FLASH-ATTENTION')
    code = r'''
import torch
print('CUDA_AVAILABLE=' + str(torch.cuda.is_available()), flush=True)
assert torch.cuda.is_available(), 'CUDA non disponibile'
print('GPU=' + torch.cuda.get_device_name(0), flush=True)
print('VRAM_GB=' + str(round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 2)), flush=True)
print('BF16=' + str(torch.cuda.is_bf16_supported()), flush=True)
try:
    import flash_attn
    print('FLASH_ATTN=READY', flush=True)
except Exception as exc:
    print('FLASH_ATTN=FALLBACK (' + str(exc) + ')', flush=True)
'''
    run([PYTHON, '-c', code], timeout=1200, env=env)


def stop_api() -> None:
    try:
        rows = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
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
        if 'acestep.api_server' in cmd and str(PORT) in cmd:
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
    time.sleep(2)


def health() -> dict:
    req = urllib.request.Request(
        f'http://127.0.0.1:{PORT}/health',
        headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'},
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        raw = response.read().decode('utf-8', errors='replace')
    return json.loads(raw) if raw else {}


def start_api(env: dict) -> subprocess.Popen:
    banner('3/4 - RIAVVIO XL-TURBO + LM 4B REALISM ENGINE')
    stop_api()
    LOG.parent.mkdir(parents=True, exist_ok=True)
    stream = LOG.open('w', encoding='utf-8', buffering=1)
    proc = subprocess.Popen(
        [
            str(PYTHON), '-m', 'acestep.api_server',
            '--host', '0.0.0.0',
            '--port', str(PORT),
            '--download-source', 'huggingface',
            '--init-llm',
            '--lm-model-path', LM_MODEL,
        ],
        cwd=str(ROOT),
        env=env,
        stdout=stream,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f'ACE_STEP_REALISM_PID={proc.pid}', flush=True)
    print(f'ACE_STEP_REALISM_LOG={LOG}', flush=True)
    return proc


def wait_ready(proc: subprocess.Popen) -> dict:
    banner('4/4 - VERIFICA XL-TURBO + LM 4B')
    deadline = time.time() + 1800
    last = None
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = LOG.read_text(errors='replace')[-20000:] if LOG.exists() else ''
            raise RuntimeError(f'ACE-Step terminato exit={proc.returncode}:\n{tail}')
        try:
            body = health()
            data = body.get('data') or body
            last = data
            model_ok = MODEL in str(data.get('loaded_model') or data.get('model') or '')
            if data.get('models_initialized') is True and data.get('llm_initialized') is True and model_ok:
                return data
        except Exception:
            pass
        time.sleep(3)
    tail = LOG.read_text(errors='replace')[-20000:] if LOG.exists() else ''
    raise RuntimeError(f'Timeout Realism Engine. Ultimo health={last!r}\n{tail}')


def main() -> None:
    require_runtime()
    env = base_env()
    ensure_lm(env)
    verify_gpu(env)
    proc = start_api(env)
    data = wait_ready(proc)
    READY.write_text(
        '\n'.join([
            'SONARA XL-TURBO REALISM V1 READY',
            f'MODEL={MODEL}',
            f'LM_MODEL={LM_MODEL}',
            'INFERENCE_STEPS=8',
            'LLM=ON',
            'FLASH_ATTENTION=ON_WITH_SAFE_FALLBACK',
            'DCW=TURBO_DEFAULT_ON',
            f'HEALTH={json.dumps(data, ensure_ascii=False)}',
        ]) + '\n',
        encoding='utf-8',
    )
    banner('✅ SONARA XL-TURBO REALISM V1 ATTIVO')
    print(f'MODEL={MODEL}', flush=True)
    print(f'LM_MODEL={LM_MODEL}', flush=True)
    print('INFERENCE_STEPS=8 (regime Turbo ufficiale)', flush=True)
    print('LLM_INITIALIZED=true', flush=True)
    print('DCW=ON (default ACE-Step Turbo)', flush=True)
    print(f'READY_FILE={READY}', flush=True)
    print('Il tunnel Cloudflare esistente sulla porta 8001 puo restare invariato.', flush=True)


if __name__ == '__main__':
    main()
