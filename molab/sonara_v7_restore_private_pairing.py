#!/usr/bin/env python3
"""Create or recover a PRIVATE, high-entropy MoLab relay pairing credential.

Offline-only. Does not alter ACE-Step, cloud configuration, billing, or any
active worker. Only SHA-256 FINGERPRINT is printed; NEVER print the token.
An administrator must explicitly authorize that fingerprint on Cloudflare.
"""
from __future__ import annotations

import hashlib
import os
from pathlib import Path
import secrets
import stat
import sys

ROOT = Path.home() / ".sonara"
TOKEN = ROOT / "relay.token"


def main() -> int:
    print("=== SONARA V7 - RIPRISTINO ABBINAMENTO PRIVATO ===", flush=True)
    if ROOT.is_symlink() or TOKEN.is_symlink():
        print("SONARA_PAIRING_BLOCKED=UNSAFE_SYMLINK", flush=True)
        return 1
    if not Path.home().is_dir() or Path.home().is_symlink():
        print("SONARA_PAIRING_BLOCKED=UNSAFE_HOME", flush=True)
        return 1
    # Do not silently migrate or duplicate tokens from another user's home.
    if not ROOT.exists():
        ROOT.mkdir(mode=0o700)
    if not ROOT.is_dir() or ROOT.stat().st_uid != os.getuid():
        print("SONARA_PAIRING_BLOCKED=INVALID_PRIVATE_PROFILE", flush=True)
        return 1
    ROOT.chmod(0o700)

    created = False
    if TOKEN.exists():
        info = TOKEN.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
            print("SONARA_PAIRING_BLOCKED=UNSAFE_EXISTING_CREDENTIAL", flush=True)
            return 1
        value = TOKEN.read_text(encoding="ascii").strip()
        if (len(value) < 32 or len(value) > 512 or not value.isascii()
                or any(c.isspace() for c in value)):
            print("SONARA_PAIRING_BLOCKED=INVALID_EXISTING_CREDENTIAL", flush=True)
            return 1
    else:
        value = secrets.token_urlsafe(48)
        flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0)
        fd = os.open(str(TOKEN), flags, 0o600)
        try:
            with os.fdopen(fd, "w", encoding="ascii") as handle:
                os.fchmod(handle.fileno(), 0o600)
                handle.write(value + "\n")
            created = True
        except BaseException:
            TOKEN.unlink(missing_ok=True)
            raise

    TOKEN.chmod(0o600)
    fingerprint = hashlib.sha256(value.encode("ascii")).hexdigest()
    print("SONARA_PRIVATE_PROFILE_READY=True", flush=True)
    print("SONARA_PRIVATE_TOKEN_CREATED=" + str(created), flush=True)
    print("RELAY_FINGERPRINT_SHA256=" + fingerprint, flush=True)
    print("SONARA_PAIRING_STATUS=AWAITING_CLOUDFLARE_FINGERPRINT_AUTHORIZATION", flush=True)
    print("SONARA_CUSTOMER_JOBS_CREATED=0", flush=True)
    print("SONARA_ENGINE_UNCHANGED=True", flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, UnicodeError, ValueError):
        print("SONARA_PAIRING_BLOCKED=PRIVATE_FILESYSTEM_ERROR", flush=True)
        sys.exit(1)
