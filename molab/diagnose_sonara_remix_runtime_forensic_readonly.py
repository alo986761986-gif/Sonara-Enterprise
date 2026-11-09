"""SONARA Remix Pro forensic preflight: read-only, no network writes or jobs.

Checks whether user is on the correct RTX PRO 6000 notebook, looks only
for recognized isolated Python environments and agent process identity,
and distinguishes a gateway failure from a missing agent heartbeat.
Never shows tokens, file contents, user jobs, hostnames, or secret values.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import urllib.error
import urllib.request

ROOT = Path("/marimo/SONARA-REMIX-PRO")
EXPECTED = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"
SITE = "https://api.sonaraenterprise.com/api/sonara-relay/pro-capabilities"
KNOWN_RUNTIME = ROOT / ".venv/bin/python"

def yes(value):
    return "True" if bool(value) else "False"

def gpu_status():
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=name,compute_cap",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=12
        )
        if result.returncode:
            return "DRIVER_UNAVAILABLE"
        rows = result.stdout.splitlines()
        if not rows:
            return "NO_GPU"
        return "RTX_PRO_6000_SM120" if any(
            "RTX PRO 6000" in r and any(
                x.strip() in ("12.0", "12") for x in r.split(",")[1:]
            ) for r in rows
        ) else "OTHER_GPU"
    except (OSError, subprocess.TimeoutExpired):
        return "DRIVER_UNAVAILABLE"

def candidate_runtime():
    """Do not consider ACE-Step's venv a valid private Remix Pro runtime."""
    options = {
        "private-dotvenv": ROOT / ".venv/bin/python",
        "private-venv": ROOT / "venv/bin/python",
        "private-python-pro": ROOT / "python_pro/bin/python",
        "marimo-python-pro": Path("/marimo/python_pro/bin/python"),
        "marimo-dotvenv": Path("/marimo/.venv/bin/python"),
    }
    for label, path in options.items():
        print("SONARA_RUNTIME_" + label.replace("-", "_").upper() + "=" +
              yes(path.is_file()))
    return KNOWN_RUNTIME.is_file()

def worker_processes():
    """Never display arguments or user data. /proc inspection is read-only."""
    found = 0
    try:
        for pid in Path("/proc").iterdir():
            if not pid.name.isdigit():
                continue
            try:
                argv = (pid / "cmdline").read_bytes().split(b"\\0")
                # Only match the exact module filename; never log raw args.
                if any(Path(os.fsdecode(a)).name ==
                       "sonara_remix_pro_r2_agent.py" for a in argv[1:] if a):
                    found += 1
            except (OSError, ValueError):
                pass
    except OSError:
        print("SONARA_WORKER_PROC_SCAN=UNAVAILABLE")
        return
    print("SONARA_WORKER_PROC_SCAN=OK")
    print("SONARA_WORKER_PROCESSES=" + str(min(found, 99)))

def gateway_probe():
    for kind, opener in (
        ("NO_PROXY", urllib.request.build_opener(urllib.request.ProxyHandler({}))),
        ("DEFAULT", urllib.request.build_opener())
    ):
        try:
            req = urllib.request.Request(
                SITE, headers={"Accept": "application/json",
                               "Cache-Control": "no-store",
                               "User-Agent": "SONARA-ForensicPreflight/1.0"})
            with opener.open(req, timeout=12) as res:
                if res.status != 200:
                    print("SONARA_GATEWAY_" + kind + "_HTTP=" + str(res.status))
                    continue
                raw = res.read(16001)
            payload = json.loads(raw) if len(raw) <= 16000 else {}
            if not isinstance(payload, dict):
                payload = {}
            print("SONARA_GATEWAY_" + kind + "_HTTP=200")
            print("SONARA_GATEWAY_" + kind + "_EXPECTED_V3=" +
                  yes(payload.get("expectedAgentRevision") == EXPECTED))
            print("SONARA_GATEWAY_" + kind + "_AVAILABLE=" +
                  yes(payload.get("available") is True))
            print("SONARA_GATEWAY_" + kind + "_FUSION=" +
                  yes(payload.get("fusionAvailable") is True))
        except urllib.error.HTTPError as ex:
            print("SONARA_GATEWAY_" + kind + "_HTTP=" + str(ex.code))
        except (OSError, ValueError, urllib.error.URLError) as ex:
            print("SONARA_GATEWAY_" + kind + "_ERROR=" + type(ex).__name__)

def main():
    print("SONARA_REMIX_RUNTIME_FORENSIC=READ_ONLY")
    print("SONARA_PYTHON_3_12_PLUS=" + yes(sys.version_info >= (3, 12)))
    print("SONARA_PYTHON_MAJOR_MINOR=" + str(sys.version_info.major) + "." +
          str(sys.version_info.minor))
    print("SONARA_GPU_STATUS=" + gpu_status())
    print("SONARA_ROOT_PRESENT=" + yes(ROOT.is_dir()))
    print("SONARA_AGENT_FILE_PRESENT=" +
          yes((ROOT / "sonara_remix_pro_r2_agent.py").is_file()))
    for name in (
        "sonara_remix_pro_toolkit.py",
        "sonara_remix_pro_quality.py",
        "sonara_remix_pro_fusion.py",
        "sonara_remix_pro_ace_bridge.py",
        "sonara_remix_pro_gpu_setup.py"
    ):
        print("SONARA_MODULE_" + name.upper().replace(".", "_") + "=" +
              yes((ROOT / name).is_file()))
    private_runtime = candidate_runtime()
    print("SONARA_PRIVATE_RUNTIME_VALID_PATH=" + yes(private_runtime))
    print("SONARA_VENV_DIR_PRESENT=" + yes((ROOT / ".venv").exists()))
    print("SONARA_PYTHON_VENV_MODULE_PRESENT=" +
          yes(shutil.which("python3") or sys.executable))
    print("SONARA_UV_PRESENT=" + yes(shutil.which("uv")))
    print("SONARA_RELAY_TOKEN_FILE_PRESENT=" +
          yes((Path.home() / ".sonara/relay.token").is_file()))
    print("SONARA_AGENT_STATUS_FILE_PRESENT=" +
          yes((Path.home() / ".sonara/remix-pro-agent-status.json").is_file()))
    try:
        gb = shutil.disk_usage(ROOT if ROOT.exists() else "/marimo").free / 1024**3
        print("SONARA_DISK_FREE_AT_LEAST_20_GIB=" + yes(gb >= 20))
    except OSError:
        print("SONARA_DISK_FREE_AT_LEAST_20_GIB=UNAVAILABLE")
    worker_processes()
    gateway_probe()
    print("SONARA_NO_FILES_MODIFIED=True")
    print("SONARA_NO_JOB_CREATED=True")
    print("SONARA_MAIN_ACE_STEP_UNTOUCHED=True")
    print("SONARA_NO_SECRETS_DISPLAYED=True")

if __name__ == "__main__":
    main()
