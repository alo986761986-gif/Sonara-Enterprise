#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path

HOME = Path('/marimo')
VENV = Path('/marimo/venvs/sonara-yue-v9-blackwell')
PYTHON = VENV / 'bin' / 'python'
WORKER = HOME / 'sonara_yue_v103_quality_resident_worker.py'
BASE_WORKER = HOME / 'sonara_yue_v10_quality_worker.py'
LOG = HOME / 'sonara_yue_v103_quality_resident.log'
RAW = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/'


def download(name: str, target: Path):
    urllib.request.urlretrieve(RAW + name, target)
    if not target.exists() or target.stat().st_size == 0:
        raise RuntimeError(f'Download fallito: {name}')
    print('✅', target, flush=True)


def health():
    try:
        req = urllib.request.Request(
            'http://127.0.0.1:8014/health',
            headers={'User-Agent': 'SONARA-V10.3-RESIDENT-ACTIVATOR'},
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, json.loads(response.read().decode('utf-8'))
    except Exception as exc:
        return 0, {'error': str(exc)}


def tail(path: Path, n=160):
    if not path.exists():
        return ''
    return '\n'.join(path.read_text(encoding='utf-8', errors='ignore').splitlines()[-n:])


def main():
    print('=' * 80)
    print('SONARA YUE V10.3 - ACTIVATE BF16 RESIDENT ENGINE')
    print('=' * 80)

    if not PYTHON.exists():
        raise RuntimeError(f'Venv non trovato: {PYTHON}')
    if not BASE_WORKER.exists():
        download('sonara_yue_v10_quality_worker.py', BASE_WORKER)

    download('sonara_yue_v103_quality_resident_worker.py', WORKER)

    check = subprocess.run(
        [str(PYTHON), '-m', 'py_compile', str(WORKER)],
        capture_output=True,
        text=True,
        check=False,
    )
    if check.returncode:
        print(check.stdout)
        print(check.stderr)
        raise RuntimeError('Errore sintassi resident worker')
    print('✅ Sintassi worker V10.3 OK', flush=True)

    # Stop only QUALITY implementations. Never touch FAST, gateway or cloudflared.
    for pattern in [
        'sonara_yue_v10_quality_worker.py',
        'sonara_yue_v103_quality_resident_worker.py',
    ]:
        subprocess.run(
            ['pkill', '-f', pattern],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    time.sleep(3)

    env = os.environ.copy()
    for key in [
        'PYTHONHOME', 'PYTHONSTARTUP', 'UV_PROJECT_ENVIRONMENT', 'UV_ACTIVE',
        'CONDA_PREFIX', 'CONDA_DEFAULT_ENV',
    ]:
        env.pop(key, None)

    env['VIRTUAL_ENV'] = str(VENV)
    env['PATH'] = str(VENV / 'bin') + os.pathsep + env.get('PATH', '')
    env['PYTHONNOUSERSITE'] = '1'
    env['PYTHONUNBUFFERED'] = '1'
    env['SONARA_YUE_PORT'] = '8014'
    env['SONARA_YUE_MAX_DURATION'] = '480'
    env['SONARA_YUE_MAX_SPEED'] = '1'
    env['SONARA_YUE_TORCH_COMPILE'] = '0'
    env['TOKENIZERS_PARALLELISM'] = 'false'
    env['PYTORCH_ALLOC_CONF'] = 'expandable_segments:True'
    env['CUDA_MODULE_LOADING'] = 'LAZY'
    env['HF_HUB_OFFLINE'] = '1'
    env['TRANSFORMERS_OFFLINE'] = '1'
    env['PYTHONPATH'] = '/marimo/YuE-quality/inference' + os.pathsep + env.get('PYTHONPATH', '')

    LOG.write_text('', encoding='utf-8')
    with LOG.open('ab', buffering=0) as fh:
        proc = subprocess.Popen(
            [str(PYTHON), str(WORKER)],
            stdout=fh,
            stderr=subprocess.STDOUT,
            env=env,
            start_new_session=True,
        )

    print('✅ QUALITY RESIDENT PID:', proc.pid, flush=True)
    print('🔥 Caricamento Stage1 + Stage2 + codec + vocoder in VRAM...', flush=True)

    for sec in range(1, 301):
        if proc.poll() is not None:
            print(tail(LOG), flush=True)
            raise RuntimeError(f'V10.3 resident terminato rc={proc.returncode}')

        status, payload = health()
        resident = payload.get('resident_engine') or {}
        ready = (
            status == 200
            and payload.get('version') == '10.3-quality-bf16-resident'
            and bool(resident.get('ready'))
        )
        if ready:
            memory = resident.get('memory') or {}
            print('\n' + '=' * 80)
            print('✅ SONARA YUE V10.3 RESIDENT READY')
            print('✅ GPU          :', resident.get('gpu'))
            print('✅ MODELS       : Stage1 BF16 + Stage2 BF16 residenti')
            print('✅ CODEC        : residente')
            print('✅ VOCODER      : residente')
            print('✅ STAGE2       : vocal + instrumental shared batch')
            print('✅ BATCH DEFAULT:', resident.get('stage2_batch_default'))
            print('✅ VRAM FREE GB :', memory.get('free_gb'))
            print('✅ VRAM TOTAL GB:', memory.get('total_gb'))
            print('✅ QUALITY PORT : 8014')
            print('✅ FAST PORT    : 8013 INVARIATA')
            print('✅ GATEWAY      : 8012 INVARIATO')
            print('✅ TUNNEL       : yue.sonaraenterprise.com INVARIATO')
            print('=' * 80)
            return

        if sec % 10 == 0:
            stage = (payload.get('latest_job') or {}).get('stage') or resident.get('error') or 'warmup'
            print(f'{sec}s | RESIDENT={bool(resident.get("ready"))} | {stage}', flush=True)
        time.sleep(1)

    print(tail(LOG), flush=True)
    raise RuntimeError('Timeout warmup V10.3 resident')


if __name__ == '__main__':
    main()
