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
LOCAL_API_AUTH_MODE = os.environ.get('SONARA_LOCAL_API_AUTH_MODE', 'required').strip().lower()
REVISION = 'sonara-https-agent-guard-v4'
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

def process(job):
    job_id = job['jobId']
    head = {**claim_headers(), 'X-Sonara-Lease': job['leaseId']}
    base = ENDPOINT + '/job/' + urllib.parse.quote(job_id, safe='')
    started = time.monotonic()
    timings = {}

    def progress(stage, **fields):
        publish_status('processing', jobId=job_id, stage=stage,
                       elapsedSeconds=round(time.monotonic() - started, 2), **fields)

    try:
        progress('submitting')
        answer = local('POST', '/release_task', job['payload'], timeout=120)
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
                for index, path in enumerate(paths[:expected]):
                    progress('uploading', track=index + 1, trackCount=expected)
                    request('POST', base + '/renew', {}, head, 20)
                    fetched = time.monotonic()
                    data = local('GET', '/v1/audio?' + urllib.parse.urlencode({'path': path}), timeout=90)
                    timings['fetch' + str(index + 1) + 'Seconds'] = round(time.monotonic() - fetched, 2)
                    if not isinstance(data, bytes) or len(data) < 44 or data[:4] != b'RIFF' or data[8:12] != b'WAVE':
                        raise RuntimeError('Invalid WAV response')
                    if len(data) > 80 * 1024 * 1024:
                        raise RuntimeError('WAV exceeds configured upload limit')
                    uploaded = time.monotonic()
                    # Keep uploads serial: the relay updates one shared files record.
                    request('PUT', base + '/audio/' + str(index), data, {**head, 'Content-Type': 'audio/wav'}, timeout=120)
                    timings['upload' + str(index + 1) + 'Seconds'] = round(time.monotonic() - uploaded, 2)
                    del data
                completed = time.monotonic()
                request('POST', base + '/complete', {}, head, 30)
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
