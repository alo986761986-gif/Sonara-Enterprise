#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import signal
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PYTHON = ROOT / '.venv/bin/python'
MODEL = 'acestep-v15-xl-turbo'
LM_MODEL = 'acestep-5Hz-lm-4B'
PORT = 8001
LOG = Path('/tmp/sonara-ace-step-real-music-api.log')
MARKER = 'sonara-realism-api-v1'

MODELS = ROOT / 'acestep/api/http/release_task_models.py'
SETUP = ROOT / 'acestep/api/job_generation_setup.py'
HEALTH = ROOT / 'acestep/api/http/model_service_routes.py'


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY_PATCHED', flush=True)
        return text
    if old not in text:
        raise RuntimeError(f'Pattern non trovato per {label}; ACE-Step commit inatteso o file gia modificato in modo incompatibile.')
    print(f'{label}=PATCHED', flush=True)
    return text.replace(old, new, 1)


def patch_file(path: Path, transforms) -> None:
    original = path.read_text(encoding='utf-8')
    text = original
    for old, new, label in transforms:
        text = replace_once(text, old, new, label)
    if text != original:
        backup = path.with_suffix(path.suffix + '.sonara-real-music.bak')
        if not backup.exists():
            backup.write_text(original, encoding='utf-8')
        path.write_text(text, encoding='utf-8')
        print(f'UPDATED={path}', flush=True)


def patch_api() -> None:
    print('\n=== 1/4 PATCH API REQUEST MODEL ===', flush=True)
    patch_file(MODELS, [
        (
            '    infer_method: str = "ode"  # "ode" or "sde" - diffusion inference method\n',
            '    infer_method: str = "ode"  # "ode" or "sde" - diffusion inference method\n'
            '    sampler_mode: Literal["euler", "heun"] = Field(\n'
            '        default="euler",\n'
            '        description="Diffusion sampler: euler=fast, heun=second-order cleaner turbo inference.",\n'
            '    )\n',
            'REQUEST_SAMPLER_MODE'
        ),
        (
            '    use_cot_caption: bool = True\n    use_cot_language: bool = True\n',
            '    use_cot_metas: bool = True\n    use_cot_caption: bool = True\n    use_cot_language: bool = True\n',
            'REQUEST_COT_METAS'
        ),
    ])

    print('\n=== 2/4 PATCH GENERATION SETUP ===', flush=True)
    patch_file(SETUP, [
        (
            '        infer_method=req.infer_method,\n        timesteps=parsed_timesteps,\n',
            '        infer_method=req.infer_method,\n        sampler_mode=req.sampler_mode,\n        timesteps=parsed_timesteps,\n',
            'SETUP_SAMPLER_MODE'
        ),
        (
            '        use_cot_metas=not sample_mode,\n        use_cot_caption=use_cot_caption,\n',
            '        use_cot_metas=req.use_cot_metas if not sample_mode else False,\n        use_cot_caption=use_cot_caption,\n',
            'SETUP_COT_METAS'
        ),
        (
            '        use_constrained_decoding=True,\n',
            '        use_constrained_decoding=req.constrained_decoding,\n',
            'SETUP_CONSTRAINED_DECODING'
        ),
    ])

    print('\n=== 3/4 PATCH HEALTH CAPABILITY MARKER ===', flush=True)
    patch_file(HEALTH, [
        (
            '                "loaded_lm_model": inventory["loaded_lm_model"],\n',
            '                "loaded_lm_model": inventory["loaded_lm_model"],\n'
            '                "sonara_realism_api_v1": True,\n'
            f'                "sonara_realism_api": "{MARKER}",\n',
            'HEALTH_REALISM_MARKER'
        ),
    ])


def verify_syntax() -> None:
    for path in (MODELS, SETUP, HEALTH):
        done = subprocess.run([str(PYTHON), '-m', 'py_compile', str(path)], cwd=str(ROOT), check=False)
        if done.returncode != 0:
            raise RuntimeError(f'Syntax check fallito: {path}')
    code = r'''
from acestep.api.http.release_task_models import GenerateMusicRequest
r = GenerateMusicRequest(
    prompt='test', thinking=True, use_cot_metas=False,
    sampler_mode='heun', dcw_enabled=True, constrained_decoding=True,
)
assert r.thinking is True
assert r.use_cot_metas is False
assert r.sampler_mode == 'heun'
assert r.dcw_enabled is True
print('REAL_MUSIC_REQUEST_SCHEMA=OK')
'''
    done = subprocess.run([str(PYTHON), '-c', code], cwd=str(ROOT), check=False)
    if done.returncode != 0:
        raise RuntimeError('Verifica schema Real Music fallita.')


