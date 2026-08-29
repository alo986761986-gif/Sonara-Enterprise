import importlib.util
import json
import os
import time
from pathlib import Path

HERE = Path(__file__).resolve().parent if '__file__' in globals() else Path('/kaggle/working/Sonara-Enterprise/scripts')
BASE_SCRIPT = HERE / 'kaggle-sonara-music-v20-dual-t4.py'
if not BASE_SCRIPT.exists():
    BASE_SCRIPT = Path('/kaggle/working/Sonara-Enterprise/scripts/kaggle-sonara-music-v20-dual-t4.py')
if not BASE_SCRIPT.exists():
    raise RuntimeError('kaggle-sonara-music-v20-dual-t4.py non trovato nel repository SONARA.')

spec = importlib.util.spec_from_file_location('sonara_music_v20', BASE_SCRIPT)
v20 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(v20)

# Definitive T4 render profile: keep the proven FLOAT32 path, but do not load
# the 5Hz LM inside the render workers. Live diagnostics showed that the LM/CoT
# phase can remain at status=0 for minutes even for a 5-second / 1-step job.
v20.SETTINGS.update({
    'ACESTEP_DTYPE': 'float32',
    'ACESTEP_INIT_LLM': 'false',
    'ACESTEP_LM_BACKEND': 'pt',
    'ACESTEP_LM_OFFLOAD_TO_CPU': 'true',
    'ACESTEP_OFFLOAD_TO_CPU': 'true',
    'ACESTEP_OFFLOAD_DIT_TO_CPU': 'false',
    'ACESTEP_API_WORKERS': '1',
    'ACESTEP_QUEUE_WORKERS': '1',
    'ACESTEP_QUEUE_MAXSIZE': '4',
    'ACESTEP_AVG_JOB_SECONDS': '30',
    'ACESTEP_AVG_WINDOW': '10',
})


def init_and_verify_render_only(port: int, log_path: Path):
    init_payload = {
        'model': v20.MODEL,
        'slot': 1,
        'init_llm': False,
        'lm_model_path': '',
    }
    status, body = v20.request_json(port, '/v1/init', init_payload, timeout=900)
    if status != 200 or body.get('code') not in (None, 200):
        tail = log_path.read_text(errors='ignore')[-30000:] if log_path.exists() else ''
        raise RuntimeError(f'/v1/init render-only porta {port} fallita: {body}\n{tail}')

    deadline = time.time() + 180
    last = {}
    while time.time() < deadline:
        try:
            health_status, health = v20.request_json(port, '/health', timeout=10)
            inv_status, inventory = v20.request_json(port, '/v1/model_inventory', timeout=10)
            health_data = health.get('data') or health
            inv_data = inventory.get('data') or inventory
            last = {'health': health_data, 'inventory': inv_data}
            loaded_turbo = any(
                str(item.get('name')) == v20.MODEL and item.get('is_loaded') is True
                for item in (inv_data.get('models') or []) if isinstance(item, dict)
            )
            if health_status == 200 and inv_status == 200 and health_data.get('models_initialized') is True and loaded_turbo:
                return last
        except Exception:
            pass
        time.sleep(3)
    raise RuntimeError(f'Worker render-only porta {port} non pronto: {json.dumps(last, ensure_ascii=False)[:6000]}')


def public_render_ok(base: str, timeout=60):
    deadline = time.time() + timeout
    last = ''
    while time.time() < deadline:
        try:
            req = v20.urllib.request.Request(base + '/health', headers={'Cache-Control': 'no-cache'})
            with v20.urllib.request.urlopen(req, timeout=12) as response:
                payload = json.loads(response.read().decode('utf-8', errors='ignore'))
                data = payload.get('data') or payload
                last = json.dumps(payload, ensure_ascii=False)
                if response.status == 200 and data.get('models_initialized') is True and 'acestep-v15-turbo' in str(data.get('loaded_model') or ''):
                    return True
        except Exception as exc:
            last = repr(exc)
        time.sleep(3)
    print(f'Endpoint render-only non verificato: {base} -> {last}', flush=True)
    return False


