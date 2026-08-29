import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

WORK = Path('/kaggle/working')
BASE = WORK / 'ACE-Step-1.5'
CLOUDFLARED = WORK / 'cloudflared'
CLOUDFLARED_URL = 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64'
TRIGGER_URL = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/.github/kaggle-workers-trigger'
URLS_FILE = WORK / 'sonara-dual-music-t4-urls.txt'
MODEL = 'acestep-v15-turbo'
LM_MODEL = 'acestep-5Hz-lm-0.6B'
PORTS = {0: 7860, 1: 7861}

SETTINGS = {
    'ACESTEP_DEVICE': 'cuda',
    'ACESTEP_DTYPE': 'float32',
    'ACESTEP_CONFIG_PATH': MODEL,
    'ACESTEP_NO_INIT': 'true',
    'ACESTEP_INIT_LLM': 'true',
    'ACESTEP_LM_MODEL_PATH': LM_MODEL,
    'ACESTEP_LM_BACKEND': 'pt',
    'ACESTEP_LM_DEVICE': 'cuda',
    'ACESTEP_LM_OFFLOAD_TO_CPU': 'true',
    'ACESTEP_OFFLOAD_TO_CPU': 'true',
    'ACESTEP_OFFLOAD_DIT_TO_CPU': 'false',
    'ACESTEP_USE_FLASH_ATTENTION': 'false',
    'ACESTEP_COMPILE_MODEL': 'false',
    'ACESTEP_SAVE_MEMORY': '1',
    'ACESTEP_API_WORKERS': '1',
    'ACESTEP_QUEUE_WORKERS': '1',
    'ACESTEP_QUEUE_MAXSIZE': '64',
    'TOKENIZERS_PARALLELISM': 'false',
    'MPLBACKEND': 'Agg',
}


def run(cmd, *, cwd=None, env=None):
    print('+', ' '.join(map(str, cmd)), flush=True)
    subprocess.run(list(map(str, cmd)), cwd=cwd, env=env, check=True)


def download(url: str, target: Path):
    target.parent.mkdir(parents=True, exist_ok=True)
    print(f'Download: {url}', flush=True)
    urllib.request.urlretrieve(url, target)


def request_json(port: int, path: str, payload=None, timeout=20):
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


def ensure_two_t4s():
    print('\n[1/8] Verifica Kaggle T4 x2...', flush=True)
    output = subprocess.check_output(['nvidia-smi', '-L'], text=True)
    print(output, flush=True)
    gpus = [line for line in output.splitlines() if line.strip().startswith('GPU ')]
    if len(gpus) < 2:
        raise RuntimeError(f'Servono 2 GPU Kaggle. GPU rilevate: {len(gpus)}.')
    if not all('T4' in gpus[index].upper() for index in (0, 1)):
        print('ATTENZIONE: le prime due GPU non riportano entrambe la stringa T4; continuo usando GPU0 e GPU1.', flush=True)


def ensure_acestep():
    print('\n[2/8] Verifica ACE-Step 1.5...', flush=True)
    if BASE.exists() and not (BASE / 'pyproject.toml').exists():
        shutil.rmtree(BASE, ignore_errors=True)
    if not BASE.exists():
        run(['git', 'clone', '--depth', '1', 'https://github.com/ace-step/ACE-Step-1.5.git', str(BASE)])
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
        run([uv, 'sync', '--frozen', '--no-dev'], cwd=str(BASE))
    if not api_bin.exists():
        raise RuntimeError('acestep-api non trovato dopo installazione.')
    return uv


