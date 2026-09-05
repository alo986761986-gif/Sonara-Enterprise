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
SONARA_PIN = 'eab023fb99127b85318e8a7522cdb8db6d6d5d09'
RAW_BASE = f'https://raw.githubusercontent.com/{SONARA_REPO}/{SONARA_PIN}/scripts'
ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PYTHON = ROOT / '.venv/bin/python'
CHECKPOINTS = ROOT / 'checkpoints'
TURBO = 'acestep-v15-xl-turbo'
BASE = 'acestep-v15-xl-base'
LM4B = 'acestep-5Hz-lm-4B'
PORT = 8001
WORK = Path('/tmp/sonara-rtx6000pro-fresh-0905')
READY = ROOT / 'SONARA_RTX6000PRO_FULL_READY_0905.json'

DEPENDENCIES = {
    'fresh': 'ace-step-xl-turbo-real-music-fresh-install-0902.py',
    'v2': 'ace-step-real-music-v2-speed-quality-upgrade-0902.py',
    'asr_fix': 'ace-step-vocal-asr-v3-install-fix-0902.py',
    'v3': 'ace-step-real-music-v3-molab-activate-0904.py',
    'hf_fix': 'ace-step-hf-stack-repair-v3-recovery-0904.py',
}


def banner(text: str) -> None:
    print('\n' + '=' * 112, flush=True)
    print(text, flush=True)
    print('=' * 112, flush=True)


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'SONARA-RTX6000PRO-FRESH-0905/1.0'})
    with urllib.request.urlopen(req, timeout=180) as response:
        target.write_bytes(response.read())


