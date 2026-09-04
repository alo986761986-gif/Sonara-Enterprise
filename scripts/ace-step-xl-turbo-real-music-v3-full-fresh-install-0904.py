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

SONARA_REPO = 'alo986761986-gif/Sonara-Enterprise'
SONARA_PIN = '2f275573ce31d5ab4410b7848a8fab5a5fb6a71a'
RAW_BASE = f'https://raw.githubusercontent.com/{SONARA_REPO}/{SONARA_PIN}/scripts'
ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
WORK = Path('/tmp/sonara-real-music-v3-fresh-0904')
PORT = 8001
MODEL = 'acestep-v15-xl-turbo'
BASE_MODEL = 'acestep-v15-xl-base'
LM_MODEL = 'acestep-5Hz-lm-4B'
READY = ROOT / 'SONARA_REAL_MUSIC_V3_FULL_READY.json'

DEPENDENCIES = {
    'fresh': 'ace-step-xl-turbo-real-music-fresh-install-0902.py',
    'v2': 'ace-step-real-music-v2-speed-quality-upgrade-0902.py',
    'asr': 'ace-step-vocal-asr-v3-upgrade-0902.py',
    'v3': 'ace-step-real-music-v3-molab-activate-0904.py',
}


def banner(text: str) -> None:
    print('\n' + '=' * 100, flush=True)
    print(text, flush=True)
    print('=' * 100, flush=True)


def download(url: str, target: Path) -> None:
    req = urllib.request.Request(url, headers={'User-Agent': 'SONARA-Real-Music-V3-Installer/1.0'})
    with urllib.request.urlopen(req, timeout=120) as response:
        target.write_bytes(response.read())


