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
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PYTHON = ROOT / '.venv/bin/python'
CHECKPOINTS = ROOT / 'checkpoints'
MODEL = 'acestep-v15-xl-turbo'
MODEL_DIR = CHECKPOINTS / MODEL
PORT = 8001
WORK = Path('/tmp/sonara-ace-step-resume-0831')
API_LOG = WORK / 'api.log'


def banner(text: str) -> None:
    print('\n' + '=' * 88, flush=True)
    print(text, flush=True)
    print('=' * 88, flush=True)


def run(cmd, *, cwd=None, env=None, timeout=None) -> None:
    cmd = [str(x) for x in cmd]
    print('$ ' + ' '.join(cmd), flush=True)
    proc = subprocess.run(cmd, cwd=str(cwd) if cwd else None, env=env, timeout=timeout, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"Comando fallito ({proc.returncode}): {' '.join(cmd)}")


def env_base() -> dict:
    env = os.environ.copy()
    env.pop('VIRTUAL_ENV', None)
    env['ACESTEP_PROJECT_ROOT'] = str(ROOT)
    env['ACESTEP_CHECKPOINTS_DIR'] = str(CHECKPOINTS)
    env['HF_HUB_DOWNLOAD_TIMEOUT'] = '1800'
    env['HF_HUB_ETAG_TIMEOUT'] = '120'
    env['HF_HUB_DISABLE_TELEMETRY'] = '1'
    env['TOKENIZERS_PARALLELISM'] = 'false'
    env['MPLBACKEND'] = 'Agg'
    env['PYTHONUNBUFFERED'] = '1'
    return env


def has_weights(directory: Path) -> bool:
    if not directory.exists():
        return False
    names = {
        'model.safetensors',
        'model.safetensors.index.json',
        'pytorch_model.bin',
        'pytorch_model.bin.index.json',
        'diffusion_pytorch_model.safetensors',
        'diffusion_pytorch_model.safetensors.index.json',
        'diffusion_pytorch_model.bin',
        'diffusion_pytorch_model.bin.index.json',
    }
    if any((directory / name).exists() for name in names):
        return True
    return any(
        p.is_file() and p.suffix in {'.safetensors', '.bin'} and p.stat().st_size > 1024 * 1024
        for p in directory.rglob('*')
    )


def verify_existing_install(env: dict) -> None:
    banner('SONARA ACE-STEP - RIPRESA INSTALLAZIONE')
    if not ROOT.exists():
        raise RuntimeError(f'ACE-Step CLEAN non trovato: {ROOT}')
    if not PYTHON.exists():
        raise RuntimeError(f'Venv ACE-Step non trovato: {PYTHON}')
    if not (ROOT / 'acestep/model_downloader.py').exists():
        raise RuntimeError('Repository ACE-Step incompleto: model_downloader.py mancante.')

    code = r'''
import torch
import acestep.api_server
print('TORCH=' + torch.__version__)
print('CUDA_BUILD=' + str(torch.version.cuda))
print('CUDA_AVAILABLE=' + str(torch.cuda.is_available()))
assert torch.cuda.is_available()
print('GPU=' + torch.cuda.get_device_name(0))
print('VRAM_GB=' + str(round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 2)))
print('CUDA=READY')
print('ACESTEP_IMPORT=OK')
'''
    run([PYTHON, '-c', code], cwd=ROOT, env=env, timeout=1200)


def download_models(env: dict) -> None:
    banner('DOWNLOAD - RIPRESA AUTOMATICA')
    CHECKPOINTS.mkdir(parents=True, exist_ok=True)

    # IMPORTANT: this ACE-Step revision does NOT expose --download-source
    # on model_downloader. The downloader itself auto-selects HF/ModelScope.
    print('Riprendo/verifico il modello principale ACE-Step...', flush=True)
    run(
        [PYTHON, '-m', 'acestep.model_downloader'],
        cwd=ROOT,
        env=env,
        timeout=21600,
    )

    if has_weights(MODEL_DIR):
        print(f'{MODEL}=GIA_PRESENTE', flush=True)
    else:
        print(f'Riprendo/completo {MODEL}...', flush=True)
        # --force is intentional: model_downloader otherwise treats any existing
        # directory as complete. snapshot_download still resumes cached files.
        run(
            [
                PYTHON,
                '-m',
                'acestep.model_downloader',
                '--model',
                MODEL,
                '--skip-main',
                '--force',
            ],
            cwd=ROOT,
            env=env,
            timeout=21600,
        )

    if not has_weights(MODEL_DIR):
        raise RuntimeError(f'XL-Turbo ancora incompleto: {MODEL_DIR}')

    total = sum(p.stat().st_size for p in MODEL_DIR.rglob('*') if p.is_file())
    print(f'XL_TURBO_DIR={MODEL_DIR}', flush=True)
    print(f'XL_TURBO_SIZE_GB={total / 1024**3:.2f}', flush=True)
    print('DOWNLOAD_MODELS=OK', flush=True)


def request_json(url: str, timeout: int = 15) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'User-Agent': 'SONARA-ACE-Step-Resume/1.0',
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode('utf-8', errors='replace')
    return json.loads(raw) if raw else {}


def health_ready(body: dict) -> bool:
    if not isinstance(body, dict):
        return False
    data = body.get('data') or body
    return (
        str(data.get('status') or '').lower() == 'ok'
        and data.get('models_initialized') is True
        and MODEL in str(data.get('loaded_model') or '')
    )


def kill_matching(predicate) -> None:
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
        if predicate(parts[1].lower()):
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
    time.sleep(2)


