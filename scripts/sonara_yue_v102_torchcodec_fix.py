#!/usr/bin/env python3
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

VENV = Path('/marimo/venvs/sonara-yue-v9-blackwell')
PYTHON = VENV / 'bin' / 'python'
TEST_MP3 = Path('/tmp/sonara_yue_torchcodec_test.mp3')


def run(cmd):
    print('+', ' '.join(map(str, cmd)), flush=True)
    return subprocess.run([str(x) for x in cmd], check=True)


def main():
    print('=' * 80)
    print('SONARA YUE V10.2 - TORCHCODEC AUDIO SAVE REPAIR')
    print('=' * 80)

    if not PYTHON.exists():
        raise RuntimeError(f'Python V10 non trovato: {PYTHON}')

    ffmpeg = shutil.which('ffmpeg')
    if ffmpeg:
        print('✅ FFmpeg:', ffmpeg, flush=True)
    else:
        print('⚠️ ffmpeg CLI non trovato; il test TorchCodec dira se le shared libraries sono comunque disponibili.', flush=True)

    # Torch 2.9 <-> TorchCodec 0.9 is the official compatibility pair.
    # --no-deps is intentional: never allow pip to replace the existing
    # Blackwell Torch/CUDA stack while repairing audio encoding.
    run([
        PYTHON,
        '-m', 'pip', 'install',
        '--no-deps',
        '--upgrade',
        'torchcodec==0.9',
    ])

    verify = r'''
import os
import torch
import torchaudio
import torchcodec
from torchcodec.encoders import AudioEncoder

print('torch=', torch.__version__)
print('torchaudio=', torchaudio.__version__)
print('torchcodec=', torchcodec.__version__)
print('cuda=', torch.version.cuda)
print('gpu=', torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'CPU')

path = '/tmp/sonara_yue_torchcodec_test.mp3'
wave = torch.zeros((2, 16000), dtype=torch.float32)
torchaudio.save(path, wave, sample_rate=16000)
size = os.path.getsize(path)
if size <= 0:
    raise RuntimeError('MP3 test vuoto')
print('SONARA_TORCHCODEC_MP3_OK', size)
'''

    run([PYTHON, '-c', verify])

    if TEST_MP3.exists():
        TEST_MP3.unlink()

    print('=' * 80)
    print('✅ TORCHCODEC 0.9 INSTALLATO E VERIFICATO')
    print('✅ TORCH 2.9 / CUDA 12.8 NON MODIFICATI')
    print('✅ TORCHAUDIO MP3 SAVE FUNZIONANTE')
    print('✅ MODELLI BF16 NON TOCCATI')
    print('✅ TUNNEL/GATEWAY NON TOCCATI')
    print('🚀 PUOI RILANCIARE QUALITY')
    print('=' * 80)


if __name__ == '__main__':
    main()
