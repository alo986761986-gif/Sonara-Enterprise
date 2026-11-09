"""Guarded one-run activation of SONARA Remix Pro Musical Coherence V2.

On the existing private MoLab RTX PRO 6000. The currently working independent
V3 agent is gracefully stopped ONLY when fresh state says it is idle, and
no customer job is in progress. No kill -9, no ACE-Step restarts, no main relay.
No artificial jobs or sample audio are generated. Pins installer by Git blob SHA.
"""
from __future__ import annotations
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path("/marimo/SONARA-REMIX-PRO")
PYTHON = ROOT / ".venv/bin/python"
AGENT = ROOT / "sonara_remix_pro_r2_agent.py"
PRIVATE = Path.home() / ".sonara"
TOKEN = PRIVATE / "relay.token"
STATUS = PRIVATE / "remix-pro-agent-status.json"
LOCK = PRIVATE / "remix-pro-agent.lock"
LOG = PRIVATE / "remix-pro-v3-agent.log"
CAPABILITIES = "https://api.sonaraenterprise.com/api/sonara-relay/pro-capabilities"
REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"
INSTALLER_COMMIT = "c948f09cf78a06347bcda49352262cb7fccd75e3"
INSTALLER_SHA = "001a331102f299d776ecd8a9ea4a9f010dfacfc7"
INSTALLER_URL = (
    "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/"
    + INSTALLER_COMMIT + "/molab/install_sonara_remix_quality_v2.py"
)
IDLE = frozenset(("waiting_for_authorized_job", "waiting_for_pro_activation"))
MAX_AGE = 45.0
STOP_SECONDS = 70
START_SECONDS = 90


class ActivationError(RuntimeError):
    pass


def require(ok, message):
    if not ok:
        raise ActivationError(message)


