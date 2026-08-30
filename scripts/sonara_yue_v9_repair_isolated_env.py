#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path

VENV = Path('/marimo/venvs/sonara-yue-v9-blackwell')
PY = VENV / 'bin' / 'python'
WORKER = Path('/marimo/sonara_yue_worker_v9_exl2.py')
LOG = Path('/marimo/sonara_yue_worker_v9_exl2.log')
PORT = int(os.environ.get('SONARA_YUE_PORT', '8012'))
ROOT = Path('/marimo/YuE-exllamav2')
MODELS = Path('/marimo/models/yue-exl2')
STAGE1 = MODELS / 'stage1-8bpw'
STAGE2 = MODELS / 'stage2-8bpw'


def clean_env():
    env = os.environ.copy()
    for key in [
        'PYTHONPATH',
        'PYTHONHOME',
        'PYTHONSTARTUP',
        'UV_PROJECT_ENVIRONMENT',
        'UV_ACTIVE',
        'CONDA_PREFIX',
        'CONDA_DEFAULT_ENV',
    ]:
        env.pop(key, None)

    env['VIRTUAL_ENV'] = str(VENV)
    old_path = env.get('PATH', '')
    safe_parts = [p for p in old_path.split(os.pathsep) if '/tmp/uv-venv' not in p]
    env['PATH'] = str(VENV / 'bin') + os.pathsep + os.pathsep.join(safe_parts)
    env['PYTHONNOUSERSITE'] = '1'
    env['PYTHONSAFEPATH'] = '1'
    env['PYTHONUNBUFFERED'] = '1'
    env['CUDA_MODULE_LOADING'] = 'LAZY'
    env['TOKENIZERS_PARALLELISM'] = 'false'
    env['PYTORCH_ALLOC_CONF'] = 'expandable_segments:True'
    env.pop('PYTORCH_CUDA_ALLOC_CONF', None)

    env['SONARA_YUE_V9_ROOT'] = str(ROOT)
    env['SONARA_YUE_V9_XCODEC'] = str(ROOT / 'xcodec_mini_infer')
    env['SONARA_YUE_V9_STAGE1_MODEL'] = str(STAGE1)
    env['SONARA_YUE_V9_STAGE2_MODEL'] = str(STAGE2)
    env['SONARA_YUE_V9_OUTPUT'] = str(ROOT / 'sonara_api_output_v9')
    env['SONARA_YUE_PORT'] = str(PORT)
    env['SONARA_YUE_MAX_DURATION'] = '480'
    env['SONARA_YUE_V9_SLOTS'] = os.environ.get('SONARA_YUE_V9_SLOTS', '2')
    env['SONARA_YUE_V9_STAGE1_CACHE'] = '16384'
    env['SONARA_YUE_V9_STAGE2_CACHE'] = '65536'
    env['SONARA_YUE_V9_STAGE1_CACHE_MODE'] = 'FP16'
    env['SONARA_YUE_V9_STAGE2_CACHE_MODE'] = 'FP16'
    env['SONARA_YUE_V9_GUIDANCE'] = '0'
    return env


def run_capture(cmd, env):
    return subprocess.run(
        [str(x) for x in cmd],
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )


def health():
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/health', timeout=5) as r:
            return r.status, r.read().decode('utf-8', errors='replace')
    except Exception as exc:
        return 0, str(exc)


def tail(path: Path, n=120):
    if not path.exists():
        return ''
    return '\n'.join(path.read_text(encoding='utf-8', errors='ignore').splitlines()[-n:])


