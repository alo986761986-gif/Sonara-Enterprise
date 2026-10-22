#!/usr/bin/env python3
"""In-process contract tests for the dedicated GPU authenticated gateway (no GPU needed)."""
from __future__ import annotations

import http.server
import importlib.util
import json
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path

HERE = Path(__file__).resolve().parent
SOURCE = HERE / "sonara-dedicated-secure-gateway.py"
spec = importlib.util.spec_from_file_location("sonara_molab_gateway", SOURCE)
gateway = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gateway)
TOKEN = "test-token-" + "x" * 50


class DummyACE(http.server.BaseHTTPRequestHandler):
    def log_message(self, *args):
        return

    def answer(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"data": {
            "status": "ok", "models_initialized": True,
            "llm_initialized": True,
            "loaded_model": "acestep-v15-xl-turbo",
            "loaded_lm_model": "acestep-5Hz-lm-4B",
        }}).encode())

    def do_GET(self):
        self.answer()

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or "0")
        self.rfile.read(length)
        self.answer()


class GatewayTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        gateway.PRIVATE_KEY_FILE = Path(cls.temp.name) / "private-key"
        gateway.PRIVATE_KEY_FILE.write_text(TOKEN)
        cls.upstream = http.server.ThreadingHTTPServer(("127.0.0.1", 0), DummyACE)
        gateway.UPSTREAM_PORT = cls.upstream.server_address[1]
        cls.origin = http.server.ThreadingHTTPServer(("127.0.0.1", 0), gateway.GatewayHandler)
        cls.url = "http://127.0.0.1:" + str(cls.origin.server_address[1])
        cls.threads = [threading.Thread(target=s.serve_forever, daemon=True) for s in (cls.upstream, cls.origin)]
        for thread in cls.threads:
            thread.start()

    @classmethod
    def tearDownClass(cls):
        for s in (cls.origin, cls.upstream):
            s.shutdown()
            s.server_close()
        cls.temp.cleanup()

    def req(self, path="/health", token=None, method="GET", body=None):
        headers = {}
        if token is not None:
            headers["Authorization"] = "Bearer " + token
        if body is not None:
            headers["Content-Type"] = "application/json"
            body = json.dumps(body).encode()
        req = urllib.request.Request(self.url + path, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=4) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as exc:
            return exc.code, exc.read()

    def test_unauthenticated_is_denied(self):
        status, _ = self.req()
        self.assertEqual(status, 401)

    def test_wrong_key_is_denied(self):
        status, _ = self.req(token="wrong")
        self.assertEqual(status, 401)

    def test_valid_key_can_access_local_model_health(self):
        status, data = self.req(token=TOKEN)
        self.assertEqual(status, 200)
        self.assertIn(b"acestep-v15-xl-turbo", data)

    def test_authorized_poll_is_proxied(self):
        status, data = self.req("/query_result", TOKEN, "POST", {"task_id_list": ["not-real"]})
        self.assertEqual(status, 200)
        self.assertIn(b"llm_initialized", data)

    def test_disallowed_route_is_not_exposed(self):
        status, _ = self.req("/docs", TOKEN)
        self.assertEqual(status, 404)


if __name__ == "__main__":
    unittest.main()
