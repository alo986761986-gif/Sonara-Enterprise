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
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PYTHON = ROOT / '.venv/bin/python'
MODEL = 'acestep-v15-xl-turbo'
LM_MODEL = 'acestep-5Hz-lm-4B'
PORT = 8001
WORK = Path('/tmp/sonara-real-music-v2')
API_LOG = WORK / 'api.log'
READY_FILE = ROOT / 'SONARA_REAL_MUSIC_V2_READY.txt'
MARKER_V1 = 'sonara-realism-api-v1'
MARKER_V2 = 'sonara-realism-api-v2'

MODELS = ROOT / 'acestep/api/http/release_task_models.py'
BUILDER = ROOT / 'acestep/api/http/release_task_request_builder.py'
SETUP = ROOT / 'acestep/api/job_generation_setup.py'
HEALTH = ROOT / 'acestep/api/http/model_service_routes.py'


def banner(text: str) -> None:
    print('\n' + '=' * 96, flush=True)
    print(text, flush=True)
    print('=' * 96, flush=True)


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY_PATCHED', flush=True)
        return text
    if old not in text:
        raise RuntimeError(f'Pattern non trovato per {label}. Il checkout ACE-Step non corrisponde alla revisione SONARA attesa.')
    print(f'{label}=PATCHED', flush=True)
    return text.replace(old, new, 1)


def patch_file(path: Path, transforms) -> None:
    original = path.read_text(encoding='utf-8')
    text = original
    for old, new, label in transforms:
        text = replace_once(text, old, new, label)
    if text != original:
        backup = path.with_suffix(path.suffix + '.sonara-real-music-v2.bak')
        if not backup.exists():
            backup.write_text(original, encoding='utf-8')
        path.write_text(text, encoding='utf-8')
        print(f'UPDATED={path}', flush=True)


def require_runtime() -> None:
    if not ROOT.exists() or not PYTHON.exists():
        raise RuntimeError('ACE-Step CLEAN non trovato.')
    for path in (MODELS, BUILDER, SETUP, HEALTH):
        if not path.exists():
            raise RuntimeError(f'File ACE-Step mancante: {path}')


def patch_http_contract() -> None:
    banner('1/6 - REAL MUSIC V2: HTTP CONTRACT COMPLETO')

    patch_file(MODELS, [
        (
            '    allow_lm_batch: bool = True\n    track_name: Optional[str] = None\n',
            '    allow_lm_batch: bool = True\n'
            '    lm_batch_chunk_size: int = Field(default=8, ge=1, le=8)\n'
            '    sonara_generation_profile: Literal["auto", "fast", "quality", "ultra"] = "auto"\n'
            '    track_name: Optional[str] = None\n',
            'REQUEST_V2_BATCH_PROFILE'
        ),
    ])

    patch_file(BUILDER, [
        (
            '        infer_method=parser.str("infer_method", "ode"),\n        shift=parser.float("shift", 3.0),\n',
            '        infer_method=parser.str("infer_method", "ode"),\n'
            '        sampler_mode=parser.str("sampler_mode", "euler"),\n'
            '        shift=parser.float("shift", 3.0),\n'
            '        dcw_enabled=parser.get("dcw_enabled"),\n'
            '        dcw_mode=parser.str("dcw_mode", "double"),\n'
            '        dcw_scaler=parser.float("dcw_scaler", 0.05),\n'
            '        dcw_high_scaler=parser.float("dcw_high_scaler", 0.02),\n'
            '        dcw_wavelet=parser.str("dcw_wavelet", "haar"),\n',
            'BUILDER_SAMPLER_DCW'
        ),
        (
            '        constrained_decoding_debug=parser.bool("constrained_decoding_debug"),\n        use_cot_caption=parser.bool("use_cot_caption", True),\n',
            '        constrained_decoding_debug=parser.bool("constrained_decoding_debug"),\n'
            '        use_cot_metas=parser.bool("use_cot_metas", True),\n'
            '        use_cot_caption=parser.bool("use_cot_caption", True),\n',
            'BUILDER_COT_METAS'
        ),
        (
            '        allow_lm_batch=parser.bool("allow_lm_batch", True),\n        track_name=parser.str("track_name"),\n',
            '        allow_lm_batch=parser.bool("allow_lm_batch", True),\n'
            '        lm_batch_chunk_size=parser.int("lm_batch_chunk_size", 8),\n'
            '        sonara_generation_profile=parser.str("sonara_generation_profile", "auto"),\n'
            '        track_name=parser.str("track_name"),\n',
            'BUILDER_V2_BATCH_PROFILE'
        ),
    ])


