#!/usr/bin/env python3
from __future__ import annotations

import os
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/YuE-quality')
INFERENCE = ROOT / 'inference'
INFER = INFERENCE / 'infer.py'
PYTHON = Path('/marimo/venvs/sonara-yue-v9-blackwell/bin/python')

OFFICIAL = 'https://raw.githubusercontent.com/multimodal-art-projection/YuE/main/inference/'
REQUIRED_DOWNLOADS = {
    INFERENCE / 'codecmanipulator.py': OFFICIAL + 'codecmanipulator.py',
    INFERENCE / 'mmtokenizer.py': OFFICIAL + 'mmtokenizer.py',
    INFERENCE / 'mm_tokenizer_v0.2_hf' / 'tokenizer.model': OFFICIAL + 'mm_tokenizer_v0.2_hf/tokenizer.model',
}

MARKER = '# SONARA_V10_LOCAL_IMPORT_FIX'
PREAMBLE = '''# SONARA_V10_LOCAL_IMPORT_FIX
# YuE infer.py imports sibling modules (codecmanipulator.py, mmtokenizer.py).
# V10 workers may run under isolated/safe-path Python; make the inference
# directory explicit so sibling imports are deterministic in every runtime.
import os as _sonara_os
import sys as _sonara_sys
_sonara_inference_dir = _sonara_os.path.dirname(_sonara_os.path.abspath(__file__))
if _sonara_inference_dir not in _sonara_sys.path:
    _sonara_sys.path.insert(0, _sonara_inference_dir)

'''


def ensure_files():
    if not INFER.exists():
        raise RuntimeError(f'YuE official infer.py non trovato: {INFER}')
    for destination, url in REQUIRED_DOWNLOADS.items():
        destination.parent.mkdir(parents=True, exist_ok=True)
        if destination.exists() and destination.stat().st_size > 0:
            print('✅ presente:', destination, flush=True)
            continue
        print('⬇️ ripristino:', destination, flush=True)
        urllib.request.urlretrieve(url, destination)
        if not destination.exists() or destination.stat().st_size == 0:
            raise RuntimeError(f'Ripristino fallito: {destination}')
        print('✅ ripristinato:', destination, flush=True)


def patch_infer():
    text = INFER.read_text(encoding='utf-8')
    if MARKER in text:
        print('✅ infer.py gia protetto contro safe-path', flush=True)
        return
    backup = INFER.with_suffix('.py.before-sonara-v10-import-fix')
    if not backup.exists():
        backup.write_text(text, encoding='utf-8')
        print('✅ backup:', backup, flush=True)
    INFER.write_text(PREAMBLE + text, encoding='utf-8')
    print('✅ infer.py patchato con import path deterministico', flush=True)


def verify():
    if not PYTHON.exists():
        raise RuntimeError(f'Python V10 non trovato: {PYTHON}')

    # First verify sibling imports under explicit safe-path with no PYTHONPATH.
    env = os.environ.copy()
    env.pop('PYTHONPATH', None)
    env['PYTHONSAFEPATH'] = '1'
    code = f'''
import os, sys
p = {str(INFERENCE)!r}
# Simulate infer.py's SONARA preamble under safe-path.
if p not in sys.path:
    sys.path.insert(0, p)
from codecmanipulator import CodecManipulator
from mmtokenizer import _MMSentencePieceTokenizer
CodecManipulator("xcodec", 0, 1)
_MMSentencePieceTokenizer({str(INFERENCE / 'mm_tokenizer_v0.2_hf' / 'tokenizer.model')!r})
print("SONARA_IMPORTS_OK")
'''
    result = subprocess.run(
        [str(PYTHON), '-P', '-c', code],
        cwd='/tmp',
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.stdout.strip():
        print(result.stdout.strip(), flush=True)
    if result.returncode != 0:
        print(result.stderr, flush=True)
        raise RuntimeError(f'Import test fallito rc={result.returncode}')

    # Then execute the real infer.py import stack with --help from outside its dir.
    real = subprocess.run(
        [str(PYTHON), '-P', str(INFER), '--help'],
        cwd='/tmp',
        env=env,
        capture_output=True,
        text=True,
        check=False,
    )
    if real.returncode != 0:
        print(real.stdout[-4000:], flush=True)
        print(real.stderr[-8000:], flush=True)
        raise RuntimeError(f'infer.py safe-path test fallito rc={real.returncode}')
    print('✅ infer.py reale parte sotto safe-path', flush=True)


def main():
    print('=' * 80)
    print('SONARA YUE V10 QUALITY - DEFINITIVE LOCAL IMPORT REPAIR')
    print('=' * 80)
    ensure_files()
    patch_infer()
    verify()
    print('=' * 80)
    print('✅ SONARA YUE V10 QUALITY IMPORT FIX DEFINITIVO')
    print('✅ codecmanipulator visibile')
    print('✅ mmtokenizer visibile')
    print('✅ tokenizer visibile')
    print('✅ infer.py verificato con safe-path')
    print('✅ modelli BF16 NON toccati')
    print('✅ tunnel/gateway NON toccati')
    print('🚀 RILANCIA ORA UNA NUOVA GENERAZIONE QUALITY')
    print('=' * 80)


if __name__ == '__main__':
    main()
