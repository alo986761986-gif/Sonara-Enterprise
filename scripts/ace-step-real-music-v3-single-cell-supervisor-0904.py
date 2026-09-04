#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import platform
import re
import shutil
import signal
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PYTHON = ROOT / '.venv/bin/python'
PORT = 8001
TURBO = 'acestep-v15-xl-turbo'
BASE = 'acestep-v15-xl-base'
LM = 'acestep-5Hz-lm-4B'
WORK = Path('/tmp/sonara-real-music-v3-single-cell-supervisor-0904')
API_LOG = WORK / 'api.log'
STATE = ROOT / 'SONARA_REAL_MUSIC_V3_SUPERVISOR_READY.json'
URL_PATTERN = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com', re.I)


def banner(text: str) -> None:
    print('\n' + '=' * 100, flush=True)
    print(text, flush=True)
    print('=' * 100, flush=True)


def request_json(url: str, timeout: int = 20, payload: dict | None = None) -> dict:
    data = None
    headers = {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'User-Agent': 'SONARA-V3-Single-Cell-Supervisor/1.0',
    }
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(
        url,
        data=data,
        headers=headers,
        method='POST' if payload is not None else 'GET',
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode('utf-8', errors='replace')
            status = int(getattr(response, 'status', 200) or 200)
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='replace')
        status = int(exc.code)
    except Exception as exc:
        return {'error': f'{type(exc).__name__}: {exc}'}
    try:
        body = json.loads(raw) if raw else {}
    except Exception:
        body = {'raw': raw[:2000], 'non_json': True}
    if status >= 400 and isinstance(body, dict):
        body.setdefault('http_status', status)
    return body


def health_data(body: dict) -> dict:
    if not isinstance(body, dict):
        return {}
    data = body.get('data')
    return data if isinstance(data, dict) else body


def api_ready(body: dict) -> bool:
    data = health_data(body)
    loaded = str(data.get('loaded_model') or data.get('default_model') or data.get('model') or '')
    status = str(data.get('status') or '').lower()
    return (
        status in {'ok', 'ready', 'healthy'}
        and data.get('models_initialized') is True
        and data.get('llm_initialized') is True
        and TURBO in loaded
    )


def empty_api_ready(body: dict) -> bool:
    data = health_data(body)
    status = str(data.get('status') or '').lower()
    return status in {'ok', 'ready', 'healthy'}


def tail(path: Path, chars: int = 20000) -> str:
    if not path.exists():
        return ''
    return path.read_text(errors='replace')[-chars:]


