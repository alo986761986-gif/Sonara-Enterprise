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

OLD = Path('/marimo/SONARA-ACE-Step-1.5')
NEW = Path('/marimo/SONARA-ACE-Step-CLEAN')
MODEL = 'acestep-v15-xl-turbo'
PORT = 8001
WORK = Path('/tmp/sonara-molab-clean')
WORK.mkdir(parents=True, exist_ok=True)


def run(cmd, *, cwd=None, env=None, timeout=None, check=True):
    print('$ ' + ' '.join(map(str, cmd)), flush=True)
    p = subprocess.run(cmd, cwd=cwd, env=env, capture_output=True, text=True, timeout=timeout)
    if p.stdout:
        print(p.stdout.rstrip(), flush=True)
    if p.stderr:
        print(p.stderr.rstrip(), flush=True)
    if check and p.returncode != 0:
        raise RuntimeError(f"Comando fallito ({p.returncode}): {' '.join(map(str, cmd))}\n{(p.stdout or '')[-8000:]}\n{(p.stderr or '')[-16000:]}")
    return p


def request_json(url, timeout=20):
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


def kill_old_processes():
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
        should_kill = (
            ('acestep.api_server' in cmd and '8001' in cmd)
            or ('acestep-api' in cmd and '8001' in cmd)
            or ('acestep_v15_pipeline' in cmd and '7860' in cmd)
            or ('cloudflared' in cmd and '8001' in cmd)
        )
        if should_kill:
            try:
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
    time.sleep(2)


def prepare_clean_repo():
    if not OLD.exists():
        raise RuntimeError(f'Cartella ACE-Step esistente non trovata: {OLD}')
    old_ckpt = OLD / 'checkpoints'
    if not old_ckpt.exists():
        raise RuntimeError(f'Checkpoint esistenti non trovati: {old_ckpt}')
    if not (old_ckpt / MODEL).exists():
        raise RuntimeError(f'Modello XL-Turbo non trovato nei checkpoint: {old_ckpt / MODEL}')

    if NEW.exists():
        print(f'Rimuovo solo il precedente ambiente CLEAN: {NEW}', flush=True)
        shutil.rmtree(NEW)

    run(['git', 'clone', '--depth', '1', 'https://github.com/ace-step/ACE-Step-1.5.git', str(NEW)], timeout=900)

    pyproject = NEW / 'pyproject.toml'
    if not pyproject.exists():
        raise RuntimeError('Clone ufficiale incompleto: pyproject.toml non trovato.')

    new_ckpt = NEW / 'checkpoints'
    if new_ckpt.exists() or new_ckpt.is_symlink():
        if new_ckpt.is_symlink() or new_ckpt.is_file():
            new_ckpt.unlink()
        else:
            shutil.rmtree(new_ckpt)
    os.symlink(old_ckpt, new_ckpt, target_is_directory=True)
    print(f'CHECKPOINT LINK: {new_ckpt} -> {old_ckpt}', flush=True)


def build_clean_env():
    uv = shutil.which('uv') or '/usr/local/bin/uv'
    if not Path(uv).exists():
        raise RuntimeError('uv non trovato su MoLab')

    env = os.environ.copy()
    env.pop('VIRTUAL_ENV', None)
    env['UV_PROJECT_ENVIRONMENT'] = str(NEW / '.venv')
    env['UV_PYTHON_DOWNLOADS'] = 'automatic'

    run([uv, 'python', 'install', '3.12'], env=env, timeout=600)
    run([uv, 'venv', str(NEW / '.venv'), '--python', '3.12', '--clear'], cwd=str(NEW), env=env, timeout=600)
    run([uv, 'sync', '--project', str(NEW), '--python', '3.12', '--no-dev'], cwd=str(NEW), env=env, timeout=7200)

    py = NEW / '.venv' / 'bin' / 'python'
    if not py.exists():
        raise RuntimeError(f'Python CLEAN non trovato: {py}')

    probe = run([
        str(py), '-c',
        "import sys,torch,torchaudio,torchvision,accelerate,vector_quantize_pytorch,loguru; "
        "import acestep.api_server; "
        "print('PYTHON='+sys.executable); "
        "print('TORCH='+torch.__version__); "
        "print('TORCHAUDIO='+torchaudio.__version__); "
        "print('TORCHVISION='+torchvision.__version__); "
        "print('ACCELERATE='+accelerate.__version__); "
        "print('VECTOR_QUANTIZE=OK'); "
        "print('CUDA='+str(torch.cuda.is_available())); "
        "print('DEVICE='+(torch.cuda.get_device_name(0) if torch.cuda.is_available() else 'NO_GPU'))"
    ], cwd=str(NEW), env=env, timeout=1200)

    if 'CUDA=True' not in probe.stdout:
        raise RuntimeError('L ambiente CLEAN non vede CUDA.')
    return py, env


