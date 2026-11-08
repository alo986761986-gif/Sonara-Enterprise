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
import json
import os
import pathlib
import re
import signal
import subprocess
import sys
import time
import urllib.request

ROOT = pathlib.Path.home() / '.sonara'
TOKEN_FILE = ROOT / 'relay.token'
ACE_KEY_FILE = pathlib.Path('/home/marimo/ACE-STEP/.sonara-api-key')
TARGET = ROOT / 'sonara_r2_pull_agent.py'
EXPECTED_AGENT_SHA256 = '7386ff566e1f30775186c6de0eb4400ae1425580c2d2cd20e019c180710cf41b'
EXPECTED_BPM_SHA256 = 'cdb96b7b2a3f615e1be91a25796eca8f9880baf5d46ccaa35123e4d7d666f99c'
EXPECTED_EVIDENCE_SHA256 = '0b68db91df21cba7efabd01b70d1e384b1ebdc18a53b01c757689887b9c56886'
EVIDENCE_TARGET = ROOT / 'sonara_tempo_evidence.py'
BPM_TARGET = ROOT / 'sonara_bpm_verification.py'
USER_AGENT = 'SONARA-MoLab-Relay/1.0'
AGENT_REVISION = 'sonara-remix-r2-agent-v6'
PREVIOUS_REVISION = 'sonara-https-agent-guard-v5'


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


def reviewed_bpm_source():
    # Stage the matching tempo analyser BEFORE touching the active agent.
    commit = os.environ.get('SONARA_RELAY_AGENT_COMMIT', '').strip()
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise SystemExit('SONARA: immutable agent commit required for BPM verification')
    url = ('https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/'
           + commit + '/molab/sonara_bpm_verification.py')
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'text/plain'})
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=30) as response:
        source = response.read(200_001)
    if len(source) > 200_000 or hashlib.sha256(source).hexdigest() != EXPECTED_BPM_SHA256:
        raise SystemExit('SONARA: BPM verifier source hash mismatch; live agent untouched')
    ast.parse(source, filename=str(BPM_TARGET))
    return source


def reviewed_evidence_source():
    # Pin exact pulse-evidence source to the same immutable GitHub commit.
    commit = os.environ.get('SONARA_RELAY_AGENT_COMMIT', '').strip()
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise SystemExit('SONARA: immutable agent commit required for tempo evidence')
    url = ('https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/'
           + commit + '/molab/sonara_tempo_evidence.py')
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT, 'Accept': 'text/plain'})
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=30) as response:
        source = response.read(200_001)
    if len(source) > 200_000 or hashlib.sha256(source).hexdigest() != EXPECTED_EVIDENCE_SHA256:
        raise SystemExit('SONARA: tempo evidence source hash mismatch; live agent untouched')
    ast.parse(source, filename=str(EVIDENCE_TARGET))
    return source


def active_status():
    path = ROOT / 'relay-agent-status.json'
    if path.is_symlink():
        raise SystemExit('Refusing a symlink for the relay status')
    status = json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(status, dict):
        raise SystemExit('SONARA: invalid relay status; active process left untouched')
    return status


def verify_claim_gate():
    token = TOKEN_FILE.read_text(encoding='utf-8').strip()
    req = urllib.request.Request(
        'https://api.sonaraenterprise.com/api/sonara-relay/auth',
        headers={'User-Agent': USER_AGENT, 'Accept': 'application/json',
                 'X-Sonara-Relay-Token': token, 'X-Sonara-Agent-Revision': AGENT_REVISION},
    )
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(req, timeout=20) as response:
        auth = json.load(response)
    if not (isinstance(auth, dict) and auth.get('service') == 'sonara-r2-relay'
            and auth.get('authenticated') is True
            and auth.get('remixAgentRevision') == AGENT_REVISION):
        raise SystemExit('SONARA: reference claim gate is not live; active agent left running')


