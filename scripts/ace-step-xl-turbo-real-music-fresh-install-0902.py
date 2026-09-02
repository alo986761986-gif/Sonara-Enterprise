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
WORK = Path('/tmp/sonara-ace-step-real-music-fresh-0902')
CHECKPOINTS = ROOT / 'checkpoints'
MODEL = 'acestep-v15-xl-turbo'
LM_MODEL = 'acestep-5Hz-lm-4B'
PORT = 8001
ACE_REPO = 'https://github.com/ace-step/ACE-Step-1.5.git'
ACE_COMMIT = 'ca1e85fe9430179831e6bc6be790c332190a3866'
REALISM_MARKER = 'sonara-realism-api-v1'
API_LOG = WORK / 'api.log'
READY_FILE = ROOT / 'SONARA_REAL_MUSIC_READY.txt'

MODELS_FILE = ROOT / 'acestep/api/http/release_task_models.py'
SETUP_FILE = ROOT / 'acestep/api/job_generation_setup.py'
HEALTH_FILE = ROOT / 'acestep/api/http/model_service_routes.py'


def banner(text: str) -> None:
    print('\n' + '=' * 96, flush=True)
    print(text, flush=True)
    print('=' * 96, flush=True)


def run(cmd, *, cwd: Path | None = None, env: dict | None = None, timeout: int | None = None) -> None:
    cmd = [str(x) for x in cmd]
    print('$ ' + ' '.join(cmd), flush=True)
    done = subprocess.run(cmd, cwd=str(cwd) if cwd else None, env=env, timeout=timeout, check=False)
    if done.returncode != 0:
        raise RuntimeError(f"Comando fallito ({done.returncode}): {' '.join(cmd)}")


def check_disk() -> None:
    usage = shutil.disk_usage('/marimo')
    free_gb = usage.free / 1024**3
    print(f'SPAZIO_LIBERO_GB={free_gb:.2f}', flush=True)
    if free_gb < 32:
        raise RuntimeError(f'Spazio insufficiente: {free_gb:.2f} GB liberi. Servono almeno 32 GB.')
    if free_gb < 45:
        print('ATTENZIONE: spazio sufficiente ma ridotto per XL-Turbo + LM 4B.', flush=True)


def ensure_uv() -> Path:
    existing = shutil.which('uv')
    if existing:
        print(f'UV={existing}', flush=True)
        return Path(existing)
    TOOLS.mkdir(parents=True, exist_ok=True)
    target = TOOLS / 'uv'
    if target.exists() and os.access(target, os.X_OK):
        return target
    machine = platform.machine().lower()
    if machine in {'x86_64', 'amd64'}:
        asset = 'uv-x86_64-unknown-linux-gnu.tar.gz'
    elif machine in {'aarch64', 'arm64'}:
        asset = 'uv-aarch64-unknown-linux-gnu.tar.gz'
    else:
        raise RuntimeError(f'Architettura non supportata: {machine}')
    url = f'https://github.com/astral-sh/uv/releases/latest/download/{asset}'
    print(f'Scarico uv: {url}', flush=True)
    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / 'uv.tar.gz'
        urllib.request.urlretrieve(url, archive)
        with tarfile.open(archive, 'r:gz') as tf:
            tf.extractall(tmp)
        hits = [p for p in Path(tmp).rglob('uv') if p.is_file()]
        if not hits:
            raise RuntimeError('Binario uv non trovato nell archivio.')
        shutil.copy2(hits[0], target)
    target.chmod(0o755)
    return target


def prepare_repo() -> None:
    banner('1/8 - CLONE PULITO ACE-STEP 1.5')
    ROOT.parent.mkdir(parents=True, exist_ok=True)
    if ROOT.exists() and not (ROOT / '.git').exists():
        backup = ROOT.with_name(ROOT.name + f'.partial-{int(time.time())}')
        print(f'Preservo ambiente parziale: {backup}', flush=True)
        ROOT.rename(backup)
    if not ROOT.exists():
        run(['git', 'init', str(ROOT)])
        run(['git', '-C', str(ROOT), 'remote', 'add', 'origin', ACE_REPO])
    else:
        remotes = subprocess.run(['git', '-C', str(ROOT), 'remote'], capture_output=True, text=True, check=False).stdout.split()
        if 'origin' not in remotes:
            run(['git', '-C', str(ROOT), 'remote', 'add', 'origin', ACE_REPO])
        else:
            run(['git', '-C', str(ROOT), 'remote', 'set-url', 'origin', ACE_REPO])
    run(['git', '-C', str(ROOT), 'fetch', '--depth', '1', 'origin', ACE_COMMIT], timeout=1800)
    run(['git', '-C', str(ROOT), 'checkout', '--detach', '-f', ACE_COMMIT])
    head = subprocess.check_output(['git', '-C', str(ROOT), 'rev-parse', 'HEAD'], text=True).strip()
    if head != ACE_COMMIT:
        raise RuntimeError(f'Commit ACE-Step inatteso: {head}')
    print(f'ACE_COMMIT={head}', flush=True)


