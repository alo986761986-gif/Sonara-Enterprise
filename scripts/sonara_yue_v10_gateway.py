#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get('SONARA_YUE_PORT', '8012'))
QUALITY = os.environ.get('SONARA_YUE_QUALITY_URL', 'http://127.0.0.1:8014').rstrip('/')
FAST = os.environ.get('SONARA_YUE_FAST_URL', 'http://127.0.0.1:8013').rstrip('/')
API_KEY = os.environ.get('SONARA_YUE_API_KEY', '').strip()


def choose_profile(body: dict) -> str:
    raw = str(body.get('qualityProfile') or body.get('generationProfile') or body.get('yueProfile') or 'quality').strip().lower()
    return 'fast' if raw == 'fast' else 'quality'


def backend_for_task(task_id: str) -> str:
    return FAST if str(task_id).startswith('v9_') else QUALITY


def backend_for_audio(path: str) -> str:
    first = str(path or '').lstrip('/').split('/', 1)[0]
    return FAST if first.startswith('v9_') else QUALITY


def request_json(url: str, payload: dict, headers: dict | None = None, timeout: int = 60):
    req_headers = {'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'SONARA-YuE-V10-Gateway/1.0'}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=req_headers, method='POST')
    with urllib.request.urlopen(req, timeout=timeout) as response:
        return response.status, response.headers, response.read()


class Handler(BaseHTTPRequestHandler):
    server_version = 'SONARA-YuE/10-GATEWAY'

    def log_message(self, fmt, *args):
        print('[V10 GATEWAY]', fmt % args, flush=True)

    def authorized(self):
        if not API_KEY:
            return True
        bearer = self.headers.get('Authorization', '').removeprefix('Bearer ').strip()
        xkey = self.headers.get('X-API-Key', '').strip()
        return bearer == API_KEY or xkey == API_KEY

    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET,HEAD,POST,OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Authorization,Content-Type,Range,X-API-Key')
        self.send_header('Access-Control-Expose-Headers', 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-YuE-Profile')

    def send_raw(self, status: int, headers, raw: bytes):
        self.send_response(status)
        for key in ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges', 'Cache-Control']:
            value = headers.get(key) if headers else None
            if value:
                self.send_header(key, value)
        if not (headers and headers.get('Content-Length')):
            self.send_header('Content-Length', str(len(raw)))
        self.send_header('X-Sonara-YuE-Profile', 'v10-gateway')
        self.cors()
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(raw)

    def json_response(self, payload, status=200):
        raw = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(raw)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Sonara-YuE-Profile', 'v10-gateway')
        self.cors()
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(raw)

    def read_json(self):
        length = int(self.headers.get('Content-Length', '0') or 0)
        raw = self.rfile.read(length) if length else b'{}'
        return json.loads(raw.decode('utf-8'))

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path in ('/', '/health'):
            status = {'ok': True, 'service': 'SONARA YuE V10 Gateway', 'version': '10.0-quality-fast-gateway', 'default_profile': 'quality', 'quality_url': QUALITY, 'fast_url': FAST, 'backends': {}}
            for name, base in [('quality', QUALITY), ('fast', FAST)]:
                try:
                    req = urllib.request.Request(base + '/health', headers={'User-Agent': 'SONARA-YuE-V10-Gateway/1.0'})
                    with urllib.request.urlopen(req, timeout=5) as response:
                        status['backends'][name] = json.loads(response.read().decode('utf-8'))
                except Exception as exc:
                    status['backends'][name] = {'ok': False, 'error': str(exc)}
                    if name == 'quality':
                        status['ok'] = False
            return self.json_response(status, 200 if status['ok'] else 503)

        if parsed.path == '/v1/audio':
            if not self.authorized():
                return self.json_response({'code': 401, 'error': 'Unauthorized'}, 401)
            query = urllib.parse.parse_qs(parsed.query)
            path = (query.get('path') or [''])[0]
            backend = backend_for_audio(path)
            target = backend + '/v1/audio?' + urllib.parse.urlencode({'path': path})
            headers = {'User-Agent': 'SONARA-YuE-V10-Gateway/1.0'}
            if self.headers.get('Range'):
                headers['Range'] = self.headers['Range']
            if API_KEY:
                headers['X-API-Key'] = API_KEY
            try:
                req = urllib.request.Request(target, headers=headers, method='HEAD' if self.command == 'HEAD' else 'GET')
                with urllib.request.urlopen(req, timeout=60) as response:
                    return self.send_raw(response.status, response.headers, response.read() if self.command != 'HEAD' else b'')
            except urllib.error.HTTPError as exc:
                return self.send_raw(exc.code, exc.headers, exc.read())
            except Exception as exc:
                return self.json_response({'code': 502, 'error': str(exc)}, 502)

        return self.json_response({'code': 404, 'error': 'Not found'}, 404)

    def do_HEAD(self):
        return self.do_GET()

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if not self.authorized():
            return self.json_response({'code': 401, 'error': 'Unauthorized'}, 401)
        try:
            body = self.read_json()
        except Exception as exc:
            return self.json_response({'code': 400, 'error': f'Invalid JSON: {exc}'}, 400)

        if parsed.path == '/release_task':
            profile = choose_profile(body)
            backend = FAST if profile == 'fast' else QUALITY
            body['qualityProfile'] = profile
            body['generationProfile'] = profile
            try:
                status, headers, raw = request_json(backend + '/release_task', body, {'X-API-Key': API_KEY} if API_KEY else None, 60)
                return self.send_raw(status, headers, raw)
            except urllib.error.HTTPError as exc:
                return self.send_raw(exc.code, exc.headers, exc.read())
            except Exception as exc:
                return self.json_response({'code': 502, 'error': f'{profile} backend unavailable: {exc}'}, 502)

        if parsed.path == '/query_result':
            ids = [str(x) for x in body.get('task_id_list') or []]
            if not ids:
                return self.json_response({'code': 200, 'data': []})
            grouped = {QUALITY: [], FAST: []}
            for task_id in ids:
                grouped[backend_for_task(task_id)].append(task_id)
            merged = []
            for backend, task_ids in grouped.items():
                if not task_ids:
                    continue
                try:
                    _, _, raw = request_json(backend + '/query_result', {'task_id_list': task_ids}, {'X-API-Key': API_KEY} if API_KEY else None, 30)
                    data = json.loads(raw.decode('utf-8')).get('data') or []
                    merged.extend(data)
                except Exception as exc:
                    merged.extend({'task_id': task_id, 'status': 2, 'error': str(exc)} for task_id in task_ids)
            by_id = {str(item.get('task_id')): item for item in merged}
            return self.json_response({'code': 200, 'data': [by_id.get(task_id, {'task_id': task_id, 'status': 2, 'error': 'Task missing'}) for task_id in ids]})

        return self.json_response({'code': 404, 'error': 'Not found'}, 404)


if __name__ == '__main__':
    print('=' * 80)
    print('SONARA YUE V10 QUALITY / FAST GATEWAY')
    print(f'PUBLIC PORT={PORT} QUALITY={QUALITY} FAST={FAST}')
    print('=' * 80)
    ThreadingHTTPServer(('0.0.0.0', PORT), Handler).serve_forever()
