import importlib.util
import json
import os
import signal
import time
from pathlib import Path

BASE_SCRIPT = Path('/kaggle/working/Sonara-Enterprise/scripts/kaggle-sonara-music-v20-dual-t4.py')
if not BASE_SCRIPT.exists():
    BASE_SCRIPT = Path('/kaggle/working/kaggle-sonara-music-v20-dual-t4.py')
if not BASE_SCRIPT.exists():
    raise RuntimeError('Script SONARA V20 non trovato. Copia prima il repository Sonara-Enterprise in /kaggle/working/Sonara-Enterprise.')

spec = importlib.util.spec_from_file_location('sonara_music_v20', BASE_SCRIPT)
v20 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v20)

# Queue corta: evita ore di task zombie e rifiuta subito il sovraccarico.
v20.SETTINGS.update({
    'ACESTEP_QUEUE_MAXSIZE': '4',
    'ACESTEP_QUEUE_WORKERS': '1',
    'ACESTEP_AVG_JOB_SECONDS': '30',
    'ACESTEP_AVG_WINDOW': '10',
})

WATCH_INTERVAL = 10
STALL_SECONDS = 180
PORTS = v20.PORTS
WORK = v20.WORK


def stats(port):
    status, payload = v20.request_json(port, '/v1/stats', timeout=10)
    if status != 200:
        raise RuntimeError(f'/v1/stats HTTP {status}')
    data = payload.get('data') or payload
    jobs = data.get('jobs') or {}
    return {
        'queued': int(data.get('queue_size') or jobs.get('queued') or 0),
        'running': int(jobs.get('running') or 0),
        'succeeded': int(jobs.get('succeeded') or 0),
        'failed': int(jobs.get('failed') or 0),
    }


def stop_proc(proc):
    if proc is None:
        return
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGTERM)
    except Exception:
        try:
            proc.terminate()
        except Exception:
            pass
    deadline = time.time() + 8
    while time.time() < deadline:
        if proc.poll() is not None:
            return
        time.sleep(0.5)
    try:
        os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


def restart_worker(uv, gpu, processes):
    print(f'\n[WATCHDOG] GPU{gpu}: queue bloccata, riavvio ACE-Step sulla stessa porta {PORTS[gpu]}...', flush=True)
    stop_proc(processes.get(gpu))
    proc, info = v20.start_worker(uv, gpu)
    processes[gpu] = proc
    print(f'[WATCHDOG] GPU{gpu}: ripristinata. Tunnel Cloudflare invariato.', flush=True)
    return info


def main():
    print('=' * 92)
    print(' SONARA MUSIC V23 - DUAL T4 + AUTO-RECOVERY WATCHDOG ')
    print('=' * 92)
    print('Protezione: queue corta + rilevamento task zombie + riavvio automatico worker.', flush=True)

    v20.ensure_two_t4s()
    uv = v20.ensure_acestep()
    v20.patch_t4_float32()
    v20.stop_old_compute_keep_tunnels()
    v20.write_shared_env()

    processes = {}
    infos = {}
    for gpu in (0, 1):
        proc, info = v20.start_worker(uv, gpu)
        processes[gpu] = proc
        infos[gpu] = info

    urls = v20.resolve_public_urls()
    v20.URLS_FILE.write_text(
        f'GPU0={urls[0]}\nGPU1={urls[1]}\nMODE=MUSIC_DUAL_T4\nACTION=dual-t4-music-v23-watchdog\n',
        encoding='utf-8',
    )

    print('\n✅ SONARA V23 ONLINE')
    print(f'GPU0={urls[0]}')
    print(f'GPU1={urls[1]}')
    print('MODE=MUSIC_DUAL_T4')
    print('ACTION=dual-t4-music-v23-watchdog')
    print(f'Watchdog stall threshold: {STALL_SECONDS}s')
    print('Non chiudere questa cella: il watchdog deve restare attivo.\n', flush=True)

    state = {
        gpu: {
            'last_completed': None,
            'busy_since': None,
            'last_stats': None,
        }
        for gpu in (0, 1)
    }

    while True:
        now = time.time()
        for gpu in (0, 1):
            proc = processes.get(gpu)
            if proc is None or proc.poll() is not None:
                restart_worker(uv, gpu, processes)
                state[gpu] = {'last_completed': None, 'busy_since': None, 'last_stats': None}
                continue

            try:
                current = stats(PORTS[gpu])
            except Exception as exc:
                print(f'[WATCHDOG] GPU{gpu}: stats non disponibili: {exc}', flush=True)
                continue

            completed = current['succeeded'] + current['failed']
            busy = current['running'] > 0 or current['queued'] > 0
            previous_completed = state[gpu]['last_completed']

            if previous_completed is None or completed != previous_completed:
                state[gpu]['last_completed'] = completed
                state[gpu]['busy_since'] = now if busy else None
            elif busy:
                if state[gpu]['busy_since'] is None:
                    state[gpu]['busy_since'] = now
                elif now - state[gpu]['busy_since'] >= STALL_SECONDS:
                    print('[WATCHDOG] STALL DETECTED ' + json.dumps({
                        'gpu': gpu,
                        'seconds': int(now - state[gpu]['busy_since']),
                        **current,
                    }), flush=True)
                    restart_worker(uv, gpu, processes)
                    state[gpu] = {'last_completed': None, 'busy_since': None, 'last_stats': None}
                    continue
            else:
                state[gpu]['busy_since'] = None

            state[gpu]['last_stats'] = current
            print(f'[WATCHDOG] GPU{gpu} stats={current}', flush=True)

        time.sleep(WATCH_INTERVAL)


if __name__ == '__main__':
    main()
