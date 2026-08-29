import json
import os
import shutil
import signal
import subprocess
import time
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
print(' SONARA MUSIC V17 - DEDICATED ASYNC API + 5Hz LM / GPU1 VIDEO SAFE ')
print('=' * 76)

# Stop only ACE-Step processes explicitly bound to GPU0/7860.
# Never touch cloudflared and never kill the GPU1 WAN video worker.
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
    is_acestep = 'acestep' in low
    is_gpu0_port = '--port 7860' in low or '--port=7860' in low
    if is_acestep and is_gpu0_port:
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

# Dedicated REST API configuration for a 14-16 GB T4.
# The API defaults to lazy initialization, so ACESTEP_NO_INIT=false is
# REQUIRED here: health/models must expose a fully loaded Turbo + 5Hz LM
# before Sonara binds the public tunnel.
settings = {
    'ACESTEP_DEVICE': 'cuda',
    'ACESTEP_DTYPE': 'float32',
    'ACESTEP_CONFIG_PATH': 'acestep-v15-turbo',
    'ACESTEP_NO_INIT': 'false',
    'ACESTEP_INIT_LLM': 'true',
    'ACESTEP_LM_MODEL_PATH': 'acestep-5Hz-lm-0.6B',
    'ACESTEP_LM_BACKEND': 'pt',
    'ACESTEP_LM_DEVICE': 'cuda',
    # Proven-safe T4 memory profile: initialize on CUDA but allow the LM to
    # offload when needed. Async /release_task removes the old HTTP 524 issue.
    'ACESTEP_LM_OFFLOAD_TO_CPU': 'true',
    'ACESTEP_OFFLOAD_TO_CPU': 'true',
    'ACESTEP_OFFLOAD_DIT_TO_CPU': 'false',
    'ACESTEP_USE_FLASH_ATTENTION': 'false',
    'ACESTEP_COMPILE_MODEL': 'true',
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

# Use the dedicated asynchronous REST server. /release_task queues work and
# returns task_id immediately instead of holding the request open for render.
common = [
    UV, 'run', '--no-sync', 'acestep-api',
    '--host', '0.0.0.0',
    '--port', str(PORT),
    '--download-source', 'huggingface',
    '--init-llm',
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
print('Caricamento Turbo + 5Hz LM 0.6B in corso...')


def get_json(path: str, timeout: int = 6):
    with urllib.request.urlopen(f'http://127.0.0.1:{PORT}{path}', timeout=timeout) as response:
        return response.status, json.loads(response.read().decode('utf-8'))


def post_json(path: str, payload: dict, timeout: int = 20):
    request = urllib.request.Request(
        f'http://127.0.0.1:{PORT}{path}',
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Accept': 'application/json'},
        method='POST',
    )
    started = time.time()
    with urllib.request.urlopen(request, timeout=timeout) as response:
        body = json.loads(response.read().decode('utf-8'))
        return response.status, body, time.time() - started


def health_ok():
    try:
        status, payload = get_json('/health', 5)
        data = payload.get('data') or payload
        state = str(data.get('status') or payload.get('status') or '').lower()
        return (
            status == 200
            and state in {'ok', 'ready', 'healthy', 'online', 'success'}
            and data.get('models_initialized') is True
            and data.get('llm_initialized') is True
            and 'acestep-v15-turbo' in str(data.get('loaded_model') or '')
            and '0.6B' in str(data.get('loaded_lm_model') or '')
        )
    except Exception:
        return False


def lm_ready():
    try:
        status, payload = get_json('/v1/models', 10)
        data = payload.get('data') or payload
        loaded = str(data.get('loaded_lm_model') or '')
        initialized = data.get('llm_initialized') is True
        text = json.dumps(data, ensure_ascii=False)
        return status == 200 and initialized and '0.6B' in loaded and 'acestep-v15-turbo' in text, data
    except Exception:
        return False, {}


deadline = time.time() + 900
last_inventory = {}
while time.time() < deadline:
    if proc.poll() is not None:
        tail = LOG.read_text(errors='ignore')[-20000:] if LOG.exists() else ''
        raise RuntimeError('SONARA Music V17 GPU0 terminata durante il bootstrap:\n' + tail)
    if health_ok():
        ready, inventory = lm_ready()
        last_inventory = inventory or last_inventory
        if ready:
            break
    time.sleep(5)
else:
    tail = LOG.read_text(errors='ignore')[-20000:] if LOG.exists() else ''
    raise RuntimeError('Timeout: Turbo + 5Hz LM non pronti su GPU0. Inventory=' + repr(last_inventory) + '\n' + tail)

# Self-verifying asynchronous submission probe. Official API duration minimum
# is 10 seconds. analysis_only keeps this lightweight while proving that
# thinking=true is accepted and QUEUED without blocking the HTTP request.
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
    probe_status, probe_body, probe_seconds = post_json('/release_task', probe, 20)
    probe_data = probe_body.get('data') or {}
    probe_task_id = str(probe_data.get('task_id') or '')
    if probe_status != 200 or probe_body.get('code') not in (None, 200) or not probe_task_id:
        raise RuntimeError('release_task non ha restituito task_id: ' + repr(probe_body))
    if probe_seconds > 15:
        raise RuntimeError(f'release_task ancora troppo lenta: {probe_seconds:.2f}s')
except Exception as exc:
    tail = LOG.read_text(errors='ignore')[-20000:] if LOG.exists() else ''
    raise RuntimeError('Probe submit asincrona V17 fallita: ' + repr(exc) + '\n' + tail)

print()
print('✅ SONARA MUSIC V17 GPU0 PRONTA')
print('Server API     : acestep-api DEDICATO / ASINCRONO')
print('Model          : acestep-v15-turbo')
print('Inference HQ   : 8-step profile lato Sonara V17')
print('5Hz LM         : acestep-5Hz-lm-0.6B ATTIVO')
print('LM backend     : PT / CUDA con offload T4-safe')
print('LM CPU offload : ON')
print('Thinking/CoT   : ATTIVO')
print(f'Async submit   : OK in {probe_seconds:.2f}s / task {probe_task_id}')
print('GPU0           : Music AI')
print('GPU1           : Video AI INVARIATA')
print('Cloudflare     : tunnel GPU0 gestito dal fresh bootstrap')
print()
print(json.dumps(last_inventory, ensure_ascii=False)[:4000])
