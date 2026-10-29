"""MoLab-only ACE-Step relay. Outbound HTTPS/443; private files, no test songs.
The agent stays in read-only standby until both relay and local models are ready.
"""
from __future__ import annotations
import fcntl
import json
import os
import pathlib
import signal
import time
import wave
import struct
import math
import urllib.error
import urllib.parse
import urllib.request
from typing import Any

ROOT = pathlib.Path.home() / '.sonara'
ENDPOINT = 'https://api.sonaraenterprise.com/api/sonara-relay'
LOCAL = 'http://127.0.0.1:8001'
TOKEN_FILE = ROOT / 'relay.token'
ACE_KEY_FILE = pathlib.Path('/home/marimo/ACE-STEP/.sonara-api-key')
STATUS_FILE = ROOT / 'relay-agent-status.json'
REFERENCE_DIR = ROOT / 'references'
LOCAL_API_AUTH_MODE = os.environ.get('SONARA_LOCAL_API_AUTH_MODE', 'required').strip().lower()
REVISION = 'sonara-https-agent-guard-v5'
IDLE_POLL_SECONDS = 1
RESULT_POLL_SECONDS = 1
GENERATION_TIMEOUT_SECONDS = 1600
STOP_REQUESTED = False

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

OPENER = urllib.request.build_opener(NoRedirect())

def request(method: str, url: str, payload=None, headers=None, timeout=45):
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme, parsed.netloc) not in {
        ('https', 'api.sonaraenterprise.com'), ('http', '127.0.0.1:8001')
    }:
        raise ValueError('Unapproved relay destination')
    raw = json.dumps(payload).encode() if isinstance(payload, (dict, list)) else payload
    h = {'User-Agent': 'SONARA-MoLab-Relay/1.0', 'Accept': 'application/json'}
    if raw is not None and isinstance(payload, (dict, list)):
        h['Content-Type'] = 'application/json'
    h.update(headers or {})
    req = urllib.request.Request(url, method=method, data=raw, headers=h)
    with OPENER.open(req, timeout=timeout) as response:
        if 'application/json' in response.headers.get('Content-Type', ''):
            data = json.load(response)
            if not isinstance(data, dict):
                raise ValueError('Expected JSON object')
            if int(data.get('code', 200)) >= 400 or data.get('error'):
                raise RuntimeError('API returned an application error')
            return data
        return response.read()

def claim_headers():
    value = TOKEN_FILE.read_text(encoding='utf-8').strip()
    if len(value) < 32 or not value.isascii() or any(c.isspace() for c in value):
        raise ValueError('Invalid private relay credential')
    return {'X-Sonara-Relay-Token': value, 'X-Sonara-Agent-Revision': REVISION}

def request_shutdown(_signum, _frame):
    # Finish any claimed job before releasing the single-agent lock.
    global STOP_REQUESTED
    STOP_REQUESTED = True

def ace_headers():
    if LOCAL_API_AUTH_MODE == 'none':
        # Explicit opt-in only for the already running private loopback API.
        # This changes this client's headers, never the engine's bind or auth.
        if LOCAL != 'http://127.0.0.1:8001':
            raise ValueError('Unauthenticated ACE-Step access requires fixed loopback')
        return {}
    if LOCAL_API_AUTH_MODE != 'required':
        raise ValueError('Invalid local API authentication mode')
    value = ACE_KEY_FILE.read_text(encoding='utf-8').strip()
    if not value:
        raise ValueError('Missing local ACE-Step credential')
    return {'Authorization': 'Bearer ' + value}

def local(method, path, payload=None, timeout=60):
    return request(method, LOCAL + path, payload, ace_headers(), timeout)

def reference_suffix(reference):
    name = pathlib.Path(str(reference.get('filename') or '')).suffix.lower()
    if name in ('.wav', '.mp3', '.flac', '.ogg', '.opus', '.webm', '.m4a', '.aac'):
        return name
    content_type = str(reference.get('contentType') or '').lower()
    return {
        'audio/mpeg': '.mp3', 'audio/flac': '.flac', 'audio/ogg': '.ogg',
        'audio/opus': '.opus', 'audio/webm': '.webm', 'audio/mp4': '.m4a',
        'audio/aac': '.aac'
    }.get(content_type, '.wav')