def main():
    print('=' * 78, flush=True)
    print('SONARA YUE V9 - REPAIR ISOLATED PYTHON ENV', flush=True)
    print('=' * 78, flush=True)

    if not PY.exists():
        print('❌ Venv V9 non trovato:', PY, flush=True)
        return 2
    if not WORKER.exists():
        print('❌ Worker V9 non trovato:', WORKER, flush=True)
        return 3

    env = clean_env()

    # Force the matching CUDA 12.8 torchaudio inside the V9 venv only.
    print('Ripristino torchaudio 2.9.0 CUDA 12.8 nel venv V9...', flush=True)
    pip = run_capture([
        PY, '-I', '-m', 'pip', 'install', '--force-reinstall', '--no-deps',
        'torchaudio==2.9.0',
        '--index-url', 'https://download.pytorch.org/whl/cu128',
    ], env)
    print(pip.stdout[-3000:], flush=True)
    if pip.returncode != 0:
        print(pip.stderr[-3000:], flush=True)
        print('❌ Reinstall torchaudio fallita', flush=True)
        return 4

    check_code = r'''
import json, sys, torch, torchaudio
print(json.dumps({
    "python": sys.executable,
    "torch": torch.__version__,
    "torch_file": torch.__file__,
    "torchaudio": torchaudio.__version__,
    "torchaudio_file": torchaudio.__file__,
    "cuda": torch.version.cuda,
    "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "NONE",
    "capability": torch.cuda.get_device_capability(0) if torch.cuda.is_available() else None,
}))
assert "/tmp/uv-venv" not in torch.__file__, torch.__file__
assert "/tmp/uv-venv" not in torchaudio.__file__, torchaudio.__file__
assert "/sonara-yue-v9-blackwell/" in torch.__file__, torch.__file__
assert "/sonara-yue-v9-blackwell/" in torchaudio.__file__, torchaudio.__file__
assert torch.cuda.is_available(), "CUDA non disponibile"
'''
    check = run_capture([PY, '-I', '-c', check_code], env)
    print(check.stdout, flush=True)
    if check.returncode != 0:
        print(check.stderr, flush=True)
        print('❌ Ambiente V9 non ancora isolato', flush=True)
        return 5

    print('✅ torch + torchaudio nello stesso venv Python 3.12', flush=True)
    print('✅ /tmp/uv-venv escluso', flush=True)

    for name in [
        'sonara_yue_worker_v9_exl2.py',
        'sonara_yue_worker_v7_maxspeed.py',
        'sonara_yue_worker_v6_ultra.py',
        'sonara_yue_worker_v5_turbo.py',
        'sonara_yue_worker_v4.py',
        'sonara_yue_worker.py',
    ]:
        subprocess.run(['pkill', '-f', name], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    time.sleep(2)

    LOG.parent.mkdir(parents=True, exist_ok=True)
    LOG.write_text('', encoding='utf-8')
    with LOG.open('ab', buffering=0) as fh:
        process = subprocess.Popen(
            [str(PY), '-I', str(WORKER)],
            stdout=fh,
            stderr=subprocess.STDOUT,
            env=env,
            start_new_session=True,
        )

    print('Worker V9 PID:', process.pid, flush=True)

    last = ''
    for sec in range(1, 301):
        status, body = health()
        last = body
        if status == 200:
            try:
                data = json.loads(body)
            except Exception:
                data = {}
            engine = data.get('engine') or {}
            if engine.get('ready') is True:
                print('=' * 78, flush=True)
                print('✅ SONARA YUE V9 ISOLATO E PRONTO', flush=True)
                print('✅ TORCH:', data.get('engine', {}).get('gpu') or 'GPU READY', flush=True)
                print('✅ GPU SLOTS:', engine.get('slots'), flush=True)
                print('✅ PORTA:', PORT, flush=True)
                print('🚀 V9 READY - CONTAMINAZIONE PYTHON RISOLTA', flush=True)
                print('=' * 78, flush=True)
                return 0

        if process.poll() is not None:
            print('❌ Worker terminato rc=', process.returncode, flush=True)
            print('===== LOG V9 =====', flush=True)
            print(tail(LOG), flush=True)
            print('==================', flush=True)
            return 6

        if sec % 15 == 0:
            print(f'Warmup V9: {sec}s | HTTP={status}', flush=True)
        time.sleep(1)

    print('❌ Timeout warmup V9', flush=True)
    print(last[-3000:], flush=True)
    print('===== LOG V9 =====', flush=True)
    print(tail(LOG), flush=True)
    print('==================', flush=True)
    return 7


if __name__ == '__main__':
    raise SystemExit(main())