def patch_t4_float32():
    print('\n[3/8] Applico/verifico profilo T4 stabile FLOAT32...', flush=True)
    orchestrator = BASE / 'acestep/core/generation/handler/init_service_orchestrator.py'
    if not orchestrator.exists():
        raise RuntimeError(f'Loader ACE-Step non trovato: {orchestrator}')
    source = orchestrator.read_text(encoding='utf-8')
    marker = 'SONARA T4 stability override: using float32 via ACESTEP_DTYPE.'
    if marker not in source:
        old = '''            elif resolved_device == "cuda":\n                if gpu_config.cuda_supports_bfloat16():\n                    self.dtype = torch.bfloat16\n                else:\n                    self.dtype = torch.float16\n                    logger.info(\n                        "[initialize_service] Pre-Ampere CUDA detected: "\n                        "using float16 instead of bfloat16."\n                    )\n'''
        new = '''            elif resolved_device == "cuda":\n                requested_dtype = os.environ.get("ACESTEP_DTYPE", "").strip().lower()\n                if requested_dtype == "float32":\n                    self.dtype = torch.float32\n                    logger.info(\n                        "[initialize_service] SONARA T4 stability override: using float32 via ACESTEP_DTYPE."\n                    )\n                elif gpu_config.cuda_supports_bfloat16():\n                    self.dtype = torch.bfloat16\n                else:\n                    self.dtype = torch.float16\n                    logger.info(\n                        "[initialize_service] Pre-Ampere CUDA detected: "\n                        "using float16 instead of bfloat16."\n                    )\n'''
        if old not in source:
            raise RuntimeError('Patch FLOAT32 non applicabile: upstream ACE-Step è cambiato.')
        orchestrator.write_text(source.replace(old, new, 1), encoding='utf-8')
        source = orchestrator.read_text(encoding='utf-8')
    if marker not in source:
        raise RuntimeError('Patch FLOAT32 non verificata.')
    print('FLOAT32 T4-safe: OK', flush=True)


def stop_old_compute_keep_tunnels():
    print('\n[4/8] Sospendo Video AI e libero entrambe le T4; i tunnel Cloudflare restano vivi...', flush=True)
    try:
        rows = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
    except Exception:
        rows = ''
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
        cmd = parts[1].lower()
        if 'cloudflared' in cmd:
            continue
        is_music = 'acestep' in cmd and any(str(port) in cmd for port in PORTS.values())
        is_video = (
            'sonara-wan21-video' in cmd
            or 'kaggle-sonara-v10-recover-gpu1' in cmd
            or ('uvicorn' in cmd and '7861' in cmd)
        )
        if is_music or is_video:
            pids.append(pid)
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
    if pids:
        time.sleep(4)
    for pid in pids:
        try:
            os.kill(pid, 0)
            os.kill(pid, signal.SIGKILL)
        except Exception:
            pass
    print(f'Processi compute fermati: {len(pids)}', flush=True)
    print('Video AI: SOSPESO', flush=True)
    print('GPU0: destinazione Music AI', flush=True)
    print('GPU1: destinazione Music AI', flush=True)


def write_shared_env():
    env_path = BASE / '.env'
    existing = env_path.read_text(encoding='utf-8', errors='ignore') if env_path.exists() else ''
    lines = existing.splitlines()
    for key, value in SETTINGS.items():
        prefix = key + '='
        lines = [line for line in lines if not line.strip().startswith(prefix)]
        lines.append(f'{key}={value}')
    env_path.write_text('\n'.join(lines).strip() + '\n', encoding='utf-8')


def wait_api(proc, port: int, log_path: Path, timeout=240):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors='ignore')[-24000:] if log_path.exists() else ''
            raise RuntimeError(f'ACE-Step porta {port} terminata:\n{tail}')
        try:
            status, payload = request_json(port, '/health', timeout=5)
            data = payload.get('data') or payload
            if status == 200 and str(data.get('status') or '').lower() in {'ok', 'ready', 'healthy', 'online', 'success'}:
                return
        except Exception:
            pass
        time.sleep(3)
    tail = log_path.read_text(errors='ignore')[-24000:] if log_path.exists() else ''
    raise RuntimeError(f'Timeout ACE-Step porta {port}:\n{tail}')


