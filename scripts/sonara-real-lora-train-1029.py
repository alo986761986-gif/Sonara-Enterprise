#!/usr/bin/env python3
from __future__ import annotations
import argparse
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
from datetime import datetime, timezone

AUDIO_EXTS={".wav",".flac",".mp3",".ogg",".opus",".m4a"}
ROOT=pathlib.Path("/marimo")
SIDESTEP=ROOT/"Side-Step"
ACE=ROOT/"SONARA-ACE-Step-CLEAN"/"ACE-Step-1.5"
DEFAULT_DATA=ROOT/"SONARA-LORA-DATASET"
DEFAULT_OUT=ROOT/"SONARA-LORA-OUTPUT"
DEFAULT_TENSORS=ROOT/"SONARA-LORA-TENSORS"
PIN_URL="https://github.com/koda-dernet/Side-Step.git"

def run(cmd,cwd=None):
    print("RUN="+" ".join(str(x) for x in cmd),flush=True)
    subprocess.run([str(x) for x in cmd],cwd=str(cwd) if cwd else None,check=True)

def load_json(path):
    with open(path,"r",encoding="utf-8") as f:
        return json.load(f)

def validate_dataset(data_dir:pathlib.Path,manifest:pathlib.Path,promotion:bool):
    if not data_dir.is_dir():
        raise SystemExit(f"DATASET_DIR_MISSING={data_dir}")
    if not manifest.is_file():
        raise SystemExit(f"DATASET_JSON_MISSING={manifest}")
    rows=load_json(manifest)
    if not isinstance(rows,list) or not rows:
        raise SystemExit("DATASET_JSON_INVALID")
    allowed={"OWNED","EXPLICITLY_LICENSED"}
    real_count=0
    families={}
    for row in rows:
        if not isinstance(row,dict):
            raise SystemExit("DATASET_ROW_INVALID")
        raw=row.get("audio_path") or row.get("filename")
        if not raw:
            raise SystemExit("DATASET_AUDIO_PATH_MISSING")
        p=(data_dir/pathlib.Path(str(raw))).resolve() if not pathlib.Path(str(raw)).is_absolute() else pathlib.Path(str(raw)).resolve()
        if p.suffix.lower() not in AUDIO_EXTS or not p.is_file():
            raise SystemExit(f"DATASET_AUDIO_INVALID={p}")
        license_type=str(row.get("license_type") or "").upper()
        if license_type not in allowed:
            raise SystemExit(f"DATASET_LICENSE_NOT_ALLOWED={license_type or 'MISSING'}")
        if row.get("rights_to_train") is not True:
            raise SystemExit("DATASET_RIGHTS_TO_TRAIN_REQUIRED")
        synthetic=bool(row.get("synthetic",False))
        if not synthetic:
            real_count+=1
        fam=str(row.get("instrument_family") or "unknown").strip().lower()
        families[fam]=families.get(fam,0)+1
        prompt=str(row.get("prompt_override") or row.get("prompt") or "").strip()
        if not prompt:
            raise SystemExit("DATASET_PROMPT_REQUIRED")
    if promotion and real_count < 50:
        raise SystemExit(f"PROMOTION_REQUIRES_50_REAL_TRACKS_CURRENT={real_count}")
    if promotion and real_count != len(rows):
        raise SystemExit("PROMOTION_REJECTS_SYNTHETIC_AUDIO")
    return {"tracks":len(rows),"realTracks":real_count,"families":families}

def ensure_tools():
    if not shutil.which("git"):
        raise SystemExit("GIT_MISSING")
    uv=shutil.which("uv")
    if not uv:
        raise SystemExit("UV_MISSING")
    if not SIDESTEP.is_dir():
        run(["git","clone","--depth","1",PIN_URL,str(SIDESTEP)])
    else:
        run(["git","fetch","--depth","1","origin","main"],cwd=SIDESTEP)
        run(["git","checkout","main"],cwd=SIDESTEP)
        run(["git","reset","--hard","origin/main"],cwd=SIDESTEP)
    run([uv,"sync"],cwd=SIDESTEP)
    return uv

def checkpoint_dir():
    candidates=[
        ACE/"checkpoints",
        ROOT/"SONARA-ACE-Step-CLEAN"/"checkpoints",
        ROOT/"checkpoints",
    ]
    for p in candidates:
        if p.is_dir():
            return p
    raise SystemExit("ACE_STEP_CHECKPOINT_DIR_NOT_FOUND")

