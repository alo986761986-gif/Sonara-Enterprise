import importlib.util
import json
import os
import platform
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

MODEL = 'acestep-v15-xl-turbo'
PORT_CANDIDATES = [8001, 7860, 8000, 7861, 8080, 8888]
TARGET_PORT = 8001
WORK = Path('/tmp/sonara-molab-xl')
WORK.mkdir(parents=True, exist_ok=True)


def request_json(port: int, path: str, payload=None, timeout=10):
    data = None
    method = 'GET'
    headers = {'Accept': 'application/json', 'Cache-Control': 'no-cache'}
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        method = 'POST'
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(
        f'http://127.0.0.1:{port}{path}',
        data=data,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode('utf-8', errors='replace')
        return response.status, json.loads(raw) if raw else {}


def api_json(port: int, path: str, payload=None, timeout=10):
    try:
        status, body = request_json(port, path, payload=payload, timeout=timeout)
        if status == 200 and isinstance(body, dict):
            return body
    except Exception:
        return None
    return None


def health_data(port: int):
    body = api_json(port, '/health', timeout=5)
    if not body:
        return None
    return body.get('data') or body


def model_inventory(port: int):
    for path in ('/v1/model_inventory', '/v1/models'):
        body = api_json(port, path, timeout=10)
        if body:
            return body.get('data') or body
    return None


def inventory_has_xl(data):
    if not isinstance(data, dict):
        return False
    for key in ('loaded_model', 'default_model', 'model'):
        value = str(data.get(key) or '')
        if MODEL in value:
            return True
    models = data.get('models') or []
    if isinstance(models, list):
        for item in models:
            if not isinstance(item, dict):
                continue
            name = str(item.get('name') or item.get('model') or '')
            if MODEL in name and (item.get('is_loaded') is True or item.get('is_default') is True):
                return True
    return False


def detect_live_api():
    for port in PORT_CANDIDATES:
        health = health_data(port)
        inventory = model_inventory(port)
        if not health and not inventory:
            continue
        service = str((health or {}).get('service') or '')
        status = str((health or {}).get('status') or '')
        if inventory is not None or 'ace-step' in service.lower():
            print(
                f'ACE-Step API rilevata su 127.0.0.1:{port} | '
                f'status={status or "ok"} | xl={inventory_has_xl(inventory)}',
                flush=True,
            )
            return port
    return None


def module_available(python_exe: str):
    try:
        result = subprocess.run(
            [python_exe, '-c', 'import importlib.util; raise SystemExit(0 if importlib.util.find_spec("acestep.api_server") else 1)'],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=20,
        )
        return result.returncode == 0
    except Exception:
        return False


def find_python_runtimes():
    found = []

    def add(value):
        if not value:
            return
        p = Path(value)
        try:
            p = p.resolve()
        except Exception:
            pass
        if p.exists() and os.access(str(p), os.X_OK) and str(p) not in found:
            found.append(str(p))

    add(sys.executable)
    add(shutil.which('python'))
    add(shutil.which('python3'))

    roots = [Path.cwd(), Path.home(), Path('/workspace'), Path('/workspaces'), Path('/app'), Path('/opt'), Path('/tmp')]
    for root in roots:
        if not root.exists():
            continue
        for rel in ('.venv/bin/python', 'venv/bin/python', 'bin/python', '.local/bin/python'):
            add(root / rel)

    # Cerca virtualenv ACE-Step senza presumere il nome/cartella usata su MoLab.
    for root_text in (str(Path.home()), '/workspace', '/workspaces', '/app', '/opt', '/tmp'):
        root = Path(root_text)
        if not root.exists():
            continue
        try:
            result = subprocess.run(
                ['find', root_text, '-maxdepth', '7', '-type', 'f', '-path', '*/bin/python*', '-print'],
                capture_output=True,
                text=True,
                timeout=25,
            )
            for line in result.stdout.splitlines():
                low = line.lower()
                if 'ace' in low or 'step' in low or '.venv' in low or '/venv/' in low:
                    add(line.strip())
        except Exception:
            pass

    return found


def find_source_root():
    env_home = os.environ.get('ACESTEP_HOME', '').strip()
    if env_home:
        p = Path(env_home).expanduser()
        if (p / 'acestep/api_server.py').exists():
            return p

    roots = [Path.cwd(), Path.home(), Path('/workspace'), Path('/workspaces'), Path('/app'), Path('/opt'), Path('/tmp')]
    for root in roots:
        if not root.exists():
            continue
        try:
            result = subprocess.run(
                ['find', str(root), '-maxdepth', '7', '-type', 'f', '-path', '*/acestep/api_server.py', '-print', '-quit'],
                capture_output=True,
                text=True,
                timeout=25,
            )
            candidate = result.stdout.strip().splitlines()
            if candidate:
                return Path(candidate[0]).parent.parent
        except Exception:
            pass
    return None


def find_launcher():
    cli = shutil.which('acestep-api')
    if cli:
        print(f'acestep-api trovato nel PATH: {cli}', flush=True)
        return [cli], None

    for python_exe in find_python_runtimes():
        if module_available(python_exe):
            print(f'Pacchetto ACE-Step trovato in: {python_exe}', flush=True)
            return [python_exe, '-m', 'acestep.api_server'], None

    base = find_source_root()
    if base is not None:
        local_cli = base / '.venv/bin/acestep-api'
        local_python = base / '.venv/bin/python'
        uv = shutil.which('uv')
        if local_cli.exists():
            print(f'ACE-Step sorgente trovato: {base}', flush=True)
            return [str(local_cli)], base
        if local_python.exists() and module_available(str(local_python)):
            print(f'ACE-Step venv trovato: {local_python}', flush=True)
            return [str(local_python), '-m', 'acestep.api_server'], base
        if uv:
            print(f'ACE-Step sorgente trovato per uv: {base}', flush=True)
            return [uv, 'run', '--no-sync', 'acestep-api'], base

    return None, None


def wait_api(proc, port: int, log_path: Path, timeout=300):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors='ignore')[-12000:] if log_path.exists() else ''
            raise RuntimeError(f'ACE-Step API terminata:\n{tail}')
        if health_data(port) is not None:
            return
        time.sleep(2)
    tail = log_path.read_text(errors='ignore')[-12000:] if log_path.exists() else ''
    raise RuntimeError(f'Timeout avvio ACE-Step API:\n{tail}')


