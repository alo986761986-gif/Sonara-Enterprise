#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import os
import re
import shutil
import subprocess
import threading
import time
import traceback
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import numpy as np
import soundfile as sf

PORT = int(os.environ.get('SONARA_YUE_PORT', '8012'))
ROOT = Path('/marimo/YuE-quality')
INFERENCE = ROOT / 'inference'
PYTHON = Path('/marimo/venvs/sonara-yue-v9-blackwell/bin/python')
MODEL_ROOT = Path('/marimo/models/yue-bf16')
STAGE1 = MODEL_ROOT / 'stage1-cot'
STAGE1_ICL = MODEL_ROOT / 'stage1-icl'
STAGE2 = MODEL_ROOT / 'stage2-general'
OUTPUT_ROOT = Path('/marimo/YuE-quality/sonara_output_v10')
TOP_TAGS = ROOT / 'top_200_tags.json'
API_KEY = os.environ.get('SONARA_YUE_API_KEY', '').strip()
MAX_DURATION = max(60, min(480, int(os.environ.get('SONARA_YUE_MAX_DURATION', '480'))))
OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()
GEN_LOCK = threading.Lock()


def now_ms():
    return int(time.time() * 1000)


def set_job(task_id: str, **values):
    with JOBS_LOCK:
        item = JOBS.setdefault(task_id, {})
        item.update(values)
        item['updated_at'] = now_ms()


def get_job(task_id: str):
    with JOBS_LOCK:
        item = JOBS.get(task_id)
        return dict(item) if item else None


def clamp(value, fallback, minimum, maximum):
    try:
        value = float(value)
    except Exception:
        value = fallback
    return max(minimum, min(maximum, value))


def safe_text(value, fallback=''):
    text = str(value or '').strip()
    return text or fallback


def normalize_lyrics(raw: str, target_segments: int) -> str:
    raw = safe_text(raw)
    if not raw:
        raw = '[verse_1]\nInstrumental texture and musical development.'
    def repl(match):
        label = re.sub(r'[^A-Za-z0-9_]+', '_', match.group(1).strip()).strip('_').lower()
        return f'[{label or "section"}]'
    raw = re.sub(r'\[([^\]\r\n]+)\]', repl, raw)
    if not re.search(r'\[[A-Za-z0-9_]+\]', raw):
        raw = '[verse_1]\n' + raw
    count = len(re.findall(r'\[[A-Za-z0-9_]+\]', raw))
    while count < target_segments:
        count += 1
        raw += f'\n\n[instrumental_bridge_{count}]\nContinue the established groove and arrangement naturally.'
    return raw


def load_tags():
    with TOP_TAGS.open('r', encoding='utf-8') as fh:
        return json.load(fh)


TAG_DB = load_tags()
TAG_INDEX = {
    key: {str(item).strip().lower(): str(item).strip() for item in values}
    for key, values in TAG_DB.items()
    if isinstance(values, list)
}


def canonical_tag(category: str, candidates: list[str], fallback: str | None = None):
    index = TAG_INDEX.get(category, {})
    for candidate in candidates:
        c = safe_text(candidate).lower()
        if not c:
            continue
        if c in index:
            return index[candidate.lower()]
        words = re.findall(r'[a-z0-9]+', c)
        for n in range(len(words), 0, -1):
            for i in range(len(words) - n + 1):
                phrase = ' '.join(words[i:i+n])
                if phrase in index:
                    return index[phrase]
    return fallback


def infer_instruments(text: str):
    lower = text.lower()
    tags = []
    mapping = [
        ('house', ['synthesizer', 'bass', 'drum machine']),
        ('techno', ['synthesizer', 'bass', 'drum machine']),
        ('electronic', ['synthesizer', 'bass', 'drum machine']),
        ('trap', ['808 bass', 'drum machine', 'synthesizer']),
        ('hip hop', ['808 bass', 'drums', 'synthesizer']),
        ('rap', ['808 bass', 'drums', 'synthesizer']),
        ('rock', ['electric guitar', 'bass', 'drums']),
        ('metal', ['electric guitar', 'bass', 'drums']),
        ('jazz', ['Piano', 'bass', 'drums', 'saxophone']),
        ('blues', ['electric guitar', 'bass', 'drums']),
        ('folk', ['acoustic guitar', 'violin', 'percussion']),
        ('classical', ['Piano', 'Violin', 'strings']),
        ('ambient', ['synthesizer', 'strings']),
        ('reggae', ['guitar', 'bass', 'drums']),
    ]
    for needle, instruments in mapping:
        if needle in lower:
            for inst in instruments:
                tag = canonical_tag('instrument', [inst])
                if tag and tag not in tags:
                    tags.append(tag)
            break
    if not tags:
        for inst in ['synthesizer', 'bass', 'drums']:
            tag = canonical_tag('instrument', [inst])
            if tag:
                tags.append(tag)
    return tags[:4]