def start_api(env: dict) -> subprocess.Popen:
    banner('AVVIO API XL-TURBO')
    kill_matching(lambda cmd: 'acestep.api_server' in cmd and '8001' in cmd)
    WORK.mkdir(parents=True, exist_ok=True)

    api_env = env.copy()
    api_env.update({
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
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
    })

    log = API_LOG.open('w', encoding='utf-8', buffering=1)
    proc = subprocess.Popen(
        [
            str(PYTHON), '-m', 'acestep.api_server',
            '--host', '0.0.0.0', '--port', str(PORT),
            '--download-source', 'huggingface',
        ],
        cwd=str(ROOT),
        env=api_env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f'ACE_STEP_API_PID={proc.pid}', flush=True)
    print(f'ACE_STEP_API_LOG={API_LOG}', flush=True)

    deadline = time.time() + 1800
    last = None
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = API_LOG.read_text(errors='replace')[-24000:] if API_LOG.exists() else ''
            raise RuntimeError(f'ACE-Step API terminata con exit={proc.returncode}:\n{tail}')
        try:
            last = request_json(f'http://127.0.0.1:{PORT}/health', 10)
            if health_ready(last):
                print('LOCAL_HEALTH=READY', flush=True)
                return proc
        except Exception:
            pass
        time.sleep(3)
    tail = API_LOG.read_text(errors='replace')[-24000:] if API_LOG.exists() else ''
    raise RuntimeError(f'Timeout avvio ACE-Step. Ultimo health={last!r}\n{tail}')


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
    print(f'Scarico cloudflared: {url}', flush=True)
    urllib.request.urlretrieve(url, target)
    target.chmod(0o755)
    return target


def start_tunnel() -> tuple[subprocess.Popen, str]:
    banner('AVVIO TUNNEL SONARA')
    kill_matching(lambda cmd: 'cloudflared' in cmd and '8001' in cmd)
    binary = cloudflared_binary()
    pattern = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com', re.I)

    for protocol in ('http2', 'quic'):
        log_path = WORK / f'cloudflare-{protocol}.log'
        log_path.write_text('', encoding='utf-8')
        log = log_path.open('a', encoding='utf-8', buffering=1)
        cmd = [
            str(binary), 'tunnel', '--url', f'http://127.0.0.1:{PORT}',
            '--no-autoupdate', '--protocol', protocol, '--loglevel', 'info',
        ]
        print('$ ' + ' '.join(cmd), flush=True)
        proc = subprocess.Popen(cmd, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        deadline = time.time() + 75
        public_url = None
        while time.time() < deadline:
            if proc.poll() is not None:
                break
            text = log_path.read_text(errors='replace') if log_path.exists() else ''
            match = pattern.search(text)
            if match:
                public_url = match.group(0).rstrip('/')
                break
            time.sleep(0.5)

        if public_url:
            deadline2 = time.time() + 180
            while time.time() < deadline2:
                if proc.poll() is not None:
                    break
                try:
                    body = request_json(public_url + '/health', 20)
                    if health_ready(body):
                        print('PUBLIC_HEALTH=READY', flush=True)
                        return proc, public_url
                except Exception:
                    pass
                time.sleep(2)

        if proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except Exception:
                proc.terminate()
        tail = log_path.read_text(errors='replace')[-10000:] if log_path.exists() else ''
        print(f'Protocollo {protocol} non pronto. Log finale:\n{tail}', flush=True)

    raise RuntimeError('ACE-Step locale pronto, ma Quick Tunnel Cloudflare non disponibile.')


def main() -> None:
    env = env_base()
    verify_existing_install(env)
    download_models(env)
    api_proc = start_api(env)
    tunnel_proc, public_url = start_tunnel()

    ready_file = ROOT / 'SONARA_ACE_STEP_READY.txt'
    ready_file.write_text(
        'ACE_STEP_READY=YES\n'
        f'ROOT={ROOT}\nMODEL={MODEL}\nPORT={PORT}\nPUBLIC_URL={public_url}\n'
        'FLASH_ATTENTION=OFF\nCPU_OFFLOAD=OFF\nGENERATION_TEST=NOT_RUN\n',
        encoding='utf-8',
    )

    banner('SONARA ACE-STEP XL-TURBO PRONTO')
    print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
    print(f'MODEL={MODEL}', flush=True)
    print(f'LOCAL_PORT={PORT}', flush=True)
    print('CUDA=READY', flush=True)
    print('FLASH_ATTENTION=OFF', flush=True)
    print('CPU_OFFLOAD=OFF', flush=True)
    print('GENERATION_TEST=NOT_RUN', flush=True)
    print('NON FERMARE QUESTA CELLA.', flush=True)

    try:
        while True:
            if api_proc.poll() is not None:
                raise RuntimeError(f'ACE-Step API fermata. Log: {API_LOG}')
            if tunnel_proc.poll() is not None:
                raise RuntimeError('Tunnel Cloudflare fermato.')
            try:
                ok = health_ready(request_json(f'http://127.0.0.1:{PORT}/health', 8))
            except Exception:
                ok = False
            print(
                f"[{time.strftime('%H:%M:%S')}] HEARTBEAT | API={'UP' if ok else 'DOWN'} | "
                f'TUNNEL=UP | {public_url}', flush=True,
            )
            time.sleep(60)
    finally:
        for proc in (tunnel_proc, api_proc):
            if proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except Exception:
                    try:
                        proc.terminate()
                    except Exception:
                        pass


if __name__ == '__main__':
    main()
