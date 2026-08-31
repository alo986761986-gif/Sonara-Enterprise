#!/usr/bin/env python3
from __future__ import annotations

import subprocess
import urllib.request
from pathlib import Path

HOME = Path('/marimo')
PYTHON = Path('/marimo/venvs/sonara-yue-v9-blackwell/bin/python')
RAW = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/'
FILES = [
    'sonara_yue_v10_quality_bootstrap.py',
    'sonara_yue_v10_quality_worker.py',
    'sonara_yue_v10_gateway.py',
    'sonara_yue_v10_start_all.py',
    'sonara_yue_worker_v9_exl2.py',
]


def main():
    print('=' * 80)
    print('SONARA YUE V10 - INSTALL + START')
    print('QUALITY BF16 + FAST EXL2 + PUBLIC GATEWAY')
    print('=' * 80)
    if not PYTHON.exists():
        raise RuntimeError(f'Venv Blackwell non trovato: {PYTHON}')

    for name in FILES:
        target = HOME / name
        urllib.request.urlretrieve(RAW + name, target)
        print('✅', target, flush=True)

    bootstrap = HOME / 'sonara_yue_v10_quality_bootstrap.py'
    starter = HOME / 'sonara_yue_v10_start_all.py'

    print('\n=== FASE 1: QUALITY BF16 ASSETS ===', flush=True)
    subprocess.run([str(PYTHON), str(bootstrap)], check=True)

    print('\n=== FASE 2: AVVIO MOTORI V10 ===', flush=True)
    subprocess.run([str(PYTHON), str(starter)], check=True)

    print('\n' + '=' * 80)
    print('✅ SONARA YUE V10 INSTALLATO E AVVIATO')
    print('✅ QUALITY BF16 : 8014')
    print('✅ FAST EXL2    : 8013')
    print('✅ GATEWAY      : 8012')
    print('✅ PUBLIC       : https://yue.sonaraenterprise.com')
    print('✅ DEFAULT      : QUALITY')
    print('=' * 80)


if __name__ == '__main__':
    main()
