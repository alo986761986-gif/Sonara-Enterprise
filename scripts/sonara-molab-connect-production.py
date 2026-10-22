#!/usr/bin/env python3
"""Connect the existing MoLab ACE-Step XL Turbo + LM 4B to SONARA's private Cloudflare origin.

Run ONLY with explicit provider authorization to serve external SONARA users.
Requires an active MoLab notebook and Cloudflare authorization for sonaraenterprise.com.
Does not reinstall/terminate ACE-Step or modify checkpoints.
Run inside a Marimo function scope to avoid duplicate global imports.
"""
from __future__ import annotations

import json
import os
import platform
import secrets
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

HOME = Path("/marimo")
PRIVATE = HOME / ".sonara_private"
KEY_FILE = PRIVATE / "molab_xl_gateway_key"
GATEWAY_FILE = PRIVATE / "sonara-molab-secure-gateway.py"
GATEWAY_LOG = PRIVATE / "gateway.log"
TUNNEL_LOG = PRIVATE / "cloudflared.log"
TUNNEL_PID = PRIVATE / "tunnel.pid"
GATEWAY_PID = PRIVATE / "gateway.pid"
CF_HOME = HOME / ".cloudflared"
CF_BIN = CF_HOME / "cloudflared"
CF_CERT = CF_HOME / "cert.pem"
CF_CONFIG = CF_HOME / "sonara-molab-secure-v2.yml"
TUNNEL_NAME = "sonara-molab-secure-v2"
HOSTNAME = "molab.sonaraenterprise.com"
PUBLIC_URL = "https://" + HOSTNAME
LOCAL_GATEWAY = "http://127.0.0.1:8002"
LOCAL_API = "http://127.0.0.1:8001"
SOURCE = (
    "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/"
    "feature/sonara-molab-xl-only-20261022/scripts/"
    "sonara-molab-secure-gateway.py"
)


def log(message):
    print("SONARA: " + message, flush=True)


