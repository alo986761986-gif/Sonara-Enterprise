import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

BASE = Path('/kaggle/working/ACE-Step-1.5')
WORK = Path('/kaggle/working')
REPO_RAW = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main'
SELF_HEAL_URL = f'{REPO_RAW}/scripts/kaggle-sonara-t4-self-heal.py'
WAN_URL = (
    'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/'
    'db9134f6e71a8d64a62340267e7583ffe29c54d3/scripts/kaggle-sonara-wan21-video-worker.py'
)
CLOUDFLARED_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64'
CLOUDFLARED = WORK / 'cloudflared'
MUSIC_PORT = 7860
VIDEO_PORT = 7861
URLS_FILE = WORK / 'sonara-kaggle-urls.txt'


def run(cmd, *, cwd=None, env=None, check=True):
    print('+', ' '.join(map(str, cmd)), flush=True)
    return subprocess.run(list(map(str, cmd)), cwd=cwd, env=env, check=check)


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    print(f'Download: {url}', flush=True)
    urllib.request.urlretrieve(url, target)


def kill_matching_processes() -> None:
    print('\n[1/8] Arresto completo dei vecchi runtime SONARA/Kaggle...', flush=True)
    try:
        rows = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
    except Exception:
        return

    patterns = (
        'acestep',
        'sonara-wan21-video',
        'uvicorn app:app',
        'cloudflared tunnel',
    )
    pids = []
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        if pid == os.getpid():
            continue
        command = parts[1].lower()
        if any(pattern in command for pattern in patterns):
            pids.append(pid)

    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
    if pids:
        time.sleep(3)
    for pid in pids:
        try:
            os.kill(pid, 0)
            os.kill(pid, signal.SIGKILL)
        except Exception:
            pass
    print(f'Processi precedenti fermati: {len(pids)}', flush=True)


def ensure_two_t4s() -> None:
    print('\n[2/8] Verifica GPU Kaggle...', flush=True)
    output = subprocess.check_output(['nvidia-smi', '-L'], text=True)
    print(output, flush=True)
    gpus = [line for line in output.splitlines() if line.strip().startswith('GPU ')]
    if len(gpus) < 2:
        raise RuntimeError(
            'Servono 2 GPU Kaggle T4 per questa configurazione: GPU0=musica, GPU1=video. '
            f'GPU rilevate: {len(gpus)}.'
        )


def ensure_acestep_install() -> None:
    print('\n[3/8] Verifica/installazione ACE-Step 1.5...', flush=True)
    if not BASE.exists():
        run(['git', 'clone', '--depth', '1', 'https://github.com/ace-step/ACE-Step-1.5.git', str(BASE)])
    else:
        print(f'ACE-Step gia presente: {BASE}', flush=True)

    uv = shutil.which('uv')
    if not uv:
        run([sys.executable, '-m', 'pip', 'install', '-q', '--upgrade', 'uv'])
        uv = shutil.which('uv') or '/usr/local/bin/uv'

    venv_python = BASE / '.venv/bin/python'
    if not venv_python.exists():
        run([uv, 'sync', '--frozen', '--no-dev'], cwd=str(BASE))
    if not venv_python.exists():
        raise RuntimeError('ACE-Step .venv non creato correttamente.')


def start_music_runtime() -> None:
    print('\n[4/8] Avvio ACE-Step musica; al termine GPU0 restera dedicata alla musica...', flush=True)
    script = WORK / 'kaggle-sonara-t4-self-heal.py'
    download(SELF_HEAL_URL, script)
    run([sys.executable, str(script)])


def start_video_runtime() -> None:
    print('\n[5/8] Libero GPU1 dalla musica e avvio WAN 2.1 Video AI...', flush=True)
    script = WORK / 'kaggle-sonara-wan21-video-worker.py'
    download(WAN_URL, script)
    run([sys.executable, str(script)])


def ensure_cloudflared() -> None:
    if CLOUDFLARED.exists():
        CLOUDFLARED.chmod(0o755)
        return
    download(CLOUDFLARED_URL, CLOUDFLARED)
    CLOUDFLARED.chmod(0o755)


