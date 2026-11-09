"""Guarded V3 -> V4 SONARA Remix Pro handoff (MoLab only; no Vercel).

The default action is READ ONLY. --activate requires a confirmed maintenance
window and either verified private audio QA or an explicit user-authorized
waiver (--skip-audio-qa). A waived QA NEVER certifies audio fidelity. It can stop ONLY one
verified idle dedicated Remix Pro V3 worker; it never kills ACE-Step or the
main relay. It uses SHA-pinned GitHub installer bytes and fails closed.

IMPORTANT: GitHub CI does not execute this file on MoLab.
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

ROOT = Path("/marimo/SONARA-REMIX-PRO")
PYTHON = ROOT / ".venv/bin/python"
AGENT = ROOT / "sonara_remix_pro_r2_agent.py"
STATUS = Path.home() / ".sonara/remix-pro-agent-status.json"
TOKEN = Path.home() / ".sonara/relay.token"
LOG = Path.home() / ".sonara/remix-pro-v4-agent.log"
LOCK = Path.home() / ".sonara/remix-pro-agent.lock"
REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"
INSTALLER_COMMIT = "088e0229ae389070e04b5561d99083cc5d923443"
INSTALLER_BLOB = "5e75e69980e505990b8952b48e5643de8a8ebd09"
INSTALLER_URL = (
    "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/"
    + INSTALLER_COMMIT + "/molab/install_sonara_remix_quality_v4.py"
)
CAPABILITIES = "https://api.sonaraenterprise.com/api/sonara-relay/pro-capabilities"
EXPECTED_BLOBS = {
    "sonara_remix_pro_fusion.py": "4ceb90293e1d9f9b9f1c7b0916258eae1c2a3f04",
    "sonara_remix_pro_ace_bridge.py": "44d3ce740dac906481c9ecb8755a8318901f8b7f",
    "sonara_remix_pro_r2_agent.py": "fc3eaf66588ed75bf106ea93f722b8df4754039c",
    "sonara_remix_pro_quality.py": "496428a8af25492246f49d5bf25d281781d17315",
    "sonara_remix_pro_toolkit.py": "4ca1f094839f8372a5fd9c3ee8462e5470a9100d",
}
OPEN = urllib.request.build_opener(urllib.request.ProxyHandler({}))
IDLE = frozenset(("waiting_for_authorized_job", "waiting_for_pro_activation"))


class HandoffBlocked(RuntimeError):
    pass


def require(condition, message):
    if not condition:
        raise HandoffBlocked(message)


def blob_sha(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def installed_matches():
    for name, expected in EXPECTED_BLOBS.items():
        path = ROOT / name
        if not path.is_file() or path.is_symlink():
            return False
        if blob_sha(path.read_bytes()) != expected:
            return False
    return True


def env_read_only():
    require(ROOT.is_dir() and PYTHON.is_file() and AGENT.is_file(),
            "Existing isolated Remix Pro runtime is unavailable")
    require(Path(sys.executable).resolve() == PYTHON.resolve(),
            "Run only with the isolated Remix Pro Python")
    require(TOKEN.is_file(), "Existing private relay credential is missing")


def state():
    try:
        report = json.loads(STATUS.read_text(encoding="utf-8"))
        return report if isinstance(report, dict) else {}
    except (OSError, ValueError):
        return {}


def idle_reason(snapshot, now):
    if snapshot.get("revision") != REVISION:
        return "UNKNOWN_AGENT_REVISION"
    if snapshot.get("jobId") or snapshot.get("leaseId") or snapshot.get("state") == "processing":
        return "ACTIVE_JOB"
    try:
        age = now - float(snapshot.get("updatedAt") or 0)
    except (ValueError, TypeError, OverflowError):
        return "STALE_STATUS"
    if not 0 <= age <= 40:
        return "STALE_STATUS"
    if snapshot.get("state") not in IDLE:
        return "UNCONFIRMED_IDLE"
    return "CONFIRMED_IDLE"


def is_pro_pid(pid, proc=Path("/proc")):
    folder = proc / str(pid)
    try:
        args = (folder / "cmdline").read_bytes().split(bytes([0]))
        cwd = (folder / "cwd").resolve()
    except (OSError, RuntimeError):
        return False
    for raw in args[1:]:
        if not raw or b"sonara_remix_pro_r2_agent.py" not in raw:
            continue
        try:
            p = Path(os.fsdecode(raw))
            p = (p if p.is_absolute() else cwd / p).resolve()
        except (OSError, ValueError, RuntimeError):
            continue
        if p == AGENT.resolve():
            return True
    return False


def pro_pids(proc=Path("/proc")):
    try:
        items = list(proc.iterdir())
    except OSError as exc:
        raise HandoffBlocked("Cannot inspect dedicated agent processes") from exc
    return sorted(int(item.name) for item in items
                  if item.name.isdigit() and is_pro_pid(int(item.name), proc))


def previous_mode(pid, proc=Path("/proc")):
    try:
        args = (proc / str(pid) / "cmdline").read_bytes().split(bytes([0]))
    except OSError:
        return None
    words = [os.fsdecode(a) for a in args if a]
    for idx, word in enumerate(words):
        if word == "--auth-mode" and idx + 1 < len(words):
            return words[idx + 1] if words[idx + 1] in ("required", "none") else None
        if word.startswith("--auth-mode="):
            mode = word.partition("=")[2]
            return mode if mode in ("required", "none") else None
    return None


def public_capabilities():
    request = urllib.request.Request(
        CAPABILITIES,
        headers={"Cache-Control": "no-cache", "User-Agent": "SONARA-Remix-Pro-V4/1.0"},
    )
    try:
        with OPEN.open(request, timeout=15) as response:
            require(response.status == 200, "Cloudflare capabilities HTTP failure")
            data = json.loads(response.read(16000))
    except (OSError, ValueError) as exc:
        raise HandoffBlocked("Cloudflare capabilities unavailable") from exc
    require(isinstance(data, dict) and data.get("expectedAgentRevision") == REVISION,
            "Cloudflare gateway is not compatible with the V3 agent revision")
    require(data.get("available") is True and data.get("fusionAvailable") is True,
            "Public Cloudflare fusion heartbeat is not available")
    return data


def verified_installer():
    request = urllib.request.Request(
        INSTALLER_URL, headers={"User-Agent": "SONARA-Remix-Pro-V4/1.0"})
    try:
        with OPEN.open(request, timeout=30) as response:
            contents = response.read(200001)
    except OSError as exc:
        raise HandoffBlocked("Pinned installer cannot be retrieved") from exc
    require(0 < len(contents) < 200000 and blob_sha(contents) == INSTALLER_BLOB,
            "Pinned V4 installer hash mismatch")
    compile(contents, "<sha-pinned-v4-installer>", "exec")
    return contents


def stop_if_confirmed_idle(pid):
    require(is_pro_pid(pid), "Dedicated worker process identity changed")
    require(idle_reason(state(), time.time()) == "CONFIRMED_IDLE",
            "Dedicated worker is not confirmed idle; no stop")
    time.sleep(2)
    require(is_pro_pid(pid), "Dedicated worker process identity changed")
    require(idle_reason(state(), time.time()) == "CONFIRMED_IDLE",
            "Dedicated worker became busy; no stop")
    os.kill(pid, signal.SIGTERM)
    until = time.monotonic() + 35
    while time.monotonic() < until:
        if not is_pro_pid(pid):
            return
        time.sleep(1)
    raise HandoffBlocked("Agent did not exit gracefully; no forced termination")


def install_verified(data):
    with tempfile.TemporaryDirectory(prefix="sonara-v4-pinned-") as folder:
        target = Path(folder) / "install.py"
        target.write_bytes(data)
        target.chmod(0o600)
        try:
            proc = subprocess.run(
                [str(PYTHON), str(target), "--install"],
                stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=180)
        except (OSError, subprocess.SubprocessError) as exc:
            raise HandoffBlocked("Private V4 installation could not complete") from exc
        require(proc.returncode == 0 and "SONARA_INSTALL_RESULT=SUCCESS" in proc.stdout,
                "Private V4 installation failed; review restricted backup logs")
    require(installed_matches(), "Installed module hashes do not match pinned V4")


def engine_preflight():
    try:
        proc = subprocess.run(
            [str(PYTHON), str(AGENT), "--preflight"],
            stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=180)
    except (OSError, subprocess.SubprocessError) as exc:
        raise HandoffBlocked("GPU and authenticated gateway preflight failed") from exc
    require(proc.returncode == 0
            and "PRO_GPU_VERIFIED=True" in proc.stdout
            and "PRO_AGENT_AUTHENTICATED=True" in proc.stdout
            and "PRO_AGENT_REVISION=" + REVISION in proc.stdout,
            "GPU/auth/agent preflight did not pass")


def start_worker(mode):
    LOG.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with LOG.open("ab") as logfile:
        os.chmod(LOG, 0o600)
        proc = subprocess.Popen(
            [str(PYTHON), str(AGENT), "--auth-mode", mode],
            stdin=subprocess.DEVNULL,
            stdout=logfile, stderr=subprocess.STDOUT,
            cwd=ROOT, start_new_session=True, close_fds=True,
        )
    return proc


def wait_ready(proc, started):
    until = time.monotonic() + 75
    while time.monotonic() < until:
        require(proc.poll() is None, "New V4 worker exited; inspect private log")
        snapshot = state()
        if (snapshot.get("revision") == REVISION
                and snapshot.get("state") in IDLE
                and int(snapshot.get("updatedAt") or 0) >= int(started)):
            caps = public_capabilities()
            if caps.get("available") is True and caps.get("fusionAvailable") is True:
                return
        time.sleep(3)
    raise HandoffBlocked("V4 worker did not establish a fresh authenticated heartbeat")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Guarded SONARA Pro V3 -> V4 handoff")
    parser.add_argument("--preflight", action="store_true", help="Read-only inspection, default")
    parser.add_argument("--activate", action="store_true", help="Deliberate guarded update")
    parser.add_argument("--confirm-maintenance", action="store_true")
    parser.add_argument("--confirm-audio-qa", action="store_true",
                        help="Only if real A+B audio QA was actually completed")
    parser.add_argument("--skip-audio-qa", action="store_true",
                        help="Explicitly waive A+B listening QA, never claim audio quality")
    parser.add_argument("--auth-mode", choices=("auto", "none", "required"), default="auto")
    opts = parser.parse_args(argv)
    if opts.activate:
        require(opts.confirm_maintenance,
                "No activation without a confirmed maintenance window")
        require(opts.confirm_audio_qa != opts.skip_audio_qa,
                "Select either actually completed audio QA or explicit --skip-audio-qa waiver")
    env_read_only()
    running = pro_pids()
    require(len(running) <= 1, "Multiple dedicated workers detected")
    print("SONARA_V4_INSTALLED_ON_DISK=" + str(installed_matches()), flush=True)
    print("SONARA_V4_PRO_AGENT_PROCESS_COUNT=" + str(len(running)), flush=True)
    print("SONARA_V4_AUDIO_GENERATED=False", flush=True)
    if not opts.activate:
        print("SONARA_V4_ACTIVATION_PERFORMED=False", flush=True)
        return
    if installed_matches():
        raise HandoffBlocked("V4 is already present on disk: runtime verification required")
    if opts.skip_audio_qa:
        print("SONARA_V4_AUDIO_QA_WAIVED_BY_USER=True", flush=True)
        print("SONARA_V4_ARTISTIC_QUALITY_NOT_VERIFIED=True", flush=True)
    # Verify BOTH the immutable bytes and public gateway BEFORE touching worker.
    payload = verified_installer()
    public_capabilities()
    prior = previous_mode(running[0]) if running else None
    mode = opts.auth_mode if opts.auth_mode != "auto" else prior
    require(mode in ("required", "none"),
            "Cannot infer local ACE-Step auth mode; provide --auth-mode")
    if prior is not None:
        require(mode == prior,
                "Requested auth mode differs from the active worker; refusing unsafe handoff")
    if running:
        stop_if_confirmed_idle(running[0])
    require(not pro_pids(), "Dedicated worker is still running; install refused")
    install_verified(payload)
    engine_preflight()
    started = time.time()
    worker = start_worker(mode)
    wait_ready(worker, started)
    print("SONARA_V4_INSTALLED_HASHES_VERIFIED=True", flush=True)
    print("SONARA_V4_WORKER_READY=True", flush=True)
    print("SONARA_MAIN_ACE_STEP_UNCHANGED=True", flush=True)
    print("SONARA_SITE_DEPLOY_PERFORMED=False", flush=True)


if __name__ == "__main__":
    try:
        main()
    except (HandoffBlocked, OSError, ValueError, subprocess.SubprocessError) as error:
        print("SONARA_V4_HANDOFF=BLOCKED", flush=True)
        print("SONARA_V4_ERROR_CLASS=" + type(error).__name__, flush=True)
        raise SystemExit(2)