def base_env() -> dict:
    env = os.environ.copy()
    env.pop('VIRTUAL_ENV', None)
    env.update({
        'UV_PROJECT_ENVIRONMENT': str(VENV),
        'UV_PYTHON_DOWNLOADS': 'automatic',
        'ACESTEP_PROJECT_ROOT': str(ROOT),
        'ACESTEP_CHECKPOINTS_DIR': str(CHECKPOINTS),
        'HF_HUB_DOWNLOAD_TIMEOUT': '1800',
        'HF_HUB_ETAG_TIMEOUT': '120',
        'HF_HUB_DISABLE_TELEMETRY': '1',
        'TOKENIZERS_PARALLELISM': 'false',
        'MPLBACKEND': 'Agg',
        'PYTHONUNBUFFERED': '1',
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
    })
    return env


def install_environment(uv: Path) -> dict:
    banner('2/8 - PYTHON 3.12 + CUDA DEPENDENCIES')
    env = base_env()
    run([uv, 'python', 'install', '3.12'], env=env, timeout=1800)
    run([uv, 'sync', '--project', str(ROOT), '--python', '3.12', '--no-dev'], cwd=ROOT, env=env, timeout=10800)
    if not PYTHON.exists():
        raise RuntimeError(f'Venv non creata: {PYTHON}')
    return env


def verify_gpu(env: dict) -> bool:
    banner('3/8 - RTX PRO 6000 / CUDA / BF16 / FLASH ATTENTION')
    code = r'''
import torch
print('TORCH=' + torch.__version__)
print('CUDA_BUILD=' + str(torch.version.cuda))
print('CUDA_AVAILABLE=' + str(torch.cuda.is_available()))
assert torch.cuda.is_available(), 'CUDA non disponibile'
print('GPU=' + torch.cuda.get_device_name(0))
print('VRAM_GB=' + str(round(torch.cuda.get_device_properties(0).total_memory / 1024**3, 2)))
print('CAPABILITY=' + str(torch.cuda.get_device_capability(0)))
print('BF16=' + str(torch.cuda.is_bf16_supported()))
torch.set_float32_matmul_precision('high')
x=torch.randn((1024,1024),device='cuda',dtype=torch.float16); y=x@x; torch.cuda.synchronize()
print('CUDA_COMPUTE=OK')
'''
    run([PYTHON, '-c', code], cwd=ROOT, env=env, timeout=1800)
    flash = subprocess.run([str(PYTHON), '-c', 'import flash_attn; print("FLASH_ATTN=READY")'], cwd=str(ROOT), env=env, check=False)
    if flash.returncode == 0:
        print('FLASH_ATTENTION_MODE=ON', flush=True)
        return True
    print('FLASH_ATTENTION_MODE=SAFE_FALLBACK', flush=True)
    return False


def download_models(env: dict) -> None:
    banner('4/8 - DOWNLOAD XL-TURBO + LM 4B')
    CHECKPOINTS.mkdir(parents=True, exist_ok=True)
    code = f'''
from pathlib import Path
from acestep.model_downloader import (
    check_main_model_exists, check_model_exists,
    download_main_model, download_submodel,
)
cp = Path({str(CHECKPOINTS)!r})
main_ok = check_main_model_exists(cp)
if not main_ok:
    ok,msg = download_main_model(cp, force=False, prefer_source="huggingface")
    print(msg, flush=True)
    if not ok: raise SystemExit(2)
for name in ({MODEL!r}, {LM_MODEL!r}):
    if not check_model_exists(name, cp):
        target = cp / name
        ok,msg = download_submodel(name, cp, force=target.exists(), prefer_source="huggingface")
        print(msg, flush=True)
        if not ok: raise SystemExit(3)
    if not check_model_exists(name, cp):
        raise SystemExit("MODEL_INCOMPLETE=" + name)
print("XL_TURBO=READY", flush=True)
print("LM_4B=READY", flush=True)
'''
    run([PYTHON, '-c', code], cwd=ROOT, env=env, timeout=43200)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY_PATCHED', flush=True)
        return text
    if old not in text:
        raise RuntimeError(f'Pattern non trovato: {label}. Commit ACE-Step inatteso.')
    print(f'{label}=PATCHED', flush=True)
    return text.replace(old, new, 1)