def active_process_handle(status):
    pid = status.get('pid')
    if not isinstance(pid, int) or pid < 2:
        raise SystemExit('SONARA: invalid agent PID; active process left untouched')
    if not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        raise SystemExit('SONARA: safe process signalling is unavailable; active agent left running')
    # A pidfd keeps the signal bound to this process even if its PID is reused.
    handle = os.pidfd_open(pid, 0)
    try:
        process = pathlib.Path('/proc') / str(pid)
        args = (process / 'cmdline').read_bytes().rstrip(b'\0').split(b'\0')
        if (process.stat().st_uid != os.getuid()
                or (process / 'exe').resolve() != pathlib.Path(sys.executable).resolve()
                or args[1:] != [b'-u', os.fsencode(str(TARGET))]):
            raise SystemExit('SONARA: agent process identity mismatch; process left untouched')
        return handle
    except BaseException:
        os.close(handle)
        raise


def acquire_for_update(lock):
    def try_lock():
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            return True
        except BlockingIOError:
            return False

    if try_lock():
        return
    status = active_status()
    revision = status.get('revision')
    if revision not in (PREVIOUS_REVISION, AGENT_REVISION):
        raise SystemExit('SONARA: unrecognized active revision; active agent left running')
    verify_claim_gate()
    try:
        handle = active_process_handle(status)
    except (ProcessLookupError, FileNotFoundError):
        if try_lock():
            return
        raise SystemExit('SONARA: active process changed; no shutdown signal sent') from None
    try:
        # Both v4 and v5 treat SIGINT as a drain request: a claimed job finishes
        # before the single-agent lock is released. Never escalate to SIGKILL.
        print('SONARA: requesting graceful relay handoff; waiting for its lock.', flush=True)
        try:
            signal.pidfd_send_signal(handle, signal.SIGINT, None, 0)
        except ProcessLookupError:
            pass
        fcntl.flock(lock, fcntl.LOCK_EX)
    finally:
        os.close(handle)


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

    install_lock_path = ROOT / 'relay-agent-install.lock'
    if install_lock_path.is_symlink():
        raise SystemExit('Refusing a symlink for the relay installer lock')
    install_lock = install_lock_path.open('a')
    install_lock_path.chmod(0o600)
    try:
        fcntl.flock(install_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise SystemExit('SONARA: another relay installer is already active')

    # Verify and stage the exact source before requesting any process handoff.
    source = reviewed_source()
    bpm_source = reviewed_bpm_source()
    evidence_source = reviewed_evidence_source()
    ast.parse(source, filename=str(TARGET))
    temporary = ROOT / 'sonara_r2_pull_agent.installing'
    private_write(temporary, source)
    bpm_temporary = ROOT / 'sonara_bpm_verification.installing'
    private_write(bpm_temporary, bpm_source)
    evidence_temporary = ROOT / 'sonara_tempo_evidence.installing'
    private_write(evidence_temporary, evidence_source)
    if EVIDENCE_TARGET.is_symlink():
        raise SystemExit('Refusing a symlink for the tempo evidence module')
    if BPM_TARGET.is_symlink():
        raise SystemExit('Refusing a symlink for the BPM verifier')
    if TARGET.is_symlink():
        raise SystemExit('Refusing a symlink for the relay executable')
    log_path = ROOT / 'relay-agent.log'
    if log_path.is_symlink():
        raise SystemExit('Refusing a symlink for the relay log')

    lock_path = ROOT / 'relay-agent.lock'
    if lock_path.is_symlink():
        raise SystemExit('Refusing a symlink for the relay lock')
    with lock_path.open('a') as lock:
        lock_path.chmod(0o600)
        acquire_for_update(lock)
        os.replace(bpm_temporary, BPM_TARGET)
        os.replace(evidence_temporary, EVIDENCE_TARGET)
        os.replace(temporary, TARGET)
        fcntl.flock(lock, fcntl.LOCK_UN)
    child_env = os.environ.copy()
    child_env.pop('SONARA_RELAY_TOKEN', None)
    child_env['SONARA_LOCAL_API_AUTH_MODE'] = mode
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
