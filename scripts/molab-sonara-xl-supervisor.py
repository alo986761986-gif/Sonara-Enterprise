import json
import os
import platform
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

STABLE_HOSTNAME = 'molab.sonaraenterprise.com'
STABLE_URL = 'https://' + STABLE_HOSTNAME
TUNNEL_NAME = 'sonara-molab-xl'
CF_HOME = Path('/marimo/.cloudflared')
CF_CONFIG = CF_HOME / 'config.yml'
PUBLIC_FAILURE_LIMIT = 6


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


def public_ready(url=STABLE_URL):
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


def terminate_process(proc):
    if proc is None or proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except Exception:
        try:
            proc.terminate()
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
    for c in [CF_HOME / 'cloudflared', Path('/tmp/cloudflared'), WORK / 'cloudflared']:
        if c.exists() and os.access(c, os.X_OK):
            return c
    arch = 'arm64' if platform.machine().lower() in {'arm64', 'aarch64'} else 'amd64'
    CF_HOME.mkdir(parents=True, exist_ok=True)
    target = CF_HOME / 'cloudflared'
    urllib.request.urlretrieve(
        f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}',
        target,
    )
    target.chmod(0o755)
    return target


def stable_tunnel_configured():
    if not CF_CONFIG.exists():
        return False
    text = CF_CONFIG.read_text(errors='ignore')
    return STABLE_HOSTNAME in text and 'credentials-file:' in text and 'tunnel:' in text


def start_tunnel():
    if not stable_tunnel_configured():
        raise RuntimeError(
            'Named Tunnel SONARA non configurato. Esegui prima scripts/molab-sonara-xl-stable-tunnel-setup.py una sola volta.'
        )

    if public_ready(STABLE_URL):
        URL_FILE.write_text(STABLE_URL + '\n', encoding='utf-8')
        log('Named Tunnel SONARA gia raggiungibile: ' + STABLE_URL)
        return None, STABLE_URL

    kill_matching(lambda c: 'cloudflared' in c and ('sonara-molab-xl' in c or str(CF_CONFIG).lower() in c))
    time.sleep(2)

    binary = cloudflared_binary()
    log_path = WORK / 'cloudflare.log'
    log_handle = open(log_path, 'w', buffering=1)
    proc = subprocess.Popen(
        [str(binary), 'tunnel', '--no-autoupdate', '--config', str(CF_CONFIG), 'run', TUNNEL_NAME],
        stdout=log_handle,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    log(f'Avvio Named Tunnel Cloudflare PID={proc.pid}')

    deadline = time.time() + 180
    while time.time() < deadline:
        if public_ready(STABLE_URL):
            URL_FILE.write_text(STABLE_URL + '\n', encoding='utf-8')
            log('Named Tunnel pubblico PRONTO: ' + STABLE_URL)
            return proc, STABLE_URL
        if proc.poll() is not None:
            tail = log_path.read_text(errors='ignore')[-12000:] if log_path.exists() else ''
            raise RuntimeError('Named Tunnel Cloudflare terminato durante avvio:\n' + tail)
        time.sleep(2)
    raise RuntimeError('Named Tunnel avviato ma /health non raggiungibile su ' + STABLE_URL)


def banner(url):
    print('\n' + '=' * 82)
    print(' ✅ SONARA MOLAB XL-TURBO - ON DEMAND ')
    print('=' * 82)
    print('SONARA_MOLAB_XL_URL=' + url)
    print('MODEL=' + MODEL)
    print('LOCAL_PORT=' + str(PORT))
    print('TUNNEL_MODE=NAMED_STABLE')
    print('TUNNEL_NAME=' + TUNNEL_NAME)
    print('ON_DEMAND=YES')
    print('WATCHDOG=ON')
    print('=' * 82)
    print('LASCIA QUESTA CELLA ATTIVA SOLO MENTRE VUOI USARE MOLAB.')
    print('QUANDO HAI FINITO, FERMA LA CELLA: SONARA MANTERRA LO STESSO URL PER IL PROSSIMO AVVIO.', flush=True)


def main():
    log('SONARA MoLab supervisor ON-DEMAND avviato.')
    api_proc = None
    tunnel_proc = None
    public_url = STABLE_URL
    local_failures = 0
    public_failures = 0
    last_heartbeat = 0

    try:
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
                    api_proc = start_api()
                    local_failures = 0

                if not local_ready():
                    api_proc = start_api()

                if not public_ready(public_url):
                    public_failures += 1
                else:
                    public_failures = 0

                if tunnel_proc is not None and tunnel_proc.poll() is not None:
                    public_failures = PUBLIC_FAILURE_LIMIT

                if public_failures >= PUBLIC_FAILURE_LIMIT:
                    log('Named Tunnel non sano: riavvio sullo STESSO hostname.')
                    tunnel_proc, public_url = start_tunnel()
                    public_failures = 0
                    banner(public_url)

                if tunnel_proc is None and not public_ready(public_url):
                    tunnel_proc, public_url = start_tunnel()
                    banner(public_url)

                now = time.time()
                if now - last_heartbeat >= 60:
                    api_state = 'UP' if local_ready() else 'DOWN'
                    tunnel_state = 'UP' if public_ready(public_url) else 'DOWN'
                    log(f'HEARTBEAT | API={api_state} | TUNNEL={tunnel_state} | {public_url}')
                    last_heartbeat = now

                time.sleep(10)
            except Exception as exc:
                log('WATCHDOG ha intercettato un errore e continua: ' + repr(exc))
                time.sleep(10)
    except KeyboardInterrupt:
        log('Supervisor fermato manualmente.')
    finally:
        terminate_process(tunnel_proc)
        terminate_process(api_proc)
        log('MoLab ON-DEMAND arrestato. URL stabile conservato: ' + STABLE_URL)


if __name__ == '__main__':
    main()
