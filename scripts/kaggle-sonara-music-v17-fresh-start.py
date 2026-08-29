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

WORK = Path('/kaggle/working')
BASE = WORK / 'ACE-Step-1.5'
V17 = WORK / 'sonara-music-v17-runtime.py'
PORT = 7860
REPO_RAW = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main'
V17_URL = f'{REPO_RAW}/scripts/kaggle-sonara-music-v17-gpu0-lm.py'
CLOUDFLARED_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64'
CLOUDFLARED = WORK / 'cloudflared'
TUNNEL_LOG = WORK / 'sonara_cloudflared_gpu0_v17.log'
RUNTIME_STDOUT = WORK / 'sonara_v17_runtime_bootstrap.log'


def run(cmd, *, cwd=None, env=None):
    print('+', ' '.join(map(str, cmd)), flush=True)
    subprocess.run(list(map(str, cmd)), cwd=cwd, env=env, check=True)


def download(url: str, target: Path):
    target.parent.mkdir(parents=True, exist_ok=True)
    print(f'Download: {url}', flush=True)
    urllib.request.urlretrieve(url, target)


def gpu_check():
    print('\n[1/6] Verifica GPU0 Kaggle...', flush=True)
    try:
        out = subprocess.check_output(['nvidia-smi', '-L'], text=True)
    except Exception as exc:
        raise RuntimeError('GPU Kaggle non disponibile. Attiva un acceleratore GPU nel notebook.') from exc
    print(out, flush=True)
    if 'GPU 0:' not in out:
        raise RuntimeError('GPU0 non rilevata da nvidia-smi.')


def ensure_acestep():
    print('\n[2/6] Installazione/verifica ACE-Step 1.5...', flush=True)
    if BASE.exists() and not (BASE / 'pyproject.toml').exists():
        print('Installazione ACE-Step incompleta: la ricreo.', flush=True)
        shutil.rmtree(BASE, ignore_errors=True)

    if not BASE.exists():
        run(['git', 'clone', '--depth', '1', 'https://github.com/ace-step/ACE-Step-1.5.git', str(BASE)])
    else:
        print(f'ACE-Step gia presente: {BASE}', flush=True)

    uv = shutil.which('uv')
    if not uv:
        run([sys.executable, '-m', 'pip', 'install', '-q', '--upgrade', 'uv'])
        uv = shutil.which('uv') or '/usr/local/bin/uv'

    try:
        import wrapt  # noqa: F401
    except Exception:
        run([sys.executable, '-m', 'pip', 'install', '-q', 'wrapt'])

    api_bin = BASE / '.venv/bin/acestep-api'
    if not api_bin.exists():
        print('Creo ambiente ACE-Step; al primo avvio puo richiedere alcuni minuti...', flush=True)
        run([uv, 'sync', '--frozen', '--no-dev'], cwd=str(BASE))
    if not api_bin.exists():
        raise RuntimeError('Installazione ACE-Step fallita: acestep-api non trovato nella .venv.')
    print('ACE-Step + acestep-api: OK', flush=True)


def start_v17():
    print('\n[3/6] Avvio SONARA Music V17 + 5Hz LM su GPU0...', flush=True)
    download(V17_URL, V17)
    with open(RUNTIME_STDOUT, 'w', buffering=1) as log:
        result = subprocess.run(
            [sys.executable, str(V17)],
            stdout=log,
            stderr=subprocess.STDOUT,
            text=True,
            check=False,
        )
    if result.returncode != 0:
        text = RUNTIME_STDOUT.read_text(errors='ignore') if RUNTIME_STDOUT.exists() else ''
        tail = text[-30000:]
        print('\n' + '=' * 82)
        print('❌ ERRORE INTERNO SONARA V17 - DETTAGLIO AUTOMATICO')
        print('=' * 82)
        print(tail)
        print('=' * 82)
        raise RuntimeError(f'Runtime V17 terminato con codice {result.returncode}. Vedi dettaglio sopra.')
    if RUNTIME_STDOUT.exists():
        print(RUNTIME_STDOUT.read_text(errors='ignore')[-12000:], flush=True)


