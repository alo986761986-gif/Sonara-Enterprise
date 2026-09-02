#!/usr/bin/env python3
from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path('/marimo/SONARA-ACE-Step-CLEAN')
PYTHON = ROOT / '.venv/bin/python'
API_SERVER = ROOT / 'acestep/api_server.py'
ASR_MODULE = ROOT / 'acestep/api/http/sonara_vocal_asr.py'
HEALTH = ROOT / 'acestep/api/http/model_service_routes.py'
PORT = 8001

ASR_CODE = r'''from __future__ import annotations

import difflib
import os
import re
import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel

_ASR_LOCK = threading.Lock()
_ASR_MODEL = None
_ALLOWED_EXTENSIONS = {'.wav', '.mp3', '.flac', '.ogg', '.m4a', '.aac', '.opus'}


def _normalize_word(value: str) -> str:
    text = str(value or '').lower().strip()
    text = text.replace('’', "'").replace('‘', "'").replace('`', "'")
    text = re.sub(r"[^\wÀ-ÖØ-öø-ÿ']+", '', text, flags=re.UNICODE)
    return text.replace("'", '')


def _expected_words(value: str) -> list[str]:
    text = re.sub(r'\[[^\]]+\]', ' ', str(value or ''))
    return [word for word in (_normalize_word(token) for token in re.split(r'\s+', text)) if word]


def _load_model():
    global _ASR_MODEL
    if _ASR_MODEL is not None:
        return _ASR_MODEL
    with _ASR_LOCK:
        if _ASR_MODEL is not None:
            return _ASR_MODEL
        from faster_whisper import WhisperModel
        model_name = os.getenv('SONARA_ASR_MODEL', 'large-v3-turbo')
        device = os.getenv('SONARA_ASR_DEVICE', 'cuda')
        compute_type = os.getenv('SONARA_ASR_COMPUTE_TYPE', 'float16')
        _ASR_MODEL = WhisperModel(model_name, device=device, compute_type=compute_type)
        return _ASR_MODEL


def _resolve_audio(path: str, project_root: str) -> Path:
    raw = str(path or '').strip()
    if not raw:
        raise ValueError('audio path mancante')
    candidate = Path(raw).expanduser()
    if not candidate.is_absolute():
        candidate = Path(project_root) / candidate
    candidate = candidate.resolve()
    if not candidate.exists() or not candidate.is_file():
        raise ValueError('audio non trovato')
    if candidate.suffix.lower() not in _ALLOWED_EXTENSIONS:
        raise ValueError('formato audio non consentito')
    return candidate


def _alignment(expected: list[str], actual_items: list[dict[str, Any]]):
    actual = [item['norm'] for item in actual_items if item.get('norm')]
    matcher = difflib.SequenceMatcher(a=expected, b=actual, autojunk=False)
    missing: list[str] = []
    extra: list[str] = []
    mismatch_ranges: list[dict[str, Any]] = []
    edits = 0

    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == 'equal':
            continue
        if tag in {'replace', 'delete'}:
            missing.extend(expected[i1:i2])
        if tag in {'replace', 'insert'}:
            extra.extend(actual[j1:j2])
        if tag == 'replace':
            edits += max(i2 - i1, j2 - j1)
        elif tag == 'delete':
            edits += i2 - i1
        elif tag == 'insert':
            edits += j2 - j1

        if actual_items:
            left = max(0, min(j1, len(actual_items) - 1))
            right = max(left, min(max(j2 - 1, j1), len(actual_items) - 1))
            start = float(actual_items[left].get('start') or 0.0)
            end = float(actual_items[right].get('end') or start + 0.5)
            mismatch_ranges.append({
                'start': round(start, 3),
                'end': round(max(end, start + 0.1), 3),
                'expected': ' '.join(expected[i1:i2]),
                'heard': ' '.join(actual[j1:j2]),
                'type': tag,
            })

    denominator = max(1, len(expected))
    wer = edits / denominator
    accuracy = max(0.0, min(1.0, 1.0 - wer))
    return {
        'word_error_rate': round(wer, 4),
        'lyric_accuracy': round(accuracy, 4),
        'missing_words': missing[:80],
        'extra_words': extra[:80],
        'mismatch_ranges': mismatch_ranges[:24],
    }


class SonaraTranscribeRequest(BaseModel):
    path: str
    language: str = 'auto'
    expected_lyrics: str = ''
    word_timestamps: bool = True


def configure_sonara_vocal_asr(app: FastAPI, project_root: str) -> None:
    if getattr(app.state, '_sonara_vocal_asr_configured', False):
        return
    app.state._sonara_vocal_asr_configured = True

    @app.get('/v1/sonara/asr-health')
    async def sonara_asr_health():
        return {
            'ok': True,
            'service': 'sonara-vocal-asr-v3',
            'model': os.getenv('SONARA_ASR_MODEL', 'large-v3-turbo'),
            'device': os.getenv('SONARA_ASR_DEVICE', 'cuda'),
            'compute_type': os.getenv('SONARA_ASR_COMPUTE_TYPE', 'float16'),
            'loaded': _ASR_MODEL is not None,
        }

    @app.post('/v1/sonara/transcribe')
    async def sonara_transcribe(req: SonaraTranscribeRequest):
        try:
            audio_path = _resolve_audio(req.path, project_root)
            model = _load_model()
            language = str(req.language or '').strip().lower()
            if language in {'', 'auto', 'unknown', 'none'}:
                language = None
            segments, info = model.transcribe(
                str(audio_path),
                language=language,
                beam_size=5,
                best_of=5,
                vad_filter=True,
                word_timestamps=True,
                condition_on_previous_text=True,
            )
            transcript_parts: list[str] = []
            words: list[dict[str, Any]] = []
            duration = 0.0
            for segment in segments:
                transcript_parts.append(str(segment.text or '').strip())
                duration = max(duration, float(getattr(segment, 'end', 0.0) or 0.0))
                for word in getattr(segment, 'words', None) or []:
                    raw = str(getattr(word, 'word', '') or '').strip()
                    norm = _normalize_word(raw)
                    if not norm:
                        continue
                    words.append({
                        'word': raw,
                        'norm': norm,
                        'start': round(float(getattr(word, 'start', 0.0) or 0.0), 3),
                        'end': round(float(getattr(word, 'end', 0.0) or 0.0), 3),
                        'probability': round(float(getattr(word, 'probability', 0.0) or 0.0), 4),
                    })
            transcript = ' '.join(part for part in transcript_parts if part).strip()
            expected = _expected_words(req.expected_lyrics)
            score = _alignment(expected, words) if expected else {
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
                    'transcript': transcript,
                    'language': str(getattr(info, 'language', '') or language or 'unknown'),
                    'language_probability': round(float(getattr(info, 'language_probability', 0.0) or 0.0), 4),
                    'duration_sec': round(duration, 3),
                    'words': words if req.word_timestamps else [],
                    **score,
                },
                'code': 200,
                'error': None,
            }
        except Exception as exc:
            return {
                'data': {'ok': False},
                'code': 500,
                'error': str(exc),
            }
'''


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        print(f'{label}=ALREADY_PATCHED', flush=True)
        return text
    if old not in text:
        raise RuntimeError(f'Pattern non trovato: {label}')
    print(f'{label}=PATCHED', flush=True)
    return text.replace(old, new, 1)


