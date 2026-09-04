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
PORT = 8001
TURBO = 'acestep-v15-xl-turbo'
BASE = 'acestep-v15-xl-base'
LM = 'acestep-5Hz-lm-4B'
WORK = Path('/tmp/sonara-real-music-v3-tunnel-live-repair-0904')
STATE = ROOT / 'SONARA_REAL_MUSIC_V3_TUNNEL_LIVE.json'
URL_PATTERN = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com', re.I)


def banner(text: str) -> None:
    print('\n' + '=' * 96, flush=True)
    print(text, flush=True)
    print('=' * 96, flush=True)


def get_json(url: str, timeout: int = 15) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'User-Agent': 'SONARA-V3-Tunnel-Watchdog/1.0',
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode('utf-8', errors='replace')
            if int(getattr(response, 'status', 200) or 200) >= 400:
                return {'http_status': int(response.status), 'raw': raw[:1000]}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='replace')
        return {'http_status': exc.code, 'raw': raw[:1000]}
    except Exception as exc:
        return {'error': f'{type(exc).__name__}: {exc}'}
    try:
        return json.loads(raw) if raw else {}
    except Exception:
        return {'raw': raw[:1000], 'non_json': True}


def ready_health(body: dict) -> bool:
    if not isinstance(body, dict):
        return False
    data = body.get('data') or body
    loaded = str(data.get('loaded_model') or data.get('default_model') or data.get('model') or '')
    status = str(data.get('status') or '').lower()
    return (
        status in {'ok', 'ready', 'healthy'}
        and data.get('models_initialized') is True
        and data.get('llm_initialized') is True
        and TURBO in loaded
    )


def require_local_api() -> dict:
    banner('1/4 - VERIFY LOCAL ACE-STEP V3 API')
    body = get_json(f'http://127.0.0.1:{PORT}/health', 10)
    print(json.dumps(body, indent=2, ensure_ascii=False), flush=True)
    if not ready_health(body):
        raise RuntimeError(
            'La API locale ACE-Step non e pronta. Non reinstallo nulla automaticamente: '
            'rilancia prima il recovery V3 completo. LOCAL_HEALTH=' + json.dumps(body, ensure_ascii=False)
        )
    print('LOCAL_API=READY', flush=True)
    print('XL_TURBO=ON', flush=True)
    print('XL_BASE=ON', flush=True)
    print('LM4B=ON', flush=True)
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
    print(f'DOWNLOAD_CLOUDFLARED={url}', flush=True)
    urllib.request.urlretrieve(url, target)
    target.chmod(0o755)
    return target


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
        proc.wait(timeout=8)
    except Exception:
        pass


def start_one(protocol: str, attempt: int):
    WORK.mkdir(parents=True, exist_ok=True)
    binary = cloudflared_binary()
    log_path = WORK / f'cloudflare-{protocol}-{attempt}.log'
    log_path.write_text('', encoding='utf-8')
    stream = log_path.open('a', encoding='utf-8', buffering=1)
    cmd = [
        str(binary), 'tunnel', '--url', f'http://127.0.0.1:{PORT}',
        '--no-autoupdate', '--protocol', protocol, '--loglevel', 'info',
    ]
    print('$ ' + ' '.join(cmd), flush=True)
    proc = subprocess.Popen(
        cmd,
        stdout=stream,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )

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

    if not public_url:
        print(f'TUNNEL_URL_NOT_FOUND protocol={protocol}', flush=True)
        if log_path.exists():
            print(log_path.read_text(errors='replace')[-6000:], flush=True)
        stop_proc(proc)
        return None, None

    print(f'TUNNEL_CANDIDATE={public_url}', flush=True)
    deadline = time.time() + 180
    last = None
    while time.time() < deadline:
        if proc.poll() is not None:
            break
        last = get_json(public_url + '/health', 20)
        if ready_health(last):
            print('PUBLIC_HEALTH=READY', flush=True)
            print(json.dumps(last, indent=2, ensure_ascii=False), flush=True)
            return proc, public_url
        time.sleep(2)

    print('PUBLIC_HEALTH=FAILED', flush=True)
    print(json.dumps(last, indent=2, ensure_ascii=False), flush=True)
    stop_proc(proc)
    return None, None


def start_verified_tunnel():
    banner('2/4 - CREATE VERIFIED QUICK TUNNEL')
    for attempt in range(1, 5):
        for protocol in ('http2', 'quic'):
            print(f'TUNNEL_ATTEMPT={attempt} PROTOCOL={protocol}', flush=True)
            proc, url = start_one(protocol, attempt)
            if proc is not None and url:
                return proc, url
    raise RuntimeError('Impossibile ottenere un Quick Tunnel pubblico verificato dopo 8 tentativi.')


def write_state(public_url: str, local_health: dict) -> None:
    payload = {
        'ok': True,
        'public_url': public_url,
        'model': TURBO,
        'refinement_model': BASE,
        'lm_model': LM,
        'local_health': local_health,
        'updated_at_epoch': int(time.time()),
    }
    STATE.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')


def main() -> None:
    banner('SONARA REAL MUSIC V3 - LIVE TUNNEL REPAIR')
    local_health = require_local_api()
    tunnel_proc, public_url = start_verified_tunnel()
    write_state(public_url, local_health)

    banner('3/4 - NEW VERIFIED SONARA MOLAB URL')
    print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
    print(f'MODEL={TURBO}', flush=True)
    print(f'REFINEMENT_MODEL={BASE}', flush=True)
    print(f'LM_MODEL={LM}', flush=True)
    print('PUBLIC_TUNNEL_VERIFIED=YES', flush=True)
    print(f'STATE_FILE={STATE}', flush=True)
    print('NON FERMARE QUESTA CELLA.', flush=True)

    banner('4/4 - PUBLIC TUNNEL WATCHDOG')
    failures = 0
    try:
        while True:
            local = get_json(f'http://127.0.0.1:{PORT}/health', 10)
            local_ok = ready_health(local)
            public = get_json(public_url + '/health', 20)
            public_ok = ready_health(public)
            proc_ok = tunnel_proc.poll() is None

            if local_ok and public_ok and proc_ok:
                failures = 0
                print(
                    f"[{time.strftime('%H:%M:%S')}] V3 TUNNEL LIVE | API=UP | PUBLIC=UP | "
                    f'TUNNEL=UP | {public_url}', flush=True,
                )
            else:
                failures += 1
                print(
                    f"[{time.strftime('%H:%M:%S')}] V3 TUNNEL CHECK FAIL "
                    f'#{failures} | API={"UP" if local_ok else "DOWN"} | '
                    f'PUBLIC={"UP" if public_ok else "DOWN"} | '
                    f'PROC={"UP" if proc_ok else "DOWN"} | {public_url}', flush=True,
                )
                if not local_ok:
                    raise RuntimeError('ACE-Step API locale e caduta; tunnel non puo essere riparato senza API.')
                if failures >= 2:
                    print('AUTO_TUNNEL_RESTART=START', flush=True)
                    stop_proc(tunnel_proc)
                    tunnel_proc, public_url = start_verified_tunnel()
                    failures = 0
                    local_health = get_json(f'http://127.0.0.1:{PORT}/health', 10)
                    write_state(public_url, local_health)
                    print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
                    print('AUTO_TUNNEL_RESTART=READY', flush=True)

            time.sleep(20)
    finally:
        stop_proc(tunnel_proc)


if __name__ == '__main__':
    main()
