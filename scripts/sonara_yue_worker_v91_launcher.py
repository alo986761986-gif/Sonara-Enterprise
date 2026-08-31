#!/usr/bin/env python3
from __future__ import annotations

import runpy
import sys
from pathlib import Path

HOME = Path('/marimo').resolve()
WORKER = HOME / 'sonara_yue_worker_v91_contract.py'
BASE = HOME / 'sonara_yue_worker_v9_exl2.py'

if not WORKER.exists():
    raise FileNotFoundError(f'YuE V9.1 worker non trovato: {WORKER}')
if not BASE.exists():
    raise FileNotFoundError(f'YuE V9 base worker non trovato: {BASE}')

# Python -I enables safe-path mode and does not prepend the script directory.
# Add only the explicit SONARA runtime directory needed by the V9.1 sibling import.
home_text = str(HOME)
if home_text not in sys.path:
    sys.path.insert(0, home_text)

print('[V9.1 launcher] isolated runtime path:', home_text, flush=True)
print('[V9.1 launcher] worker:', WORKER, flush=True)

runpy.run_path(str(WORKER), run_name='__main__')
