#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PYTHON = ROOT / '.venv/bin/python'
TURBO = ROOT / 'checkpoints/acestep-v15-xl-turbo'
BASE = ROOT / 'checkpoints/acestep-v15-xl-base'
LM4B = ROOT / 'checkpoints/acestep-5Hz-lm-4B'
WORK = Path('/tmp/sonara-quality-v10-full-fresh-bootstrap-0904')

FULL_INSTALLER_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/scripts/'
    'ace-step-xl-turbo-real-music-v3-full-fresh-install-0904.py'
)
ASR_FIX_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/scripts/'
    'ace-step-vocal-asr-v3-install-fix-0902.py'
)
SPEED_V9_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/scripts/'
    'ace-step-real-music-v3-speed-supervisor-0904.py'
)


def banner(text: str) -> None:
    print('\n' + '=' * 108, flush=True)
    print(text, flush=True)
    print('=' * 108, flush=True)


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'SONARA-QUALITY-V10-Bootstrap/1.2'})
    with urllib.request.urlopen(req, timeout=180) as response:
        target.write_bytes(response.read())


def load_remote_module(alias: str, url: str):
    path = WORK / f'{alias}.py'
    download(url, path)
    spec = importlib.util.spec_from_file_location(alias, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f'Impossibile caricare {alias}')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def runtime_complete() -> bool:
    return all([
        ROOT.exists(),
        PYTHON.exists(),
        TURBO.exists(),
        BASE.exists(),
        LM4B.exists(),
    ])


def make_fresh_patcher_idempotent(fresh) -> None:
    """Allow the pinned V1 patcher to recognize semantics already rewritten by V2."""
    original_replace_once = fresh.replace_once
    semantic_markers = {
        'REQUEST_SAMPLER_MODE': 'sampler_mode: Literal["euler", "heun"]',
        'REQUEST_COT_METAS': 'use_cot_metas: bool = True',
        'SETUP_SAMPLER_MODE': 'req.sonara_generation_profile == "ultra"',
        'SETUP_COT_METAS': 'use_cot_metas=req.use_cot_metas if not sample_mode else False,',
        'SETUP_CONSTRAINED_DECODING': 'use_constrained_decoding=req.constrained_decoding,',
        'HEALTH_REALISM_MARKER': '"sonara_realism_api": "sonara-realism-api-v1"',
    }

    def compat_replace_once(text: str, old: str, new: str, label: str) -> str:
        if new in text:
            print(f'{label}=ALREADY_PATCHED', flush=True)
            return text
        marker = semantic_markers.get(label)
        if marker and marker in text:
            print(f'{label}=ALREADY_PATCHED_SEMANTIC', flush=True)
            return text
        return original_replace_once(text, old, new, label)

    fresh.replace_once = compat_replace_once
    print('V1_PATCHER_IDEMPOTENCE_GUARD=ON', flush=True)


def run_full_bootstrap() -> None:
    banner('SONARA QUALITY V10 - FRESH NOTEBOOK AUTO-BOOTSTRAP V3')
    print(f'ROOT={ROOT}', flush=True)
    print(f'RUNTIME_COMPLETE_BEFORE={runtime_complete()}', flush=True)

    full = load_remote_module('sonara_full_v3_installer', FULL_INSTALLER_URL)
    full.stop_existing_runtime()

    fresh = full.load_module('fresh', full.DEPENDENCIES['fresh'])
    v2 = full.load_module('v2', full.DEPENDENCIES['v2'])
    asr_mod = full.load_module('asr', full.DEPENDENCIES['asr'])
    v3 = full.load_module('v3', full.DEPENDENCIES['v3'])
    make_fresh_patcher_idempotent(fresh)

    if not ROOT.exists() or not PYTHON.exists() or not TURBO.exists():
        banner('1/8 - INSTALLAZIONE ACE-STEP 1.5 + PYTHON/CUDA + XL-TURBO')
        fresh.TOOLS.mkdir(parents=True, exist_ok=True)
        fresh.WORK.mkdir(parents=True, exist_ok=True)
        fresh.check_disk()
        uv = fresh.ensure_uv()
        fresh.prepare_repo()
        env = fresh.install_environment(uv)
        fresh.verify_gpu(env)
        fresh.download_models(env)
    else:
        banner('1/8 - RUNTIME BASE GIA PRESENTE')
        print('FRESH_BASE_INSTALL=SKIPPED', flush=True)

    banner('2/8 - REAL MUSIC V1 API CONTRACT')
    fresh.patch_real_music_api()

    banner('3/8 - REAL MUSIC V2 SPEED/QUALITY CONTRACT')
    v2.require_runtime()
    v2.patch_http_contract()
    v2.patch_generation_runtime()
    v2.patch_health_marker()
    v2.verify_code()

    banner('4/8 - VOCAL ASR V3 RESILIENT INSTALL')
    asr_fix = load_remote_module('sonara_asr_install_fix', ASR_FIX_URL)
    asr_fix.install_packages()
    asr_fix.export_cuda_library_path()
    if not asr_fix.import_ok():
        raise RuntimeError('faster-whisper/ctranslate2 non importabili dopo il repair ASR.')
    asr_mod.patch_api()
    asr_mod.verify_syntax()
    print('VOCAL_ASR_V3_INSTALL=READY', flush=True)

    banner('5/8 - LM4B + XL-BASE')
    v3.ensure_runtime()
    v3.ensure_lm4b()
    v3.ensure_base()
    gpu = v3.verify_gpu()
    models = v3.probe_models()
    print(f'GPU={gpu}', flush=True)
    print(f'MODELS={models}', flush=True)

    if not runtime_complete():
        raise RuntimeError(
            'Bootstrap incompleto: servono runtime, XL-Turbo, XL-Base e LM4B prima del supervisor V9.'
        )

    banner('6/8 - VERIFICA PYTHON/CUDA + ASR IMPORT')
    probe = subprocess.run(
        [str(PYTHON), '-c', (
            'import torch, faster_whisper, ctranslate2; '
            'assert torch.cuda.is_available(); '
            'print("CUDA=True"); '
            'print("GPU=" + torch.cuda.get_device_name(0)); '
            'print("VRAM_GB=" + str(round(torch.cuda.get_device_properties(0).total_memory/1024**3, 2))); '
            'print("FASTER_WHISPER=READY"); '
            'print("CT2_CUDA_DEVICES=" + str(ctranslate2.get_cuda_device_count()))'
        )],
        cwd=str(ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    print(probe.stdout or '', flush=True)
    if probe.returncode != 0:
        raise RuntimeError('Verifica CUDA/ASR fallita:\n' + (probe.stdout or ''))

    banner('7/8 - BOOTSTRAP COMPLETO')
    print('RUNTIME_COMPLETE_AFTER=true', flush=True)
    print('XL_TURBO=READY', flush=True)
    print('XL_BASE=READY', flush=True)
    print('LM4B=READY', flush=True)
    print('ASR_V3=READY', flush=True)


def launch_speed_v9() -> None:
    banner('8/8 - AVVIO QUALITY V10 / SPEED SUPERVISOR V9')
    speed_path = WORK / 'ace-step-real-music-v3-speed-supervisor-0904.py'
    download(SPEED_V9_URL, speed_path)
    code = speed_path.read_text(encoding='utf-8')
    scope = {'__name__': '__main__', '__file__': str(speed_path)}
    exec(compile(code, '<SONARA-QUALITY-V10-SPEED-V9>', 'exec'), scope)


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    run_full_bootstrap()
    launch_speed_v9()


if __name__ == '__main__':
    main()
