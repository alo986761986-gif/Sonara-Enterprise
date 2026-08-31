#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path

VENV = Path('/marimo/venvs/sonara-yue-v9-blackwell')
PYTHON = VENV / 'bin' / 'python'
HOME = Path('/marimo')
BASE_WORKER = HOME / 'sonara_yue_worker_v9_exl2.py'
QUALITY_WORKER = HOME / 'sonara_yue_v10_quality_worker.py'
GATEWAY = HOME / 'sonara_yue_v10_gateway.py'
LOG_FAST = HOME / 'sonara_yue_v10_fast.log'
LOG_QUALITY = HOME / 'sonara_yue_v10_quality.log'
LOG_GATEWAY = HOME / 'sonara_yue_v10_gateway.log'

RAW = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/'
FILES = {
    'sonara_yue_worker_v9_exl2.py': BASE_WORKER,
    'sonara_yue_v10_quality_worker.py': QUALITY_WORKER,
    'sonara_yue_v10_gateway.py': GATEWAY,
}


def download():
    for name, target in FILES.items():
        urllib.request.urlretrieve(RAW + name, target)
        print('✅', target, flush=True)


def clean_env():
    env = os.environ.copy()
    for key in ['PYTHONPATH', 'PYTHONHOME', 'PYTHONSTARTUP', 'UV_PROJECT_ENVIRONMENT', 'UV_ACTIVE', 'CONDA_PREFIX', 'CONDA_DEFAULT_ENV']:
        env.pop(key, None)
    env['VIRTUAL_ENV'] = str(VENV)
    old = env.get('PATH', '')
    parts = [p for p in old.split(os.pathsep) if '/tmp/uv-venv' not in p]
    env['PATH'] = str(VENV / 'bin') + os.pathsep + os.pathsep.join(parts)
    env['PYTHONNOUSERSITE'] = '1'
    env['PYTHONUNBUFFERED'] = '1'
    env['TOKENIZERS_PARALLELISM'] = 'false'
    env['PYTORCH_ALLOC_CONF'] = 'expandable_segments:True'
    env.pop('PYTORCH_CUDA_ALLOC_CONF', None)
    return env