def wait_local_health(port: int, *, video: bool, timeout: int = 120) -> dict:
    deadline = time.time() + timeout
    last = ''
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=5) as response:
                payload = json.loads(response.read().decode('utf-8', errors='ignore'))
                last = json.dumps(payload)
                status = str(payload.get('status') or payload.get('data', {}).get('status') or '').lower()
                code = payload.get('code')
                if video:
                    if response.status == 200 and status == 'ok' and 'wan' in str(payload.get('provider', '')).lower():
                        return payload
                elif response.status == 200 and (status in {'ok', 'ready', 'healthy', 'online', 'success'} or code == 200):
                    return payload
        except Exception as exc:
            last = str(exc)
        time.sleep(3)
    raise RuntimeError(f'Health locale porta {port} non pronta. Ultimo risultato: {last}')


def start_tunnel(port: int, label: str) -> tuple[subprocess.Popen, str]:
    log_path = WORK / f'sonara_cloudflared_{label}.log'
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
            tail = log_path.read_text(errors='ignore')[-6000:] if log_path.exists() else ''
            raise RuntimeError(f'Tunnel {label} terminato: {tail}')
        text = log_path.read_text(errors='ignore') if log_path.exists() else ''
        match = pattern.search(text)
        if match:
            return proc, match.group(0).rstrip('/')
        time.sleep(2)
    tail = log_path.read_text(errors='ignore')[-6000:] if log_path.exists() else ''
    raise RuntimeError(f'Timeout creazione tunnel {label}: {tail}')


def public_health(base: str, *, video: bool, timeout: int = 90) -> dict:
    deadline = time.time() + timeout
    last = ''
    while time.time() < deadline:
        try:
            req = urllib.request.Request(base + '/health', headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req, timeout=15) as response:
                payload = json.loads(response.read().decode('utf-8', errors='ignore'))
                last = json.dumps(payload)
                status = str(payload.get('status') or payload.get('data', {}).get('status') or '').lower()
                code = payload.get('code')
                if video:
                    if response.status == 200 and status == 'ok' and 'wan' in str(payload.get('provider', '')).lower():
                        return payload
                elif response.status == 200 and (status in {'ok', 'ready', 'healthy', 'online', 'success'} or code == 200):
                    return payload
        except Exception as exc:
            last = str(exc)
        time.sleep(3)
    raise RuntimeError(f'Endpoint pubblico non sano: {base}. Ultimo risultato: {last}')


def main() -> None:
    print('=' * 84)
    print(' SONARA KAGGLE CLEAN RESTART - GPU0 MUSIC + GPU1 WAN VIDEO AI ')
    print('=' * 84)
    print('Questa procedura cancella i vecchi processi runtime e crea due tunnel nuovi.', flush=True)

    kill_matching_processes()
    ensure_two_t4s()
    ensure_acestep_install()
    start_music_runtime()
    start_video_runtime()

    print('\n[6/8] Verifica servizi locali separati...', flush=True)
    music_local = wait_local_health(MUSIC_PORT, video=False)
    video_local = wait_local_health(VIDEO_PORT, video=True)
    print('GPU0 music local health:', json.dumps(music_local, ensure_ascii=False), flush=True)
    print('GPU1 video local health:', json.dumps(video_local, ensure_ascii=False), flush=True)

    print('\n[7/8] Creazione di due tunnel Cloudflare NUOVI...', flush=True)
    ensure_cloudflared()
    _, music_url = start_tunnel(MUSIC_PORT, 'gpu0_music')
    _, video_url = start_tunnel(VIDEO_PORT, 'gpu1_video')

    print('\n[8/8] Verifica pubblica dei nuovi tunnel...', flush=True)
    music_public = public_health(music_url, video=False)
    video_public = public_health(video_url, video=True)

    URLS_FILE.write_text(
        f'GPU0={music_url}\nGPU1={video_url}\nACTION=clean-restart-kaggle-music-video\n',
        encoding='utf-8',
    )

    print('\n' + '=' * 84)
    print(' ✅ SONARA KAGGLE RIPARTITO DA ZERO ')
    print('=' * 84)
    print(f'GPU0 MUSICA ACE-STEP : {music_url}')
    print(f'GPU1 VIDEO WAN 2.1   : {video_url}')
    print('Musica health         : OK')
    print('Video health          : OK')
    print(f'URL salvati in        : {URLS_FILE}')
    print()
    print('COPIA QUI IN CHAT ESATTAMENTE QUESTE DUE RIGHE:')
    print(f'GPU0={music_url}')
    print(f'GPU1={video_url}')
    print()
    print('Poi Sonara puo aggiornare automaticamente Cloudflare e verificare produzione.')
    print('=' * 84)


if __name__ == '__main__':
    main()