def start_installed_api():
    command, cwd = find_launcher()
    if not command:
        raise RuntimeError(
            'ACE-Step XL-Turbo risulta installato nel tuo setup, ma non trovo ancora il runtime/venv che lo esegue. '
            'Esegui la cella diagnostica che ti fornisco in chat: non reinstalla nulla.'
        )

    log_path = WORK / 'acestep-xl-api.log'
    env = os.environ.copy()
    env.update({
        'ACESTEP_DEVICE': 'cuda',
        'ACESTEP_CONFIG_PATH': MODEL,
        'ACESTEP_NO_INIT': 'true',
        'ACESTEP_INIT_LLM': 'false',
        'ACESTEP_USE_FLASH_ATTENTION': 'true',
        'ACESTEP_OFFLOAD_TO_CPU': 'false',
        'ACESTEP_OFFLOAD_DIT_TO_CPU': 'false',
        'ACESTEP_LM_OFFLOAD_TO_CPU': 'false',
        'ACESTEP_API_HOST': '0.0.0.0',
        'ACESTEP_API_PORT': str(TARGET_PORT),
        'ACESTEP_API_WORKERS': '1',
        'ACESTEP_QUEUE_WORKERS': '1',
        'ACESTEP_QUEUE_MAXSIZE': '64',
        'ACESTEP_DOWNLOAD_SOURCE': 'huggingface',
        'TOKENIZERS_PARALLELISM': 'false',
        'MPLBACKEND': 'Agg',
        'PYTHONUNBUFFERED': '1',
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
    })

    log = open(log_path, 'w', buffering=1)
    proc = subprocess.Popen(
        command,
        cwd=str(cwd) if cwd else None,
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f'ACE-Step REST API avviata: PID={proc.pid}, porta={TARGET_PORT}', flush=True)
    wait_api(proc, TARGET_PORT, log_path)
    return TARGET_PORT


def ensure_xl(port: int):
    inventory = model_inventory(port)
    if inventory_has_xl(inventory):
        print(f'{MODEL} già disponibile/caricato sulla porta {port}.', flush=True)
        return

    print(f'Inizializzo {MODEL} sulla porta {port}...', flush=True)
    body = api_json(
        port,
        '/v1/init',
        {'model': MODEL, 'slot': 1, 'init_llm': False},
        timeout=900,
    )
    if body:
        print('/v1/init -> OK', flush=True)
        data = body.get('data') or body
        if MODEL in str(data.get('loaded_model') or ''):
            return

    deadline = time.time() + 420
    last = None
    while time.time() < deadline:
        last = model_inventory(port)
        if inventory_has_xl(last):
            print(f'{MODEL} pronto.', flush=True)
            return
        time.sleep(3)
    raise RuntimeError(f'XL-Turbo non risulta pronto dopo init: {json.dumps(last, ensure_ascii=False)[:4000]}')


def cloudflared_binary():
    machine = platform.machine().lower()
    arch = 'arm64' if machine in {'aarch64', 'arm64'} else 'amd64'
    target = WORK / 'cloudflared'
    if not target.exists():
        url = f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}'
        print(f'Download del solo client tunnel cloudflared ({arch})...', flush=True)
        urllib.request.urlretrieve(url, target)
        target.chmod(0o755)
    return target


