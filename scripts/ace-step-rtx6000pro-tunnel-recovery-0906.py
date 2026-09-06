#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import os
import signal
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PORT = 8001
CHECK_EVERY = 5
V2_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/'
    'eab023fb99127b85318e8a7522cdb8db6d6d5d09/'
    'scripts/ace-step-real-music-v2-speed-quality-upgrade-0902.py'
)


def load_v2():
    target = Path(tempfile.gettempdir()) / 'sonara_v2_recovery_0906.py'
    req = urllib.request.Request(V2_URL, headers={'User-Agent': 'SONARA-TUNNEL-RECOVERY/2.0'})
    with urllib.request.urlopen(req, timeout=120) as r:
        target.write_bytes(r.read())
    spec = importlib.util.spec_from_file_location('sonara_v2_recovery', target)
    if spec is None or spec.loader is None:
        raise RuntimeError('Impossibile caricare il runtime recovery SONARA.')
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def kill_cloudflared():
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
        if 'cloudflared' in parts[1].lower():
            try:
                os.kill(pid, signal.SIGKILL)
                print(f'STOP_OLD_TUNNEL_PID={pid}', flush=True)
            except Exception:
                pass
    time.sleep(2)


def local_ready(v2) -> bool:
    try:
        return bool(v2.health_ready(v2.request_json(f'http://127.0.0.1:{PORT}/health', 8)))
    except Exception:
        return False


def public_ready(v2, url: str) -> bool:
    try:
        return bool(v2.health_ready(v2.request_json(url + '/health', 8)))
    except Exception:
        return False


def start_or_reuse_api(v2):
    if local_ready(v2):
        print('ACE_STEP_API=ALREADY_UP', flush=True)
        return None
    print('ACE_STEP_API=RESTARTING', flush=True)
    proc, backend, compile_model, _health = v2.start_best_api()
    print(f'ACE_STEP_API=UP backend={backend} compile={str(compile_model).lower()}', flush=True)
    return proc


def start_tunnel(v2):
    last_error = None
    for attempt in range(1, 7):
        kill_cloudflared()
        try:
            print(f'CLOUDFLARE_RECOVERY_ATTEMPT={attempt}/6', flush=True)
            proc, public_url = v2.start_new_tunnel()
            deadline = time.time() + 40
            while time.time() < deadline:
                if proc.poll() is not None:
                    break
                if public_ready(v2, public_url):
                    print('\n' + '=' * 110, flush=True)
                    print('SONARA MOLAB XL TUNNEL RECOVERY READY', flush=True)
                    print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
                    print('MODEL=acestep-v15-xl-turbo', flush=True)
                    print('FAST=1_STEP QUALITY=2_STEPS ULTRA=2_STEPS MAX_BATCH_SIZE=2', flush=True)
                    print('QUALITY_AB=INDEPENDENT_COMPOSITIONS_V8_EDGE NATURAL_TONE=V14 RICH_ARRANGEMENT=V13', flush=True)
                    print('QUESTA E LA CELLA DA LASCIARE ATTIVA.', flush=True)
                    print('=' * 110 + '\n', flush=True)
                    return proc, public_url
                time.sleep(2)
            last_error = RuntimeError(f'Tunnel non pronto: {public_url}')
        except Exception as exc:
            last_error = exc
            print(f'CLOUDFLARE_ATTEMPT_FAILED={type(exc).__name__}: {exc}', flush=True)
        time.sleep(min(2 * attempt, 10))
    raise RuntimeError(f'Impossibile creare un Quick Tunnel sano dopo 6 tentativi: {last_error}')


def main():
    if not ROOT.exists():
        raise RuntimeError('ACE-Step non risulta installato in /marimo/SONARA-ACE-Step-CLEAN.')

    v2 = load_v2()
    api_proc = start_or_reuse_api(v2)
    tunnel_proc, public_url = start_tunnel(v2)
    failures = 0

    while True:
        time.sleep(CHECK_EVERY)

        if not local_ready(v2):
            print('WATCHDOG: API locale non pronta, riavvio ACE-Step...', flush=True)
            api_proc = start_or_reuse_api(v2)

        if public_ready(v2, public_url):
            failures = 0
        else:
            failures += 1
            print(f'WATCHDOG: public health failure {failures}/2', flush=True)

        if tunnel_proc.poll() is not None or failures >= 2:
            print('WATCHDOG: Quick Tunnel offline/HTTP 530, rigenero URL Cloudflare...', flush=True)
            tunnel_proc, public_url = start_tunnel(v2)
            failures = 0

        print(
            f"[{time.strftime('%H:%M:%S')}] SONARA RTX6000PRO | API=UP | PUBLIC=UP | "
            f"FAST=1 | QUALITY=2 | ULTRA=2 | BATCH=2 | {public_url}",
            flush=True,
        )


if __name__ == '__main__':
    main()
