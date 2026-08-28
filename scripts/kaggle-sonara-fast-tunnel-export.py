import os
import re
import subprocess
import time
import urllib.request
from pathlib import Path

WORK = Path('/kaggle/working')
CLOUDFLARED = WORK / 'cloudflared'
CLOUDFLARED_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64'
URLS_FILE = WORK / 'sonara-kaggle-urls.txt'


def ensure_cloudflared():
    if not CLOUDFLARED.exists():
        urllib.request.urlretrieve(CLOUDFLARED_URL, CLOUDFLARED)
        CLOUDFLARED.chmod(0o755)


def start_tunnel(port: int, label: str) -> str:
    log_path = WORK / f'sonara_fast_{label}.log'
    log = open(log_path, 'w', buffering=1)
    proc = subprocess.Popen(
        [str(CLOUDFLARED), 'tunnel', '--no-autoupdate', '--url', f'http://127.0.0.1:{port}'],
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    pattern = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com', re.I)
    deadline = time.time() + 90
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors='ignore')[-4000:] if log_path.exists() else ''
            raise RuntimeError(f'Tunnel {label} terminato: {tail}')
        text = log_path.read_text(errors='ignore') if log_path.exists() else ''
        match = pattern.search(text)
        if match:
            return match.group(0).rstrip('/')
        time.sleep(1)
    raise RuntimeError(f'Timeout tunnel {label}')


print('SONARA fast tunnel export: creo gli URL subito, senza aspettare il warm-up WAN.')
ensure_cloudflared()
music = start_tunnel(7860, 'gpu0_music')
video = start_tunnel(7861, 'gpu1_video')
URLS_FILE.write_text(
    f'GPU0={music}\nGPU1={video}\nACTION=fast-tunnel-export-before-warmup\n',
    encoding='utf-8',
)
print(f'GPU0={music}')
print(f'GPU1={video}')
print(f'Salvato: {URLS_FILE}')
