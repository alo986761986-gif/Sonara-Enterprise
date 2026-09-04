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
MODELS = ROOT / 'acestep/api/http/release_task_models.py'
SETUP = ROOT / 'acestep/api/job_generation_setup.py'
HEALTH = ROOT / 'acestep/api/http/model_service_routes.py'
WORK = Path('/tmp/sonara-quality-v10-full-fresh-bootstrap-v5-0904')

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
TOKENIZERS_FIX_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/scripts/'
    'ace-step-tokenizers-0222-repair-and-v3-recovery-0904.py'
)
SPEED_V9_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/scripts/'
    'ace-step-real-music-v3-speed-supervisor-0904.py'
)


def banner(text: str) -> None:
    print('\n' + '=' * 112, flush=True)
    print(text, flush=True)
    print('=' * 112, flush=True)


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'SONARA-QUALITY-V10-Bootstrap-V5/1.0'})
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


def runtime_base_ready() -> bool:
    return ROOT.exists() and PYTHON.exists() and TURBO.exists()


def runtime_complete() -> bool:
    return runtime_base_ready() and BASE.exists() and LM4B.exists()


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8') if path.exists() else ''


def v1_semantically_ready() -> bool:
    models = read(MODELS)
    setup = read(SETUP)
    health = read(HEALTH)
    sampler_ready = (
        'sampler_mode=req.sampler_mode,' in setup
        or 'req.sonara_generation_profile == "ultra"' in setup
    )
    checks = {
        'request_sampler': 'sampler_mode: Literal["euler", "heun"]' in models,
        'request_cot_metas': 'use_cot_metas: bool = True' in models,
        'setup_sampler': sampler_ready,
        'setup_cot_metas': 'use_cot_metas=req.use_cot_metas if not sample_mode else False,' in setup,
        'setup_constrained': 'use_constrained_decoding=req.constrained_decoding,' in setup,
        'health_realism': ('sonara_realism_api_v1' in health or 'sonara-realism-api-v1' in health),
    }
    print('V1_SEMANTIC_CHECK=' + ','.join(f'{k}:{"OK" if v else "MISS"}' for k, v in checks.items()), flush=True)
    return all(checks.values())


def verify_final_stack() -> None:
    banner('7/9 - FINAL PYTHON/CUDA/HF/ASR COMPATIBILITY PROBE')
    probe = subprocess.run(
        [str(PYTHON), '-c', (
            'import torch; '
            'assert torch.cuda.is_available(); '
            'import tokenizers; '
            'print("TOKENIZERS=" + tokenizers.__version__); '
            'assert tokenizers.__version__ == "0.22.2", tokenizers.__version__; '
            'import transformers, huggingface_hub; '
            'from transformers import AutoTokenizer, AutoModelForCausalLM; '
            'import faster_whisper, ctranslate2; '
            'print("CUDA=True"); '
            'print("GPU=" + torch.cuda.get_device_name(0)); '
            'print("VRAM_GB=" + str(round(torch.cuda.get_device_properties(0).total_memory/1024**3, 2))); '
            'print("TRANSFORMERS=" + transformers.__version__); '
            'print("HF_HUB=" + huggingface_hub.__version__); '
            'print("FASTER_WHISPER=READY"); '
            'print("CT2_CUDA_DEVICES=" + str(ctranslate2.get_cuda_device_count())); '
            'print("FINAL_STACK=READY")'
        )],
        cwd=str(ROOT), text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False,
    )
    print(probe.stdout or '', flush=True)
    if probe.returncode != 0:
        raise RuntimeError('Verifica finale Python/CUDA/HF/ASR fallita:\n' + (probe.stdout or ''))