def patch_generation_runtime() -> None:
    banner('2/6 - REAL MUSIC V2: QUALITA + VELOCITA')

    patch_file(SETUP, [
        (
            '        sampler_mode=req.sampler_mode,\n',
            '        sampler_mode=(\n'
            '            "heun"\n'
            '            if thinking and req.sonara_generation_profile == "ultra"\n'
            '            else "euler"\n'
            '            if req.sonara_generation_profile in {"fast", "quality"}\n'
            '            else req.sampler_mode\n'
            '        ),\n',
            'SETUP_PROFILE_SAMPLER'
        ),
        (
            '        dcw_scaler=req.dcw_scaler,\n        dcw_high_scaler=req.dcw_high_scaler,\n',
            '        dcw_scaler=(0.02 if thinking else req.dcw_scaler),\n'
            '        dcw_high_scaler=(0.06 if thinking else req.dcw_high_scaler),\n',
            'SETUP_THINK_DCW'
        ),
        (
            '    config = GenerationConfig(\n        batch_size=batch_size,\n        allow_lm_batch=req.allow_lm_batch,\n',
            '    config = GenerationConfig(\n'
            '        batch_size=batch_size,\n'
            '        allow_lm_batch=((thinking and batch_size > 1) or req.allow_lm_batch),\n'
            '        lm_batch_chunk_size=req.lm_batch_chunk_size,\n',
            'SETUP_LM_BATCH_SPEED'
        ),
    ])


def patch_health_marker() -> None:
    banner('3/6 - REAL MUSIC V2: HEALTH MARKER')
    patch_file(HEALTH, [
        (
            f'                "sonara_realism_api": "{MARKER_V1}",\n',
            f'                "sonara_realism_api": "{MARKER_V1}",\n'
            '                "sonara_realism_api_v2": True,\n'
            f'                "sonara_realism_optimizer": "{MARKER_V2}",\n'
            '                "sonara_lm_backend": os.getenv("ACESTEP_LM_BACKEND", "auto"),\n'
            '                "sonara_compile_model": os.getenv("ACESTEP_COMPILE_MODEL", "false").strip().lower() in {"1", "true", "yes", "on"},\n',
            'HEALTH_REAL_MUSIC_V2'
        ),
    ])


def verify_code() -> None:
    banner('4/6 - VERIFICA PATCH V2')
    for path in (MODELS, BUILDER, SETUP, HEALTH):
        done = subprocess.run([str(PYTHON), '-m', 'py_compile', str(path)], cwd=str(ROOT), check=False)
        if done.returncode != 0:
            raise RuntimeError(f'Syntax check fallito: {path}')

    code = r'''
from acestep.api.http.release_task_models import GenerateMusicRequest
r = GenerateMusicRequest(
    prompt='test', thinking=True, sampler_mode='heun', use_cot_metas=False,
    dcw_enabled=True, dcw_mode='double', dcw_scaler=0.05, dcw_high_scaler=0.02,
    allow_lm_batch=False, lm_batch_chunk_size=8, sonara_generation_profile='quality',
)
assert r.sampler_mode == 'heun'
assert r.use_cot_metas is False
assert r.dcw_enabled is True
assert r.lm_batch_chunk_size == 8
assert r.sonara_generation_profile == 'quality'
print('REAL_MUSIC_V2_SCHEMA=OK')
'''
    done = subprocess.run([str(PYTHON), '-c', code], cwd=str(ROOT), check=False)
    if done.returncode != 0:
        raise RuntimeError('Verifica schema Real Music V2 fallita.')


def stop_old_api() -> None:
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
        cmd = parts[1].lower()
        if 'acestep.api_server' in cmd and str(PORT) in cmd:
            try:
                print(f'STOP_OLD_API_PID={pid}', flush=True)
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
    time.sleep(5)


