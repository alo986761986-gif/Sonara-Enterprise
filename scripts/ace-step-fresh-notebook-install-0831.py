#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import platform
import re
import shutil
import signal
import subprocess
import tarfile
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
VENV = ROOT / '.venv'
PYTHON = VENV / 'bin' / 'python'
TOOLS = Path('/marimo/SONARA-ACE-TOOLS')
WORK = Path('/tmp/sonara-ace-step-fresh-0831')
MODEL = 'acestep-v15-xl-turbo'
PORT = 8001
ACE_REPO = 'https://github.com/ace-step/ACE-Step-1.5.git'
ACE_COMMIT = 'ca1e85fe9430179831e6bc6be790c332190a3866'
API_LOG = WORK / 'api.log'
CF_LOG = WORK / 'cloudflare.log'
READY_FILE = ROOT / 'SONARA_ACE_STEP_READY.txt'


def banner(text: str) -> None:
    print('\n' + '=' * 88, flush=True)
    print(text, flush=True)
    print('=' * 88, flush=True)


def run(cmd, *, cwd: Path | None = None, env: dict | None = None, timeout: int | None = None) -> None:
    cmd = [str(x) for x in cmd]
    print('$ ' + ' '.join(cmd), flush=True)
    completed = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        env=env,
        timeout=timeout,
        check=False,
    )
    if completed.returncode != 0:
        raise RuntimeError(f"Command failed ({completed.returncode}): {' '.join(cmd)}")


def check_disk() -> None:
    usage = shutil.disk_usage('/marimo')
    free_gb = usage.free / 1024**3
    print(f'SPAZIO_LIBERO_GB={free_gb:.2f}', flush=True)
    if free_gb < 28:
        raise RuntimeError(
            f'Spazio insufficiente: {free_gb:.2f} GB liberi. '
            'Per ACE-Step CLEAN + CUDA + XL-Turbo servono almeno 28 GB liberi.'
        )
    if free_gb < 35:
        print('ATTENZIONE: spazio sufficiente ma ridotto; non interrompere i download.', flush=True)


def ensure_uv() -> Path:
    existing = shutil.which('uv')
    if existing:
        print(f'UV={existing}', flush=True)
        return Path(existing)

    TOOLS.mkdir(parents=True, exist_ok=True)
    target = TOOLS / 'uv'
    if target.exists() and os.access(target, os.X_OK):
        print(f'UV={target}', flush=True)
        return target

    machine = platform.machine().lower()
    if machine in {'x86_64', 'amd64'}:
        asset = 'uv-x86_64-unknown-linux-gnu.tar.gz'
    elif machine in {'aarch64', 'arm64'}:
        asset = 'uv-aarch64-unknown-linux-gnu.tar.gz'
    else:
        raise RuntimeError(f'Architettura non supportata per uv: {machine}')

    url = f'https://github.com/astral-sh/uv/releases/latest/download/{asset}'
    print(f'Scarico uv: {url}', flush=True)
    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / 'uv.tar.gz'
        urllib.request.urlretrieve(url, archive)
        with tarfile.open(archive, 'r:gz') as tf:
            tf.extractall(tmp)
        hits = [p for p in Path(tmp).rglob('uv') if p.is_file()]
        if not hits:
            raise RuntimeError('Archivio uv scaricato, ma binario uv non trovato.')
        shutil.copy2(hits[0], target)
    target.chmod(0o755)
    print(f'UV={target}', flush=True)
    return target