def start_api(py, base_env):
    env = base_env.copy()
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

    log_path = WORK / 'api.log'
    log = open(log_path, 'w', buffering=1)
    cmd = [str(py), '-m', 'acestep.api_server', '--host', '0.0.0.0', '--port', str(PORT), '--download-source', 'huggingface']
    proc = subprocess.Popen(cmd, cwd=str(NEW), env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    print(f'ACE-STEP CLEAN API PID={proc.pid}', flush=True)

    deadline = time.time() + 1800
    last = None
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors='ignore')[-30000:] if log_path.exists() else ''
            raise RuntimeError('ACE-Step CLEAN API terminata:\n' + tail)
        try:
            last = request_json(f'http://127.0.0.1:{PORT}/health', 10)
            if health_ready(last):
                print('LOCAL_HEALTH=' + json.dumps(last, ensure_ascii=False)[:1800], flush=True)
                return proc
        except Exception:
            pass
        time.sleep(3)

    tail = log_path.read_text(errors='ignore')[-30000:] if log_path.exists() else ''
    raise RuntimeError('Timeout avvio ACE-Step CLEAN. Ultimo health=' + repr(last) + '\n' + tail)


def cloudflared_binary():
    for candidate in [Path('/tmp/cloudflared'), WORK / 'cloudflared']:
        if candidate.exists() and os.access(candidate, os.X_OK):
            return candidate
    arch = 'arm64' if platform.machine().lower() in {'arm64', 'aarch64'} else 'amd64'
    target = WORK / 'cloudflared'
    urllib.request.urlretrieve(
        f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}',
        target,
    )
    target.chmod(0o755)
    return target


def start_tunnel():
    binary = cloudflared_binary()
    log_path = WORK / 'cloudflare.log'
    log = open(log_path, 'w', buffering=1)
    proc = subprocess.Popen(
        [str(binary), 'tunnel', '--no-autoupdate', '--url', f'http://127.0.0.1:{PORT}'],
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    pattern = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com', re.I)
    deadline = time.time() + 180
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = log_path.read_text(errors='ignore')[-12000:] if log_path.exists() else ''
            raise RuntimeError('Cloudflare terminato:\n' + tail)
        text = log_path.read_text(errors='ignore') if log_path.exists() else ''
        m = pattern.search(text)
        if m:
            return proc, m.group(0).rstrip('/')
        time.sleep(1)
    raise RuntimeError('Cloudflare non ha restituito un URL pubblico.')


def verify_public(url):
    deadline = time.time() + 180
    last = None
    while time.time() < deadline:
        try:
            last = request_json(url + '/health', 20)
            if health_ready(last):
                return last
        except Exception as exc:
            last = {'error': repr(exc)}
        time.sleep(2)
    raise RuntimeError('Tunnel pubblico non verificato: ' + repr(last))


def main():
    print('=' * 80)
    print(' SONARA MOLAB - CLEAN ACE-STEP XL BOOTSTRAP ')
    print('=' * 80)
    print('Vecchio ambiente preservato:', OLD)
    print('Nuovo ambiente pulito:', NEW)

    prepare_clean_repo()
    py, env = build_clean_env()
    kill_old_processes()
    api_proc = start_api(py, env)
    tunnel_proc, public_url = start_tunnel()
    public_health = verify_public(public_url)

    print('\n' + '=' * 80)
    print(' ✅ SONARA MOLAB CLEAN XL-TURBO PRONTO ')
    print('=' * 80)
    print(f'SONARA_MOLAB_XL_URL={public_url}')
    print(f'MODEL={MODEL}')
    print(f'LOCAL_PORT={PORT}')
    print(f'CLEAN_ROOT={NEW}')
    print('PUBLIC_HEALTH=' + json.dumps(public_health, ensure_ascii=False)[:1800])
    print('=' * 80)
    print('NON FERMARE QUESTA CELLA.', flush=True)

    while True:
        if api_proc.poll() is not None:
            raise RuntimeError('ACE-Step CLEAN API si e fermata: ' + str(WORK / 'api.log'))
        if tunnel_proc.poll() is not None:
            raise RuntimeError('Cloudflare si e fermato: ' + str(WORK / 'cloudflare.log'))
        time.sleep(30)


if __name__ == '__main__':
    main()
