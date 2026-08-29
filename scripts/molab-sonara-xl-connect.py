import inspect
import json
import os
import secrets
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

MODEL = 'acestep-v15-xl-turbo'
PORT_CANDIDATES = [7860, 8000, 8001, 7861, 8080, 8888]
TARGET_PORT = 7860
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


def health_data(port: int):
    try:
        status, body = request_json(port, '/health', timeout=5)
        data = body.get('data') or body
        if status == 200:
            return data
    except Exception:
        return None
    return None


def detect_live_api():
    for port in PORT_CANDIDATES:
        data = health_data(port)
        if not data:
            continue
        model = str(data.get('loaded_model') or data.get('model') or '')
        initialized = data.get('models_initialized')
        print(f'Endpoint ACE-Step rilevato su 127.0.0.1:{port} | model={model or "n/d"} | initialized={initialized}', flush=True)
        if MODEL in model or initialized is True:
            return port
    return None


def candidate_roots():
    roots = []
    for value in [Path.cwd(), Path.home(), Path('/workspace'), Path('/workspaces'), Path('/app'), Path('/tmp')]:
        try:
            value = value.resolve()
        except Exception:
            pass
        if value.exists() and value not in roots:
            roots.append(value)
    return roots


def find_acestep():
    env_home = os.environ.get('ACESTEP_HOME', '').strip()
    if env_home:
        p = Path(env_home).expanduser()
        if (p / 'pyproject.toml').exists():
            return p

    names = ['ACE-Step-1.5', 'ACE-Step', 'ace-step-1.5', 'ace-step']
    for root in candidate_roots():
        if root.name in names and (root / 'pyproject.toml').exists():
            return root
        for name in names:
            direct = root / name
            if (direct / 'pyproject.toml').exists():
                return direct

    for root in candidate_roots():
        try:
            for pyproject in root.glob('**/pyproject.toml'):
                parent = pyproject.parent
                if 'ace' in parent.name.lower() and 'step' in parent.name.lower():
                    return parent
        except Exception:
            continue
    return None


def wait_api(proc, port: int, log_path: Path, timeout=300):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors='ignore')[-12000:] if log_path.exists() else ''
            raise RuntimeError(f'ACE-Step API terminata:\n{tail}')
        data = health_data(port)
        if data is not None:
            return data
        time.sleep(2)
    tail = log_path.read_text(errors='ignore')[-12000:] if log_path.exists() else ''
    raise RuntimeError(f'Timeout avvio ACE-Step API:\n{tail}')


def start_existing_acestep_api(base: Path):
    api_bin = base / '.venv/bin/acestep-api'
    uv = shutil.which('uv')
    if not api_bin.exists() and not uv:
        raise RuntimeError(f'ACE-Step trovato in {base}, ma non trovo .venv/bin/acestep-api né uv.')

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
        'ACESTEP_API_WORKERS': '1',
        'ACESTEP_QUEUE_WORKERS': '1',
        'ACESTEP_QUEUE_MAXSIZE': '64',
        'TOKENIZERS_PARALLELISM': 'false',
        'MPLBACKEND': 'Agg',
        'PYTHONUNBUFFERED': '1',
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
    })

    if api_bin.exists():
        command = [str(api_bin), '--host', '0.0.0.0', '--port', str(TARGET_PORT), '--download-source', 'huggingface', '--no-init']
    else:
        command = [uv, 'run', '--no-sync', 'acestep-api', '--host', '0.0.0.0', '--port', str(TARGET_PORT), '--download-source', 'huggingface', '--no-init']

    log = open(log_path, 'w', buffering=1)
    proc = subprocess.Popen(
        command,
        cwd=str(base),
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f'ACE-Step XL API avviata: PID={proc.pid}, porta={TARGET_PORT}', flush=True)
    wait_api(proc, TARGET_PORT, log_path)

    try:
        status, body = request_json(
            TARGET_PORT,
            '/v1/init',
            {'model': MODEL, 'slot': 1, 'init_llm': False},
            timeout=900,
        )
        print(f'/v1/init -> HTTP {status}', flush=True)
        if body:
            print(json.dumps(body, ensure_ascii=False)[:2000], flush=True)
    except Exception as exc:
        print(f'/v1/init non necessario o già inizializzato: {exc!r}', flush=True)

    deadline = time.time() + 300
    last = {}
    while time.time() < deadline:
        data = health_data(TARGET_PORT) or {}
        last = data
        model = str(data.get('loaded_model') or data.get('model') or '')
        initialized = data.get('models_initialized')
        if initialized is True and (not model or MODEL in model):
            return TARGET_PORT
        time.sleep(2)
    raise RuntimeError(f'XL-Turbo non risulta inizializzato: {json.dumps(last, ensure_ascii=False)[:4000]}')


