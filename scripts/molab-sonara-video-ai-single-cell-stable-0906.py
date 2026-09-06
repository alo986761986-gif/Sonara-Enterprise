#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-VIDEO-AI-WAN22')
READY = ROOT / 'SONARA_VIDEO_AI_READY.json'
TOKEN_FILE = ROOT / '.sonara-video-token'
VIDEO_PORT = 7862
MUSIC_PORT = 8001
BASE_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/'
    'scripts/molab-sonara-wan22-video-worker.py?stable=20260906-v2'
)
FIX_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/'
    'scripts/molab-sonara-wan22-black-video-fix-v5-0902.py?stable=20260906-v2'
)


def fetch(url: str, name: str) -> Path:
    target = Path(tempfile.gettempdir()) / name
    req = urllib.request.Request(url, headers={'User-Agent': 'SONARA-VIDEO-STABLE/2.0'})
    with urllib.request.urlopen(req, timeout=120) as r:
        target.write_bytes(r.read())
    return target


def port_open(port: int) -> bool:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.3)
    try:
        return s.connect_ex(('127.0.0.1', port)) == 0
    finally:
        s.close()


def show_gpu() -> None:
    print('=' * 104, flush=True)
    print('SONARA RTX 6000 PRO | ACE-STEP MUSIC + WAN 2.2 VIDEO AI | SINGLE CELL STABLE', flush=True)
    print('=' * 104, flush=True)
    try:
        value = subprocess.check_output(
            ['nvidia-smi', '--query-gpu=name,memory.total,memory.used,memory.free', '--format=csv,noheader,nounits'],
            text=True, timeout=15,
        ).strip()
        print('GPU=' + value, flush=True)
    except Exception as exc:
        print(f'GPU_PROBE_WARNING={exc}', flush=True)
    print(f'MUSIC_PORT_{MUSIC_PORT}=' + ('UP' if port_open(MUSIC_PORT) else 'DOWN'), flush=True)
    print(f'VIDEO_PORT_{VIDEO_PORT}=' + ('UP' if port_open(VIDEO_PORT) else 'DOWN'), flush=True)


def ready_payload() -> dict:
    if not READY.exists():
        return {}
    try:
        return json.loads(READY.read_text(encoding='utf-8'))
    except Exception:
        return {}


def wait_base(proc: subprocess.Popen) -> dict:
    deadline = time.time() + 7200
    last = {}
    while time.time() < deadline:
        last = ready_payload()
        url = str(last.get('url') or '').strip()
        if url and port_open(VIDEO_PORT):
            return last
        if proc.poll() is not None:
            raise RuntimeError(f'Bootstrap Video AI terminato prima del READY (rc={proc.returncode}).')
        time.sleep(3)
    raise RuntimeError(f'Timeout bootstrap Video AI: {last!r}')


def main() -> None:
    show_gpu()
    if not port_open(MUSIC_PORT):
        print('WARNING: ACE-Step musica non risponde sulla porta 8001; Video AI parte comunque.', flush=True)

    base = fetch(BASE_URL, 'sonara_video_base_stable_0906.py')
    print('VIDEO_AI_BOOTSTRAP=STARTING', flush=True)
    # Do NOT terminate this supervisor. It bootstraps API+tunnel; V5 will replace
    # only the API listener while preserving the public tunnel and token files.
    base_proc = subprocess.Popen([sys.executable, str(base)], start_new_session=True)
    ready = wait_base(base_proc)

    public_url = str(ready.get('url') or '').strip()
    token = TOKEN_FILE.read_text(encoding='utf-8').strip() if TOKEN_FILE.exists() else ''
    print('VIDEO_AI_BOOTSTRAP=READY', flush=True)
    print('SONARA_MOLAB_VIDEO_URL=' + public_url, flush=True)
    if token:
        print('SONARA_MOLAB_VIDEO_TOKEN=' + token, flush=True)

    print('VIDEO_AI_QUALITY_FIX_V5=STARTING', flush=True)
    fix = fetch(FIX_URL, 'sonara_video_fix_v5_stable_0906.py')
    code = fix.read_text(encoding='utf-8')
    # V5 becomes the foreground supervisor and intentionally never returns.
    exec(compile(code, str(fix), 'exec'), {'__name__': '__main__', '__file__': str(fix)})


if __name__ == '__main__':
    main()
