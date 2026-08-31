#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import re
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-LeVo2-CLEAN')
PORT = 8022
KEY_PATH = ROOT / 'LEVO2_RESEARCH_API_KEY.txt'
URL_PATH = ROOT / 'SONARA_LEVO2_RESEARCH_URL.txt'
WORKER_PATH = ROOT / 'sonara_levo2_worker_clean.py'
PYTHON = ROOT / 'venv' / 'bin' / 'python'
CLOUDFLARED = ROOT / 'bin' / 'cloudflared'
TUNNEL_LOG = ROOT / 'cloudflared-levo2.log'


def health(key: str) -> dict:
    req = urllib.request.Request(
        f'http://127.0.0.1:{PORT}/health',
        headers={
            'Authorization': f'Bearer {key}',
            'User-Agent': 'SONARA-LeVo2-Tunnel-Recovery/1.0',
        },
    )
    with urllib.request.urlopen(req, timeout=8) as response:
        return json.loads(response.read().decode('utf-8'))


def worker_ready(key: str) -> bool:
    try:
        return health(key).get('ready') is True
    except Exception:
        return False


def start_worker(key: str) -> subprocess.Popen:
    env = os.environ.copy()
    env['LEVO2_ROOT'] = str(ROOT)
    env['LEVO2_RESEARCH_PORT'] = str(PORT)
    env['LEVO2_RESEARCH_API_KEY'] = key
    env['TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD'] = '1'
    env['PYTHONNOUSERSITE'] = '1'
    log_path = ROOT / 'sonara_levo2_worker.log'
    log = log_path.open('a', encoding='utf-8')
    proc = subprocess.Popen(
        [str(PYTHON), str(WORKER_PATH), '--host', '127.0.0.1', '--port', str(PORT)],
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    deadline = time.time() + 45
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f'Worker LeVo2 terminato con exit={proc.returncode}. Controlla {log_path}')
        if worker_ready(key):
            print(f'WORKER=READY | PID={proc.pid}', flush=True)
            return proc
        time.sleep(1)
    raise RuntimeError('Worker LeVo2 non pronto entro 45 secondi.')


def stop_only_levo_tunnel() -> None:
    subprocess.run(
        ['pkill', '-f', f'cloudflared tunnel --url http://127.0.0.1:{PORT}'],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    time.sleep(1)


def launch_tunnel(protocol: str, timeout: int = 55):
    TUNNEL_LOG.write_text('', encoding='utf-8')
    log = TUNNEL_LOG.open('a', encoding='utf-8')
    cmd = [
        str(CLOUDFLARED),
        'tunnel',
        '--url', f'http://127.0.0.1:{PORT}',
        '--no-autoupdate',
        '--protocol', protocol,
        '--loglevel', 'info',
    ]
    print('$ ' + ' '.join(cmd), flush=True)
    proc = subprocess.Popen(
        cmd,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )

    url_pattern = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com')
    deadline = time.time() + timeout
    last_text = ''
    while time.time() < deadline:
        if proc.poll() is not None:
            break
        try:
            text = TUNNEL_LOG.read_text(encoding='utf-8', errors='replace')
        except Exception:
            text = ''
        last_text = text
        match = url_pattern.search(text)
        if match:
            return proc, match.group(0)
        time.sleep(0.5)

    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()

    try:
        last_text = TUNNEL_LOG.read_text(encoding='utf-8', errors='replace')
    except Exception:
        pass
    tail = '\n'.join(last_text.splitlines()[-30:])
    print(f'Protocollo {protocol} non ha prodotto URL. Ultimo log:\n{tail}', flush=True)
    return None, None


def main() -> None:
    print('=' * 88, flush=True)
    print('SONARA LEVO2 - RECOVERY TUNNEL NON BLOCCANTE', flush=True)
    print('=' * 88, flush=True)

    if not KEY_PATH.exists():
        raise RuntimeError(f'Chiave R&D mancante: {KEY_PATH}')
    key = KEY_PATH.read_text(encoding='utf-8').strip()
    if not key:
        raise RuntimeError('Chiave R&D vuota.')
    if not CLOUDFLARED.exists():
        raise RuntimeError(f'cloudflared mancante: {CLOUDFLARED}')
    if not WORKER_PATH.exists() or not PYTHON.exists():
        raise RuntimeError('Worker/venv LeVo2 CLEAN mancanti.')

    worker_proc = None
    if worker_ready(key):
        status = health(key)
        print(
            f"WORKER=READY | ENGINE={status.get('engine')} | ROOT={status.get('root')}",
            flush=True,
        )
    else:
        print('Worker non raggiungibile: lo riavvio senza generazioni.', flush=True)
        worker_proc = start_worker(key)

    stop_only_levo_tunnel()

    tunnel_proc = None
    public_url = None
    for protocol in ('http2', 'quic'):
        tunnel_proc, public_url = launch_tunnel(protocol)
        if public_url:
            break

    if not public_url or tunnel_proc is None:
        raise RuntimeError(
            f'Cloudflare Quick Tunnel non disponibile. Log: {TUNNEL_LOG}'
        )

    URL_PATH.write_text(public_url + '\n', encoding='utf-8')

    print('\n' + '=' * 88, flush=True)
    print('SONARA LEVO2 R&D BRIDGE ATTIVO', flush=True)
    print('=' * 88, flush=True)
    print(f'SONARA_LEVO2_RESEARCH_URL={public_url}', flush=True)
    print(f'LOCAL_PORT={PORT}', flush=True)
    print('MODEL=SongGeneration-v2-large', flush=True)
    print('WORKER=READY', flush=True)
    print('TUNNEL=READY', flush=True)
    print('AUTH=ON (secret hidden)', flush=True)
    print('LICENSE_MODE=RESEARCH_ONLY', flush=True)
    print('GENERATION_TEST=NOT_RUN', flush=True)
    print('QUESTA CELLA DEVE RESTARE IN ESECUZIONE.', flush=True)
    print('=' * 88, flush=True)

    try:
        while True:
            if tunnel_proc.poll() is not None:
                raise RuntimeError(f'Tunnel Cloudflare terminato con exit={tunnel_proc.returncode}')
            ok = worker_ready(key)
            print(
                f"[{time.strftime('%H:%M:%S')}] HEARTBEAT | WORKER={'UP' if ok else 'DOWN'} | TUNNEL=UP | {public_url}",
                flush=True,
            )
            time.sleep(60)
    finally:
        if tunnel_proc.poll() is None:
            tunnel_proc.terminate()
        if worker_proc is not None and worker_proc.poll() is None:
            worker_proc.terminate()


if __name__ == '__main__':
    main()
