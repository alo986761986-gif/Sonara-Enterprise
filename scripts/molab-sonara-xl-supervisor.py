import json
import os
import platform
import re
import shutil
import signal
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PY = ROOT / '.venv/bin/python'
MODEL = 'acestep-v15-xl-turbo'
PORT = 8001
WORK = Path('/tmp/sonara-molab-supervisor')
WORK.mkdir(parents=True, exist_ok=True)
URL_FILE = Path('/marimo/SONARA_MOLAB_XL_URL.txt')


def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)


def request_json(url, timeout=12):
    req = urllib.request.Request(url, headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        raw = r.read().decode('utf-8', errors='replace')
        return json.loads(raw) if raw else {}


def health_ready(body):
    if not isinstance(body, dict):
        return False
    data = body.get('data') or body
    return (
        str(data.get('status') or '').lower() == 'ok'
        and data.get('models_initialized') is True
        and MODEL in str(data.get('loaded_model') or '')
    )


def local_ready():
    try:
        return health_ready(request_json(f'http://127.0.0.1:{PORT}/health', 6))
    except Exception:
        return False


def public_ready(url):
    if not url:
        return False
    try:
        return health_ready(request_json(url.rstrip('/') + '/health', 10))
    except Exception:
        return False


def kill_matching(predicate):
    try:
        rows = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
    except Exception:
        return
    me = os.getpid()
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        if pid == me:
            continue
        cmd = parts[1]
        if predicate(cmd.lower()):
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass


def api_env():
    env = os.environ.copy()
    env.update({
        'ACESTEP_CONFIG_PATH': MODEL,
        'ACESTEP_DEVICE': 'cuda',
        'ACESTEP_INIT_LLM': 'false',
        'ACESTEP_USE_FLASH_ATTENTION': 'false',
        'ACESTEP_OFFLOAD_TO_CPU': 'false',
        'ACESTEP_OFFLOAD_DIT_TO_CPU': 'false',
        'ACESTEP_LM_OFFLOAD_TO_CPU': 'false',
        'ACESTEP_NO_INIT': 'false',
        'ACESTEP_API_HOST': '0.0.0.0',
        'ACESTEP_API_PORT': str(PORT),
        'ACESTEP_API_WORKERS': '1',
        'ACESTEP_QUEUE_WORKERS': '1',
        'ACESTEP_QUEUE_MAXSIZE': '64',
        'ACESTEP_DOWNLOAD_SOURCE': 'huggingface',
        'TOKENIZERS_PARALLELISM': 'false',
        'MPLBACKEND': 'Agg',
        'PYTHONUNBUFFERED': '1',
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
    })
    return env


def start_api():
    if not ROOT.exists() or not PY.exists():
        raise RuntimeError('Ambiente CLEAN non trovato. Esegui prima il clean bootstrap.')
    if local_ready():
        log('ACE-Step API gia pronta su 8001.')
        return None

    kill_matching(lambda c: ('acestep.api_server' in c or 'acestep-api' in c) and '8001' in c)
    time.sleep(2)

    log_path = WORK / 'api.log'
    log_handle = open(log_path, 'w', buffering=1)
    cmd = [str(PY), '-m', 'acestep.api_server', '--host', '0.0.0.0', '--port', str(PORT), '--download-source', 'huggingface']
    proc = subprocess.Popen(cmd, cwd=str(ROOT), env=api_env(), stdout=log_handle, stderr=subprocess.STDOUT, start_new_session=True)
    log(f'Avvio ACE-Step API PID={proc.pid}')

    deadline = time.time() + 1800
    while time.time() < deadline:
        if local_ready():
            log('ACE-Step XL-Turbo locale PRONTO.')
            return proc
        if proc.poll() is not None:
            tail = log_path.read_text(errors='ignore')[-16000:] if log_path.exists() else ''
            raise RuntimeError('API terminata durante avvio:\n' + tail)
        time.sleep(3)
    raise RuntimeError('Timeout avvio ACE-Step API')


def cloudflared_binary():
    for c in [Path('/tmp/cloudflared'), WORK / 'cloudflared']:
        if c.exists() and os.access(c, os.X_OK):
            return c
    arch = 'arm64' if platform.machine().lower() in {'arm64', 'aarch64'} else 'amd64'
    target = WORK / 'cloudflared'
    urllib.request.urlretrieve(
        f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}',
        target,
    )
    target.chmod(0o755)
    return target


def current_tunnel_from_logs():
    for p in [WORK / 'cloudflare.log', Path('/tmp/sonara-molab-clean/cloudflare.log')]:
        if p.exists():
            m = re.findall(r'https://[a-z0-9-]+\.trycloudflare\.com', p.read_text(errors='ignore'), re.I)
            if m:
                return m[-1].rstrip('/')
    return None


