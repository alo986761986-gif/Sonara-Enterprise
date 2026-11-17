#!/usr/bin/env python3
"""Guarded V6 fresh restore + direct V10 GPU handoff for the paired MoLab notebook.

This is for a NEW, empty private Remix Pro root or an exactly pinned fresh V6
worker. It never changes main ACE-Step, secrets, Cloudflare, R2 or billing.
No customer job is created. No generated audio is claimed as verified.
Only explicitly pinned source versions are accepted; otherwise abort.
"""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import signal
import stat
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path("/marimo/SONARA-REMIX-PRO")
HOME = Path.home() / ".sonara"
TOKEN = HOME / "relay.token"
STATUS = HOME / "remix-pro-agent-status.json"
LOG = HOME / "remix-pro-v6-agent.log"
LOCK = HOME / "remix-pro-v10-fresh-handoff.lock"
AGENT = ROOT / "sonara_remix_pro_r2_agent.py"
VENV = ROOT / ".venv"
AGENT_REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"
ACE_HEALTH = "http://127.0.0.1:8001/health"
RELAY = "https://api.sonaraenterprise.com/api/sonara-relay"
COMMIT = "82a4e29e7ba8e509bddcbcdb9e76732e79c967eb"
BASE = "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/" + COMMIT + "/molab/"
RECOVERY = "sonara_remix_pro_v6_fresh_recovery.py"
RECOVERY_SHA = "67ba74a5d60fec60cd655ae39b20bcebabeeb8a3"

# Known exact V6-fresh baseline SHA and pinned V10 target SHA (Git blob SHA-1).
# Missing files are only permitted for new V7-V10 modules.
MODULES = {
    "sonara_remix_pro_fusion.py":
        ("073e73b0f418e91bd48e8bfbe084ba6f31cef847", "cd74e3f1d1a5a7aae98d00fb278fac22475020d5"),
    "sonara_remix_pro_v5.py":
        ("41eaac9cba28ca34a6e916ec6d79fc820739b4e6", "8c57cdffa1f22571c0a56673820e1920b2bf7934"),
    "sonara_remix_pro_v6.py":
        ("5de2895488e80ebe46dfee2898888df6680be4a5", "d8a99ea30b93cf47f1befee3c8c45b3ad630a597"),
    "sonara_remix_pro_r2_agent.py":
        ("363327ccbe0e2d48f61e5d83be2779440726bdbc", "d763d2df4e97f49232d738611e0bda95f380867e"),
    "sonara_remix_pro_a_clock_fusion.py":
        ("28a5cdfd3729c68f4a0a93b55b01bb3b0f83a360", "13e7009ae690d3f442f203a1ee91f47eb3274934"),
    "sonara_remix_pro_v7.py":
        (None, "3ddd13f6e0211e6dcab942d886ae36993384158a"),
    "sonara_remix_pro_v7_rhythm.py":
        (None, "a39cad47b8b9f618912511166f8d5d2e552f3896"),
    "sonara_remix_pro_songform.py":
        (None, "6f19036c27248419e54a9286ac88ef2451e9d225"),
    "sonara_remix_pro_music_director.py":
        (None, "7778066b0a3030a94d633da99568206b1bcc8ae7"),
    "sonara_remix_pro_v10_music_profile.py":
        (None, "4c68b92a8f553df12a2dfb7f1d284ac7483eadf2"),
}
PRESERVED_V6 = {
    "sonara_remix_pro_toolkit.py": "4ca1f094839f8372a5fd9c3ee8462e5470a9100d",
    "sonara_remix_pro_ace_bridge.py": "72bdb9b36792127d27340660d2c738c64de6c1f8",
    "sonara_remix_pro_quality.py": "7e4e0f6c608e02063b3bac689b5b35a5b91bbef5",
    "sonara_remix_pro_original_voices.py": "93927ebacb2fcf86ea9397abfd31df1824b4c180",
    "sonara_remix_pro_gpu_setup.py": "e3e1b9bf461b357602d2aee87b638dda663e59b8",
}


