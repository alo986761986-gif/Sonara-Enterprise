#!/usr/bin/env python3
from __future__ import annotations

import ast
import hashlib
import importlib.util
import json
import os
import secrets
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

SONARA_REPO = "alo986761986-gif/Sonara-Enterprise"
SONARA_SOURCE_PIN = "43d86d77944c9dceeb1a549aac94546bf778d9da"
RAW_SCRIPTS = f"https://raw.githubusercontent.com/{SONARA_REPO}/{SONARA_SOURCE_PIN}/scripts"
RAW_MOLAB = f"https://raw.githubusercontent.com/{SONARA_REPO}/{SONARA_SOURCE_PIN}/molab"

ROOT = Path("/marimo/SONARA-ACE-Step-CLEAN")
PYTHON = ROOT / ".venv/bin/python"
PORT = 8001
TURBO = "acestep-v15-xl-turbo"
BASE = "acestep-v15-xl-base"
LM4B = "acestep-5Hz-lm-4B"
WORK = Path("/tmp/sonara-rtx6000pro-live-1029")
READY = ROOT / "SONARA_LIVE_2026_10_29_READY.json"

SONARA_HOME = Path.home() / ".sonara"
TOKEN_FILE = SONARA_HOME / "relay.token"
AGENT_FILE = SONARA_HOME / "sonara_r2_pull_agent.py"
WATCHDOG_FILE = SONARA_HOME / "sonara_relay_watchdog.py"
WATCHDOG_LOG = SONARA_HOME / "relay-watchdog.log"

DEPENDENCIES = {
    "fresh": "ace-step-xl-turbo-real-music-fresh-install-0902.py",
    "v2": "ace-step-real-music-v2-speed-quality-upgrade-0902.py",
    "asr_fix": "ace-step-vocal-asr-v3-install-fix-0902.py",
    "v3": "ace-step-real-music-v3-molab-activate-0904.py",
    "hf_fix": "ace-step-hf-stack-repair-v3-recovery-0904.py",
}


def banner(text: str) -> None:
    print("\n" + "=" * 112, flush=True)
    print(text, flush=True)
    print("=" * 112, flush=True)


def download(url: str, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "SONARA-RTX6000PRO-LIVE-1029/1.0", "Accept": "text/plain"},
    )
    with urllib.request.urlopen(req, timeout=180) as response:
        data = response.read()
    target.write_bytes(data)