def load_module(alias: str, filename: str):
    WORK.mkdir(parents=True, exist_ok=True)
    path = WORK / filename
    download(f'{RAW_BASE}/{filename}', path)
    spec = importlib.util.spec_from_file_location(f'sonara_{alias}', path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Cannot load dependency: {filename}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def stop_existing_runtime() -> None:
    banner('0/10 - STOP PREVIOUS ACE-STEP / CLOUDFLARE PROCESSES')
    try:
        rows = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
    except Exception:
        return
    me = os.getpid()
    targets: list[int] = []
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
            targets.append(pid)
    for pid in targets:
        try:
            os.kill(pid, signal.SIGTERM)
            print(f'STOPPED_PID={pid}', flush=True)
        except Exception:
            pass
    if targets:
        time.sleep(3)


def request_json(url: str, timeout: int = 20) -> dict:
    req = urllib.request.Request(
        url,
        headers={'Accept': 'application/json', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache'},
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode('utf-8', errors='replace')
    return json.loads(raw) if raw else {}


def verify_asr_health() -> dict:
    deadline = time.time() + 180
    last: dict = {}
    while time.time() < deadline:
        try:
            last = request_json(f'http://127.0.0.1:{PORT}/v1/sonara/asr-health', 15)
            if last.get('ok') is True or (last.get('data') or {}).get('ok') is True:
                print('VOCAL_ASR_V3=READY', flush=True)
                print(json.dumps(last, indent=2, ensure_ascii=False), flush=True)
                return last
        except Exception:
            pass
        time.sleep(3)
    raise RuntimeError(f'Vocal ASR V3 route not ready: {last!r}')


def write_full_ready(*, public_url: str, backend: str, compile_model: bool, gpu: dict, models: dict, health: dict, asr: dict) -> None:
    payload = {
        'ok': True,
        'profile': 'SONARA REAL MUSIC V3 FULL',
        'sonara_source_pin': SONARA_PIN,
        'runtime_root': str(ROOT),
        'port': PORT,
        'public_url': public_url,
        'turbo_model': MODEL,
        'turbo_inference_steps': 8,
        'base_model': BASE_MODEL,
        'base_refinement_steps': 50,
        'lm_model': LM_MODEL,
        'lm_backend': backend,
        'torch_compile': bool(compile_model),
        'gpu': gpu,
        'models': models,
        'health': health,
        'vocal_asr': asr,
        'real_music_v2': True,
        'real_music_v3': True,
        'track_genome': True,
        'humanizer': True,
        'stable_singer_identity': True,
        'lyrics_asr_verification': True,
        'automatic_candidate_ranking': True,
        'automatic_repair': True,
        'quality': {
            'model': MODEL,
            'inference_steps': 8,
            'internal_candidates': 4,
            'sampler': 'euler',
        },
        'ultra': {
            'generation_model': MODEL,
            'generation_steps': 8,
            'refinement_model': BASE_MODEL,
            'refinement_steps': 50,
            'internal_candidates': 4,
            'sampler': 'heun',
            'eligible': bool(models.get('base_local')),
        },
    }
    READY.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(payload, indent=2, ensure_ascii=False), flush=True)
    print(f'READY_FILE={READY}', flush=True)


def main() -> None:
    banner('SONARA - RTX 6000 PRO - ACE-STEP XL-TURBO REAL MUSIC V3 FULL FRESH INSTALL')
    print(f'SONARA_SOURCE_PIN={SONARA_PIN}', flush=True)
    print(f'PRODUCTION_MODEL={MODEL}', flush=True)
    print(f'REFINEMENT_MODEL={BASE_MODEL}', flush=True)
    print(f'LM_MODEL={LM_MODEL}', flush=True)
    print('CPU_OFFLOAD=OFF', flush=True)

    stop_existing_runtime()

    fresh = load_module('fresh', DEPENDENCIES['fresh'])
    v2 = load_module('v2', DEPENDENCIES['v2'])
    asr_mod = load_module('asr', DEPENDENCIES['asr'])
    v3 = load_module('v3', DEPENDENCIES['v3'])

    banner('1/10 - CLEAN ACE-STEP 1.5 CHECKOUT + PYTHON 3.12')
    fresh.TOOLS.mkdir(parents=True, exist_ok=True)
    fresh.WORK.mkdir(parents=True, exist_ok=True)
    fresh.check_disk()
    uv = fresh.ensure_uv()
    fresh.prepare_repo()
    env = fresh.install_environment(uv)

    banner('2/10 - VERIFY RTX 6000 PRO / CUDA / BF16')
    fresh.verify_gpu(env)

    banner('3/10 - INSTALL XL-TURBO + LM 4B')
    fresh.download_models(env)

    banner('4/10 - APPLY SONARA REAL MUSIC V1 API CONTRACT')
    fresh.patch_real_music_api()

    banner('5/10 - APPLY SONARA REAL MUSIC V2 SPEED + QUALITY')
    v2.require_runtime()
    v2.patch_http_contract()
    v2.patch_generation_runtime()
    v2.patch_health_marker()
    v2.verify_code()

    banner('6/10 - INSTALL VOCAL ASR V3 / LYRIC VERIFICATION')
    asr_mod.install_asr()
    asr_mod.patch_api()
    asr_mod.verify_syntax()

    banner('7/10 - INSTALL XL-BASE + VERIFY LM 4B / GPU')
    v3.ensure_runtime()
    v3.ensure_lm4b()
    v3.ensure_base()
    gpu = v3.verify_gpu()

    banner('8/10 - START ONE FINAL REAL MUSIC V2/V3 API')
    api_proc, backend, compile_model, health = v2.start_best_api()
    asr_health = verify_asr_health()

    banner('9/10 - START ONE FINAL CLOUDFLARE TUNNEL')
    tunnel_proc, public_url = v2.start_new_tunnel()

    banner('10/10 - FINAL MODEL CATALOG / REAL MUSIC V3 CAPABILITIES')
    models = v3.probe_models()
    v3.write_ready(gpu, models, health)
    write_full_ready(
        public_url=public_url,
        backend=backend,
        compile_model=compile_model,
        gpu=gpu,
        models=models,
        health=health,
        asr=asr_health,
    )

    banner('✅ SONARA ACE-STEP XL-TURBO REAL MUSIC V3 FULL READY')
    print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
    print(f'MODEL={MODEL}', flush=True)
    print(f'REFINEMENT_MODEL={BASE_MODEL}', flush=True)
    print(f'LM_MODEL={LM_MODEL}', flush=True)
    print('QUALITY=XL_TURBO_8_STEPS+4_INTERNAL_CANDIDATES+AUTO_RANK+AUTO_REPAIR', flush=True)
    print('ULTRA=XL_TURBO_8_STEPS+XL_BASE_50_STEP_REFINE+HEUN+AUTO_REPAIR', flush=True)
    print('VOCAL_ASR_V3=ON', flush=True)
    print('TRACK_GENOME=ON', flush=True)
    print('HUMANIZER=ON', flush=True)
    print('STABLE_SINGER_IDENTITY=ON', flush=True)
    print('CPU_OFFLOAD=OFF', flush=True)
    print('NON FERMARE QUESTA CELLA: mantiene API e tunnel attivi.', flush=True)

    try:
        while True:
            if api_proc.poll() is not None:
                tail = v2.API_LOG.read_text(errors='replace')[-16000:] if v2.API_LOG.exists() else ''
                raise RuntimeError(f'ACE-Step API stopped unexpectedly.\n{tail}')
            if tunnel_proc.poll() is not None:
                raise RuntimeError('Cloudflare tunnel stopped unexpectedly.')
            try:
                body = request_json(f'http://127.0.0.1:{PORT}/health', 10)
                api_ok = v2.health_ready(body)
            except Exception:
                api_ok = False
            print(
                f"[{time.strftime('%H:%M:%S')}] REAL MUSIC V3 | API={'UP' if api_ok else 'DOWN'} | "
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
