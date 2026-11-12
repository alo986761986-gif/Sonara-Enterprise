#!/usr/bin/env python3
"""Guarded MoLab V9 upgrade; private Remix Pro only, default read-only.

Uses source pinned to the merged, reviewed V8 Git commit. Does NOT modify
ACE-Step, public relay, Cloudflare, R2 billing, or customer audio. Requires
one existing idle private worker and known module hashes. Fails closed.
"""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import urllib.request

ROOT = Path('/marimo/SONARA-REMIX-PRO')
HOME = Path.home() / '.sonara'
VENV = ROOT / '.venv'
AGENT = ROOT / 'sonara_remix_pro_r2_agent.py'
STATUS = HOME / 'remix-pro-agent-status.json'
TOKEN = HOME / 'relay.token'
LOCK = HOME / 'remix-pro-v9-upgrade.lock'
LOG = HOME / 'remix-pro-v6-agent.log'
REVISION = 'sonara-remix-pro-r2-agent-v3-dual-reference-fusion'
COMMIT = '908ad711cb62ba8c2eb61c56f25a65d536202fef'
BASE = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/' + COMMIT + '/molab/'
# Exact git blob SHA-1 values. Only currently installed V8 and pinned V9 are accepted.
FILES = {
    'sonara_remix_pro_music_director.py': (None, '7778066b0a3030a94d633da99568206b1bcc8ae7'),
    'sonara_remix_pro_a_clock_fusion.py': ('cd1edfdaae097b0eba2f332b6baee8f6fa5e0fa6', '13e7009ae690d3f442f203a1ee91f47eb3274934'),
    'sonara_remix_pro_fusion.py': ('e458320d3a47f0fa4093b7768e4c0a43c3dc3a06', 'cd74e3f1d1a5a7aae98d00fb278fac22475020d5'),
    'sonara_remix_pro_v5.py': ('ebd9d0de4886d0ba84df68417803ce248ddc5f2c', '8c57cdffa1f22571c0a56673820e1920b2bf7934'),
    'sonara_remix_pro_r2_agent.py': ('c382972e7be57e0446c22a0a344677f1efcff283', '167dd9d7bd5855d6c7f3a8076fbd02ca89cae98d'),
}

class Blocked(RuntimeError):
    pass


def digest(data):
    if data is None:
        return None
    return hashlib.sha1(b'blob ' + str(len(data)).encode() + b'\0' + data).hexdigest()


def processes():
    found = []
    for proc in Path('/proc').iterdir():
        if not proc.name.isdigit():
            continue
        try:
            args = (proc / 'cmdline').read_bytes().split(b'\0')
            cwd = (proc / 'cwd').resolve(strict=True)
            for raw in args[1:]:
                if b'sonara_remix_pro_r2_agent.py' not in raw:
                    continue
                p = Path(os.fsdecode(raw))
                if (p if p.is_absolute() else cwd / p).resolve() == AGENT.resolve():
                    found.append(int(proc.name))
                    break
        except (OSError, RuntimeError, ValueError):
            continue
    return sorted(set(found))


def read_status():
    if STATUS.is_symlink():
        raise Blocked('Unsafe status file symlink')
    try:
        item = json.loads(STATUS.read_text())
        return item if isinstance(item, dict) else {}
    except (ValueError, OSError):
        return {}


def idle(pid):
    data = read_status()
    try:
        age = time.time() - float(data.get('updatedAt') or 0)
    except (TypeError, ValueError):
        return False
    jobs = ROOT / 'private-jobs'
    if jobs.is_symlink():
        raise Blocked('Unsafe private jobs directory')
    if jobs.is_dir() and any(p.is_dir() and p.name.startswith('srpro_') for p in jobs.iterdir()):
        return False
    return (processes() == [pid] and data.get('state') == 'waiting_for_authorized_job'
            and data.get('revision') == REVISION and not data.get('jobId')
            and not data.get('leaseId') and 0 <= age <= 20)


def two_idle_heartbeats(pid):
    seen = None
    deadline = time.monotonic() + 85
    while time.monotonic() < deadline:
        if processes() != [pid]:
            raise Blocked('Private worker changed during observation')
        if idle(pid):
            stamp = read_status().get('updatedAt')
            if seen is not None and stamp != seen:
                return
            seen = stamp
        else:
            seen = None
        time.sleep(2)
    raise Blocked('Two fresh idle heartbeats not observed')


def private_python():
    if VENV.is_symlink() or not (VENV / 'pyvenv.cfg').is_file():
        raise Blocked('Verified private venv missing')
    for name in ('python', 'python3', 'python3.13', 'python3.12'):
        p = VENV / 'bin' / name
        if not p.is_file() or not os.access(p, os.X_OK):
            continue
        check = subprocess.run([str(p), '-c',
            'import pathlib,sys;print(pathlib.Path(sys.prefix).resolve())'],
            cwd=ROOT, capture_output=True, text=True, timeout=15)
        if check.returncode == 0 and check.stdout.strip() == str(VENV.resolve()):
            return p
    raise Blocked('No verified private Python interpreter')


def atomic(target, content):
    fd, tmp = tempfile.mkstemp(prefix='.sonara-v9-', dir=ROOT)
    try:
        with os.fdopen(fd, 'wb') as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(tmp, 0o600)
        os.replace(tmp, target)
    finally:
        Path(tmp).unlink(missing_ok=True)