def load_module(alias: str, filename: str):
    WORK.mkdir(parents=True, exist_ok=True)
    path = WORK / filename
    download(f"{RAW_SCRIPTS}/{filename}", path)
    spec = importlib.util.spec_from_file_location(f"sonara_{alias}", path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Impossibile caricare {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def stop_matching_processes() -> None:
    banner("0/12 - CLEAN PREVIOUS SONARA PROCESSES")
    try:
        rows = subprocess.check_output(["ps", "-eo", "pid=,args="], text=True)
    except Exception:
        return
    me = os.getpid()
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        if pid == me:
            continue
        cmd = parts[1]
        low = cmd.lower()
        target = (
            ("acestep.api_server" in low and str(PORT) in low)
            or "sonara_r2_pull_agent.py" in low
            or "sonara_relay_watchdog.py" in low
        )
        if target:
            try:
                os.kill(pid, signal.SIGTERM)
                print(f"STOPPED_PID={pid}", flush=True)
            except Exception:
                pass
    time.sleep(2)


def verify_rtx6000pro() -> dict:
    banner("1/12 - VERIFY RTX PRO 6000 / CUDA")
    probe = subprocess.run(
        [
            "python3",
            "-c",
            (
                "import json, torch;"
                "assert torch.cuda.is_available(), 'CUDA unavailable';"
                "p=torch.cuda.get_device_properties(0);"
                "print(json.dumps({'gpu':torch.cuda.get_device_name(0),"
                "'vram_gb':round(p.total_memory/1024**3,2),"
                "'cuda':str(torch.version.cuda),"
                "'bf16':bool(torch.cuda.is_bf16_supported())}))"
            ),
        ],
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    print(probe.stdout or "", flush=True)
    if probe.returncode != 0:
        raise RuntimeError("CUDA non pronta sul notebook.")
    data = json.loads((probe.stdout or "").strip().splitlines()[-1])
    name = str(data.get("gpu") or "").lower()
    if "6000" not in name:
        raise RuntimeError(f"GPU inattesa: {data.get('gpu')}")
    if float(data.get("vram_gb") or 0) < 40:
        raise RuntimeError(f"VRAM insufficiente: {data.get('vram_gb')} GB")
    print("RTX6000PRO=READY", flush=True)
    return data


def apply_router_passthrough_contract(v2) -> None:
    banner("7/12 - APPLY CURRENT SONARA ROUTER CONTRACT")
    setup = v2.SETUP
    text = setup.read_text(encoding="utf-8")
    original = text

    legacy_blocks = [
        (
            '        # SONARA_SPEED_MAX_V2_QUALITY4\n'
            '        inference_steps=(\n'
            '            4 if getattr(req, "sonara_generation_profile", "auto") in {"fast", "quality"}\n'
            '            else req.inference_steps\n'
            '        ),\n',
            '        inference_steps=req.inference_steps,\n',
        ),
        (
            '        # SONARA_SPEED_MAX_V1_FAST4\n'
            '        inference_steps=(\n'
            '            4 if getattr(req, "sonara_generation_profile", "auto") == "fast"\n'
            '            else 6 if getattr(req, "sonara_generation_profile", "auto") == "quality"\n'
            '            else req.inference_steps\n'
            '        ),\n',
            '        inference_steps=req.inference_steps,\n',
        ),
    ]
    for old, new in legacy_blocks:
        if old in text:
            text = text.replace(old, new, 1)

    old_dcw = (
        '        dcw_scaler=(0.02 if thinking else req.dcw_scaler),\n'
        '        dcw_high_scaler=(0.06 if thinking else req.dcw_high_scaler),\n'
    )
    new_dcw = (
        '        # SONARA_ROUTER_DCW_AUTHORITATIVE_1029\n'
        '        dcw_scaler=req.dcw_scaler,\n'
        '        dcw_high_scaler=req.dcw_high_scaler,\n'
    )
    if old_dcw in text:
        text = text.replace(old_dcw, new_dcw, 1)

    if "SONARA_SPEED_MAX_V2_QUALITY4" in text or "SONARA_SPEED_MAX_V1_FAST4" in text:
        raise RuntimeError("Override storico inference_steps ancora presente.")
    if "inference_steps=req.inference_steps," not in text:
        raise RuntimeError("Il runtime non rispetta inference_steps del router SONARA.")
    if "dcw_scaler=req.dcw_scaler," not in text or "dcw_high_scaler=req.dcw_high_scaler," not in text:
        raise RuntimeError("Il runtime non rispetta i valori DCW del router SONARA.")

    if text != original:
        backup = setup.with_suffix(setup.suffix + ".before-sonara-live-1029")
        if not backup.exists():
            backup.write_text(original, encoding="utf-8")
        setup.write_text(text, encoding="utf-8")

    subprocess.run([str(PYTHON), "-m", "py_compile", str(setup)], cwd=str(ROOT), check=True)
    print("ROUTER_FAST_STEPS=1", flush=True)
    print("ROUTER_QUALITY_STEPS=4", flush=True)
    print("ROUTER_ULTRA_STEPS=8", flush=True)
    print("NATURAL_INSTRUMENT_AB_LOCK=EDGE_V2", flush=True)
    print("QUALITY_AB_DIVERSITY=EDGE_V8", flush=True)
    print("LM4B_ULTRA_THINKING=EDGE_CONTROLLED", flush=True)


def request_json(url: str, timeout: int = 20, headers: dict | None = None) -> dict:
    h = {
        "Accept": "application/json",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "User-Agent": "SONARA-MoLab-Relay/1.0",
    }
    h.update(headers or {})
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as response:
        raw = response.read().decode("utf-8", errors="replace")
    return json.loads(raw) if raw else {}


def wait_asr() -> dict:
    deadline = time.time() + 180
    last = {}
    while time.time() < deadline:
        try:
            last = request_json(f"http://127.0.0.1:{PORT}/v1/sonara/asr-health", 15)
            if last.get("ok") is True or (last.get("data") or {}).get("ok") is True:
                print("VOCAL_ASR_V3=READY", flush=True)
                return last
        except Exception:
            pass
        time.sleep(3)
    raise RuntimeError(f"ASR V3 non pronto: {last!r}")


def private_write(path: Path, data: bytes) -> None:
    if path.is_symlink():
        raise RuntimeError(f"Unsafe symlink: {path}")
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    fd = os.open(str(path), flags, 0o600)
    with os.fdopen(fd, "wb") as out:
        os.fchmod(out.fileno(), 0o600)
        out.write(data)


def install_current_relay() -> dict:
    banner("11/12 - INSTALL CURRENT HTTPS/R2 RELAY + WATCHDOG")
    SONARA_HOME.mkdir(parents=True, exist_ok=True, mode=0o700)
    SONARA_HOME.chmod(0o700)

    token_created = False
    if TOKEN_FILE.is_file() and TOKEN_FILE.stat().st_size > 0:
        token = TOKEN_FILE.read_text(encoding="utf-8").strip()
    else:
        supplied = os.environ.get("SONARA_RELAY_TOKEN", "").strip()
        token = supplied if supplied else secrets.token_urlsafe(48)
        private_write(TOKEN_FILE, token.encode("ascii"))
        token_created = not bool(supplied)
    TOKEN_FILE.chmod(0o600)

    if len(token) < 32 or not token.isascii() or any(ch.isspace() for ch in token):
        raise RuntimeError("Relay token locale non valido.")

    for name, target in (
        ("sonara_r2_pull_agent.py", AGENT_FILE),
        ("sonara_relay_watchdog.py", WATCHDOG_FILE),
    ):
        req = urllib.request.Request(
            f"{RAW_MOLAB}/{name}",
            headers={"User-Agent": "SONARA-RTX6000PRO-LIVE-1029/1.0", "Accept": "text/plain"},
        )
        with urllib.request.urlopen(req, timeout=30) as response:
            source = response.read(1_000_001)
        if not source or len(source) > 1_000_000:
            raise RuntimeError(f"Relay source non valido: {name}")
        ast.parse(source.decode("utf-8"), filename=name)
        private_write(target, source)

    log_fd = os.open(str(WATCHDOG_LOG), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
    with os.fdopen(log_fd, "ab") as log:
        os.fchmod(log.fileno(), 0o600)
        watchdog = subprocess.Popen(
            [sys.executable, "-u", str(WATCHDOG_FILE)],
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            cwd=str(SONARA_HOME),
            start_new_session=True,
        )

    fingerprint = hashlib.sha256(token.encode("ascii")).hexdigest()
    time.sleep(3)

    authenticated = False
    auth_http = None
    try:
        body = request_json(
            "https://api.sonaraenterprise.com/api/sonara-relay/auth",
            20,
            {
                "X-Sonara-Relay-Token": token,
                "X-Sonara-Agent-Revision": "sonara-https-agent-guard-v5",
            },
        )
        authenticated = body.get("authenticated") is True
        auth_http = 200
    except urllib.error.HTTPError as error:
        auth_http = error.code
    except Exception:
        auth_http = None

    print(f"WATCHDOG_PID={watchdog.pid}", flush=True)
    print("RELAY_TOKEN=PRIVATE_NOT_PRINTED", flush=True)
    print(f"RELAY_FINGERPRINT_SHA256={fingerprint}", flush=True)
    print(f"RELAY_AUTH_HTTP={auth_http}", flush=True)
    print(f"RELAY_AUTHENTICATED={authenticated}", flush=True)
    print(f"RELAY_PAIRING_REQUIRED={not authenticated}", flush=True)

    return {
        "watchdog_pid": watchdog.pid,
        "relay_fingerprint_sha256": fingerprint,
        "relay_auth_http": auth_http,
        "relay_authenticated": authenticated,
        "relay_pairing_required": not authenticated,
        "relay_token_created": token_created,
    }


def main() -> None:
    banner("SONARA LIVE - NEW MOLAB NOTEBOOK - RTX PRO 6000 - 2026-10-29")
    print(f"SONARA_SOURCE_PIN={SONARA_SOURCE_PIN}", flush=True)
    print(f"PRODUCTION_MODEL={TURBO}", flush=True)
    print(f"REFINEMENT_MODEL={BASE}", flush=True)
    print(f"LM_MODEL={LM4B}", flush=True)
    print("NETWORK=HTTPS_R2_RELAY_ONLY", flush=True)
    print("QUICK_TUNNEL=DISABLED", flush=True)
    print("NO_TEST_GENERATION=TRUE", flush=True)

    stop_matching_processes()
    host_gpu = verify_rtx6000pro()

    fresh = load_module("fresh", DEPENDENCIES["fresh"])
    v2 = load_module("v2", DEPENDENCIES["v2"])
    asr_fix = load_module("asr_fix", DEPENDENCIES["asr_fix"])
    v3 = load_module("v3", DEPENDENCIES["v3"])
    hf_fix = load_module("hf_fix", DEPENDENCIES["hf_fix"])

    banner("2/12 - CLEAN ACE-STEP 1.5 + PYTHON 3.12")
    fresh.TOOLS.mkdir(parents=True, exist_ok=True)
    fresh.WORK.mkdir(parents=True, exist_ok=True)
    fresh.check_disk()
    uv = fresh.ensure_uv()
    fresh.prepare_repo()
    env = fresh.install_environment(uv)

    banner("3/12 - VERIFY CUDA INSIDE ACE-STEP VENV")
    fresh.verify_gpu(env)

    banner("4/12 - DOWNLOAD XL-TURBO")
    fresh.download_models(env)

    banner("5/12 - APPLY REAL MUSIC API CONTRACTS")
    fresh.patch_real_music_api()
    v2.require_runtime()
    v2.patch_http_contract()
    v2.patch_generation_runtime()
    v2.patch_health_marker()
    v2.verify_code()

    banner("6/12 - INSTALL VOCAL ASR V3")
    asr_fix.main()

    apply_router_passthrough_contract(v2)

    banner("8/12 - REPAIR HF / TOKENIZERS STACK")
    hf_fix.repair_stack()
    if not hf_fix.import_probe("SONARA_1029_IMPORT_PROBE"):
        raise RuntimeError("HF/tokenizers stack non compatibile.")
    print("HF_STACK=READY", flush=True)

    banner("9/12 - INSTALL/VERIFY LM 4B + XL-BASE")
    v3.ensure_runtime()
    v3.ensure_lm4b()
    v3.ensure_base()
    runtime_gpu = v3.verify_gpu()

    banner("10/12 - START LOCAL ACE-STEP API")
    api_proc, backend, compile_model, health = v2.start_best_api()
    asr = wait_asr()
    models = v3.probe_models()

    relay = install_current_relay()

    banner("12/12 - FINAL READINESS")
    final_health = request_json(f"http://127.0.0.1:{PORT}/health", 15)
    health_data = final_health.get("data", final_health)
    local_ready = (
        isinstance(health_data, dict)
        and health_data.get("models_initialized") is True
        and health_data.get("llm_initialized") is True
        and health_data.get("loaded_model") == TURBO
        and health_data.get("loaded_lm_model") == LM4B
    )

    payload = {
        "ok": bool(local_ready),
        "profile": "SONARA LIVE RTX PRO 6000 2026-10-29",
        "sonara_source_pin": SONARA_SOURCE_PIN,
        "runtime_root": str(ROOT),
        "model": TURBO,
        "refinement_model": BASE,
        "lm_model": LM4B,
        "lm_backend": backend,
        "torch_compile": bool(compile_model),
        "host_gpu": host_gpu,
        "runtime_gpu": runtime_gpu,
        "models": models,
        "health": health,
        "vocal_asr": asr,
        "router_profiles": {"fast_steps": 1, "quality_steps": 4, "ultra_steps": 8},
        "natural_instrument_ab_lock": "v2-edge",
        "quality_ab_diversity": "v8-edge",
        "network": "https-r2-relay",
        "quick_tunnel": False,
        **relay,
        "created_at_epoch": int(time.time()),
    }
    READY.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    print(f"ACE_STEP_API_PID={api_proc.pid}", flush=True)
    print(f"ACE_STEP_READY={local_ready}", flush=True)
    print(f"MODEL={TURBO}", flush=True)
    print(f"LM_MODEL={LM4B}", flush=True)
    print(f"LM_BACKEND={backend}", flush=True)
    print(f"TORCH_COMPILE={str(bool(compile_model)).lower()}", flush=True)
    print("FAST=1_STEP", flush=True)
    print("QUALITY=4_STEPS", flush=True)
    print("ULTRA=8_STEPS", flush=True)
    print("NATURAL_INSTRUMENT_AB_LOCK=V2_EDGE", flush=True)
    print("QUALITY_AB_DIVERSITY=V8_EDGE", flush=True)
    print("VOCAL_ASR_V3=READY", flush=True)
    print("HTTPS_R2_RELAY=INSTALLED", flush=True)
    print("QUICK_TUNNEL=OFF", flush=True)
    print(f"READY_FILE={READY}", flush=True)
    if relay["relay_pairing_required"]:
        print("NEXT_ACTION=PAIR_RELAY_FINGERPRINT_WITH_CLOUDFLARE", flush=True)
    else:
        print("SONARA_AUDIO_ENGINE=READY_AND_PAIRED", flush=True)


if __name__ == "__main__":
    main()