def patch_file(path: Path, transforms) -> None:
    original = path.read_text(encoding='utf-8')
    text = original
    for old, new, label in transforms:
        text = replace_once(text, old, new, label)
    if text != original:
        backup = path.with_suffix(path.suffix + '.sonara-real-music.bak')
        if not backup.exists():
            backup.write_text(original, encoding='utf-8')
        path.write_text(text, encoding='utf-8')


def patch_real_music_api() -> None:
    banner('5/8 - SONARA REAL MUSIC API V1')
    for path in (MODELS_FILE, SETUP_FILE, HEALTH_FILE):
        if not path.exists():
            raise RuntimeError(f'File ACE-Step mancante: {path}')
    patch_file(MODELS_FILE, [
        (
            '    infer_method: str = "ode"  # "ode" or "sde" - diffusion inference method\n',
            '    infer_method: str = "ode"  # "ode" or "sde" - diffusion inference method\n'
            '    sampler_mode: Literal["euler", "heun"] = Field(\n'
            '        default="euler",\n'
            '        description="Diffusion sampler: euler=fast, heun=second-order cleaner turbo inference.",\n'
            '    )\n',
            'REQUEST_SAMPLER_MODE'
        ),
        (
            '    use_cot_caption: bool = True\n    use_cot_language: bool = True\n',
            '    use_cot_metas: bool = True\n    use_cot_caption: bool = True\n    use_cot_language: bool = True\n',
            'REQUEST_COT_METAS'
        ),
    ])
    patch_file(SETUP_FILE, [
        (
            '        infer_method=req.infer_method,\n        timesteps=parsed_timesteps,\n',
            '        infer_method=req.infer_method,\n        sampler_mode=req.sampler_mode,\n        timesteps=parsed_timesteps,\n',
            'SETUP_SAMPLER_MODE'
        ),
        (
            '        use_cot_metas=not sample_mode,\n        use_cot_caption=use_cot_caption,\n',
            '        use_cot_metas=req.use_cot_metas if not sample_mode else False,\n        use_cot_caption=use_cot_caption,\n',
            'SETUP_COT_METAS'
        ),
        (
            '        use_constrained_decoding=True,\n',
            '        use_constrained_decoding=req.constrained_decoding,\n',
            'SETUP_CONSTRAINED_DECODING'
        ),
    ])
    patch_file(HEALTH_FILE, [
        (
            '                "loaded_lm_model": inventory["loaded_lm_model"],\n',
            '                "loaded_lm_model": inventory["loaded_lm_model"],\n'
            '                "sonara_realism_api_v1": True,\n'
            f'                "sonara_realism_api": "{REALISM_MARKER}",\n',
            'HEALTH_REALISM_MARKER'
        ),
    ])
    for path in (MODELS_FILE, SETUP_FILE, HEALTH_FILE):
        run([PYTHON, '-m', 'py_compile', path], cwd=ROOT, timeout=300)
    schema = r'''
from acestep.api.http.release_task_models import GenerateMusicRequest
r=GenerateMusicRequest(prompt='test',thinking=True,use_cot_metas=False,sampler_mode='heun',dcw_enabled=True,constrained_decoding=True)
assert r.thinking and not r.use_cot_metas and r.sampler_mode=='heun' and r.dcw_enabled is True
print('REAL_MUSIC_REQUEST_SCHEMA=OK')
'''
    run([PYTHON, '-c', schema], cwd=ROOT, timeout=300)


def api_env(env: dict, flash_ready: bool) -> dict:
    result = env.copy()
    result.update({
        'ACESTEP_CONFIG_PATH': MODEL,
        'ACESTEP_DEVICE': 'cuda',
        'ACESTEP_INIT_LLM': 'true',
        'ACESTEP_LM_MODEL_PATH': LM_MODEL,
        'ACESTEP_LLM_BACKEND': 'pt',
        'ACESTEP_USE_FLASH_ATTENTION': 'true' if flash_ready else 'false',
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
    })
    return result


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
        try: pid = int(parts[0])
        except ValueError: continue
        if pid == me: continue
        if predicate(parts[1].lower()):
            try: os.kill(pid, signal.SIGTERM)
            except Exception: pass
    time.sleep(2)