def store_reference(job_id, data, reference):
    if not isinstance(data, bytes) or not data:
        raise RuntimeError('Invalid reference response')
    if len(data) > 80 * 1024 * 1024:
        raise RuntimeError('Reference exceeds configured limit')
    REFERENCE_DIR.mkdir(parents=True, exist_ok=True, mode=0o700)
    REFERENCE_DIR.chmod(0o700)
    path = REFERENCE_DIR / (job_id + reference_suffix(reference))
    if path.is_symlink():
        raise RuntimeError('Unsafe reference path')
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    fd = os.open(str(path), flags, 0o600)
    with os.fdopen(fd, 'wb') as out:
        os.fchmod(out.fileno(), 0o600)
        out.write(data)
    return path.resolve()

def publish_status(state: str, **safe_fields):
    # Only callers' explicit non-secret booleans and job IDs reach this file.
    data = {'revision': REVISION, 'localApiAuthMode': LOCAL_API_AUTH_MODE, 'pid': os.getpid(), 'updatedAt': time.time(), 'state': state, **safe_fields}
    temporary = STATUS_FILE.with_suffix('.tmp')
    fd = os.open(str(temporary), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as out:
        json.dump(data, out)
    os.replace(temporary, STATUS_FILE)

def inspect_readiness():
    auth = request('GET', ENDPOINT + '/auth', headers=claim_headers(), timeout=20)
    accepted = auth.get('service') == 'sonara-r2-relay' and auth.get('authenticated') is True
    if not accepted:
        raise RuntimeError('Relay authentication not confirmed')
    health = local('GET', '/health', timeout=8)
    health = health.get('data', health)
    models = isinstance(health, dict) and (
        health.get('models_initialized') is True and health.get('llm_initialized') is True
        and health.get('loaded_model') == 'acestep-v15-xl-turbo'
        and health.get('loaded_lm_model') == 'acestep-5Hz-lm-4B'
    )
    return {
        'authenticated': accepted,
        'storageConfigured': auth.get('storageConfigured') is True,
        'gatewayConfigured': auth.get('gatewayConfigured') is True,
        'relayEnabled': auth.get('relayEnabled') is True,
        'modelsReady': bool(models),
    }

def normalized_status(value):
    text = str(value).strip().lower()
    if text in ('1', 'success', 'completed', 'succeeded', 'done', 'finished'):
        return 1
    if text in ('0', 'queued', 'pending', 'running', 'processing', 'in_progress'):
        return 0
    return -1

def extract_paths(task):
    result = task.get('result') or []
    if isinstance(result, str):
        result = json.loads(result)
    found = []
    def add(item):
        if isinstance(item, list):
            for value in item:
                add(value)
        elif isinstance(item, dict):
            for key in ('audio_path', 'audio_file', 'file', 'path', 'url', 'audio', 'outputs', 'result'):
                if key in item:
                    add(item[key])
        elif isinstance(item, str):
            parsed = urllib.parse.urlsplit(item)
            path = urllib.parse.parse_qs(parsed.query).get('path', [None])[0]
            if not path and item.startswith('/') and not item.startswith('/v1/audio'):
                path = item
            if path and path not in found:
                found.append(path)
    add(result)
    return found[:2]

def _pcm_sample(chunk, width):
    if width == 1:
        return chunk[0] - 128, 127.0
    if width == 2:
        return struct.unpack('<h', chunk)[0], 32767.0
    if width == 3:
        value = int.from_bytes(chunk, 'little', signed=False)
        if value & 0x800000:
            value -= 1 << 24
        return value, 8388607.0
    if width == 4:
        return struct.unpack('<i', chunk)[0], 2147483647.0
    raise ValueError('Unsupported PCM width')


def wav_quality_report(path):
    try:
        with wave.open(str(path), 'rb') as wav:
            channels = wav.getnchannels()
            width = wav.getsampwidth()
            rate = wav.getframerate()
            frames = wav.getnframes()
            raw = wav.readframes(frames)
        if width not in (1, 2, 3, 4) or channels < 1 or rate <= 0 or not raw:
            raise ValueError('Unsupported WAV')

        frame_size = width * channels
        available_frames = len(raw) // frame_size
        if available_frames <= 0:
            raise ValueError('Empty WAV')

        stride = max(1, available_frames // 200000)
        peak_ratio = 0.0
        square_sum = 0.0
        clipped = 0
        silent = 0
        dc_sum = 0.0
        seen = 0

        for frame_index in range(0, available_frames, stride):
            frame_start = frame_index * frame_size
            mono_ratio = 0.0
            valid_channels = 0
            for channel in range(channels):
                start = frame_start + channel * width
                chunk = raw[start:start + width]
                if len(chunk) != width:
                    continue
                value, scale = _pcm_sample(chunk, width)
                mono_ratio += value / scale if scale else 0.0
                valid_channels += 1
            if valid_channels <= 0:
                continue
            mono_ratio /= valid_channels
            absolute = abs(mono_ratio)
            peak_ratio = max(peak_ratio, absolute)
            square_sum += mono_ratio * mono_ratio
            dc_sum += mono_ratio
            seen += 1
            if absolute >= 0.999:
                clipped += 1
            if absolute <= 0.001:
                silent += 1

        if seen <= 0:
            raise ValueError('No analyzable PCM samples')

        rms_ratio = math.sqrt(square_sum / seen)
        peak_db = 20.0 * math.log10(max(peak_ratio, 1e-9))
        rms_db = 20.0 * math.log10(max(rms_ratio, 1e-9))
        clipping = clipped / seen
        silence = silent / seen
        dc = dc_sum / seen
        duration = frames / float(rate)

        score = 100.0
        score -= min(35.0, clipping * 50000.0)
        score -= min(30.0, max(0.0, silence - 0.08) * 150.0)
        score -= min(20.0, abs(dc) * 500.0)
        if peak_db > -0.2:
            score -= 8.0
        if rms_db > -5.0 or rms_db < -28.0:
            score -= 10.0

        return {
            'ok': True,
            'durationSeconds': round(duration, 3),
            'sampleRate': rate,
            'channels': channels,
            'bitDepth': width * 8,
            'peakDb': round(peak_db, 2),
            'rmsDb': round(rms_db, 2),
            'clippingRatio': round(clipping, 6),
            'silenceRatio': round(silence, 4),
            'dcOffset': round(dc, 6),
            'score': round(max(0.0, min(100.0, score)), 1),
        }
    except Exception:
        return {'ok': False, 'score': 0.0}


def vocal_report(path, payload):
    lyrics = str(payload.get('lyrics') or '').strip()
    vocal_mode = str(payload.get('vocal_mode') or payload.get('vocalMode') or '').strip().lower()
    if not lyrics or vocal_mode in ('instrumental', 'none', 'off', 'no vocals'):
        return {'performed': False, 'lyricAccuracy': None, 'mismatchRanges': []}
    try:
        answer = local('POST', '/v1/sonara/transcribe', {
            'path': str(path),
            'language': str(payload.get('vocal_language') or 'auto'),
            'expected_lyrics': lyrics,
            'word_timestamps': True,
        }, timeout=240)
        data = answer.get('data', answer)
        accuracy = data.get('lyric_accuracy') if isinstance(data, dict) else None
        ranges = data.get('mismatch_ranges', []) if isinstance(data, dict) else []
        return {
            'performed': True,
            'lyricAccuracy': float(accuracy) if accuracy is not None else None,
            'wordErrorRate': data.get('word_error_rate') if isinstance(data, dict) else None,
            'language': data.get('language') if isinstance(data, dict) else None,
            'mismatchRanges': ranges[:12] if isinstance(ranges, list) else [],
        }
    except Exception:
        return {'performed': True, 'lyricAccuracy': None, 'mismatchRanges': [], 'error': 'ASRUnavailable'}


def combined_candidate_score(audio_report, vocal):
    score = float(audio_report.get('score') or 0.0)
    accuracy = vocal.get('lyricAccuracy')
    if accuracy is not None:
        score = score * 0.72 + max(0.0, min(1.0, float(accuracy))) * 100.0 * 0.28
    return round(score, 2)


def wait_local_task(task_id, timeout=900):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        answer = local('POST', '/query_result', {'task_id_list': [task_id]}, timeout=50)
        data = answer.get('data', [])
        task = data[0] if isinstance(data, list) and data else data if isinstance(data, dict) else {}
        if task:
            status = normalized_status(task.get('status'))
            if status < 0:
                raise RuntimeError('Repair task failed')
            if status == 1:
                paths = extract_paths(task)
                return paths[0] if paths else None
        time.sleep(1)
    return None


def wait_local_paths(task_id, timeout=1200):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        answer = local('POST', '/query_result', {'task_id_list': [task_id]}, timeout=50)
        data = answer.get('data', [])
        task = data[0] if isinstance(data, list) and data else data if isinstance(data, dict) else {}
        if task:
            status = normalized_status(task.get('status'))
            if status < 0:
                raise RuntimeError('Candidate batch failed')
            if status == 1:
                return extract_paths(task)
        time.sleep(1)
    return []


def ultra_second_batch(payload):
    profile = str(payload.get('sonara_r2_generation_profile') or '').strip().lower()
    if profile != 'ultra':
        return []
    second = dict(payload)
    second['batch_size'] = 2
    second['use_random_seed'] = True
    try:
        seed = int(second.get('seed') or 0)
    except (TypeError, ValueError):
        seed = 0
    second['seed'] = (seed + 104729) if seed > 0 else -1
    second['sonara_internal_variant_batch'] = 2
    second['prompt'] = (
        str(second.get('prompt') or '') +
        '\nSONARA ULTRA INTERNAL VARIANT BATCH: create two additional fully original performances '
        'from the same creator brief. Preserve genre, BPM, key, lyrics, singer identity and instrument palette, '
        'but change melody/voicing/fills/section detail enough to provide meaningful ranking diversity.'
    )[-12000:]
    answer = local('POST', '/release_task', second, timeout=120)
    nested = answer.get('data', answer)
    task_id = nested.get('task_id') if isinstance(nested, dict) else None
    return wait_local_paths(task_id, timeout=1200) if task_id else []


def maybe_repair_vocal(path, payload, vocal):
    profile = str(payload.get('sonara_r2_generation_profile') or payload.get('generationProfileV3') or '').strip().lower()
    accuracy = vocal.get('lyricAccuracy')
    ranges = vocal.get('mismatchRanges') or []
    if profile != 'ultra' or accuracy is None or accuracy >= 0.90 or not ranges:
        return path, False
    first = ranges[0] if isinstance(ranges[0], dict) else {}
    start = max(0.0, float(first.get('start') or 0.0) - 0.35)
    end = max(start + 0.8, float(first.get('end') or start + 1.5) + 0.35)
    repair = dict(payload)
    repair.update({
        'task_type': 'repaint',
        'src_audio_path': str(path),
        'repainting_start': round(start, 3),
        'repainting_end': round(end, 3),
        'repaint_mode': 'balanced',
        'repaint_strength': 0.52,
        'repaint_latent_crossfade_frames': 12,
        'repaint_wav_crossfade_sec': 0.18,
        'batch_size': 1,
        'use_random_seed': False,
        'instruction': (
            f'Repaint only {start:.2f}-{end:.2f} seconds. Preserve everything outside exactly. '
            'Correct the sung lyric words and pronunciation while preserving singer identity, melody, BPM, key, '
            'arrangement, ambience, loudness and natural human performance.'
        ),
    })
    answer = local('POST', '/release_task', repair, timeout=120)
    nested = answer.get('data', answer)
    task_id = nested.get('task_id') if isinstance(nested, dict) else None
    if not task_id:
        return path, False
    repaired = wait_local_task(task_id, timeout=900)
    return (repaired or path), bool(repaired)


def process(job):
    job_id = job['jobId']
    head = {**claim_headers(), 'X-Sonara-Lease': job['leaseId']}
    base = ENDPOINT + '/job/' + urllib.parse.quote(job_id, safe='')
    started = time.monotonic()
    timings = {}
    reference_path = None

    def progress(stage, **fields):
        publish_status('processing', jobId=job_id, stage=stage,
                       elapsedSeconds=round(time.monotonic() - started, 2), **fields)

    try:
        payload = dict(job['payload'])
        reference = job.get('reference') if isinstance(job.get('reference'), dict) else None
        if reference and reference.get('available') is True:
            progress('downloading_reference')
            reference_data = request('GET', base + '/reference', headers=head, timeout=90)
            reference_path = store_reference(job_id, reference_data, reference)
            requested = reference.get('influence', payload.get('referenceInfluence', 0.2))
            try:
                influence = max(0.1, min(0.35, float(requested)))
            except (TypeError, ValueError):
                influence = 0.2
            payload['reference_audio_path'] = str(reference_path)
            payload['audio_cover_strength'] = influence
            payload['task_type'] = 'text2music'
            for field in ('sonaraInstrumentReferenceId', 'sonaraReferenceName', 'referenceInfluence'):
                payload.pop(field, None)
            timings['referenceDownloadSeconds'] = round(time.monotonic() - started, 2)
        progress('submitting')
        answer = local('POST', '/release_task', payload, timeout=120)
        timings['submitSeconds'] = round(time.monotonic() - started, 2)
        nested = answer.get('data', answer)
        task_id = nested.get('task_id') if isinstance(nested, dict) else None
        if not task_id:
            raise RuntimeError('No ACE-Step task ID')
        submitted = last = time.monotonic()
        deadline = submitted + GENERATION_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            time.sleep(min(RESULT_POLL_SECONDS, max(0, deadline - time.monotonic())))
            if time.monotonic() >= deadline:
                break
            if time.monotonic() - last > 120:
                request('POST', base + '/renew', {}, head, 20)
                last = time.monotonic()
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            answer = local('POST', '/query_result', {'task_id_list': [task_id]}, timeout=min(50, remaining))
            progress('generating')
            data = answer.get('data', [])
            task = data[0] if isinstance(data, list) and data else data if isinstance(data, dict) else {}
            if not task:
                continue
            status = normalized_status(task.get('status'))
            if status < 0:
                raise RuntimeError('ACE-Step task failed')
            if status == 1:
                timings['engineWaitSeconds'] = round(time.monotonic() - submitted, 2)
                paths = extract_paths(task)
                expected = max(1, min(2, int(job['payload'].get('batch_size', 1))))
                if len(paths) < expected:
                    raise RuntimeError('Incomplete ACE-Step audio output')

                # ULTRA gets a second internal batch; only the best two are published.
                if str(payload.get('sonara_r2_generation_profile') or '').strip().lower() == 'ultra':
                    progress('generating_extra_candidates', internalCandidateTarget=4)
                    request('POST', base + '/renew', {}, head, 20)
                    try:
                        paths.extend(ultra_second_batch(payload))
                    except Exception:
                        pass

                # Score real WAV candidates locally before upload; best becomes Song A.
                evaluated = []
                for original_index, candidate_path in enumerate(paths[:4]):
                    audio_report = wav_quality_report(candidate_path)
                    vocal = vocal_report(candidate_path, payload)
                    repaired_path, repaired = maybe_repair_vocal(candidate_path, payload, vocal)
                    if repaired:
                        candidate_path = repaired_path
                        audio_report = wav_quality_report(candidate_path)
                        vocal = vocal_report(candidate_path, payload)
                    evaluated.append({
                        'path': candidate_path,
                        'originalIndex': original_index,
                        'audio': audio_report,
                        'vocal': vocal,
                        'autoRepaired': repaired,
                        'score': combined_candidate_score(audio_report, vocal),
                    })
                evaluated.sort(key=lambda item: item['score'], reverse=True)
                quality_summary = [
                    {
                        'rank': rank + 1,
                        'originalIndex': item['originalIndex'],
                        'score': item['score'],
                        'audio': item['audio'],
                        'vocal': {
                            'performed': item['vocal'].get('performed'),
                            'lyricAccuracy': item['vocal'].get('lyricAccuracy'),
                            'wordErrorRate': item['vocal'].get('wordErrorRate'),
                            'language': item['vocal'].get('language'),
                        },
                        'autoRepaired': item['autoRepaired'],
                    }
                    for rank, item in enumerate(evaluated)
                ]

                evaluated = evaluated[:2]
                expected = min(2, len(evaluated))
                for index, item in enumerate(evaluated):
                    path = item['path']
                    progress('uploading', track=index + 1, trackCount=expected, qualityScore=item['score'])
                    request('POST', base + '/renew', {}, head, 20)
                    fetched = time.monotonic()
                    data = local('GET', '/v1/audio?' + urllib.parse.urlencode({'path': path}), timeout=90)
                    timings['fetch' + str(index + 1) + 'Seconds'] = round(time.monotonic() - fetched, 2)
                    if not isinstance(data, bytes) or len(data) < 44 or data[:4] != b'RIFF' or data[8:12] != b'WAVE':
                        raise RuntimeError('Invalid WAV response')
                    if len(data) > 80 * 1024 * 1024:
                        raise RuntimeError('WAV exceeds configured upload limit')
                    uploaded = time.monotonic()
                    request('PUT', base + '/audio/' + str(index), data, {**head, 'Content-Type': 'audio/wav'}, timeout=120)
                    timings['upload' + str(index + 1) + 'Seconds'] = round(time.monotonic() - uploaded, 2)
                    del data
                completed = time.monotonic()
                request('POST', base + '/complete', {'quality': quality_summary, 'rankingVersion': 'sonara-local-critic-v1'}, head, 30)
                timings['completeSeconds'] = round(time.monotonic() - completed, 2)
                timings['totalSeconds'] = round(time.monotonic() - started, 2)
                publish_status('completed', jobId=job_id, trackCount=expected, timings=timings)
                print('SONARA: completed authorized job', job_id, flush=True)
                print('SONARA job timings:', json.dumps({'jobId': job_id, **timings}), flush=True)
                return
        raise RuntimeError('Generation polling deadline reached')
    except Exception as error:
        # Do not print exception messages, headers, source text or private paths.
        print('SONARA job failed:', job_id, type(error).__name__, flush=True)
        try:
            request('POST', base + '/fail', {}, head, 20)
        except Exception:
            pass
    finally:
        if reference_path is not None:
            try:
                reference_path.unlink(missing_ok=True)
            except Exception:
                pass

def cycle():
    ready = inspect_readiness()
    if STOP_REQUESTED:
        return 0
    if not all(ready.values()):
        publish_status('standby', **ready)
        return 20
    publish_status('waiting_for_authorized_job', **ready)
    data = request('POST', ENDPOINT + '/claim', {}, claim_headers(), timeout=45)
    if data.get('jobId'):
        process(data)
        return 1
    return IDLE_POLL_SECONDS

def main():
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    ROOT.chmod(0o700)
    if LOCAL_API_AUTH_MODE not in ('required', 'none'):
        raise SystemExit('Invalid local API authentication mode')
    required_files = (TOKEN_FILE, ACE_KEY_FILE) if LOCAL_API_AUTH_MODE == 'required' else (TOKEN_FILE,)
    for private in required_files:
        if not private.is_file() or private.stat().st_size == 0:
            raise SystemExit('Missing required private credential file')
        private.chmod(0o600)
    lock = (ROOT / 'relay-agent.lock').open('a')
    os.chmod(ROOT / 'relay-agent.lock', 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit('A guarded relay agent is already running')
    signal.signal(signal.SIGINT, request_shutdown)
    signal.signal(signal.SIGTERM, request_shutdown)
    print('SONARA HTTPS agent ready; read-only standby until activation.', flush=True)
    while not STOP_REQUESTED:
        try:
            delay = cycle()
        except KeyboardInterrupt:
            return
        except Exception as error:
            publish_status('connection_unavailable', errorClass=type(error).__name__)
            print('SONARA relay unavailable:', type(error).__name__, flush=True)
            delay = 25
        if not STOP_REQUESTED:
            time.sleep(delay)
    publish_status('stopped_for_update')
    print('SONARA: relay stopped after finishing its authorized job.', flush=True)

if __name__ == '__main__':
    main()
