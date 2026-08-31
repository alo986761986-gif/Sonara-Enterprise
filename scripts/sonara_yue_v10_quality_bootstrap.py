#!/usr/bin/env python3
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

HOME = Path('/marimo')
VENV = Path('/marimo/venvs/sonara-yue-v9-blackwell')
PYTHON = VENV / 'bin' / 'python'
ROOT = Path('/marimo/YuE-quality')
INFERENCE = ROOT / 'inference'
MODEL_ROOT = Path('/marimo/models/yue-bf16')
STAGE1 = MODEL_ROOT / 'stage1-cot'
STAGE1_ICL = MODEL_ROOT / 'stage1-icl'
STAGE2 = MODEL_ROOT / 'stage2-general'
EXISTING_XCODEC = Path('/marimo/YuE-exllamav2/xcodec_mini_infer')
XCODEC = INFERENCE / 'xcodec_mini_infer'

REPO = 'https://github.com/multimodal-art-projection/YuE.git'
MODELS = (
    ('m-a-p/YuE-s1-7B-anneal-en-cot', STAGE1),
    ('m-a-p/YuE-s1-7B-anneal-en-icl', STAGE1_ICL),
    ('m-a-p/YuE-s2-1B-general', STAGE2),
)


def run(cmd, *, cwd=None, env=None):
    print('+', ' '.join(map(str, cmd)), flush=True)
    subprocess.run([str(x) for x in cmd], cwd=str(cwd) if cwd else None, env=env, check=True)


def model_complete(path: Path) -> bool:
    return (path / 'config.json').exists() and any(path.glob('*.safetensors'))


def ensure_repo():
    if (INFERENCE / 'infer.py').exists():
        print('✅ YuE official repo gia presente:', ROOT, flush=True)
        return
    if ROOT.exists():
        shutil.rmtree(ROOT)
    run(['git', 'clone', '--depth', '1', REPO, ROOT])


def ensure_xcodec():
    if (XCODEC / 'final_ckpt' / 'config.yaml').exists():
        print('✅ XCodec quality pronto', flush=True)
        return
    if EXISTING_XCODEC.exists():
        if XCODEC.exists() or XCODEC.is_symlink():
            if XCODEC.is_dir() and not XCODEC.is_symlink():
                shutil.rmtree(XCODEC)
            else:
                XCODEC.unlink(missing_ok=True)
        XCODEC.symlink_to(EXISTING_XCODEC, target_is_directory=True)
        print('✅ Riutilizzo XCodec gia installato: nessun download', flush=True)
        return
    run(['git', 'clone', 'https://huggingface.co/m-a-p/xcodec_mini_infer', XCODEC])


def ensure_python_stack():
    if not PYTHON.exists():
        raise RuntimeError(f'Venv Blackwell non trovato: {PYTHON}')
    packages = [
        'omegaconf', 'einops', 'sentencepiece', 'tqdm', 'scipy',
        'accelerate>=0.26.0', 'descript-audiotools>=0.7.2',
        'descript-audio-codec', 'soundfile', 'librosa>=0.10.2',
        'soxr', 'huggingface_hub>=0.28', 'transformers>=4.48,<5',
    ]
    run([PYTHON, '-m', 'pip', 'install', '-U', *packages])
    verify = (
        'import torch, torchaudio, transformers, flash_attn, librosa, soundfile; '
        'print({"torch":torch.__version__,"cuda":torch.version.cuda,'
        '"gpu":torch.cuda.get_device_name(0),"transformers":transformers.__version__,'
        '"flash_attn":flash_attn.__version__,"librosa":librosa.__version__})'
    )
    run([PYTHON, '-c', verify])


def ensure_models():
    MODEL_ROOT.mkdir(parents=True, exist_ok=True)
    code = r'''
from pathlib import Path
from huggingface_hub import snapshot_download
import os
models = [
    ('m-a-p/YuE-s1-7B-anneal-en-cot', Path('/marimo/models/yue-bf16/stage1-cot')),
    ('m-a-p/YuE-s1-7B-anneal-en-icl', Path('/marimo/models/yue-bf16/stage1-icl')),
    ('m-a-p/YuE-s2-1B-general', Path('/marimo/models/yue-bf16/stage2-general')),
]
for repo, path in models:
    complete = (path/'config.json').exists() and any(path.glob('*.safetensors'))
    if complete:
        print('✅ MODELLO GIA PRESENTE:', repo, '->', path, flush=True)
        continue
    path.mkdir(parents=True, exist_ok=True)
    print('⬇️ DOWNLOAD MODELLO QUALITY:', repo, flush=True)
    snapshot_download(repo_id=repo, local_dir=str(path))
    complete = (path/'config.json').exists() and any(path.glob('*.safetensors'))
    if not complete:
        raise RuntimeError(f'Download incompleto: {repo}')
    print('✅ COMPLETO:', repo, flush=True)
'''
    run([PYTHON, '-c', code])


def verify_assets():
    required = [
        INFERENCE / 'infer.py',
        ROOT / 'top_200_tags.json',
        XCODEC / 'final_ckpt' / 'config.yaml',
        XCODEC / 'final_ckpt' / 'ckpt_00360000.pth',
        XCODEC / 'decoders' / 'config.yaml',
        XCODEC / 'decoders' / 'decoder_131000.pth',
        XCODEC / 'decoders' / 'decoder_151000.pth',
    ]
    missing = [str(p) for p in required if not p.exists()]
    if missing:
        raise RuntimeError('Asset V10 mancanti:\n' + '\n'.join(missing))
    for path in (STAGE1, STAGE1_ICL, STAGE2):
        if not model_complete(path):
            raise RuntimeError(f'Modello BF16 incompleto: {path}')


def main():
    print('=' * 80)
    print('SONARA YUE V10 QUALITY - BF16 OFFICIAL BOOTSTRAP')
    print('RTX PRO 6000 / CUDA 12.8 / OFFICIAL YUE MODELS')
    print('=' * 80)
    ensure_repo()
    ensure_xcodec()
    ensure_python_stack()
    ensure_models()
    verify_assets()
    print('\n' + '=' * 80)
    print('✅ SONARA YUE V10 QUALITY ASSETS PRONTI')
    print('✅ STAGE1 BF16:', STAGE1)
    print('✅ STAGE1 ICL BF16:', STAGE1_ICL)
    print('✅ STAGE2 BF16:', STAGE2)
    print('✅ XCODEC RIUTILIZZATO:', XCODEC)
    print('✅ NESSUN MODELLO EXL2 MODIFICATO')
    print('=' * 80)


if __name__ == '__main__':
    main()
