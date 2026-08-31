#!/usr/bin/env python3
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path('/marimo/SONARA-LeVo2-RESEARCH')
REPO = ROOT / 'LeVo'
VENV = ROOT / 'venv'
MODEL = ROOT / 'models' / 'SongGeneration-v2-large'
RUNTIME = ROOT / 'runtime'
PY = VENV / 'bin' / 'python'
PIP = [str(PY), '-m', 'pip']
HF = [str(PY), '-m', 'huggingface_hub.commands.huggingface_cli']


def run(cmd, cwd=None, env=None, check=True):
    print('$', ' '.join(map(str, cmd)), flush=True)
    return subprocess.run(cmd, cwd=cwd, env=env, check=check)


def ensure_repo():
    ROOT.mkdir(parents=True, exist_ok=True)
    if not (REPO / '.git').exists():
        run(['git', 'clone', '--depth', '1', 'https://github.com/levo-demo/LeVo.git', str(REPO)])
    else:
        run(['git', 'fetch', '--depth', '1', 'origin', 'main'], cwd=REPO)
        run(['git', 'reset', '--hard', 'origin/main'], cwd=REPO)


def ensure_venv():
    if not PY.exists():
        py310 = shutil.which('python3.10')
        if not py310:
            raise RuntimeError('Python 3.10 non trovato su MoLab. Installa python3.10 e riprova.')
        run([py310, '-m', 'venv', str(VENV)])
    run(PIP + ['install', '--upgrade', 'pip', 'setuptools', 'wheel'])


def install_blackwell_stack():
    # Blackwell-safe CUDA 12.8 wheels. Keep this environment fully isolated from YuE.
    run(PIP + ['install', '--index-url', 'https://download.pytorch.org/whl/cu128',
               'torch==2.9.0', 'torchaudio==2.9.0', 'torchvision==0.24.0'])
    req = REPO / 'requirements.txt'
    filtered = ROOT / 'requirements.blackwell.txt'
    lines = []
    for raw in req.read_text(encoding='utf-8').splitlines():
        s = raw.strip()
        if not s or s.startswith('#'):
            continue
        if s.startswith(('torch==', 'torchaudio==', 'torchvision==')):
            continue
        lines.append(s)
    filtered.write_text('\n'.join(lines) + '\n', encoding='utf-8')
    run(PIP + ['install', '-r', str(filtered)])
    run(PIP + ['install', '-r', str(REPO / 'requirements_nodeps.txt'), '--no-deps'])
    run(PIP + ['install', 'huggingface_hub==0.25.2'])


def install_flash_attention_optional():
    env = os.environ.copy()
    env['MAX_JOBS'] = '8'
    # Build against the Blackwell-safe torch/CUDA stack. Failure is non-fatal; smoke test falls back.
    result = subprocess.run(PIP + ['install', 'flash-attn==2.8.3', '--no-build-isolation'], env=env)
    if result.returncode != 0:
        print('WARN: flash-attn non installato. LeVo usera il percorso standard.', flush=True)


def download_models():
    RUNTIME.mkdir(parents=True, exist_ok=True)
    MODEL.mkdir(parents=True, exist_ok=True)
    run([str(PY), '-c',
         'from huggingface_hub import snapshot_download; '
         f'snapshot_download("lglg666/SongGeneration-Runtime", local_dir=r"{RUNTIME}", local_dir_use_symlinks=False)'])
    for name in ('ckpt', 'third_party'):
        src = RUNTIME / name
        dst = REPO / name
        if dst.exists() or dst.is_symlink():
            if dst.is_symlink() or dst.is_file():
                dst.unlink()
            else:
                shutil.rmtree(dst)
        os.symlink(src, dst, target_is_directory=True)
    run([str(PY), '-c',
         'from huggingface_hub import snapshot_download; '
         f'snapshot_download("lglg666/SongGeneration-v2-large", local_dir=r"{MODEL}", local_dir_use_symlinks=False)'])


def verify():
    code = r'''
import torch
print('torch=', torch.__version__)
print('cuda=', torch.version.cuda)
print('cuda_available=', torch.cuda.is_available())
assert torch.cuda.is_available(), 'CUDA non disponibile'
p = torch.cuda.get_device_properties(0)
print('gpu=', p.name)
print('vram_gb=', round(p.total_memory/1024**3, 2))
print('capability=', torch.cuda.get_device_capability(0))
x=torch.randn((1024,1024),device='cuda',dtype=torch.float16)
y=x@x
print('matmul=', float(y[0,0]))
print('blackwell_cuda_test=OK')
'''
    run([str(PY), '-c', code])
    for required in [MODEL / 'config.yaml', MODEL / 'model.pt', REPO / 'ckpt', REPO / 'third_party', REPO / 'tools' / 'new_prompt.pt']:
        if not required.exists():
            raise RuntimeError(f'Manca file LeVo richiesto: {required}')


def main():
    print('=' * 80)
    print('SONARA LEVO 2 RESEARCH - RTX PRO 6000 BLACKWELL')
    print('ISOLATO DA PRODUZIONE - LICENZA SOLO RICERCA/EDUCAZIONE')
    print('=' * 80)
    ensure_repo()
    ensure_venv()
    install_blackwell_stack()
    install_flash_attention_optional()
    download_models()
    verify()
    print('=' * 80)
    print('✅ LEVO 2 V2-LARGE INSTALLATO IN SANDBOX')
    print(f'✅ ROOT  : {ROOT}')
    print(f'✅ MODEL : {MODEL}')
    print(f'✅ PYTHON: {PY}')
    print('✅ RTX PRO 6000: CUDA TEST OK')
    print('⚠️ SOLO TEST/RICERCA: licenza ufficiale vieta uso commerciale/production')
    print('=' * 80)


if __name__ == '__main__':
    main()
