import json
import os
import shutil
import signal
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

BASE = Path('/kaggle/working/ACE-Step-1.5')
UV = shutil.which('uv') or '/usr/local/bin/uv'
PORT = 7860
GPU = '0'
LOG = Path('/kaggle/working/sonara_music_v17_gpu0.log')

if not BASE.is_dir():
    raise RuntimeError(f'ACE-Step non trovato: {BASE}')
if not Path(UV).exists():
    raise RuntimeError(f'uv non trovato: {UV}')

print('=' * 76)
print(' SONARA MUSIC V17 - ASYNC API + LOCAL MODEL INIT / GPU1 VIDEO SAFE ')
print('=' * 76)

try:
    rows = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
except Exception:
    rows = ''

stopped = []
for row in rows.splitlines():
    parts = row.strip().split(maxsplit=1)
    if len(parts) != 2:
        continue
    try:
        pid = int(parts[0])
    except ValueError:
        continue
    cmd = parts[1]
    low = cmd.lower()
    if pid == os.getpid() or 'cloudflared' in low:
        continue
    if 'acestep' in low and ('--port 7860' in low or '--port=7860' in low):
        try:
            os.kill(pid, signal.SIGTERM)
            stopped.append(pid)
        except Exception:
            pass

if stopped:
    time.sleep(3)
    for pid in stopped:
        try:
            os.kill(pid, 0)
            os.kill(pid, signal.SIGKILL)
        except Exception:
            pass
print(f'GPU0 music worker fermati: {len(stopped)}')
print('GPU1 Video AI: NON TOCCATA')
print('Cloudflared   : NON TOCCATO')

# T4-stable profile. Start the REST service in lazy mode first, then call the
# official local /v1/init endpoint. This prevents startup crashes from hiding
# the real model initialization error and keeps HTTP generation asynchronous.
settings = {
    'ACESTEP_DEVICE': 'cuda',
    'ACESTEP_DTYPE': 'float32',
    'ACESTEP_CONFIG_PATH': 'acestep-v15-turbo',
    'ACESTEP_NO_INIT': 'true',
    'ACESTEP_INIT_LLM': 'true',
    'ACESTEP_LM_MODEL_PATH': 'acestep-5Hz-lm-0.6B',
    'ACESTEP_LM_BACKEND': 'pt',
    'ACESTEP_LM_DEVICE': 'cuda',
    'ACESTEP_LM_OFFLOAD_TO_CPU': 'true',
    'ACESTEP_OFFLOAD_TO_CPU': 'true',
    'ACESTEP_OFFLOAD_DIT_TO_CPU': 'false',
    'ACESTEP_USE_FLASH_ATTENTION': 'false',
    # Compile affects speed, not generation quality. Keep it off for the T4
    # bootstrap to avoid compiler/cache failures; it can be re-enabled later.
    'ACESTEP_COMPILE_MODEL': 'false',
    'ACESTEP_SAVE_MEMORY': '1',
    'ACESTEP_API_WORKERS': '1',
    'ACESTEP_QUEUE_WORKERS': '1',
    'ACESTEP_QUEUE_MAXSIZE': '64',
    'TOKENIZERS_PARALLELISM': 'false',
    'MPLBACKEND': 'Agg',
}

env_path = BASE / '.env'
existing = env_path.read_text(encoding='utf-8', errors='ignore') if env_path.exists() else ''
lines = existing.splitlines()
for key, value in settings.items():
    prefix = key + '='
    lines = [line for line in lines if not line.strip().startswith(prefix)]
    lines.append(f'{key}={value}')
env_path.write_text('\n'.join(lines).strip() + '\n', encoding='utf-8')

common = [
    UV, 'run', '--no-sync', 'acestep-api',
    '--host', '0.0.0.0',
    '--port', str(PORT),
    '--download-source', 'huggingface',
    '--no-init',
    '--lm-model-path', 'acestep-5Hz-lm-0.6B',
]

