"""Install and start the reviewed SONARA HTTPS relay without touching ACE-Step.

Inputs:
- Private ~/.sonara/relay.token, or SONARA_RELAY_TOKEN environment secret.
- SONARA_LOCAL_API_AUTH_MODE=none only for an existing unauthenticated loopback API.
- SONARA_RELAY_AGENT_COMMIT: immutable repository commit containing the reviewed agent,
  unless this installer is run next to that exact agent source file.
No credential is printed, embedded in source, or placed in process arguments.
"""
from __future__ import annotations

import ast
import fcntl
import hashlib
import os
import pathlib
import re
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path.home() / '.sonara'
TOKEN_FILE = ROOT / 'relay.token'
ACE_KEY_FILE = pathlib.Path('/home/marimo/ACE-STEP/.sonara-api-key')
TARGET = ROOT / 'sonara_r2_pull_agent.py'
EXPECTED_AGENT_SHA256 = 'c938f52073291bd39e3ebd66f7b211bb907e2123d529a51afdafd1f1549694b9'
USER_AGENT = 'SONARA-MoLab-Relay/1.0'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def private_write(path: pathlib.Path, data: bytes, *, exclusive=False):
    if path.is_symlink():
        raise SystemExit('Refusing a symlink for a private relay file')
    flags = os.O_WRONLY | os.O_CREAT | (os.O_EXCL if exclusive else os.O_TRUNC)
    if hasattr(os, 'O_NOFOLLOW'):
        flags |= os.O_NOFOLLOW
    fd = os.open(str(path), flags, 0o600)
    with os.fdopen(fd, 'wb') as out:
        os.fchmod(out.fileno(), 0o600)
        out.write(data)


def provision_token():
    if TOKEN_FILE.is_symlink():
        raise SystemExit('Refusing a symlink for the relay credential')
    if TOKEN_FILE.is_file():
        token = TOKEN_FILE.read_text(encoding='utf-8').strip()
    else:
        token = os.environ.get('SONARA_RELAY_TOKEN', '').strip()
    if len(token) < 32 or not token.isascii() or any(c.isspace() for c in token):
        raise SystemExit('SONARA: private relay credential missing or invalid; agent not started')
    if not TOKEN_FILE.exists():
        private_write(TOKEN_FILE, token.encode('ascii'), exclusive=True)
    TOKEN_FILE.chmod(0o600)


def reviewed_source():
    filename = globals().get('__file__', '')
    if filename and not filename.startswith(('https://', 'http://')):
        adjacent = pathlib.Path(filename).resolve().with_name('sonara_r2_pull_agent.py')
        if adjacent.is_file():
            source = adjacent.read_bytes()
            if hashlib.sha256(source).hexdigest() == EXPECTED_AGENT_SHA256:
                return source
    commit = os.environ.get('SONARA_RELAY_AGENT_COMMIT', '').strip()
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise SystemExit('SONARA: set the exact reviewed SONARA_RELAY_AGENT_COMMIT before installation')
    url = (
        'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/'
        + commit + '/molab/sonara_r2_pull_agent.py'
    )
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'text/plain'})
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(req, timeout=30) as response:
        source = response.read(1_000_001)
    if len(source) > 1_000_000 or hashlib.sha256(source).hexdigest() != EXPECTED_AGENT_SHA256:
        raise SystemExit('SONARA: agent source differs from the reviewed revision; installation stopped')
    ast.parse(source, filename=str(TARGET))
    return source


def main():
    mode = os.environ.get('SONARA_LOCAL_API_AUTH_MODE', 'required').strip().lower()
    if mode not in ('required', 'none'):
        raise SystemExit('SONARA: local API auth mode must be required or none')
    if mode == 'required' and (not ACE_KEY_FILE.is_file() or ACE_KEY_FILE.stat().st_size == 0):
        raise SystemExit('SONARA: local API credential missing; choose none only for the existing loopback API')
    if ROOT.is_symlink():
        raise SystemExit('Refusing a symlink for the private relay directory')
    ROOT.mkdir(parents=True, exist_ok=True, mode=0o700)
    ROOT.chmod(0o700)
    provision_token()

    lock_path = ROOT / 'relay-agent.lock'
    if lock_path.is_symlink():
        raise SystemExit('Refusing a symlink for the relay lock')
    with lock_path.open('a') as lock:
        lock_path.chmod(0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print('SONARA: a relay agent is already active.')
            return
        fcntl.flock(lock, fcntl.LOCK_UN)

    source = reviewed_source()
    temporary = ROOT / 'sonara_r2_pull_agent.installing'
    private_write(temporary, source)
    if TARGET.is_symlink():
        raise SystemExit('Refusing a symlink for the relay executable')
    os.replace(temporary, TARGET)
    child_env = os.environ.copy()
    child_env.pop('SONARA_RELAY_TOKEN', None)
    child_env['SONARA_LOCAL_API_AUTH_MODE'] = mode
    log_path = ROOT / 'relay-agent.log'
    if log_path.is_symlink():
        raise SystemExit('Refusing a symlink for the relay log')
    log_fd = os.open(str(log_path), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(log_fd, 'ab') as log:
        os.fchmod(log.fileno(), 0o600)
        process = subprocess.Popen(
            [sys.executable, '-u', str(TARGET)],
            stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
            cwd=str(ROOT), env=child_env, start_new_session=True,
        )
    private_write(ROOT / 'relay-agent.pid', str(process.pid).encode('ascii'))
    print('SONARA: guarded relay agent launched; PID', process.pid)
    print('Local API authentication mode:', mode)
    print('Readiness is recorded in ~/.sonara/relay-agent-status.json.')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Never render HTTP bodies, environment variables, or credential values.
        raise SystemExit('SONARA relay setup failed: ' + type(error).__name__) from None
