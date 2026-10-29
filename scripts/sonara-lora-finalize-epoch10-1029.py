#!/usr/bin/env python3
from __future__ import annotations
import hashlib
import json
import pathlib
import time
import urllib.error
import urllib.request

API="http://127.0.0.1:8001"
SAFE_ROOT=pathlib.Path("/marimo/SONARA-ACE-Step-CLEAN")
OUT=SAFE_ROOT/"sonara_training"/"physical_realism_v1"/"output"
EXPORT=OUT/"exported_epoch10"

def call(method,path,payload=None,timeout=120):
    body=None if payload is None else json.dumps(payload).encode("utf-8")
    req=urllib.request.Request(
        API+path,
        data=body,
        headers={"Content-Type":"application/json","User-Agent":"SONARA-LoRA-Finalizer/1.0"},
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
            chunk=f.read(1024*1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def checkpoint10_ready():
    ckpt=OUT/"checkpoints"
    if not ckpt.is_dir():
        return None
    matches=sorted(ckpt.glob("epoch_10*"))
    return matches[-1] if matches else None

def main():
    last=None
    checkpoint=checkpoint10_ready()
    while checkpoint is None:
        status=call("GET","/v1/training/status",None,30)
        marker=(status.get("current_epoch"),status.get("current_step"),status.get("current_loss"),status.get("status"))
        if marker != last:
            print("STATUS="+json.dumps({
                "epoch":status.get("current_epoch"),
                "step":status.get("current_step"),
                "loss":status.get("current_loss"),
                "status":status.get("status"),
            },separators=(",",":")),flush=True)
            last=marker
        if status.get("error"):
            raise SystemExit("TRAINING_ERROR="+str(status.get("error")))
        checkpoint=checkpoint10_ready()
        if checkpoint is not None:
            break
        if not status.get("is_training"):
            raise SystemExit("TRAINING_STOPPED_BEFORE_EPOCH10_CHECKPOINT")
        time.sleep(3)

    print("EPOCH10_CHECKPOINT="+str(checkpoint),flush=True)

    status=call("GET","/v1/training/status",None,30)
    if status.get("is_training"):
        call("POST","/v1/training/stop",{},30)
        print("STOP_REQUESTED=True",flush=True)

    for _ in range(60):
        status=call("GET","/v1/training/status",None,30)
        if not status.get("is_training"):
            break
        time.sleep(1)
    if status.get("is_training"):
        raise SystemExit("TRAINING_DID_NOT_STOP")

    result=call("POST","/v1/training/export",{
        "export_path":str(EXPORT),
        "lora_output_dir":str(OUT),
    },120)
    weights=EXPORT/"adapter_model.safetensors"
    cfg=EXPORT/"adapter_config.json"
    if not weights.is_file() or weights.stat().st_size < 1024:
        raise SystemExit("ADAPTER_SAFETENSORS_MISSING")
    if not cfg.is_file():
        raise SystemExit("ADAPTER_CONFIG_MISSING")

    summary={
        "checkpoint":str(checkpoint),
        "exportDir":str(EXPORT),
        "weights":str(weights),
        "weightsBytes":weights.stat().st_size,
        "sha256":sha256(weights),
        "status":"DEVELOPMENT_ONLY",
        "promotionReady":False,
        "reason":"Bootstrap corpus currently covers piano and guitars only.",
    }
    report=OUT/"sonara_epoch10_finalizer.json"
    report.write_text(json.dumps(summary,indent=2)+"\n",encoding="utf-8")
    print("REAL_LORA_READY=True",flush=True)
    print("CHECKPOINT_EPOCH=10",flush=True)
    print("ADAPTER_DIR="+str(EXPORT),flush=True)
    print("ADAPTER_SHA256="+summary["sha256"],flush=True)
    print("PROMOTION_STATUS=DEVELOPMENT_ONLY",flush=True)
    print("RESULT_JSON="+str(report),flush=True)

if __name__=="__main__":
    main()
