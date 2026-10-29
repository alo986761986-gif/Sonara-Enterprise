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
PIN = "d0a96e7ee744b5ae1d68083fbf39e17ed016a9cc"
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

def relay_pids() -> list[int]:
    try:
        rows = subprocess.check_output(["ps", "-eo", "pid=,args="], text=True)
    except Exception:
        return []
    me = os.getpid()
    found = []
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
            found.append(pid)
    return found


def stop_relay_only() -> None:
    targets = relay_pids()
    for pid in targets:
        try:
            os.kill(pid, signal.SIGINT)
        except ProcessLookupError:
            pass
    deadline = time.time() + 15
    while time.time() < deadline:
        if not relay_pids():
            return
        time.sleep(0.5)
    for pid in relay_pids():
        try:
            os.kill(pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    deadline = time.time() + 8
    while time.time() < deadline:
        if not relay_pids():
            return
        time.sleep(0.5)
    raise SystemExit("SONARA updater: previous relay processes did not stop cleanly")

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
    status_path = ROOT / "relay-agent-status.json"
    started_at = time.time()
    status = {}
    deadline = started_at + 35
    import json
    while time.time() < deadline:
        if proc.poll() is not None:
            break
        try:
            if status_path.is_file():
                candidate = json.loads(status_path.read_text(encoding="utf-8"))
                if float(candidate.get("updatedAt") or 0) >= started_at - 1:
                    status = candidate
                    if candidate.get("state") in ("waiting_for_authorized_job", "standby", "connection_unavailable"):
                        break
        except Exception:
            pass
        time.sleep(1)

    print("SONARA_RELAY_UPDATE_PIN=" + PIN)
    print("WATCHDOG_PID=" + str(proc.pid))
    print("WATCHDOG_RUNNING=" + str(proc.poll() is None))
    print("ACE_STEP=NOT_TOUCHED")
    print("RELAY_TOKEN=NOT_PRINTED")
    for key in ("revision","state","authenticated","modelsReady","storageConfigured","gatewayConfigured","relayEnabled"):
        if key in status:
            print(f"{key}={status.get(key)}")
    if proc.poll() is not None:
        raise SystemExit("SONARA updater: watchdog exited before relay became ready")
    if status.get("state") == "stopped_for_update" or not status:
        raise SystemExit("SONARA updater: relay did not publish a fresh readiness state")

if __name__ == "__main__":
    main()