env = os.environ.copy()
env.update({
    'CUDA_VISIBLE_DEVICES': GPU,
    **settings,
    'PYTHONUNBUFFERED': '1',
    'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
})

log_handle = open(LOG, 'w', buffering=1)
proc = subprocess.Popen(
    common,
    cwd=str(BASE),
    env=env,
    stdout=log_handle,
    stderr=subprocess.STDOUT,
    start_new_session=True,
)
print(f'GPU0 SONARA Music V17 API PID {proc.pid} -> port {PORT}')
print('Avvio API leggera in corso...')


def request_json(path: str, payload=None, timeout: int = 20):
    data = None
    method = 'GET'
    headers = {'Accept': 'application/json'}
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')
        method = 'POST'
        headers['Content-Type'] = 'application/json'
    req = urllib.request.Request(
        f'http://127.0.0.1:{PORT}{path}',
        data=data,
        headers=headers,
        method=method,
    )
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            raw = response.read().decode('utf-8', errors='replace')
            body = json.loads(raw) if raw else {}
            return response.status, body, time.time() - started
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='replace')
        try:
            body = json.loads(raw) if raw else {}
        except Exception:
            body = {'raw': raw}
        return exc.code, body, time.time() - started


def server_health_ok():
    try:
        status, payload, _ = request_json('/health', timeout=5)
        data = payload.get('data') or payload
        state = str(data.get('status') or payload.get('status') or '').lower()
        return status == 200 and state in {'ok', 'ready', 'healthy', 'online', 'success'}
    except Exception:
        return False


# Phase 1: only require the API process to become reachable. Models are still
# intentionally unloaded at this point.
server_deadline = time.time() + 180
while time.time() < server_deadline:
    if proc.poll() is not None:
        tail = LOG.read_text(errors='ignore')[-24000:] if LOG.exists() else ''
        raise RuntimeError('acestep-api terminata prima della health:\n' + tail)
    if server_health_ok():
        break
    time.sleep(3)
else:
    tail = LOG.read_text(errors='ignore')[-24000:] if LOG.exists() else ''
    raise RuntimeError('Timeout avvio acestep-api:\n' + tail)

print('API locale: ONLINE')
print('Carico ora Turbo + 5Hz LM 0.6B tramite /v1/init...')

# Phase 2: official API model initialization. This request is local, so it can
# safely take several minutes without Cloudflare/HTTP 524 limits.
init_payload = {
    'model': 'acestep-v15-turbo',
    'slot': 1,
    'init_llm': True,
    'lm_model_path': 'acestep-5Hz-lm-0.6B',
}
try:
    init_status, init_body, init_seconds = request_json('/v1/init', init_payload, timeout=900)
except Exception as exc:
    tail = LOG.read_text(errors='ignore')[-30000:] if LOG.exists() else ''
    raise RuntimeError('Chiamata /v1/init fallita: ' + repr(exc) + '\n' + tail)

if init_status != 200 or init_body.get('code') not in (None, 200):
    tail = LOG.read_text(errors='ignore')[-30000:] if LOG.exists() else ''
    raise RuntimeError(
        f'/v1/init non riuscita (HTTP {init_status}): {json.dumps(init_body, ensure_ascii=False)[:8000]}\n' + tail
    )

print(f'/v1/init completata in {init_seconds:.1f}s')

