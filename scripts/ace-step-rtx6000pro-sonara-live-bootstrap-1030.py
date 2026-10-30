#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import pathlib
import subprocess
import sys
import urllib.request

SONARA_REPO="alo986761986-gif/Sonara-Enterprise"
SONARA_PIN="1d7f8b9a57ac434558e38cb021b7612dfc8096c5"
ACE_PIN="ca1e85fe9430179831e6bc6be790c332190a3866"
BASE_BOOTSTRAP="scripts/ace-step-rtx6000pro-sonara-live-bootstrap-1029.py"
RAW=f"https://raw.githubusercontent.com/{SONARA_REPO}/{SONARA_PIN}"

ROOT=pathlib.Path("/marimo/SONARA-ACE-Step-CLEAN")
RELAY=pathlib.Path.home()/".sonara"/"sonara_r2_pull_agent.py"
V2=ROOT/"sonara_training"/"physical_realism_v2_fixed"/"output"/"final"/"adapter_model.safetensors"
V3=ROOT/"sonara_training"/"physical_realism_v3_fixed"/"output"/"final"/"adapter_model.safetensors"

V2_SHA="6887ed270c8e4a67c589d6c41da0a57777ffd99470d1e89f196b988545c46bcc"
V3_SHA="23a582687d4c45f508e059753c06e8ca905c6e16b09aecfb65f89819d081907e"

def fetch_text(url:str)->str:
    req=urllib.request.Request(
        url,
        headers={
            "User-Agent":"SONARA-RTX6000PRO-LIVE-1030/1.0",
            "Cache-Control":"no-cache",
            "Accept":"text/plain",
        },
    )
    with urllib.request.urlopen(req,timeout=120) as response:
        return response.read().decode("utf-8")

def file_sha(path:pathlib.Path)->str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b=f.read(1024*1024)
            if not b:
                break
            h.update(b)
    return h.hexdigest()

def api_json(path:str)->dict:
    req=urllib.request.Request(
        "http://127.0.0.1:8001"+path,
        headers={
            "Accept":"application/json",
            "Cache-Control":"no-cache",
            "User-Agent":"SONARA-RTX6000PRO-LIVE-1030/1.0",
        },
    )
    with urllib.request.urlopen(req,timeout=30) as response:
        raw=response.read().decode("utf-8","replace")
    body=json.loads(raw) if raw else {}
    return body.get("data",body) if isinstance(body,dict) else {}