def run_bootstrap() -> None:
    banner('SONARA QUALITY V10 - CACHE-PROOF FULL BOOTSTRAP V5')
    print('BOOTSTRAP_VERSION=V5_0904', flush=True)
    print(f'ROOT={ROOT}', flush=True)
    print(f'RUNTIME_BASE_READY={runtime_base_ready()}', flush=True)
    print(f'RUNTIME_COMPLETE_BEFORE={runtime_complete()}', flush=True)

    full = load_remote_module('sonara_full_v3_installer', FULL_INSTALLER_URL)
    full.stop_existing_runtime()
    fresh = full.load_module('fresh', full.DEPENDENCIES['fresh'])
    v2 = full.load_module('v2', full.DEPENDENCIES['v2'])
    asr_mod = full.load_module('asr', full.DEPENDENCIES['asr'])
    v3 = full.load_module('v3', full.DEPENDENCIES['v3'])

    if not runtime_base_ready():
        banner('1/9 - FRESH ACE-STEP + CUDA + XL-TURBO')
        fresh.TOOLS.mkdir(parents=True, exist_ok=True)
        fresh.WORK.mkdir(parents=True, exist_ok=True)
        fresh.check_disk()
        uv = fresh.ensure_uv()
        fresh.prepare_repo()
        env = fresh.install_environment(uv)
        fresh.verify_gpu(env)
        fresh.download_models(env)
    else:
        banner('1/9 - RUNTIME BASE GIA PRESENTE')
        print('FRESH_BASE_INSTALL=SKIPPED', flush=True)

    banner('2/9 - REAL MUSIC V1 CONTRACT - SEMANTIC SAFE MODE')
    if v1_semantically_ready():
        print('REAL_MUSIC_V1=ALREADY_READY_SKIP_LEGACY_PATCHER', flush=True)
    else:
        print('REAL_MUSIC_V1=NEEDS_PATCH', flush=True)
        fresh.patch_real_music_api()
        if not v1_semantically_ready():
            raise RuntimeError('Real Music V1 non risulta semanticamente completo dopo la patch.')

    banner('3/9 - REAL MUSIC V2 SPEED/QUALITY')
    v2.require_runtime()
    v2.patch_http_contract()
    v2.patch_generation_runtime()
    v2.patch_health_marker()
    v2.verify_code()
    print('REAL_MUSIC_V2=READY', flush=True)

    banner('4/9 - VOCAL ASR V3 RESILIENT CUDA INSTALL')
    asr_fix = load_remote_module('sonara_asr_install_fix', ASR_FIX_URL)
    asr_fix.install_packages()
    asr_fix.export_cuda_library_path()
    if not asr_fix.import_ok():
        raise RuntimeError('faster-whisper/ctranslate2 non importabili dopo repair ASR.')
    asr_mod.patch_api()
    asr_mod.verify_syntax()
    print('VOCAL_ASR_V3=READY', flush=True)

    banner('5/9 - TOKENIZERS / TRANSFORMERS COMPATIBILITY REPAIR')
    tokenizers_fix = load_remote_module('sonara_tokenizers_0222_fix', TOKENIZERS_FIX_URL)
    tokenizers_fix.repair()
    if not tokenizers_fix.verify_stack('STACK_AFTER_V5_REPAIR'):
        raise RuntimeError('Stack Transformers/tokenizers ancora incompatibile dopo repair 0.22.2.')
    print('HF_STACK_COMPAT=READY', flush=True)

    banner('6/9 - LM4B + XL-BASE')
    v3.ensure_runtime()
    v3.ensure_lm4b()
    v3.ensure_base()
    gpu = v3.verify_gpu()
    models = v3.probe_models()
    print(f'GPU={gpu}', flush=True)
    print(f'MODELS={models}', flush=True)
    if not runtime_complete():
        raise RuntimeError('Runtime incompleto dopo LM4B/XL-Base bootstrap.')

    verify_final_stack()

    banner('8/9 - BOOTSTRAP V5 COMPLETE')
    print('BOOTSTRAP_V5=READY', flush=True)
    print('XL_TURBO=READY', flush=True)
    print('XL_BASE=READY', flush=True)
    print('LM4B=READY', flush=True)
    print('ASR_V3=READY', flush=True)
    print('TOKENIZERS=0.22.2', flush=True)
    print('TRANSFORMERS_STACK=READY', flush=True)


def launch_speed_v9() -> None:
    banner('9/9 - QUALITY V10 / SPEED SUPERVISOR V9')
    speed_path = WORK / 'ace-step-real-music-v3-speed-supervisor-0904.py'
    download(SPEED_V9_URL, speed_path)
    code = speed_path.read_text(encoding='utf-8')
    exec(
        compile(code, '<SONARA-QUALITY-V10-V5-SPEED-V9>', 'exec'),
        {'__name__': '__main__', '__file__': str(speed_path)},
    )


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    run_bootstrap()
    launch_speed_v9()


if __name__ == '__main__':
    main()