def prepare_repo() -> None:
    banner('1/6 - CLONE UFFICIALE ACE-STEP 1.5')
    ROOT.parent.mkdir(parents=True, exist_ok=True)

    if ROOT.exists() and not (ROOT / '.git').exists():
        backup = ROOT.with_name(ROOT.name + f'.partial-{int(time.time())}')
        print(f'Preservo ambiente parziale: {ROOT} -> {backup}', flush=True)
        ROOT.rename(backup)

    if not ROOT.exists():
        run(['git', 'init', str(ROOT)])
        run(['git', '-C', str(ROOT), 'remote', 'add', 'origin', ACE_REPO])
    else:
        remotes = subprocess.run(
            ['git', '-C', str(ROOT), 'remote'],
            capture_output=True,
            text=True,
            check=False,
        ).stdout.split()
        if 'origin' not in remotes:
            run(['git', '-C', str(ROOT), 'remote', 'add', 'origin', ACE_REPO])
        else:
            run(['git', '-C', str(ROOT), 'remote', 'set-url', 'origin', ACE_REPO])

    run(
        ['git', '-C', str(ROOT), 'fetch', '--depth', '1', 'origin', ACE_COMMIT],
        timeout=1200,
    )
    run(['git', '-C', str(ROOT), 'checkout', '--detach', '-f', ACE_COMMIT])

    if not (ROOT / 'pyproject.toml').exists():
        raise RuntimeError('Clone ACE-Step incompleto: pyproject.toml non trovato.')
    if not (ROOT / 'acestep' / 'api_server.py').exists():
        raise RuntimeError('Clone ACE-Step incompleto: acestep/api_server.py non trovato.')

    head = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
    if head != ACE_COMMIT:
        raise RuntimeError(f'Commit ACE-Step inatteso: {head}')
    print(f'ACE_COMMIT={head}', flush=True)


def base_env() -> dict:
    env = os.environ.copy()
    env.pop('VIRTUAL_ENV', None)
    env['UV_PROJECT_ENVIRONMENT'] = str(VENV)
    env['UV_PYTHON_DOWNLOADS'] = 'automatic'
    env['ACESTEP_PROJECT_ROOT'] = str(ROOT)
    env['ACESTEP_CHECKPOINTS_DIR'] = str(ROOT / 'checkpoints')
    env['HF_HUB_DOWNLOAD_TIMEOUT'] = '1800'
    env['HF_HUB_ETAG_TIMEOUT'] = '120'
    env['HF_HUB_DISABLE_TELEMETRY'] = '1'
    env['TOKENIZERS_PARALLELISM'] = 'false'
    env['MPLBACKEND'] = 'Agg'
    env['PYTHONUNBUFFERED'] = '1'
    return env


def install_environment(uv: Path) -> dict:
    banner('2/6 - PYTHON 3.12 + DIPENDENZE UFFICIALI CUDA')
    env = base_env()

    run([uv, 'python', 'install', '3.12'], env=env, timeout=1200)
    # Official ACE-Step installation path. Re-running uv sync is incremental.
    run(
        [uv, 'sync', '--project', str(ROOT), '--python', '3.12', '--no-dev'],
        cwd=ROOT,
        env=env,
        timeout=10800,
    )

    if not PYTHON.exists():
        raise RuntimeError(f'Venv ACE-Step non creato: {PYTHON}')
    return env


def verify_cuda(env: dict) -> None:
    banner('3/6 - VERIFICA RTX PRO 6000 / CUDA')
    code = r'''
import sys
import torch
import torchaudio
import torchvision
import acestep.api_server
print('PYTHON=' + sys.version.split()[0])
print('TORCH=' + torch.__version__)
print('TORCHAUDIO=' + torchaudio.__version__)
print('TORCHVISION=' + torchvision.__version__)
print('CUDA_BUILD=' + str(torch.version.cuda))
print('CUDA_AVAILABLE=' + str(torch.cuda.is_available()))
assert torch.cuda.is_available(), 'CUDA non disponibile'
print('GPU=' + torch.cuda.get_device_name(0))
print('VRAM_GB=' + str(round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 2)))
print('CAPABILITY=' + str(torch.cuda.get_device_capability(0)))
x = torch.randn((1024, 1024), device='cuda', dtype=torch.float16)
y = x @ x
torch.cuda.synchronize()
print('CUDA_COMPUTE=OK')
print('ACESTEP_IMPORT=OK')
'''
    run([PYTHON, '-c', code], cwd=ROOT, env=env, timeout=1800)


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
    return any((directory / name).exists() for name in names) or any(
        p.is_file() and p.suffix in {'.safetensors', '.bin'} and p.stat().st_size > 1024 * 1024
        for p in directory.rglob('*')
    )