# Phase 3: verify the loaded models using the service health and internal
# inventory endpoints. /v1/models may be claimed by the OpenAI-compatible
# route and can legitimately return a LIST instead of ACE-Step inventory.
last_health = {}
last_inventory = {}
verify_deadline = time.time() + 120
while time.time() < verify_deadline:
    if proc.poll() is not None:
        tail = LOG.read_text(errors='ignore')[-30000:] if LOG.exists() else ''
        raise RuntimeError('acestep-api terminata dopo /v1/init:\n' + tail)
    try:
        health_status, health_payload, _ = request_json('/health', timeout=10)
        health_data = health_payload.get('data') or health_payload
        last_health = health_data or last_health

        inv_status, inv_payload, _ = request_json('/v1/model_inventory', timeout=10)
        inv_data = inv_payload.get('data') or inv_payload
        last_inventory = inv_data or last_inventory

        loaded_turbo = any(
            str(m.get('name')) == 'acestep-v15-turbo' and m.get('is_loaded') is True
            for m in (inv_data.get('models') or [])
            if isinstance(m, dict)
        )
        lm_ok = (
            inv_data.get('llm_initialized') is True
            and '0.6B' in str(inv_data.get('loaded_lm_model') or '')
        )
        health_ok = (
            health_status == 200
            and health_payload.get('code') in (None, 200)
            and str(health_data.get('status') or '').lower() == 'ok'
            and health_data.get('models_initialized') is True
            and health_data.get('llm_initialized') is True
            and 'acestep-v15-turbo' in str(health_data.get('loaded_model') or '')
            and '0.6B' in str(health_data.get('loaded_lm_model') or '')
        )
        inventory_ok = inv_status == 200 and inv_payload.get('code') in (None, 200) and loaded_turbo and lm_ok
        if health_ok and inventory_ok:
            break
    except Exception:
        pass
    time.sleep(3)
else:
    tail = LOG.read_text(errors='ignore')[-30000:] if LOG.exists() else ''
    raise RuntimeError(
        'Verifica V17 non pronta. Health=' + repr(last_health)
        + ' Inventory=' + repr(last_inventory) + '\n' + tail
    )

# Phase 4: prove asynchronous thinking=true queue submission. Official API
# duration minimum is 10 seconds. The request must return task_id promptly.
probe = {
    'prompt': 'deep house instrumental production analysis',
    'lyrics': '',
    'model': 'acestep-v15-turbo',
    'audio_duration': 10,
    'inference_steps': 1,
    'batch_size': 1,
    'thinking': True,
    'analysis_only': True,
    'full_analysis_only': True,
    'use_format': True,
    'use_cot_caption': True,
    'use_cot_language': True,
    'constrained_decoding': True,
    'allow_lm_batch': False,
    'lm_model_path': 'acestep-5Hz-lm-0.6B',
    'lm_backend': 'pt',
}
try:
    probe_status, probe_body, probe_seconds = request_json('/release_task', probe, timeout=20)
    probe_data = probe_body.get('data') or {}
    probe_task_id = str(probe_data.get('task_id') or '')
    if probe_status != 200 or probe_body.get('code') not in (None, 200) or not probe_task_id:
        raise RuntimeError('release_task non ha restituito task_id: ' + repr(probe_body))
    if probe_seconds > 15:
        raise RuntimeError(f'release_task ancora troppo lenta: {probe_seconds:.2f}s')
except Exception as exc:
    tail = LOG.read_text(errors='ignore')[-30000:] if LOG.exists() else ''
    raise RuntimeError('Probe submit asincrona V17 fallita: ' + repr(exc) + '\n' + tail)

print()
print('✅ SONARA MUSIC V17 GPU0 PRONTA')
print('Server API     : acestep-api DEDICATO / ASINCRONO')
print('Model          : acestep-v15-turbo')
print('Inference HQ   : 8-step profile lato Sonara V17')
print('5Hz LM         : acestep-5Hz-lm-0.6B ATTIVO')
print('LM backend     : PT / T4-safe offload')
print('Thinking/CoT   : ATTIVO')
print(f'Model init     : OK in {init_seconds:.1f}s')
print(f'Async submit   : OK in {probe_seconds:.2f}s / task {probe_task_id}')
print('GPU0           : Music AI')
print('GPU1           : Video AI INVARIATA')
print()
print(json.dumps({'health': last_health, 'inventory': last_inventory}, ensure_ascii=False)[:6000])
