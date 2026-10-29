#!/usr/bin/env python3
from __future__ import annotations
import hashlib, json, pathlib, urllib.request, urllib.error

API="http://127.0.0.1:8001"
MODEL="acestep-v15-xl-turbo"
ADAPTER=pathlib.Path("/marimo/SONARA-ACE-Step-CLEAN/sonara_training/physical_realism_v2_fixed/output/final")
EXPECTED_SHA256="6887ed270c8e4a67c589d6c41da0a57777ffd99470d1e89f196b988545c46bcc"
ADAPTER_NAME="sonara_physical_realism_v2_fixed_dev"
SCALE=0.60

def call(method,path,payload=None,timeout=180):
    body=None if payload is None else json.dumps(payload).encode("utf-8")
    req=urllib.request.Request(
        API+path,
        data=body,
        headers={"Content-Type":"application/json","User-Agent":"SONARA-LoRA-V2-Fixed-Loader/1.0"},
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
            if not b: break
            h.update(b)
    return h.hexdigest()

def main():
    weights=ADAPTER/"adapter_model.safetensors"
    config=ADAPTER/"adapter_config.json"
    if not weights.is_file() or not config.is_file():
        raise SystemExit("V2_FIXED_ADAPTER_FILES_MISSING")
    digest=sha256(weights)
    print("ADAPTER_SHA256="+digest,flush=True)
    if digest!=EXPECTED_SHA256:
        raise SystemExit("V2_FIXED_SHA256_MISMATCH")
    print("ADAPTER_VERIFIED=True",flush=True)

    call("POST","/v1/reinitialize",{},300)
    print("BASE_MODEL_REINITIALIZED=True",flush=True)

    call("POST","/v1/lora/load",{
        "lora_path":str(ADAPTER),
        "adapter_name":ADAPTER_NAME,
    },180)
    print("LORA_LOADED=True",flush=True)

    call("POST","/v1/lora/scale",{
        "scale":SCALE,
        "adapter_name":ADAPTER_NAME,
    },60)
    print("LORA_SCALE="+str(SCALE),flush=True)

    call("POST","/v1/lora/toggle",{"use_lora":False},60)
    status=call("GET","/v1/lora/status",None,30)
    print("LORA_STATUS="+json.dumps(status,separators=(",",":")),flush=True)
    print("DEVELOPMENT_ONLY=True",flush=True)
    print("LORA_ACTIVE=False",flush=True)
    print("NO_AUDIO_GENERATED=True",flush=True)

if __name__=="__main__":
    main()
