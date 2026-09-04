#!/usr/bin/env python3
from __future__ import annotations

import os
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
TOKENIZERS_PIN = 'tokenizers==0.23.0'


def run(cmd: list[str], label: str) -> subprocess.CompletedProcess:
    print(f'\n--- {label} ---', flush=True)
    print(' '.join(map(str, cmd)), flush=True)
    result = subprocess.run(cmd, cwd=str(ROOT), check=False)
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


def stack_ok() -> bool:
    code = r'''
import tokenizers
print('TOKENIZERS=' + tokenizers.__version__, flush=True)
import transformers
print('TRANSFORMERS=' + transformers.__version__, flush=True)
from transformers import AutoTokenizer, AutoModelForCausalLM
print('TRANSFORMERS_IMPORT=OK', flush=True)
import faster_whisper, ctranslate2
print('FASTER_WHISPER_IMPORT=OK', flush=True)
'''
    result = subprocess.run([str(PYTHON), '-c', code], cwd=str(ROOT), check=False)
    return result.returncode == 0


def repair_tokenizers() -> None:
    print('SONARA_TOKENIZERS_COMPAT_REPAIR=START', flush=True)
    if stack_ok():
        print('SONARA_TOKENIZERS_COMPAT_REPAIR=ALREADY_OK', flush=True)
        return

    uv = uv_binary()
    if uv:
        result = run(
            [uv, 'pip', 'install', '--python', str(PYTHON), '--reinstall', '--no-deps', TOKENIZERS_PIN],
            'UV_TOKENIZERS_PIN',
        )
        if result.returncode == 0 and stack_ok():
            print('SONARA_TOKENIZERS_COMPAT_REPAIR=OK_UV', flush=True)
            return

    run([str(PYTHON), '-m', 'ensurepip', '--upgrade'], 'ENSUREPIP')
    run([str(PYTHON), '-m', 'pip', 'install', '--upgrade', 'pip'], 'PIP_BOOTSTRAP')
    result = run(
        [str(PYTHON), '-m', 'pip', 'install', '--force-reinstall', '--no-deps', TOKENIZERS_PIN],
        'PIP_TOKENIZERS_PIN',
    )
    if result.returncode != 0 or not stack_ok():
        raise RuntimeError('Impossibile ripristinare la compatibilita transformers/tokenizers.')
    print('SONARA_TOKENIZERS_COMPAT_REPAIR=OK_PIP', flush=True)


def run_recovery() -> None:
    print('\nSONARA_REAL_MUSIC_V3_RECOVERY=START', flush=True)
    req = urllib.request.Request(RECOVERY_URL, headers={'User-Agent': 'SONARA-Tokenizers-Recovery/1.0'})
    code = urllib.request.urlopen(req, timeout=120).read().decode('utf-8')
    exec(
        compile(code, '<sonara-real-music-v3-safe-recovery-after-tokenizers-fix>', 'exec'),
        {'__name__': '__main__'},
    )


def main() -> None:
    if not ROOT.exists() or not PYTHON.exists():
        raise RuntimeError('SONARA ACE-Step CLEAN non trovato.')
    repair_tokenizers()
    run_recovery()


if __name__ == '__main__':
    main()
