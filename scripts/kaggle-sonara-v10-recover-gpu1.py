import json
import os
import re
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

WORK = Path('/kaggle/working')
CLOUDFLARED = WORK / 'cloudflared'
CLOUDFLARED_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64'
V10 = WORK / 'sonara-wan-v10.py'
V10_URL = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/kaggle-sonara-wan21-video-worker-v10.py'
TUNNEL_LOG = WORK / 'sonara_gpu1_v10_tunnel.log'
URL_FILE = WORK / 'sonara-gpu1-url.txt'
PORT = 7861


def download(url: str, target: Path) -> None:
    request = urllib.request.Request(url, headers={'User-Agent': 'SONARA-Kaggle-Recovery/1.0'})
    with urllib.request.urlopen(request, timeout=120) as response:
        target.write_bytes(response.read())


def ensure_cloudflared() -> None:
    if CLOUDFLARED.exists() and os.access(CLOUDFLARED, os.X_OK):
        return
    print('SONARA: preparo il tunnel GPU1...')
    download(CLOUDFLARED_URL, CLOUDFLARED)
    CLOUDFLARED.chmod(0o755)


def start_v10() -> None:
    print('SONARA: avvio/ripristino WAN V10 sulla GPU1...')
    download(V10_URL, V10)
    subprocess.run([sys.executable, str(V10)], check=True)


def wait_local_server() -> dict:
    deadline = time.time() + 150
    last_error = ''
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/health', timeout=4) as response:
                payload = json.loads(response.read().decode('utf-8'))
            if response.status == 200 and str(payload.get('status', '')).lower() == 'ok':
                return payload
        except Exception as exc:
            last_error = str(exc)
        time.sleep(2)
    raise RuntimeError('WAN V10 non ha aperto la porta 7861. ' + last_error)


def stop_only_gpu1_tunnels() -> int:
    try:
        rows = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
    except Exception:
        return 0
    pids = []
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        args = parts[1].lower()
        if pid == os.getpid() or 'cloudflared' not in args:
            continue
        if '127.0.0.1:7861' in args or 'localhost:7861' in args:
            pids.append(pid)
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
    if pids:
        time.sleep(1.5)
    for pid in pids:
        try:
            os.kill(pid, 0)
            os.kill(pid, signal.SIGKILL)
        except Exception:
            pass
    return len(pids)


def start_fresh_tunnel() -> tuple[subprocess.Popen, str]:
    try:
        TUNNEL_LOG.unlink()
    except FileNotFoundError:
        pass
    log = open(TUNNEL_LOG, 'w', buffering=1)
    proc = subprocess.Popen(
        [
            str(CLOUDFLARED), 'tunnel', '--no-autoupdate',
            '--protocol', 'http2',
            '--url', f'http://127.0.0.1:{PORT}',
        ],
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    pattern = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com', re.I)
    deadline = time.time() + 120
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = TUNNEL_LOG.read_text(errors='ignore')[-5000:] if TUNNEL_LOG.exists() else ''
            raise RuntimeError('Cloudflare tunnel GPU1 terminato. ' + tail)
        text = TUNNEL_LOG.read_text(errors='ignore') if TUNNEL_LOG.exists() else ''
        match = pattern.search(text)
        if match:
            return proc, match.group(0).rstrip('/')
        time.sleep(1)
    raise RuntimeError('Cloudflare non ha assegnato un nuovo URL GPU1.')


def verify_public(url: str, proc: subprocess.Popen) -> dict:
    deadline = time.time() + 120
    last_error = ''
    health_url = url + '/health'
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError('Il tunnel GPU1 si e chiuso durante la verifica pubblica.')
        try:
            request = urllib.request.Request(
                health_url,
                headers={'User-Agent': 'SONARA-Kaggle-Recovery/1.0', 'Cache-Control': 'no-cache'},
            )
            with urllib.request.urlopen(request, timeout=12) as response:
                payload = json.loads(response.read().decode('utf-8'))
            if (
                response.status == 200
                and str(payload.get('status', '')).lower() == 'ok'
                and 'wan' in str(payload.get('provider', '')).lower()
            ):
                return payload
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as exc:
            last_error = str(exc)
        time.sleep(3)
    raise RuntimeError('Nuovo tunnel creato ma non raggiungibile pubblicamente. ' + last_error)


def main() -> None:
    print('=' * 72)
    print(' SONARA VIDEO AI - RECOVERY AUTOMATICO GPU1 / WAN V10 ')
    print('=' * 72)
    ensure_cloudflared()
    start_v10()
    local = wait_local_server()
    print('SONARA: WAN locale attiva, profilo:', local.get('profile', 'realtime-hq-exact-t4-v10'))
    stopped = stop_only_gpu1_tunnels()
    if stopped:
        print(f'SONARA: rimossi {stopped} tunnel GPU1 obsoleti; GPU0 musica non toccata.')
    proc, url = start_fresh_tunnel()
    public = verify_public(url, proc)
    URL_FILE.write_text(f'GPU1={url}\n', encoding='utf-8')
    print()
    print('✅ GPU1 VIDEO TUNNEL RIPRISTINATO')
    print(f'GPU1={url}')
    print('Profilo:', public.get('profile', 'WAN V10'))
    print('Il tunnel resta attivo in background. Non chiudere la sessione Kaggle.')


if __name__ == '__main__':
    main()
