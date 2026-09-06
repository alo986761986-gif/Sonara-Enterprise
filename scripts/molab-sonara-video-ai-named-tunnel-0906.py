#!/usr/bin/env python3
from __future__ import annotations

import os
import signal
import subprocess
import time
from pathlib import Path

ROOT = Path('/marimo/SONARA-VIDEO-AI-WAN22')
BIN = ROOT / 'bin' / 'cloudflared'
PORT = 7862
TOKEN = str(os.environ.get('CLOUDFLARE_TUNNEL_TOKEN') or '').strip()
PUBLIC_HOSTNAME = str(os.environ.get('SONARA_VIDEO_PUBLIC_HOSTNAME') or 'video-ai.sonaraenterprise.com').strip()


def port_open(port: int) -> bool:
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.5)
    try:
        return s.connect_ex(('127.0.0.1', port)) == 0
    finally:
        s.close()


def kill_named_tunnel():
    try:
        rows = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
    except Exception:
        return
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        cmd = parts[1].lower()
        if 'cloudflared' in cmd and 'tunnel' in cmd and 'run' in cmd:
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
    time.sleep(2)


def main():
    if not port_open(PORT):
        raise RuntimeError('Video AI locale non attivo sulla porta 7862. Avvia prima il worker Wan 2.2.')
    if not TOKEN:
        raise RuntimeError('CLOUDFLARE_TUNNEL_TOKEN non impostato nel notebook.')
    if not BIN.exists():
        raise RuntimeError(f'cloudflared non trovato in {BIN}')

    kill_named_tunnel()
    log_path = ROOT / 'named-tunnel.log'
    log = log_path.open('a', encoding='utf-8', buffering=1)
    proc = subprocess.Popen(
        [str(BIN), 'tunnel', '--no-autoupdate', 'run', '--token', TOKEN],
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )

    print('=' * 100, flush=True)
    print('SONARA VIDEO AI NAMED TUNNEL STARTED', flush=True)
    print(f'SONARA_MOLAB_VIDEO_URL=https://{PUBLIC_HOSTNAME}', flush=True)
    print('STABLE_URL=YES', flush=True)
    print('QUESTA CELLA DEVE RESTARE ATTIVA.', flush=True)
    print('=' * 100, flush=True)

    while True:
        if proc.poll() is not None:
            tail = log_path.read_text(errors='replace')[-12000:]
            raise RuntimeError(f'Named Tunnel terminato:\n{tail}')
        state = 'UP' if port_open(PORT) else 'API_DOWN'
        print(f"[{time.strftime('%H:%M:%S')}] VIDEO_AI={state} | NAMED_TUNNEL=UP | https://{PUBLIC_HOSTNAME}", flush=True)
        time.sleep(30)


if __name__ == '__main__':
    main()
