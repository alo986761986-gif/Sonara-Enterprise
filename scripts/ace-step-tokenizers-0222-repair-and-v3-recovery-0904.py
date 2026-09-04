#!/usr/bin/env python3
from __future__ import annotations

import shutil
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PYTHON = ROOT / '.venv/bin/python'
TOKENIZERS_PIN = 'tokenizers==0.22.2'
RECOVERY_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/'
    'scripts/ace-step-real-music-v3-api-safe-recovery-0904.py'
)


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


def verify_stack(label: str) -> bool:
    code = r'''
import tokenizers
print('TOKENIZERS=' + tokenizers.__version__, flush=True)
import transformers
print('TRANSFORMERS=' + transformers.__version__, flush=True)
from transformers import AutoTokenizer, AutoModelForCausalLM
print('TRANSFORMERS_IMPORT=OK', flush=True)
import faster_whisper, ctranslate2
print('FASTER_WHISPER_IMPORT=OK', flush=True)
print('CT2_CUDA_DEVICES=' + str(ctranslate2.get_cuda_device_count()), flush=True)
'''
    result = run([str(PYTHON), '-c', code], label)
    return result.returncode == 0


def repair() -> None:
    print('SONARA_TOKENIZERS_0222_REPAIR=START', flush=True)

    if verify_stack('STACK_BEFORE'):
        print('STACK_ALREADY_COMPATIBLE=YES', flush=True)
        return

    uv = uv_binary()
    if uv:
        result = run(
            [uv, 'pip', 'install', '--python', str(PYTHON), '--reinstall', '--no-deps', TOKENIZERS_PIN],
            'UV_TOKENIZERS_0222',
        )
        if result.returncode == 0 and verify_stack('STACK_AFTER_UV'):
            print('SONARA_TOKENIZERS_0222_REPAIR=OK_UV', flush=True)
            return

    print('UV_REPAIR_NOT_COMPLETE=FALLBACK_PIP', flush=True)
    run([str(PYTHON), '-m', 'ensurepip', '--upgrade'], 'ENSUREPIP')
    run([str(PYTHON), '-m', 'pip', 'install', '--upgrade', 'pip'], 'PIP_BOOTSTRAP')
    result = run(
        [str(PYTHON), '-m', 'pip', 'install', '--force-reinstall', '--no-deps', TOKENIZERS_PIN],
        'PIP_TOKENIZERS_0222',
    )
    if result.returncode != 0:
        raise RuntimeError('Installazione tokenizers 0.22.2 fallita. Vedi output PIP_TOKENIZERS_0222 sopra.')

    if not verify_stack('STACK_AFTER_PIP'):
        raise RuntimeError('tokenizers 0.22.2 installato ma lo stack non e ancora compatibile. Vedi STACK_AFTER_PIP sopra.')

    print('SONARA_TOKENIZERS_0222_REPAIR=OK_PIP', flush=True)


def launch_recovery() -> None:
    print('\nSONARA_REAL_MUSIC_V3_SAFE_RECOVERY=START', flush=True)
    req = urllib.request.Request(RECOVERY_URL, headers={'User-Agent': 'SONARA-0222-Recovery/1.0'})
    source = urllib.request.urlopen(req, timeout=120).read().decode('utf-8')
    exec(
        compile(source, '<sonara-real-music-v3-safe-recovery-after-0222>', 'exec'),
        {'__name__': '__main__'},
    )


def main() -> None:
    if not ROOT.exists() or not PYTHON.exists():
        raise RuntimeError('SONARA ACE-Step CLEAN non trovato.')
    repair()
    launch_recovery()


if __name__ == '__main__':
    main()