def tag_prompt(body: dict):
    genre = safe_text(body.get('genre'), 'Music')
    subgenre = safe_text(body.get('subgenre'))
    family = safe_text(body.get('genre_family'))
    mood = safe_text(body.get('mood'))
    prompt = safe_text(body.get('prompt'))
    vocal_mode = safe_text(body.get('vocal_mode'), 'vocal').lower()

    genre_candidates = [subgenre, genre, family, prompt]
    g = canonical_tag('genre', genre_candidates, 'electronic')

    instruments = infer_instruments(' '.join(genre_candidates + [prompt]))

    mood_candidates = [mood, prompt]
    mood_tags = []
    for candidate in mood_candidates:
        words = re.split(r'[,;/|]+', candidate)
        for word in words:
            m = canonical_tag('mood', [word])
            if m and m not in mood_tags:
                mood_tags.append(m)
            if len(mood_tags) >= 2:
                break
        if len(mood_tags) >= 2:
            break
    if not mood_tags:
        mood_tags = [canonical_tag('mood', ['atmospheric'], 'atmospheric')]

    if 'female' in vocal_mode:
        gender = canonical_tag('gender', ['female'], 'female')
        timbre_candidates = ['airy vocal', 'soft', 'singing']
    elif 'male' in vocal_mode:
        gender = canonical_tag('gender', ['male'], 'male')
        timbre_candidates = ['warm', 'singing']
    elif 'duet' in vocal_mode:
        gender = canonical_tag('gender', ['singing'], 'singing')
        timbre_candidates = ['vocal', 'warm']
    elif 'instrumental' in vocal_mode:
        gender = None
        timbre_candidates = []
    else:
        gender = canonical_tag('gender', ['singing'], 'singing')
        timbre_candidates = ['vocal', 'singing']

    timbre = None
    for category in ['timbre', 'vocal_timbre']:
        if category in TAG_INDEX:
            timbre = canonical_tag(category, timbre_candidates)
            if timbre:
                break

    tags = [g, *instruments, *mood_tags]
    if gender:
        tags.append(gender)
    if timbre:
        tags.append(timbre)

    out = []
    seen = set()
    for tag in tags:
        tag = safe_text(tag)
        key = tag.lower()
        if tag and key not in seen:
            seen.add(key)
            out.append(tag)
    return ' '.join(out[:10])


def segment_count(duration_sec: int, lyrics: str):
    lyric_sections = len(re.findall(r'\[[A-Za-z0-9_]+\]', lyrics))
    by_duration = max(2, min(16, math.ceil(duration_sec / 30)))
    return max(by_duration, min(16, lyric_sections or 0))


def estimate_bpm(path: Path):
    try:
        import librosa
        y, sr = librosa.load(str(path), sr=22050, mono=True, duration=120.0)
        if y.size < sr * 4:
            return None
        tempo, _ = librosa.beat.beat_track(y=y, sr=sr)
        value = float(np.asarray(tempo).reshape(-1)[0])
        return round(value, 2) if math.isfinite(value) and value > 0 else None
    except Exception:
        return None


def duration_sec(path: Path):
    info = sf.info(str(path))
    return float(info.frames) / float(info.samplerate)


def find_mix(job_dir: Path):
    files = [p for p in job_dir.rglob('*') if p.is_file() and p.suffix.lower() in {'.mp3', '.wav', '.flac'}]
    preferred = [p for p in files if 'vocoder/mix' in str(p).replace('\\', '/').lower()]
    if preferred:
        return max(preferred, key=lambda p: p.stat().st_mtime)
    mixed = [p for p in files if 'mixed' in p.name.lower()]
    if mixed:
        return max(mixed, key=lambda p: p.stat().st_mtime)
    return max(files, key=lambda p: p.stat().st_mtime) if files else None


def copy_final(source: Path, job_dir: Path):
    final = job_dir / 'sonara_final.wav'
    data, sr = sf.read(str(source), always_2d=True)
    sf.write(str(final), data, sr, subtype='PCM_16')
    return final


def public_path(path: Path):
    return '/' + str(path.resolve().relative_to(OUTPUT_ROOT.resolve())).replace(os.sep, '/')


