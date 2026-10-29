#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import pathlib
import shutil
import subprocess
import sys

ROOT=pathlib.Path("/marimo/SONARA-ACE-Step-CLEAN")
CHECKPOINTS=ROOT/"checkpoints"
TENSORS=ROOT/"sonara_training"/"physical_realism_v2"/"tensors"
OUT=ROOT/"sonara_training"/"physical_realism_v2_fixed"/"output"
UV=shutil.which("uv") or "/usr/local/bin/uv"

OLD_ADAPTERS={
    "v1": ROOT/"sonara_training"/"physical_realism_v1"/"output"/"exported_epoch10"/"adapter"/"adapter_model.safetensors",
    "v2_epoch5": ROOT/"sonara_training"/"physical_realism_v2"/"output"/"checkpoints"/"epoch_5_loss_0.2194"/"adapter"/"adapter_model.safetensors",
    "v2_epoch10": ROOT/"sonara_training"/"physical_realism_v2"/"output"/"checkpoints"/"epoch_10_loss_0.2196"/"adapter"/"adapter_model.safetensors",
}

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            chunk=f.read(1024*1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def run(cmd,cwd=None,check=True):
    print("RUN="+" ".join(str(x) for x in cmd),flush=True)
    return subprocess.run(
        [str(x) for x in cmd],
        cwd=str(cwd) if cwd else None,
        text=True,
        check=check,
    )

def verify_adapter(path):
    code=r"""
import json,sys
from safetensors.torch import load_file
p=sys.argv[1]
w=load_file(p)
total=0
nonzero=0
max_abs=0.0
l2_sq=0.0
for t in w.values():
    x=t.float()
    total += x.numel()
    nonzero += int((x != 0).sum().item())
    if x.numel():
        max_abs=max(max_abs,float(x.abs().max().item()))
        l2_sq += float((x*x).sum().item())
print(json.dumps({
    "totalParams":total,
    "nonzeroParams":nonzero,
    "nonzeroPct":(100.0*nonzero/total) if total else 0.0,
    "maxAbs":max_abs,
    "l2":l2_sq**0.5,
},separators=(",",":")))
"""
    result=subprocess.run(
        [UV,"run","python","-c",code,str(path)],
        cwd=str(ROOT),
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout.strip().splitlines()[-1])

def find_checkpoint(epoch):
    base=OUT/"checkpoints"
    matches=sorted(base.glob(f"epoch_{epoch}_loss_*")) if base.is_dir() else []
    return matches[-1] if matches else None

def adapter_file(checkpoint_dir):
    p=pathlib.Path(checkpoint_dir)/"adapter_model.safetensors"
    if not p.is_file():
        raise SystemExit(f"FIXED_ADAPTER_MISSING={p}")
    return p

def main():
    if not ROOT.is_dir():
        raise SystemExit("ACE_ROOT_MISSING")
    if not (ROOT/"acestep"/"training_v2"/"trainer_fixed.py").is_file():
        raise SystemExit("ACE_TRAINING_V2_FIXED_MISSING")
    if not (ROOT/"train.py").is_file():
        raise SystemExit("ACE_TRAIN_PY_MISSING")
    if not (CHECKPOINTS/"acestep-v15-xl-turbo").is_dir():
        raise SystemExit("XL_TURBO_CHECKPOINT_MISSING")
    if not TENSORS.is_dir():
        raise SystemExit("V2_TENSORS_MISSING")
    pt_count=len(list(TENSORS.glob("*.pt")))
    if pt_count < 192:
        raise SystemExit(f"V2_TENSORS_INCOMPLETE={pt_count}")
    print("PREPROCESSED_TENSORS="+str(pt_count),flush=True)

    # Audit old API-trained adapters. They are retained only as forensic artifacts.
    for name,path in OLD_ADAPTERS.items():
        if path.is_file():
            info=verify_adapter(path)
            print("OLD_ADAPTER_AUDIT_"+name.upper()+"="+json.dumps({
                "sha256":sha256(path),
                **info,
            },separators=(",",":")),flush=True)
        else:
            print("OLD_ADAPTER_AUDIT_"+name.upper()+"=MISSING",flush=True)

    if OUT.exists():
        final_existing=OUT/"final"/"adapter_model.safetensors"
        if final_existing.is_file():
            print("FIXED_RUN_ALREADY_EXISTS=True",flush=True)
        else:
            shutil.rmtree(OUT)
    OUT.mkdir(parents=True,exist_ok=True)

    if not (OUT/"final"/"adapter_model.safetensors").is_file():
        cmd=[
            UV,"run","python","train.py",
            "--plain","--yes","fixed",
            "--checkpoint-dir",str(CHECKPOINTS),
            "--model-variant","xl_turbo",
            "--base-model","xl_turbo",
            "--dataset-dir",str(TENSORS),
            "--output-dir",str(OUT),
            "--device","cuda:0",
            "--precision","bf16",
            "--adapter-type","lora",
            "--rank","64",
            "--alpha","128",
            "--dropout","0.1",
            "--lr","0.0001",
            "--batch-size","1",
            "--gradient-accumulation","4",
            "--epochs","10",
            "--save-every","5",
            "--seed","42",
            "--optimizer-type","adamw",
            "--scheduler-type","cosine",
            "--gradient-checkpointing",
            "--offload-encoder",
            "--sample-every-n-epochs","0",
            "--cfg-ratio","0.15",
        ]
        run(cmd,cwd=ROOT,check=True)

    ck5=find_checkpoint(5)
    ck10=find_checkpoint(10)
    final_dir=OUT/"final"
    if ck5 is None or ck10 is None:
        raise SystemExit("FIXED_CHECKPOINTS_5_OR_10_MISSING")
    p5=adapter_file(ck5)
    p10=adapter_file(ck10)
    pf=adapter_file(final_dir)

    i5=verify_adapter(p5)
    i10=verify_adapter(p10)
    ifinal=verify_adapter(pf)
    h5=sha256(p5)
    h10=sha256(p10)
    hf=sha256(pf)

    print("FIXED_EPOCH5="+str(ck5),flush=True)
    print("FIXED_EPOCH5_SHA256="+h5,flush=True)
    print("FIXED_EPOCH5_METRICS="+json.dumps(i5,separators=(",",":")),flush=True)
    print("FIXED_EPOCH10="+str(ck10),flush=True)
    print("FIXED_EPOCH10_SHA256="+h10,flush=True)
    print("FIXED_EPOCH10_METRICS="+json.dumps(i10,separators=(",",":")),flush=True)
    print("FIXED_FINAL="+str(final_dir),flush=True)
    print("FIXED_FINAL_SHA256="+hf,flush=True)
    print("FIXED_FINAL_METRICS="+json.dumps(ifinal,separators=(",",":")),flush=True)

    if h5 == h10:
        raise SystemExit("FIXED_CHECKPOINT_HASHES_IDENTICAL")
    if i5["nonzeroParams"] <= 0 or i10["nonzeroParams"] <= 0 or ifinal["nonzeroParams"] <= 0:
        raise SystemExit("FIXED_ADAPTER_ZERO_WEIGHTS")
    if i10["maxAbs"] <= 0.0 or ifinal["maxAbs"] <= 0.0:
        raise SystemExit("FIXED_ADAPTER_NO_EFFECT")

    report={
        "version":"sonara-physical-realism-v2-fixed",
        "trainer":"ACE-Step training_v2 fixed",
        "datasetRows":192,
        "preprocessedTensors":pt_count,
        "epoch5":{"path":str(ck5),"sha256":h5,**i5},
        "epoch10":{"path":str(ck10),"sha256":h10,**i10},
        "final":{"path":str(final_dir),"sha256":hf,**ifinal},
        "checkpointWeightsChanged":h5!=h10,
        "promotionStatus":"BLOCKED_PHRASE_LEVEL_DATA_REQUIRED",
        "audioGeneratedDuringTraining":False,
    }
    result=OUT/"sonara_v2_fixed_report.json"
    result.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")

    print("TRAINER=ACE_STEP_TRAINING_V2_FIXED",flush=True)
    print("CHECKPOINT_WEIGHTS_CHANGED=True",flush=True)
    print("REAL_LORA_FIXED_READY=True",flush=True)
    print("PROMOTION_STATUS=BLOCKED_PHRASE_LEVEL_DATA_REQUIRED",flush=True)
    print("NO_AUDIO_GENERATED=True",flush=True)
    print("RESULT_JSON="+str(result),flush=True)

if __name__=="__main__":
    main()
