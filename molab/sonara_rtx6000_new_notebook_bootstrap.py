#!/usr/bin/env python3
"""SONARA MoLab RTX PRO 6000 bootstrap: ACE-Step XL Turbo + LM 4B + HTTPS R2 relay.

Run on the new, authorized MoLab notebook. Does NOT expose a public port, modify
Cloudflare/Vercel credentials, generate fake audio, or replace a known good engine.
The Cloudflare machine fingerprint must be paired separately before an agent
can claim authorized SONARA jobs. No credentials are printed.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request

SOURCE_ROOT = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/'
RELAY_URL = 'https://api.sonaraenterprise.com/api/sonara-relay'
API_URL = 'http://127.0.0.1:8001/health'
LOCAL_DIR = Path.home() / '.sonara'
BOOT_DIR = LOCAL_DIR / 'bootstrap-new-rtx6000'
TOKEN_FILE = LOCAL_DIR / 'relay.token'
EXPECTED_RECOVERY_SHA256 = '8713999bfcd5caba4d58f979cbef5151c265883ca723659f65bc23a0b06856f1'
REVISION_PATTERN = re.compile(r'[0-9a-f]{40}')


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def download_pinned(revision: str, path: str, *, sha256: str | None = None) -> Path:
    target = BOOT_DIR / Path(path).name
    if target.is_symlink():
        raise RuntimeError('Unsafe source symlink')
    request = urllib.request.Request(SOURCE_ROOT + revision + '/' + path,
                                     headers={'User-Agent': 'SONARA-RTX6000-Installer/1.0'})
    opener = urllib.request.build_opener(NoRedirect())
    with opener.open(request, timeout=45) as response:
        data = response.read(1_000_001)
    if not data or len(data) > 1_000_000:
        raise RuntimeError('Invalid installer source size')
    if sha256 and hashlib.sha256(data).hexdigest() != sha256:
        raise RuntimeError('Unexpected installer hash; no changes made')
    import ast
    ast.parse(data.decode('utf-8'), filename=path)
    target.write_bytes(data)
    target.chmod(0o600)
    return target


def load_recovery(revision: str):
    path = download_pinned(revision, 'molab/sonara_acestep_full_recovery.py',
                           sha256=EXPECTED_RECOVERY_SHA256)
    spec = importlib.util.spec_from_file_location('sonara_acestep_recovery_pinned', path)
    if spec is None or spec.loader is None:
        raise RuntimeError('Cannot load reviewed ACE-Step recovery')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def ready(health: dict) -> bool:
    return (health.get('models_initialized') is True
            and health.get('llm_initialized') is True
            and health.get('loaded_model') == 'acestep-v15-xl-turbo'
            and health.get('loaded_lm_model') == 'acestep-5Hz-lm-4B')


def prepare_engine(recovery, *, connect_only: bool) -> bool:
    health = recovery.health()
    if ready(health):
        print('ACE_STEP_XL_TURBO=READY (already active)', flush=True)
        print('LM_4B=READY', flush=True)
        return True
    if connect_only:
        python = recovery.ROOT / '.venv/bin/python'
        if not python.is_file():
            print('ENGINE_NOT_INSTALLED: rerun the installer in full mode', flush=True)
            return False
        print('RESTARTING_EXISTING_ACE_STEP_API', flush=True)
        recovery.start_api(python, os.environ.copy())
    else:
        print('INSTALLING_ACE_STEP_V15_XL_TURBO_AND_LM_4B', flush=True)
        if not __import__('shutil').which('git'):
            raise RuntimeError('Git not installed in the notebook')
        uv = recovery.ensure_uv()
        recovery.ensure_repo()
        python, env = recovery.install_env(uv)
        env = recovery.download_models(python, env)
        recovery.start_api(python, env)
    health = recovery.health()
    if not ready(health):
        print('ENGINE_NOT_READY: inspect ~/.sonara/ace-step-api.log', flush=True)
        return False
    print('ACE_STEP_XL_TURBO=READY', flush=True)
    print('LM_4B=READY', flush=True)
    print('GPU_LOCAL_API=127.0.0.1:8001', flush=True)
    return True


def private_token() -> tuple[str, str]:
    if LOCAL_DIR.is_symlink():
        raise RuntimeError('Unsafe SONARA directory symlink')
    LOCAL_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    LOCAL_DIR.chmod(0o700)
    BOOT_DIR.mkdir(mode=0o700, parents=True, exist_ok=True)
    BOOT_DIR.chmod(0o700)
    if TOKEN_FILE.is_symlink():
        raise RuntimeError('Unsafe token symlink')
    if TOKEN_FILE.exists():
        if not stat.S_ISREG(TOKEN_FILE.stat().st_mode):
            raise RuntimeError('Invalid relay credential file')
        token = TOKEN_FILE.read_text(encoding='utf-8').strip()
    else:
        token = secrets.token_urlsafe(48)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, 'O_NOFOLLOW', 0)
        fd = os.open(TOKEN_FILE, flags, 0o600)
        with os.fdopen(fd, 'w', encoding='utf-8') as out:
            out.write(token + '\n')
            out.flush()
            os.fchmod(out.fileno(), 0o600)
    if len(token) < 32 or not token.isascii() or any(c.isspace() for c in token):
        raise RuntimeError('Relay token missing/invalid; never paste token into chat')
    TOKEN_FILE.chmod(0o600)
    fingerprint = hashlib.sha256(token.encode('ascii')).hexdigest()
    return token, fingerprint


def relay_request(path: str, token: str):
    request = urllib.request.Request(
        RELAY_URL + path,
        headers={'Accept': 'application/json',
                 'User-Agent': 'SONARA-RTX6000-Installer/1.0',
                 'X-Sonara-Relay-Token': token,
                 'X-Sonara-Agent-Revision': 'sonara-https-agent-guard-v5'},
        method='GET')
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
            if response.status != 200:
                return response.status, {}
            return response.status, json.load(response)
    except urllib.error.HTTPError as exc:
        return exc.code, {}
    except (urllib.error.URLError, TimeoutError):
        return 0, {}


def install_relay(revision: str):
    for path in ('molab/sonara_r2_install.py',
                 'molab/sonara_r2_pull_agent.py',
                 'molab/sonara_bpm_verification.py',
                 'molab/sonara_tempo_evidence.py'):
        download_pinned(revision, path)
    env = os.environ.copy()
    env['SONARA_RELAY_AGENT_COMMIT'] = revision
    env['SONARA_LOCAL_API_AUTH_MODE'] = 'none'  # Only for 127.0.0.1:8001 loopback API.
    print('STARTING_HTTPS_443_R2_RELAY', flush=True)
    subprocess.run([sys.executable, '-u', str(BOOT_DIR / 'sonara_r2_install.py')],
                   cwd=str(BOOT_DIR), env=env, check=True)


def check_ready(token: str) -> bool:
    status_path = LOCAL_DIR / 'relay-agent-status.json'
    status = {}
    for _ in range(18):
        try:
            status = json.loads(status_path.read_text('utf-8'))
        except (FileNotFoundError, OSError, json.JSONDecodeError):
            status = {}
        if status.get('state') == 'waiting_for_authorized_job':
            break
        time.sleep(2)
    is_ready = (status.get('state') == 'waiting_for_authorized_job'
                and status.get('modelsReady') is True
                and status.get('authenticated') is True
                and status.get('storageConfigured') is True
                and status.get('gatewayConfigured') is True
                and status.get('relayEnabled') is True)
    code, queue = relay_request('/queue-status', token)
    is_ready = (is_ready and code == 200 and queue.get('agentOnline') is True)
    print('RELAY_STATE=' + str(status.get('state', 'not_running')), flush=True)
    print('RELAY_AUTHENTICATED=' + str(status.get('authenticated') is True), flush=True)
    print('R2_STORAGE_CONFIGURED=' + str(status.get('storageConfigured') is True), flush=True)
    print('SONARA_SITE_CONNECTION_READY=' + str(is_ready), flush=True)
    return is_ready


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--revision', required=True, help='Reviewed SONARA Git commit (40 hex)')
    parser.add_argument('--connect-only', action='store_true')
    args = parser.parse_args()
    if not REVISION_PATTERN.fullmatch(args.revision):
        raise SystemExit('Invalid reviewed commit')
    token, fingerprint = private_token()
    print('SONARA_NEW_MOLAB_RTX_PRO_6000', flush=True)
    print('RELAY_FINGERPRINT_SHA256=' + fingerprint, flush=True)
    recovery = load_recovery(args.revision)
    if not prepare_engine(recovery, connect_only=args.connect_only):
        raise SystemExit('ACE-Step is not ready; relay activation skipped')
    code, auth = relay_request('/auth', token)
    print('RELAY_AUTH_HTTP=' + str(code), flush=True)
    if code != 200 or auth.get('authenticated') is not True:
        print('PAIRING_REQUIRED=True', flush=True)
        print('NEXT_ACTION=Authorize printed SHA256 fingerprint in Cloudflare; do not share token.', flush=True)
        return
    if (auth.get('referenceAgentRevision') != 'sonara-https-agent-guard-v5'
            or auth.get('storageConfigured') is not True
            or auth.get('gatewayConfigured') is not True
            or auth.get('relayEnabled') is not True):
        print('RELAY_CONFIGURATION_INCOMPLETE=True', flush=True)
        print('R2/Worker/gateway must be ready before starting agent.', flush=True)
        return
    install_relay(args.revision)
    if not check_ready(token):
        print('CHECK_LOG=~/.sonara/relay-agent.log', flush=True)
    else:
        print('SONARA_AUDIO_ENGINE=READY_FOR_REAL_SITE_GENERATION', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception as exc:
        print('SONARA_BOOTSTRAP_ERROR=' + type(exc).__name__, flush=True)
        raise SystemExit(1) from None