def run_quality_job(task_id: str, body: dict):
    try:
        with GEN_LOCK:
            started = time.time()
            requested_duration = int(clamp(body.get('duration_sec'), 180, 30, MAX_DURATION))
            lyrics_raw = safe_text(body.get('lyrics'))
            segments = segment_count(requested_duration, lyrics_raw)
            lyrics = normalize_lyrics(lyrics_raw, segments)
            tags = tag_prompt(body)
            seed = int(clamp(body.get('seed'), 42, 1, 2_147_483_647))
            repetition = float(clamp(body.get('repetition_penalty'), 1.1, 1.0, 1.3))
            stage2_batch = int(clamp(body.get('stage2_batch_size'), 8, 1, 16))
            max_tokens = int(clamp(body.get('max_new_tokens'), 3000, 1200, 5000))
            use_reference = bool(body.get('reference_audio_path'))
            stage1_model = STAGE1_ICL if use_reference else STAGE1

            job_dir = OUTPUT_ROOT / task_id
            job_dir.mkdir(parents=True, exist_ok=True)
            genre_txt = job_dir / 'genre.txt'
            lyrics_txt = job_dir / 'lyrics.txt'
            genre_txt.write_text(tags + '\n', encoding='utf-8')
            lyrics_txt.write_text(lyrics + '\n', encoding='utf-8')

            set_job(task_id, status=0, progress=8, stage='V10 QUALITY · prompt tagging',
                    profile='quality-bf16', tags=tags, segments=segments,
                    requested_duration_sec=requested_duration,
                    requested_bpm=int(clamp(body.get('bpm'), 124, 40, 220)))

            cmd = [
                str(PYTHON), str(INFERENCE / 'infer.py'),
                '--cuda_idx', '0',
                '--stage1_model', str(stage1_model),
                '--stage2_model', str(STAGE2),
                '--genre_txt', str(genre_txt),
                '--lyrics_txt', str(lyrics_txt),
                '--run_n_segments', str(segments),
                '--stage2_batch_size', str(stage2_batch),
                '--output_dir', str(job_dir / 'native'),
                '--max_new_tokens', str(max_tokens),
                '--repetition_penalty', str(repetition),
                '--seed', str(seed),
                '--rescale',
            ]
            ref = safe_text(body.get('reference_audio_path'))
            if ref:
                ref_path = Path(ref).resolve()
                if ref_path.is_file():
                    cmd.extend(['--use_audio_prompt', '--audio_prompt_path', str(ref_path), '--prompt_start_time', '0', '--prompt_end_time', '30'])

            log_path = job_dir / 'quality.log'
            env = os.environ.copy()
            env['TOKENIZERS_PARALLELISM'] = 'false'
            env['PYTORCH_ALLOC_CONF'] = 'expandable_segments:True'
            set_job(task_id, status=0, progress=12, stage='V10 QUALITY · YuE BF16 Stage 1/2')
            with log_path.open('wb') as log:
                proc = subprocess.run(cmd, cwd=str(INFERENCE), env=env, stdout=log, stderr=subprocess.STDOUT, check=False)
            if proc.returncode != 0:
                tail = '\n'.join(log_path.read_text(encoding='utf-8', errors='ignore').splitlines()[-80:])
                raise RuntimeError(f'YuE QUALITY rc={proc.returncode}\n{tail}')

            source = find_mix(job_dir / 'native')
            if source is None:
                raise RuntimeError('YuE QUALITY completato senza mix audio.')
            final = copy_final(source, job_dir)
            actual_duration = duration_sec(final)
            actual_bpm = estimate_bpm(final)
            target_bpm = int(clamp(body.get('bpm'), 124, 40, 220))
            bpm_error = None if actual_bpm is None else abs(actual_bpm - target_bpm)
            duration_error = abs(actual_duration - requested_duration)
            quality_score = 100
            if duration_error > 30:
                quality_score -= 20
            elif duration_error > 12:
                quality_score -= 10
            if bpm_error is not None:
                if bpm_error > 18:
                    quality_score -= 25
                elif bpm_error > 10:
                    quality_score -= 15
                elif bpm_error > 5:
                    quality_score -= 7
            quality_score = max(0, quality_score)

            path = public_path(final)
            set_job(task_id,
                    status=1, progress=100, stage='Completato',
                    result=[{'path': path, 'file': path}],
                    profile='quality-bf16', tags=tags,
                    requested_duration_sec=requested_duration,
                    output_duration_sec=round(actual_duration, 3),
                    requested_bpm=target_bpm,
                    measured_bpm=actual_bpm,
                    bpm_error=bpm_error,
                    quality_score=quality_score,
                    quality_gate_pass=(quality_score >= 80),
                    elapsed_sec=int(time.time() - started))
    except Exception as exc:
        traceback.print_exc()
        set_job(task_id, status=2, progress=0, stage='Errore', error=str(exc), message=str(exc))