def stop_old_tunnel(port: int):
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
        if 'cloudflared' in cmd and (f'127.0.0.1:{port}' in cmd or f'localhost:{port}' in cmd):
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
    time.sleep(1)


def start_tunnel(port: int):
    binary = cloudflared_binary()
    stop_old_tunnel(port)
    log_path = WORK / 'cloudflared-xl.log'
    log = open(log_path, 'w', buffering=1)
    proc = subprocess.Popen(
        [str(binary), 'tunnel', '--no-autoupdate', '--url', f'http://127.0.0.1:{port}'],
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    pattern = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com', re.I)
    deadline = time.time() + 120
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors='ignore')[-8000:] if log_path.exists() else ''
            raise RuntimeError(f'Cloudflare tunnel terminato:\n{tail}')
        text = log_path.read_text(errors='ignore') if log_path.exists() else ''
        match = pattern.search(text)
        if match:
            return match.group(0).rstrip('/')
        time.sleep(1)
    raise RuntimeError('Timeout creazione del nuovo URL pubblico Cloudflare.')


def verify_public(base: str):
    deadline = time.time() + 150
    last_health = None
    last_models = None
    while time.time() < deadline:
        try:
            req = urllib.request.Request(base + '/health', headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req, timeout=15) as response:
                raw = response.read().decode('utf-8', errors='replace')
                last_health = json.loads(raw) if raw else {}
            for path in ('/v1/model_inventory', '/v1/models'):
                req2 = urllib.request.Request(base + path, headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'})
                try:
                    with urllib.request.urlopen(req2, timeout=20) as response2:
                        raw2 = response2.read().decode('utf-8', errors='replace')
                        body2 = json.loads(raw2) if raw2 else {}
                        last_models = body2.get('data') or body2
                        if response2.status == 200 and inventory_has_xl(last_models):
                            return last_health, body2
                except Exception:
                    continue
        except Exception as exc:
            last_health = {'error': repr(exc)}
        time.sleep(2)
    raise RuntimeError(
        'Endpoint pubblico non verificato. '
        f'health={json.dumps(last_health, ensure_ascii=False)[:1500]} '
        f'models={json.dumps(last_models, ensure_ascii=False)[:1500]}'
    )


def diagnostic():
    print('\n--- DIAGNOSTICA MOLAB (nessuna installazione/modifica) ---')
    print('cwd =', Path.cwd())
    print('sys.executable =', sys.executable)
    print('acestep-api PATH =', shutil.which('acestep-api'))
    print('uv PATH =', shutil.which('uv'))
    try:
        print('acestep module =', importlib.util.find_spec('acestep'))
    except Exception as exc:
        print('acestep module error =', repr(exc))
    print('Python candidati:')
    for py in find_python_runtimes()[:30]:
        print(' ', py, 'ACE-Step=', module_available(py))
    print('source root =', find_source_root())
    print('--- FINE DIAGNOSTICA ---\n')


def main():
    print('=' * 76)
    print(' SONARA - MOLAB / ACE-STEP 1.5 XL-TURBO BRIDGE V3 ')
    print('=' * 76)

    port = detect_live_api()
    if port is None:
        try:
            port = start_installed_api()
        except RuntimeError:
            diagnostic()
            raise

    ensure_xl(port)
    print(f'ACE-Step XL API pronta su http://127.0.0.1:{port}', flush=True)

    public_url = start_tunnel(port)
    public_health, public_models = verify_public(public_url)

    marker = WORK / 'sonara-molab-xl-url.txt'
    marker.write_text(
        f'SONARA_MOLAB_XL_URL={public_url}\nMODEL={MODEL}\nPORT={port}\nTUNNEL=cloudflare\n',
        encoding='utf-8',
    )

    print('\n' + '=' * 76)
    print(' ✅ MOLAB XL-TURBO PRONTO PER SONARA ')
    print('=' * 76)
    print(f'SONARA_MOLAB_XL_URL={public_url}')
    print(f'MODEL={MODEL}')
    print(f'LOCAL_PORT={port}')
    print('TUNNEL=cloudflare')
    print('HEALTH=' + json.dumps(public_health, ensure_ascii=False)[:1000])
    print('MODELS=' + json.dumps(public_models, ensure_ascii=False)[:1500])
    print('=' * 76)
    print('IMPORTANTE: lascia aperta la sessione MoLab; il Quick Tunnel è legato al runtime.')
    print('COPIA QUI IN CHAT SOLO LA RIGA SONARA_MOLAB_XL_URL=...')


if __name__ == '__main__':
    main()
