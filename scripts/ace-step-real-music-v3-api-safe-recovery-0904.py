#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import signal
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = 'alo986761986-gif/Sonara-Enterprise'
RAW = f'https://raw.githubusercontent.com/{REPO}/main/scripts'
ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PYTHON = ROOT / '.venv/bin/python'
WORK = Path('/tmp/sonara-real-music-v3-safe-recovery-0904')
LOG = WORK / 'api-safe.log'
PORT = 8001
TURBO = 'acestep-v15-xl-turbo'
BASE = 'acestep-v15-xl-base'
LM = 'acestep-5Hz-lm-4B'
READY = ROOT / 'SONARA_REAL_MUSIC_V3_SAFE_READY.json'


def banner(text: str) -> None:
    print('\n' + '=' * 98, flush=True)
    print(text, flush=True)
    print('=' * 98, flush=True)


def fetch_module(alias: str, filename: str):
    WORK.mkdir(parents=True, exist_ok=True)
    path = WORK / filename
    req = urllib.request.Request(f'{RAW}/{filename}', headers={'User-Agent': 'SONARA-Safe-Recovery/1.0'})
    with urllib.request.urlopen(req, timeout=120) as response:
        path.write_bytes(response.read())
    spec = importlib.util.spec_from_file_location(f'sonara_{alias}', path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Cannot load {filename}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def request_json(url: str, timeout: int = 20, payload: dict | None = None) -> dict:
    data = None
    headers = {'Accept': 'application/json', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache'}
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(url, data=data, headers=headers, method='POST' if payload is not None else 'GET')
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode('utf-8', errors='replace')
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='replace')
        try:
            return json.loads(raw) if raw else {'http_status': exc.code}
        except Exception:
            return {'http_status': exc.code, 'raw': raw}
    return json.loads(raw) if raw else {}


def tail(path: Path, chars: int = 24000) -> str:
    if not path.exists():
        return ''
    return path.read_text(errors='replace')[-chars:]


def show_previous_failure() -> None:
    old = Path('/tmp/sonara-real-music-v2/api.log')
    if old.exists():
        banner('PREVIOUS ACE-STEP API FAILURE LOG')
        print(tail(old, 18000), flush=True)


def kill_runtime() -> None:
    try:
        rows = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
    except Exception:
        return
    me = os.getpid()
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        if pid == me:
            continue
        cmd = parts[1].lower()
        if ('acestep.api_server' in cmd and str(PORT) in cmd) or ('cloudflared' in cmd and str(PORT) in cmd):
            try:
                os.kill(pid, signal.SIGTERM)
                print(f'STOPPED_PID={pid}', flush=True)
            except Exception:
                pass
    time.sleep(3)


def safe_server_env() -> dict:
    env = os.environ.copy()
    env.pop('VIRTUAL_ENV', None)
    # ASR recovery may prepend pip-installed NVIDIA libraries. Keep them available
    # for Whisper later, but do not force them into the ACE-Step/PyTorch process.
    ld = env.get('LD_LIBRARY_PATH', '')
    if ld:
        kept = [p for p in ld.split(':') if p and '/site-packages/nvidia/' not in p]
        if kept:
            env['LD_LIBRARY_PATH'] = ':'.join(kept)
        else:
            env.pop('LD_LIBRARY_PATH', None)
    env.update({
        'ACESTEP_PROJECT_ROOT': str(ROOT),
        'ACESTEP_CHECKPOINTS_DIR': str(ROOT / 'checkpoints'),
        'ACESTEP_CONFIG_PATH': TURBO,
        'ACESTEP_DEVICE': 'cuda',
        'ACESTEP_INIT_LLM': 'false',
        'ACESTEP_LM_MODEL_PATH': LM,
        'ACESTEP_LM_BACKEND': 'pt',
        'ACESTEP_LM_DEVICE': 'cuda',
        'ACESTEP_USE_FLASH_ATTENTION': 'false',
        'ACESTEP_COMPILE_MODEL': 'false',
        'ACESTEP_OFFLOAD_TO_CPU': 'false',
        'ACESTEP_OFFLOAD_DIT_TO_CPU': 'false',
        'ACESTEP_LM_OFFLOAD_TO_CPU': 'false',
        'ACESTEP_NO_INIT': 'true',
        'ACESTEP_API_HOST': '0.0.0.0',
        'ACESTEP_API_PORT': str(PORT),
        'ACESTEP_API_WORKERS': '1',
        'ACESTEP_QUEUE_WORKERS': '1',
        'ACESTEP_QUEUE_MAXSIZE': '64',
        'ACESTEP_DOWNLOAD_SOURCE': 'huggingface',
        'PYTHONUNBUFFERED': '1',
        'TOKENIZERS_PARALLELISM': 'false',
        'MPLBACKEND': 'Agg',
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
    })
    return env


def start_empty_api() -> subprocess.Popen:
    banner('1/7 - START ACE-STEP API IN SAFE NO-INIT MODE')
    kill_runtime()
    WORK.mkdir(parents=True, exist_ok=True)
    LOG.write_text('', encoding='utf-8')
    stream = LOG.open('a', encoding='utf-8', buffering=1)
    proc = subprocess.Popen(
        [str(PYTHON), '-m', 'acestep.api_server', '--host', '0.0.0.0', '--port', str(PORT), '--download-source', 'huggingface', '--no-init'],
        cwd=str(ROOT), env=safe_server_env(), stdout=stream, stderr=subprocess.STDOUT, start_new_session=True,
    )
    print(f'SAFE_API_PID={proc.pid}', flush=True)
    deadline = time.time() + 300
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError('ACE-Step API import/startup failed in no-init mode:\n' + tail(LOG))
        try:
            body = request_json(f'http://127.0.0.1:{PORT}/health', 10)
            data = body.get('data') or body
            if str(data.get('status') or '').lower() == 'ok':
                print('SAFE_EMPTY_API=READY', flush=True)
                print(json.dumps(data, indent=2, ensure_ascii=False), flush=True)
                return proc
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError('ACE-Step no-init API timeout:\n' + tail(LOG))


def staged_init() -> dict:
    banner('2/7 - INITIALIZE XL-TURBO + LM 4B THROUGH OFFICIAL /v1/init')
    payload = {'model': TURBO, 'slot': 1, 'init_llm': True, 'lm_model_path': LM}
    body = request_json(f'http://127.0.0.1:{PORT}/v1/init', timeout=2400, payload=payload)
    print(json.dumps(body, indent=2, ensure_ascii=False), flush=True)
    if int(body.get('code', 200) or 200) >= 400 or body.get('error'):
        raise RuntimeError('ACE-Step staged init failed: ' + json.dumps(body, ensure_ascii=False) + '\n\nAPI LOG:\n' + tail(LOG))
    deadline = time.time() + 180
    last = {}
    while time.time() < deadline:
        raw = request_json(f'http://127.0.0.1:{PORT}/health', 15)
        data = raw.get('data') or raw
        last = data
        if data.get('models_initialized') is True and data.get('llm_initialized') is True and TURBO in str(data.get('loaded_model') or ''):
            print('XL_TURBO=READY', flush=True)
            print('LM4B=READY', flush=True)
            print(json.dumps(data, indent=2, ensure_ascii=False), flush=True)
            return data
        time.sleep(3)
    raise RuntimeError('Staged init returned but health is incomplete: ' + repr(last) + '\n' + tail(LOG))


def verify_asr_route() -> dict:
    banner('3/7 - VERIFY VOCAL ASR V3 ROUTE')
    body = request_json(f'http://127.0.0.1:{PORT}/v1/sonara/asr-health', 20)
    print(json.dumps(body, indent=2, ensure_ascii=False), flush=True)
    if not (body.get('ok') is True or (body.get('data') or {}).get('ok') is True):
        raise RuntimeError('Vocal ASR V3 route is not active: ' + repr(body))
    return body


def main() -> None:
    banner('SONARA REAL MUSIC V3 - SAFE API RECOVERY')
    if not ROOT.exists() or not PYTHON.exists():
        raise RuntimeError('SONARA ACE-Step CLEAN runtime missing.')
    show_previous_failure()

    v3 = fetch_module('v3', 'ace-step-real-music-v3-molab-activate-0904.py')
    v2 = fetch_module('v2', 'ace-step-real-music-v2-speed-quality-upgrade-0902.py')

    banner('0/7 - VERIFY MODELS + RTX')
    v3.ensure_runtime()
    v3.ensure_lm4b()
    v3.ensure_base()
    gpu = v3.verify_gpu()

    api_proc = start_empty_api()
    health = staged_init()
    asr = verify_asr_route()

    banner('4/7 - VERIFY MODEL CATALOG')
    models = v3.probe_models()

    banner('5/7 - START ONE CLOUDFLARE TUNNEL')
    tunnel_proc, public_url = v2.start_new_tunnel()

    banner('6/7 - WRITE REAL MUSIC V3 READY STATE')
    v3.write_ready(gpu, models, health)
    payload = {
        'ok': True,
        'profile': 'SONARA REAL MUSIC V3 SAFE RECOVERY',
        'public_url': public_url,
        'turbo_model': TURBO,
        'turbo_steps': 8,
        'base_model': BASE,
        'base_refinement_steps': 50,
        'lm_model': LM,
        'lm_backend': 'pt',
        'torch_compile': False,
        'flash_attention': False,
        'cpu_offload': False,
        'gpu': gpu,
        'models': models,
        'health': health,
        'vocal_asr': asr,
    }
    READY.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    banner('7/7 - ✅ SONARA REAL MUSIC V3 SAFE RUNTIME READY')
    print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
    print(f'MODEL={TURBO}', flush=True)
    print(f'REFINEMENT_MODEL={BASE}', flush=True)
    print(f'LM_MODEL={LM}', flush=True)
    print('LM_BACKEND=pt', flush=True)
    print('TORCH_COMPILE=false', flush=True)
    print('FLASH_ATTENTION=false', flush=True)
    print('CPU_OFFLOAD=false', flush=True)
    print('VOCAL_ASR_V3=ON', flush=True)
    print(f'READY_FILE={READY}', flush=True)
    print('NON FERMARE QUESTA CELLA.', flush=True)

    try:
        while True:
            if api_proc.poll() is not None:
                raise RuntimeError('ACE-Step API stopped:\n' + tail(LOG))
            if tunnel_proc.poll() is not None:
                raise RuntimeError('Cloudflare tunnel stopped.')
            try:
                raw = request_json(f'http://127.0.0.1:{PORT}/health', 10)
                data = raw.get('data') or raw
                ok = data.get('models_initialized') is True and data.get('llm_initialized') is True
            except Exception:
                ok = False
            print(
                f"[{time.strftime('%H:%M:%S')}] REAL MUSIC V3 SAFE | API={'UP' if ok else 'DOWN'} | "
                f'XL_TURBO=ON | XL_BASE=ON | LM4B=ON | ASR=ON | TUNNEL=UP | {public_url}', flush=True,
            )
            time.sleep(60)
    finally:
        for proc in (tunnel_proc, api_proc):
            if proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except Exception:
                    try:
                        proc.terminate()
                    except Exception:
                        pass


if __name__ == '__main__':
    main()
