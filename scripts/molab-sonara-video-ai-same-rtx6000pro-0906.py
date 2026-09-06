#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-VIDEO-AI-WAN22')
READY = ROOT / 'SONARA_VIDEO_AI_READY.json'
PORT = 7862
MUSIC_PORT = 8001
BASE_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/'
    'scripts/molab-sonara-wan22-video-worker.py?same-notebook=20260906'
)
FIX_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/main/'
    'scripts/molab-sonara-wan22-black-video-fix-v5-0902.py?same-notebook=20260906'
)


def fetch(url: str, name: str) -> Path:
    path = Path(tempfile.gettempdir()) / name
    req = urllib.request.Request(url, headers={'User-Agent': 'SONARA-SAME-RTX6000PRO/1.0'})
    with urllib.request.urlopen(req, timeout=120) as r:
        path.write_bytes(r.read())
    return path


def port_open(port: int) -> bool:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.25)
    try:
        return s.connect_ex(('127.0.0.1', port)) == 0
    finally:
        s.close()


def gpu_snapshot() -> None:
    print('=' * 100, flush=True)
    print('SONARA SAME NOTEBOOK RTX 6000 PRO | MUSIC + VIDEO AI', flush=True)
    print('=' * 100, flush=True)
    try:
        out = subprocess.check_output(
            ['nvidia-smi', '--query-gpu=name,memory.total,memory.used,memory.free', '--format=csv,noheader,nounits'],
            text=True,
            timeout=15,
        ).strip()
        print('GPU=' + out, flush=True)
    except Exception as exc:
        print(f'GPU_PROBE_WARNING={exc}', flush=True)
    print(f'MUSIC_PORT_{MUSIC_PORT}=' + ('UP' if port_open(MUSIC_PORT) else 'DOWN'), flush=True)
    print(f'VIDEO_PORT_{PORT}=' + ('UP' if port_open(PORT) else 'DOWN'), flush=True)


def wait_ready(proc: subprocess.Popen) -> dict:
    deadline = time.time() + 7200
    last = None
    while time.time() < deadline:
        if READY.exists():
            try:
                payload = json.loads(READY.read_text(encoding='utf-8'))
                url = str(payload.get('url') or '').strip()
                if url and port_open(PORT):
                    return payload
            except Exception as exc:
                last = exc
        if proc.poll() is not None:
            raise RuntimeError(f'Worker Video AI base terminato prima del READY (rc={proc.returncode}).')
        time.sleep(3)
    raise RuntimeError(f'Timeout avvio Video AI: {last}')


def main() -> None:
    gpu_snapshot()
    if not port_open(MUSIC_PORT):
        print('ATTENZIONE: ACE-Step musica non risulta in ascolto sulla porta 8001; Video AI verra avviato comunque.', flush=True)

    base = fetch(BASE_URL, 'sonara_wan22_same_notebook_base.py')
    print('VIDEO_AI_BASE=STARTING', flush=True)
    proc = subprocess.Popen([sys.executable, str(base)], start_new_session=True)
    ready = wait_ready(proc)
    print('VIDEO_AI_BASE=READY', flush=True)
    print('SONARA_MOLAB_VIDEO_URL=' + str(ready.get('url') or ''), flush=True)
    print('SONARA_MOLAB_VIDEO_TOKEN=' + str(ready.get('token') or ready.get('apiToken') or ''), flush=True)

    # The base supervisor is only needed for bootstrap. API and Cloudflare are
    # detached child processes, so stop the parent before applying the V5 API hotfix.
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    except Exception:
        try:
            proc.terminate()
        except Exception:
            pass
    time.sleep(2)

    fix = fetch(FIX_URL, 'sonara_wan22_same_notebook_v5.py')
    print('VIDEO_AI_BLACK_FIX_V5=STARTING', flush=True)
    code = fix.read_text(encoding='utf-8')
    exec(compile(code, str(fix), 'exec'), {'__name__': '__main__', '__file__': str(fix)})


if __name__ == '__main__':
    main()
