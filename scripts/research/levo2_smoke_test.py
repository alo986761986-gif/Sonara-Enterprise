#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import subprocess
from pathlib import Path

ROOT = Path('/marimo/SONARA-LeVo2-RESEARCH')
REPO = ROOT / 'LeVo'
PY = ROOT / 'venv' / 'bin' / 'python'
MODEL = ROOT / 'models' / 'SongGeneration-v2-large'
OUT = ROOT / 'smoke-output'
INPUT = ROOT / 'smoke-input.jsonl'


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    item = {
        'idx': 'sonara_levo2_smoke',
        'gt_lyric': '[intro-short] ; [verse] Midnight lights across the city. Deep shadows moving with the beat. Every step becomes a memory. We keep dancing through the heat. ; [chorus] Stay with the rhythm tonight. Let the darkness turn to light. Feel the bass and hold it tight. We are alive tonight. ; [inst-short] ; [outro-short]',
        'descriptions': 'male, electronic, deep house, dark, hypnotic, warm analog bass, punchy four on the floor kick, atmospheric synthesizers, polished club production',
        'auto_prompt_audio_type': 'Auto',
    }
    INPUT.write_text(json.dumps(item, ensure_ascii=False) + '\n', encoding='utf-8')

    env = os.environ.copy()
    env['USER'] = 'root'
    env['PYTHONDONTWRITEBYTECODE'] = '1'
    env['TRANSFORMERS_CACHE'] = str(REPO / 'third_party' / 'hub')
    env['PYTHONPATH'] = ':'.join([
        str(REPO / 'codeclm' / 'tokenizer'),
        str(REPO),
        str(REPO / 'codeclm' / 'tokenizer' / 'Flow1dVAE'),
        env.get('PYTHONPATH', ''),
    ])
    env['OMP_NUM_THREADS'] = '1'
    env['MKL_NUM_THREADS'] = '1'
    env['CUDA_LAUNCH_BLOCKING'] = '0'

    flash_ok = subprocess.run([str(PY), '-c', 'import flash_attn'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0
    cmd = [str(PY), 'generate.py', '--ckpt_path', str(MODEL), '--input_jsonl', str(INPUT), '--save_dir', str(OUT)]
    if flash_ok:
        cmd.append('--use_flash_attn')

    print('=' * 80, flush=True)
    print('SONARA LEVO 2 - RTX PRO 6000 SMOKE TEST', flush=True)
    print('FLASH_ATTN=', flash_ok, flush=True)
    print('MODEL=', MODEL, flush=True)
    print('=' * 80, flush=True)
    subprocess.run(cmd, cwd=REPO, env=env, check=True)

    audio = OUT / 'audios' / 'sonara_levo2_smoke.flac'
    if not audio.exists() or audio.stat().st_size < 1024:
        raise RuntimeError(f'LeVo non ha prodotto un file audio valido: {audio}')

    probe = subprocess.run(
        [str(PY), '-c',
         'import torchaudio,sys; x,sr=torchaudio.load(sys.argv[1]); '
         'print(f"sample_rate={sr}"); print(f"channels={x.shape[0]}"); print(f"duration_sec={x.shape[-1]/sr:.2f}"); print(f"frames={x.shape[-1]}")',
         str(audio)], capture_output=True, text=True, check=True)
    print(probe.stdout, flush=True)
    print('✅ LEVO 2 SMOKE TEST COMPLETATO', flush=True)
    print('✅ AUDIO:', audio, flush=True)
    print('⚠️ OUTPUT SOLO RICERCA/TEST - NON USARE IN PRODUZIONE COMMERCIALE', flush=True)


if __name__ == '__main__':
    main()
