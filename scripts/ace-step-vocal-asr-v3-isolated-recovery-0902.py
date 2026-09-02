#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import platform
import shutil
import signal
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PYTHON = ROOT / '.venv/bin/python'
ASR_ROOT = Path('/marimo/SONARA-ASR-V3')
ASR_VENV = ASR_ROOT / '.venv'
ASR_PYTHON = ASR_VENV / 'bin/python'
ASR_SERVER = ASR_ROOT / 'server.py'
ASR_LOG = ASR_ROOT / 'server.log'
ASR_PORT = 8013
API_PROXY = ROOT / 'acestep/api/http/sonara_vocal_asr.py'
API_SERVER = ROOT / 'acestep/api_server.py'
HEALTH = ROOT / 'acestep/api/http/model_service_routes.py'
V2_URL = (
    'https://raw.githubusercontent.com/'
    'alo986761986-gif/Sonara-Enterprise/'
    'f9c5419b8ce547db3223e7a3803f3367a28b7dfd/'
    'scripts/ace-step-real-music-v2-speed-quality-upgrade-0902.py'
)

PROXY_CODE = r'''from __future__ import annotations

import asyncio
import json
import urllib.request
from fastapi import FastAPI
from pydantic import BaseModel

_SIDECAR = 'http://127.0.0.1:8013'

class SonaraTranscribeRequest(BaseModel):
    path: str
    language: str = 'auto'
    expected_lyrics: str = ''
    word_timestamps: bool = True


def _get_json(url: str, timeout: int = 10):
    request = urllib.request.Request(url, headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode('utf-8', errors='replace')
    return json.loads(raw) if raw else {}


def _post_json(url: str, payload: dict, timeout: int = 900):
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'Cache-Control': 'no-cache'},
        method='POST',
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode('utf-8', errors='replace')
    return json.loads(raw) if raw else {}


def configure_sonara_vocal_asr(app: FastAPI, project_root: str) -> None:
    if getattr(app.state, '_sonara_vocal_asr_configured', False):
        return
    app.state._sonara_vocal_asr_configured = True

    @app.get('/v1/sonara/asr-health')
    async def sonara_asr_health():
        try:
            return await asyncio.to_thread(_get_json, _SIDECAR + '/health', 10)
        except Exception as exc:
            return {'ok': False, 'service': 'sonara-vocal-asr-v3-proxy', 'sidecar': False, 'error': str(exc)}

    @app.post('/v1/sonara/transcribe')
    async def sonara_transcribe(req: SonaraTranscribeRequest):
        try:
            payload = req.model_dump() if hasattr(req, 'model_dump') else req.dict()
            return await asyncio.to_thread(_post_json, _SIDECAR + '/v1/sonara/transcribe', payload, 900)
        except Exception as exc:
            return {'data': {'ok': False}, 'code': 503, 'error': f'ASR sidecar non disponibile: {exc}'}
'''

