#!/usr/bin/env python3
"""SONARA dedicated GPU: authenticated local gateway in front of the already-running ACE-Step API.

For SONARA-owned, explicitly provisioned GPU virtual machines.
- Does not reinstall/restart ACE-Step models or expose port 8001.
- Binds localhost:8002; Caddy HTTPS on the same host forwards to localhost:8002.
- Requires a high-entropy Bearer token for every request, including /health.
- Forwards permitted ACE-Step routes only, with bounded request bodies and no redirects.
"""
from __future__ import annotations

import hmac
import http.client
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

UPSTREAM_HOST = "127.0.0.1"
UPSTREAM_PORT = 8001
GATEWAY_HOST = "127.0.0.1"
GATEWAY_PORT = 8002
MAX_REQUEST_BYTES = 180 * 1024 * 1024
PRIVATE_KEY_FILE = Path(os.getenv("SONARA_GATEWAY_KEY_FILE", "/etc/sonara/gateway.key"))
ALLOWED_EXACT = {
    "/health", "/release_task", "/query_result", "/format_input",
    "/v1/audio", "/v1/models", "/v1/model_inventory", "/v1/stats",
    "/v1/sonara/transcribe",
}
ALLOWED_PREFIX = ("/v1/sonara/",)


def read_public_key():
    value = PRIVATE_KEY_FILE.read_text(encoding="utf-8").strip()
    if len(value) < 48:
        raise RuntimeError("Gateway API key missing or too short")
    return value


class GatewayHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "SONARA-Gateway/1.0"
    sys_version = ""

    def log_message(self, fmt, *args):
        # Never log headers, bearer tokens, prompt text, or query strings.
        return

    def _reply(self, code, body):
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "private, no-store")
        self.send_header("Content-Length", str(len(payload)))
        self.send_header("Connection", "close")
        if code == 401:
            self.send_header("WWW-Authenticate", "Bearer")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(payload)
        self.close_connection = True

    def _authorized(self):
        auth = (self.headers.get("Authorization") or "").strip()
        token = auth[7:].strip() if auth.lower().startswith("bearer ") else ""
        if not token:
            token = (self.headers.get("X-API-Key") or "").strip()
        return hmac.compare_digest(token, read_public_key())

    def do_GET(self):
        self._proxy()

    def do_HEAD(self):
        self._proxy()

    def do_POST(self):
        self._proxy()

    def do_OPTIONS(self):
        # Gateway is server-to-server only: no direct browser CORS access.
        self._reply(405, {"error": "OPTIONS is not supported on the private gateway"})

    def _proxy(self):
        if not self._authorized():
            return self._reply(401, {"error": "SONARA gateway: authorization required"})
        target = str(self.path)
        if (not target.startswith("/") or target.startswith("//") or
                "\\" in target or any(ord(c) < 32 for c in target)):
            return self._reply(400, {"error": "Invalid origin path"})
        parsed = urlsplit(target)
        if parsed.scheme or parsed.netloc or parsed.fragment:
            return self._reply(400, {"error": "Absolute/fragment URLs forbidden"})
        if parsed.path not in ALLOWED_EXACT and not any(
                parsed.path.startswith(prefix) for prefix in ALLOWED_PREFIX):
            return self._reply(404, {"error": "ACE-Step route not exposed"})
        transfer_encoding = (self.headers.get("Transfer-Encoding") or "").lower()
        if transfer_encoding:
            return self._reply(411, {"error": "Content-Length required (chunked requests are not enabled)"})
        try:
            size = int(self.headers.get("Content-Length") or "0")
            if size < 0 or size > MAX_REQUEST_BYTES:
                return self._reply(413, {"error": "Request too large"})
        except ValueError:
            return self._reply(400, {"error": "Invalid Content-Length"})

        conn = None
        headers_sent = False
        try:
            conn = http.client.HTTPConnection(
                UPSTREAM_HOST, UPSTREAM_PORT, timeout=180
            )
            conn.putrequest(self.command, target, skip_host=True, skip_accept_encoding=True)
            conn.putheader("Host", f"{UPSTREAM_HOST}:{UPSTREAM_PORT}")
            conn.putheader("Connection", "close")
            for name in ("Content-Type", "Content-Length", "Accept", "Range", "User-Agent"):
                v = self.headers.get(name)
                if v:
                    conn.putheader(name, v)
            upstream_key = (
                os.getenv("SONARA_GPU_UPSTREAM_API_KEY", "").strip()
                or os.getenv("ACESTEP_API_KEY", "").strip()
            )
            if upstream_key:
                conn.putheader("Authorization", "Bearer " + upstream_key)
            conn.endheaders()
            remaining = size
            while remaining:
                chunk = self.rfile.read(min(65536, remaining))
                if not chunk:
                    raise ConnectionError("Client ended request body early")
                conn.send(chunk)
                remaining -= len(chunk)

            response = conn.getresponse()
            self.send_response(response.status)
            for name in (
                "Content-Type", "Content-Length", "Content-Disposition",
                "Content-Range", "Accept-Ranges", "ETag", "Last-Modified",
            ):
                value = response.getheader(name)
                if value is not None:
                    self.send_header(name, value)
            self.send_header("Cache-Control", "private, no-store")
            self.send_header("Connection", "close")
            self.end_headers()
            headers_sent = True
            if self.command != "HEAD":
                while True:
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
            self.close_connection = True
        except (OSError, http.client.HTTPException) as exc:
            # If streaming already began, close the response rather than send a
            # second HTTP status; otherwise report the origin failure.
            if headers_sent:
                self.close_connection = True
            else:
                self._reply(502, {"error": "Dedicated GPU ACE-Step origin unavailable", "type": type(exc).__name__})
        finally:
            if conn:
                conn.close()


def serve():
    read_public_key()
    with ThreadingHTTPServer((GATEWAY_HOST, GATEWAY_PORT), GatewayHandler) as server:
        print(f"SONARA_AUTHENTICATED_GATEWAY=http://{GATEWAY_HOST}:{GATEWAY_PORT}", flush=True)
        print(f"UPSTREAM=http://{UPSTREAM_HOST}:{UPSTREAM_PORT}", flush=True)
        server.serve_forever(poll_interval=0.5)


if __name__ == "__main__":
    serve()
