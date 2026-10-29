#!/usr/bin/env python3
from __future__ import annotations
import ast
import os
import pathlib
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path.home() / ".sonara"
AGENT = ROOT / "sonara_r2_pull_agent.py"
WATCHDOG = ROOT / "sonara_relay_watchdog.py"
LOG = ROOT / "relay-watchdog.log"
PIN = "082d50ed667a170dc8e89079ca3e98d81658158f"
BASE = f"https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/{PIN}/molab"

def fetch(name: str) -> bytes:
    req = urllib.request.Request(
        f"{BASE}/{name}",
        headers={"User-Agent": "SONARA-Relay-Updater/1.0", "Accept": "text/plain"},
    )
    with urllib.request.urlopen(req, timeout=30) as response:
        data = response.read(1_000_001)
    if not data or len(data) > 1_000_000:
        raise SystemExit("SONARA updater: invalid relay source")
    ast.parse(data.decode("utf-8"), filename=name)
    return data

def write_private(path: pathlib.Path, data: bytes) -> None:
    if path.is_symlink():
        raise SystemExit("SONARA updater: unsafe relay path")
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(str(path), flags, 0o600)
    with os.fdopen(fd, "wb") as out:
        os.fchmod(out.fileno(), 0o600)
        out.write(data)

def stop_relay_only() -> None:
    try:
        rows = subprocess.check_output(["ps", "-eo", "pid=,args="], text=True)
    except Exception:
        return
    me = os.getpid()
    targets = []
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        if pid == me:
            continue
        cmd = parts[1]
        if "sonara_relay_watchdog.py" in cmd or "sonara_r2_pull_agent.py" in cmd:
            targets.append(pid)
    for pid in targets:
        try:
            os.kill(pid, signal.SIGINT)
        except ProcessLookupError:
            pass
    time.sleep(3)

def main() -> None:
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not (ROOT / "relay.token").is_file():
        raise SystemExit("SONARA updater: relay.token missing; pairing not touched")
    agent = fetch("sonara_r2_pull_agent.py")
    watchdog = fetch("sonara_relay_watchdog.py")
    stop_relay_only()
    write_private(AGENT, agent)
    write_private(WATCHDOG, watchdog)
    fd = os.open(str(LOG), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(fd, "ab") as log:
        os.fchmod(log.fileno(), 0o600)
        proc = subprocess.Popen(
            [sys.executable, "-u", str(WATCHDOG)],
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            cwd=str(ROOT),
            start_new_session=True,
        )
    time.sleep(4)
    status_path = ROOT / "relay-agent-status.json"
    print("SONARA_RELAY_UPDATE_PIN=" + PIN)
    print("WATCHDOG_PID=" + str(proc.pid))
    print("ACE_STEP=NOT_TOUCHED")
    print("RELAY_TOKEN=NOT_PRINTED")
    if status_path.is_file():
        import json
        status = json.loads(status_path.read_text(encoding="utf-8"))
        for key in ("revision","state","authenticated","modelsReady","storageConfigured","gatewayConfigured","relayEnabled"):
            if key in status:
                print(f"{key}={status.get(key)}")

if __name__ == "__main__":
    main()