def init_and_verify(port: int, log_path: Path):
    init_payload = {
        'model': MODEL,
        'slot': 1,
        'init_llm': True,
        'lm_model_path': LM_MODEL,
    }
    status, body = request_json(port, '/v1/init', init_payload, timeout=900)
    if status != 200 or body.get('code') not in (None, 200):
        tail = log_path.read_text(errors='ignore')[-30000:] if log_path.exists() else ''
        raise RuntimeError(f'/v1/init porta {port} fallita: {body}\n{tail}')

    deadline = time.time() + 180
    last = {}
    while time.time() < deadline:
        try:
            health_status, health = request_json(port, '/health', timeout=10)
            inv_status, inventory = request_json(port, '/v1/model_inventory', timeout=10)
            health_data = health.get('data') or health
            inv_data = inventory.get('data') or inventory
            last = {'health': health_data, 'inventory': inv_data}
            loaded_turbo = any(
                str(item.get('name')) == MODEL and item.get('is_loaded') is True
                for item in (inv_data.get('models') or []) if isinstance(item, dict)
            )
            good = (
                health_status == 200
                and inv_status == 200
                and health_data.get('models_initialized') is True
                and health_data.get('llm_initialized') is True
                and loaded_turbo
                and inv_data.get('llm_initialized') is True
                and '0.6B' in str(inv_data.get('loaded_lm_model') or '')
            )
            if good:
                return last
        except Exception:
            pass
        time.sleep(3)
    raise RuntimeError(f'Worker porta {port} non pronto: {json.dumps(last, ensure_ascii=False)[:6000]}')


def start_worker(uv: str, gpu: int):
    port = PORTS[gpu]
    log_path = WORK / f'sonara_music_v20_gpu{gpu}.log'
    env = os.environ.copy()
    env.update({
        **SETTINGS,
        'CUDA_VISIBLE_DEVICES': str(gpu),
        'PYTHONUNBUFFERED': '1',
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
    })
    command = [
        uv, 'run', '--no-sync', 'acestep-api',
        '--host', '0.0.0.0',
        '--port', str(port),
        '--download-source', 'huggingface',
        '--no-init',
        '--lm-model-path', LM_MODEL,
    ]
    log = open(log_path, 'w', buffering=1)
    proc = subprocess.Popen(
        command,
        cwd=str(BASE),
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f'GPU{gpu} -> ACE-Step PID {proc.pid}, porta {port}', flush=True)
    wait_api(proc, port, log_path)
    info = init_and_verify(port, log_path)
    print(f'GPU{gpu} Turbo + 5Hz LM: PRONTI', flush=True)
    return proc, info


def trigger_urls():
    try:
        req = urllib.request.Request(TRIGGER_URL, headers={'Cache-Control': 'no-cache'})
        with urllib.request.urlopen(req, timeout=20) as response:
            text = response.read().decode('utf-8', errors='ignore')
    except Exception:
        return {}
    found = {}
    for gpu in (0, 1):
        match = re.search(rf'^GPU{gpu}=(https://[^\s]+)$', text, re.M)
        if match:
            found[gpu] = match.group(1).rstrip('/')
    return found


def public_acestep_ok(base: str, timeout=60):
    deadline = time.time() + timeout
    last = ''
    while time.time() < deadline:
        try:
            req = urllib.request.Request(base + '/health', headers={'Cache-Control': 'no-cache'})
            with urllib.request.urlopen(req, timeout=12) as response:
                payload = json.loads(response.read().decode('utf-8', errors='ignore'))
                data = payload.get('data') or payload
                last = json.dumps(payload, ensure_ascii=False)
                if (
                    response.status == 200
                    and data.get('models_initialized') is True
                    and data.get('llm_initialized') is True
                    and 'acestep-v15-turbo' in str(data.get('loaded_model') or '')
                    and '0.6B' in str(data.get('loaded_lm_model') or '')
                ):
                    return True
        except Exception as exc:
            last = repr(exc)
        time.sleep(3)
    print(f'Endpoint non verificato: {base} -> {last}', flush=True)
    return False


def ensure_cloudflared():
    if not CLOUDFLARED.exists():
        download(CLOUDFLARED_URL, CLOUDFLARED)
    CLOUDFLARED.chmod(0o755)


def stop_tunnel_for_port(port: int):
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
    time.sleep(2)