def stop_old():
    patterns = [
        'sonara_yue_worker_v9_exl2.py',
        'sonara_yue_worker_v91_contract.py',
        'sonara_yue_worker_v91_launcher.py',
        'sonara_yue_v10_quality_worker.py',
        'sonara_yue_v10_gateway.py',
    ]
    for pattern in patterns:
        subprocess.run(['pkill', '-f', pattern], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    time.sleep(3)


def start(script: Path, log: Path, env: dict):
    log.write_text('', encoding='utf-8')
    with log.open('ab', buffering=0) as fh:
        proc = subprocess.Popen([str(PYTHON), '-I', str(script)], stdout=fh, stderr=subprocess.STDOUT, env=env, start_new_session=True)
    return proc


def health(port: int):
    try:
        req = urllib.request.Request(f'http://127.0.0.1:{port}/health', headers={'User-Agent': 'SONARA-V10-SUPERVISOR'})
        with urllib.request.urlopen(req, timeout=5) as response:
            return response.status, json.loads(response.read().decode('utf-8'))
    except Exception as exc:
        return 0, {'error': str(exc)}


def tail(path: Path, n=100):
    if not path.exists():
        return ''
    return '\n'.join(path.read_text(encoding='utf-8', errors='ignore').splitlines()[-n:])


def main():
    print('=' * 80)
    print('SONARA YUE V10 - QUALITY + FAST + GATEWAY')
    print('=' * 80)
    if not PYTHON.exists():
        raise RuntimeError(f'Venv non trovato: {PYTHON}')
    download()
    check = subprocess.run([str(PYTHON), '-m', 'py_compile', *map(str, FILES.values())], capture_output=True, text=True, check=False)
    if check.returncode:
        print(check.stdout)
        print(check.stderr)
        raise RuntimeError('Errore sintassi V10')
    stop_old()
    base_env = clean_env()

    fast_env = base_env.copy()
    fast_env.update({
        'SONARA_YUE_V9_ROOT': '/marimo/YuE-exllamav2',
        'SONARA_YUE_V9_XCODEC': '/marimo/YuE-exllamav2/xcodec_mini_infer',
        'SONARA_YUE_V9_STAGE1_MODEL': '/marimo/models/yue-exl2/stage1-8bpw',
        'SONARA_YUE_V9_STAGE2_MODEL': '/marimo/models/yue-exl2/stage2-8bpw',
        'SONARA_YUE_V9_OUTPUT': '/marimo/YuE-exllamav2/sonara_api_output_v9',
        'SONARA_YUE_PORT': '8013',
        'SONARA_YUE_MAX_DURATION': '480',
        'SONARA_YUE_V9_SLOTS': '1',
        'SONARA_YUE_V9_STAGE1_CACHE': '16384',
        'SONARA_YUE_V9_STAGE2_CACHE': '65536',
        'SONARA_YUE_V9_STAGE1_CACHE_MODE': 'FP16',
        'SONARA_YUE_V9_STAGE2_CACHE_MODE': 'FP16',
        'SONARA_YUE_V9_GUIDANCE': '1',
    })

    quality_env = base_env.copy()
    quality_env.update({
        'SONARA_YUE_PORT': '8014',
        'SONARA_YUE_MAX_DURATION': '480',
    })

    gateway_env = base_env.copy()
    gateway_env.update({
        'SONARA_YUE_PORT': '8012',
        'SONARA_YUE_QUALITY_URL': 'http://127.0.0.1:8014',
        'SONARA_YUE_FAST_URL': 'http://127.0.0.1:8013',
    })

    fast = start(BASE_WORKER, LOG_FAST, fast_env)
    quality = start(QUALITY_WORKER, LOG_QUALITY, quality_env)
    gateway = start(GATEWAY, LOG_GATEWAY, gateway_env)

    print('✅ FAST PID:', fast.pid)
    print('✅ QUALITY PID:', quality.pid)
    print('✅ GATEWAY PID:', gateway.pid)

    for sec in range(1, 901):
        fs, fd = health(8013)
        qs, qd = health(8014)
        gs, gd = health(8012)

        fast_ready = bool((fd.get('engine') or {}).get('ready'))
        quality_ready = qs == 200 and qd.get('version') == '10.0-quality-bf16-official'
        gateway_ready = gs == 200 and gd.get('version') == '10.0-quality-fast-gateway'

        if fast.poll() is not None:
            raise RuntimeError('FAST terminato:\n' + tail(LOG_FAST, 160))
        if quality.poll() is not None:
            raise RuntimeError('QUALITY terminato:\n' + tail(LOG_QUALITY, 160))
        if gateway.poll() is not None:
            raise RuntimeError('GATEWAY terminato:\n' + tail(LOG_GATEWAY, 160))

        if fast_ready and quality_ready and gateway_ready:
            print('\n' + '=' * 80)
            print('✅ SONARA YUE V10 PRONTO')
            print('✅ PUBLIC GATEWAY : http://127.0.0.1:8012')
            print('✅ QUALITY BF16   : http://127.0.0.1:8014')
            print('✅ FAST EXL2      : http://127.0.0.1:8013')
            print('✅ DEFAULT        : QUALITY')
            print('✅ TUNNEL         : https://yue.sonaraenterprise.com -> 8012')
            print('✅ CFG FAST       : ON')
            print('✅ QUALITY        : official BF16 + native YuE decoding')
            print('=' * 80)
            return

        if sec % 15 == 0:
            print(f'{sec}s | FAST={fast_ready} QUALITY={quality_ready} GATEWAY={gateway_ready}', flush=True)

        time.sleep(1)

    raise RuntimeError('Timeout V10. FAST:\n' + tail(LOG_FAST) + '\nQUALITY:\n' + tail(LOG_QUALITY) + '\nGATEWAY:\n' + tail(LOG_GATEWAY))


if __name__ == '__main__':
    main()
