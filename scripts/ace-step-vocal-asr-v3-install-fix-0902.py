#!/usr/bin/env python3
from __future__ import annotations

import os
import shutil
import subprocess
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PYTHON = ROOT / '.venv/bin/python'
ORIGINAL_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/'
    'scripts/ace-step-vocal-asr-v3-upgrade-0902.py'
)


def run(cmd, label: str, check: bool = False) -> subprocess.CompletedProcess:
    print(f'\n--- {label} ---', flush=True)
    print(' '.join(map(str, cmd)), flush=True)
    result = subprocess.run(cmd, cwd=str(ROOT), check=False)
    print(f'{label}_EXIT={result.returncode}', flush=True)
    if check and result.returncode != 0:
        raise RuntimeError(f'{label} fallito (exit={result.returncode})')
    return result


def import_ok() -> bool:
    result = subprocess.run(
        [str(PYTHON), '-c', 'import faster_whisper, ctranslate2; print("FASTER_WHISPER_IMPORT=OK"); print("CT2_CUDA_DEVICES=" + str(ctranslate2.get_cuda_device_count()))'],
        cwd=str(ROOT),
        check=False,
    )
    return result.returncode == 0


def uv_binary() -> str:
    candidates = [
        shutil.which('uv'),
        '/root/.local/bin/uv',
        '/usr/local/bin/uv',
        str(Path.home() / '.local/bin/uv'),
    ]
    for candidate in candidates:
        if candidate and Path(candidate).exists():
            return str(candidate)
    return ''


def install_packages() -> None:
    if import_ok():
        print('FASTER_WHISPER=ALREADY_INSTALLED', flush=True)
        return

    uv = uv_binary()
    packages = [
        'faster-whisper>=1.2.0,<2',
        'nvidia-cublas-cu12',
        'nvidia-cudnn-cu12==9.*',
    ]

    if uv:
        result = run(
            [uv, 'pip', 'install', '--python', str(PYTHON), '--upgrade', *packages],
            'UV_PIP_ASR',
        )
        if result.returncode == 0 and import_ok():
            print('ASR_INSTALL_METHOD=uv-pip', flush=True)
            return

    print('UV_PIP_ASR=FALLBACK_ENSUREPIP', flush=True)
    run([str(PYTHON), '-m', 'ensurepip', '--upgrade'], 'ENSUREPIP')
    run([str(PYTHON), '-m', 'pip', 'install', '--upgrade', 'pip', 'setuptools', 'wheel'], 'PIP_BOOTSTRAP')
    result = run([str(PYTHON), '-m', 'pip', 'install', '--upgrade', *packages], 'PIP_ASR')
    if result.returncode != 0 or not import_ok():
        raise RuntimeError('Installazione ASR fallita anche dopo uv + ensurepip fallback')
    print('ASR_INSTALL_METHOD=pip-fallback', flush=True)


def export_cuda_library_path() -> None:
    code = (
        'import os\n'
        'paths=[]\n'
        'try:\n import nvidia.cublas.lib as a; paths.append(os.path.dirname(a.__file__))\n'
        'except Exception: pass\n'
        'try:\n import nvidia.cudnn.lib as b; paths.append(os.path.dirname(b.__file__))\n'
        'except Exception: pass\n'
        'print(":".join(paths))\n'
    )
    result = subprocess.run([str(PYTHON), '-c', code], cwd=str(ROOT), text=True, capture_output=True, check=False)
    paths = result.stdout.strip()
    if paths:
        current = os.environ.get('LD_LIBRARY_PATH', '')
        os.environ['LD_LIBRARY_PATH'] = paths + (':' + current if current else '')
        print('SONARA_ASR_CUDA_LIBS=' + paths, flush=True)
    else:
        print('SONARA_ASR_CUDA_LIBS=SYSTEM', flush=True)


def run_original_patch_without_broken_installer() -> None:
    source = urllib.request.urlopen(ORIGINAL_URL, timeout=60).read().decode('utf-8')
    start = source.find('def install_asr() -> None:\n')
    end = source.find('\n\ndef patch_api() -> None:', start)
    if start < 0 or end < 0:
        raise RuntimeError('Impossibile applicare hotfix al blocco install_asr originale')
    replacement = '''def install_asr() -> None:\n    print('INSTALL_FASTER_WHISPER=PREINSTALLED_BY_UV_FIX', flush=True)\n    subprocess.run([str(PYTHON), '-c', 'import faster_whisper, ctranslate2; print("FASTER_WHISPER=OK"); print("CT2_CUDA_DEVICES=" + str(ctranslate2.get_cuda_device_count()))'], cwd=str(ROOT), check=True)\n'''
    patched = source[:start] + replacement + source[end:]
    namespace = {'__name__': '__main__'}
    exec(compile(patched, '<ace-step-vocal-asr-v3-upgrade-0902-fixed>', 'exec'), namespace)


def main() -> None:
    if not ROOT.exists() or not PYTHON.exists():
        raise RuntimeError('SONARA ACE-Step CLEAN non trovato')
    print('SONARA_VOCAL_ASR_V3_INSTALL_FIX=START', flush=True)
    install_packages()
    export_cuda_library_path()
    os.environ['SONARA_ASR_MODEL'] = 'large-v3-turbo'
    os.environ['SONARA_ASR_DEVICE'] = 'cuda'
    os.environ['SONARA_ASR_COMPUTE_TYPE'] = 'float16'
    run_original_patch_without_broken_installer()
    print('SONARA_VOCAL_ASR_V3_INSTALL_FIX=OK', flush=True)


if __name__ == '__main__':
    main()
