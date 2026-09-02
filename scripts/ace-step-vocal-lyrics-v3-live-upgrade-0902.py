#!/usr/bin/env python3
from __future__ import annotations

import urllib.request

BASE = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/'


def run(name: str, label: str) -> None:
    print('\n' + '=' * 96, flush=True)
    print(label, flush=True)
    print('=' * 96, flush=True)
    url = BASE + name
    code = urllib.request.urlopen(url, timeout=60).read().decode('utf-8')
    namespace = {'__name__': '__main__'}
    exec(compile(code, f'<{name}>', 'exec'), namespace)


def main() -> None:
    run('ace-step-vocal-asr-v3-install-fix-0902.py', 'SONARA VOCAL & LYRICS V3 — ASR GPU ROBUST INSTALL FIX')
    run('ace-step-real-music-v2-speed-quality-upgrade-0902.py', 'SONARA VOCAL & LYRICS V3 — RIAVVIO REAL MUSIC V2 + NUOVO TUNNEL')


if __name__ == '__main__':
    main()
