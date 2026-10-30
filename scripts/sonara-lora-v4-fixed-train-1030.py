#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import pathlib
import shutil
import subprocess

ROOT=pathlib.Path("/marimo/SONARA-ACE-Step-CLEAN")
CHECKPOINTS=ROOT/"checkpoints"
V4_WORK=ROOT/"sonara_training"/"physical_realism_v4"
TENSORS=V4_WORK/"tensors"
PREPROCESS_REPORT=V4_WORK/"sonara_v4_preprocess_report.json"
OUT=ROOT/"sonara_training"/"physical_realism_v4_fixed"/"output"
UV=shutil.which("uv") or "/usr/local/bin/uv"

V3_FIXED=ROOT/"sonara_training"/"physical_realism_v3_fixed"/"output"/"final"/"adapter_model.safetensors"

EXPECTED_TENSORS_MIN=320
EXPECTED_MODEL="acestep-v15-xl-turbo"

def sha256(path:pathlib.Path)->str:
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            chunk=f.read(1024*1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def run(cmd,cwd=None):
    print("RUN="+" ".join(str(x) for x in cmd),flush=True)
    return subprocess.run(
        [str(x) for x in cmd],
        cwd=str(cwd) if cwd else None,
        text=True,
        check=True,
    )

def verify_adapter(path:pathlib.Path):
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
    lines=[x for x in result.stdout.splitlines() if x.strip()]
    if not lines:
        raise SystemExit("V4_ADAPTER_AUDIT_NO_OUTPUT")
    return json.loads(lines[-1])

def tensor_count():
    return len([
        p for p in TENSORS.glob("*.pt")
        if not p.name.endswith(".tmp.pt")
    ])

def tensor_inventory_digest():
    h=hashlib.sha256()
    for p in sorted(
        (x for x in TENSORS.glob("*.pt") if not x.name.endswith(".tmp.pt")),
        key=lambda x:x.name,
    ):
        stat=p.stat()
        h.update(p.name.encode("utf-8"))
        h.update(b"\0")
        h.update(str(stat.st_size).encode("ascii"))
        h.update(b"\n")
    return h.hexdigest()

def load_preprocess_report():
    if not PREPROCESS_REPORT.is_file():
        raise SystemExit("V4_PREPROCESS_REPORT_MISSING")
    data=json.loads(PREPROCESS_REPORT.read_text(encoding="utf-8"))
    dataset_rows=int(data.get("datasetRows") or 0)
    if dataset_rows < EXPECTED_TENSORS_MIN:
        raise SystemExit("V4_PREPROCESS_REPORT_ROW_COUNT_INVALID")
    audit=data.get("tensorAudit") or {}
    if int(audit.get("count") or 0) != dataset_rows:
        raise SystemExit("V4_PREPROCESS_REPORT_TENSOR_COUNT_INVALID")
    if audit.get("badCount") != 0:
        raise SystemExit("V4_PREPROCESS_REPORT_BAD_TENSORS")
    gate=data.get("promotionGate") or {}
    if gate.get("humanPhraseLevel",0) < 60:
        raise SystemExit("V4_PREPROCESS_REPORT_PHRASE_GATE_INVALID")
    if gate.get("phraseFamilyCoverage",0) < 6:
        raise SystemExit("V4_PREPROCESS_REPORT_PHRASE_FAMILY_GATE_INVALID")
    return data

def find_checkpoint(epoch:int):
    base=OUT/"checkpoints"
    matches=sorted(base.glob(f"epoch_{epoch}_loss_*")) if base.is_dir() else []
    return matches[-1] if matches else None

def adapter_file(folder:pathlib.Path):
    p=pathlib.Path(folder)/"adapter_model.safetensors"
    if not p.is_file():
        raise SystemExit(f"V4_ADAPTER_MISSING={p}")
    if p.stat().st_size < 1024:
        raise SystemExit(f"V4_ADAPTER_TOO_SMALL={p}")
    return p

def gpu_snapshot():
    smi=shutil.which("nvidia-smi")
    if not smi:
        print("GPU_SNAPSHOT=UNAVAILABLE",flush=True)
        return
    try:
        r=subprocess.run(
            [
                smi,
                "--query-gpu=name,memory.total,memory.used,memory.free",
                "--format=csv,noheader,nounits",
            ],
            text=True,
            capture_output=True,
            timeout=20,
            check=True,
        )
        print("GPU_SNAPSHOT="+r.stdout.strip().replace("\n"," | "),flush=True)
    except Exception as exc:
        print("GPU_SNAPSHOT_ERROR="+str(exc),flush=True)

def main():
    if not ROOT.is_dir():
        raise SystemExit("ACE_ROOT_MISSING")
    if not (ROOT/"acestep"/"training_v2"/"trainer_fixed.py").is_file():
        raise SystemExit("ACE_TRAINING_V4_FIXED_MISSING")
    if not (ROOT/"train.py").is_file():
        raise SystemExit("ACE_TRAIN_PY_MISSING")
    if not (CHECKPOINTS/EXPECTED_MODEL).is_dir():
        raise SystemExit("XL_TURBO_CHECKPOINT_MISSING")
    if not TENSORS.is_dir():
        raise SystemExit("V4_TENSORS_MISSING")

    prep=load_preprocess_report()
    count=tensor_count()
    expected_count=int(prep.get("datasetRows") or 0)
    if expected_count < EXPECTED_TENSORS_MIN or count != expected_count:
        raise SystemExit(f"V4_TENSORS_INCOMPLETE={count}/{expected_count}")

    source_sha=str(prep.get("sourceDatasetSha256") or "")
    if not source_sha:
        raise SystemExit("V4_SOURCE_DATASET_SHA_MISSING")

    print("V4_PREPROCESSED_TENSORS="+str(count),flush=True)
    print("V4_SOURCE_DATASET_SHA256="+source_sha,flush=True)
    print("V4_TENSOR_INVENTORY_SHA256="+tensor_inventory_digest(),flush=True)
    print("MODEL_DIR_RESOLVED="+str(CHECKPOINTS/EXPECTED_MODEL),flush=True)
    print("TRAINER=ACE_STEP_TRAINING_V4_FIXED",flush=True)
    print("AUDIO_SAMPLING_DURING_TRAINING=False",flush=True)
    gpu_snapshot()

    if V4_FIXED.is_file():
        v3_sha=sha256(V3_FIXED)
        print("V3_FIXED_REFERENCE_SHA256="+v3_sha,flush=True)
    else:
        v3_sha=None
        print("V3_FIXED_REFERENCE_SHA256=MISSING",flush=True)

    final_existing=OUT/"final"/"adapter_model.safetensors"
    if OUT.exists() and not final_existing.is_file():
        print("V4_PARTIAL_OUTPUT_FOUND=True",flush=True)
        print("V4_PARTIAL_OUTPUT_ACTION=RESET_CLEAN",flush=True)
        shutil.rmtree(OUT)

    OUT.mkdir(parents=True,exist_ok=True)

    if not final_existing.is_file():
        cmd=[
            UV,"run","python","train.py",
            "--plain","--yes","fixed",
            "--checkpoint-dir",str(CHECKPOINTS),
            "--model-variant",EXPECTED_MODEL,
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
        run(cmd,cwd=ROOT)
    else:
        print("V4_FIXED_RUN_ALREADY_EXISTS=True",flush=True)

    ck5=find_checkpoint(5)
    ck10=find_checkpoint(10)
    final_dir=OUT/"final"

    if ck5 is None or ck10 is None:
        raise SystemExit("V4_FIXED_CHECKPOINTS_5_OR_10_MISSING")

    p5=adapter_file(ck5)
    p10=adapter_file(ck10)
    pf=adapter_file(final_dir)

    i5=verify_adapter(p5)
    i10=verify_adapter(p10)
    ifinal=verify_adapter(pf)

    h5=sha256(p5)
    h10=sha256(p10)
    hf=sha256(pf)

    print("V4_FIXED_EPOCH5="+str(ck5),flush=True)
    print("V4_FIXED_EPOCH5_SHA256="+h5,flush=True)
    print("V4_FIXED_EPOCH5_METRICS="+json.dumps(i5,separators=(",",":")),flush=True)

    print("V4_FIXED_EPOCH10="+str(ck10),flush=True)
    print("V4_FIXED_EPOCH10_SHA256="+h10,flush=True)
    print("V4_FIXED_EPOCH10_METRICS="+json.dumps(i10,separators=(",",":")),flush=True)

    print("V4_FIXED_FINAL="+str(final_dir),flush=True)
    print("V4_FIXED_FINAL_SHA256="+hf,flush=True)
    print("V4_FIXED_FINAL_METRICS="+json.dumps(ifinal,separators=(",",":")),flush=True)

    if h5 == h10:
        raise SystemExit("V4_FIXED_CHECKPOINT_HASHES_IDENTICAL")
    if hf != h10:
        raise SystemExit("V4_FINAL_DOES_NOT_MATCH_EPOCH10")
    if any(x["nonzeroParams"]<=0 for x in (i5,i10,ifinal)):
        raise SystemExit("V4_FIXED_ADAPTER_ZERO_WEIGHTS")
    if i10["maxAbs"]<=0.0 or ifinal["maxAbs"]<=0.0:
        raise SystemExit("V4_FIXED_ADAPTER_NO_EFFECT")
    if i10["totalParams"] != 83886080 or ifinal["totalParams"] != 83886080:
        raise SystemExit(
            "V4_FIXED_PARAMETER_COUNT_UNEXPECTED="
            +str(i10["totalParams"])+"/"+str(ifinal["totalParams"])
        )
    if v3_sha and hf == v3_sha:
        raise SystemExit("V4_FINAL_IDENTICAL_TO_V4_FIXED")

    report={
        "version":"sonara-physical-realism-v4-fixed",
        "trainer":"ACE-Step training_v2 fixed",
        "baseModel":EXPECTED_MODEL,
        "datasetRows":count,
        "sourceDatasetSha256":source_sha,
        "tensorInventorySha256":tensor_inventory_digest(),
        "preprocessedTensors":count,
        "training":{
            "epochs":10,
            "batchSize":1,
            "gradientAccumulation":4,
            "effectiveBatchSize":4,
            "learningRate":1e-4,
            "rank":64,
            "alpha":128,
            "dropout":0.1,
            "optimizer":"adamw",
            "scheduler":"cosine",
            "cfgRatio":0.15,
            "precision":"bf16",
            "gradientCheckpointing":True,
            "offloadEncoder":True,
            "sampleEveryNEpochs":0,
        },
        "epoch5":{"path":str(ck5),"sha256":h5,**i5},
        "epoch10":{"path":str(ck10),"sha256":h10,**i10},
        "final":{"path":str(final_dir),"sha256":hf,**ifinal},
        "checkpointWeightsChanged":h5!=h10,
        "finalMatchesEpoch10":hf==h10,
        "differentFromV3Fixed":(hf!=v3_sha) if v3_sha else None,
        "datasetPromotionGatePassed":True,
        "audioGeneratedDuringTraining":False,
        "promotionStatus":"PENDING_V3_V4_AUDIO_BENCHMARK",
    }

    result=OUT/"sonara_v4_fixed_report.json"
    result.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")

    print("CHECKPOINT_WEIGHTS_CHANGED=True",flush=True)
    print("FINAL_MATCHES_EPOCH10=True",flush=True)
    if v3_sha:
        print("DIFFERENT_FROM_V3_FIXED=True",flush=True)
    print("REAL_LORA_V4_FIXED_READY=True",flush=True)
    print("PROMOTION_STATUS=PENDING_V3_V4_AUDIO_BENCHMARK",flush=True)
    print("NO_AUDIO_GENERATED=True",flush=True)
    print("RESULT_JSON="+str(result),flush=True)

if __name__=="__main__":
    main()