def request_json(url: str, timeout: int = 15) -> dict:
    req = urllib.request.Request(url, headers={'Accept':'application/json','Cache-Control':'no-cache','Pragma':'no-cache','User-Agent':'SONARA-Real-Music-Installer/1.0'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode('utf-8', errors='replace')
    return json.loads(raw) if raw else {}


def health_ready(body: dict) -> bool:
    data = body.get('data') or body if isinstance(body, dict) else {}
    return (
        str(data.get('status') or '').lower() == 'ok'
        and data.get('models_initialized') is True
        and data.get('llm_initialized') is True
        and data.get('sonara_realism_api_v1') is True
        and MODEL in str(data.get('loaded_model') or '')
    )


def start_api(env: dict, flash_ready: bool) -> subprocess.Popen:
    banner('6/8 - AVVIO XL-TURBO + LM 4B')
    kill_matching(lambda cmd: 'acestep.api_server' in cmd and str(PORT) in cmd)
    WORK.mkdir(parents=True, exist_ok=True)
    stream = API_LOG.open('w', encoding='utf-8', buffering=1)
    proc = subprocess.Popen(
        [str(PYTHON), '-m', 'acestep.api_server', '--host', '0.0.0.0', '--port', str(PORT), '--download-source', 'huggingface', '--init-llm', '--lm-model-path', LM_MODEL],
        cwd=str(ROOT), env=api_env(env, flash_ready), stdout=stream, stderr=subprocess.STDOUT, start_new_session=True,
    )
    print(f'ACE_STEP_API_PID={proc.pid}', flush=True)
    deadline = time.time() + 2400
    last = None
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = API_LOG.read_text(errors='replace')[-24000:] if API_LOG.exists() else ''
            raise RuntimeError(f'ACE-Step terminato exit={proc.returncode}:\n{tail}')
        try:
            last = request_json(f'http://127.0.0.1:{PORT}/health', 10)
            if health_ready(last):
                print(json.dumps(last.get('data') or last, indent=2, ensure_ascii=False), flush=True)
                print('LOCAL_REAL_MUSIC_HEALTH=READY', flush=True)
                return proc
        except Exception:
            pass
        time.sleep(3)
    tail = API_LOG.read_text(errors='replace')[-24000:] if API_LOG.exists() else ''
    raise RuntimeError(f'Timeout avvio Real Music. Ultimo health={last!r}\n{tail}')


def cloudflared_binary() -> Path:
    existing = shutil.which('cloudflared')
    if existing: return Path(existing)
    target = ROOT / 'bin/cloudflared'
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists() and os.access(target, os.X_OK): return target
    machine = platform.machine().lower()
    arch = 'arm64' if machine in {'aarch64','arm64'} else 'amd64'
    url = f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}'
    print(f'Scarico cloudflared: {url}', flush=True)
    urllib.request.urlretrieve(url, target)
    target.chmod(0o755)
    return target


def try_tunnel(binary: Path, protocol: str):
    log_path = WORK / f'cloudflare-{protocol}.log'
    log_path.write_text('', encoding='utf-8')
    stream = log_path.open('a', encoding='utf-8', buffering=1)
    cmd = [str(binary),'tunnel','--url',f'http://127.0.0.1:{PORT}','--no-autoupdate','--protocol',protocol,'--loglevel','info']
    print('$ ' + ' '.join(cmd), flush=True)
    proc = subprocess.Popen(cmd, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
    pattern = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com', re.I)
    deadline = time.time() + 90
    while time.time() < deadline:
        if proc.poll() is not None: break
        text = log_path.read_text(errors='replace') if log_path.exists() else ''
        match = pattern.search(text)
        if match: return proc, match.group(0).rstrip('/')
        time.sleep(0.5)
    if proc.poll() is None:
        try: os.killpg(proc.pid, signal.SIGTERM)
        except Exception: proc.terminate()
    return None, None


def start_tunnel() -> tuple[subprocess.Popen, str]:
    banner('7/8 - CLOUDFLARE QUICK TUNNEL')
    kill_matching(lambda cmd: 'cloudflared' in cmd and str(PORT) in cmd)
    binary = cloudflared_binary()
    for protocol in ('http2','quic'):
        proc, url = try_tunnel(binary, protocol)
        if not proc or not url: continue
        deadline = time.time() + 240
        while time.time() < deadline:
            if proc.poll() is not None: break
            try:
                if health_ready(request_json(url + '/health', 20)):
                    print('PUBLIC_REAL_MUSIC_HEALTH=READY', flush=True)
                    return proc, url
            except Exception:
                pass
            time.sleep(2)
        if proc.poll() is None:
            try: os.killpg(proc.pid, signal.SIGTERM)
            except Exception: proc.terminate()
    raise RuntimeError('API locale pronta ma Cloudflare Quick Tunnel non disponibile.')


def main() -> None:
    banner('SONARA - ACE-STEP XL-TURBO REAL MUSIC FRESH INSTALL')
    print('INSTALL_MODE=FRESH_REAL_MUSIC_V1', flush=True)
    print('MODEL=' + MODEL, flush=True)
    print('LM_MODEL=' + LM_MODEL, flush=True)
    print('TURBO_INFERENCE_STEPS=8', flush=True)
    print('QUALITY_ULTRA_SAMPLER=HEUN', flush=True)
    print('DCW=DOUBLE_0.05_0.02', flush=True)
    print('CPU_OFFLOAD=OFF', flush=True)

    TOOLS.mkdir(parents=True, exist_ok=True)
    WORK.mkdir(parents=True, exist_ok=True)
    check_disk()
    uv = ensure_uv()
    prepare_repo()
    env = install_environment(uv)
    flash_ready = verify_gpu(env)
    download_models(env)
    patch_real_music_api()
    api_proc = start_api(env, flash_ready)
    tunnel_proc, public_url = start_tunnel()

    health = request_json(public_url + '/health', 20)
    READY_FILE.write_text('\n'.join([
        'SONARA_REAL_MUSIC_READY=YES',
        f'ACE_COMMIT={ACE_COMMIT}',
        f'MODEL={MODEL}',
        f'LM_MODEL={LM_MODEL}',
        'INFERENCE_STEPS=8',
        'QUALITY_ULTRA_SAMPLER=heun',
        'FAST_SAMPLER=euler',
        'DCW_MODE=double',
        'DCW_SCALER=0.05',
        'DCW_HIGH_SCALER=0.02',
        'THINKING=SUPPORTED',
        'COT_METAS=CALLER_CONTROLLED',
        'CONSTRAINED_DECODING=CALLER_CONTROLLED',
        f'FLASH_ATTENTION={"ON" if flash_ready else "SAFE_FALLBACK"}',
        'CPU_OFFLOAD=OFF',
        f'REALISM_API_MARKER={REALISM_MARKER}',
        f'PUBLIC_URL={public_url}',
        f'HEALTH={json.dumps(health, ensure_ascii=False)}',
    ]) + '\n', encoding='utf-8')

    banner('8/8 - ✅ SONARA XL-TURBO REAL MUSIC V1 PRONTO')
    print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
    print(f'MODEL={MODEL}', flush=True)
    print(f'LM_MODEL={LM_MODEL}', flush=True)
    print('LLM_INITIALIZED=true', flush=True)
    print('REALISM_API_MARKER=' + REALISM_MARKER, flush=True)
    print('INFERENCE_STEPS=8', flush=True)
    print('QUALITY_ULTRA=LM4B+HEUN+DCW', flush=True)
    print('FAST=XL_TURBO+EULER', flush=True)
    print(f'FLASH_ATTENTION={"ON" if flash_ready else "SAFE_FALLBACK"}', flush=True)
    print('CPU_OFFLOAD=OFF', flush=True)
    print(f'READY_FILE={READY_FILE}', flush=True)
    print('NON FERMARE QUESTA CELLA: mantiene API e tunnel attivi.', flush=True)

    try:
        while True:
            if api_proc.poll() is not None:
                tail = API_LOG.read_text(errors='replace')[-12000:] if API_LOG.exists() else ''
                raise RuntimeError(f'ACE-Step API fermata.\n{tail}')
            if tunnel_proc.poll() is not None:
                raise RuntimeError('Cloudflare tunnel fermato.')
            try:
                ok = health_ready(request_json(f'http://127.0.0.1:{PORT}/health', 8))
            except Exception:
                ok = False
            print(f"[{time.strftime('%H:%M:%S')}] REAL MUSIC HEARTBEAT | API={'UP' if ok else 'DOWN'} | LLM4B=ON | TUNNEL=UP | {public_url}", flush=True)
            time.sleep(60)
    finally:
        for proc in (tunnel_proc, api_proc):
            if proc.poll() is None:
                try: os.killpg(proc.pid, signal.SIGTERM)
                except Exception:
                    try: proc.terminate()
                    except Exception: pass


if __name__ == '__main__':
    main()
