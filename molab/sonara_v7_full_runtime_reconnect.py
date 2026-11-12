#!/usr/bin/env python3
"""SONARA V7 safe live reconnect (RTX PRO 6000 / Cloudflare).

A single authorized notebook operation. Strictly preserves existing customer
jobs, private secrets, MoLab module revisions, ACE-Step model files, billing,
R2 records and quality gate. Never publishes audio or creates a customer job.

--check is read-only. --activate may start verified missing processes only;
it never terminates an active process or replaces a local Python module.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request

HOME = Path.home() / ".sonara"
PRIVATE = Path("/marimo/SONARA-REMIX-PRO")
VENV = PRIVATE / ".venv"
WORKER = PRIVATE / "sonara_remix_pro_r2_agent.py"
ACE = Path("/home/marimo/ACE-STEP/ACE-Step-1.5")
ACE_PY = ACE / ".venv/bin/python"
ACE_API_LOG = HOME / "ace-step-api.log"
PRO_LOG = HOME / "remix-pro-v6-agent.log"
RELAY_AGENT = HOME / "sonara_r2_pull_agent.py"
RELAY_LOG = HOME / "relay-agent.log"
TOKEN = HOME / "relay.token"
STATUS = HOME / "remix-pro-agent-status.json"
RELAY_STATUS = HOME / "relay-agent-status.json"
EXPECTED_REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"
CAPS_URL = "https://api.sonaraenterprise.com/api/sonara-relay/pro-capabilities"

# SHA-1 of git blob: length-prefixed Git objects, not plain file SHA-1.
# This is an allowlist to prevent rolling a new environment back to V5/V6.
REQUIRED_MODULES = {
    "sonara_remix_pro_v5.py": "58474a9db887e6a16ab9a57889789f4b0f987d95",
    "sonara_remix_pro_v6.py": "d8a99ea30b93cf47f1befee3c8c45b3ad630a597",
    "sonara_remix_pro_v7.py": "3ddd13f6e0211e6dcab942d886ae36993384158a",
    "sonara_remix_pro_v7_rhythm.py": "a39cad47b8b9f618912511166f8d5d2e552f3896",
    "sonara_remix_pro_a_clock_fusion.py": "e44b010e34d46886bd76a07cfff99f927b6c3d21",
    "sonara_remix_pro_r2_agent.py": "66dac4702e2418902172c50a07fe268ac9e44b78",
    "sonara_remix_pro_quality.py": "7e4e0f6c608e02063b3bac689b5b35a5b91bbef5",
    "sonara_remix_pro_toolkit.py": "4ca1f094839f8372a5fd9c3ee8462e5470a9100d",
    "sonara_remix_pro_ace_bridge.py": "72bdb9b36792127d27340660d2c738c64de6c1f8",
    "sonara_remix_pro_fusion.py": "073e73b0f418e91bd48e8bfbe084ba6f31cef847",
    "sonara_remix_pro_original_voices.py": "93927ebacb2fcf86ea9397abfd31df1824b4c180",
}


class Blocked(RuntimeError):
    pass


def git_blob(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def check_safe_path(path: Path, *, file: bool = False) -> None:
    if path.is_symlink():
        raise Blocked("Unsafe symlink detected: " + path.name)
    if not (path.is_file() if file else path.is_dir()):
        raise Blocked("Required local path missing: " + path.name)


def installed() -> None:
    check_safe_path(PRIVATE)
    check_safe_path(HOME)
    check_safe_path(VENV)
    check_safe_path(TOKEN, file=True)
    check_safe_path(WORKER, file=True)
    for name, expected in REQUIRED_MODULES.items():
        path = PRIVATE / name
        check_safe_path(path, file=True)
        payload = path.read_bytes()
        if len(payload) > 500_000 or git_blob(payload) != expected:
            raise Blocked("Unknown/stale private V7 module: " + name)
    print("SONARA_V7_ALL_LATEST_MODULES_VERIFIED=True", flush=True)
    print("SONARA_QUALITY_GATE_UNMODIFIED=True", flush=True)


def processes(needle: str) -> list[int]:
    found = []
    for entry in Path("/proc").iterdir():
        if not entry.name.isdigit():
            continue
        try:
            cmd = (entry / "cmdline").read_bytes().split(b"\0")
            if any(needle.encode("ascii") in a for a in cmd if a):
                found.append(int(entry.name))
        except (OSError, ValueError):
            pass
    return sorted(set(found))


def worker_processes() -> list[int]:
    found = []
    for pid in processes("sonara_remix_pro_r2_agent.py"):
        try:
            args = (Path("/proc") / str(pid) / "cmdline").read_bytes().split(b"\0")
            cwd = (Path("/proc") / str(pid) / "cwd").resolve()
            for item in args:
                if not item or b"sonara_remix_pro_r2_agent.py" not in item:
                    continue
                item_path = Path(os.fsdecode(item))
                actual = (item_path if item_path.is_absolute() else cwd / item_path).resolve()
                if actual == WORKER.resolve():
                    found.append(pid)
                    break
        except (OSError, ValueError):
            continue
    return sorted(set(found))


def json_file(path: Path) -> dict:
    if path.is_symlink():
        raise Blocked("Unsafe status file")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def fresh_status(path: Path, seconds: int = 40) -> dict:
    result = json_file(path)
    try:
        age = time.time() - float(result.get("updatedAt") or 0)
    except (ValueError, TypeError):
        return {}
    return result if 0 <= age < seconds else {}


def ace_health() -> dict:
    try:
        req = urllib.request.Request("http://127.0.0.1:8001/health",
                                     headers={"Accept": "application/json"})
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=4) as response:
            if response.status != 200:
                return {}
            raw = json.load(response)
        data = raw.get("data", raw) if isinstance(raw, dict) else {}
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError, urllib.error.URLError):
        return {}


def ace_ready(data: dict) -> bool:
    return (data.get("status", "").lower() == "ok"
            and data.get("models_initialized") is True
            and data.get("llm_initialized") is True
            and "acestep-v15-xl-turbo" in str(data.get("loaded_model", ""))
            and "acestep-5Hz-lm-4B" in str(data.get("loaded_lm_model", "")))


def port_8001_occupied() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as conn:
        conn.settimeout(.5)
        return conn.connect_ex(("127.0.0.1", 8001)) == 0


def start_ace_if_fully_stopped() -> bool:
    health = ace_health()
    if ace_ready(health):
        print("SONARA_MAIN_ACE_STEP_READY=True", flush=True)
        return True
    # A model may be loading or handling work even if health isn't READY.
    # Never kill it, force an upgrade or start a competing service.
    if processes("acestep.api_server") or port_8001_occupied():
        print("SONARA_MAIN_ACE_STEP_LOADING_OR_BUSY=True", flush=True)
        return False
    check_safe_path(ACE)
    if not ACE_PY.is_file() or not os.access(ACE_PY, os.X_OK):
        raise Blocked("Installed ACE-Step Python missing")
    if not (ACE / "checkpoints").is_dir():
        raise Blocked("Installed ACE-Step runtime/checkpoints missing; no reinstall attempted")
    env = os.environ.copy()
    env.update({
        "ACESTEP_PROJECT_ROOT": str(ACE),
        "ACESTEP_CHECKPOINTS_DIR": str(ACE / "checkpoints"),
        "ACESTEP_CONFIG_PATH": "acestep-v15-xl-turbo",
        "ACESTEP_LM_MODEL_PATH": "acestep-5Hz-lm-4B",
        "ACESTEP_DEVICE": "cuda",
        "ACESTEP_INIT_LLM": "true",
        "ACESTEP_LLM_BACKEND": "pt",
        "ACESTEP_USE_FLASH_ATTENTION": "false",
        "ACESTEP_OFFLOAD_TO_CPU": "false",
        "ACESTEP_OFFLOAD_DIT_TO_CPU": "false",
        "ACESTEP_LM_OFFLOAD_TO_CPU": "false",
        "ACESTEP_API_HOST": "127.0.0.1",
        "ACESTEP_API_PORT": "8001",
        "ACESTEP_NO_INIT": "false",
        "ACESTEP_API_WORKERS": "1",
        "ACESTEP_QUEUE_WORKERS": "1",
        "ACESTEP_QUEUE_MAXSIZE": "64",
        "TOKENIZERS_PARALLELISM": "false",
        "PYTHONUNBUFFERED": "1",
    })
    with ACE_API_LOG.open("ab") as log:
        child = subprocess.Popen(
            [str(ACE_PY), "-m", "acestep.api_server", "--host", "127.0.0.1",
             "--port", "8001", "--download-source", "huggingface", "--init-llm",
             "--lm-model-path", "acestep-5Hz-lm-4B"],
            cwd=ACE, env=env, stdin=subprocess.DEVNULL, stdout=log,
            stderr=subprocess.STDOUT, start_new_session=True)
    print("SONARA_MAIN_ACE_STEP_LAUNCHED=True", flush=True)
    for _ in range(80):
        if child.poll() is not None:
            raise Blocked("ACE-Step local API exited during initialization")
        if ace_ready(ace_health()):
            print("SONARA_MAIN_ACE_STEP_READY=True", flush=True)
            return True
        time.sleep(3)
    print("SONARA_MAIN_ACE_STEP_STILL_INITIALIZING=True", flush=True)
    return False


def private_python() -> Path:
    for candidate in (VENV / "bin/python", VENV / "bin/python3",
                      VENV / "bin/python3.13", VENV / "bin/python3.12"):
        if not candidate.is_file() or not os.access(candidate, os.X_OK):
            continue
        result = subprocess.run([str(candidate), "-c",
                "import pathlib,sys;print(pathlib.Path(sys.prefix).resolve())"],
                cwd=PRIVATE, capture_output=True, text=True, timeout=20, check=False)
        if result.returncode == 0 and result.stdout.strip() == str(VENV.resolve()):
            print("SONARA_PRIVATE_PYTHON_READY=True", flush=True)
            return candidate
    raise Blocked("Private Python not ready; original private environment preserved")


def capability_check(timeout=10) -> dict:
    secret = TOKEN.read_text(encoding="utf-8").strip()
    if len(secret) < 32 or len(secret) > 512 or not secret.isascii() or any(x.isspace() for x in secret):
        raise Blocked("Existing private relay credential invalid")
    req = urllib.request.Request(CAPS_URL, headers={
        "Accept": "application/json",
        "Cache-Control": "no-cache",
        "User-Agent": "SONARA-Remix-Pro-Agent/1.0 (+https://sonaraenterprise.com)",
        "X-Sonara-Relay-Token": secret,
        "X-Sonara-Pro-Agent-Revision": EXPECTED_REVISION,
    })
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(req, timeout=timeout) as resp:
        if resp.status != 200:
            raise Blocked("Public V7 gateway did not return HTTP 200")
        answer = json.load(resp)
        return answer if isinstance(answer, dict) else {}


def pro_public_ready(caps: dict) -> bool:
    return all(caps.get(field) is True for field in (
        "available", "fusionAvailable", "v5Available", "v6Available",
        "v7Available", "v7RhythmAvailable", "v7CreativeModesAvailable"))


def ensure_main_relay(activate: bool) -> bool:
    current = fresh_status(RELAY_STATUS, 60)
    if current.get("authenticated") is True and current.get("modelsReady") is True:
        print("SONARA_MAIN_HTTPS_RELAY_READY=True", flush=True)
        return True
    if not activate:
        print("SONARA_MAIN_HTTPS_RELAY_READY=False", flush=True)
        return False
    # Never add a duplicate to an existing relay or watchdog session.
    if processes("sonara_r2_pull_agent.py") or processes("sonara_relay_watchdog"):
        print("SONARA_MAIN_RELAY_EXISTING_PROCESS_UNCHANGED=True", flush=True)
    else:
        check_safe_path(RELAY_AGENT, file=True)
        if RELAY_LOG.is_symlink():
            raise Blocked("Unsafe main relay log symlink")
        env = os.environ.copy()
        env.pop("SONARA_RELAY_TOKEN", None)
        env["SONARA_LOCAL_API_AUTH_MODE"] = "none"
        with RELAY_LOG.open("ab") as output:
            subprocess.Popen([sys.executable, "-u", str(RELAY_AGENT)],
                             cwd=HOME, env=env, stdin=subprocess.DEVNULL,
                             stdout=output, stderr=subprocess.STDOUT,
                             start_new_session=True)
        print("SONARA_MAIN_RELAY_LAUNCHED=True", flush=True)
    for _ in range(15):
        status = fresh_status(RELAY_STATUS, 55)
        if status.get("authenticated") is True and status.get("modelsReady") is True:
            print("SONARA_MAIN_HTTPS_RELAY_READY=True", flush=True)
            return True
        time.sleep(2)
    print("SONARA_MAIN_HTTPS_RELAY_READY=False", flush=True)
    return False


def ensure_pro_worker(python: Path, activate: bool) -> bool:
    existing = worker_processes()
    if len(existing) > 1:
        raise Blocked("Multiple private Remix Pro workers found; refusing any restart")
    if not existing:
        if not activate:
            print("SONARA_V7_WORKER_ONLINE=False", flush=True)
            return False
        # This native preflight checks CUDA sm120, private Demucs,
        # private token, authenticated remote heartbeat, without a job claim.
        check = subprocess.run([str(python), str(WORKER), "--auth-mode", "none",
                                "--preflight"], cwd=PRIVATE,
                               capture_output=True, text=True,
                               timeout=120, check=False)
        if check.returncode:
            raise Blocked("Private CUDA/authentication preflight failed (no worker started)")
        with PRO_LOG.open("ab") as output:
            subprocess.Popen([str(python), str(WORKER), "--auth-mode", "none"],
                             cwd=PRIVATE, stdin=subprocess.DEVNULL,
                             stdout=output, stderr=subprocess.STDOUT,
                             start_new_session=True)
        print("SONARA_V7_WORKER_LAUNCHED=True", flush=True)
    else:
        print("SONARA_V7_EXISTING_WORKER_PRESERVED=True", flush=True)
    for _ in range(20):
        ids = worker_processes()
        if len(ids) != 1:
            raise Blocked("Private worker exited or duplicated during readiness verification")
        status = fresh_status(STATUS, 60)
        if status.get("revision") == EXPECTED_REVISION:
            try:
                caps = capability_check()
            except (OSError, ValueError, urllib.error.URLError, Blocked):
                caps = {}
            if pro_public_ready(caps):
                print("SONARA_PRO_AGENT_AUTHENTICATED=True", flush=True)
                print("SONARA_V7_CREATIVE_MODES_PUBLIC=True", flush=True)
                print("SONARA_V7_RHYTHM_LOCK_PUBLIC=True", flush=True)
                print("SONARA_REMIX_PRO_SITE_GENERATION_AVAILABLE=True", flush=True)
                print("SONARA_V7_WORKER_ONLINE=True", flush=True)
                print("NO_CUSTOMER_AUDIO_JOB_CREATED_BY_RECOVERY=True", flush=True)
                return True
        time.sleep(3)
    print("SONARA_V7_WORKER_ONLINE=True", flush=True)
    print("SONARA_V7_PUBLIC_CAPABILITIES_NOT_CONFIRMED=True", flush=True)
    return False


def main(activate: bool) -> int:
    print("=== SONARA V7 - FULL ENGINE RECONNECT ===", flush=True)
    installed()
    if not activate:
        print("SONARA_V7_READ_ONLY_PREFLIGHT=True", flush=True)
        print("SONARA_PRIVATE_WORKERS=" + str(len(worker_processes())), flush=True)
        print("SONARA_MAIN_ACE_STEP_READY=" + str(ace_ready(ace_health())), flush=True)
        print("SONARA_MAIN_RELAY_READY=" + str(
            fresh_status(RELAY_STATUS, 60).get("authenticated") is True), flush=True)
        try:
            caps = capability_check()
        except (OSError, ValueError, urllib.error.URLError, Blocked):
            caps = {}
        print("SONARA_V7_LATEST_PUBLIC_CAPABILITIES=" + str(
            pro_public_ready(caps)), flush=True)
        return 0
    if not ace_ready(ace_health()) and not start_ace_if_fully_stopped():
        print("SONARA_V7_NEXT_ACTION=RUN_AGAIN_AFTER_ACE_STEP_INITIALIZES", flush=True)
        return 2
    print("SONARA_MAIN_ACE_STEP_UNCHANGED_OR_SAFELY_STARTED=True", flush=True)
    main_relay_ready = ensure_main_relay(True)
    python = private_python()
    pro_ready = ensure_pro_worker(python, True)
    if pro_ready and main_relay_ready:
        print("SONARA_V7_FULL_RECONNECT_SUCCESS=True", flush=True)
        return 0
    print("SONARA_V7_FULL_RECONNECT_INCOMPLETE=True", flush=True)
    return 2


if __name__ == "__main__":
    args = argparse.ArgumentParser()
    args.add_argument("--activate", action="store_true")
    options = args.parse_args()
    try:
        raise SystemExit(main(options.activate))
    except (Blocked, OSError, ValueError, subprocess.SubprocessError) as problem:
        # No secrets, file contents, job IDs, user data or raw API bodies.
        print("SONARA_V7_RECONNECT_BLOCKED=" + str(problem), flush=True)
        raise SystemExit(1)
