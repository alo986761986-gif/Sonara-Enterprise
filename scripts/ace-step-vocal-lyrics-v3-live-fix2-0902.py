#!/usr/bin/env python3
from __future__ import annotations

import urllib.request

FIX_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/'
    'e69f23f0f9c1f5c7d519bec28cd9a95855fc9bbd/'
    'scripts/ace-step-vocal-asr-v3-install-fix-0902.py'
)
V2_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/'
    'f9c5419b8ce547db3223e7a3803f3367a28b7dfd/'
    'scripts/ace-step-real-music-v2-speed-quality-upgrade-0902.py'
)


def run_url(url: str, label: str, source_name: str) -> None:
    print('\n' + '=' * 96, flush=True)
    print(label, flush=True)
    print('=' * 96, flush=True)
    print('SOURCE=' + url, flush=True)
    request = urllib.request.Request(
        url,
        headers={
            'Cache-Control': 'no-cache, no-store, max-age=0',
            'Pragma': 'no-cache',
            'User-Agent': 'SONARA-VOCAL-V3-FIX2/1.0',
        },
    )
    code = urllib.request.urlopen(request, timeout=90).read().decode('utf-8')
    namespace = {'__name__': '__main__'}
    exec(compile(code, f'<{source_name}>', 'exec'), namespace)


def main() -> None:
    print('SONARA_VOCAL_LYRICS_V3_CACHE_PROOF_FIX=START', flush=True)
    run_url(
        FIX_URL,
        'SONARA VOCAL & LYRICS V3 — UV/CUDA ASR INSTALL FIX',
        'ace-step-vocal-asr-v3-install-fix-0902.py',
    )
    run_url(
        V2_URL,
        'SONARA VOCAL & LYRICS V3 — REAL MUSIC V2 RESTART + NEW TUNNEL',
        'ace-step-real-music-v2-speed-quality-upgrade-0902.py',
    )


if __name__ == '__main__':
    main()
