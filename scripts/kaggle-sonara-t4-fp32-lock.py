import os
import signal
import subprocess
import time
import urllib.request
from pathlib import Path

BASE = Path('/kaggle/working/ACE-Step-1.5')
UV = '/usr/local/bin/uv'
ORCH = BASE / 'acestep/core/generation/handler/init_service_orchestrator.py'
LOADER = BASE / 'acestep/core/generation/handler/init_service_loader.py'

if not BASE.exists():
    raise RuntimeError(f'ACE-Step non trovato: {BASE}')

print('=' * 68)
print(' SONARA T4 STABILITY LOCK - FLOAT32 DEFINITIVO ')
print('=' * 68)

# ------------------------------------------------------------------
# 1) Hard-lock pre-Ampere CUDA (Tesla T4) to float32.
#    This deliberately ignores ACESTEP_DTYPE=float16 on T4 so the old
#    NaN/Inf regression cannot be reintroduced by a stale .env/cell.
# ------------------------------------------------------------------
text = ORCH.read_text(encoding='utf-8', errors='ignore')
start_marker = '            elif resolved_device == "cuda":\n'
end_marker = '            else:\n                self.dtype = torch.bfloat16 if resolved_device == "xpu" else torch.float32\n'
start = text.find(start_marker)
end = text.find(end_marker, start if start >= 0 else 0)
if start < 0 or end < 0:
    raise RuntimeError('Blocco dtype CUDA non trovato in init_service_orchestrator.py')

locked_block = '''            elif resolved_device == "cuda":\n                if gpu_config.cuda_supports_bfloat16():\n                    self.dtype = torch.bfloat16\n                else:\n                    # SONARA_T4_FP32_LOCK\n                    # Tesla T4 / pre-Ampere: FP16 can overflow on long sequences\n                    # and produce all-NaN latents. Never allow FP16 here.\n                    self.dtype = torch.float32\n                    os.environ["ACESTEP_DTYPE"] = "float32"\n                    logger.warning(\n                        "[SONARA T4 FP32 LOCK] Pre-Ampere CUDA detected: "\n                        "forcing torch.float32 permanently to prevent NaN/Inf latents."\n                    )\n'''
text = text[:start] + locked_block + text[end:]
ORCH.write_text(text, encoding='utf-8')
print('✅ Tesla T4 bloccata permanentemente su FLOAT32')

# ------------------------------------------------------------------
# 2) With float32 the historical pre-Ampere FP16 softmax overflow does
#    not apply. Allow SDPA instead of forcing eager, which recovers speed.
# ------------------------------------------------------------------
loader = LOADER.read_text(encoding='utf-8', errors='ignore')
old = '        elif device == "cuda" and not gpu_config.cuda_supports_bfloat16():\n'
new = '        elif device == "cuda" and not gpu_config.cuda_supports_bfloat16() and self.dtype == torch.float16:\n'
if old in loader:
    loader = loader.replace(old, new, 1)
    LOADER.write_text(loader, encoding='utf-8')
    print('✅ FLOAT32 usa SDPA; eager resta riservato al solo FP16')
elif new in loader:
    print('✅ Patch SDPA/FLOAT32 già presente')
else:
    print('ℹ️ Loader attention già diverso: nessuna sostituzione applicata')

# ------------------------------------------------------------------
# 3) Persist the stable runtime settings in .env.
# ------------------------------------------------------------------
env_path = BASE / '.env'
existing = env_path.read_text(encoding='utf-8', errors='ignore') if env_path.exists() else ''
settings = {
    'ACESTEP_DTYPE': 'float32',
    'ACESTEP_INIT_LLM': 'false',
    'ACESTEP_LM_BACKEND': 'pt',
    'ACESTEP_CONFIG_PATH': 'acestep-v15-turbo',
    'ACESTEP_OFFLOAD_TO_CPU': 'true',
    'ACESTEP_OFFLOAD_DIT_TO_CPU': 'false',
    'ACESTEP_USE_FLASH_ATTENTION': 'false',
    'ACESTEP_COMPILE_MODEL': 'true',
    'ACESTEP_SAVE_MEMORY': '1',
    'TOKENIZERS_PARALLELISM': 'false',
    'MPLBACKEND': 'Agg',
}
lines = existing.splitlines()
for key, value in settings.items():
    prefix = key + '='
    lines = [line for line in lines if not line.strip().startswith(prefix)]
    lines.append(f'{key}={value}')
env_path.write_text('\n'.join(lines).strip() + '\n', encoding='utf-8')
print('✅ .env stabile aggiornato: FLOAT32 + LM OFF + DiT persistente su GPU')

# ------------------------------------------------------------------
# 4) Stop only ACE-Step; preserve cloudflared quick tunnels.
# ------------------------------------------------------------------
ps = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
pids = []
for row in ps.splitlines():
    parts = row.strip().split(maxsplit=1)
    if len(parts) != 2:
        continue
    try:
        pid = int(parts[0])
    except ValueError:
        continue
    cmd = parts[1].lower()
    if 'acestep' in cmd and 'cloudflared' not in cmd and pid != os.getpid():
        pids.append(pid)
