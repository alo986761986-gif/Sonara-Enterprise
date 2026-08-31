#!/usr/bin/env python3
import argparse
import json
import os
import shutil
import subprocess
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote

ROOT = Path(os.environ.get('LEVO2_ROOT', '/marimo/SONARA-LeVo2-RESEARCH')).resolve()
SOURCE = ROOT / 'levo2-official'
MODEL = ROOT / 'songgeneration_v2_large'
VENV = ROOT / 'venv'
PYTHON = VENV / 'bin/python'
OUTPUT_ROOT = ROOT / 'SONARA-RESEARCH-WORKER'
PORT = int(os.environ.get('LEVO2_RESEARCH_PORT', '8012'))
API_KEY = os.environ.get('LEVO2_RESEARCH_API_KEY', '').strip()
MAX_DURATION = 270
LICENSE_MODE = 'RESEARCH_ONLY'

_generation_lock = threading.Lock()


def json_response(handler, status, payload):
    raw = json.dumps(payload, ensure_ascii=False).encode('utf-8')
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json; charset=utf-8')
    handler.send_header('Content-Length', str(len(raw)))
    handler.end_headers()
    handler.wfile.write(raw)


def auth_ok(handler):
    if not API_KEY:
        return True
    auth = handler.headers.get('Authorization', '')
    xkey = handler.headers.get('X-API-Key', '')
    return auth == f'Bearer {API_KEY}' or xkey == API_KEY


def environment_status():
    required = {
        'root': ROOT,
        'source': SOURCE,
        'model': MODEL,
        'generate_sh': SOURCE / 'generate.sh',
        'generate_py': SOURCE / 'generate.py',
        'python': PYTHON,
        'runtime_ckpt': SOURCE / 'ckpt',
        'runtime_third_party': SOURCE / 'third_party',
        'auto_prompt': SOURCE / 'tools/new_auto_prompt.pt',
    }
    missing = [name for name, path in required.items() if not path.exists()]
    return required, missing


def build_env():
    env = os.environ.copy()
    env.pop('PYTHONHOME', None)
    env['VIRTUAL_ENV'] = str(VENV)
    env['PATH'] = f"{VENV / 'bin'}:{env.get('PATH', '')}"
    env['PYTHONPATH'] = ':'.join([
        str(SOURCE),
        str(SOURCE / 'codeclm/tokenizer'),
        str(SOURCE / 'codeclm/tokenizer/Flow1dVAE'),
    ])
    env['CUDA_VISIBLE_DEVICES'] = os.environ.get('CUDA_VISIBLE_DEVICES', '0')
    env['PYTHONUNBUFFERED'] = '1'
    env['HF_HOME'] = os.environ.get('HF_HOME', str(ROOT / '.hf-home'))
    return env


def normalize_request(payload):
    prompt = str(payload.get('descriptions') or payload.get('prompt') or 'professional music production').strip()
    genre = str(payload.get('genre') or 'Electronic').strip()
    mood = str(payload.get('mood') or '').strip()
    lyrics = str(payload.get('lyrics') or '').strip()
    title = str(payload.get('title') or 'Sonara Research Track').strip()
    duration = int(float(payload.get('duration_sec') or payload.get('durationSec') or 30))
    duration = max(15, min(MAX_DURATION, duration))
    generate_type = str(payload.get('generate_type') or 'mixed').strip().lower()
    if generate_type not in {'mixed', 'vocal', 'bgm', 'separate'}:
        generate_type = 'mixed'
    auto_type = str(payload.get('auto_prompt_audio_type') or 'Electronic').strip()

    description_parts = [genre, mood, prompt]
    descriptions = ', '.join([p for p in description_parts if p])

    if not lyrics and generate_type != 'bgm':
        lyrics = '[intro-short]; [verse] Sonara research generation; [chorus] Sonara research generation; [outro-short]'

    return {
        'title': title,
        'duration': duration,
        'generate_type': generate_type,
        'item': {
            'idx': f"SONARA_LEVO2_{int(time.time())}_{uuid.uuid4().hex[:8]}",
            'gt_lyric': lyrics or '.',
            'descriptions': descriptions,
            'auto_prompt_audio_type': auto_type,
        }
    }


