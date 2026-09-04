#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import os
import signal
import subprocess
import time
import urllib.request
from pathlib import Path

REPO = 'alo986761986-gif/Sonara-Enterprise'
RAW = f'https://raw.githubusercontent.com/{REPO}/main/scripts'
ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
WORK = Path('/tmp/sonara-real-music-v3-resume-0904')
PORT = 8001
TURBO = 'acestep-v15-xl-turbo'
BASE = 'acestep-v15-xl-base'
LM = 'acestep-5Hz-lm-4B'
READY = ROOT / 'SONARA_REAL_MUSIC_V3_RESUME_READY.json'


def banner(text: str) -> None:
    print('\n' + '=' * 96, flush=True)
    print(text, flush=True)
    print('=' * 96, flush=True)


def fetch_module(alias: str, filename: str):
    WORK.mkdir(parents=True, exist_ok=True)
    path = WORK / filename
    req = urllib.request.Request(f'{RAW}/{filename}', headers={'User-Agent': 'SONARA-V3-Resume/1.0'})
    with urllib.request.urlopen(req, timeout=120) as response:
        path.write_bytes(response.read())
    spec = importlib.util.spec_from_file_location(f'sonara_{alias}', path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Cannot load {filename}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def request_json(url: str, timeout: int = 20) -> dict:
    req = urllib.request.Request(url, headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode('utf-8', errors='replace')
    return json.loads(raw) if raw else {}


def verify_existing_install() -> None:
    if not ROOT.exists() or not (ROOT / '.venv/bin/python').exists():
        raise RuntimeError('ACE-Step CLEAN non trovato: la prima installazione non e arrivata abbastanza avanti.')
    for name in (TURBO, LM):
        if not (ROOT / 'checkpoints' / name).exists():
            raise RuntimeError(f'Modello mancante: {name}. Rilanciare il full fresh installer aggiornato.')
    print('PARTIAL_INSTALL=FOUND', flush=True)
    print(f'ROOT={ROOT}', flush=True)


def verify_asr_route() -> dict:
    deadline = time.time() + 180
    last = {}
    while time.time() < deadline:
        try:
            last = request_json(f'http://127.0.0.1:{PORT}/v1/sonara/asr-health', 15)
            if last.get('ok') is True or (last.get('data') or {}).get('ok') is True:
                print('VOCAL_ASR_V3=READY', flush=True)
                return last
        except Exception:
            pass
        time.sleep(3)
    raise RuntimeError(f'ASR route non pronta: {last!r}')


def main() -> None:
    banner('SONARA REAL MUSIC V3 - RESUME DOPO ERRORE FASTER-WHISPER')
    verify_existing_install()

    asr_fix = fetch_module('asr_fix', 'ace-step-vocal-asr-v3-install-fix-0902.py')
    v2 = fetch_module('v2', 'ace-step-real-music-v2-speed-quality-upgrade-0902.py')
    v3 = fetch_module('v3', 'ace-step-real-music-v3-molab-activate-0904.py')

    banner('1/6 - FIX FASTER-WHISPER + CUDA LIBRARIES + ASR V3 PATCH')
    asr_fix.install_packages()
    asr_fix.export_cuda_library_path()
    os.environ['SONARA_ASR_MODEL'] = 'large-v3-turbo'
    os.environ['SONARA_ASR_DEVICE'] = 'cuda'
    os.environ['SONARA_ASR_COMPUTE_TYPE'] = 'float16'
    asr_fix.run_original_patch_without_broken_installer()

    banner('2/6 - INSTALL / VERIFY XL-BASE + LM 4B + RTX')
    v3.ensure_runtime()
    v3.ensure_lm4b()
    v3.ensure_base()
    gpu = v3.verify_gpu()

    banner('3/6 - START FINAL REAL MUSIC V2/V3 API')
    api_proc, backend, compile_model, health = v2.start_best_api()
    asr_health = verify_asr_route()

    banner('4/6 - START FINAL CLOUDFLARE TUNNEL')
    tunnel_proc, public_url = v2.start_new_tunnel()

    banner('5/6 - VERIFY MODEL CATALOG + REAL MUSIC V3')
    models = v3.probe_models()
    v3.write_ready(gpu, models, health)

    payload = {
        'ok': True,
        'profile': 'SONARA REAL MUSIC V3 RESUMED',
        'public_url': public_url,
        'turbo_model': TURBO,
        'turbo_steps': 8,
        'base_model': BASE,
        'base_refinement_steps': 50,
        'lm_model': LM,
        'lm_backend': backend,
        'torch_compile': bool(compile_model),
        'gpu': gpu,
        'models': models,
        'vocal_asr': asr_health,
        'quality': 'XL-Turbo 8-step + 4 candidates + rank + repair',
        'ultra': 'XL-Turbo 8-step + XL-Base refine + Heun + repair',
    }
    READY.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    banner('6/6 - ✅ SONARA REAL MUSIC V3 READY')
    print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
    print(f'MODEL={TURBO}', flush=True)
    print(f'REFINEMENT_MODEL={BASE}', flush=True)
    print(f'LM_MODEL={LM}', flush=True)
    print('VOCAL_ASR_V3=ON', flush=True)
    print('REAL_MUSIC_V3=ON', flush=True)
    print('CPU_OFFLOAD=OFF', flush=True)
    print(f'READY_FILE={READY}', flush=True)
    print('NON FERMARE QUESTA CELLA.', flush=True)

    try:
        while True:
            if api_proc.poll() is not None:
                tail = v2.API_LOG.read_text(errors='replace')[-16000:] if v2.API_LOG.exists() else ''
                raise RuntimeError(f'ACE-Step API stopped unexpectedly.\n{tail}')
            if tunnel_proc.poll() is not None:
                raise RuntimeError('Cloudflare tunnel stopped unexpectedly.')
            try:
                ok = v2.health_ready(request_json(f'http://127.0.0.1:{PORT}/health', 10))
            except Exception:
                ok = False
            print(
                f"[{time.strftime('%H:%M:%S')}] REAL MUSIC V3 | API={'UP' if ok else 'DOWN'} | "
                f'XL_TURBO=ON | XL_BASE=ON | LM4B=ON | ASR=ON | TUNNEL=UP | {public_url}',
                flush=True,
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