def new_tunnel(port: int, label: str):
    ensure_cloudflared()
    stop_tunnel_for_port(port)
    log_path = WORK / f'sonara_cloudflared_{label}.log'
    log = open(log_path, 'w', buffering=1)
    proc = subprocess.Popen(
        [str(CLOUDFLARED), 'tunnel', '--no-autoupdate', '--url', f'http://127.0.0.1:{port}'],
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    pattern = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com', re.I)
    deadline = time.time() + 120
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors='ignore')[-6000:] if log_path.exists() else ''
            raise RuntimeError(f'Tunnel {label} terminato: {tail}')
        text = log_path.read_text(errors='ignore') if log_path.exists() else ''
        match = pattern.search(text)
        if match:
            return match.group(0).rstrip('/')
        time.sleep(2)
    raise RuntimeError(f'Timeout nuovo tunnel {label}.')


def resolve_public_urls():
    current = trigger_urls()
    resolved = {}
    for gpu in (0, 1):
        existing = current.get(gpu, '')
        if existing and public_acestep_ok(existing, timeout=45):
            resolved[gpu] = existing
            print(f'GPU{gpu}: tunnel esistente riutilizzato -> {existing}', flush=True)
            continue
        print(f'GPU{gpu}: tunnel precedente non riutilizzabile, ne creo uno nuovo.', flush=True)
        resolved[gpu] = new_tunnel(PORTS[gpu], f'gpu{gpu}_music_v20')
        if not public_acestep_ok(resolved[gpu], timeout=120):
            raise RuntimeError(f'Nuovo tunnel GPU{gpu} non verificato: {resolved[gpu]}')
    return resolved


def main():
    print('=' * 88)
    print(' SONARA MUSIC V20 - DUAL T4 x2 / GPU0 + GPU1 MUSIC / VIDEO AI SUSPENDED ')
    print('=' * 88)
    print('Obiettivo: 2 brani = 2 GPU in parallelo, una traccia per T4.', flush=True)

    ensure_two_t4s()
    uv = ensure_acestep()
    patch_t4_float32()
    stop_old_compute_keep_tunnels()
    write_shared_env()

    print('\n[5/8] Avvio GPU0 ACE-Step...', flush=True)
    _, gpu0_info = start_worker(uv, 0)
    print('\n[6/8] Avvio GPU1 ACE-Step...', flush=True)
    _, gpu1_info = start_worker(uv, 1)

    print('\n[7/8] Verifica/riuso tunnel pubblici...', flush=True)
    urls = resolve_public_urls()

    print('\n[8/8] Stato finale...', flush=True)
    URLS_FILE.write_text(
        f'GPU0={urls[0]}\nGPU1={urls[1]}\nMODE=MUSIC_DUAL_T4\nACTION=dual-t4-music-v20-video-suspended\n',
        encoding='utf-8',
    )

    print('\n' + '=' * 88)
    print(' ✅ SONARA DUAL T4 MUSIC PRONTA ')
    print('=' * 88)
    print('GPU0             : ACE-Step 1.5 + 5Hz LM / MUSIC')
    print('GPU1             : ACE-Step 1.5 + 5Hz LM / MUSIC')
    print('Video AI         : SOSPESO')
    print('Strategia        : brano A -> GPU0 | brano B -> GPU1, in parallelo')
    print('Inference        : V20 Real Prompt / 8 step lato edge')
    print('DiT              : FLOAT32 T4-safe')
    print(f'GPU0={urls[0]}')
    print(f'GPU1={urls[1]}')
    print('MODE=MUSIC_DUAL_T4')
    print('ACTION=dual-t4-music-v20-video-suspended')
    print(f'File URL         : {URLS_FILE}')
    print('=' * 88)
    print('COPIA QUI IN CHAT LE 4 RIGHE GPU0/GPU1/MODE/ACTION, solo se gli URL sono cambiati.')
    print(json.dumps({
        'gpu0_llm': (gpu0_info.get('inventory') or {}).get('loaded_lm_model'),
        'gpu1_llm': (gpu1_info.get('inventory') or {}).get('loaded_lm_model'),
    }, ensure_ascii=False))


if __name__ == '__main__':
    main()
