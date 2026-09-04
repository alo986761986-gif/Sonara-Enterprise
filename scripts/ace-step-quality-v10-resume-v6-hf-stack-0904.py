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
WORK = Path('/tmp/sonara-quality-v10-resume-v6-hf-stack-0904')

HF_STACK_FIX_URL = (
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
    print('\n' + '=' * 112, flush=True)
    print(text, flush=True)
    print('=' * 112, flush=True)


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'SONARA-QUALITY-V10-Resume-V6/1.0'})
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


def require_runtime() -> None:
    missing = [str(path) for path in (ROOT, PYTHON, TURBO, BASE, LM4B) if not path.exists()]
    if missing:
        raise RuntimeError('Runtime/model SONARA incompleto; mancanti: ' + ', '.join(missing))
    print('RUNTIME_AND_MODELS=READY', flush=True)
    print('XL_TURBO=READY', flush=True)
    print('XL_BASE=READY', flush=True)
    print('LM4B=READY', flush=True)


def final_probe() -> None:
    banner('2/3 - FINAL HF / CUDA / ASR PROBE')
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
raise SystemExit(0 if ok else 8)
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
        raise RuntimeError('FINAL_PROBE fallito. Il traceback sopra identifica il pacchetto residuo incompatibile.')
    print('FINAL_STACK=READY', flush=True)


def repair_hf_stack() -> None:
    banner('1/3 - COMPLETE HUGGING FACE STACK REPAIR')
    hf_fix = load_remote_module('sonara_hf_stack_fix', HF_STACK_FIX_URL)
    hf_fix.repair_stack()
    if not hf_fix.import_probe('V6_IMPORT_PROBE_AFTER_REPAIR'):
        raise RuntimeError('HF stack ancora incompatibile dopo repair completo.')
    print('HF_STACK_COMPAT=READY', flush=True)


def launch_speed_v9() -> None:
    banner('3/3 - QUALITY V10 / SPEED SUPERVISOR V9')
    speed_path = WORK / 'ace-step-real-music-v3-speed-supervisor-0904.py'
    download(SPEED_V9_URL, speed_path)
    code = speed_path.read_text(encoding='utf-8')
    exec(
        compile(code, '<SONARA-QUALITY-V10-RESUME-V6-SPEED-V9>', 'exec'),
        {'__name__': '__main__', '__file__': str(speed_path)},
    )


def main() -> None:
    WORK.mkdir(parents=True, exist_ok=True)
    banner('SONARA QUALITY V10 - RESUME V6 HF STACK')
    print('RESUME_VERSION=V6_0904', flush=True)
    require_runtime()
    repair_hf_stack()
    final_probe()
    launch_speed_v9()


if __name__ == '__main__':
    main()