def ensure_gradio():
    try:
        import gradio  # noqa: F401
        return
    except Exception:
        print('Gradio non presente: installo solo il client tunnel (XL-Turbo non viene toccato)...', flush=True)
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', 'gradio>=6.10'], check=True)


def start_gradio_tunnel(port: int):
    ensure_gradio()
    from gradio import networking

    # Chiudi soltanto eventuali vecchi tunnel Gradio sullo stesso port.
    try:
        from gradio.tunneling import CURRENT_TUNNELS
        for tunnel in list(CURRENT_TUNNELS):
            if int(getattr(tunnel, 'local_port', -1)) == int(port):
                try:
                    tunnel.kill()
                except Exception:
                    pass
    except Exception:
        pass

    token = secrets.token_urlsafe(32)
    setup = networking.setup_tunnel
    params = inspect.signature(setup).parameters
    print(f'Creo tunnel Gradio pubblico per 127.0.0.1:{port}...', flush=True)

    if 'share_server_tls_certificate' in params:
        url = setup('127.0.0.1', int(port), token, None, None)
    else:
        url = setup('127.0.0.1', int(port), token, None)

    url = str(url).strip().rstrip('/')
    if not url.startswith('https://') or 'gradio.live' not in url:
        raise RuntimeError(f'URL Gradio inatteso: {url}')
    return url


def verify_public(base: str):
    deadline = time.time() + 120
    last = ''
    while time.time() < deadline:
        try:
            req = urllib.request.Request(base + '/health', headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req, timeout=15) as response:
                raw = response.read().decode('utf-8', errors='replace')
                last = raw
                body = json.loads(raw) if raw else {}
                data = body.get('data') or body
                model = str(data.get('loaded_model') or data.get('model') or '')
                if response.status == 200 and (data.get('models_initialized') is True or MODEL in model):
                    return body
        except Exception as exc:
            last = repr(exc)
        time.sleep(2)
    raise RuntimeError(f'Endpoint pubblico Gradio non verificato: {last[:4000]}')


def main():
    print('=' * 76)
    print(' SONARA - MOLAB RTX PRO 6000 / ACE-STEP 1.5 XL-TURBO BRIDGE V2 ')
    print('=' * 76)

    port = detect_live_api()
    if port is None:
        base = find_acestep()
        if base is None:
            raise RuntimeError('Non trovo l’installazione ACE-Step esistente su MoLab. Non reinstallo nulla: mostrami l’output di Path.cwd() e la cartella di ACE-Step.')
        print(f'ACE-Step trovato: {base}', flush=True)
        port = start_existing_acestep_api(base)
    else:
        data = health_data(port) or {}
        model = str(data.get('loaded_model') or '')
        if model and MODEL not in model:
            print(f'API locale attiva con modello {model}; provo a selezionare {MODEL}.', flush=True)
            try:
                request_json(port, '/v1/init', {'model': MODEL, 'slot': 1, 'init_llm': False}, timeout=900)
            except Exception as exc:
                print(f'Init XL su API esistente: {exc!r}', flush=True)

    local_health = health_data(port)
    if not local_health:
        raise RuntimeError(f'ACE-Step locale non risponde sulla porta {port}.')

    print(f'API locale pronta su http://127.0.0.1:{port}', flush=True)
    print('Creo un nuovo ponte Gradio (niente Quick Tunnel Cloudflare)...', flush=True)
    public_url = start_gradio_tunnel(port)
    public_health = verify_public(public_url)

    marker = WORK / 'sonara-molab-xl-url.txt'
    marker.write_text(
        f'SONARA_MOLAB_XL_URL={public_url}\nMODEL={MODEL}\nPORT={port}\nTUNNEL=gradio\n',
        encoding='utf-8',
    )

    print('\n' + '=' * 76)
    print(' ✅ MOLAB XL-TURBO PRONTO PER SONARA ')
    print('=' * 76)
    print(f'SONARA_MOLAB_XL_URL={public_url}')
    print(f'MODEL={MODEL}')
    print(f'LOCAL_PORT={port}')
    print('TUNNEL=gradio')
    print('HEALTH=' + json.dumps(public_health, ensure_ascii=False)[:1500])
    print('=' * 76)
    print('IMPORTANTE: lascia aperta la sessione MoLab. Il link Gradio resta attivo finché il runtime resta vivo.')
    print('COPIA QUI IN CHAT SOLO LA RIGA SONARA_MOLAB_XL_URL=...')


if __name__ == '__main__':
    main()