def patch_file(path: Path, transforms) -> None:
    original = path.read_text(encoding='utf-8')
    text = original
    for old, new, label in transforms:
        text = replace_once(text, old, new, label)
    if text != original:
        backup = path.with_suffix(path.suffix + '.sonara-vocal-asr-v3.bak')
        if not backup.exists():
            backup.write_text(original, encoding='utf-8')
        path.write_text(text, encoding='utf-8')


def install_asr() -> None:
    print('INSTALL_FASTER_WHISPER=START', flush=True)
    result = subprocess.run([
        str(PYTHON), '-m', 'pip', 'install', '--upgrade',
        'faster-whisper>=1.2.0,<2',
    ], cwd=str(ROOT), check=False)
    if result.returncode != 0:
        raise RuntimeError('Installazione faster-whisper fallita')
    subprocess.run([str(PYTHON), '-c', 'import faster_whisper; print("FASTER_WHISPER=OK")'], cwd=str(ROOT), check=True)


def patch_api() -> None:
    ASR_MODULE.write_text(ASR_CODE, encoding='utf-8')
    patch_file(API_SERVER, [
        (
            'from acestep.api.model_download import (\n    ensure_model_downloaded as _ensure_model_downloaded,\n)\n',
            'from acestep.api.model_download import (\n    ensure_model_downloaded as _ensure_model_downloaded,\n)\nfrom acestep.api.http.sonara_vocal_asr import configure_sonara_vocal_asr\n',
            'API_IMPORT_ASR'
        ),
        (
            'app = create_app()\n\n\ndef main()',
            'app = create_app()\nconfigure_sonara_vocal_asr(app, _get_project_root())\n\n\ndef main()',
            'API_CONFIGURE_ASR'
        ),
    ])
    patch_file(HEALTH, [
        (
            '                "sonara_compile_model": os.getenv("ACESTEP_COMPILE_MODEL", "false").strip().lower() in {"1", "true", "yes", "on"},\n',
            '                "sonara_compile_model": os.getenv("ACESTEP_COMPILE_MODEL", "false").strip().lower() in {"1", "true", "yes", "on"},\n                "sonara_vocal_asr_v3": True,\n                "sonara_vocal_asr_service": "sonara-vocal-asr-v3",\n',
            'HEALTH_ASR_MARKER'
        ),
    ])


def verify_syntax() -> None:
    for path in (ASR_MODULE, API_SERVER, HEALTH):
        subprocess.run([str(PYTHON), '-m', 'py_compile', str(path)], cwd=str(ROOT), check=True)
    print('VOCAL_ASR_V3_SYNTAX=OK', flush=True)


def find_api_pids() -> list[int]:
    try:
        rows = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
    except Exception:
        return []
    result = []
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        if pid == os.getpid():
            continue
        cmd = parts[1].lower()
        if 'acestep.api_server' in cmd and str(PORT) in cmd:
            result.append(pid)
    return result


def restart_note() -> None:
    print('', flush=True)
    print('VOCAL_ASR_V3_INSTALLED=YES', flush=True)
    print('IMPORTANT: il server ACE-Step deve essere riavviato dallo script Real Music V2 per caricare la nuova route.', flush=True)
    print('La cella corrente Real Music V2 deve essere fermata una sola volta e rilanciata subito dopo.', flush=True)
    print('Dopo il riavvio /v1/sonara/asr-health deve rispondere ok=true.', flush=True)


def main() -> None:
    if not ROOT.exists() or not PYTHON.exists():
        raise RuntimeError('SONARA ACE-Step CLEAN non trovato')
    install_asr()
    patch_api()
    verify_syntax()
    print('ACTIVE_API_PIDS=' + ','.join(map(str, find_api_pids())), flush=True)
    restart_note()


if __name__ == '__main__':
    main()
