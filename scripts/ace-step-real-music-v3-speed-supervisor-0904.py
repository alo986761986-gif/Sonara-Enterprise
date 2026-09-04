#!/usr/bin/env python3
from __future__ import annotations

import json
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
NANO_VLLM = ROOT / 'acestep/third_parts/nano-vllm'
SPEED_STATE = ROOT / 'SONARA_REAL_MUSIC_V3_SPEED_SUPERVISOR_READY.json'
MARKER = 'SONARA_SPEED_MAX_V2_QUALITY4'


def banner(text: str) -> None:
    print('\n' + '=' * 104, flush=True)
    print(text, flush=True)
    print('=' * 104, flush=True)


def load_supervisor() -> SimpleNamespace:
    code = urllib.request.urlopen(BASE_SUPERVISOR_URL, timeout=120).read().decode('utf-8')
    scope = {'__name__': 'sonara_v3_base_supervisor'}
    exec(compile(code, '<sonara-v3-base-supervisor>', 'exec'), scope)
    m = SimpleNamespace(**scope)
    # Critical: functions created by exec keep `scope` as __globals__.
    # Later speed overrides MUST patch this dict, not only the namespace attribute.
    m._scope = scope
    return m


def can_import(module: str) -> bool:
    done = subprocess.run(
        [str(PYTHON), '-c', f'import {module}; print("OK")'],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return done.returncode == 0


def ensure_nanovllm() -> bool:
    if can_import('nanovllm'):
        print('NANO_VLLM_IMPORT=READY', flush=True)
        return True
    if not NANO_VLLM.exists():
        print(f'NANO_VLLM_IMPORT=UNAVAILABLE path_missing={NANO_VLLM}', flush=True)
        return False
    print('NANO_VLLM_INSTALL=START', flush=True)
    done = subprocess.run(
        [str(PYTHON), '-m', 'pip', 'install', '--no-deps', '-e', str(NANO_VLLM)],
        cwd=str(ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
        timeout=600,
    )
    if done.returncode != 0:
        print('NANO_VLLM_INSTALL=FAILED', flush=True)
        print((done.stdout or '')[-8000:], flush=True)
        return False
    ready = can_import('nanovllm')
    print(f'NANO_VLLM_IMPORT={"READY" if ready else "UNAVAILABLE"}', flush=True)
    return ready


def patch_fast4_quality4() -> None:
    banner('1/7 - PATCH FAST + QUALITY: 4 STEPS XL-TURBO')
    if not SETUP.exists():
        raise RuntimeError(f'File ACE-Step non trovato: {SETUP}')
    text = SETUP.read_text(encoding='utf-8')
    new_block = (
        '        # SONARA_SPEED_MAX_V2_QUALITY4\n'
        '        inference_steps=(\n'
        '            4 if getattr(req, "sonara_generation_profile", "auto") in {"fast", "quality"}\n'
        '            else req.inference_steps\n'
        '        ),\n'
    )
    if MARKER in text:
        print('QUALITY4_PATCH=ALREADY_ACTIVE', flush=True)
    else:
        old_block = (
            '        # SONARA_SPEED_MAX_V1_FAST4\n'
            '        inference_steps=(\n'
            '            4 if getattr(req, "sonara_generation_profile", "auto") == "fast"\n'
            '            else 6 if getattr(req, "sonara_generation_profile", "auto") == "quality"\n'
            '            else req.inference_steps\n'
            '        ),\n'
        )
        old = '        inference_steps=req.inference_steps,\n'
        backup = SETUP.with_suffix(SETUP.suffix + '.before-speed-max-v2')
        if not backup.exists():
            backup.write_text(text, encoding='utf-8')
        if old_block in text:
            SETUP.write_text(text.replace(old_block, new_block, 1), encoding='utf-8')
            print('QUALITY4_PATCH=UPGRADED_FROM_V1', flush=True)
        elif old in text:
            SETUP.write_text(text.replace(old, new_block, 1), encoding='utf-8')
            print('QUALITY4_PATCH=APPLIED', flush=True)
        else:
            raise RuntimeError('Pattern inference_steps non trovato; non applico una patch cieca.')
    done = subprocess.run(
        [str(PYTHON), '-m', 'py_compile', str(SETUP)],
        cwd=str(ROOT), text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False,
    )
    if done.returncode != 0:
        raise RuntimeError('Syntax check fallito:\n' + (done.stdout or ''))
    print('FAST_INFERENCE_STEPS=4', flush=True)
    print('QUALITY_INFERENCE_STEPS=4', flush=True)
    print('ULTRA_INFERENCE_STEPS=8', flush=True)


def speed_env(base_env_fn, backend: str, compile_model: bool, flash_attention: bool) -> dict:
    env = base_env_fn()
    enabled = 'true' if compile_model else 'false'
    flash = 'true' if flash_attention else 'false'
    env.update({
        # /v1/init in ACE-Step 1.5 reads ACESTEP_LM_BACKEND.
        'ACESTEP_LM_BACKEND': backend,
        # Some launch paths / containers use ACESTEP_LLM_BACKEND. Set both.
        'ACESTEP_LLM_BACKEND': backend,
        'ACESTEP_COMPILE_MODEL': enabled,
        'ACESTEP_USE_FLASH_ATTENTION': flash,
        'ACESTEP_OFFLOAD_TO_CPU': 'false',
        'ACESTEP_OFFLOAD_DIT_TO_CPU': 'false',
        'ACESTEP_LM_OFFLOAD_TO_CPU': 'false',
        'CUDA_MODULE_LOADING': 'LAZY',
        'TORCH_ALLOW_TF32_CUBLAS_OVERRIDE': '1',
        'NVIDIA_TF32_OVERRIDE': '1',
        'TRITON_CACHE_DIR': str(ROOT / '.cache/acestep/triton'),
        'TORCHINDUCTOR_CACHE_DIR': str(ROOT / '.cache/acestep/torchinductor'),
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
    })
    return env


def bind_runtime_env(m, env: dict):
    """Bind env override into the REAL globals used by exec-created supervisor functions."""
    scope = m.start_api.__globals__
    original = scope.get('safe_env')
    override = lambda env=env: env.copy()
    scope['safe_env'] = override
    m.safe_env = override
    return original


def restore_runtime_env(m, original_safe_env) -> None:
    if original_safe_env is None:
        return
    m.start_api.__globals__['safe_env'] = original_safe_env
    m.safe_env = original_safe_env


def select_attempts() -> list[tuple[str, bool, bool]]:
    nano_vllm = ensure_nanovllm()
    triton = can_import('triton')
    flash = can_import('flash_attn')
    print(f'TRITON_IMPORT={"READY" if triton else "UNAVAILABLE"}', flush=True)
    print(f'FLASH_ATTN_IMPORT={"READY" if flash else "UNAVAILABLE"}', flush=True)
    attempts: list[tuple[str, bool, bool]] = []
    if nano_vllm:
        attempts.append(('vllm', True, flash))
        attempts.append(('vllm', False, flash))
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
    banner('2/7 - RTX 6000 PRO MAX SPEED STARTUP - REAL ENV OVERRIDE')
    base_safe_env = m.start_api.__globals__.get('safe_env')
    if not callable(base_safe_env):
        raise RuntimeError('safe_env globale del supervisor non trovato.')
    last_error = ''
    for backend, compile_model, flash_attention in select_attempts():
        api_proc = None
        env = speed_env(base_safe_env, backend, compile_model, flash_attention)
        bind_runtime_env(m, env)
        print(
            f'ATTEMPT backend={backend} compile={str(compile_model).lower()} '
            f'flash={str(flash_attention).lower()}', flush=True,
        )
        try:
            m.kill_stale_runtime()
            api_proc = m.start_api()
            health = m.init_models()
            data = m.health_data(health)
            actual_backend = str(data.get('sonara_lm_backend') or '').strip().lower()
            actual_compile = data.get('sonara_compile_model') is True
            print(f'API_REQUESTED_BACKEND={backend}', flush=True)
            print(f'API_SELECTED_BACKEND={actual_backend or "unknown"}', flush=True)
            print(f'COMPILE_REQUESTED={str(compile_model).lower()}', flush=True)
            print(f'COMPILE_ACTUAL={str(actual_compile).lower()}', flush=True)
            print(f'FLASH_ATTENTION_REQUESTED={str(flash_attention).lower()}', flush=True)
            if actual_backend != backend:
                raise RuntimeError(f'Backend richiesto={backend}, attivo={actual_backend or "unknown"}.')
            if compile_model and not actual_compile:
                raise RuntimeError('torch.compile richiesto ma health riporta sonara_compile_model=false.')
            return api_proc, backend, actual_compile, flash_attention, health, base_safe_env
        except Exception as exc:
            last_error = f'{type(exc).__name__}: {exc}'
            print('ATTEMPT_FAILED=' + last_error, flush=True)
            if api_proc is not None:
                m.stop_proc(api_proc)
            try:
                print(m.tail(m.API_LOG, 9000), flush=True)
            except Exception:
                pass
            restore_runtime_env(m, base_safe_env)
            time.sleep(3)
    restore_runtime_env(m, base_safe_env)
    raise RuntimeError('Nessun profilo speed stabile. Ultimo errore: ' + last_error)


def write_speed_state(m, public_url: str, backend: str, compile_model: bool, flash_attention: bool, health: dict, asr: dict) -> None:
    payload = {
        'ok': True,
        'profile': 'SONARA REAL MUSIC V3 SPEED SUPERVISOR V9',
        'public_url': public_url,
        'model': m.TURBO,
        'refinement_model': m.BASE,
        'lm_model': m.LM,
        'lm_backend': backend,
        'torch_compile': compile_model,
        'flash_attention': flash_attention,
        'fast_inference_steps': 4,
        'quality_inference_steps': 4,
        'ultra_inference_steps': 8,
        'quality_batch_mode': 'two-candidates-one-gpu-batch',
        'cpu_offload': False,
        'health': health,
        'vocal_asr': asr,
        'updated_at_epoch': int(time.time()),
    }
    SPEED_STATE.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def main() -> None:
    banner('SONARA REAL MUSIC V3 - RTX 6000 PRO SPEED SUPERVISOR V9')
    m = load_supervisor()
    m.verify_existing_install()
    patch_fast4_quality4()
    api_proc = None
    tunnel_proc = None
    public_url = ''
    original_safe_env = m.start_api.__globals__.get('safe_env')
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
        print('FAST=4_STEPS+2_CANDIDATES_ONE_GPU_BATCH', flush=True)
        print('QUALITY=4_STEPS+LM4B+EULER+REAL_MUSIC+2_CANDIDATES_ONE_GPU_BATCH', flush=True)
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
            local_data = m.health_data(local)
            live_backend = str(local_data.get('sonara_lm_backend') or '').upper()
            live_compile = local_data.get('sonara_compile_model') is True
            print(
                f'[{time.strftime("%H:%M:%S")}] SPEED V9 | '
                f'API={"UP" if local_ok else "DOWN"} | PUBLIC={"UP" if public_ok else "DOWN"} | '
                f'FAST=4 | QUALITY=4+BATCH2 | LM={live_backend or "UNKNOWN"} | '
                f'COMPILE={"ON" if live_compile else "OFF"} | '
                f'FLASH={"ON" if flash_attention else "OFF"} | {public_url}', flush=True,
            )
            if not local_ok or not public_ok:
                raise RuntimeError('Health speed supervisor non valido; fermo la cella per evitare routing lento/corrotto.')
            if backend == 'vllm' and live_backend != 'VLLM':
                raise RuntimeError('Il backend LM e ricaduto fuori da vLLM; fermo il runtime lento.')
            if compile_model and not live_compile:
                raise RuntimeError('torch.compile e caduto OFF; fermo il runtime lento.')
            time.sleep(45)
    finally:
        restore_runtime_env(m, original_safe_env)
        if tunnel_proc is not None:
            m.stop_proc(tunnel_proc)
        if api_proc is not None:
            m.stop_proc(api_proc)


if __name__ == '__main__':
    main()
