"""SONARA private Remix Pro read-only diagnostics for the existing MoLab notebook.

Does not expose token values, start/stop processes, alter files or submit jobs.
"""
from __future__ import annotations
import json
import os
from pathlib import Path
import time
import urllib.request

ROOT = Path("/marimo/SONARA-REMIX-PRO")
STATUS = Path.home() / ".sonara/remix-pro-agent-status.json"
LOCK = Path.home() / ".sonara/remix-pro-agent.lock"
ENDPOINT = "https://api.sonaraenterprise.com/api/sonara-relay/pro-capabilities"
EXPECTED = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"


def main():
    print("SONARA_REMIX_QUALITY_V2_DIAG=READ_ONLY")
    print("SONARA_REMIX_PRIVATE_ROOT_PRESENT=" + str(ROOT.is_dir()))
    print("SONARA_REMIX_PRIVATE_PYTHON_PRESENT=" + str((ROOT / ".venv/bin/python").is_file()))
    print("SONARA_REMIX_AGENT_MODULE_PRESENT=" + str((ROOT / "sonara_remix_pro_r2_agent.py").is_file()))
    print("SONARA_REMIX_LOCK_PRESENT=" + str(LOCK.is_file()))
    status = {}
    try:
        value = json.loads(STATUS.read_text(encoding="utf-8"))
        if isinstance(value, dict):
            status = value
    except (OSError, ValueError):
        pass
    print("SONARA_LOCAL_STATUS_PRESENT=" + str(bool(status)))
    revision = status.get("revision")
    print("SONARA_LOCAL_REVISION_EXPECTED=" + str(revision == EXPECTED))
    state = str(status.get("state") or "unknown")
    permitted_states = {
        "waiting_for_authorized_job", "waiting_for_pro_activation",
        "processing", "connection_unavailable", "preflight_ready", "stopped"
    }
    print("SONARA_LOCAL_STATE=" + (state if state in permitted_states else "unknown"))
    try:
        age = time.time() - float(status.get("updatedAt") or 0)
        fresh = 0 <= age <= 45
    except (TypeError, ValueError, OverflowError):
        fresh = False
    print("SONARA_LOCAL_STATUS_FRESH=" + str(fresh))
    print("SONARA_LOCAL_JOB_IN_PROGRESS=" +
          str(bool(status.get("jobId")) or state == "processing"))
    print("SONARA_LOCAL_AGENT_IDLE_VERIFIED=" + str(
        fresh and revision == EXPECTED and not status.get("jobId") and
        state in {"waiting_for_authorized_job", "waiting_for_pro_activation"}))
    caps = {}
    try:
        req = urllib.request.Request(
            ENDPOINT, headers={"Cache-Control": "no-store", "Accept": "application/json"}
        )
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        with opener.open(req, timeout=15) as response:
            data = response.read(16001)
            if response.status == 200 and len(data) <= 16000:
                value = json.loads(data)
                if isinstance(value, dict):
                    caps = value
    except (OSError, ValueError, TimeoutError):
        pass
    print("SONARA_GATEWAY_CAPABILITIES_REACHABLE=" + str(bool(caps)))
    print("SONARA_GATEWAY_EXPECTS_V3=" + str(caps.get("expectedAgentRevision") == EXPECTED))
    print("SONARA_PRO_AVAILABLE=" + str(caps.get("available") is True))
    print("SONARA_FUSION_AVAILABLE=" + str(caps.get("fusionAvailable") is True))
    ready = (
        ROOT.is_dir() and bool(status) and fresh and revision == EXPECTED
        and not status.get("jobId") and state in
        {"waiting_for_authorized_job", "waiting_for_pro_activation"}
        and caps.get("available") is True and caps.get("fusionAvailable") is True
    )
    print("SONARA_QUALITY_V2_INSTALL_ELIGIBLE=" + str(ready))
    print("SONARA_NO_FILES_MODIFIED=True")
    print("SONARA_NO_AUDIO_JOBS_CREATED=True")
    print("SONARA_NO_CREDENTIALS_DISPLAYED=True")


if __name__ == "__main__":
    main()