def real_render_probe(base: str, label: str, timeout=150):
    payload = {
        'prompt': 'deep house instrumental, 122 BPM, dark warm bass, professional club mix',
        'lyrics': '',
        'model': v20.MODEL,
        'audio_duration': 5,
        'inference_steps': 1,
        'thinking': False,
        'use_format': False,
        'use_cot_metas': False,
        'use_cot_caption': False,
        'use_cot_language': False,
        'constrained_decoding': False,
        'allow_lm_batch': False,
    }
    req = v20.urllib.request.Request(
        base + '/release_task',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
        method='POST',
    )
    with v20.urllib.request.urlopen(req, timeout=30) as response:
        submitted = json.loads(response.read().decode('utf-8', errors='replace'))
    task_id = str((submitted.get('data') or {}).get('task_id') or '')
    if not task_id:
        raise RuntimeError(f'{label}: probe non ha restituito task_id: {submitted}')

    deadline = time.time() + timeout
    last = {}
    while time.time() < deadline:
        req = v20.urllib.request.Request(
            base + '/query_result',
            data=json.dumps({'task_id_list': [task_id]}).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
            method='POST',
        )
        with v20.urllib.request.urlopen(req, timeout=20) as response:
            last = json.loads(response.read().decode('utf-8', errors='replace'))
        task = ((last.get('data') or [{}])[0] or {})
        status = int(task.get('status') or 0)
        if status == 1:
            print(f'{label}: REAL RENDER PROBE OK', flush=True)
            return True
        if status not in (0,):
            raise RuntimeError(f'{label}: render probe fallito: {json.dumps(last, ensure_ascii=False)[:4000]}')
        time.sleep(3)
    raise RuntimeError(f'{label}: render probe bloccato oltre {timeout}s: {json.dumps(last, ensure_ascii=False)[:5000]}')


# Monkey-patch the V20 helpers so its startup/tunnel flow is reused unchanged.
v20.init_and_verify = init_and_verify_render_only
v20.public_acestep_ok = public_render_ok


def main():
    print('=' * 92)
    print(' SONARA MUSIC V24 - DEFINITIVE T4 RENDER-ONLY DUAL MODE ')
    print('=' * 92)
    print('5Hz LM interno ai worker: OFF (rimosso dal percorso che causava il 68%).')
    print('DiT: FLOAT32 T4-safe. Due brani: GPU0 + GPU1 in parallelo.')

    v20.ensure_two_t4s()
    uv = v20.ensure_acestep()
    v20.patch_t4_float32()
    v20.stop_old_compute_keep_tunnels()
    v20.write_shared_env()

    processes = {}
    for gpu in (0, 1):
        proc, _ = v20.start_worker(uv, gpu)
        processes[gpu] = proc

    urls = v20.resolve_public_urls()

    print('\n[PROBE] Verifica render reale prima della pubblicazione...')
    real_render_probe(urls[0], 'GPU0')
    real_render_probe(urls[1], 'GPU1')

    v20.URLS_FILE.write_text(
        f'GPU0={urls[0]}\nGPU1={urls[1]}\nMODE=MUSIC_DUAL_T4\nACTION=dual-t4-music-v24-render-only\n',
        encoding='utf-8',
    )

    print('\n' + '=' * 92)
    print(' ✅ SONARA V24 RENDER-ONLY VERIFIED ')
    print('=' * 92)
    print(f'GPU0={urls[0]}')
    print(f'GPU1={urls[1]}')
    print('MODE=MUSIC_DUAL_T4')
    print('ACTION=dual-t4-music-v24-render-only')
    print('5Hz LM worker path: OFF')
    print('Real render probe: GPU0 OK / GPU1 OK')
    print('IMPORTANTE: lascia questa cella/sessione Kaggle attiva.')

    # Keep the bootstrap process alive so accidental notebook cleanup is less likely
    # to terminate the supervision context. Worker processes themselves run in their
    # own sessions and Cloudflare tunnels remain independent.
    while True:
        for gpu, proc in processes.items():
            if proc.poll() is not None:
                raise RuntimeError(f'GPU{gpu}: processo ACE-Step terminato dopo il probe.')
        time.sleep(30)


if __name__ == '__main__':
    main()