SIDECAR_CODE = r'''from __future__ import annotations

import difflib
import os
import re
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

app = FastAPI(title='SONARA Vocal ASR V3', version='3.1-isolated')
_MODEL = None
_LOCK = threading.Lock()
_ALLOWED = {'.wav', '.mp3', '.flac', '.ogg', '.m4a', '.aac', '.opus'}


def norm_word(value: str) -> str:
    text = str(value or '').lower().strip().replace('’', "'").replace('‘', "'").replace('`', "'")
    text = re.sub(r"[^\wÀ-ÖØ-öø-ÿ']+", '', text, flags=re.UNICODE)
    return text.replace("'", '')


def expected_words(value: str) -> list[str]:
    text = re.sub(r'\[[^\]]+\]', ' ', str(value or ''))
    return [word for word in (norm_word(token) for token in re.split(r'\s+', text)) if word]


def load_model():
    global _MODEL
    if _MODEL is not None:
        return _MODEL
    with _LOCK:
        if _MODEL is not None:
            return _MODEL
        from faster_whisper import WhisperModel
        _MODEL = WhisperModel(
            os.getenv('SONARA_ASR_MODEL', 'large-v3-turbo'),
            device=os.getenv('SONARA_ASR_DEVICE', 'cuda'),
            compute_type=os.getenv('SONARA_ASR_COMPUTE_TYPE', 'float16'),
        )
        return _MODEL


def resolve_audio(value: str) -> Path:
    path = Path(str(value or '').strip()).expanduser()
    if not path.is_absolute():
        path = Path('/marimo/SONARA-ACE-Step-CLEAN') / path
    path = path.resolve()
    if not path.exists() or not path.is_file():
        raise ValueError('audio non trovato')
    if path.suffix.lower() not in _ALLOWED:
        raise ValueError('formato audio non consentito')
    return path


def align(expected: list[str], items: list[dict[str, Any]]):
    actual = [item['norm'] for item in items if item.get('norm')]
    matcher = difflib.SequenceMatcher(a=expected, b=actual, autojunk=False)
    missing, extra, ranges = [], [], []
    edits = 0
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            continue
        if tag in {'replace', 'delete'}:
            missing.extend(expected[i1:i2])
        if tag in {'replace', 'insert'}:
            extra.extend(actual[j1:j2])
        edits += max(i2 - i1, j2 - j1) if tag == 'replace' else (i2 - i1 if tag == 'delete' else j2 - j1)
        if items:
            left = max(0, min(j1, len(items) - 1))
            right = max(left, min(max(j2 - 1, j1), len(items) - 1))
            start = float(items[left].get('start') or 0.0)
            end = float(items[right].get('end') or start + 0.5)
            ranges.append({
                'start': round(start, 3),
                'end': round(max(end, start + 0.1), 3),
                'expected': ' '.join(expected[i1:i2]),
                'heard': ' '.join(actual[j1:j2]),
                'type': tag,
            })
    wer = edits / max(1, len(expected))
    return {
        'word_error_rate': round(wer, 4),
        'lyric_accuracy': round(max(0.0, min(1.0, 1.0 - wer)), 4),
        'missing_words': missing[:80],
        'extra_words': extra[:80],
        'mismatch_ranges': ranges[:24],
    }


class RequestBody(BaseModel):
    path: str
    language: str = 'auto'
    expected_lyrics: str = ''
    word_timestamps: bool = True


@app.get('/health')
async def health():
    return {
        'ok': True,
        'service': 'sonara-vocal-asr-v3',
        'mode': 'isolated-sidecar',
        'model': os.getenv('SONARA_ASR_MODEL', 'large-v3-turbo'),
        'device': os.getenv('SONARA_ASR_DEVICE', 'cuda'),
        'compute_type': os.getenv('SONARA_ASR_COMPUTE_TYPE', 'float16'),
        'loaded': _MODEL is not None,
    }


@app.post('/v1/sonara/transcribe')
async def transcribe(req: RequestBody):
    try:
        path = resolve_audio(req.path)
        model = load_model()
        language = str(req.language or '').strip().lower()
        if language in {'', 'auto', 'unknown', 'none'}:
            language = None
        segments, info = model.transcribe(
            str(path),
            language=language,
            beam_size=5,
            best_of=5,
            vad_filter=True,
            word_timestamps=True,
            condition_on_previous_text=True,
        )
        transcript_parts, words = [], []
        duration = 0.0
        for segment in segments:
            transcript_parts.append(str(segment.text or '').strip())
            duration = max(duration, float(getattr(segment, 'end', 0.0) or 0.0))
            for word in getattr(segment, 'words', None) or []:
                raw = str(getattr(word, 'word', '') or '').strip()
                norm = norm_word(raw)
                if not norm:
                    continue
                words.append({
                    'word': raw,
                    'norm': norm,
                    'start': round(float(getattr(word, 'start', 0.0) or 0.0), 3),
                    'end': round(float(getattr(word, 'end', 0.0) or 0.0), 3),
                    'probability': round(float(getattr(word, 'probability', 0.0) or 0.0), 4),
                })
        expected = expected_words(req.expected_lyrics)
        scores = align(expected, words) if expected else {
            'word_error_rate': None,
            'lyric_accuracy': None,
            'missing_words': [],
            'extra_words': [],
            'mismatch_ranges': [],
        }
        return {
            'data': {
                'ok': True,
                'service': 'sonara-vocal-asr-v3',
                'mode': 'isolated-sidecar',
                'transcript': ' '.join(part for part in transcript_parts if part).strip(),
                'language': str(getattr(info, 'language', '') or language or 'unknown'),
                'language_probability': round(float(getattr(info, 'language_probability', 0.0) or 0.0), 4),
                'duration_sec': round(duration, 3),
                'words': words if req.word_timestamps else [],
                **scores,
            },
            'code': 200,
            'error': None,
        }
    except Exception as exc:
        return {'data': {'ok': False}, 'code': 500, 'error': str(exc)}


if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8013, workers=1)
'''