def local_inventory():
    print('\n[4/6] Verifica locale V17...', flush=True)
    with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/health', timeout=10) as response:
        health = json.loads(response.read().decode('utf-8'))
    with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/v1/models', timeout=15) as response:
        models = json.loads(response.read().decode('utf-8'))
    data = models.get('data') or models
    if not data.get('llm_initialized'):
        raise RuntimeError('5Hz LM non risulta inizializzato: ' + json.dumps(data, ensure_ascii=False)[:2000])
    if '0.6B' not in str(data.get('loaded_lm_model') or ''):
        raise RuntimeError('Modello LM inatteso: ' + repr(data.get('loaded_lm_model')))
    if 'acestep-v15-turbo' not in json.dumps(data):
        raise RuntimeError('acestep-v15-turbo non presente nell inventory.')
    print('Health locale : OK', flush=True)
    print('Turbo         : OK', flush=True)
    print('5Hz LM 0.6B   : ATTIVO', flush=True)
    return health, data


def stop_only_gpu0_tunnels():
    try:
        rows = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
    except Exception:
        return
    pids = []
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        cmd = parts[1].lower()
        if 'cloudflared' in cmd and ('127.0.0.1:7860' in cmd or 'localhost:7860' in cmd):
            pids.append(pid)
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
    if pids:
        time.sleep(2)
    print(f'Vecchi tunnel GPU0 fermati: {len(pids)}', flush=True)


def ensure_cloudflared():
    if not CLOUDFLARED.exists():
        download(CLOUDFLARED_URL, CLOUDFLARED)
    CLOUDFLARED.chmod(0o755)


def start_tunnel():
    print('\n[5/6] Creo NUOVO tunnel pubblico GPU0...', flush=True)
    stop_only_gpu0_tunnels()
    ensure_cloudflared()
    log = open(TUNNEL_LOG, 'w', buffering=1)
    proc = subprocess.Popen(
        [str(CLOUDFLARED), 'tunnel', '--no-autoupdate', '--url', f'http://127.0.0.1:{PORT}'],
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    pattern = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com', re.I)
    deadline = time.time() + 120
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = TUNNEL_LOG.read_text(errors='ignore')[-6000:] if TUNNEL_LOG.exists() else ''
            raise RuntimeError(f'Tunnel GPU0 terminato: {tail}')
        text = TUNNEL_LOG.read_text(errors='ignore') if TUNNEL_LOG.exists() else ''
        match = pattern.search(text)
        if match:
            return proc, match.group(0).rstrip('/')
        time.sleep(2)
    tail = TUNNEL_LOG.read_text(errors='ignore')[-6000:] if TUNNEL_LOG.exists() else ''
    raise RuntimeError(f'Timeout creazione tunnel GPU0: {tail}')


def verify_public(base: str):
    print('\n[6/6] Verifica pubblica tunnel GPU0...', flush=True)
    deadline = time.time() + 120
    last = ''
    while time.time() < deadline:
        try:
            req = urllib.request.Request(base + '/health', headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req, timeout=15) as response:
                payload = json.loads(response.read().decode('utf-8'))
                data = payload.get('data') or payload
                last = json.dumps(payload, ensure_ascii=False)
                if response.status == 200 and str(data.get('status') or '').lower() == 'ok':
                    if data.get('llm_initialized') is True and '0.6B' in str(data.get('loaded_lm_model') or ''):
                        return payload
        except Exception as exc:
            last = repr(exc)
        time.sleep(3)
    raise RuntimeError(f'Tunnel GPU0 non verificato: {base}. Ultimo risultato: {last}')


def main():
    print('=' * 82)
    print(' SONARA MUSIC V17 - FRESH KAGGLE BOOTSTRAP / GPU0 ONLY / GPU1 SAFE ')
    print('=' * 82)
    gpu_check()
    ensure_acestep()
    start_v17()
    _, inventory = local_inventory()
    _, gpu0_url = start_tunnel()
    verify_public(gpu0_url)

    out = WORK / 'sonara-music-v17-gpu0-url.txt'
    out.write_text(f'GPU0={gpu0_url}\n', encoding='utf-8')

    print('\n' + '=' * 82)
    print('✅ SONARA MUSIC V17 KAGGLE PRONTA')
    print('=' * 82)
    print('GPU0 Music       : ONLINE')
    print('Server           : acestep-api asincrono')
    print('Model            : acestep-v15-turbo')
    print('5Hz LM           : acestep-5Hz-lm-0.6B ATTIVO')
    print('Thinking/CoT     : ATTIVO')
    print('GPU1 Video       : NON TOCCATA')
    print('Tunnel GPU0      : VERIFICATO')
    print(f'GPU0={gpu0_url}')
    print('=' * 82)
    print('\nCOPIA QUI IN CHAT SOLTANTO LA RIGA GPU0=...')
    print(json.dumps({'llm_initialized': inventory.get('llm_initialized'), 'loaded_lm_model': inventory.get('loaded_lm_model')}, ensure_ascii=False))


if __name__ == '__main__':
    main()
