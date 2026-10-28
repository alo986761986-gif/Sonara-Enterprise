"""SONARA MoLab relay watchdog.
Restarts only the HTTPS relay agent. It never starts, stops or reconfigures ACE-Step.
"""
from __future__ import annotations
import fcntl
import os
import pathlib
import signal
import subprocess
import sys
import time

ROOT = pathlib.Path.home() / '.sonara'
AGENT = ROOT / 'sonara_r2_pull_agent.py'
LOCK = ROOT / 'relay-supervisor.lock'
LOG = ROOT / 'relay-agent.log'
STOP = False
CHILD = None

def request_stop(_signum, _frame):
    global STOP
    STOP = True
    child = CHILD
    if child is not None and child.poll() is None:
        try:
            child.send_signal(signal.SIGINT)
        except ProcessLookupError:
            pass

def main():
    global CHILD
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    ROOT.chmod(0o700)
    if ROOT.is_symlink() or AGENT.is_symlink() or LOG.is_symlink() or LOCK.is_symlink():
        raise SystemExit('SONARA: unsafe relay path')
    if not AGENT.is_file() or AGENT.stat().st_size == 0:
        raise SystemExit('SONARA: relay agent missing')
    lock = LOCK.open('a')
    os.chmod(LOCK, 0o600)
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit('SONARA: relay supervisor already running')
    signal.signal(signal.SIGINT, request_stop)
    signal.signal(signal.SIGTERM, request_stop)
    env = os.environ.copy()
    env.pop('SONARA_RELAY_TOKEN', None)
    env['SONARA_LOCAL_API_AUTH_MODE'] = 'none'
    consecutive_fast_exits = 0
    while not STOP:
        started = time.monotonic()
        fd = os.open(str(LOG), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(fd, 'ab') as log:
            os.fchmod(log.fileno(), 0o600)
            CHILD = subprocess.Popen(
                [sys.executable, '-u', str(AGENT)],
                stdin=subprocess.DEVNULL,
                stdout=log,
                stderr=subprocess.STDOUT,
                cwd=str(ROOT),
                env=env,
                start_new_session=True,
            )
        try:
            CHILD.wait()
        finally:
            CHILD = None
        if STOP:
            break
        lifetime = time.monotonic() - started
        consecutive_fast_exits = consecutive_fast_exits + 1 if lifetime < 5 else 0
        time.sleep(min(20, 1 + consecutive_fast_exits * 2))
    raise SystemExit(0)

if __name__ == '__main__':
    main()
