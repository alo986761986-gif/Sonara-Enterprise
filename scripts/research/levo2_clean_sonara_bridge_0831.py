#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import platform
import re
import secrets
import shutil
import subprocess
import time
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-LeVo2-CLEAN')
VENV = ROOT / 'venv'
PYTHON = VENV / 'bin' / 'python'
PORT = 8022
BIN_DIR = ROOT / 'bin'
WORKER_PATH = ROOT / 'sonara_levo2_worker_clean.py'
KEY_PATH = ROOT / 'LEVO2_RESEARCH_API_KEY.txt'
URL_PATH = ROOT / 'SONARA_LEVO2_RESEARCH_URL.txt'
WORKER_SOURCE_URL = (
    'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/'
    'feature/levo2-research-engine-20260831/scripts/levo2_research_worker.py'
)


def banner(text: str) -> None:
    print('\n' + '=' * 88, flush=True)
    print(text, flush=True)
    print('=' * 88, flush=True)


def require_clean_install() -> None:
    required = [
        PYTHON,
        ROOT / 'levo2-official' / 'generate.sh',
        ROOT / 'levo2-official' / 'generate.py',
        ROOT / 'levo2-official' / 'ckpt',
        ROOT / 'levo2-official' / 'third_party',
        ROOT / 'songgeneration_v2_large',
        ROOT / 'levo2-official' / 'tools' / 'new_auto_prompt.pt',
    ]
    missing = [str(p) for p in required if not p.exists()]
    if missing:
        raise RuntimeError('LeVo2 CLEAN incompleto. Mancano:\n' + '\n'.join(missing))


def ensure_api_key() -> str:
    if KEY_PATH.exists():
        key = KEY_PATH.read_text(encoding='utf-8').strip()
        if key:
            return key

    # Reuse the previous private research key when the old R&D volume is still present.
    # This allows an existing Vercel preview credential to continue working without
    # ever printing the secret in notebook logs.
    old = Path('/marimo/SONARA-LeVo2-RESEARCH/LEVO2_RESEARCH_API_KEY.txt')
    if old.exists():
        key = old.read_text(encoding='utf-8').strip()
        if key:
            KEY_PATH.write_text(key + '\n', encoding='utf-8')
            KEY_PATH.chmod(0o600)
            print('AUTH: chiave privata R&D precedente riutilizzata (valore nascosto).', flush=True)
            return key

    key = secrets.token_urlsafe(48)
    KEY_PATH.write_text(key + '\n', encoding='utf-8')
    KEY_PATH.chmod(0o600)
    print('AUTH: nuova chiave privata R&D creata (valore nascosto).', flush=True)
    print(f'AUTH_FILE={KEY_PATH}', flush=True)
    return key