def stop_api() -> None:
    try:
        rows = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
    except Exception:
        return
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        cmd = parts[1].lower()
        if 'acestep.api_server' in cmd and str(PORT) in cmd:
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
    time.sleep(2)


def api_env() -> dict:
    env = os.environ.copy()
    env.update({
        'ACESTEP_PROJECT_ROOT': str(ROOT),
        'ACESTEP_CHECKPOINTS_DIR': str(ROOT / 'checkpoints'),
        'ACESTEP_CONFIG_PATH': MODEL,
        'ACESTEP_DEVICE': 'cuda',
        'ACESTEP_INIT_LLM': 'true',
        'ACESTEP_LM_MODEL_PATH': LM_MODEL,
        'ACESTEP_LLM_BACKEND': 'pt',
        'ACESTEP_USE_FLASH_ATTENTION': 'true',
        'ACESTEP_OFFLOAD_TO_CPU': 'false',
        'ACESTEP_OFFLOAD_DIT_TO_CPU': 'false',
        'ACESTEP_LM_OFFLOAD_TO_CPU': 'false',
        'ACESTEP_NO_INIT': 'false',
        'ACESTEP_API_HOST': '0.0.0.0',
        'ACESTEP_API_PORT': str(PORT),
        'ACESTEP_API_WORKERS': '1',
        'ACESTEP_QUEUE_WORKERS': '1',
        'ACESTEP_QUEUE_MAXSIZE': '64',
        'ACESTEP_DOWNLOAD_SOURCE': 'huggingface',
        'TOKENIZERS_PARALLELISM': 'false',
        'MPLBACKEND': 'Agg',
        'PYTHONUNBUFFERED': '1',
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
    })
    env.pop('VIRTUAL_ENV', None)
    return env


def health() -> dict:
    req = urllib.request.Request(
        f'http://127.0.0.1:{PORT}/health',
        headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'},
    )
    with urllib.request.urlopen(req, timeout=15) as response:
        raw = response.read().decode('utf-8', errors='replace')
    return json.loads(raw) if raw else {}


def restart_and_verify() -> None:
    print('\n=== 4/4 RESTART REAL MUSIC API ===', flush=True)
    stop_api()
    stream = LOG.open('w', encoding='utf-8', buffering=1)
    proc = subprocess.Popen(
        [
            str(PYTHON), '-m', 'acestep.api_server',
            '--host', '0.0.0.0', '--port', str(PORT),
            '--download-source', 'huggingface',
            '--init-llm', '--lm-model-path', LM_MODEL,
        ],
        cwd=str(ROOT), env=api_env(), stdout=stream, stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    deadline = time.time() + 1800
    last = None
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = LOG.read_text(errors='replace')[-20000:] if LOG.exists() else ''
            raise RuntimeError(f'API terminata exit={proc.returncode}:\n{tail}')
        try:
            body = health()
            data = body.get('data') or body
            last = data
            if (
                data.get('models_initialized') is True
                and data.get('llm_initialized') is True
                and data.get('sonara_realism_api_v1') is True
                and MODEL in str(data.get('loaded_model') or '')
            ):
                print(json.dumps(data, indent=2, ensure_ascii=False), flush=True)
                print('\n✅ SONARA REAL MUSIC API V1 READY', flush=True)
                print('MODEL=' + MODEL, flush=True)
                print('LM_MODEL=' + LM_MODEL, flush=True)
                print('THINKING=SUPPORTED', flush=True)
                print('COT_METAS=CALLER_CONTROLLED', flush=True)
                print('SAMPLER_MODE=EULER|HEUN', flush=True)
                print('DCW=CALLER_CONTROLLED', flush=True)
                print('CONSTRAINED_DECODING=CALLER_CONTROLLED', flush=True)
                print('REALISM_API_MARKER=' + MARKER, flush=True)
                return
        except Exception:
            pass
        time.sleep(3)
    tail = LOG.read_text(errors='replace')[-20000:] if LOG.exists() else ''
    raise RuntimeError(f'Timeout Real Music API. Ultimo health={last!r}\n{tail}')


def main() -> None:
    if not ROOT.exists() or not PYTHON.exists():
        raise RuntimeError('ACE-Step CLEAN non trovato.')
    for path in (MODELS, SETUP, HEALTH):
        if not path.exists():
            raise RuntimeError(f'File ACE-Step mancante: {path}')
    patch_api()
    verify_syntax()
    restart_and_verify()


if __name__ == '__main__':
    main()