def start_tunnel():
    old = current_tunnel_from_logs()
    if old and public_ready(old):
        URL_FILE.write_text(old + '\n', encoding='utf-8')
        log('Tunnel Cloudflare esistente ancora valido: ' + old)
        return None, old

    kill_matching(lambda c: 'cloudflared' in c and '8001' in c)
    time.sleep(2)

    binary = cloudflared_binary()
    log_path = WORK / 'cloudflare.log'
    log_handle = open(log_path, 'w', buffering=1)
    proc = subprocess.Popen(
        [str(binary), 'tunnel', '--no-autoupdate', '--url', f'http://127.0.0.1:{PORT}'],
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    log(f'Avvio Cloudflare PID={proc.pid}')

    pat = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com', re.I)
    deadline = time.time() + 180
    while time.time() < deadline:
        text = log_path.read_text(errors='ignore') if log_path.exists() else ''
        m = pat.search(text)
        if m:
            url = m.group(0).rstrip('/')
            pub_deadline = time.time() + 120
            while time.time() < pub_deadline:
                if public_ready(url):
                    URL_FILE.write_text(url + '\n', encoding='utf-8')
                    log('Tunnel pubblico PRONTO: ' + url)
                    return proc, url
                time.sleep(2)
            raise RuntimeError('Nuovo tunnel creato ma /health non raggiungibile: ' + url)
        if proc.poll() is not None:
            tail = log_path.read_text(errors='ignore')[-12000:] if log_path.exists() else ''
            raise RuntimeError('Cloudflare terminato durante avvio:\n' + tail)
        time.sleep(1)
    raise RuntimeError('Nessun URL Cloudflare generato')


def banner(url):
    print('\n' + '=' * 82)
    print(' ✅ SONARA MOLAB XL-TURBO SUPERVISOR ATTIVO ')
    print('=' * 82)
    print('SONARA_MOLAB_XL_URL=' + url)
    print('MODEL=' + MODEL)
    print('LOCAL_PORT=' + str(PORT))
    print('CLEAN_ROOT=' + str(ROOT))
    print('WATCHDOG=ON')
    print('=' * 82)
    print('QUESTA CELLA DEVE RESTARE IN ESECUZIONE. Il watchdog riavvia API/tunnel se cadono.', flush=True)


def main():
    log('SONARA MoLab supervisor avviato.')
    api_proc = None
    tunnel_proc = None
    public_url = None
    local_failures = 0
    public_failures = 0
    last_heartbeat = 0

    while True:
        try:
            if not local_ready():
                local_failures += 1
            else:
                local_failures = 0

            if api_proc is not None and api_proc.poll() is not None:
                local_failures = 3

            if local_failures >= 3:
                log('API non sana: riavvio automatico.')
                try:
                    api_proc = start_api()
                    local_failures = 0
                except Exception as exc:
                    log('ERRORE riavvio API: ' + repr(exc))
                    time.sleep(10)
                    continue

            if not local_ready():
                try:
                    api_proc = start_api()
                except Exception as exc:
                    log('API ancora non pronta: ' + repr(exc))
                    time.sleep(10)
                    continue

            if not public_url or not public_ready(public_url):
                public_failures += 1
            else:
                public_failures = 0

            if tunnel_proc is not None and tunnel_proc.poll() is not None:
                public_failures = 3

            if not public_url or public_failures >= 3:
                old_url = public_url
                log('Tunnel non sano: riavvio automatico.')
                try:
                    tunnel_proc, public_url = start_tunnel()
                    public_failures = 0
                    banner(public_url)
                    if old_url and old_url != public_url:
                        print('\n!!! URL CLOUDFLARE CAMBIATO !!!')
                        print('SONARA_MOLAB_XL_URL_CHANGED=' + public_url)
                        print('INVIAMI QUESTO NUOVO URL PER RICOLLEGARE SONARA.\n', flush=True)
                except Exception as exc:
                    log('ERRORE riavvio tunnel: ' + repr(exc))
                    time.sleep(10)
                    continue

            now = time.time()
            if now - last_heartbeat >= 60:
                log('HEARTBEAT OK | API=UP | TUNNEL=UP | ' + str(public_url))
                last_heartbeat = now

            time.sleep(10)
        except KeyboardInterrupt:
            log('Supervisor fermato manualmente.')
            break
        except Exception as exc:
            log('WATCHDOG ha intercettato un errore e continua: ' + repr(exc))
            time.sleep(10)


if __name__ == '__main__':
    main()