def load_module(alias: str, filename: str):
    WORK.mkdir(parents=True, exist_ok=True)
    path = WORK / filename
    download(f'{RAW_BASE}/{filename}', path)
    spec = importlib.util.spec_from_file_location(f'sonara_{alias}', path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Impossibile caricare {filename}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def stop_existing_runtime() -> None:
    banner('0/12 - STOP RUNTIME PRECEDENTE')
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
    time.sleep(2)


def verify_rtx6000pro() -> dict:
    banner('1/12 - VERIFY RTX 6000 PRO / CUDA')
    probe = subprocess.run(
        ['python3', '-c', r'''
import json, torch
assert torch.cuda.is_available(), 'CUDA unavailable on host Python'
p = torch.cuda.get_device_properties(0)
print(json.dumps({
  'gpu': torch.cuda.get_device_name(0),
  'vram_gb': round(p.total_memory / 1024**3, 2),
  'cuda': str(torch.version.cuda),
  'bf16': bool(torch.cuda.is_bf16_supported()),
}))
'''],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    print(probe.stdout or '', flush=True)
    if probe.returncode != 0:
        raise RuntimeError('La GPU CUDA del notebook non e pronta.\n' + (probe.stdout or ''))
    data = json.loads((probe.stdout or '').strip().splitlines()[-1])
    name = str(data.get('gpu') or '').lower()
    if '6000' not in name:
        raise RuntimeError(f'GPU inattesa: {data.get("gpu")}. Serve RTX 6000 PRO.')
    if float(data.get('vram_gb') or 0) < 40:
        raise RuntimeError(f'VRAM insufficiente/inattesa: {data.get("vram_gb")} GB')
    print('RTX6000PRO=READY', flush=True)
    return data


def apply_current_runtime_contract(v2) -> None:
    banner('7/12 - APPLY CURRENT SONARA FAST1 / QUALITY2 / ULTRA8 + NATURAL TONE CONTRACT')
    setup = v2.SETUP
    text = setup.read_text(encoding='utf-8')
    original = text

    legacy_blocks = [
        (
            '        # SONARA_SPEED_MAX_V2_QUALITY4\n'
            '        inference_steps=(\n'
            '            4 if getattr(req, "sonara_generation_profile", "auto") in {"fast", "quality"}\n'
            '            else req.inference_steps\n'
            '        ),\n',
            '        inference_steps=req.inference_steps,\n',
        ),
        (
            '        # SONARA_SPEED_MAX_V1_FAST4\n'
            '        inference_steps=(\n'
            '            4 if getattr(req, "sonara_generation_profile", "auto") == "fast"\n'
            '            else 6 if getattr(req, "sonara_generation_profile", "auto") == "quality"\n'
            '            else req.inference_steps\n'
            '        ),\n',
            '        inference_steps=req.inference_steps,\n',
        ),
    ]
    for old, new in legacy_blocks:
        if old in text:
            text = text.replace(old, new, 1)

    old_dcw = (
        '        dcw_scaler=(0.02 if thinking else req.dcw_scaler),\n'
        '        dcw_high_scaler=(0.06 if thinking else req.dcw_high_scaler),\n'
    )
    new_dcw = (
        '        # SONARA_NATURAL_TONE_V14_EDGE_AUTHORITATIVE\n'
        '        dcw_scaler=req.dcw_scaler,\n'
        '        dcw_high_scaler=req.dcw_high_scaler,\n'
    )
    if old_dcw in text:
        text = text.replace(old_dcw, new_dcw, 1)

    if 'SONARA_SPEED_MAX_V2_QUALITY4' in text or 'SONARA_SPEED_MAX_V1_FAST4' in text:
        raise RuntimeError('Vecchio override Fast4/Quality4 ancora presente.')
    if 'inference_steps=req.inference_steps,' not in text:
        raise RuntimeError('Il runtime non conserva inference_steps richiesti dal router SONARA.')
    if 'SONARA_NATURAL_TONE_V14_EDGE_AUTHORITATIVE' not in text:
        # Fresh upstream without the V2 DCW override is acceptable only if it already passes through request values.
        required = 'dcw_scaler=req.dcw_scaler,\n        dcw_high_scaler=req.dcw_high_scaler,'
        if required not in text:
            raise RuntimeError('Contratto Natural Tone non verificabile nel runtime ACE-Step.')

    if text != original:
        backup = setup.with_suffix(setup.suffix + '.before-sonara-live-0905')
        if not backup.exists():
            backup.write_text(original, encoding='utf-8')
        setup.write_text(text, encoding='utf-8')

    subprocess.run([str(PYTHON), '-m', 'py_compile', str(setup)], cwd=str(ROOT), check=True)
    print('FAST_INFERENCE_STEPS=1_ROUTER_CONTROLLED', flush=True)
    print('QUALITY_INFERENCE_STEPS=2_ROUTER_CONTROLLED', flush=True)
    print('ULTRA_INFERENCE_STEPS=2_ROUTER_CONTROLLED', flush=True)
    print('NATURAL_TONE_DCW=REQUEST_CONTROLLED', flush=True)


def request_json(url: str, timeout: int = 15) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'User-Agent': 'SONARA-RTX6000PRO-FRESH-0905/1.0',
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode('utf-8', errors='replace')
    return json.loads(raw) if raw else {}


def wait_asr() -> dict:
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
    raise RuntimeError(f'ASR V3 non pronto: {last!r}')


def main() -> None:
    banner('SONARA - NEW MOLAB NOTEBOOK - RTX 6000 PRO - ACE-STEP XL-TURBO FULL FRESH 0905')
    print(f'SONARA_SOURCE_PIN={SONARA_PIN}', flush=True)
    print(f'PRODUCTION_MODEL={TURBO}', flush=True)
    print(f'REFINEMENT_MODEL={BASE}', flush=True)
    print(f'LM_MODEL={LM4B}', flush=True)
    print('PRODUCTION_SPEED=FAST1_QUALITY2_ULTRA8', flush=True)
    print('QUALITY_AB_DIVERSITY=SONARA_QUALITY_AB_DIVERSITY_V8_EDGE', flush=True)
    print('NATURAL_TONE=SONARA_NATURAL_TONE_V14', flush=True)
    print('RICH_ARRANGEMENT=SONARA_RICH_ARRANGEMENT_V13', flush=True)
    print('FAST_80_RESCUE=ON_EDGE', flush=True)
    print('QUALITY_47_RESCUE=ON_EDGE', flush=True)

    stop_existing_runtime()
    host_gpu = verify_rtx6000pro()

    fresh = load_module('fresh', DEPENDENCIES['fresh'])
    v2 = load_module('v2', DEPENDENCIES['v2'])
    asr_fix = load_module('asr_fix', DEPENDENCIES['asr_fix'])
    v3 = load_module('v3', DEPENDENCIES['v3'])
    hf_fix = load_module('hf_fix', DEPENDENCIES['hf_fix'])

    banner('2/12 - CLEAN ACE-STEP 1.5 + PYTHON 3.12')
    fresh.TOOLS.mkdir(parents=True, exist_ok=True)
    fresh.WORK.mkdir(parents=True, exist_ok=True)
    fresh.check_disk()
    uv = fresh.ensure_uv()
    fresh.prepare_repo()
    env = fresh.install_environment(uv)

    banner('3/12 - VERIFY CUDA INSIDE ACE-STEP VENV')
    fresh.verify_gpu(env)

    banner('4/12 - DOWNLOAD ACE-STEP XL-TURBO')
    fresh.download_models(env)

    banner('5/12 - APPLY REAL MUSIC V1 + V2 API CONTRACTS')
    fresh.patch_real_music_api()
    v2.require_runtime()
    v2.patch_http_contract()
    v2.patch_generation_runtime()
    v2.patch_health_marker()
    v2.verify_code()

    banner('6/12 - INSTALL VOCAL ASR V3 + CUDA LIBRARIES')
    asr_fix.main()

    apply_current_runtime_contract(v2)

    banner('8/12 - REPAIR HUGGING FACE / TOKENIZERS STACK')
    hf_fix.repair_stack()
    if not hf_fix.import_probe('SONARA_0905_IMPORT_PROBE'):
        raise RuntimeError('HF/tokenizers stack non compatibile dopo repair.')
    print('HF_STACK=READY', flush=True)

    banner('9/12 - INSTALL/VERIFY LM 4B + XL-BASE')
    v3.ensure_runtime()
    v3.ensure_lm4b()
    v3.ensure_base()
    gpu = v3.verify_gpu()

    banner('10/12 - START ACE-STEP REAL MUSIC API')
    api_proc, backend, compile_model, health = v2.start_best_api()
    asr = wait_asr()

    banner('11/12 - START PUBLIC CLOUDFLARE TUNNEL')
    tunnel_proc, public_url = v2.start_new_tunnel()
    public_health = request_json(public_url + '/health', 20)
    if not v2.health_ready(public_health):
        raise RuntimeError('Il tunnel pubblico non espone un ACE-Step health valido.')

    banner('12/12 - FINAL CAPABILITY PROBE')
    models = v3.probe_models()
    v3.write_ready(gpu, models, health)

    payload = {
        'ok': True,
        'profile': 'SONARA RTX 6000 PRO FULL FRESH 0905',
        'sonara_source_pin': SONARA_PIN,
        'runtime_root': str(ROOT),
        'public_url': public_url,
        'model': TURBO,
        'refinement_model': BASE,
        'lm_model': LM4B,
        'lm_backend': backend,
        'torch_compile': bool(compile_model),
        'host_gpu': host_gpu,
        'runtime_gpu': gpu,
        'models': models,
        'health': health,
        'vocal_asr': asr,
        'fast_inference_steps': 1,
        'quality_inference_steps': 2,
        'ultra_inference_steps': 8,
        'max_batch_size': 2,
        'quality_ab_diversity_profile': 'sonara-quality-ab-diversity-v8',
        'natural_tone_profile': 'sonara-natural-tone-v14',
        'rich_arrangement_profile': 'sonara-rich-arrangement-v13',
        'fast_80_rescue_profile': 'sonara-fast-80-rescue-v1',
        'quality_47_rescue_profile': 'sonara-quality-47-rescue-v1',
        'cpu_offload': False,
        'created_at_epoch': int(time.time()),
    }
    READY.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

    banner('✅ SONARA ACE-STEP XL-TURBO RTX 6000 PRO READY')
    print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
    print(f'MODEL={TURBO}', flush=True)
    print(f'REFINEMENT_MODEL={BASE}', flush=True)
    print(f'LM_MODEL={LM4B}', flush=True)
    print('FAST=1_STEP', flush=True)
    print('QUALITY=2_STEPS', flush=True)
    print('ULTRA=2_STEPS', flush=True)
    print('MAX_BATCH_SIZE=2', flush=True)
    print('QUALITY_AB=INDEPENDENT_COMPOSITIONS_V8_EDGE', flush=True)
    print('NATURAL_TONE=V14', flush=True)
    print('RICH_ARRANGEMENT=V13', flush=True)
    print('VOCAL_ASR_V3=ON', flush=True)
    print('CPU_OFFLOAD=OFF', flush=True)
    print(f'READY_FILE={READY}', flush=True)
    print('QUESTA E LA CELLA DA LASCIARE ATTIVA.', flush=True)

    try:
        while True:
            if api_proc.poll() is not None:
                tail = v2.API_LOG.read_text(errors='replace')[-16000:] if v2.API_LOG.exists() else ''
                raise RuntimeError('ACE-Step API fermata:\n' + tail)
            if tunnel_proc.poll() is not None:
                raise RuntimeError('Cloudflare tunnel fermato.')
            local = request_json(f'http://127.0.0.1:{PORT}/health', 10)
            public = request_json(public_url + '/health', 15)
            local_ok = v2.health_ready(local)
            public_ok = v2.health_ready(public)
            print(
                f'[{time.strftime("%H:%M:%S")}] SONARA RTX6000PRO | '
                f'API={"UP" if local_ok else "DOWN"} | PUBLIC={"UP" if public_ok else "DOWN"} | '
                f'FAST=1 | QUALITY=2 | ULTRA=2 | BATCH=2 | {public_url}',
                flush=True,
            )
            if not local_ok or not public_ok:
                raise RuntimeError('Health non valido; fermo la cella per evitare routing corrotto.')
            time.sleep(45)
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