def banner(text: str) -> None:
    print('\n' + '=' * 96, flush=True)
    print(text, flush=True)
    print('=' * 96, flush=True)


def run(cmd, label: str, cwd: Path | None = None, env: dict | None = None, check: bool = True) -> subprocess.CompletedProcess:
    print(f'\n[{label}] ' + ' '.join(map(str, cmd)), flush=True)
    result = subprocess.run(cmd, cwd=str(cwd or ROOT), env=env, check=False)
    print(f'{label}_EXIT={result.returncode}', flush=True)
    if check and result.returncode != 0:
        raise RuntimeError(f'{label} fallito (exit={result.returncode})')
    return result


def uv_binary() -> str:
    candidates = [shutil.which('uv'), '/root/.local/bin/uv', '/usr/local/bin/uv', str(Path.home() / '.local/bin/uv')]
    for item in candidates:
        if item and Path(item).exists():
            return str(item)
    raise RuntimeError('uv non trovato')


def stop_matching(fragment: str) -> None:
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
        if fragment.lower() in parts[1].lower():
            try:
                print(f'STOP_PID={pid} MATCH={fragment}', flush=True)
                os.kill(pid, signal.SIGTERM)
            except Exception:
                pass


def restore_acestep_env(uv: str) -> None:
    banner('1/6 - RIPRISTINO AMBIENTE UFFICIALE ACE-STEP')
    stop_matching('acestep.api_server')
    time.sleep(3)
    run([uv, 'sync', '--frozen', '--project', str(ROOT), '--python', '3.12', '--no-dev'], 'UV_SYNC_RESTORE', cwd=ROOT)
    code = (
        'import torch; '
        'print("TORCH=" + str(torch.__version__)); '
        'print("CUDA_AVAILABLE=" + str(torch.cuda.is_available())); '
        'print("CUDA=" + str(torch.version.cuda)); '
        'assert torch.cuda.is_available()'
    )
    run([str(PYTHON), '-c', code], 'TORCH_CUDA_VERIFY', cwd=ROOT)


def install_proxy() -> None:
    banner('2/6 - ASR PROXY LEGGERO DENTRO ACE-STEP')
    API_PROXY.write_text(PROXY_CODE, encoding='utf-8')
    api_text = API_SERVER.read_text(encoding='utf-8')
    import_line = 'from acestep.api.http.sonara_vocal_asr import configure_sonara_vocal_asr\n'
    if import_line not in api_text:
        anchor = 'from acestep.api.model_download import (\n    ensure_model_downloaded as _ensure_model_downloaded,\n)\n'
        if anchor not in api_text:
            raise RuntimeError('Anchor import API non trovato')
        api_text = api_text.replace(anchor, anchor + import_line, 1)
    configure_line = 'configure_sonara_vocal_asr(app, _get_project_root())\n'
    if configure_line not in api_text:
        anchor = 'app = create_app()\n'
        if anchor not in api_text:
            raise RuntimeError('Anchor create_app non trovato')
        api_text = api_text.replace(anchor, anchor + configure_line, 1)
    API_SERVER.write_text(api_text, encoding='utf-8')
    run([str(PYTHON), '-m', 'py_compile', str(API_PROXY), str(API_SERVER), str(HEALTH)], 'API_PROXY_SYNTAX', cwd=ROOT)


def asr_env() -> dict:
    env = os.environ.copy()
    lib_code = r'''
import os
paths=[]
for mod in ('nvidia.cublas.lib','nvidia.cudnn.lib'):
    try:
        m=__import__(mod, fromlist=['x'])
        paths.append(os.path.dirname(m.__file__))
    except Exception:
        pass
print(':'.join(paths))
'''
    result = subprocess.run([str(ASR_PYTHON), '-c', lib_code], text=True, capture_output=True, check=False)
    libs = result.stdout.strip()
    if libs:
        env['LD_LIBRARY_PATH'] = libs + (':' + env['LD_LIBRARY_PATH'] if env.get('LD_LIBRARY_PATH') else '')
        print('ASR_LD_LIBRARY_PATH=' + libs, flush=True)
    env.update({
        'SONARA_ASR_MODEL': 'large-v3-turbo',
        'SONARA_ASR_DEVICE': 'cuda',
        'SONARA_ASR_COMPUTE_TYPE': 'float16',
        'PYTHONUNBUFFERED': '1',
    })
    return env