class Handler(BaseHTTPRequestHandler):
    server_version = 'SONARA-YuE/10-QUALITY-BF16'

    def log_message(self, fmt, *args):
        print('[YuE V10]', fmt % args, flush=True)

    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Authorization,Content-Type,Range,X-API-Key')
        self.send_header('Access-Control-Expose-Headers', 'Content-Length,Content-Range,Accept-Ranges')

    def authorized(self):
        if not API_KEY:
            return True
        bearer = self.headers.get('Authorization', '').removeprefix('Bearer ').strip()
        xkey = self.headers.get('X-API-Key', '').strip()
        return bearer == API_KEY or xkey == API_KEY

    def json_response(self, payload, status=200):
        raw = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.cors()
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(raw)

    def read_json(self):
        length = int(self.headers.get('Content-Length', '0') or 0)
        raw = self.rfile.read(length) if length else b'{}'
        return json.loads(raw.decode('utf-8'))

    def resolve_audio(self, requested):
        requested = safe_text(requested)
        if not requested:
            return None
        target = (OUTPUT_ROOT / requested.lstrip('/')).resolve()
        try:
            target.relative_to(OUTPUT_ROOT.resolve())
        except Exception:
            return None
        return target if target.is_file() else None

    def send_audio(self, target: Path):
        size = target.stat().st_size
        start, end, partial = 0, size - 1, False
        range_header = self.headers.get('Range', '')
        if range_header.startswith('bytes='):
            match = re.match(r'bytes=(\d*)-(\d*)', range_header)
            if match:
                if match.group(1): start = int(match.group(1))
                if match.group(2): end = min(end, int(match.group(2)))
                partial = True
        length = end - start + 1
        self.send_response(206 if partial else 200)
        self.send_header('Content-Type', 'audio/wav')
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(length))
        if partial:
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.cors()
        self.end_headers()
        if self.command == 'HEAD':
            return
        with target.open('rb') as fh:
            fh.seek(start)
            remaining = length
            while remaining > 0:
                chunk = fh.read(min(1024 * 1024, remaining))
                if not chunk: break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ('/', '/health'):
            with JOBS_LOCK:
                keys = list(JOBS.keys())
                latest = {'task_id': keys[-1], **JOBS[keys[-1]]} if keys else None
                active = sum(1 for item in JOBS.values() if int(item.get('status', 0)) == 0)
            return self.json_response({
                'ok': True,
                'service': 'SONARA YuE V10 QUALITY BF16',
                'version': '10.0-quality-bf16-official',
                'profile': 'quality',
                'model_precision': 'bf16',
                'stage1_model': str(STAGE1),
                'stage1_icl_model': str(STAGE1_ICL),
                'stage2_model': str(STAGE2),
                'top_p': 0.93,
                'temperature': 1.0,
                'guidance': 'YuE native 1.5/1.2',
                'active_jobs': active,
                'latest_job': latest,
            })
        if parsed.path == '/v1/audio':
            if not self.authorized():
                return self.json_response({'code': 401, 'error': 'Unauthorized'}, 401)
            q = parse_qs(parsed.query)
            target = self.resolve_audio((q.get('path') or [''])[0])
            if target is None:
                return self.json_response({'code': 404, 'error': 'Audio not found'}, 404)
            return self.send_audio(target)
        return self.json_response({'code': 404, 'error': 'Not found'}, 404)

    def do_HEAD(self):
        return self.do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if not self.authorized():
            return self.json_response({'code': 401, 'error': 'Unauthorized'}, 401)
        try:
            body = self.read_json()
        except Exception as exc:
            return self.json_response({'code': 400, 'error': f'Invalid JSON: {exc}'}, 400)
        if parsed.path == '/release_task':
            task_id = 'v10_' + uuid.uuid4().hex
            set_job(task_id, status=0, progress=1, stage='V10 QUALITY job ricevuto', result=[], created_at=now_ms())
            threading.Thread(target=run_quality_job, args=(task_id, body), daemon=True).start()
            return self.json_response({'code': 200, 'data': {'task_id': task_id}})
        if parsed.path == '/query_result':
            ids = body.get('task_id_list') or []
            data = []
            for task_id in ids:
                item = get_job(str(task_id))
                data.append({'task_id': str(task_id), **item} if item else {'task_id': str(task_id), 'status': 2, 'error': 'Task not found'})
            return self.json_response({'code': 200, 'data': data})
        return self.json_response({'code': 404, 'error': 'Not found'}, 404)


def main():
    required = [PYTHON, INFERENCE / 'infer.py', TOP_TAGS, STAGE1 / 'config.json', STAGE1_ICL / 'config.json', STAGE2 / 'config.json']
    missing = [str(p) for p in required if not p.exists()]
    if missing:
        raise RuntimeError('V10 QUALITY non pronto. Esegui prima bootstrap:\n' + '\n'.join(missing))
    print('=' * 80)
    print('SONARA YUE V10 QUALITY BF16')
    print('OFFICIAL YUE DECODING · TOP TAGS · BPM/DURATION QUALITY GATE')
    print(f'PORT={PORT}')
    print('=' * 80)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()


if __name__ == '__main__':
    main()
