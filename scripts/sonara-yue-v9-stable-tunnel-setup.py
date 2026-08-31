#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import platform
import subprocess
import time
import urllib.request
from pathlib import Path

HOSTNAME = "yue.sonaraenterprise.com"
PUBLIC_URL = "https://" + HOSTNAME
TUNNEL_NAME = "sonara-yue-v9"
PORT = 8012
HOME = Path("/marimo")
CF_DIR = HOME / ".cloudflared"
CF_DIR.mkdir(parents=True, exist_ok=True)
BINARY = CF_DIR / "cloudflared"
CONFIG = CF_DIR / "sonara-yue-v9.yml"
CERT = CF_DIR / "cert.pem"
LOG = HOME / "sonara_yue_v9_cloudflared.log"


def cf_env():
    env = os.environ.copy()
    env["HOME"] = str(HOME)
    return env


def ensure_cloudflared():
    if BINARY.exists() and os.access(BINARY, os.X_OK):
        return
    arch = "arm64" if platform.machine().lower() in {"arm64", "aarch64"} else "amd64"
    print("Scarico cloudflared...", flush=True)
    urllib.request.urlretrieve(
        f"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}",
        BINARY,
    )
    BINARY.chmod(0o755)


def tunnel_id():
    result = subprocess.run(
        [str(BINARY), "tunnel", "list", "--output", "json"],
        env=cf_env(),
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return None
    try:
        rows = json.loads(result.stdout or "[]")
    except Exception:
        return None
    for row in rows:
        if str(row.get("name") or "") == TUNNEL_NAME:
            return str(row.get("id") or row.get("uuid") or "").strip() or None
    return None


def get_json(url, timeout=10):
    request = urllib.request.Request(url, headers={"User-Agent": "SONARA-YuE-V9-Tunnel"})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read().decode("utf-8", errors="replace")
        return response.status, json.loads(raw)


def verify_local():
    status, data = get_json(f"http://127.0.0.1:{PORT}/health", timeout=5)
    engine = data.get("engine") or {}
    if status != 200 or engine.get("ready") is not True:
        raise RuntimeError(
            "YuE V9 locale non pronto sulla porta 8012: "
            + json.dumps(data, ensure_ascii=False)[:2000]
        )
    print("✅ YuE V9 locale READY sulla porta 8012", flush=True)
    print("✅ GPU:", engine.get("gpu"), "| slots:", engine.get("slots"), flush=True)


def stop_old_yue_tunnel():
    result = subprocess.run(
        ["pgrep", "-af", "cloudflared"],
        capture_output=True,
        text=True,
        check=False,
    )
    for line in (result.stdout or "").splitlines():
        if TUNNEL_NAME not in line and str(CONFIG) not in line:
            continue
        try:
            pid = int(line.split(None, 1)[0])
        except Exception:
            continue
        if pid == os.getpid():
            continue
        subprocess.run(["kill", str(pid)], check=False)
    time.sleep(2)


def start_tunnel():
    stop_old_yue_tunnel()
    LOG.write_text("", encoding="utf-8")
    with LOG.open("ab", buffering=0) as fh:
        process = subprocess.Popen(
            [str(BINARY), "tunnel", "--config", str(CONFIG), "run", TUNNEL_NAME],
            env=cf_env(),
            stdout=fh,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
    print("✅ cloudflared PID:", process.pid, flush=True)
    return process


def tail_log(n=80):
    if not LOG.exists():
        return ""
    return "\n".join(LOG.read_text(encoding="utf-8", errors="ignore").splitlines()[-n:])


def main():
    print("=" * 78, flush=True)
    print("SONARA YUE V9 - CLOUDFLARE NAMED TUNNEL STABILE", flush=True)
    print("HOSTNAME=yue.sonaraenterprise.com | ORIGIN=http://127.0.0.1:8012", flush=True)
    print("=" * 78, flush=True)

    verify_local()
    ensure_cloudflared()

    if not CERT.exists():
        print("\n" + "=" * 78, flush=True)
        print("AUTORIZZAZIONE CLOUDFLARE - SOLO LA PRIMA VOLTA", flush=True)
        print("Apri il link mostrato qui sotto, accedi a Cloudflare e scegli sonaraenterprise.com.", flush=True)
        print("La cella continuera automaticamente dopo l'autorizzazione.", flush=True)
        print("=" * 78 + "\n", flush=True)
        result = subprocess.run([str(BINARY), "tunnel", "login"], env=cf_env(), check=False)
        if result.returncode != 0 or not CERT.exists():
            raise RuntimeError("Login Cloudflare non completato.")

    tid = tunnel_id()
    if not tid:
        print("Creo Named Tunnel:", TUNNEL_NAME, flush=True)
        result = subprocess.run(
            [str(BINARY), "tunnel", "create", TUNNEL_NAME],
            env=cf_env(),
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError("Creazione Named Tunnel SONARA YuE non riuscita.")
        tid = tunnel_id()

    if not tid:
        raise RuntimeError("Impossibile ricavare ID del tunnel SONARA YuE.")

    credentials = CF_DIR / f"{tid}.json"
    if not credentials.exists():
        raise RuntimeError(f"Credenziali tunnel mancanti: {credentials}")

    CONFIG.write_text(
        f"tunnel: {tid}\n"
        f"credentials-file: {credentials}\n"
        "ingress:\n"
        f"  - hostname: {HOSTNAME}\n"
        f"    service: http://127.0.0.1:{PORT}\n"
        "  - service: http_status:404\n",
        encoding="utf-8",
    )

    print("Configuro DNS stabile:", HOSTNAME, flush=True)
    route = subprocess.run(
        [
            str(BINARY),
            "tunnel", "route", "dns", "--overwrite-dns",
            TUNNEL_NAME, HOSTNAME,
        ],
        env=cf_env(),
        capture_output=True,
        text=True,
        check=False,
    )
    route_text = ((route.stdout or "") + "\n" + (route.stderr or "")).strip()
    if route_text:
        print(route_text, flush=True)
    if route.returncode != 0 and "already exists" not in route_text.lower():
        raise RuntimeError("Configurazione DNS Cloudflare non riuscita.")

    process = start_tunnel()
    print("Attendo endpoint pubblico...", flush=True)

    last = ""
    for attempt in range(1, 31):
        if process.poll() is not None:
            raise RuntimeError(
                f"cloudflared terminato rc={process.returncode}\n{tail_log(120)}"
            )
        try:
            status, data = get_json(PUBLIC_URL + "/health", timeout=10)
            last = json.dumps(data, ensure_ascii=False)
            engine = data.get("engine") or {}
            if status == 200 and engine.get("ready") is True:
                print("\n" + "=" * 78, flush=True)
                print("✅ SONARA YUE V9 TUNNEL STABILE PRONTO", flush=True)
                print("✅ PUBLIC URL=" + PUBLIC_URL, flush=True)
                print("✅ HEALTH=" + PUBLIC_URL + "/health", flush=True)
                print("✅ ORIGIN=http://127.0.0.1:8012", flush=True)
                print("✅ TUNNEL=" + TUNNEL_NAME, flush=True)
                print("✅ TUNNEL ID=" + tid, flush=True)
                print("✅ PID=" + str(process.pid), flush=True)
                print("✅ GPU=" + str(engine.get("gpu")), flush=True)
                print("✅ SLOTS=" + str(engine.get("slots")), flush=True)
                print("🚀 SONARA_YUE_WORKER_URL=" + PUBLIC_URL, flush=True)
                print("=" * 78, flush=True)
                return 0
        except Exception as exc:
            last = str(exc)
        if attempt % 5 == 0:
            print(f"Public health attempt {attempt}/30: {last[-500:]}", flush=True)
        time.sleep(3)

    print("===== CLOUDFLARED LOG =====", flush=True)
    print(tail_log(120), flush=True)
    print("============================", flush=True)
    raise RuntimeError("Endpoint pubblico YuE non pronto: " + last[-1500:])


if __name__ == "__main__":
    raise SystemExit(main())