def download_models(env: dict) -> None:
    banner('4/6 - DOWNLOAD MODELLI UFFICIALI')
    checkpoints = ROOT / 'checkpoints'
    checkpoints.mkdir(parents=True, exist_ok=True)

    main_components = [
        checkpoints / 'vae',
        checkpoints / 'Qwen3-Embedding-0.6B',
        checkpoints / 'acestep-v15-turbo',
    ]
    if not all(has_weights(p) for p in main_components):
        print('Scarico/verifico componenti principali ACE-Step...', flush=True)
        run(
            [PYTHON, '-m', 'acestep.model_downloader', '--dir', str(checkpoints)],
            cwd=ROOT,
            env=env,
            timeout=21600,
        )
    else:
        print('Componenti principali gia presenti: download principale saltato.', flush=True)

    model_dir = checkpoints / MODEL
    if not has_weights(model_dir):
        print(f'Scarico/verifico {MODEL}...', flush=True)
        run(
            [
                PYTHON,
                '-m',
                'acestep.model_downloader',
                '--model',
                MODEL,
                '--dir',
                str(checkpoints),
                '--skip-main',
            ],
            cwd=ROOT,
            env=env,
            timeout=21600,
        )
    else:
        print(f'{MODEL} gia presente: download XL-Turbo saltato.', flush=True)

    if not has_weights(model_dir):
        raise RuntimeError(f'Modello {MODEL} non completo: {model_dir}')

    bytes_total = sum(
        p.stat().st_size
        for p in model_dir.rglob('*')
        if p.is_file()
    )
    print(f'XL_TURBO_DIR={model_dir}', flush=True)
    print(f'XL_TURBO_SIZE_GB={bytes_total / 1024**3:.2f}', flush=True)


def request_json(url: str, timeout: int = 15) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'User-Agent': 'SONARA-ACE-Step-Installer/1.0',
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


