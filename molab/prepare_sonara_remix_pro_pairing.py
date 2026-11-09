"""Prepare a new private, high-entropy SONARA Remix Pro relay credential.

Safe to run repeatedly on the authorized MoLab RTX PRO 6000. Never expose the
secret: print ONLY its SHA-256 fingerprint for administrator-side Cloudflare
authorization. Never start/stop ACE-Step, upload audio, or claim a job.
The authenticated queue-status probe is read-only in the existing Worker.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import secrets
import stat
import urllib.error
import urllib.request

ROOT = Path("/marimo/SONARA-REMIX-PRO")
PYTHON = ROOT / ".venv/bin/python"
HOME = Path.home() / ".sonara"
TOKEN = HOME / "relay.token"
ENDPOINT = "https://api.sonaraenterprise.com/api/sonara-relay/queue-status"


def _valid(value: str) -> bool:
    return 32 <= len(value) <= 512 and value.isascii() and not any(
        x.isspace() for x in value
    )


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def prepare():
    if not (ROOT.is_dir() and PYTHON.is_file() and
            (ROOT / "sonara_remix_pro_r2_agent.py").is_file()):
        raise RuntimeError("Private Remix Pro Python runtime missing; no credential created")
    if HOME.is_symlink() or TOKEN.is_symlink():
        raise RuntimeError("Unsafe private credential path")
    if not HOME.exists():
        HOME.mkdir(parents=True, mode=0o700)
    if not HOME.is_dir():
        raise RuntimeError("Invalid private credential directory")
    os.chmod(HOME, 0o700)

    created = False
    if TOKEN.exists():
        if not TOKEN.is_file() or not stat.S_ISREG(TOKEN.stat().st_mode):
            raise RuntimeError("Existing relay credential is not a regular file")
        value = TOKEN.read_text(encoding="ascii").strip()
        if not _valid(value):
            raise RuntimeError("Existing relay credential is invalid; refusing overwrite")
    else:
        value = secrets.token_urlsafe(48)
        if not _valid(value):
            raise RuntimeError("Secure token generator returned invalid value")
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(TOKEN, flags, 0o600)
        try:
            with os.fdopen(fd, "w", encoding="ascii") as handle:
                handle.write(value + "\n")
                handle.flush()
                os.fchmod(handle.fileno(), 0o600)
                os.fsync(handle.fileno())
            created = True
        except BaseException:
            TOKEN.unlink(missing_ok=True)
            raise
    os.chmod(TOKEN, 0o600)
    fingerprint = hashlib.sha256(value.encode("ascii")).hexdigest()
    print("SONARA_PRO_TOKEN_CREATED=" + str(created), flush=True)
    print("SONARA_PRO_TOKEN_PRIVATE=True", flush=True)
    print("SONARA_PRO_FINGERPRINT_SHA256=" + fingerprint, flush=True)
    print("SONARA_PRO_TOKEN_SECRET_NOT_DISPLAYED=True", flush=True)

    request = urllib.request.Request(
        ENDPOINT, method="GET", headers={
            "Accept": "application/json",
            "Cache-Control": "no-store",
            "User-Agent": "SONARA-Remix-Pro-Private-Pairing/1.0",
            "X-Sonara-Relay-Token": value,
            "X-Sonara-Pro-Agent-Revision": "sonara-remix-pro-r2-agent-v3-dual-reference-fusion",
        }
    )
    status = 0
    try:
        opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect()
        )
        with opener.open(request, timeout=18) as response:
            status = response.status
    except urllib.error.HTTPError as error:
        status = error.code
    except (OSError, urllib.error.URLError, TimeoutError):
        pass
    print("SONARA_PRO_READ_ONLY_AUTH_HTTP=" + str(status), flush=True)
    print("SONARA_PRO_PAIRING_REQUIRED=" + str(status != 200), flush=True)
    print("SONARA_PRO_AGENT_NOT_STARTED=True", flush=True)
    print("SONARA_NO_AUDIO_JOB_CREATED=True", flush=True)
    print("SONARA_MAIN_ACE_STEP_UNCHANGED=True", flush=True)
    return {"fingerprint": fingerprint, "authenticated": status == 200}


if __name__ == "__main__":
    prepare()