def can_import(module: str) -> bool:
    done = subprocess.run(
        [str(PYTHON), '-c', f'import {module}; print("OK")'],
        cwd=str(ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        check=False,
    )
    return done.returncode == 0


def api_env(backend: str, compile_model: bool) -> dict:
    env = os.environ.copy()
    env.pop('VIRTUAL_ENV', None)
    env.update({
        'ACESTEP_PROJECT_ROOT': str(ROOT),
        'ACESTEP_CHECKPOINTS_DIR': str(ROOT / 'checkpoints'),
        'ACESTEP_CONFIG_PATH': MODEL,
        'ACESTEP_DEVICE': 'cuda',
        'ACESTEP_INIT_LLM': 'true',
        'ACESTEP_LM_MODEL_PATH': LM_MODEL,
        'ACESTEP_LM_BACKEND': backend,
        'ACESTEP_LM_DEVICE': 'cuda',
        'ACESTEP_USE_FLASH_ATTENTION': 'false',
        'ACESTEP_COMPILE_MODEL': 'true' if compile_model else 'false',
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
        'TRITON_CACHE_DIR': str(ROOT / '.cache/acestep/triton'),
        'TORCHINDUCTOR_CACHE_DIR': str(ROOT / '.cache/acestep/torchinductor'),
    })
    return env


def request_json(url: str, timeout: int = 15) -> dict:
    req = urllib.request.Request(
        url,
        headers={
            'Accept': 'application/json',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'User-Agent': 'SONARA-Real-Music-V2/1.0',
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode('utf-8', errors='replace')
    return json.loads(raw) if raw else {}


def health_ready(body: dict) -> bool:
    if not isinstance(body, dict):
        return False
    data = body.get('data') or body
    return (
        str(data.get('status') or '').lower() == 'ok'
        and data.get('models_initialized') is True
        and data.get('llm_initialized') is True
        and data.get('sonara_realism_api_v2') is True
        and MODEL in str(data.get('loaded_model') or '')
    )


def start_api_attempt(backend: str, compile_model: bool):
    WORK.mkdir(parents=True, exist_ok=True)
    API_LOG.write_text('', encoding='utf-8')
    stream = API_LOG.open('a', encoding='utf-8', buffering=1)
    env = api_env(backend, compile_model)
    proc = subprocess.Popen(
        [
            str(PYTHON), '-m', 'acestep.api_server',
            '--host', '0.0.0.0', '--port', str(PORT),
            '--download-source', 'huggingface',
            '--init-llm', '--lm-model-path', LM_MODEL,
        ],
        cwd=str(ROOT), env=env, stdout=stream, stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f'API_ATTEMPT backend={backend} compile={compile_model} pid={proc.pid}', flush=True)
    deadline = time.time() + 2100
    last = None
    while time.time() < deadline:
        if proc.poll() is not None:
            return None, None
        try:
            body = request_json(f'http://127.0.0.1:{PORT}/health', 10)
            last = body.get('data') or body
            if health_ready(body):
                return proc, last
        except Exception:
            pass
        time.sleep(3)
    if proc.poll() is None:
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except Exception:
            proc.terminate()
    return None, last


def start_best_api():
    banner('5/6 - AVVIO V2: vLLM + TORCH.COMPILE CON FALLBACK')
    stop_old_api()
    vllm_ready = can_import('vllm')
    print(f'VLLM_IMPORT={"READY" if vllm_ready else "UNAVAILABLE"}', flush=True)

    attempts = []
    if vllm_ready:
        attempts.extend([('vllm', True), ('vllm', False)])
    attempts.extend([('pt', True), ('pt', False)])

    for backend, compile_model in attempts:
        proc, health = start_api_attempt(backend, compile_model)
        if proc is not None:
            print(f'API_SELECTED_BACKEND={backend}', flush=True)
            print(f'TORCH_COMPILE={str(compile_model).lower()}', flush=True)
            print(json.dumps(health, indent=2, ensure_ascii=False), flush=True)
            return proc, backend, compile_model, health
        tail = API_LOG.read_text(errors='replace')[-12000:] if API_LOG.exists() else ''
        print(f'ATTEMPT_FAILED backend={backend} compile={compile_model}\n{tail}', flush=True)
        time.sleep(3)

    raise RuntimeError('Nessuna configurazione Real Music V2 e riuscita ad avviare ACE-Step.')


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
    urllib.request.urlretrieve(url, target)
    target.chmod(0o755)
    return target


def start_new_tunnel():
    banner('6/6 - NUOVO TUNNEL REAL MUSIC V2')
    binary = cloudflared_binary()
    pattern = re.compile(r'https://[a-z0-9-]+\.trycloudflare\.com', re.I)

    for protocol in ('http2', 'quic'):
        log_path = WORK / f'cloudflare-{protocol}.log'
        log_path.write_text('', encoding='utf-8')
        stream = log_path.open('a', encoding='utf-8', buffering=1)
        cmd = [
            str(binary), 'tunnel', '--url', f'http://127.0.0.1:{PORT}',
            '--no-autoupdate', '--protocol', protocol, '--loglevel', 'info',
        ]
        print('$ ' + ' '.join(cmd), flush=True)
        proc = subprocess.Popen(cmd, stdout=stream, stderr=subprocess.STDOUT, start_new_session=True)
        deadline = time.time() + 90
        public_url = None
        while time.time() < deadline:
            if proc.poll() is not None:
                break
            text = log_path.read_text(errors='replace') if log_path.exists() else ''
            match = pattern.search(text)
            if match:
                public_url = match.group(0).rstrip('/')
                break
            time.sleep(0.5)

        if public_url:
            deadline2 = time.time() + 240
            while time.time() < deadline2:
                if proc.poll() is not None:
                    break
                try:
                    if health_ready(request_json(public_url + '/health', 20)):
                        print('PUBLIC_REAL_MUSIC_V2_HEALTH=READY', flush=True)
                        return proc, public_url
                except Exception:
                    pass
                time.sleep(2)

        if proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except Exception:
                proc.terminate()

    raise RuntimeError('API V2 pronta localmente ma Quick Tunnel non disponibile.')


def main() -> None:
    require_runtime()
    patch_http_contract()
    patch_generation_runtime()
    patch_health_marker()
    verify_code()
    api_proc, backend, compile_model, health = start_best_api()
    tunnel_proc, public_url = start_new_tunnel()

    READY_FILE.write_text(
        '\n'.join([
            'SONARA_REAL_MUSIC_V2_READY=YES',
            f'MODEL={MODEL}',
            f'LM_MODEL={LM_MODEL}',
            f'LM_BACKEND={backend}',
            f'TORCH_COMPILE={str(compile_model).lower()}',
            'FLASH_ATTENTION=SAFE_FALLBACK',
            'INFERENCE_STEPS=8',
            'FAST=EULER+NO_LM',
            'QUALITY=LM4B+EULER+DCW_THINK_TUNED',
            'ULTRA=LM4B+HEUN+DCW_THINK_TUNED',
            'LM_BATCH=ON_FOR_MULTI_CANDIDATE',
            'LM_BATCH_CHUNK_SIZE=8',
            'DCW_THINK_LOW=0.02',
            'DCW_THINK_HIGH=0.06',
            f'REALISM_API_MARKER={MARKER_V2}',
            f'PUBLIC_URL={public_url}',
            f'HEALTH={json.dumps(health, ensure_ascii=False)}',
        ]) + '\n',
        encoding='utf-8',
    )

    banner('✅ SONARA REAL MUSIC V2 — MAX QUALITY + SPEED READY')
    print(f'SONARA_MOLAB_XL_URL={public_url}', flush=True)
    print(f'MODEL={MODEL}', flush=True)
    print(f'LM_MODEL={LM_MODEL}', flush=True)
    print(f'LM_BACKEND={backend}', flush=True)
    print(f'TORCH_COMPILE={str(compile_model).lower()}', flush=True)
    print('INFERENCE_STEPS=8', flush=True)
    print('FAST=XL_TURBO+EULER', flush=True)
    print('QUALITY=LM4B+EULER+DCW_0.02_0.06', flush=True)
    print('ULTRA=LM4B+HEUN+DCW_0.02_0.06', flush=True)
    print('LM_BATCH=ON', flush=True)
    print('FLASH_ATTENTION=SAFE_FALLBACK', flush=True)
    print('REALISM_API_MARKER=' + MARKER_V2, flush=True)
    print(f'READY_FILE={READY_FILE}', flush=True)
    print('NON FERMARE QUESTA CELLA.', flush=True)

    try:
        while True:
            if api_proc.poll() is not None:
                tail = API_LOG.read_text(errors='replace')[-12000:] if API_LOG.exists() else ''
                raise RuntimeError(f'ACE-Step V2 API fermata.\n{tail}')
            if tunnel_proc.poll() is not None:
                raise RuntimeError('Tunnel Real Music V2 fermato.')
            try:
                ok = health_ready(request_json(f'http://127.0.0.1:{PORT}/health', 8))
            except Exception:
                ok = False
            print(
                f"[{time.strftime('%H:%M:%S')}] REAL MUSIC V2 | API={'UP' if ok else 'DOWN'} | "
                f'LM={backend.upper()} | COMPILE={"ON" if compile_model else "OFF"} | TUNNEL=UP | {public_url}',
                flush=True,
            )
            time.sleep(60)
    finally:
        for proc in (tunnel_proc, api_proc):
            if proc.poll() is None:
                try:
                    os.killpg(proc.pid, signal.SIGTERM)
                except Exception:
                    try:
                        proc.terminate()
                    except Exception:
                        pass


if __name__ == '__main__':
    main()