def main():
    print("=== SONARA LIVE 1030 - NEW RTX PRO 6000 NOTEBOOK ===",flush=True)
    print("SONARA_SOURCE_PIN="+SONARA_PIN,flush=True)
    print("ACE_STEP_SOURCE_PIN="+ACE_PIN,flush=True)
    print("TARGET_MODEL=acestep-v15-xl-turbo",flush=True)
    print("TARGET_LM=acestep-5Hz-lm-4B",flush=True)
    print("NO_TEST_GENERATION=True",flush=True)

    source=fetch_text(f"{RAW}/{BASE_BOOTSTRAP}")

    old_pin='SONARA_SOURCE_PIN = "d0a96e7ee744b5ae1d68083fbf39e17ed016a9cc"'
    new_pin=f'SONARA_SOURCE_PIN = "{SONARA_PIN}"'
    if old_pin not in source and new_pin not in source:
        raise SystemExit("BASE_BOOTSTRAP_PIN_MARKER_MISSING")
    source=source.replace(old_pin,new_pin)

    source=source.replace("2026-10-29","2026-10-30")
    source=source.replace("2026_10_29","2026_10_30")
    source=source.replace("LIVE-1029/1.0","LIVE-1030/1.0")

    target=pathlib.Path("/tmp/sonara-live-bootstrap-1030-pinned.py")
    target.write_text(source,encoding="utf-8")

    result=subprocess.run(
        ["python3",str(target)],
        text=True,
    )
    if result.returncode!=0:
        raise SystemExit("CORE_BOOTSTRAP_FAILED="+str(result.returncode))

    if not ROOT.is_dir():
        raise SystemExit("ACE_STEP_ROOT_MISSING_AFTER_BOOTSTRAP")

    head=subprocess.check_output(
        ["git","-C",str(ROOT),"rev-parse","HEAD"],
        text=True,
    ).strip()
    if head!=ACE_PIN:
        raise SystemExit("ACE_STEP_PIN_MISMATCH="+head)

    health=api_json("/health")
    if not (
        health.get("models_initialized") is True
        and health.get("llm_initialized") is True
        and health.get("loaded_model")=="acestep-v15-xl-turbo"
        and health.get("loaded_lm_model")=="acestep-5Hz-lm-4B"
    ):
        raise SystemExit("ACE_STEP_FINAL_HEALTH_INVALID="+json.dumps(health,separators=(",",":")))

    lora=api_json("/v1/lora/status")

    if not RELAY.is_file():
        raise SystemExit("RELAY_AGENT_MISSING")
    relay_text=RELAY.read_text(encoding="utf-8")
    if "REVISION = 'sonara-https-agent-guard-v5'" not in relay_text:
        raise SystemExit("RELAY_REVISION_INVALID")
    if "sonara-local-critic-v2-physical" not in relay_text:
        raise SystemExit("LOCAL_CRITIC_REVISION_INVALID")

    v2_present=V2.is_file()
    v3_present=V3.is_file()
    v2_ok=(file_sha(V2)==V2_SHA) if v2_present else False
    v3_ok=(file_sha(V3)==V3_SHA) if v3_present else False

    if v2_present and not v2_ok:
        raise SystemExit("V2_FIXED_SHA_MISMATCH")
    if v3_present and not v3_ok:
        raise SystemExit("V3_FIXED_SHA_MISMATCH")

    print("=== SONARA LIVE 1030 - FINAL STATE ===",flush=True)
    print("RTX6000PRO=READY",flush=True)
    print("ACE_STEP_COMMIT="+head,flush=True)
    print("ACE_STEP_READY=True",flush=True)
    print("MODEL=acestep-v15-xl-turbo",flush=True)
    print("LM_MODEL=acestep-5Hz-lm-4B",flush=True)
    print("MODELS_INITIALIZED=True",flush=True)
    print("LM_INITIALIZED=True",flush=True)
    print("FAST=1_STEP",flush=True)
    print("QUALITY=4_STEPS",flush=True)
    print("ULTRA=8_STEPS",flush=True)
    print("VOCAL_ASR_V3=READY",flush=True)
    print("RELAY_REVISION=sonara-https-agent-guard-v5",flush=True)
    print("LOCAL_CRITIC=sonara-local-critic-v2-physical",flush=True)
    print("PHYSICAL_REALISM_EDGE=sonara-instrument-realism-v6-physical-performance",flush=True)
    print("V2_FIXED_WEIGHTS_PRESENT="+str(v2_present),flush=True)
    print("V2_FIXED_SHA_OK="+str(v2_ok),flush=True)
    print("V3_FIXED_WEIGHTS_PRESENT="+str(v3_present),flush=True)
    print("V3_FIXED_SHA_OK="+str(v3_ok),flush=True)
    print("V3_PRODUCTION_POLICY=DEVELOPMENT_ONLY",flush=True)
    print("LORA_STATUS="+json.dumps(lora,separators=(",",":")),flush=True)
    print("NO_AUDIO_GENERATED=True",flush=True)
    if not v2_present:
        print("NEXT_ACTION=RESTORE_OR_RETRAIN_V2_FIXED_WEIGHTS",flush=True)
    else:
        print("NEXT_ACTION=VERIFY_RELAY_PAIRING_AND_SITE_GENERATION",flush=True)

if __name__=="__main__":
    main()
