#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
import time
import urllib.request
from pathlib import Path
from types import SimpleNamespace

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PYTHON = ROOT / '.venv/bin/python'
BASE_SUPERVISOR_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/scripts/'
    'ace-step-real-music-v3-single-cell-supervisor-0904.py'
)
SETUP = ROOT / 'acestep/api/job_generation_setup.py'
SPEED_STATE = ROOT / 'SONARA_REAL_MUSIC_V3_SPEED_SUPERVISOR_READY.json'
MARKER = 'SONARA_SPEED_MAX_V1_FAST4'


def banner(text: str) -> None:
    print('\n' + '=' * 104, flush=True)
    print(text, flush=True)
    print('=' * 104, flush=True)


def load_supervisor() -> SimpleNamespace:
    code = urllib.request.urlopen(BASE_SUPERVISOR_URL, timeout=120).read().decode('utf-8')
    scope = {'__name__': 'sonara_v3_base_supervisor'}
    exec(compile(code, '<sonara-v3-base-supervisor>', 'exec'), scope)
    return SimpleNamespace(**scope)


def can_import(module: str) -> bool:
    done = subprocess.run(
        [str(PYTHON), '-c', f'import {module}; print("OK")'],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return done.returncode == 0


def patch_fast4() -> None:
    banner('1/7 - PATCH FAST PROFILE: 4 STEPS')
    if not SETUP.exists():
        raise RuntimeError(f'File ACE-Step non trovato: {SETUP}')
    text = SETUP.read_text(encoding='utf-8')
    if MARKER in text:
        print('FAST4_PATCH=ALREADY_ACTIVE', flush=True)
    else:
        old = '        inference_steps=req.inference_steps,\n'
        new = (
            '        # SONARA_SPEED_MAX_V1_FAST4\n'
            '        inference_steps=(\n'
            '            4 if getattr(req, "sonara_generation_profile", "auto") == "fast"\n'
            '            else 6 if getattr(req, "sonara_generation_profile", "auto") == "quality"\n'
            '            else req.inference_steps\n'
            '        ),\n'
        )
        if old not in text:
            raise RuntimeError('Pattern inference_steps non trovato; non applico una patch cieca.')
        backup = SETUP.with_suffix(SETUP.suffix + '.before-speed-max-v1')
        if not backup.exists():
            backup.write_text(text, encoding='utf-8')
        SETUP.write_text(text.replace(old, new, 1), encoding='utf-8')
        print('FAST4_PATCH=APPLIED', flush=True)

    done = subprocess.run(
        [str(PYTHON), '-m', 'py_compile', str(SETUP)],
        cwd=str(ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    if done.returncode != 0:
        raise RuntimeError('Syntax check fallito:\n' + (done.stdout or ''))
    print('FAST_INFERENCE_STEPS=4', flush=True)
    print('QUALITY_INFERENCE_STEPS=6', flush=True)
    print('ULTRA_INFERENCE_STEPS=8', flush=True)


def speed_env(base_env_fn, backend: str, compile_model: bool, flash_attention: bool) -> dict:
    env = base_env_fn()
    env.update({
        'ACESTEP_LM_BACKEND': backend,
        'ACESTEP_COMPILE_MODEL': 'true' if compile_model else 'false',
        'ACESTEP_USE_FLASH_ATTENTION': 'true' if flash_attention else 'false',
        'CUDA_MODULE_LOADING': 'LAZY',
        'TORCH_ALLOW_TF32_CUBLAS_OVERRIDE': '1',
        'NVIDIA_TF32_OVERRIDE': '1',
        'TRITON_CACHE_DIR': str(ROOT / '.cache/acestep/triton'),
        'TORCHINDUCTOR_CACHE_DIR': str(ROOT / '.cache/acestep/torchinductor'),
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
    })
    return env


def select_attempts() -> list[tuple[str, bool, bool]]:
    vllm = can_import('vllm')
    flash = can_import('flash_attn')
    print(f'VLLM_IMPORT={"READY" if vllm else "UNAVAILABLE"}', flush=True)
    print(f'FLASH_ATTN_IMPORT={"READY" if flash else "UNAVAILABLE"}', flush=True)
    attempts: list[tuple[str, bool, bool]] = []
    if vllm:
        attempts.append(('vllm', True, flash))
        attempts.append(('vllm', False, flash))
        if flash:
            attempts.append(('vllm', False, False))
    attempts.append(('pt', True, flash))
    if flash:
        attempts.append(('pt', True, False))
    attempts.append(('pt', False, False))
    out: list[tuple[str, bool, bool]] = []
    for row in attempts:
        if row not in out:
            out.append(row)
    return out


def start_best_runtime(m):
    banner('2/7 - RTX 6000 PRO MAX SPEED STARTUP WITH SAFE FALLBACK')
    original_safe_env = m.safe_env
    last_error = ''
    for backend, compile_model, flash_attention in select_attempts():
        api_proc = None
        env = speed_env(original_safe_env, backend, compile_model, flash_attention)
        m.safe_env = lambda env=env: env.copy()
        print(
            f'ATTEMPT backend={backend} compile={str(compile_model).lower()} '
            f'flash={str(flash_attention).lower()}',
            flush=True,
        )
        try:
            m.kill_stale_runtime()
            api_proc = m.start_api()
            health = m.init_models()
            data = m.health_data(health)
            print(f'API_SELECTED_BACKEND={backend}', flush=True)
            print(f'TORCH_COMPILE={str(compile_model).lower()}', flush=True)
            print(f'FLASH_ATTENTION={str(flash_attention).lower()}', flush=True)
            print(f'HEALTH_LM_BACKEND={data.get("sonara_lm_backend", backend)}', flush=True)
            return api_proc, backend, compile_model, flash_attention, health, original_safe_env
        except Exception as exc:
            last_error = f'{type(exc).__name__}: {exc}'
            print('ATTEMPT_FAILED=' + last_error, flush=True)
            if api_proc is not None:
                m.stop_proc(api_proc)
            try:
                print(m.tail(m.API_LOG, 9000), flush=True)
            except Exception:
                pass
            time.sleep(4)
    m.safe_env = original_safe_env
    raise RuntimeError('Nessun profilo speed stabile. Ultimo errore: ' + last_error)


def write_speed_state(m, public_url: str, backend: str, compile_model: bool, flash_attention: bool, health: dict, asr: dict) -> None:
    payload = {
        'ok': True,
        'profile': 'SONARA REAL MUSIC V3 SPEED SUPERVISOR',
        'public_url': public_url,
        'model': m.TURBO,
        'refinement_model': m.BASE,
        'lm_model': m.LM,
        'lm_backend': backend,
        'torch_compile': compile_model,
        'flash_attention': flash_attention,
        'fast_inference_steps': 4,
        'quality_inference_steps': 6,
        'ultra_inference_steps': 8,
        'cpu_offload': False,
        'health': health,
        'vocal_asr': asr,
        'updated_at_epoch': int(time.time()),
    }
    SPEED_STATE.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def main() -> None:
    banner('SONARA REAL MUSIC V3 - RTX 6000 PRO SPEED SUPERVISOR')
    m = load_supervisor()
    m.verify_existing_install()
    patch_fast4()

    api_proc = None
    tunnel_proc = None
    public_url = ''
    original_safe_env = m.safe_env
    try:
        api_proc, backend, compile_model, flash_attention, health, original_safe_env = start_best_runtime(m)

        banner('3/7 - VERIFY VOCAL ASR V3')
        asr = m.verify_asr()

        banner('4/7 - START PUBLIC TUNNEL')
        tunnel_proc, public_url = m.start_verified_tunnel()
        write_speed_state(m, public_url, backend, compile_model, flash_attention, health, asr)

        banner('5/7 - SPEED PROFILE READY')
        print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
        print(f'MODEL={m.TURBO}', flush=True)
        print(f'REFINEMENT_MODEL={m.BASE}', flush=True)
        print(f'LM_MODEL={m.LM}', flush=True)
        print(f'LM_BACKEND={backend}', flush=True)
        print(f'TORCH_COMPILE={str(compile_model).lower()}', flush=True)
        print(f'FLASH_ATTENTION={str(flash_attention).lower()}', flush=True)
        print('FAST=4_STEPS+2_CANDIDATES_ONE_GPU_BATCH+NO_REPAIR', flush=True)
        print('QUALITY=6_STEPS+LM4B+EULER', flush=True)
        print('ULTRA=8_STEPS+LM4B+HEUN+XL_BASE', flush=True)
        print(f'READY_FILE={SPEED_STATE}', flush=True)
        print('QUESTA E LA SOLA CELLA DA LASCIARE ATTIVA.', flush=True)

        banner('6/7 - API + PUBLIC TUNNEL WATCHDOG')
        while True:
            if api_proc.poll() is not None:
                raise RuntimeError('ACE-Step speed API si e fermata:\n' + m.tail(m.API_LOG, 14000))
            if tunnel_proc.poll() is not None:
                raise RuntimeError('Quick Tunnel speed si e fermato.')
            local = m.request_json(f'http://127.0.0.1:{m.PORT}/health', 10)
            public = m.request_json(public_url + '/health', 15)
            local_ok = m.api_ready(local)
            public_ok = m.api_ready(public)
            print(
                f'[{time.strftime("%H:%M:%S")}] SPEED V3 | '
                f'API={"UP" if local_ok else "DOWN"} | '
                f'PUBLIC={"UP" if public_ok else "DOWN"} | '
                f'FAST=4 | LM={backend.upper()} | '
                f'COMPILE={"ON" if compile_model else "OFF"} | '
                f'FLASH={"ON" if flash_attention else "OFF"} | {public_url}',
                flush=True,
            )
            if not local_ok or not public_ok:
                raise RuntimeError('Health speed supervisor non valido; fermo la cella per evitare routing lento/corrotto.')
            time.sleep(45)
    finally:
        try:
            m.safe_env = original_safe_env
        except Exception:
            pass
        if tunnel_proc is not None:
            m.stop_proc(tunnel_proc)
        if api_proc is not None:
            m.stop_proc(api_proc)


if __name__ == '__main__':
    main()