def run_generation(payload):
    required, missing = environment_status()
    if missing:
        raise RuntimeError('LeVo 2 environment incomplete: ' + ', '.join(missing))

    request = normalize_request(payload)
    job_id = request['item']['idx']
    job_dir = OUTPUT_ROOT / job_id
    output_dir = job_dir / 'output'
    input_path = job_dir / 'input.jsonl'
    log_path = job_dir / 'generation.log'
    job_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)

    input_path.write_text(json.dumps(request['item'], ensure_ascii=False) + '\n', encoding='utf-8')

    command = [
        'bash', 'generate.sh', str(MODEL), str(input_path), str(output_dir), '--not_use_flash_attn'
    ]
    if request['generate_type'] != 'mixed':
        command.extend(['--generate_type', request['generate_type']])

    started = time.time()
    env = build_env()

    with _generation_lock:
        with log_path.open('w', encoding='utf-8') as log:
            proc = subprocess.Popen(
                command,
                cwd=str(SOURCE),
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            assert proc.stdout is not None
            for line in proc.stdout:
                print(line, end='', flush=True)
                log.write(line)
                log.flush()
            code = proc.wait()

    elapsed = round(time.time() - started, 3)
    if code != 0:
        tail = ''
        try:
            tail = '\n'.join(log_path.read_text(encoding='utf-8', errors='replace').splitlines()[-80:])
        except Exception:
            pass
        raise RuntimeError(f'LeVo 2 generation failed with exit code {code}\n{tail}')

    audio_files = []
    for ext in ('*.flac', '*.wav', '*.mp3', '*.ogg', '*.m4a'):
        audio_files.extend(output_dir.rglob(ext))
    audio_files = [p for p in audio_files if p.is_file() and p.stat().st_size > 0]
    if not audio_files:
        raise RuntimeError('LeVo 2 completed but no audio file was produced.')

    audio_path = max(audio_files, key=lambda p: p.stat().st_size)
    rel = audio_path.relative_to(OUTPUT_ROOT)
    audio_url = '/audio/' + '/'.join(rel.parts)

    return {
        'status': 'completed',
        'engine': 'LeVo2-v2-large',
        'license_mode': LICENSE_MODE,
        'research_only': True,
        'job_id': job_id,
        'output_path': str(audio_path),
        'audio_url': audio_url,
        'elapsed_sec': elapsed,
        'bytes': audio_path.stat().st_size,
        'metadata': {
            'title': request['title'],
            'duration_requested_sec': request['duration'],
            'generate_type': request['generate_type'],
            'log_path': str(log_path),
        }
    }


class Handler(BaseHTTPRequestHandler):
    server_version = 'SonaraLeVo2Research/1.0'

    def log_message(self, fmt, *args):
        print('[LEVO2_RESEARCH_HTTP]', fmt % args, flush=True)

    def do_GET(self):
        if not auth_ok(self):
            return json_response(self, 401, {'status': 'error', 'detail': 'Unauthorized'})

        if self.path == '/health':
            required, missing = environment_status()
            payload = {
                'status': 'ready' if not missing else 'not_ready',
                'ready': not missing,
                'engine': 'LeVo2-v2-large',
                'mode': 'research',
                'license_mode': LICENSE_MODE,
                'research_only': True,
                'root': str(ROOT),
                'model': str(MODEL),
                'missing': missing,
            }
            return json_response(self, 200 if not missing else 503, payload)

        if self.path.startswith('/audio/'):
            rel = unquote(self.path[len('/audio/'):]).lstrip('/')
            target = (OUTPUT_ROOT / rel).resolve()
            try:
                target.relative_to(OUTPUT_ROOT.resolve())
            except ValueError:
                return json_response(self, 403, {'status': 'error', 'detail': 'Forbidden'})
            if not target.exists() or not target.is_file():
                return json_response(self, 404, {'status': 'error', 'detail': 'Audio not found'})
            data = target.read_bytes()
            suffix = target.suffix.lower()
            content_type = {
                '.flac': 'audio/flac', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
                '.ogg': 'audio/ogg', '.m4a': 'audio/mp4'
            }.get(suffix, 'application/octet-stream')
            self.send_response(200)
            self.send_header('Content-Type', content_type)
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return

        return json_response(self, 404, {'status': 'error', 'detail': 'Not found'})

    def do_POST(self):
        if not auth_ok(self):
            return json_response(self, 401, {'status': 'error', 'detail': 'Unauthorized'})
        if self.path != '/generate':
            return json_response(self, 404, {'status': 'error', 'detail': 'Not found'})
        try:
            length = int(self.headers.get('Content-Length', '0'))
            if length <= 0 or length > 1_000_000:
                return json_response(self, 400, {'status': 'error', 'detail': 'Invalid request size'})
            payload = json.loads(self.rfile.read(length).decode('utf-8'))
            if payload.get('research_only') is not True:
                return json_response(self, 403, {
                    'status': 'error',
                    'detail': 'LeVo 2 worker is research-only. Set research_only=true for R&D tests.'
                })
            result = run_generation(payload)
            return json_response(self, 200, result)
        except Exception as exc:
            return json_response(self, 500, {
                'status': 'error',
                'detail': str(exc),
                'license_mode': LICENSE_MODE,
                'research_only': True,
            })


def main():
    parser = argparse.ArgumentParser(description='Sonara LeVo 2 research worker')
    parser.add_argument('--host', default=os.environ.get('LEVO2_RESEARCH_HOST', '0.0.0.0'))
    parser.add_argument('--port', type=int, default=PORT)
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()

    required, missing = environment_status()
    print('=' * 80)
    print('SONARA LEVO 2 RESEARCH WORKER')
    print('ROOT:', ROOT)
    print('MODEL:', MODEL)
    print('LICENSE MODE:', LICENSE_MODE)
    print('MISSING:', missing or 'none')
    print('=' * 80)

    if args.check_only:
        raise SystemExit(1 if missing else 0)
    if missing:
        raise SystemExit('Cannot start worker: missing ' + ', '.join(missing))

    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f'LEVO2_RESEARCH_URL=http://{args.host}:{args.port}', flush=True)
    print('Worker ready. Research use only.', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