def download_worker() -> None:
    # Cache-buster so a recently updated branch cannot be hidden by raw GitHub cache.
    req = urllib.request.Request(
        WORKER_SOURCE_URL + f'?sonara={int(time.time())}',
        headers={'User-Agent': 'SONARA-LeVo2-Clean-Bridge/1.0'},
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        source = response.read().decode('utf-8')

    old_root = "ROOT = Path(os.environ.get('LEVO2_ROOT', '/marimo/SONARA-LeVo2-RESEARCH')).resolve()"
    new_root = "ROOT = Path(os.environ.get('LEVO2_ROOT', '/marimo/SONARA-LeVo2-CLEAN')).resolve()"
    if old_root in source:
        source = source.replace(old_root, new_root)

    # Upstream generate.sh accepts --bgm / --vocal / --separate, not --generate_type.
    old_modes = """    if request['generate_type'] != 'mixed':\n        command.extend(['--generate_type', request['generate_type']])"""
    new_modes = """    if request['generate_type'] == 'bgm':\n        command.append('--bgm')\n    elif request['generate_type'] == 'vocal':\n        command.append('--vocal')\n    elif request['generate_type'] == 'separate':\n        command.append('--separate')"""
    if old_modes in source:
        source = source.replace(old_modes, new_modes)

    # PyTorch >= 2.6 compatibility required by the official LeVo checkpoints.
    hf_line = "    env['HF_HOME'] = os.environ.get('HF_HOME', str(ROOT / '.hf-home'))"
    if hf_line in source and 'TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD' not in source:
        source = source.replace(
            hf_line,
            hf_line + "\n    env['TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD'] = '1'\n    env['PYTHONNOUSERSITE'] = '1'",
        )

    # SONARA can send plain lyrics. Wrap them in a valid LeVo section when the
    # user has not supplied official section tags already.
    lyrics_line = "    lyrics = str(payload.get('lyrics') or '').strip()"
    lyrics_patch = """    lyrics = str(payload.get('lyrics') or '').strip()\n    if lyrics and not re.search(r'\\[(?:verse|chorus|bridge|intro|inst|outro)', lyrics, re.I):\n        plain = ' '.join(part.strip() for part in lyrics.replace('\\r', '\\n').split('\\n') if part.strip())\n        lyrics = f'[intro-short] ; [verse] {plain} ; [outro-short]'"""
    if lyrics_line in source and lyrics_patch not in source:
        source = source.replace(lyrics_line, lyrics_patch)
        if '\nimport re\n' not in source:
            source = source.replace('import os\n', 'import os\nimport re\n')

    if '/marimo/SONARA-LeVo2-CLEAN' not in source:
        raise RuntimeError('Patch ROOT del worker LeVo2 CLEAN non applicata.')
    if "command.append('--bgm')" not in source:
        raise RuntimeError('Patch modalita LeVo2 non applicata.')

    WORKER_PATH.write_text(source, encoding='utf-8')
    WORKER_PATH.chmod(0o700)
    print(f'WORKER={WORKER_PATH}', flush=True)


def ensure_cloudflared() -> Path:
    existing = shutil.which('cloudflared')
    if existing:
        return Path(existing)

    BIN_DIR.mkdir(parents=True, exist_ok=True)
    target = BIN_DIR / 'cloudflared'
    machine = platform.machine().lower()
    if machine in {'x86_64', 'amd64'}:
        asset = 'cloudflared-linux-amd64'
    elif machine in {'aarch64', 'arm64'}:
        asset = 'cloudflared-linux-arm64'
    else:
        raise RuntimeError(f'Architettura non supportata per cloudflared: {machine}')

    url = f'https://github.com/cloudflare/cloudflared/releases/latest/download/{asset}'
    print(f'Cloudflared non presente: installo {asset}...', flush=True)
    urllib.request.urlretrieve(url, target)
    target.chmod(0o755)
    return target


def stop_previous_bridge() -> None:
    for pattern in ('sonara_levo2_worker_clean.py', 'cloudflared tunnel --url http://127.0.0.1:8022'):
        subprocess.run(['pkill', '-f', pattern], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=False)
    time.sleep(1)


def health(api_key: str) -> dict:
    req = urllib.request.Request(
        f'http://127.0.0.1:{PORT}/health',
        headers={'Authorization': f'Bearer {api_key}', 'User-Agent': 'SONARA-LeVo2-Bridge/1.0'},
    )
    with urllib.request.urlopen(req, timeout=10) as response:
        return json.loads(response.read().decode('utf-8'))


def wait_worker(api_key: str, proc: subprocess.Popen, timeout: int = 45) -> dict:
    deadline = time.time() + timeout
    last_error = None
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(f'Worker LeVo2 terminato prematuramente con codice {proc.returncode}.')
        try:
            data = health(api_key)
            if data.get('ready') is True:
                return data
            last_error = data
        except Exception as exc:
            last_error = exc
        time.sleep(1)
    raise RuntimeError(f'Worker LeVo2 non pronto entro {timeout}s: {last_error}')


def start_worker(api_key: str) -> subprocess.Popen:
    env = os.environ.copy()
    env['LEVO2_ROOT'] = str(ROOT)
    env['LEVO2_RESEARCH_PORT'] = str(PORT)
    env['LEVO2_RESEARCH_API_KEY'] = api_key
    env['TORCH_FORCE_NO_WEIGHTS_ONLY_LOAD'] = '1'
    env['PYTHONNOUSERSITE'] = '1'
    log_path = ROOT / 'sonara_levo2_worker.log'
    log = log_path.open('a', encoding='utf-8')
    proc = subprocess.Popen(
        [str(PYTHON), str(WORKER_PATH), '--host', '127.0.0.1', '--port', str(PORT)],
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f'WORKER_PID={proc.pid}', flush=True)
    print(f'WORKER_LOG={log_path}', flush=True)
    return proc


def start_tunnel(cloudflared: Path) -> tuple[subprocess.Popen, str]:
    proc = subprocess.Popen(
        [str(cloudflared), 'tunnel', '--url', f'http://127.0.0.1:{PORT}', '--no-autoupdate'],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
        start_new_session=True,
    )
    assert proc.stdout is not None
    pattern = re.compile(r'https://[a-z0-9-]+\\.trycloudflare\\.com')
    deadline = time.time() + 90
    seen = []
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError('Cloudflare Quick Tunnel terminato prima di ottenere URL.')
        line = proc.stdout.readline()
        if not line:
            time.sleep(0.2)
            continue
        line = line.rstrip()
        seen.append(line)
        match = pattern.search(line)
        if match:
            return proc, match.group(0)
    raise RuntimeError('URL Quick Tunnel non trovato. Ultime righe:\n' + '\n'.join(seen[-20:]))


def main() -> None:
    banner('SONARA - LEVO2 CLEAN BRIDGE / R&D PREVIEW ONLY')
    print('Nessuna generazione di test verra avviata.', flush=True)
    print('Produzione commerciale: BLOCCATA dalla licenza LeVo2 corrente.', flush=True)
    require_clean_install()
    api_key = ensure_api_key()
    download_worker()
    cloudflared = ensure_cloudflared()
    stop_previous_bridge()

    worker = start_worker(api_key)
    status = wait_worker(api_key, worker)
    print(f"LOCAL_HEALTH=READY | ENGINE={status.get('engine')} | ROOT={status.get('root')}", flush=True)

    tunnel, public_url = start_tunnel(cloudflared)
    URL_PATH.write_text(public_url + '\n', encoding='utf-8')

    banner('SONARA LEVO2 R&D BRIDGE ATTIVO')
    print(f'SONARA_LEVO2_RESEARCH_URL={public_url}', flush=True)
    print(f'LOCAL_PORT={PORT}', flush=True)
    print(f'ROOT={ROOT}', flush=True)
    print('MODEL=SongGeneration-v2-large', flush=True)
    print('AUTH=ON (secret hidden)', flush=True)
    print(f'AUTH_FILE={KEY_PATH}', flush=True)
    print('LICENSE_MODE=RESEARCH_ONLY', flush=True)
    print('GENERATION_TEST=NOT_RUN', flush=True)
    print('QUESTA CELLA DEVE RESTARE IN ESECUZIONE.', flush=True)
    print('=' * 88, flush=True)

    try:
        while True:
            if worker.poll() is not None:
                raise RuntimeError(f'Worker LeVo2 fermato, exit={worker.returncode}')
            if tunnel.poll() is not None:
                raise RuntimeError(f'Tunnel Cloudflare fermato, exit={tunnel.returncode}')
            try:
                current = health(api_key)
                ok = current.get('ready') is True
            except Exception:
                ok = False
            print(
                f"[{time.strftime('%H:%M:%S')}] HEARTBEAT | WORKER={'UP' if ok else 'DOWN'} | TUNNEL=UP | {public_url}",
                flush=True,
            )
            time.sleep(60)
    finally:
        for proc in (tunnel, worker):
            if proc.poll() is None:
                proc.terminate()


if __name__ == '__main__':
    main()
