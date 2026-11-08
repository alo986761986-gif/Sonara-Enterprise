"""SONARA Remix Pro V3: single-run, guarded A+B activation on the EXISTING MoLab GPU.

Run using the existing /marimo/SONARA-REMIX-PRO/.venv/bin/python.
Only the isolated Remix Pro agent and its four version-pinned modules are
touched. NEVER restarts main ACE-Step, the main relay, or Cloudflare.
No generation, no billable job, no credentials printed.

--activate: if a V2 Pro worker is idle, gracefully hand it off; verify and
install pinned V3 modules; perform authenticated GPU heartbeat; run the
independent V3 worker; check the public Cloudflare readiness signal.

A GitHub commit or Cloudflare deployment does NOT execute this script on MoLab.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
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
STATUS = PRIVATE / "remix-pro-agent-status.json"
TOKEN = PRIVATE / "relay.token"
LOG = PRIVATE / "remix-pro-v3-agent.log"
EXPECTED_REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"
INSTALLER_COMMIT = "f56de2fa63385570082e7b4e2f070c0ca711e3b1"
INSTALLER_SHA = "4707ea856d294732a0eaab91a339db2fa0cc6b86"
INSTALLER_URL = (
    "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/"
    + INSTALLER_COMMIT + "/molab/install_sonara_remix_fusion_v3.py"
)
CAPABILITY_URL = "https://api.sonaraenterprise.com/api/sonara-relay/pro-capabilities"
IDLE_STATES = frozenset(("waiting_for_authorized_job", "waiting_for_pro_activation"))
STOP_SECONDS = 36


class ActivationError(RuntimeError):
    pass


def check(condition, msg):
    if not condition:
        raise ActivationError(msg)


def read_status():
    try:
        data = json.loads(STATUS.read_text())
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def is_pro_process(pid):
    """Only the dedicated Python agent is eligible for a graceful handoff."""
    proc = Path("/proc") / str(pid)
    try:
        raw = (proc / "cmdline").read_bytes().split(b"\0")
        cwd = (proc / "cwd").resolve()
    except OSError:
        return False
    for arg in raw[1:]:
        if not arg:
            continue
        try:
            candidate = Path(os.fsdecode(arg))
            candidate = candidate if candidate.is_absolute() else cwd / candidate
            if candidate.resolve() == AGENT.resolve():
                return True
        except (OSError, ValueError):
            continue
    return False


def pro_processes():
    try:
        children = list(Path("/proc").iterdir())
    except OSError as exc:
        raise ActivationError("Cannot inspect local processes safely") from exc
    return sorted(int(x.name) for x in children if x.name.isdigit() and is_pro_process(int(x.name)))


def public_capabilities():
    try:
        req = urllib.request.Request(
            CAPABILITY_URL,
            headers={"Cache-Control": "no-cache", "User-Agent": "SONARA-V3-Activation/1.0"},
        )
        # Never inherit notebook proxy configuration for this trusted HTTPS endpoint.
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=15) as response:
            check(response.status == 200, "Cloudflare capabilities HTTP status is not 200")
            payload = response.read(16000)
        data = json.loads(payload)
        check(isinstance(data, dict), "Malformed Cloudflare capabilities JSON")
        return data
    except (OSError, ValueError, urllib.error.URLError) as exc:
        raise ActivationError("Cannot read public Cloudflare Remix Pro capabilities") from exc


def sha_git_blob(payload):
    return hashlib.sha1(b"blob " + str(len(payload)).encode("ascii") + b"\0" + payload).hexdigest()


def load_installer():
    req = urllib.request.Request(INSTALLER_URL, headers={"User-Agent": "SONARA-V3-Activation/1.0"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req, timeout=35) as response:
            payload = response.read(200001)
    except (OSError, urllib.error.URLError) as exc:
        raise ActivationError("Cannot retrieve immutable V3 installer") from exc
    check(len(payload) < 200000 and sha_git_blob(payload) == INSTALLER_SHA,
          "Pinned V3 installer failed integrity verification")
    return payload


def choose_mode(requested, previous_args):
    if requested in ("required", "none"):
        return requested
    for i, arg in enumerate(previous_args):
        if arg == "--auth-mode" and i + 1 < len(previous_args):
            if previous_args[i + 1] in ("required", "none"):
                return previous_args[i + 1]
        if arg.startswith("--auth-mode="):
            mode = arg.split("=", 1)[-1]
            if mode in ("required", "none"):
                return mode
    # Respect existing local API authentication without printing secrets.
    return "required" if Path("/home/marimo/ACE-STEP/.sonara-api-key").is_file() else "none"


def argv_for(pid):
    try:
        return [
            os.fsdecode(a) for a in (Path("/proc") / str(pid) / "cmdline").read_bytes().split(b"\0")
            if a
        ]
    except OSError:
        return []


def stop_idle_v2(pid):
    state = read_status()
    age = time.time() - float(state.get("updatedAt") or 0)
    check(state.get("revision") != EXPECTED_REVISION,
          "V3 process is already running; will not interrupt it")
    check(state.get("state") in IDLE_STATES and 0 <= age <= 50,
          "Dedicated Pro worker is not confirmed idle; stop refused")
    check(is_pro_process(pid), "Dedicated Pro worker identity changed")
    print("SONARA_PRO_V2_GRACEFUL_HANDOFF=START", flush=True)
    os.kill(pid, signal.SIGTERM)
    until = time.monotonic() + STOP_SECONDS
    while time.monotonic() < until:
        if not is_pro_process(pid):
            print("SONARA_PRO_V2_GRACEFUL_HANDOFF=COMPLETE", flush=True)
            return
        time.sleep(1)
    raise ActivationError("Idle Pro V2 worker did not release its process; refusing forced termination")


def invoke_installer(data):
    with tempfile.TemporaryDirectory(prefix="sonara-v3-activation-") as d:
        file = Path(d) / "pinned-install.py"
        file.write_bytes(data)
        file.chmod(0o600)
        command = [str(PYTHON), str(file), "--install"]
        run = subprocess.run(command, capture_output=True, text=True, timeout=140)
        # Report only known safe, non-secret status markers.
        for line in run.stdout.splitlines():
            if line.startswith(("SONARA_INSTALL_RESULT=", "SONARA_FUSION_V3_MODULES_VERIFIED=",
                                "SONARA_MAIN_ACE_STEP_UNTOUCHED=")):
                print(line, flush=True)
        check(run.returncode == 0 and "SONARA_INSTALL_RESULT=SUCCESS" in run.stdout,
              "Pinned V3 module installation failed (main ACE-Step left unchanged)")


def preflight():
    result = subprocess.run(
        [str(PYTHON), str(AGENT), "--preflight"],
        capture_output=True, text=True, timeout=180,
    )
    for line in result.stdout.splitlines():
        if line.startswith(("PRO_GPU_VERIFIED=", "PRO_AGENT_AUTHENTICATED=",
                            "PRO_AGENT_REVISION=", "PRO_SITE_GENERATION_AVAILABLE=")):
            print(line, flush=True)
    check(result.returncode == 0 and "PRO_AGENT_AUTHENTICATED=True" in result.stdout,
          "V3 GPU or HTTPS authentication preflight failed")
    check("PRO_GPU_VERIFIED=True" in result.stdout, "RTX PRO 6000 GPU verification failed")


def start_worker(mode):
    PRIVATE.mkdir(parents=True, exist_ok=True, mode=0o700)
    with LOG.open("ab") as log:
        os.chmod(LOG, 0o600)
        proc = subprocess.Popen(
            [str(PYTHON), str(AGENT), "--auth-mode", mode],
            stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT,
            cwd=ROOT, start_new_session=True, close_fds=True,
        )
    return proc


def wait_ready(proc):
    until = time.monotonic() + 75
    while time.monotonic() < until:
        if proc is not None and proc.poll() is not None:
            raise ActivationError("V3 agent exited early. Inspect the private agent log on MoLab")
        try:
            caps = public_capabilities()
            if (caps.get("available") is True
                    and caps.get("fusionAvailable") is True
                    and caps.get("expectedAgentRevision") == EXPECTED_REVISION):
                state = read_status()
                check(state.get("revision") == EXPECTED_REVISION,
                      "Cloudflare ready but local V3 status does not match")
                print("SONARA_PRO_GPU_V3=ONLINE", flush=True)
                print("SONARA_CREATIVE_FUSION_A_B=ACTIVE_FOR_AUTHORIZED_JOBS", flush=True)
                print("SONARA_CLOUDFLARE_FUSION_AVAILABLE=True", flush=True)
                print("SONARA_ACE_STEP_MAIN_UNCHANGED=True", flush=True)
                print("SONARA_MAIN_RELAY_UNCHANGED=True", flush=True)
                print("SONARA_AUDIO_GENERATION_TEST_RUN=False", flush=True)
                return
        except ActivationError:
            pass
        time.sleep(3)
    raise ActivationError("V3 worker has not produced a fresh, verified Cloudflare heartbeat")


def main(argv=None):
    p = argparse.ArgumentParser(description="One-run isolated Remix V3 and A+B activation")
    p.add_argument("--activate", action="store_true", help="Perform protected idle-agent handoff and V3 launch")
    p.add_argument("--auth-mode", choices=("auto", "none", "required"), default="auto")
    args = p.parse_args(argv)

    check(PYTHON.is_file() and ROOT.is_dir() and TOKEN.is_file(),
          "Existing isolated Remix Pro venv and private relay credential are required")
    check(Path(sys.executable).resolve() == PYTHON.resolve(),
          "Must run under the isolated Remix Pro Python environment")
    try:
        cap = public_capabilities()
        print("SONARA_GATEWAY_V3_EXPECTED="
              + str(cap.get("expectedAgentRevision") == EXPECTED_REVISION), flush=True)
        check(cap.get("expectedAgentRevision") == EXPECTED_REVISION,
              "Cloudflare has not published the V3-compatible gateway")
    except ActivationError:
        if args.activate:
            raise
        print("SONARA_GATEWAY_STATUS=UNVERIFIED", flush=True)

    existing = pro_processes()
    check(len(existing) <= 1, "Multiple dedicated Pro agent processes detected; refusing handoff")
    state = read_status()
    if existing and state.get("revision") == EXPECTED_REVISION:
        print("SONARA_EXISTING_V3_PROCESS=DETECTED", flush=True)
        wait_ready(None)
        return
    if not args.activate:
        print("SONARA_EXISTING_PRO_AGENT_COUNT=" + str(len(existing)), flush=True)
        print("SONARA_ACTIVATION_EXECUTED=False", flush=True)
        return

    # Download and verify the immutable installer BEFORE stopping the old worker.
    installer = load_installer()
    previous_args = argv_for(existing[0]) if existing else []
    auth_mode = choose_mode(args.auth_mode, previous_args)
    if existing:
        stop_idle_v2(existing[0])
    check(not pro_processes(), "Dedicated Pro agent still active; installation refused")
    invoke_installer(installer)
    preflight()
    started = start_worker(auth_mode)
    wait_ready(started)


if __name__ == "__main__":
    try:
        main()
    except (ActivationError, OSError, subprocess.SubprocessError) as exc:
        print("SONARA_REMIX_V3_ACTIVATION=BLOCKED", flush=True)
        print("SONARA_REASON=" + str(exc), flush=True)
        raise SystemExit(1)