def install_sidecar(uv: str) -> None:
    banner('3/6 - AMBIENTE ASR ISOLATO')
    ASR_ROOT.mkdir(parents=True, exist_ok=True)
    ASR_SERVER.write_text(SIDECAR_CODE, encoding='utf-8')
    if not ASR_PYTHON.exists():
        run([uv, 'venv', '--python', '3.12', str(ASR_VENV)], 'ASR_VENV_CREATE', cwd=ASR_ROOT)
    run([
        uv, 'pip', 'install', '--python', str(ASR_PYTHON), '--upgrade',
        'faster-whisper>=1.2.0,<2',
        'fastapi>=0.115,<1',
        'uvicorn>=0.34,<1',
        'pydantic>=2.10,<3',
        'nvidia-cublas-cu12',
        'nvidia-cudnn-cu12==9.*',
    ], 'ASR_ISOLATED_INSTALL', cwd=ASR_ROOT)
    run([str(ASR_PYTHON), '-m', 'py_compile', str(ASR_SERVER)], 'ASR_SIDECAR_SYNTAX', cwd=ASR_ROOT)
    run([str(ASR_PYTHON), '-c', 'import faster_whisper,ctranslate2; print("FASTER_WHISPER=OK"); print("CT2_CUDA_DEVICES="+str(ctranslate2.get_cuda_device_count()))'], 'ASR_IMPORT_VERIFY', cwd=ASR_ROOT, env=asr_env())


def get_json(url: str, timeout: int = 10) -> dict:
    req = urllib.request.Request(url, headers={'Accept': 'application/json', 'Cache-Control': 'no-cache'})
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode('utf-8', errors='replace')
    return json.loads(raw) if raw else {}


def start_sidecar() -> None:
    banner('4/6 - AVVIO ASR SIDECAR')
    stop_matching(str(ASR_SERVER))
    time.sleep(2)
    ASR_LOG.write_text('', encoding='utf-8')
    stream = ASR_LOG.open('a', encoding='utf-8', buffering=1)
    proc = subprocess.Popen(
        [str(ASR_PYTHON), str(ASR_SERVER)],
        cwd=str(ASR_ROOT), env=asr_env(), stdout=stream, stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f'ASR_PID={proc.pid}', flush=True)
    deadline = time.time() + 90
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = ASR_LOG.read_text(errors='replace')[-12000:] if ASR_LOG.exists() else ''
            raise RuntimeError('ASR sidecar terminato:\n' + tail)
        try:
            body = get_json(f'http://127.0.0.1:{ASR_PORT}/health', 5)
            if body.get('ok') is True:
                print('ASR_SIDECAR_HEALTH=' + json.dumps(body, ensure_ascii=False), flush=True)
                return
        except Exception:
            pass
        time.sleep(2)
    tail = ASR_LOG.read_text(errors='replace')[-12000:] if ASR_LOG.exists() else ''
    raise RuntimeError('ASR sidecar non ready:\n' + tail)


def run_v2() -> None:
    banner('5/6 - RIAVVIO REAL MUSIC V2 SU AMBIENTE RIPRISTINATO')
    request = urllib.request.Request(V2_URL, headers={'Cache-Control': 'no-cache, no-store', 'Pragma': 'no-cache', 'User-Agent': 'SONARA-ASR-ISOLATED-RECOVERY/1.0'})
    code = urllib.request.urlopen(request, timeout=90).read().decode('utf-8')
    namespace = {'__name__': '__main__'}
    exec(compile(code, '<ace-step-real-music-v2-speed-quality-upgrade-0902.py>', 'exec'), namespace)


def main() -> None:
    if not ROOT.exists():
        raise RuntimeError('SONARA ACE-Step CLEAN non trovato')
    uv = uv_binary()
    print('SONARA_ASR_V3_ISOLATED_RECOVERY=START', flush=True)
    print('UV=' + uv, flush=True)
    restore_acestep_env(uv)
    install_proxy()
    install_sidecar(uv)
    start_sidecar()
    print('ASR_ISOLATION=OK', flush=True)
    print('ACE_STEP_ENV=RESTORED', flush=True)
    print('NEXT=REAL_MUSIC_V2_RESTART', flush=True)
    run_v2()


if __name__ == '__main__':
    main()