def api_env(env: dict) -> dict:
    result = env.copy()
    result.update({
        'ACESTEP_PROJECT_ROOT': str(ROOT),
        'ACESTEP_CHECKPOINTS_DIR': str(ROOT / 'checkpoints'),
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
    return result


def start_api(env: dict) -> subprocess.Popen:
    banner('5/6 - AVVIO ACE-STEP XL-TURBO API')
    kill_matching(lambda cmd: 'acestep.api_server' in cmd and '8001' in cmd)

    WORK.mkdir(parents=True, exist_ok=True)
    log = API_LOG.open('w', encoding='utf-8', buffering=1)
    proc = subprocess.Popen(
        [
            str(PYTHON),
            '-m',
            'acestep.api_server',
            '--host',
            '0.0.0.0',
            '--port',
            str(PORT),
            '--download-source',
            'huggingface',
        ],
        cwd=str(ROOT),
        env=api_env(env),
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
                print('ACE_STEP_API_XL_TURBO=READY', flush=True)
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

    target = ROOT / 'bin' / 'cloudflared'
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


def try_quick_tunnel(binary: Path, protocol: str, timeout: int = 75):
    log_path = WORK / f'cloudflare-{protocol}.log'
    log_path.write_text('', encoding='utf-8')
    log = log_path.open('a', encoding='utf-8', buffering=1)
    cmd = [
        str(binary),
        'tunnel',
        '--url',
        f'http://127.0.0.1:{PORT}',
        '--no-autoupdate',
        '--protocol',
        protocol,
        '--loglevel',
        'info',
    ]
    print('$ ' + ' '.join(cmd), flush=True)
    proc = subprocess.Popen(
        cmd,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    pattern = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com', re.I)
    deadline = time.time() + timeout
    while time.time() < deadline:
        if proc.poll() is not None:
            break
        text = log_path.read_text(errors='replace') if log_path.exists() else ''
        match = pattern.search(text)
        if match:
            return proc, match.group(0).rstrip('/'), log_path
        time.sleep(0.5)

    if proc.poll() is None:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except Exception:
            proc.terminate()
        time.sleep(1)
    tail = log_path.read_text(errors='replace')[-8000:] if log_path.exists() else ''
    print(f'Tunnel {protocol} non pronto. Ultimo log:\n{tail}', flush=True)
    return None, None, log_path


def start_tunnel() -> tuple[subprocess.Popen, str]:
    banner('6/6 - CLOUDFLARE QUICK TUNNEL')
    kill_matching(lambda cmd: 'cloudflared' in cmd and '8001' in cmd)
    binary = cloudflared_binary()

    tunnel_proc = None
    public_url = None
    for protocol in ('http2', 'quic'):
        tunnel_proc, public_url, _ = try_quick_tunnel(binary, protocol)
        if public_url:
            break

    if tunnel_proc is None or not public_url:
        raise RuntimeError('ACE-Step e pronto localmente, ma Cloudflare Quick Tunnel non ha restituito un URL.')

    deadline = time.time() + 180
    last = None
    while time.time() < deadline:
        if tunnel_proc.poll() is not None:
            raise RuntimeError(f'Tunnel Cloudflare terminato con exit={tunnel_proc.returncode}.')
        try:
            last = request_json(public_url + '/health', 20)
            if health_ready(last):
                print('PUBLIC_HEALTH=READY', flush=True)
                return tunnel_proc, public_url
        except Exception as exc:
            last = {'error': repr(exc)}
        time.sleep(2)

    raise RuntimeError(f'Tunnel creato ma health pubblico non pronto: {last!r}')


def write_ready(public_url: str) -> None:
    READY_FILE.write_text(
        'ACE_STEP_READY=YES\n'
        f'ACE_COMMIT={ACE_COMMIT}\n'
        f'ROOT={ROOT}\n'
        f'MODEL={MODEL}\n'
        f'PORT={PORT}\n'
        f'PUBLIC_URL={public_url}\n'
        'FLASH_ATTENTION=OFF\n'
        'CPU_OFFLOAD=OFF\n'
        'GENERATION_TEST=NOT_RUN\n',
        encoding='utf-8',
    )


def main() -> None:
    banner('SONARA - ACE-STEP 1.5 XL-TURBO FRESH INSTALLER')
    print('INSTALL_MODE=FRESH_CLEAN_IDEMPOTENT', flush=True)
    print('LEVO2=UNTOUCHED', flush=True)
    print('GENERATION_TEST=NOT_RUN', flush=True)

    TOOLS.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    check_disk()
    uv = ensure_uv()
    prepare_repo()
    env = install_environment(uv)
    verify_cuda(env)
    download_models(env)
    api_proc = start_api(env)
    tunnel_proc, public_url = start_tunnel()
    write_ready(public_url)

    banner('SONARA ACE-STEP XL-TURBO PRONTO')
    print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
    print(f'MODEL={MODEL}', flush=True)
    print(f'LOCAL_PORT={PORT}', flush=True)
    print(f'CLEAN_ROOT={ROOT}', flush=True)
    print(f'ACE_COMMIT={ACE_COMMIT}', flush=True)
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
                raise RuntimeError(f'Tunnel Cloudflare fermato. Log: {CF_LOG}')
            try:
                ok = health_ready(request_json(f'http://127.0.0.1:{PORT}/health', 8))
            except Exception:
                ok = False
            print(
                f"[{time.strftime('%H:%M:%S')}] HEARTBEAT | API={'UP' if ok else 'DOWN'} | "
                f'TUNNEL=UP | {public_url}',
                flush=True,
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
