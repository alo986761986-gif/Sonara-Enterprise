#!/usr/bin/env python3
from __future__ import annotations
import hashlib
import json
import pathlib
import re
import time
import urllib.error
import urllib.request

API="http://127.0.0.1:8001"
ROOT=pathlib.Path("/marimo/SONARA-ACE-Step-CLEAN/sonara_training/physical_realism_v2/output")

def call(method,path,payload=None,timeout=120):
    body=None if payload is None else json.dumps(payload).encode("utf-8")
    req=urllib.request.Request(
        API+path,
        data=body,
        headers={"Content-Type":"application/json","User-Agent":"SONARA-LoRA-V2-Finalizer/1.0"},
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

def checkpoint(epoch):
    base=ROOT/"checkpoints"
    matches=sorted(base.glob(f"epoch_{epoch}_loss_*")) if base.is_dir() else []
    return matches[-1] if matches else None

def parsed_loss(path):
    m=re.search(r"_loss_([0-9.]+)$",path.name)
    return float(m.group(1)) if m else None

def adapter_info(checkpoint_dir):
    adapter=checkpoint_dir/"adapter"
    weights=adapter/"adapter_model.safetensors"
    config=adapter/"adapter_config.json"
    if not weights.is_file() or not config.is_file() or weights.stat().st_size<1024:
        raise SystemExit(f"CHECKPOINT_ADAPTER_INVALID={checkpoint_dir}")
    return {
        "checkpoint":str(checkpoint_dir),
        "adapterDir":str(adapter),
        "loss":parsed_loss(checkpoint_dir),
        "sha256":sha256(weights),
        "weightsBytes":weights.stat().st_size,
    }

def main():
    last=None
    while checkpoint(10) is None:
        status=call("GET","/v1/training/status",None,30)
        marker=(status.get("current_epoch"),status.get("current_step"),status.get("current_loss"),status.get("status"))
        if marker!=last:
            print("STATUS="+json.dumps({
                "epoch":status.get("current_epoch"),
                "step":status.get("current_step"),
                "loss":status.get("current_loss"),
                "status":status.get("status"),
            },separators=(",",":")),flush=True)
            last=marker
        if status.get("error"):
            raise SystemExit("TRAINING_ERROR="+str(status.get("error")))
        if not status.get("is_training") and checkpoint(10) is None:
            raise SystemExit("TRAINING_ENDED_BEFORE_EPOCH10")
        time.sleep(3)

    ck5=checkpoint(5)
    ck10=checkpoint(10)
    if ck5 is None or ck10 is None:
        raise SystemExit("REQUIRED_CHECKPOINT_MISSING")

    # Let official 10-epoch run finish its final save if it is still wrapping up.
    for _ in range(60):
        status=call("GET","/v1/training/status",None,30)
        if not status.get("is_training"):
            break
        time.sleep(1)

    info5=adapter_info(ck5)
    info10=adapter_info(ck10)

    # Training loss is diagnostic only, not a promotion metric.
    candidates=[info5,info10]
    comparable=[x for x in candidates if x["loss"] is not None]
    diagnostic_best=min(comparable,key=lambda x:x["loss"]) if comparable else info10

    report={
        "version":"sonara-physical-realism-v2-checkpoints",
        "datasetRows":192,
        "families":{
            "piano-keys":32,
            "guitars-fretted":64,
            "acoustic-drums":24,
            "bass":24,
            "bowed-strings":24,
            "brass-woodwinds":24,
        },
        "checkpoints":candidates,
        "diagnosticLowestTrainingLossEpoch":5 if diagnostic_best is info5 else 10,
        "selectedForDevelopmentEvaluation":info10["adapterDir"],
        "selectionReason":"Keep the completed epoch-10 adapter for development evaluation; epoch-5 is retained as rollback. Training loss alone does not authorize production promotion.",
        "promotionStatus":"BLOCKED_PHRASE_LEVEL_DATA_REQUIRED",
        "phraseLevelPerformances":0,
        "requiredPhraseLevelPerformances":24,
    }
    result=ROOT/"sonara_v2_checkpoint_report.json"
    result.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")

    print("V2_CHECKPOINT_5="+info5["checkpoint"],flush=True)
    print("V2_CHECKPOINT_5_LOSS="+str(info5["loss"]),flush=True)
    print("V2_CHECKPOINT_5_SHA256="+info5["sha256"],flush=True)
    print("V2_CHECKPOINT_10="+info10["checkpoint"],flush=True)
    print("V2_CHECKPOINT_10_LOSS="+str(info10["loss"]),flush=True)
    print("V2_CHECKPOINT_10_SHA256="+info10["sha256"],flush=True)
    print("V2_DEV_ADAPTER="+info10["adapterDir"],flush=True)
    print("V1_PRESERVED=True",flush=True)
    print("PROMOTION_STATUS=BLOCKED_PHRASE_LEVEL_DATA_REQUIRED",flush=True)
    print("NO_AUDIO_GENERATED=True",flush=True)
    print("RESULT_JSON="+str(result),flush=True)

if __name__=="__main__":
    main()