def private_file(path: Path, text: str):
    fd = os.open(str(path), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as stream:
        stream.write(text)
    path.chmod(0o600)


def request_json(url: str, token: str = "", timeout=12):
    headers = {"Accept": "application/json", "Cache-Control": "no-cache"}
    if token:
        headers["Authorization"] = "Bearer " + token
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        data = json.loads(response.read().decode("utf-8"))
    return data.get("data", data)


def assert_models(state):
    if not (
        state.get("models_initialized") is True
        and state.get("llm_initialized") is True
        and "acestep-v15-xl-turbo" in str(state.get("loaded_model") or "")
        and "acestep-5Hz-lm-4B" in str(state.get("loaded_lm_model") or "")
    ):
        raise RuntimeError("MoLab ACE-Step XL Turbo + LM 4B non risultano entrambi caricati.")


def create_secret():
    PRIVATE.mkdir(parents=True, exist_ok=True)
    PRIVATE.chmod(0o700)
    if KEY_FILE.exists():
        token = KEY_FILE.read_text(encoding="utf-8").strip()
        if len(token) < 48:
            raise RuntimeError("Chiave gateway locale presente ma troppo corta.")
        return token
    token = (os.getenv("SONARA_GATEWAY_SECRET") or "").strip() or secrets.token_urlsafe(48)
    if len(token) < 48:
        raise RuntimeError("SONARA_GATEWAY_SECRET troppo corto; usa almeno 48 caratteri.")
    private_file(KEY_FILE, token + "\n")
    return token


def download_gateway():
    headers = {"User-Agent": "SONARA-MoLab-AuthorizedGateway/1.0",
               "Cache-Control": "no-cache"}
    req = urllib.request.Request(SOURCE, headers=headers)
    with urllib.request.urlopen(req, timeout=40) as response:
        code = response.read().decode("utf-8")
    if "class GatewayHandler" not in code or "ThreadingHTTPServer" not in code:
        raise RuntimeError("Codice gateway incompleto.")
    compile(code, str(GATEWAY_FILE), "exec")
    private_file(GATEWAY_FILE, code)


def api_key_for_local_origin():
    return (
        os.environ.get("SONARA_MOLAB_UPSTREAM_API_KEY", "").strip()
        or os.environ.get("SONARA_ACESTEP_API_KEY", "").strip()
        or os.environ.get("ACESTEP_API_KEY", "").strip()
    )


def _denied_without_auth(url):
    try:
        request_json(url, "", timeout=8)
    except urllib.error.HTTPError as e:
        return e.code in (401, 403)
    except Exception:
        return False
    return False


def _probe_gateway(token):
    try:
        state = request_json(LOCAL_GATEWAY + "/health", token)
        assert_models(state)
        return True
    except Exception:
        return False


def ensure_gateway(token):
    if _probe_gateway(token) and _denied_without_auth(LOCAL_GATEWAY + "/health"):
        log("Gateway autenticato gia attivo sulla porta locale 8002.")
        return

    # A process with an unknown key/owner is never terminated automatically.
    try:
        request_json(LOCAL_GATEWAY + "/health", token, timeout=2)
    except urllib.error.HTTPError as exc:
        if exc.code in (401, 403):
            raise RuntimeError("Porta 8002 occupata da altro gateway o chiave errata.")
    except Exception:
        pass

    download_gateway()
    env = dict(os.environ)
    env["SONARA_MOLAB_UPSTREAM_API_KEY"] = api_key_for_local_origin()
    with GATEWAY_LOG.open("ab") as handle:
        proc = subprocess.Popen(
            [sys.executable, "-u", str(GATEWAY_FILE)],
            cwd=str(PRIVATE),
            env=env,
            stdout=handle,
            stderr=subprocess.STDOUT,
            start_new_session=True,
            close_fds=True,
        )
    private_file(GATEWAY_PID, str(proc.pid))
    for _ in range(30):
        if proc.poll() is not None:
            tail = GATEWAY_LOG.read_text(errors="replace")[-3000:]
            raise RuntimeError("Gateway locale arrestato: " + tail)
        if _probe_gateway(token) and _denied_without_auth(LOCAL_GATEWAY + "/health"):
            log("Gateway locale 8002 protetto, XL Turbo + LM 4B pronti.")
            return
        time.sleep(1)
    raise RuntimeError("Gateway locale non pronto (log: " + str(GATEWAY_LOG) + ")")


def cf_env():
    e = dict(os.environ)
    e["HOME"] = str(HOME)
    return e


def cloudflared():
    CF_HOME.mkdir(parents=True, exist_ok=True)
    CF_HOME.chmod(0o700)
    if CF_BIN.is_file():
        CF_BIN.chmod(0o755)
        return
    arch = "arm64" if platform.machine().lower() in ("arm64", "aarch64") else "amd64"
    url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-" + arch
    log("Installazione del client ufficiale Cloudflare Tunnel.")
    urllib.request.urlretrieve(url, CF_BIN)
    CF_BIN.chmod(0o755)


def run_cf(args, check=True):
    p = subprocess.run([str(CF_BIN), *args], env=cf_env(),
                       capture_output=True, text=True, timeout=120)
    if check and p.returncode:
        raise RuntimeError(
            "cloudflared " + " ".join(args[:3]) + " non riuscito: " +
            ((p.stderr or p.stdout or "")[-1300:])
        )
    return p


def ensure_tunnel_config():
    cloudflared()
    if not CF_CERT.exists():
        log("Autorizzazione Cloudflare richiesta. Apri il link mostrato e scegli sonaraenterprise.com.")
        p = subprocess.run([str(CF_BIN), "tunnel", "login"], env=cf_env(), timeout=300)
        if p.returncode or not CF_CERT.exists():
            raise RuntimeError("Login Cloudflare non completato.")
    data = run_cf(["tunnel", "list", "--output", "json"]).stdout
    tunnels = json.loads(data or "[]")
    matching = [t for t in tunnels if t.get("name") == TUNNEL_NAME]
    if not matching:
        log("Creazione nuovo tunnel Cloudflare dedicato (non interferisce con l'eventuale tunnel vecchio).")
        run_cf(["tunnel", "create", TUNNEL_NAME])
        tunnels = json.loads(run_cf(["tunnel", "list", "--output", "json"]).stdout or "[]")
        matching = [t for t in tunnels if t.get("name") == TUNNEL_NAME]
    if not matching:
        raise RuntimeError("Tunnel dedicato non individuato nell'account Cloudflare.")
    tunnel_id = str(matching[0].get("id") or matching[0].get("uuid") or "").strip()
    credentials = CF_HOME / (tunnel_id + ".json")
    if not tunnel_id or not credentials.is_file():
        raise RuntimeError("Credenziali per il tunnel " + TUNNEL_NAME + " non presenti nel notebook.")

    config = (
        "tunnel: " + tunnel_id + "\n"
        "credentials-file: " + str(credentials) + "\n"
        "ingress:\n"
        "  - hostname: " + HOSTNAME + "\n"
        "    service: " + LOCAL_GATEWAY + "\n"
        "  - service: http_status:404\n"
    )
    private_file(CF_CONFIG, config)
    run_cf(["tunnel", "--config", str(CF_CONFIG), "ingress", "validate"])

    log("Associo DNS molab.sonaraenterprise.com al tunnel protetto.")
    run_cf(["tunnel", "route", "dns", "--overwrite-dns", TUNNEL_NAME, HOSTNAME])
    return tunnel_id


def public_ready(token):
    try:
        state = request_json(PUBLIC_URL + "/health", token, timeout=12)
        assert_models(state)
        return _denied_without_auth(PUBLIC_URL + "/health")
    except Exception:
        return False


def start_tunnel(tunnel_id, token):
    if public_ready(token):
        log("Endpoint Cloudflare gia online e autenticato.")
        return
    with TUNNEL_LOG.open("ab") as handle:
        proc = subprocess.Popen(
            [str(CF_BIN), "tunnel", "--config", str(CF_CONFIG), "run", tunnel_id],
            env=cf_env(), stdout=handle, stderr=subprocess.STDOUT,
            start_new_session=True, close_fds=True,
        )
    private_file(TUNNEL_PID, str(proc.pid))
    for _ in range(90):
        if public_ready(token):
            log("Cloudflare Tunnel ONLINE: " + PUBLIC_URL)
            return
        if proc.poll() is not None:
            raise RuntimeError(
                "Cloudflare Tunnel terminato: " +
                TUNNEL_LOG.read_text(errors="replace")[-4000:]
            )
        time.sleep(2)
    raise RuntimeError("Endpoint HTTPS non pronto. Log: " + str(TUNNEL_LOG))


def main():
    log("Avvio connessione diretta SONARA / MoLab (solo con autorizzazione del provider).")
    local = request_json(LOCAL_API + "/health", api_key_for_local_origin())
    assert_models(local)
    log("GPU ACE-Step XL Turbo + LM 4B gia avviati: nessuna reinstallazione.")
    token = create_secret()
    ensure_gateway(token)
    tunnel_id = ensure_tunnel_config()
    start_tunnel(tunnel_id, token)
    print("\n" + "=" * 72)
    print("SONARA MOLAB CLOUD GPU ONLINE")
    print("SONARA_MOLAB_XL_URL=" + PUBLIC_URL)
    print("MODE=MOLAB_XL_ONLY")
    print("LOCAL_ACE_STEP=127.0.0.1:8001")
    print("PROTECTED_GATEWAY=127.0.0.1:8002")
    print("TUNNEL_NAME=" + TUNNEL_NAME)
    print("GITHUB_ACTIONS_SECRET_NAME=SONARA_ACESTEP_API_KEY")
    print("GITHUB_ACTIONS_SECRET_VALUE=" + token)
    print("IMPORTANTE: inserisci questa chiave SOLO nei GitHub Actions Secrets, NON nella chat.")
    print("Al termine elimina l'output della cella contenente la chiave.")
    print("=" * 72, flush=True)
    return PUBLIC_URL


if __name__ == "__main__":
    main()