def adapter_digest(path:pathlib.Path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            chunk=f.read(1024*1024)
            if not chunk: break
            h.update(chunk)
    return h.hexdigest()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--dataset-dir",default=str(DEFAULT_DATA))
    ap.add_argument("--dataset-json",default="")
    ap.add_argument("--tensor-dir",default=str(DEFAULT_TENSORS))
    ap.add_argument("--output-dir",default=str(DEFAULT_OUT))
    ap.add_argument("--epochs",type=int,default=150)
    ap.add_argument("--rank",type=int,default=64)
    ap.add_argument("--alpha",type=int,default=128)
    ap.add_argument("--promotion",action="store_true")
    args=ap.parse_args()

    data_dir=pathlib.Path(args.dataset_dir).resolve()
    manifest=pathlib.Path(args.dataset_json).resolve() if args.dataset_json else data_dir/"dataset.json"
    tensor_dir=pathlib.Path(args.tensor_dir).resolve()
    out_dir=pathlib.Path(args.output_dir).resolve()
    report=validate_dataset(data_dir,manifest,args.promotion)
    print("DATASET_VALID="+json.dumps(report,separators=(",",":")),flush=True)

    uv=ensure_tools()
    checkpoints=checkpoint_dir()
    tensor_dir.mkdir(parents=True,exist_ok=True)
    out_dir.mkdir(parents=True,exist_ok=True)

    preprocess=[
        uv,"run","python","train.py","fixed",
        "--checkpoint-dir",str(checkpoints),
        "--model-variant","turbo",
        "--preprocess",
        "--audio-dir",str(data_dir),
        "--dataset-json",str(manifest),
        "--tensor-output",str(tensor_dir),
        "--max-duration","240",
    ]
    run(preprocess,cwd=SIDESTEP)

    manifest_pt=tensor_dir/"manifest.json"
    pt_files=list(tensor_dir.glob("*.pt"))
    if not manifest_pt.is_file() or not pt_files:
        raise SystemExit("PREPROCESS_OUTPUT_INVALID")

    train=[
        uv,"run","python","train.py","fixed",
        "--checkpoint-dir",str(checkpoints),
        "--model-variant","turbo",
        "--dataset-dir",str(tensor_dir),
        "--output-dir",str(out_dir),
        "--epochs",str(args.epochs),
        "--batch-size","2",
        "--gradient-accumulation","2",
        "--lr","0.0001",
        "--adapter-type","lora",
        "--rank",str(args.rank),
        "--alpha",str(args.alpha),
        "--dropout","0.1",
        "--save-every","10",
        "--device","cuda",
        "--precision","bf16",
        "--shift","3.0",
        "--num-inference-steps","8",
        "--seed","42",
    ]
    run(train,cwd=SIDESTEP)

    final=out_dir/"final"
    cfg=final/"adapter_config.json"
    weights=final/"adapter_model.safetensors"
    if not cfg.is_file() or not weights.is_file() or weights.stat().st_size < 1024:
        # Side-Step recent builds may save directly in output_dir.
        cfg=out_dir/"adapter_config.json"
        weights=out_dir/"adapter_model.safetensors"
    if not cfg.is_file() or not weights.is_file() or weights.stat().st_size < 1024:
        raise SystemExit("REAL_LORA_ADAPTER_NOT_FOUND")
    if (out_dir/"adapter_model.bin").exists() or (final/"adapter_model.bin").exists():
        raise SystemExit("LEGACY_FAKE_ADAPTER_BIN_REJECTED")

    result={
        "version":"sonara-physical-realism-lora-v1",
        "trainedAt":datetime.now(timezone.utc).isoformat(),
        "dataset":report,
        "adapterDir":str(cfg.parent),
        "adapterConfig":str(cfg),
        "adapterWeights":str(weights),
        "adapterSha256":adapter_digest(weights),
        "weightsBytes":weights.stat().st_size,
        "modelVariant":"turbo",
        "rank":args.rank,
        "alpha":args.alpha,
        "epochs":args.epochs,
        "shift":3.0,
        "inferenceSteps":8,
        "promotionRequested":bool(args.promotion),
        "promotionStatus":"PENDING_BENCHMARK" if args.promotion else "DEVELOPMENT_ONLY",
    }
    report_path=out_dir/"sonara_lora_result.json"
    report_path.write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
    print("REAL_LORA_READY=True",flush=True)
    print("ADAPTER_DIR="+str(cfg.parent),flush=True)
    print("ADAPTER_SHA256="+result["adapterSha256"],flush=True)
    print("PROMOTION_STATUS="+result["promotionStatus"],flush=True)
    print("RESULT_JSON="+str(report_path),flush=True)

if __name__=="__main__":
    main()
