#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

HOME = Path('/marimo')
VENV = Path('/marimo/venvs/sonara-yue-v9-blackwell')
PYTHON = VENV / 'bin' / 'python'
WORKER = HOME / 'sonara_yue_v1031_quality_resident_worker.py'
BASE_WORKER = HOME / 'sonara_yue_v10_quality_worker.py'
LOG = HOME / 'sonara_yue_v1031_quality_resident.log'
RAW = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/'


def download(name: str, target: Path):
    urllib.request.urlretrieve(RAW + name, target)
    if not target.exists() or target.stat().st_size == 0:
        raise RuntimeError(f'Download fallito: {name}')
    print('✅', target, flush=True)


def health():
    req = urllib.request.Request(
        'http://127.0.0.1:8014/health',
        headers={'User-Agent': 'SONARA-V10.3.1-RESIDENT-ACTIVATOR'},
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as response:
            raw = response.read().decode('utf-8', errors='ignore')
            return response.status, json.loads(raw)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='ignore')
        try:
            return exc.code, json.loads(raw)
        except Exception:
            return exc.code, {'error': raw or str(exc)}
    except Exception as exc:
        return 0, {'error': str(exc)}


def tail(path: Path, n=220):
    if not path.exists():
        return ''
    return '\n'.join(
        path.read_text(encoding='utf-8', errors='ignore').splitlines()[-n:]
    )


def fail(proc, message, payload=None):
    print('\n' + '=' * 80)
    print('❌ SONARA YUE V10.3.1 RESIDENT - ERRORE REALE')
    print('=' * 80)
    if payload:
        print(json.dumps(payload, ensure_ascii=False, indent=2), flush=True)
    print('\n--- WORKER LOG ---')
    print(tail(LOG), flush=True)
    if proc is not None and proc.poll() is None:
        subprocess.run(
            ['pkill', '-f', 'sonara_yue_v1031_quality_resident_worker.py'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=False,
        )
    raise RuntimeError(message)


def main():
    print('=' * 80)
    print('SONARA YUE V10.3.1 - ACTIVATE SAFE BF16 RESIDENT')
    print('=' * 80)

    if not PYTHON.exists():
        raise RuntimeError(f'Venv non trovato: {PYTHON}')

    if not BASE_WORKER.exists():
        download('sonara_yue_v10_quality_worker.py', BASE_WORKER)

    download('sonara_yue_v1031_quality_resident_worker.py', WORKER)

    check = subprocess.run(
        [str(PYTHON), '-m', 'py_compile', str(WORKER)],
        capture_output=True,
        text=True,
        check=False,
    )
    if check.returncode != 0:
        print(check.stdout)
        print(check.stderr)
        raise RuntimeError('Errore sintassi V10.3.1 resident worker')

    print('✅ Sintassi V10.3.1 OK', flush=True)

    # Stop only QUALITY variants. Never touch FAST, gateway or cloudflared.
    for pattern in [
        'sonara_yue_v10_quality_worker.py',
        'sonara_yue_v103_quality_resident_worker.py',
        'sonara_yue_v1031_quality_resident_worker.py',
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

    print('✅ QUALITY V10.3.1 PID:', proc.pid, flush=True)
    print('🔥 Warmup Stage1 + Stage2 BF16 residenti...', flush=True)

    last_payload = None
    for sec in range(1, 301):
        if proc.poll() is not None:
            fail(
                proc,
                f'V10.3.1 resident terminato rc={proc.returncode}',
                last_payload,
            )

        status, payload = health()
        last_payload = payload
        resident = payload.get('resident_engine') or {}

        if resident.get('error'):
            fail(proc, f"Warmup fallito: {resident.get('error')}", payload)

        ready = (
            status == 200
            and payload.get('version') == '10.3.1-quality-bf16-resident'
            and bool(resident.get('ready'))
        )

        if ready:
            memory = resident.get('memory') or {}
            print('\n' + '=' * 80)
            print('✅ SONARA YUE V10.3.1 RESIDENT READY')
            print('✅ GPU          :', resident.get('gpu'))
            print('✅ MODELS       : Stage1 + Stage2 BF16 residenti')
            print('✅ MODELS COUNT :', resident.get('models_resident'))
            print('✅ STAGE2       : shared batch vocal + instrumental')
            print('✅ BATCH DEFAULT:', resident.get('stage2_batch_default'))
            print('✅ VRAM FREE GB :', memory.get('free_gb'))
            print('✅ VRAM TOTAL GB:', memory.get('total_gb'))
            print('✅ QUALITY PORT : 8014')
            print('✅ FAST PORT    : 8013 INVARIATA')
            print('✅ GATEWAY      : 8012 INVARIATO')
            print('✅ TUNNEL       : INVARIATO')
            print('=' * 80)
            return

        if sec % 10 == 0:
            print(
                f'{sec}s | HTTP={status} | '
                f'READY={bool(resident.get("ready"))} | '
                f'WARMING={bool(resident.get("warming"))}',
                flush=True,
            )

        time.sleep(1)

    fail(proc, 'Timeout warmup V10.3.1 resident', last_payload)


if __name__ == '__main__':
    main()
