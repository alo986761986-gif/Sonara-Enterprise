#!/usr/bin/env python3
"""Cache-proof launcher for SONARA Wan 2.2 Black Video Fix V5.

This file has a brand-new path so MoLab/raw GitHub caches cannot return the old
V3 launcher. It first releases TCP 7862, then executes the immutable V4 patch
from commit c1d2b9bfdf32fc3f753a3d61a4945aa301c46550.
"""

from __future__ import annotations

import os
import shutil
import signal
import socket
import subprocess
import time
import urllib.request

PORT = 7862
IMMUTABLE_V4 = (
    "https://raw.githubusercontent.com/"
    "alo986761986-gif/Sonara-Enterprise/"
    "c1d2b9bfdf32fc3f753a3d61a4945aa301c46550/"
    "scripts/molab-sonara-wan22-black-video-fix-0902.py"
)


def port_open() -> bool:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(0.3)
    try:
        return sock.connect_ex(("127.0.0.1", PORT)) == 0
    finally:
        sock.close()


def matching_uvicorn_pids() -> list[int]:
    pids: list[int] = []
    try:
        rows = subprocess.check_output(["ps", "-eo", "pid=,args="], text=True, timeout=15)
    except Exception:
        return pids
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2 or not parts[0].isdigit():
            continue
        pid = int(parts[0])
        args = parts[1].lower()
        if pid == os.getpid():
            continue
        if "cloudflared" in args:
            continue
        if "sonara_wan22_api:app" in args or ("uvicorn" in args and "7862" in args):
            pids.append(pid)
    return sorted(set(pids))


def hard_release() -> None:
    print("=" * 92, flush=True)
    print("SONARA VIDEO AI V5 - LIBERAZIONE SICURA PORTA 7862", flush=True)
    print("=" * 92, flush=True)

    if not port_open():
        print("SONARA_PORT_7862=FREE", flush=True)
        return

    # Prefer fuser's direct TCP kill mode: no PID parsing and no chance of
    # mistaking the port number for a process id.
    fuser = shutil.which("fuser")
    if fuser:
        subprocess.run([fuser, "-k", "-TERM", "7862/tcp"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    else:
        pids = matching_uvicorn_pids()
        print(f"SONARA_OLD_API_PIDS={pids}", flush=True)
        for pid in pids:
            try:
                os.kill(pid, signal.SIGTERM)
            except ProcessLookupError:
                pass

    deadline = time.time() + 10
    while time.time() < deadline and port_open():
        time.sleep(0.25)

    if port_open():
        if fuser:
            subprocess.run([fuser, "-k", "-KILL", "7862/tcp"], check=False, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            pids = matching_uvicorn_pids()
            print(f"SONARA_FORCE_API_PIDS={pids}", flush=True)
            for pid in pids:
                try:
                    os.kill(pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass

    deadline = time.time() + 10
    while time.time() < deadline:
        if not port_open():
            print("SONARA_PORT_7862=FREE", flush=True)
            return
        time.sleep(0.25)

    raise RuntimeError("Porta 7862 ancora occupata dopo TERM/KILL. Controllare i processi del notebook.")


def main() -> None:
    hard_release()
    print("SONARA_V5_CACHE_BYPASS=OK", flush=True)
    print("SONARA_V5_LOADING_IMMUTABLE_V4=c1d2b9bf", flush=True)
    code = urllib.request.urlopen(IMMUTABLE_V4, timeout=120).read().decode("utf-8")
    namespace = {
        "__name__": "__main__",
        "__file__": "<sonara-black-video-fix-v5-immutable-v4>",
    }
    exec(compile(code, "<sonara-black-video-fix-v5-immutable-v4>", "exec"), namespace)


if __name__ == "__main__":
    main()
