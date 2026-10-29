#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import pathlib
import urllib.error
import urllib.request

API="http://127.0.0.1:8001"
ADAPTER=pathlib.Path("/marimo/SONARA-ACE-Step-CLEAN/sonara_training/physical_realism_v3_fixed/output/final")
EXPECTED_SHA256="23a582687d4c45f508e059753c06e8ca905c6e16b09aecfb65f89819d081907e"
ADAPTER_NAME="sonara_physical_realism_v3_fixed_dev"
SCALE=0.55

def call(method,path,payload=None,timeout=180):
    body=None if payload is None else json.dumps(payload).encode("utf-8")
    req=urllib.request.Request(
        API+path,
        data=body,
        headers={
            "Content-Type":"application/json",
            "User-Agent":"SONARA-LoRA-V3-Fixed-Loader/1.0",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req,timeout=timeout) as response:
            raw=response.read()
    except urllib.error.HTTPError as exc:
        detail=exc.read().decode("utf-8","replace")[:2000]
        raise RuntimeError(f"HTTP_{exc.code}:{path}:{detail}") from exc
    data=json.loads(raw.decode("utf-8")) if raw else {}
    if isinstance(data,dict) and data.get("code") not in (None,200):
        raise RuntimeError(f"ACE_API_ERROR:{path}:{data.get('error')}")
    return data.get("data",data) if isinstance(data,dict) else data

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            b=f.read(1024*1024)
            if not b:
                break
            h.update(b)
    return h.hexdigest()

def main():
    weights=ADAPTER/"adapter_model.safetensors"
    config=ADAPTER/"adapter_config.json"

    if not weights.is_file() or not config.is_file():
        raise SystemExit("V3_FIXED_ADAPTER_FILES_MISSING")

    digest=sha256(weights)
    print("V3_ADAPTER_SHA256="+digest,flush=True)
    if digest!=EXPECTED_SHA256:
        raise SystemExit("V3_FIXED_SHA256_MISMATCH")
    print("V3_ADAPTER_VERIFIED=True",flush=True)

    call("POST","/v1/reinitialize",{},300)
    print("BASE_MODEL_REINITIALIZED=True",flush=True)

    call("POST","/v1/lora/load",{
        "lora_path":str(ADAPTER),
        "adapter_name":ADAPTER_NAME,
    },180)
    print("V3_LORA_LOADED=True",flush=True)

    call("POST","/v1/lora/scale",{
        "scale":SCALE,
        "adapter_name":ADAPTER_NAME,
    },60)
    print("V3_LORA_SCALE="+str(SCALE),flush=True)

    # Keep the adapter loaded but OFF until the controlled audio benchmark.
    call("POST","/v1/lora/toggle",{"use_lora":False},60)
    status=call("GET","/v1/lora/status",None,30)

    loaded=bool(status.get("lora_loaded"))
    active=status.get("active_adapter")
    use_lora=bool(status.get("use_lora"))

    if not loaded:
        raise SystemExit("V3_LORA_STATUS_NOT_LOADED")
    if active!=ADAPTER_NAME:
        raise SystemExit("V3_LORA_ACTIVE_ADAPTER_MISMATCH="+str(active))
    if use_lora:
        raise SystemExit("V3_LORA_UNEXPECTEDLY_ENABLED")

    print("V3_LORA_STATUS="+json.dumps(status,separators=(",",":")),flush=True)
    print("DEVELOPMENT_CANDIDATE=True",flush=True)
    print("PROMOTION_STATUS=PENDING_AUDIO_BENCHMARK",flush=True)
    print("V3_LORA_ACTIVE=False",flush=True)
    print("NO_AUDIO_GENERATED=True",flush=True)

if __name__=="__main__":
    main()
