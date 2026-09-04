#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PYTHON = ROOT / '.venv/bin/python'
PORT = 8001
TURBO = 'acestep-v15-xl-turbo'
BASE = 'acestep-v15-xl-base'
LM = 'acestep-5Hz-lm-4B'
READY = ROOT / 'SONARA_REAL_MUSIC_V3_READY.json'


def banner(text: str) -> None:
    print('\n' + '=' * 96, flush=True)
    print(text, flush=True)
    print('=' * 96, flush=True)


def run(cmd: list[str], timeout: int | None = None) -> None:
    print('$ ' + ' '.join(cmd), flush=True)
    proc = subprocess.run(cmd, cwd=str(ROOT), timeout=timeout, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f'Command failed ({proc.returncode}): {" ".join(cmd)}')


def request_json(path: str, timeout: int = 15) -> dict:
    req = urllib.request.Request(
        f'http://127.0.0.1:{PORT}{path}',
        headers={'Accept': 'application/json', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache'},
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode('utf-8', errors='replace')
    return json.loads(raw) if raw else {}


def ensure_runtime() -> None:
    if not ROOT.exists() or not PYTHON.exists():
        raise RuntimeError('SONARA ACE-Step runtime missing. Run the fresh MoLab install first.')
    if not (ROOT / 'checkpoints' / TURBO).exists():
        raise RuntimeError(f'{TURBO} is not installed in {ROOT / "checkpoints"}.')


def ensure_lm4b() -> None:
    banner('1/6 - VERIFY / INSTALL LM 4B')
    code = f'''
from pathlib import Path
from acestep.model_downloader import ensure_lm_model, check_model_exists
root = Path({str(ROOT / 'checkpoints')!r})
name = {LM!r}
if not check_model_exists(name, root):
    ok, msg = ensure_lm_model(name, checkpoints_dir=root, prefer_source='huggingface')
    print(msg, flush=True)
    if not ok:
        raise SystemExit(2)
assert check_model_exists(name, root), f'{{name}} verification failed after download'
print('LM4B=READY', flush=True)
'''
    run([str(PYTHON), '-c', code], timeout=21600)


def ensure_base() -> None:
    banner('2/6 - VERIFY / INSTALL XL-BASE REFINEMENT MODEL')
    code = f'''
from pathlib import Path
from acestep.model_downloader import ensure_dit_model, check_model_exists
root = Path({str(ROOT / 'checkpoints')!r})
name = {BASE!r}
if not check_model_exists(name, root):
    print(f'{{name}} missing: starting official ACE-Step model download...', flush=True)
    ok, msg = ensure_dit_model(name, checkpoints_dir=root, prefer_source='huggingface')
    print(msg, flush=True)
    if not ok:
        raise SystemExit(2)
assert check_model_exists(name, root), f'{{name}} verification failed after download'
print('XL_BASE=READY', flush=True)
'''
    run([str(PYTHON), '-c', code], timeout=21600)


def verify_gpu() -> dict:
    banner('3/6 - VERIFY RTX / BF16 / MEMORY')
    code = r'''
import json, torch
assert torch.cuda.is_available(), 'CUDA unavailable'
p = torch.cuda.get_device_properties(0)
print(json.dumps({
  'gpu': torch.cuda.get_device_name(0),
  'vram_gb': round(p.total_memory / 1024**3, 2),
  'bf16': bool(torch.cuda.is_bf16_supported()),
  'cuda': str(torch.version.cuda),
}))
'''
    out = subprocess.check_output([str(PYTHON), '-c', code], cwd=str(ROOT), text=True)
    data = json.loads(out.strip().splitlines()[-1])
    print(json.dumps(data, indent=2), flush=True)
    return data


def probe_models() -> dict:
    banner('4/6 - PROBE TURBO / BASE / LM / ASR')
    code = f'''
import json
from pathlib import Path
from acestep.model_downloader import check_model_exists
root = Path({str(ROOT / 'checkpoints')!r})
print(json.dumps({{
    'turbo_local': bool(check_model_exists({TURBO!r}, root)),
    'base_local': bool(check_model_exists({BASE!r}, root)),
    'lm4b_local': bool(check_model_exists({LM!r}, root)),
}}))
'''
    out = subprocess.check_output([str(PYTHON), '-c', code], cwd=str(ROOT), text=True)
    verified = json.loads(out.strip().splitlines()[-1])
    asr_import = subprocess.run(
        [str(PYTHON), '-c', 'import faster_whisper; print("ASR=READY")'],
        cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False,
    ).returncode == 0
    catalog = {}
    try:
        catalog = request_json('/v1/models', 15)
    except Exception as exc:
        print(f'MODEL_CATALOG=UNAVAILABLE ({exc})', flush=True)
    text = json.dumps(catalog, ensure_ascii=False)
    result = {
        'turbo_local': verified['turbo_local'],
        'turbo_catalog': TURBO in text,
        'base_local': verified['base_local'],
        'base_catalog': BASE in text,
        'lm4b_local': verified['lm4b_local'],
        'asr_ready': asr_import,
    }
    if not result['turbo_local']:
        raise RuntimeError(f'{TURBO} failed official model verification.')
    if not result['base_local']:
        raise RuntimeError(f'{BASE} failed official model verification.')
    if not result['lm4b_local']:
        raise RuntimeError(f'{LM} failed official model verification.')
    print(json.dumps(result, indent=2), flush=True)
    return result


def verify_health() -> dict:
    banner('5/6 - VERIFY REAL MUSIC V2/V3 RUNTIME FOUNDATION')
    deadline = time.time() + 120
    last = {}
    while time.time() < deadline:
        try:
            raw = request_json('/health', 15)
            data = raw.get('data') or raw
            last = data
            if data.get('models_initialized') is True and data.get('llm_initialized') is True:
                print(json.dumps(data, indent=2, ensure_ascii=False), flush=True)
                return data
        except Exception:
            pass
        time.sleep(3)
    raise RuntimeError(f'ACE-Step health not ready: {last!r}')


def write_ready(gpu: dict, models: dict, health: dict) -> None:
    banner('6/6 - WRITE REAL MUSIC V3 CAPABILITY FILE')
    base_available = bool(models['base_local'])
    payload = {
        'ok': True,
        'profile': 'SONARA REAL MUSIC V3',
        'turbo_model': TURBO,
        'turbo_model_verified': bool(models['turbo_local']),
        'refinement_model': BASE,
        'refinement_model_available': base_available,
        'refinement_model_verified': base_available,
        'lm_model': LM,
        'lm_model_verified': bool(models['lm4b_local']),
        'lm_initialized': health.get('llm_initialized') is True,
        'models_initialized': health.get('models_initialized') is True,
        'gpu': gpu,
        'asr_ready': models['asr_ready'],
        'quality_profile': {
            'generation': 'XL-Turbo',
            'inference_steps': 8,
            'internal_candidates': 4,
            'automatic_ranking': True,
            'automatic_repair': True,
        },
        'ultra_profile': {
            'generation': 'XL-Turbo',
            'inference_steps': 8,
            'internal_candidates': 4,
            'automatic_ranking': True,
            'automatic_repair': True,
            'refinement': 'XL-Base',
            'base_refinement_eligible': base_available,
        },
        'contracts': ['track-genome', 'humanizer', 'stable-voice', 'lyrics-asr', 'stems-ready', 'quality-gate'],
    }
    READY.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
    print(json.dumps(payload, indent=2, ensure_ascii=False), flush=True)
    print(f'READY_FILE={READY}', flush=True)
    if not base_available:
        raise RuntimeError('XL-Base refinement is not verified; Ultra profile cannot be enabled.')
    print('SONARA_REAL_MUSIC_V3_ULTRA=READY', flush=True)


def main() -> None:
    ensure_runtime()
    ensure_lm4b()
    ensure_base()
    gpu = verify_gpu()
    models = probe_models()
    health = verify_health()
    write_ready(gpu, models, health)


if __name__ == '__main__':
    main()