for pid in pids:
    try:
        os.kill(pid, signal.SIGTERM)
    except Exception:
        pass
time.sleep(3)
for pid in pids:
    try:
        os.kill(pid, 0)
        os.kill(pid, signal.SIGKILL)
    except Exception:
        pass
print(f'✅ Fermati {len(pids)} processi ACE-Step; tunnel Cloudflare preservati')

# ------------------------------------------------------------------
# 5) Start one stable worker per T4.  Keep DiT on GPU, offload only helper
#    components, disable LM, batch=1, INT8 weights, compile for repeated speed.
# ------------------------------------------------------------------
common = [
    UV, 'run', 'acestep',
    '--server-name', '0.0.0.0',
    '--device', 'cuda',
    '--init_service', 'true',
    '--config_path', 'acestep-v15-turbo',
    '--init_llm', 'false',
    '--backend', 'pt',
    '--use_flash_attention', 'false',
    '--offload_to_cpu', 'true',
    '--offload_dit_to_cpu', 'false',
    '--quantization', 'int8_weight_only',
    '--batch_size', '1',
    '--download-source', 'huggingface',
    '--enable-api',
]

def worker_env(gpu):
    env = os.environ.copy()
    env.update({
        'CUDA_VISIBLE_DEVICES': str(gpu),
        'ACESTEP_DTYPE': 'float32',
        'ACESTEP_INIT_LLM': 'false',
        'ACESTEP_LM_BACKEND': 'pt',
        'ACESTEP_COMPILE_MODEL': 'true',
        'ACESTEP_OFFLOAD_TO_CPU': 'true',
        'ACESTEP_OFFLOAD_DIT_TO_CPU': 'false',
        'ACESTEP_USE_FLASH_ATTENTION': 'false',
        'ACESTEP_SAVE_MEMORY': '1',
        'PYTHONUNBUFFERED': '1',
        'TOKENIZERS_PARALLELISM': 'false',
        'MPLBACKEND': 'Agg',
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
    })
    return env

logs = []
procs = []
for gpu, port in [(0, 7860), (1, 7861)]:
    log_path = Path(f'/kaggle/working/sonara_t4_fp32_lock_gpu{gpu}.log')
    log = open(log_path, 'w', buffering=1)
    proc = subprocess.Popen(
        common + ['--port', str(port)],
        cwd=str(BASE),
        env=worker_env(gpu),
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    logs.append(log_path)
    procs.append(proc)
    print(f'🚀 GPU{gpu} -> {port} PID {proc.pid}')

# ------------------------------------------------------------------
# 6) Wait for health, fail fast with logs if a worker dies.
# ------------------------------------------------------------------
def healthy(port):
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/health', timeout=3) as r:
            body = r.read().decode('utf-8', errors='ignore').lower()
            return r.status == 200 and ('"status":"ok"' in body or '"status": "ok"' in body)
    except Exception:
        return False

deadline = time.time() + 480
while time.time() < deadline:
    for i, proc in enumerate(procs):
        if proc.poll() is not None:
            tail = logs[i].read_text(errors='ignore')[-6000:]
            raise RuntimeError(f'Worker GPU{i} terminato:\n{tail}')
    if healthy(7860) and healthy(7861):
        break
    time.sleep(4)
else:
    tails = '\n---GPU0---\n' + logs[0].read_text(errors='ignore')[-4000:] + '\n---GPU1---\n' + logs[1].read_text(errors='ignore')[-4000:]
    raise RuntimeError('Timeout avvio worker T4 x2' + tails)

# ------------------------------------------------------------------
# 7) Assert the runtime cannot still be float16.
# ------------------------------------------------------------------
combined = '\n'.join(path.read_text(errors='ignore') for path in logs)
low = combined.lower()
if '[sonara t4 fp32 lock]' not in low:
    raise RuntimeError('FP32 lock non confermato nei log.')
if 'dtype=torch.float16' in low or 'acestep_dtype=float16' in low:
    raise RuntimeError('ERRORE: rilevato ancora FLOAT16 dopo il lock.')
if 'nanovllm' in low or '_initialize_5hz_lm' in low:
    raise RuntimeError('ERRORE: il 5Hz LM risulta ancora inizializzato.')

print()
print('=' * 68)
print(' ✅ SONARA T4 x2 - FIX NaN/Inf DEFINITIVO ATTIVO ')
print('=' * 68)
print('DiT dtype       : FLOAT32 BLOCCATO')
print('FP16 su T4      : IMPOSSIBILE DAL BOOTSTRAP')
print('Model           : acestep-v15-turbo')
print('5Hz LM          : OFF')
print('Batch           : 1 per GPU')
print('DiT offload     : OFF (resta sulla GPU)')
print('Helper offload  : ON')
print('INT8 weights    : ON')
print('torch.compile   : ON')
print('GPU0            : 7860')
print('GPU1            : 7861')
print('Cloudflare      : tunnel esistenti preservati')
print()
print(subprocess.check_output([
    'nvidia-smi',
    '--query-gpu=index,name,memory.used,memory.total,utilization.gpu',
    '--format=csv'
], text=True))
print('✅ Il crash NaN/Inf da FLOAT16 su Tesla T4 non può più ricomparire con questo runtime.')