def safe_env() -> dict:
    env = os.environ.copy()
    env.pop('VIRTUAL_ENV', None)
    ld = env.get('LD_LIBRARY_PATH', '')
    if ld:
        kept = [p for p in ld.split(':') if p and '/site-packages/nvidia/' not in p]
        if kept:
            env['LD_LIBRARY_PATH'] = ':'.join(kept)
        else:
            env.pop('LD_LIBRARY_PATH', None)
    env.update({
        'ACESTEP_PROJECT_ROOT': str(ROOT),
        'ACESTEP_CHECKPOINTS_DIR': str(ROOT / 'checkpoints'),
        'ACESTEP_CONFIG_PATH': TURBO,
        'ACESTEP_DEVICE': 'cuda',
        'ACESTEP_INIT_LLM': 'false',
        'ACESTEP_LM_MODEL_PATH': LM,
        'ACESTEP_LM_BACKEND': 'pt',
        'ACESTEP_LM_DEVICE': 'cuda',
        'ACESTEP_USE_FLASH_ATTENTION': 'false',
        'ACESTEP_COMPILE_MODEL': 'false',
        'ACESTEP_OFFLOAD_TO_CPU': 'false',
        'ACESTEP_OFFLOAD_DIT_TO_CPU': 'false',
        'ACESTEP_LM_OFFLOAD_TO_CPU': 'false',
        'ACESTEP_NO_INIT': 'true',
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


def stop_proc(proc: subprocess.Popen | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except Exception:
        try:
            proc.terminate()
        except Exception:
            pass
    try:
        proc.wait(timeout=10)
    except Exception:
        pass


def kill_stale_runtime() -> None:
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
        cmd = parts[1].lower()
        if ('acestep.api_server' in cmd and str(PORT) in cmd) or ('cloudflared' in cmd and str(PORT) in cmd):
            try:
                os.kill(pid, signal.SIGTERM)
                print(f'STOPPED_STALE_PID={pid}', flush=True)
            except Exception:
                pass
    time.sleep(3)


def verify_existing_install() -> None:
    banner('0/6 - VERIFY EXISTING SONARA V3 INSTALL')
    if not ROOT.exists() or not PYTHON.exists():
        raise RuntimeError('ACE-Step runtime non trovato: ' + str(ROOT))
    turbo_dir = ROOT / 'checkpoints' / TURBO
    base_dir = ROOT / 'checkpoints' / BASE
    lm_dir = ROOT / 'checkpoints' / LM
    print(f'ROOT={ROOT}', flush=True)
    print(f'PYTHON={PYTHON}', flush=True)
    print(f'TURBO_DIR={turbo_dir} EXISTS={turbo_dir.exists()}', flush=True)
    print(f'BASE_DIR={base_dir} EXISTS={base_dir.exists()}', flush=True)
    print(f'LM_DIR={lm_dir} EXISTS={lm_dir.exists()}', flush=True)
    if not turbo_dir.exists():
        raise RuntimeError('XL-Turbo locale mancante; non eseguo una reinstallazione automatica.')
    if not base_dir.exists():
        raise RuntimeError('XL-Base locale mancante; non eseguo una reinstallazione automatica.')
    if not lm_dir.exists():
        raise RuntimeError('LM4B locale mancante; non eseguo una reinstallazione automatica.')
    probe = subprocess.run(
        [str(PYTHON), '-c', (
            'import torch, tokenizers, transformers, huggingface_hub; '
            'print("CUDA=" + str(torch.cuda.is_available())); '
            'print("GPU=" + (torch.cuda.get_device_name(0) if torch.cuda.is_available() else "NONE")); '
            'print("TOKENIZERS=" + tokenizers.__version__); '
            'print("TRANSFORMERS=" + transformers.__version__); '
            'print("HF_HUB=" + huggingface_hub.__version__)'
        )],
        cwd=str(ROOT), env=safe_env(), text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
    )
    print(probe.stdout or '', flush=True)
    if probe.returncode != 0 or 'CUDA=True' not in (probe.stdout or ''):
        raise RuntimeError('Runtime Python/CUDA non pronto:\n' + (probe.stdout or ''))
    print('EXISTING_INSTALL=READY', flush=True)


def start_api() -> subprocess.Popen:
    banner('1/6 - START ACE-STEP API SAFE NO-INIT')
    WORK.mkdir(parents=True, exist_ok=True)
    API_LOG.write_text('', encoding='utf-8')
    stream = API_LOG.open('a', encoding='utf-8', buffering=1)
    proc = subprocess.Popen(
        [str(PYTHON), '-m', 'acestep.api_server', '--host', '0.0.0.0', '--port', str(PORT), '--download-source', 'huggingface', '--no-init'],
        cwd=str(ROOT), env=safe_env(), stdout=stream, stderr=subprocess.STDOUT, start_new_session=True,
    )
    print(f'API_PID={proc.pid}', flush=True)
    deadline = time.time() + 300
    last = {}
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError('ACE-Step API si e fermata durante startup:\n' + tail(API_LOG))
        last = request_json(f'http://127.0.0.1:{PORT}/health', 10)
        if empty_api_ready(last):
            print('SAFE_EMPTY_API=READY', flush=True)
            return proc
        time.sleep(2)
    raise RuntimeError('Timeout avvio API ACE-Step. LAST=' + json.dumps(last, ensure_ascii=False) + '\n' + tail(API_LOG))


def init_models() -> dict:
    banner('2/6 - INIT XL-TURBO + LM4B')
    payload = {'model': TURBO, 'slot': 1, 'init_llm': True, 'lm_model_path': LM}
    body = request_json(f'http://127.0.0.1:{PORT}/v1/init', timeout=2400, payload=payload)
    print(json.dumps(body, indent=2, ensure_ascii=False), flush=True)
    if body.get('error') or int(body.get('code', 200) or 200) >= 400:
        raise RuntimeError('Init XL-Turbo/LM4B fallita: ' + json.dumps(body, ensure_ascii=False) + '\n' + tail(API_LOG))
    deadline = time.time() + 240
    last = {}
    while time.time() < deadline:
        last = request_json(f'http://127.0.0.1:{PORT}/health', 15)
        if api_ready(last):
            print('XL_TURBO=READY', flush=True)
            print('XL_BASE=READY_LOCAL', flush=True)
            print('LM4B=READY', flush=True)
            return last
        time.sleep(3)
    raise RuntimeError('Health incompleto dopo init: ' + json.dumps(last, ensure_ascii=False) + '\n' + tail(API_LOG))


def verify_asr() -> dict:
    banner('3/6 - VERIFY VOCAL ASR V3')
    body = request_json(f'http://127.0.0.1:{PORT}/v1/sonara/asr-health', 30)
    print(json.dumps(body, indent=2, ensure_ascii=False), flush=True)
    data = health_data(body)
    if not (body.get('ok') is True or data.get('ok') is True):
        raise RuntimeError('ASR V3 non pronto: ' + json.dumps(body, ensure_ascii=False))
    print('VOCAL_ASR_V3=READY', flush=True)
    return body


def cloudflared_binary() -> Path:
    existing = shutil.which('cloudflared')
    if existing:
        return Path(existing)
    target = ROOT / 'bin/cloudflared'
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and os.access(target, os.X_OK):
        return target
    machine = platform.machine().lower()
    arch = 'arm64' if machine in {'aarch64', 'arm64'} else 'amd64'
    url = f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}'
    urllib.request.urlretrieve(url, target)
    target.chmod(0o755)
    return target


def start_verified_tunnel() -> tuple[subprocess.Popen, str]:
    banner('4/6 - START VERIFIED CLOUDFLARE TUNNEL')
    binary = cloudflared_binary()
    WORK.mkdir(parents=True, exist_ok=True)
    for outer in range(1, 5):
        for protocol in ('http2', 'quic'):
            log_path = WORK / f'cloudflare-{outer}-{protocol}.log'
            log_path.write_text('', encoding='utf-8')
            stream = log_path.open('a', encoding='utf-8', buffering=1)
            cmd = [str(binary), 'tunnel', '--url', f'http://127.0.0.1:{PORT}', '--no-autoupdate', '--protocol', protocol, '--loglevel', 'info']
            print('$ ' + ' '.join(cmd), flush=True)
            proc = subprocess.Popen(cmd, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
            public_url = None
            deadline = time.time() + 90
            while time.time() < deadline:
                if proc.poll() is not None:
                    break
                text = log_path.read_text(errors='replace') if log_path.exists() else ''
                match = URL_PATTERN.search(text)
                if match:
                    public_url = match.group(0).rstrip('/')
                    break
                time.sleep(0.5)
            if public_url:
                print(f'TUNNEL_CANDIDATE={public_url}', flush=True)
                deadline2 = time.time() + 180
                while time.time() < deadline2:
                    if proc.poll() is not None:
                        break
                    public = request_json(public_url + '/health', 20)
                    if api_ready(public):
                        print('PUBLIC_HEALTH=READY', flush=True)
                        return proc, public_url
                    time.sleep(2)
            if proc.poll() is None:
                stop_proc(proc)
            if log_path.exists():
                print(log_path.read_text(errors='replace')[-3000:], flush=True)
    raise RuntimeError('Quick Tunnel non disponibile dopo 8 tentativi.')


def write_state(public_url: str, health: dict, asr: dict) -> None:
    payload = {
        'ok': True,
        'profile': 'SONARA REAL MUSIC V3 SINGLE CELL SUPERVISOR',
        'public_url': public_url,
        'model': TURBO,
        'refinement_model': BASE,
        'lm_model': LM,
        'lm_backend': 'pt',
        'health': health,
        'vocal_asr': asr,
        'updated_at_epoch': int(time.time()),
    }
    STATE.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def rebuild_api_and_tunnel(api_proc: subprocess.Popen | None, tunnel_proc: subprocess.Popen | None):
    stop_proc(tunnel_proc)
    stop_proc(api_proc)
    time.sleep(3)
    api_proc = start_api()
    health = init_models()
    asr = verify_asr()
    tunnel_proc, public_url = start_verified_tunnel()
    write_state(public_url, health, asr)
    return api_proc, tunnel_proc, public_url, health, asr


def main() -> None:
    banner('SONARA REAL MUSIC V3 - SINGLE CELL SUPERVISOR')
    verify_existing_install()
    kill_stale_runtime()

    api_proc = None
    tunnel_proc = None
    public_url = ''
    try:
        api_proc, tunnel_proc, public_url, health, asr = rebuild_api_and_tunnel(api_proc, tunnel_proc)

        banner('5/6 - SONARA REAL MUSIC V3 READY')
        print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
        print(f'MODEL={TURBO}', flush=True)
        print(f'REFINEMENT_MODEL={BASE}', flush=True)
        print(f'LM_MODEL={LM}', flush=True)
        print('LM_BACKEND=pt', flush=True)
        print('XL_TURBO=ON', flush=True)
        print('XL_BASE=ON', flush=True)
        print('LM4B=ON', flush=True)
        print('VOCAL_ASR_V3=ON', flush=True)
        print(f'READY_FILE={STATE}', flush=True)
        print('QUESTA E LA SOLA CELLA DA LASCIARE ATTIVA.', flush=True)

        banner('6/6 - API + PUBLIC TUNNEL WATCHDOG')
        bad_api = 0
        bad_public = 0
        while True:
            local = request_json(f'http://127.0.0.1:{PORT}/health', 10)
            local_ok = api_ready(local) and api_proc.poll() is None
            public = request_json(public_url + '/health', 20) if public_url else {}
            public_ok = api_ready(public) and tunnel_proc.poll() is None

            bad_api = 0 if local_ok else bad_api + 1
            bad_public = 0 if public_ok else bad_public + 1

            print(
                f"[{time.strftime('%H:%M:%S')}] REAL MUSIC V3 SUPERVISOR | "
                f'API={"UP" if local_ok else "DOWN"} | '
                f'PUBLIC={"UP" if public_ok else "DOWN"} | '
                f'XL_TURBO=ON | XL_BASE=ON | LM4B=ON | ASR=ON | {public_url}',
                flush=True,
            )

            if bad_api >= 2:
                print('AUTO_API_RECOVERY=START', flush=True)
                api_proc, tunnel_proc, public_url, health, asr = rebuild_api_and_tunnel(api_proc, tunnel_proc)
                bad_api = 0
                bad_public = 0
                print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
                print('AUTO_API_RECOVERY=READY', flush=True)
            elif bad_public >= 2:
                print('AUTO_TUNNEL_RECOVERY=START', flush=True)
                stop_proc(tunnel_proc)
                tunnel_proc, public_url = start_verified_tunnel()
                write_state(public_url, local, asr)
                bad_public = 0
                print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
                print('AUTO_TUNNEL_RECOVERY=READY', flush=True)

            time.sleep(20)
    finally:
        stop_proc(tunnel_proc)
        stop_proc(api_proc)


if __name__ == '__main__':
    main()
