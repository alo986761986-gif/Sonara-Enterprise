#!/usr/bin/env python3
from __future__ import annotations

import importlib.metadata as md
import shutil
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PYTHON = ROOT / '.venv/bin/python'
RECOVERY_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/'
    'scripts/ace-step-real-music-v3-api-safe-recovery-0904.py'
)

PINS = [
    'tokenizers==0.22.2',
    'huggingface-hub==0.36.2',
]


def run(cmd: list[str], label: str) -> subprocess.CompletedProcess:
    print(f'\n--- {label} ---', flush=True)
    print(' '.join(map(str, cmd)), flush=True)
    result = subprocess.run(
        cmd,
        cwd=str(ROOT),
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    print(result.stdout or '', flush=True)
    print(f'{label}_EXIT={result.returncode}', flush=True)
    return result


def uv_binary() -> str:
    for candidate in (
        shutil.which('uv'),
        '/root/.local/bin/uv',
        '/usr/local/bin/uv',
        str(Path.home() / '.local/bin/uv'),
    ):
        if candidate and Path(candidate).exists():
            return str(candidate)
    return ''


def versions() -> None:
    print('\n--- INSTALLED VERSIONS ---', flush=True)
    for name in (
        'transformers', 'tokenizers', 'huggingface-hub', 'faster-whisper',
        'ctranslate2', 'accelerate', 'safetensors', 'filelock', 'regex', 'tqdm',
    ):
        try:
            print(f'{name}={md.version(name)}', flush=True)
        except Exception as exc:
            print(f'{name}=MISSING ({exc})', flush=True)


def import_probe(label: str) -> bool:
    code = r'''
import traceback
checks = [
    ('tokenizers', 'import tokenizers; print("TOKENIZERS=" + tokenizers.__version__)'),
    ('huggingface_hub', 'import huggingface_hub; print("HUGGINGFACE_HUB=" + huggingface_hub.__version__)'),
    ('transformers', 'import transformers; print("TRANSFORMERS=" + transformers.__version__)'),
    ('transformers_auto', 'from transformers import AutoTokenizer, AutoModelForCausalLM; print("TRANSFORMERS_AUTO=OK")'),
    ('faster_whisper', 'import faster_whisper; print("FASTER_WHISPER=OK")'),
    ('ctranslate2', 'import ctranslate2; print("CTRANSLATE2=" + ctranslate2.__version__); print("CT2_CUDA_DEVICES=" + str(ctranslate2.get_cuda_device_count()))'),
]
ok = True
for name, src in checks:
    try:
        exec(src, {})
        print('CHECK_' + name.upper() + '=OK', flush=True)
    except Exception:
        ok = False
        print('CHECK_' + name.upper() + '=FAIL', flush=True)
        traceback.print_exc()
raise SystemExit(0 if ok else 7)
'''
    result = run([str(PYTHON), '-c', code], label)
    return result.returncode == 0


def pip_check(label: str) -> None:
    run([str(PYTHON), '-m', 'pip', 'check'], label)


def repair_stack() -> None:
    print('SONARA_HF_STACK_REPAIR=START', flush=True)
    versions()
    pip_check('PIP_CHECK_BEFORE')
    if import_probe('IMPORT_PROBE_BEFORE'):
        print('SONARA_HF_STACK_ALREADY_COMPATIBLE=YES', flush=True)
        return

    uv = uv_binary()
    if uv:
        result = run(
            [uv, 'pip', 'install', '--python', str(PYTHON), '--reinstall', '--no-deps', *PINS],
            'UV_HF_STACK_REPAIR',
        )
        if result.returncode == 0:
            versions()
            pip_check('PIP_CHECK_AFTER_UV')
            if import_probe('IMPORT_PROBE_AFTER_UV'):
                print('SONARA_HF_STACK_REPAIR=OK_UV', flush=True)
                return

    print('UV_HF_STACK_REPAIR=FALLBACK_PIP', flush=True)
    run([str(PYTHON), '-m', 'ensurepip', '--upgrade'], 'ENSUREPIP')
    run([str(PYTHON), '-m', 'pip', 'install', '--upgrade', 'pip'], 'PIP_BOOTSTRAP')
    result = run(
        [str(PYTHON), '-m', 'pip', 'install', '--force-reinstall', '--no-deps', *PINS],
        'PIP_HF_STACK_REPAIR',
    )
    if result.returncode != 0:
        raise RuntimeError('Repair Hugging Face fallita durante pip install.')

    versions()
    pip_check('PIP_CHECK_AFTER_PIP')
    if not import_probe('IMPORT_PROBE_AFTER_PIP'):
        raise RuntimeError('Stack Hugging Face ancora incompatibile. Vedi IMPORT_PROBE_AFTER_PIP sopra per il traceback esatto.')

    print('SONARA_HF_STACK_REPAIR=OK_PIP', flush=True)


def launch_recovery() -> None:
    print('\nSONARA_REAL_MUSIC_V3_SAFE_RECOVERY=START', flush=True)
    req = urllib.request.Request(RECOVERY_URL, headers={'User-Agent': 'SONARA-HF-Stack-Recovery/1.0'})
    source = urllib.request.urlopen(req, timeout=120).read().decode('utf-8')
    exec(
        compile(source, '<sonara-real-music-v3-safe-recovery-after-hf-stack-fix>', 'exec'),
        {'__name__': '__main__'},
    )


def main() -> None:
    if not ROOT.exists() or not PYTHON.exists():
        raise RuntimeError('SONARA ACE-Step CLEAN non trovato.')
    repair_stack()
    launch_recovery()


if __name__ == '__main__':
    main()