class Blocked(RuntimeError):
    pass


def blob(raw):
    return None if raw is None else hashlib.sha1(
        b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()


def fetch(name, expected_sha):
    if not name.endswith(".py") or name.startswith(".") or "/" in name:
        raise Blocked("Unsafe pinned source name")
    req = urllib.request.Request(
        BASE + name, headers={"User-Agent": "SONARA-MoLab-V10-Fresh/1.0"}
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        raw = response.read(350001)
    if not 1 <= len(raw) <= 350000 or blob(raw) != expected_sha:
        raise Blocked("Pinned file integrity mismatch: " + name)
    compile(raw, name, "exec")
    return raw


def safe_token():
    if HOME.is_symlink() or TOKEN.is_symlink():
        raise Blocked("Unsafe private token path")
    if not TOKEN.is_file():
        raise Blocked("Existing MoLab relay token not found; do not create a new one")
    info = TOKEN.stat()
    if not stat.S_ISREG(info.st_mode) or info.st_uid != os.getuid():
        raise Blocked("Untrusted local relay token")
    value = TOKEN.read_text(encoding="ascii").strip()
    if len(value) not in range(32, 513) or not value.isascii() or any(x.isspace() for x in value):
        raise Blocked("Invalid local relay token")
    return value


def verify_pairing(token):
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    req = urllib.request.Request(
        RELAY + "/auth", headers={
            "Accept": "application/json",
            "X-Sonara-Relay-Token": token,
            "X-Sonara-Agent-Revision": "sonara-https-agent-guard-v5",
            "User-Agent": "SONARA-RTX6000-Paired/1.0",
        }
    )
    try:
        with opener.open(req, timeout=25) as response:
            data = json.load(response)
            if response.status != 200 or data.get("authenticated") is not True:
                raise Blocked("Cloudflare authentication not confirmed")
    except urllib.error.HTTPError as exc:
        raise Blocked("Cloudflare pairing HTTP " + str(exc.code)
                      + " (authorize existing fingerprint; do not rotate token)") from exc
    print("SONARA_V10_CLOUDFLARE_AUTH_HTTP=200", flush=True)
    print("SONARA_V10_PAIRING_AUTHENTICATED=True", flush=True)


def verify_ace():
    with urllib.request.urlopen(ACE_HEALTH, timeout=15) as response:
        data = json.load(response)
    data = data.get("data", data)
    if not isinstance(data, dict) or not all([
        data.get("models_initialized") is True,
        data.get("llm_initialized") is True,
        data.get("loaded_model") == "acestep-v15-xl-turbo",
        data.get("loaded_lm_model") == "acestep-5Hz-lm-4B",
    ]):
        raise Blocked("ACE-Step XL Turbo and LM 4B must both be ready")
    print("SONARA_V10_ACE_STEP_UNCHANGED_READY=True", flush=True)


def worker_pids():
    found = []
    for proc in Path("/proc").iterdir():
        if not proc.name.isdigit():
            continue
        try:
            cwd = (proc / "cwd").resolve(strict=True)
            args = (proc / "cmdline").read_bytes().split(b"\0")
            for arg in args[1:]:
                if b"sonara_remix_pro_r2_agent.py" not in arg:
                    continue
                name = Path(os.fsdecode(arg))
                full = (name if name.is_absolute() else cwd / name).resolve()
                if full == AGENT.resolve():
                    found.append(int(proc.name))
                    break
        except (OSError, RuntimeError, ValueError):
            continue
    return sorted(set(found))


def read_status():
    if STATUS.is_symlink():
        raise Blocked("Unsafe status symlink")
    try:
        data = json.loads(STATUS.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def idle(pid):
    d = read_status()
    try:
        age = time.time() - float(d.get("updatedAt") or 0)
    except (TypeError, ValueError):
        return False
    jobs = ROOT / "private-jobs"
    if jobs.is_symlink():
        raise Blocked("Unsafe private-jobs symlink")
    if jobs.is_dir() and any(p.is_dir() for p in jobs.iterdir()):
        return False
    return (
        worker_pids() == [pid]
        and d.get("state") == "waiting_for_authorized_job"
        and d.get("revision") == AGENT_REVISION
        and not d.get("jobId") and not d.get("leaseId")
        and 0 <= age <= 25
    )


def two_idle_heartbeats(pid):
    seen = None
    deadline = time.monotonic() + 95
    while time.monotonic() < deadline:
        if worker_pids() != [pid]:
            raise Blocked("Remix Pro worker changed during maintenance")
        if idle(pid):
            timestamp = read_status().get("updatedAt")
            if seen is not None and timestamp != seen:
                return
            seen = timestamp
        else:
            seen = None
        time.sleep(2)
    raise Blocked("Two fresh idle worker heartbeats not observed")


def private_python():
    if VENV.is_symlink() or not (VENV / "pyvenv.cfg").is_file():
        raise Blocked("Private Remix Pro environment unavailable")
    for name in ("python", "python3", "python3.12", "python3.13"):
        candidate = VENV / "bin" / name
        if not candidate.is_file() or not os.access(candidate, os.X_OK):
            continue
        p = subprocess.run(
            [str(candidate), "-c",
             "import pathlib,sys; print(pathlib.Path(sys.prefix).resolve())"],
            cwd=ROOT, capture_output=True, text=True, timeout=20,
        )
        if p.returncode == 0 and p.stdout.strip() == str(VENV.resolve()):
            return candidate
    raise Blocked("Private interpreter did not match isolated venv")


def read_modules():
    previous = {}
    for name, (before, after) in MODULES.items():
        path = ROOT / name
        if path.is_symlink():
            raise Blocked("Unsafe module symlink: " + name)
        raw = path.read_bytes() if path.is_file() else None
        sha = blob(raw)
        if sha not in (before, after):
            raise Blocked("Unrecognized Remix Pro version: " + name)
        previous[name] = raw
    for name, expected in PRESERVED_V6.items():
        file = ROOT / name
        if file.is_symlink() or not file.is_file() or blob(file.read_bytes()) != expected:
            raise Blocked("Missing or unrecognized protected V6 dependency: " + name)
    old = all(blob(previous[n]) == expected[0] for n, expected in MODULES.items())
    new = all(blob(previous[n]) == expected[1] for n, expected in MODULES.items())
    if not old and not new:
        raise Blocked("Mixed Remix Pro module versions; refusing unsafe partial upgrade")
    return previous, new


def atomic(name, raw):
    fd, temp = tempfile.mkstemp(prefix=".sonara-v10-fresh-", dir=ROOT)
    try:
        with os.fdopen(fd, "wb") as output:
            output.write(raw)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temp, 0o600)
        os.replace(temp, ROOT / name)
    finally:
        Path(temp).unlink(missing_ok=True)


def get_auth_mode(pid):
    args = [os.fsdecode(x) for x in (Path("/proc") / str(pid) / "cmdline").read_bytes().split(b"\0") if x]
    for i, text in enumerate(args):
        if text == "--auth-mode" and i + 1 < len(args):
            mode = args[i + 1]
            break
        if text.startswith("--auth-mode="):
            mode = text.split("=", 1)[1]
            break
    else:
        mode = "required"
    if mode not in ("none", "required"):
        raise Blocked("Unrecognized private authorization mode")
    return mode


def launch(py, mode):
    with LOG.open("ab") as output:
        return subprocess.Popen(
            [str(py), str(AGENT), "--auth-mode", mode],
            cwd=ROOT, stdin=subprocess.DEVNULL,
            stdout=output, stderr=subprocess.STDOUT, start_new_session=True,
        )


def stop_idle_worker(pid):
    if not idle(pid):
        raise Blocked("A customer job may be active; refusing worker restart")
    os.kill(pid, signal.SIGTERM)
    deadline = time.monotonic() + 35
    while pid in worker_pids() and time.monotonic() < deadline:
        time.sleep(1)
    if worker_pids():
        raise Blocked("Worker still alive; refusing module replacement")


def wait_for_worker(pid, *, since, seconds=80):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        pids = worker_pids()
        state = read_status()
        if (pids == [pid] and state.get("state") == "waiting_for_authorized_job"
                and state.get("revision") == AGENT_REVISION
                and float(state.get("updatedAt") or 0) >= since):
            return True
        if pid not in pids:
            return False
        time.sleep(2)
    return False


def site_caps():
    req = urllib.request.Request(RELAY + "/pro-capabilities",
        headers={"Accept": "application/json",
                 "Cache-Control": "no-cache",
                 "User-Agent": "SONARA-Remix-Pro-Agent/1.0 (+https://sonaraenterprise.com)"})
    with urllib.request.urlopen(req, timeout=20) as reply:
        return json.load(reply)


def restore_fresh_v6():
    print("SONARA_V10_FRESH_V6_RESTORE_START=True", flush=True)
    raw = fetch(RECOVERY, RECOVERY_SHA)
    with tempfile.TemporaryDirectory(prefix="sonara-pro-v6-") as temporary:
        installer = Path(temporary) / RECOVERY
        installer.write_bytes(raw)
        for args in ([], ["--activate"]):
            label = "V6_PREFLIGHT" if not args else "V6_INSTALL"
            print("SONARA_STAGE=" + label, flush=True)
            result = subprocess.Popen(
                [sys.executable, str(installer)] + args,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True, bufsize=1,
            )
            assert result.stdout is not None
            for line in result.stdout:
                # Never echo credentials; installers emit allowlisted status lines.
                if line.startswith(("SONARA_", "PRO_",
                                    "NO_CUSTOMER_AUDIO_JOB_CREATED_BY_INSTALLER=")):
                    print(line.rstrip()[:240], flush=True)
            if result.wait() != 0:
                raise Blocked("Fresh V6 " + label + " failed; read private notebook log")


def upgrade():
    previous, installed = read_modules()
    py = private_python()
    pids = worker_pids()
    if len(pids) != 1 or not idle(pids[0]):
        raise Blocked("Expected exactly one idle worker before V10 handoff")
    if installed:
        print("SONARA_V10_ALREADY_INSTALLED=True", flush=True)
        return pids[0]
    print("SONARA_V10_FRESH_HANDOFF_SOURCE_VERIFY=START", flush=True)
    incoming = {name: fetch(name, target) for name, (_, target) in MODULES.items()}
    print("SONARA_V10_FRESH_HANDOFF_FILES_VERIFIED=" + str(len(incoming)), flush=True)
    pid = pids[0]
    two_idle_heartbeats(pid)
    with LOCK.open("a+") as lock:
        os.chmod(LOCK, 0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise Blocked("Another V10 maintenance is in progress") from exc
        if not idle(pid) or any(
            (ROOT / name).read_bytes() != raw
            for name, raw in previous.items() if raw is not None
        ):
            raise Blocked("Worker or files changed during preparation")
        mode = get_auth_mode(pid)
        time.sleep(2)
        stop_idle_worker(pid)
        child = None
        try:
            for name, raw in incoming.items():
                atomic(name, raw)
            checks = (
                "import sonara_remix_pro_r2_agent as a; "
                "p=a.pro_heartbeat_payload(); "
                "assert all(p[k] is True for k in ("
                "'v5Ready','v6Ready','v7Ready','v7RhythmReady',"
                "'v7CreativeModesReady','v8SongFormReady',"
                "'v9MusicDirectorReady','v10MusicEvidenceReady')); "
                "print('SONARA_V10_PRIVATE_IMPORTS_VERIFIED=True')"
            )
            smoke = subprocess.run(
                [str(py), "-c", checks], cwd=ROOT,
                capture_output=True, text=True, timeout=90,
            )
            if smoke.returncode != 0:
                raise Blocked("Fresh V10 private imports failed; rollback required")
            print(smoke.stdout.strip(), flush=True)
            since = time.time()
            child = launch(py, mode)
            if not wait_for_worker(child.pid, since=since):
                raise Blocked("Fresh V10 worker heartbeat not confirmed")
            print("SONARA_V10_LOCAL_GPU_WORKER_PID=" + str(child.pid), flush=True)
            print("SONARA_V10_LOCAL_GPU_READY=True", flush=True)
            return child.pid
        except Exception:
            if child is not None and child.poll() is None:
                print("SONARA_V10_WORKER_ALIVE_ROLLBACK_BLOCKED=True", flush=True)
                raise
            for name, raw in previous.items():
                if raw is None:
                    (ROOT / name).unlink(missing_ok=True)
                else:
                    atomic(name, raw)
            restored = launch(py, mode)
            print("SONARA_V10_ROLLBACK_TO_V6=True", flush=True)
            print("SONARA_V6_RESTORED_PID=" + str(restored.pid), flush=True)
            raise


def activate():
    print("=== SONARA REMIX PRO V10 - PAIRED FRESH MOLAB ACTIVATION ===", flush=True)
    if ROOT.is_symlink() or HOME.is_symlink() or LOCK.is_symlink():
        raise Blocked("Unsafe private directory or lock path")
    verify_ace()
    verify_pairing(safe_token())
    if ROOT.exists() and not ROOT.is_dir():
        raise Blocked("Unexpected Remix Pro root")
    if not ROOT.exists():
        restore_fresh_v6()
    pid = upgrade()
    try:
        caps = site_caps()
    except (OSError, ValueError, TimeoutError):
        caps = {}
    print("SONARA_V10_SITE_AVAILABLE=" + str(caps.get("available") is True), flush=True)
    print("SONARA_V9_SITE_AVAILABLE=" + str(caps.get("v9MusicDirectorAvailable") is True), flush=True)
    print("SONARA_V10_SITE_EVIDENCE_AVAILABLE=" + str(caps.get("v10MusicEvidenceAvailable") is True), flush=True)
    if (caps.get("available") is True and caps.get("v9MusicDirectorAvailable") is True
            and caps.get("v10MusicEvidenceAvailable") is True):
        print("SONARA_V10_ACTIVATION=SUCCESS", flush=True)
    else:
        print("SONARA_V10_ACTIVATION=LOCAL_READY_SITE_NOT_CONFIRMED", flush=True)
    print("SONARA_ACE_STEP_UNCHANGED=True", flush=True)
    print("NO_CUSTOMER_AUDIO_JOB_CREATED=True", flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--activate", action="store_true")
    parser.add_argument("--confirm-maintenance", action="store_true")
    args = parser.parse_args()
    if args.activate and args.confirm_maintenance:
        activate()
        return
    print("=== SONARA V10 FRESH MOLAB READ-ONLY PREFLIGHT ===", flush=True)
    verify_ace()
    verify_pairing(safe_token())
    print("SONARA_PRIVATE_ROOT_PRESENT=" + str(ROOT.is_dir()), flush=True)
    if ROOT.is_dir():
        old, installed = read_modules()
        print("SONARA_V10_ALREADY_INSTALLED=" + str(installed), flush=True)
        print("SONARA_PRIVATE_WORKER_COUNT=" + str(len(worker_pids())), flush=True)
    print("SONARA_V10_FRESH_PREFLIGHT_OK=True", flush=True)
    print("SONARA_V10_NEXT=--activate --confirm-maintenance", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (Blocked, OSError, ValueError, TimeoutError,
            SyntaxError, subprocess.SubprocessError) as exc:
        print("SONARA_V10_FRESH_HANDOFF_BLOCKED=" + type(exc).__name__, flush=True)
        if isinstance(exc, Blocked):
            print("SONARA_V10_FRESH_REASON=" + str(exc)[:190], flush=True)
        sys.exit(1)