def git_blob_sha(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def read_status():
    try:
        content = json.loads(STATUS.read_text())
        return content if isinstance(content, dict) else {}
    except (OSError, ValueError):
        return {}


def safely_idle(status, now):
    if status.get("revision") != REVISION:
        return "WRONG_AGENT_REVISION"
    if status.get("jobId") or status.get("state") == "processing":
        return "ACTIVE_JOB"
    try:
        age = now - float(status.get("updatedAt", 0))
    except (TypeError, ValueError):
        return "STALE_STATUS"
    if not (0 <= age <= MAX_AGE):
        return "STALE_STATUS"
    return "IDLE" if status.get("state") in IDLE else "UNKNOWN_STATE"


def process_argv(pid):
    try:
        return [os.fsdecode(a) for a in
                (Path("/proc") / str(pid) / "cmdline").read_bytes().split(b"\0") if a]
    except OSError:
        return []


def is_dedicated(pid):
    proc = Path("/proc") / str(pid)
    try:
        cwd = (proc / "cwd").resolve(strict=True)
    except OSError:
        return False
    for name in process_argv(pid)[1:]:
        try:
            candidate = Path(name)
            if not candidate.is_absolute():
                candidate = cwd / candidate
            if candidate.resolve(strict=True) == AGENT.resolve(strict=True):
                return True
        except (OSError, ValueError):
            pass
    return False


def dedicated_processes():
    try:
        processes = list(Path("/proc").iterdir())
    except OSError as exc:
        raise ActivationError("Cannot examine local process table") from exc
    return sorted(int(p.name) for p in processes
                  if p.name.isdigit() and is_dedicated(int(p.name)))


def choose_auth_mode(args):
    for i, arg in enumerate(args):
        if arg == "--auth-mode" and i + 1 < len(args) and args[i+1] in ("none", "required"):
            return args[i+1]
        if arg.startswith("--auth-mode=") and arg.split("=", 1)[1] in ("none", "required"):
            return arg.split("=", 1)[1]
    # Do not change the previous agent's authentication mode without evidence.
    return "required" if Path("/home/marimo/ACE-STEP/.sonara-api-key").is_file() else "none"


def capabilities():
    req = urllib.request.Request(CAPABILITIES,
        headers={"User-Agent": "SONARA-Remix-V2-Quality-Activator/1.0",
                 "Cache-Control": "no-store"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=18) as response:
            require(response.status == 200, "Live Remix Pro gateway unavailable")
            raw = response.read(16001)
        require(len(raw) < 16000, "Unexpected oversized capability document")
        body = json.loads(raw)
    except (OSError, ValueError, urllib.error.URLError) as exc:
        raise ActivationError("Cannot verify existing live Remix Pro V3 gateway") from exc
    require(body.get("expectedAgentRevision") == REVISION,
            "Production gateway expects a different agent; refuse V2 upgrade")
    return body


def verified_installer():
    req = urllib.request.Request(INSTALLER_URL,
        headers={"User-Agent": "SONARA-Remix-V2-Quality-Activator/1.0"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=35) as response:
            data = response.read(200001)
    except (OSError, urllib.error.URLError) as exc:
        raise ActivationError("Cannot download pinned V2 installer") from exc
    require(data and len(data) <= 200000 and git_blob_sha(data) == INSTALLER_SHA,
            "Pinned installer integrity verification failed")
    compile(data.decode("utf-8"), "install_sonara_remix_quality_v2.py", "exec")
    return data


def graceful_stop_confirmed_idle(pid):
    require(safely_idle(read_status(), time.time()) == "IDLE",
            "Remix Pro has work or uncertain state: refuse to stop worker")
    require(is_dedicated(pid), "Dedicated worker process identity changed")
    time.sleep(2)
    require(dedicated_processes() == [pid] and
            safely_idle(read_status(), time.time()) == "IDLE",
            "Remix Pro state changed during safe handoff")
    print("SONARA_PRO_V3_GRACEFUL_HANDOFF=START", flush=True)
    os.kill(pid, signal.SIGTERM)
    until = time.monotonic() + STOP_SECONDS
    while time.monotonic() < until:
        if not is_dedicated(pid):
            print("SONARA_PRO_V3_GRACEFUL_HANDOFF=COMPLETE", flush=True)
            return
        time.sleep(1)
    raise ActivationError("Dedicated worker did not exit gracefully; never force-killed")


def installer_in_private_env(installer):
    with tempfile.TemporaryDirectory(prefix="sonara-quality-v2-") as td:
        local = Path(td) / "install.py"
        local.write_bytes(installer)
        local.chmod(0o600)
        result = subprocess.run([str(PYTHON), str(local), "--install"],
                                capture_output=True, text=True, timeout=210)
    # The installer emits only a fixed set of non-secret markers. Do not log
    # arbitrary stdout/stderr, customer information, or private audio paths.
    require(result.returncode == 0 and
            "SONARA_QUALITY_INSTALL_RESULT=SUCCESS" in result.stdout,
            "Pinned installation failed; inspect isolated MoLab backup directory")
    print("SONARA_QUALITY_INSTALL_RESULT=SUCCESS", flush=True)


def preflight_agent():
    result = subprocess.run([str(PYTHON), str(AGENT), "--preflight"],
                            capture_output=True, text=True, timeout=180,
                            cwd=str(ROOT))
    for line in result.stdout.splitlines():
        if line.startswith(("PRO_GPU_VERIFIED=", "PRO_AGENT_AUTHENTICATED=",
                            "PRO_AGENT_REVISION=", "PRO_SITE_GENERATION_AVAILABLE=")):
            print(line, flush=True)
    require(result.returncode == 0 and
            "PRO_GPU_VERIFIED=True" in result.stdout and
            "PRO_AGENT_AUTHENTICATED=True" in result.stdout and
            "PRO_AGENT_REVISION=" + REVISION in result.stdout,
            "New dedicated GPU worker preflight failed")


def start_dedicated(mode):
    with LOG.open("ab") as out:
        os.chmod(LOG, 0o600)
        return subprocess.Popen(
            [str(PYTHON), str(AGENT), "--auth-mode", mode],
            stdin=subprocess.DEVNULL, stdout=out, stderr=subprocess.STDOUT,
            cwd=str(ROOT), start_new_session=True, close_fds=True)


def verify_ready(process, launched_at):
    until = time.monotonic() + START_SECONDS
    while time.monotonic() < until:
        if process.poll() is not None:
            raise ActivationError("Dedicated worker exited early; original ACE-Step not touched")
        state = read_status()
        age = time.time() - float(state.get("updatedAt") or 0)
        if (state.get("revision") == REVISION and
                float(state.get("updatedAt") or 0) >= launched_at - 3 and
                0 <= age <= 45 and
                state.get("state") in (IDLE | frozenset(("processing",)))):
            response = capabilities()
            if response.get("available") is True and response.get("fusionAvailable") is True:
                print("SONARA_REMIX_QUALITY_V2_AGENT_RUNNING=True", flush=True)
                print("SONARA_V3_GATEWAY_PRESERVED=True", flush=True)
                print("SONARA_MOLAB_MAIN_ACE_STEP_UNTOUCHED=True", flush=True)
                print("SONARA_MAIN_RELAY_UNTOUCHED=True", flush=True)
                print("SONARA_AUDIO_GENERATION_TEST_RUN=False", flush=True)
                return
        time.sleep(3)
    raise ActivationError("New quality agent readiness unconfirmed; no GPU test run")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Guarded SONARA Remix Pro quality activation")
    parser.add_argument("--activate", action="store_true")
    args = parser.parse_args(argv)
    require(ROOT.is_dir() and PYTHON.is_file() and AGENT.is_file() and TOKEN.is_file(),
            "Existing isolated SONARA Remix Pro GPU runtime not found")
    require(Path(sys.executable).resolve() == PYTHON.resolve(),
            "Must run with the isolated SONARA Remix Pro Python venv")
    cap = capabilities()
    require(cap.get("available") is True and cap.get("fusionAvailable") is True,
            "Live Remix Pro not ready; refuse to modify a working agent")
    active = dedicated_processes()
    require(len(active) == 1, "Expected exactly one currently functioning V3 agent")
    status = read_status()
    reason = safely_idle(status, time.time())
    print("SONARA_QUALITY_ACTIVATION=PREPARED", flush=True)
    print("SONARA_PRO_AGENT_IDLE=" + str(reason == "IDLE"), flush=True)
    if not args.activate:
        print("SONARA_INSTALLATION_PERFORMED=False", flush=True)
        print("SONARA_NEXT_ACTION=RUN_WITH_ACTIVATE_ONLY_WHEN_IDLE", flush=True)
        return
    require(reason == "IDLE", "Active job or uncertain V3 state: no changes")
    installer = verified_installer()  # downloaded before stopping the agent
    previous_mode = choose_auth_mode(process_argv(active[0]))
    graceful_stop_confirmed_idle(active[0])
    require(not dedicated_processes(), "A dedicated agent remains active")
    installer_in_private_env(installer)
    preflight_agent()
    launched = time.time()
    process = start_dedicated(previous_mode)
    verify_ready(process, launched)


if __name__ == "__main__":
    try:
        main()
    except (ActivationError, OSError, subprocess.SubprocessError) as exc:
        print("SONARA_QUALITY_V2_ACTIVATION=BLOCKED", flush=True)
        print("SONARA_REASON=" + str(exc), flush=True)
        raise SystemExit(1)
