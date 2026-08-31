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
RAW = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/'
BASE = HOME / 'sonara_yue_worker_v9_exl2.py'
WORKER = HOME / 'sonara_yue_worker_v104_dual_fidelity.py'
LOG = HOME / 'sonara_yue_v104_dual_fidelity.log'


def download(name: str, target: Path):
    urllib.request.urlretrieve(RAW + name, target)
    print('✅ aggiornato', target, flush=True)


def health():
    try:
        req = urllib.request.Request('http://127.0.0.1:8013/health', headers={'User-Agent': 'SONARA-V10.4-ACTIVATOR'})
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
    print('SONARA YUE V10.4 - ATTIVAZIONE DUAL FIDELITY')
    print('=' * 80)
    if not PYTHON.exists():
        raise RuntimeError(f'Python YuE non trovato: {PYTHON}')

    download('sonara_yue_worker_v9_exl2.py', BASE)
    download('sonara_yue_worker_v104_dual_fidelity.py', WORKER)

    check = subprocess.run(
        [str(PYTHON), '-m', 'py_compile', str(BASE), str(WORKER)],
        capture_output=True,
        text=True,
        check=False,
    )
    if check.returncode:
        raise RuntimeError('Errore sintassi V10.4:\n' + check.stdout + '\n' + check.stderr)

    # Stop ONLY the FAST YuE worker. Keep gateway 8012, QUALITY 8014 and cloudflared alive.
    for pattern in ['sonara_yue_worker_v104_dual_fidelity.py', 'sonara_yue_worker_v9_exl2.py']:
        subprocess.run(['pkill', '-f', pattern], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    time.sleep(3)

    env = os.environ.copy()
    for key in ['PYTHONHOME', 'PYTHONSTARTUP', 'UV_PROJECT_ENVIRONMENT', 'UV_ACTIVE', 'CONDA_PREFIX', 'CONDA_DEFAULT_ENV']:
        env.pop(key, None)
    env['VIRTUAL_ENV'] = str(VENV)
    env['PATH'] = str(VENV / 'bin') + os.pathsep + env.get('PATH', '')
    env['PYTHONPATH'] = str(HOME)
    env['PYTHONNOUSERSITE'] = '1'
    env['PYTHONUNBUFFERED'] = '1'
    env['TOKENIZERS_PARALLELISM'] = 'false'
    env['PYTORCH_ALLOC_CONF'] = 'expandable_segments:True'
    env['CUDA_MODULE_LOADING'] = 'LAZY'
    env['SONARA_YUE_V9_ROOT'] = '/marimo/YuE-exllamav2'
    env['SONARA_YUE_V9_XCODEC'] = '/marimo/YuE-exllamav2/xcodec_mini_infer'
    env['SONARA_YUE_V9_STAGE1_MODEL'] = '/marimo/models/yue-exl2/stage1-8bpw'
    env['SONARA_YUE_V9_STAGE2_MODEL'] = '/marimo/models/yue-exl2/stage2-8bpw'
    env['SONARA_YUE_V9_OUTPUT'] = '/marimo/YuE-exllamav2/sonara_api_output_v9'
    env['SONARA_YUE_PORT'] = '8013'
    env['SONARA_YUE_MAX_DURATION'] = '480'
    env['SONARA_YUE_V9_SLOTS'] = '1'
    env['SONARA_YUE_V9_STAGE1_CACHE'] = '16384'
    env['SONARA_YUE_V9_STAGE2_CACHE'] = '65536'
    env['SONARA_YUE_V9_STAGE1_CACHE_MODE'] = 'FP16'
    env['SONARA_YUE_V9_STAGE2_CACHE_MODE'] = 'FP16'
    env['SONARA_YUE_V9_GUIDANCE'] = '1'

    LOG.write_text('', encoding='utf-8')
    with LOG.open('ab', buffering=0) as fh:
        proc = subprocess.Popen(
            [str(PYTHON), str(WORKER)],
            cwd=str(HOME),
            stdout=fh,
            stderr=subprocess.STDOUT,
            env=env,
            start_new_session=True,
        )
    print('✅ FAST V10.4 PID:', proc.pid, flush=True)

    for sec in range(1, 901):
        if proc.poll() is not None:
            raise RuntimeError('Worker V10.4 terminato:\n' + tail(LOG))
        status, data = health()
        engine = data.get('engine') or {}
        if status == 200 and engine.get('ready') and engine.get('fidelity_profile') == '10.4-dual-fidelity-fast':
            print('\n' + '=' * 80)
            print('✅ SONARA YUE V10.4 DUAL FIDELITY ATTIVO')
            print('✅ FAST PORT       : 8013')
            print('✅ CANDIDATI       : 2')
            print('✅ DELIVERY        : A PRIMA, B SUBITO DOPO')
            print('✅ PROMPT MODE     : CREATOR-FIRST')
            print('✅ TOP_P           : 0.93')
            print('✅ TEMPERATURE     : 1.0')
            print('✅ CFG/GUIDANCE    : ON')
            print('✅ DURATA OUTPUT   : ESATTA')
            print('✅ GATEWAY 8012    : NON TOCCATO')
            print('✅ QUALITY 8014    : NON TOCCATO')
            print('✅ CLOUDFLARE      : NON TOCCATO')
            print('=' * 80)
            return
        if sec % 15 == 0:
            print(f'{sec}s | V10.4 warmup in corso | health={status} | ready={bool(engine.get("ready"))}', flush=True)
        time.sleep(1)

    raise RuntimeError('Timeout V10.4:\n' + tail(LOG))


if __name__ == '__main__':
    main()
