#!/usr/bin/env python3
"""Read-only Cloudflare/SONARA diagnostics; never print machine secrets.

Checks the new music engine's capabilities endpoint and the already-authorized
legacy relay auth probe. Does not claim jobs, rotate tokens, touch ACE-Step,
or start a GPU worker.
"""
from __future__ import annotations
import json
import pathlib
import urllib.error
import urllib.request

BASE = "https://api.sonaraenterprise.com"
TOKEN = pathlib.Path.home() / ".sonara" / "relay.token"
ROOT = pathlib.Path.home() / ".sonara" / "multi-engine-v1"


def probe(path: str, use_machine_token: bool = False):
    headers = {"User-Agent": "SONARA-MoLab-Relay/1.0", "Accept": "application/json", "Cache-Control": "no-cache"}
    if use_machine_token:
        if not TOKEN.is_file():
            print("SONARA_AUTH_TOKEN_MISSING=True")
            return
        secret = TOKEN.read_text(encoding="utf-8").strip()
        if len(secret) < 32:
            print("SONARA_AUTH_TOKEN_INVALID=True")
            return
        headers["X-Sonara-Relay-Token"] = secret
        headers["X-Sonara-Agent-Revision"] = "sonara-https-agent-guard-v5"
    req = urllib.request.Request(BASE + path, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=25) as res:
            status = res.status
            content_type = res.headers.get("content-type", "")
            body = res.read(12000)
            ray = res.headers.get("cf-ray", "")[:48]
    except urllib.error.HTTPError as exc:
        status = exc.code
        content_type = exc.headers.get("content-type", "")
        body = exc.read(12000)
        ray = exc.headers.get("cf-ray", "")[:48]
    except (urllib.error.URLError, TimeoutError) as exc:
        print("SONARA_PROBE_NETWORK_ERROR=" + type(exc).__name__)
        return
    print("SONARA_PROBE_PATH=" + path)
    print("SONARA_PROBE_HTTP=" + str(status))
    print("SONARA_PROBE_CONTENT_TYPE=" + content_type[:80])
    if ray:
        print("SONARA_PROBE_CF_RAY=" + ray)
    try:
        obj = json.loads(body)
    except (UnicodeError, ValueError):
        print("SONARA_PROBE_JSON=False")
        return
    if not isinstance(obj, dict):
        print("SONARA_PROBE_JSON_OBJECT=False")
        return
    # Explicit output allowlist prevents accidental printing of secrets.
    for key in ("service", "version", "authenticated", "agentOnline", "relayEnabled", "error"):
        if key in obj and isinstance(obj[key], (str, bool, int, float)):
            print("SONARA_PROBE_" + key.upper() + "=" + str(obj[key])[:170])
    models = obj.get("models")
    if isinstance(models, dict):
        for model in ("heartmula-3b", "stable-audio-3-medium"):
            entry = models.get(model)
            if isinstance(entry, dict):
                print("SONARA_PROBE_MODEL_" + model + "_READY=" + str(entry.get("ready") is True))


def main():
    print("=== SONARA MULTI ENGINE GATEWAY DIAGNOSIS ===")
    probe("/api/sonara-relay/auth", use_machine_token=True)
    probe("/api/sonara-multi/capabilities")
    log = ROOT / "worker.log"
    if log.is_file():
        print("SONARA_WORKER_LOG_PRESENT=True")
        for line in log.read_text(encoding="utf-8", errors="replace").splitlines()[-16:]:
            # Never expose arbitrary log text: only recognized non-secret status names.
            if "SONARA_MULTI_HEARTBEAT_HTTP=" in line:
                print("SONARA_MULTI_HEARTBEAT_HTTP=" + line.split("SONARA_MULTI_HEARTBEAT_HTTP=", 1)[1][:3])
            if "SONARA_MULTI_RELAY_HTTP=" in line:
                print("SONARA_MULTI_RELAY_HTTP=" + line.split("SONARA_MULTI_RELAY_HTTP=", 1)[1][:3])
            if "SONARA_MULTI_RELAY_RETRY" in line:
                print("SONARA_MULTI_RELAY_RETRY=YES")
            if "SONARA_MULTI_HEARTBEAT_ERROR=" in line:
                print("SONARA_MULTI_HEARTBEAT_ERROR=" + line.split("SONARA_MULTI_HEARTBEAT_ERROR=",1)[1][:50])


if __name__ == "__main__":
    main()