def get_mode(pid):
    args = [os.fsdecode(x) for x in (Path('/proc') / str(pid) / 'cmdline').read_bytes().split(b'\0') if x]
    for i, item in enumerate(args):
        if item == '--auth-mode' and i + 1 < len(args):
            mode = args[i+1]
            break
        if item.startswith('--auth-mode='):
            mode = item.split('=', 1)[1]
            break
    else:
        mode = 'required'
    if mode not in ('none','required'):
        raise Blocked('Private worker auth mode unknown')
    return mode


def launch(python, mode):
    with LOG.open('ab') as sink:
        return subprocess.Popen([str(python), str(AGENT), '--auth-mode', mode],
            cwd=ROOT, stdin=subprocess.DEVNULL, stdout=sink,
            stderr=subprocess.STDOUT, start_new_session=True)


def run(activate):
    print('=== SONARA REMIX PRO V9 - SAFE PRIVATE INSTALL ===', flush=True)
    for path in (ROOT, AGENT, STATUS, TOKEN):
        if path.is_symlink() or not path.exists():
            raise Blocked('Missing trusted prerequisite: ' + path.name)
    py = private_python()
    previous = {}
    for name, (before, after) in FILES.items():
        target = ROOT / name
        if target.is_symlink():
            raise Blocked('Unsafe module symlink: ' + name)
        raw = target.read_bytes() if target.is_file() else None
        if digest(raw) not in (before, after):
            raise Blocked('Unexpected local edits; refusing replacement: ' + name)
        previous[name] = raw
    if all(digest(previous[n]) == expected[1] for n, expected in FILES.items()):
        print('SONARA_V9_ALREADY_INSTALLED=True')
        return
    if not activate:
        print('SONARA_V9_PREFLIGHT_ONLY=True')
        print('SONARA_V9_NEXT=RUN_WITH_--activate_--confirm-maintenance')
        return
    pids = processes()
    if len(pids) != 1:
        raise Blocked('Expected exactly one existing private worker')
    pid = pids[0]
    two_idle_heartbeats(pid)
    incoming = {}
    for name, (_, target_sha) in FILES.items():
        req = urllib.request.Request(BASE + name, headers={'User-Agent':'SONARA-V8-Private/1.0'})
        with urllib.request.urlopen(req, timeout=45) as response:
            data = response.read(200001)
        if not data or len(data) >= 200001 or digest(data) != target_sha:
            raise Blocked('Pinned module hash or size mismatch: ' + name)
        compile(data, name, 'exec')
        incoming[name] = data
    LOCK.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with LOCK.open('a+') as lock:
        os.chmod(LOCK, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise Blocked('Another maintenance instance is active') from exc
        if not idle(pid):
            raise Blocked('An authorized job may have started')
        if any((ROOT / name).read_bytes() != raw for name, raw in previous.items() if raw is not None):
            raise Blocked('Private worker files changed before handoff')
        mode = get_mode(pid)
        time.sleep(2)
        if not idle(pid):
            raise Blocked('Private worker no longer idle')
        os.kill(pid, signal.SIGTERM)
        deadline = time.monotonic() + 25
        while pid in processes() and time.monotonic() < deadline:
            time.sleep(1)
        if processes():
            raise Blocked('Old worker did not exit safely; no files changed')
        child = None
        try:
            for name, data in incoming.items():
                atomic(ROOT / name, data)
            check = subprocess.run([str(py), '-c',
                 'import sonara_remix_pro_r2_agent as a; '
                 'assert a.pro_heartbeat_payload()["v9MusicDirectorReady"] is True'],
                 cwd=ROOT, capture_output=True, text=True, timeout=60)
            if check.returncode != 0:
                raise Blocked('V8 import and readiness verification failed')
            since = time.time()
            child = launch(py, mode)
            deadline = time.monotonic() + 55
            while time.monotonic() < deadline:
                if child.poll() is not None:
                    raise Blocked('V8 worker exited before readiness')
                data = read_status()
                if (child.pid in processes() and data.get('revision') == REVISION
                        and data.get('state') == 'waiting_for_authorized_job'
                        and float(data.get('updatedAt') or 0) >= since):
                    print('SONARA_V9_PRIVATE_ENGINE_INSTALLED=True')
                    print('SONARA_V9_GPU_WORKER_PID=' + str(child.pid))
                    print('SONARA_MAIN_ACE_STEP_UNCHANGED=True')
                    print('SONARA_CUSTOMER_JOBS_CREATED=0')
                    return
                time.sleep(2)
            raise Blocked('Authenticated V8 worker heartbeat not confirmed')
        except Exception:
            if child is not None and child.poll() is None:
                raise Blocked('New worker alive; refusing unsafe rollback')
            for name, raw in previous.items():
                if raw is None:
                    (ROOT / name).unlink(missing_ok=True)
                else:
                    atomic(ROOT / name, raw)
            restored = launch(py, mode)
            print('SONARA_V9_ROLLBACK_COMPLETE=True')
            print('SONARA_PREVIOUS_WORKER_RESTART_PID=' + str(restored.pid))
            raise

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--activate', action='store_true')
    parser.add_argument('--confirm-maintenance', action='store_true')
    args = parser.parse_args()
    try:
        run(args.activate and args.confirm_maintenance)
    except (Blocked, OSError, ValueError, SyntaxError, subprocess.SubprocessError) as err:
        print('SONARA_V9_INSTALL_BLOCKED=' + str(err), flush=True)
        sys.exit(1)