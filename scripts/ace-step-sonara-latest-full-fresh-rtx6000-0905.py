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
WORK = Path('/tmp/sonara-latest-full-fresh-rtx6000-0905')

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
HF_FIX_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/scripts/'
    'ace-step-hf-stack-repair-v3-recovery-0904.py'
)
SPEED_V9_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/scripts/'
    'ace-step-real-music-v3-speed-supervisor-0904.py'
)


def banner(text: str) -> None:
    print('\n' + '=' * 116, flush=True)
    print(text, flush=True)
    print('=' * 116, flush=True)


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'SONARA-LATEST-RTX6000-0905/1.0'})
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


def read(path: Path) -> str:
    return path.read_text(encoding='utf-8') if path.exists() else ''


def runtime_base_ready() -> bool:
    return ROOT.exists() and PYTHON.exists() and TURBO.exists()


def runtime_complete() -> bool:
    return runtime_base_ready() and BASE.exists() and LM4B.exists()


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


def final_probe() -> None:
    banner('8/10 - FINAL PYTHON / CUDA / HF / ASR PROBE')
    code = r'''
import traceback
ok = True
checks = [
    ('torch_cuda', 'import torch; assert torch.cuda.is_available(); print("CUDA=True"); print("GPU=" + torch.cuda.get_device_name(0)); print("VRAM_GB=" + str(round(torch.cuda.get_device_properties(0).total_memory/1024**3, 2)))'),
    ('tokenizers', 'import tokenizers; print("TOKENIZERS=" + tokenizers.__version__)'),
    ('huggingface_hub', 'import huggingface_hub; print("HUGGINGFACE_HUB=" + huggingface_hub.__version__)'),
    ('transformers', 'import transformers; print("TRANSFORMERS=" + transformers.__version__)'),
    ('transformers_auto', 'from transformers import AutoTokenizer, AutoModelForCausalLM; print("TRANSFORMERS_AUTO=OK")'),
    ('faster_whisper', 'import faster_whisper; print("FASTER_WHISPER=OK")'),
    ('ctranslate2', 'import ctranslate2; print("CTRANSLATE2=" + ctranslate2.__version__); print("CT2_CUDA_DEVICES=" + str(ctranslate2.get_cuda_device_count()))'),
]
for name, src in checks:
    try:
        exec(src, {})
        print('CHECK_' + name.upper() + '=OK', flush=True)
    except Exception:
        ok = False
        print('CHECK_' + name.upper() + '=FAIL', flush=True)
        traceback.print_exc()
raise SystemExit(0 if ok else 9)
'''
    result = subprocess.run(
        [str(PYTHON), '-c', code],
        cwd=str(ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    print(result.stdout or '', flush=True)
    if result.returncode != 0:
        raise RuntimeError('FINAL_PROBE fallito. Il traceback sopra identifica il componente residuo.')
    print('FINAL_STACK=READY', flush=True)


def run_install() -> None:
    banner('SONARA LATEST - RTX PRO 6000 - ACE-STEP XL-TURBO FULL FRESH 0905')
    print('BOOTSTRAP_VERSION=LATEST_RTX6000_0905', flush=True)
    print(f'ROOT={ROOT}', flush=True)
    print(f'RUNTIME_BASE_READY={runtime_base_ready()}', flush=True)
    print(f'RUNTIME_COMPLETE_BEFORE={runtime_complete()}', flush=True)

    full = load_remote_module('sonara_full_v3_installer', FULL_INSTALLER_URL)
    full.stop_existing_runtime()
    fresh = full.load_module('fresh', full.DEPENDENCIES['fresh'])
    v2 = full.load_module('v2', full.DEPENDENCIES['v2'])
    asr_mod = full.load_module('asr', full.DEPENDENCIES['asr'])
    v3 = full.load_module('v3', full.DEPENDENCIES['v3'])

    banner('1/10 - ACE-STEP 1.5 + PYTHON 3.12 + CUDA + XL-TURBO')
    if not runtime_base_ready():
        fresh.TOOLS.mkdir(parents=True, exist_ok=True)
        fresh.WORK.mkdir(parents=True, exist_ok=True)
        fresh.check_disk()
        uv = fresh.ensure_uv()
        fresh.prepare_repo()
        env = fresh.install_environment(uv)
        fresh.verify_gpu(env)
        fresh.download_models(env)
    else:
        print('FRESH_BASE_INSTALL=SKIPPED_ALREADY_PRESENT', flush=True)

    banner('2/10 - REAL MUSIC V1 CONTRACT - SEMANTIC SAFE')
    if v1_semantically_ready():
        print('REAL_MUSIC_V1=ALREADY_READY_SKIP_LEGACY_PATCHER', flush=True)
    else:
        fresh.patch_real_music_api()
        if not v1_semantically_ready():
            raise RuntimeError('Real Music V1 non completo dopo patch.')
        print('REAL_MUSIC_V1=READY', flush=True)

    banner('3/10 - REAL MUSIC V2 SPEED / QUALITY CONTRACT')
    v2.require_runtime()
    v2.patch_http_contract()
    v2.patch_generation_runtime()
    v2.patch_health_marker()
    v2.verify_code()
    print('REAL_MUSIC_V2=READY', flush=True)

    banner('4/10 - VOCAL ASR V3 + CUDA LIBRARIES')
    asr_fix = load_remote_module('sonara_asr_fix', ASR_FIX_URL)
    asr_fix.install_packages()
    asr_fix.export_cuda_library_path()
    if not asr_fix.import_ok():
        raise RuntimeError('faster-whisper/ctranslate2 non importabili dopo ASR repair.')
    asr_mod.patch_api()
    asr_mod.verify_syntax()
    print('VOCAL_ASR_V3=READY', flush=True)

    banner('5/10 - COMPLETE HUGGING FACE COMPATIBILITY REPAIR')
    hf_fix = load_remote_module('sonara_hf_fix', HF_FIX_URL)
    hf_fix.repair_stack()
    if not hf_fix.import_probe('HF_IMPORT_PROBE_0905'):
        raise RuntimeError('Stack Hugging Face ancora incompatibile dopo repair.')
    print('HF_STACK_COMPAT=READY', flush=True)

    banner('6/10 - LM4B + XL-BASE REFINEMENT MODEL')
    v3.ensure_runtime()
    v3.ensure_lm4b()
    v3.ensure_base()
    gpu = v3.verify_gpu()
    models = v3.probe_models()
    print(f'GPU={gpu}', flush=True)
    print(f'MODELS={models}', flush=True)
    if not runtime_complete():
        raise RuntimeError('XL-Turbo / XL-Base / LM4B non completi dopo installazione.')

    banner('7/10 - MODEL INVENTORY')
    print('XL_TURBO=READY', flush=True)
    print('XL_BASE=READY', flush=True)
    print('LM4B=READY', flush=True)
    print('CPU_OFFLOAD=OFF', flush=True)

    final_probe()

    banner('9/10 - INSTALL COMPLETE')
    print('BOOTSTRAP_0905=READY', flush=True)
    print('ENGINE=ACE-STEP-1.5-XL-TURBO', flush=True)
    print('REFINEMENT=XL-BASE', flush=True)
    print('LM=4B', flush=True)
    print('VOCAL_ASR_V3=ON', flush=True)
    print('REAL_MUSIC_V1_V2=ON', flush=True)
    print('NEXT=SPEED_V9_VLLM_COMPILE_AND_TUNNEL', flush=True)


def launch_speed_v9() -> None:
    banner('10/10 - RTX 6000 SPEED V9 + VLLM + TORCH.COMPILE + PUBLIC TUNNEL')
    speed_path = WORK / 'ace-step-real-music-v3-speed-supervisor-0904.py'
    download(SPEED_V9_URL, speed_path)
    code = speed_path.read_text(encoding='utf-8')
    exec(
        compile(code, '<SONARA-LATEST-RTX6000-0905-SPEED-V9>', 'exec'),
        {'__name__': '__main__', '__file__': str(speed_path)},
    )


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    run_install()
    launch_speed_v9()


if __name__ == '__main__':
    main()
