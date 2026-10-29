#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import os
import shutil
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

API="http://127.0.0.1:8001"
ROOT=pathlib.Path("/marimo")
DEFAULT_DATA=ROOT/"SONARA-LORA-DATASET"
DEFAULT_TENSORS=ROOT/"SONARA-LORA-TENSORS"
DEFAULT_OUT=ROOT/"SONARA-LORA-OFFICIAL-OUTPUT"
KNOWN_ACE_ROOTS=[
    ROOT/"SONARA-ACE-Step-CLEAN"/"ACE-Step-1.5",
    ROOT/"ACE-Step-1.5",
    ROOT/"ACE-Step",
]
TAG="<SONARA_PHYSICAL_REALISM>"
AUDIO_EXTS={".wav",".flac",".mp3",".ogg",".opus",".m4a",".aac"}

def call(method,path,payload=None,timeout=300):
    body=None
    headers={"Content-Type":"application/json","User-Agent":"SONARA-Official-LoRA/1.0"}
    if payload is not None:
        body=json.dumps(payload).encode("utf-8")
    req=urllib.request.Request(API+path,data=body,headers=headers,method=method)
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

def load_manifest(path):
    with open(path,"r",encoding="utf-8") as f:
        rows=json.load(f)
    if not isinstance(rows,list) or not rows:
        raise SystemExit("DATASET_JSON_INVALID")
    return rows

def resolve_audio(data_dir,row):
    raw=row.get("audio_path") or row.get("filename")
    if not raw:
        raise SystemExit("DATASET_AUDIO_PATH_MISSING")
    p=pathlib.Path(str(raw))
    if not p.is_absolute():
        p=data_dir/p
    p=p.resolve()
    if p.suffix.lower() not in AUDIO_EXTS or not p.is_file():
        raise SystemExit(f"DATASET_AUDIO_INVALID={p}")
    return p

def validate_dataset(data_dir,manifest,promotion):
    rows=load_manifest(manifest)
    allowed={"OWNED","EXPLICITLY_LICENSED","CC0_PUBLIC_DOMAIN"}
    real_count=0
    resolved=[]
    families={}
    for idx,row in enumerate(rows):
        if not isinstance(row,dict):
            raise SystemExit(f"DATASET_ROW_INVALID={idx}")
        p=resolve_audio(data_dir,row)
        license_type=str(row.get("license_type") or "").upper()
        if license_type not in allowed:
            raise SystemExit(f"DATASET_LICENSE_NOT_ALLOWED={idx}:{license_type or 'MISSING'}")
        if row.get("rights_to_train") is not True:
            raise SystemExit(f"DATASET_RIGHTS_TO_TRAIN_REQUIRED={idx}")
        synthetic=bool(row.get("synthetic",False))
        if not synthetic:
            real_count+=1
        family=str(row.get("instrument_family") or "unknown").strip().lower()
        families[family]=families.get(family,0)+1
        prompt=str(row.get("prompt_override") or row.get("prompt") or "").strip()
        if not prompt:
            raise SystemExit(f"DATASET_PROMPT_REQUIRED={idx}")
        resolved.append((row,p))
    required_families={"acoustic-drums","piano-keys","guitars-fretted","bass","bowed-strings","brass-woodwinds"}
    present_families={family for family,count in families.items() if count>0}
    missing_families=sorted(required_families-present_families)
    max_family_share=(max(families.values())/len(rows)) if rows else 1.0
    if promotion and real_count < 50:
        raise SystemExit(f"PROMOTION_REQUIRES_50_REAL_TRACKS_CURRENT={real_count}")
    if promotion and real_count != len(rows):
        raise SystemExit("PROMOTION_REJECTS_SYNTHETIC_AUDIO")
    if promotion and missing_families:
        raise SystemExit("PROMOTION_MISSING_FAMILIES="+",".join(missing_families))
    if promotion and max_family_share > 0.40:
        raise SystemExit(f"PROMOTION_FAMILY_IMBALANCE_MAX_SHARE={max_family_share:.4f}")
    return rows,resolved,{
        "tracks":len(rows),
        "realTracks":real_count,
        "families":families,
        "missingPromotionFamilies":missing_families,
        "maxFamilyShare":round(max_family_share,4),
    }

def _looks_like_ace_root(path):
    path=pathlib.Path(path)
    return path.is_dir() and (path/"acestep").is_dir()


def detect_ace_api_root():
    candidates=[]
    proc=pathlib.Path("/proc")
    if proc.is_dir():
        for item in proc.iterdir():
            if not item.name.isdigit():
                continue
            try:
                cmd=(item/"cmdline").read_bytes().replace(b"\x00",b" ").decode("utf-8","ignore")
                if "acestep.api_server" not in cmd and "api_server.py" not in cmd:
                    continue
                cwd=pathlib.Path(os.readlink(item/"cwd")).resolve()
                candidates.append(cwd)
            except Exception:
                continue
    candidates.extend(KNOWN_ACE_ROOTS)
    seen=set()
    for candidate in candidates:
        try:
            resolved=pathlib.Path(candidate).resolve()
        except Exception:
            continue
        key=str(resolved)
        if key in seen:
            continue
        seen.add(key)
        if _looks_like_ace_root(resolved):
            return resolved
    raise SystemExit("ACE_STEP_SAFE_ROOT_NOT_FOUND")


def stage_dataset_inside_safe_root(source_dir, resolved, safe_root, run_name):
    safe_name="".join(ch if ch.isalnum() or ch in ("-","_") else "_" for ch in run_name).strip("_")
    if not safe_name:
        raise SystemExit("RUN_NAME_INVALID")
    workspace=safe_root/"sonara_training"/safe_name
    audio_dir=workspace/"audio"
    tensor_dir=workspace/"tensors"
    out_dir=workspace/"output"
    audio_dir.mkdir(parents=True,exist_ok=True)
    tensor_dir.mkdir(parents=True,exist_ok=True)
    out_dir.mkdir(parents=True,exist_ok=True)

    staged=[]
    for index,(row,source_path) in enumerate(resolved):
        collection=str(row.get("source_collection") or pathlib.Path(str(row.get("audio_path") or "")).parent.name or "source")
        dest_dir=audio_dir/collection
        dest_dir.mkdir(parents=True,exist_ok=True)
        dest=dest_dir/pathlib.Path(source_path).name
        if dest.exists():
            try:
                if dest.stat().st_size != pathlib.Path(source_path).stat().st_size:
                    dest.unlink()
            except Exception:
                dest.unlink(missing_ok=True)
        if not dest.exists():
            try:
                os.link(source_path,dest)
            except Exception:
                shutil.copy2(source_path,dest)
        staged_row=dict(row)
        staged_row["audio_path"]=str(dest)
        staged.append((staged_row,dest))

    print("ACE_STEP_SAFE_ROOT="+str(safe_root),flush=True)
    print("STAGED_AUDIO_DIR="+str(audio_dir),flush=True)
    print("STAGED_AUDIO_FILES="+str(len(staged)),flush=True)
    return workspace,audio_dir,tensor_dir,out_dir,staged


def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            chunk=f.read(1024*1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def healthcheck():
    health=call("GET","/health",None,30)
    if not isinstance(health,dict):
        raise SystemExit("ACE_STEP_HEALTH_INVALID")
    print("ACE_STEP_HEALTH=OK",flush=True)

def configure_dataset(data_dir,resolved):
    scanned=call("POST","/v1/dataset/scan",{
        "audio_dir":str(data_dir),
        "dataset_name":"sonara_physical_realism_v1",
        "custom_tag":TAG,
        "tag_position":"prepend",
        "all_instrumental":True,
    },120)
    samples=scanned.get("samples",[]) if isinstance(scanned,dict) else []
    if not samples:
        raise SystemExit("ACE_DATASET_SCAN_EMPTY")

    by_path={str(path):row for row,path in resolved}
    by_name={}
    for row,path in resolved:
        by_name.setdefault(path.name,[]).append(row)

    updated=0
    for sample in samples:
        idx=int(sample.get("index"))
        sample_path=pathlib.Path(str(sample.get("audio_path") or "")).resolve()
        row=by_path.get(str(sample_path))
        if row is None:
            matches=by_name.get(sample_path.name,[])
            if len(matches)==1:
                row=matches[0]
        if row is None:
            continue
        caption=str(row.get("prompt_override") or row.get("prompt") or "").strip()
        genre=str(row.get("genre") or row.get("instrument_family") or "Recorded performance")
        payload={
            "sample_idx":idx,
            "caption":caption,
            "genre":genre,
            "prompt_override":"caption",
            "lyrics":"[Instrumental]",
            "bpm":row.get("bpm"),
            "keyscale":str(row.get("key") or row.get("keyscale") or ""),
            "timesignature":str(row.get("time_signature") or row.get("timesignature") or "4"),
            "language":"unknown",
            "is_instrumental":True,
        }
        call("PUT",f"/v1/dataset/sample/{idx}",payload,60)
        updated+=1
    if updated != len(resolved):
        raise SystemExit(f"ACE_DATASET_MAPPING_INCOMPLETE={updated}/{len(resolved)}")

    save_path=data_dir/"sonara_physical_realism_official.json"
    call("POST","/v1/dataset/save",{
        "save_path":str(save_path),
        "dataset_name":"sonara_physical_realism_v1",
        "custom_tag":TAG,
        "tag_position":"prepend",
        "all_instrumental":True,
        "genre_ratio":0,
    },60)
    return save_path

def preprocess(tensor_dir):
    tensor_dir.mkdir(parents=True,exist_ok=True)
    result=call("POST","/v1/dataset/preprocess",{
        "output_dir":str(tensor_dir),
        "skip_existing":False,
    },3600)
    count=int(result.get("num_tensors") or 0) if isinstance(result,dict) else 0
    if count <= 0:
        raise SystemExit("ACE_PREPROCESS_NO_TENSORS")
    info=call("POST","/v1/training/load_tensor_info",{"tensor_dir":str(tensor_dir)},120)
    print("PREPROCESSED_TENSORS="+str(info.get("num_samples",count)),flush=True)
    return info

def start_training(tensor_dir,out_dir,epochs,rank,alpha):
    out_dir.mkdir(parents=True,exist_ok=True)
    result=call("POST","/v1/training/start",{
        "tensor_dir":str(tensor_dir),
        "lora_rank":rank,
        "lora_alpha":alpha,
        "lora_dropout":0.1,
        "learning_rate":1e-4,
        "train_epochs":epochs,
        "train_batch_size":1,
        "gradient_accumulation":4,
        "save_every_n_epochs":5,
        "training_shift":3.0,
        "training_seed":42,
        "lora_output_dir":str(out_dir),
        "use_fp8":False,
        "gradient_checkpointing":False,
    },120)
    print("TRAINING_STARTED=True",flush=True)
    print("TRAINING_OUTPUT="+str(out_dir),flush=True)
    return result

def monitor_training(poll_seconds=10):
    last=None
    while True:
        status=call("GET","/v1/training/status",None,60)
        marker=(status.get("current_epoch"),status.get("current_step"),status.get("current_loss"),status.get("status"))
        if marker != last:
            print("TRAINING_STATUS="+json.dumps({
                "epoch":status.get("current_epoch"),
                "step":status.get("current_step"),
                "loss":status.get("current_loss"),
                "status":status.get("status"),
                "stepsPerSecond":status.get("steps_per_second"),
            },separators=(",",":")),flush=True)
            last=marker
        if status.get("error"):
            raise SystemExit("TRAINING_FAILED")
        if not status.get("is_training"):
            return status
        time.sleep(poll_seconds)

def export_adapter(out_dir,export_dir):
    result=call("POST","/v1/training/export",{
        "export_path":str(export_dir),
        "lora_output_dir":str(out_dir),
    },120)
    adapter_dir=None
    weights=None
    config=None
    for candidate in (export_dir,export_dir/"adapter"):
        w=candidate/"adapter_model.safetensors"
        cfg=candidate/"adapter_config.json"
        if w.is_file() and cfg.is_file() and w.stat().st_size>=1024:
            adapter_dir=candidate
            weights=w
            config=cfg
            break
    if adapter_dir is None:
        discovered=[str(p) for p in export_dir.rglob("adapter_model.safetensors")] if export_dir.exists() else []
        raise SystemExit("REAL_LORA_SAFETENSORS_MISSING;DISCOVERED="+json.dumps(discovered))
    if (adapter_dir/"adapter_model.bin").exists():
        raise SystemExit("LEGACY_ADAPTER_BIN_REJECTED")
    return result,weights,config

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument("--dataset-dir",default=str(DEFAULT_DATA))
    ap.add_argument("--dataset-json",default="")
    ap.add_argument("--tensor-dir",default=str(DEFAULT_TENSORS))
    ap.add_argument("--output-dir",default=str(DEFAULT_OUT))
    ap.add_argument("--epochs",type=int,default=10)
    ap.add_argument("--rank",type=int,default=64)
    ap.add_argument("--alpha",type=int,default=128)
    ap.add_argument("--promotion",action="store_true")
    ap.add_argument("--start-only",action="store_true")
    ap.add_argument("--run-name",default="physical_realism_v2")
    args=ap.parse_args()

    data_dir=pathlib.Path(args.dataset_dir).resolve()
    manifest=pathlib.Path(args.dataset_json).resolve() if args.dataset_json else data_dir/"dataset.json"

    rows,resolved,report=validate_dataset(data_dir,manifest,args.promotion)
    print("DATASET_VALID="+json.dumps(report,separators=(",",":")),flush=True)
    healthcheck()

    safe_root=detect_ace_api_root()
    workspace,staged_data_dir,tensor_dir,out_dir,staged_resolved=stage_dataset_inside_safe_root(
        data_dir,resolved,safe_root,args.run_name
    )
    export_dir=out_dir/"exported"

    official_dataset=configure_dataset(staged_data_dir,staged_resolved)
    print("OFFICIAL_DATASET_JSON="+str(official_dataset),flush=True)
    preprocess(tensor_dir)
    start_training(tensor_dir,out_dir,args.epochs,args.rank,args.alpha)
    if args.start_only:
        print("TRAINING_MONITOR=/v1/training/status",flush=True)
        return

    final_status=monitor_training()
    result,weights,config=export_adapter(out_dir,export_dir)
    summary={
        "version":"sonara-physical-realism-lora-official-v2",
        "runName":args.run_name,
        "trainedAt":datetime.now(timezone.utc).isoformat(),
        "trainer":"ACE-Step-1.5 official MIT training API",
        "dataset":report,
        "adapterDir":str(export_dir),
        "adapterWeights":str(weights),
        "adapterConfig":str(config),
        "adapterSha256":sha256(weights),
        "weightsBytes":weights.stat().st_size,
        "rank":args.rank,
        "alpha":args.alpha,
        "epochs":args.epochs,
        "promotionRequested":bool(args.promotion),
        "promotionStatus":"PENDING_BENCHMARK" if args.promotion else "DEVELOPMENT_ONLY",
        "finalStatus":final_status.get("status"),
    }
    result_path=out_dir/"sonara_official_lora_result.json"
    result_path.write_text(json.dumps(summary,indent=2)+"\n",encoding="utf-8")
    print("REAL_LORA_READY=True",flush=True)
    print("TRAINER=ACE_STEP_OFFICIAL_MIT",flush=True)
    print("ADAPTER_DIR="+str(export_dir),flush=True)
    print("ADAPTER_SHA256="+summary["adapterSha256"],flush=True)
    print("PROMOTION_STATUS="+summary["promotionStatus"],flush=True)
    print("RESULT_JSON="+str(result_path),flush=True)

if __name__=="__main__":
    main()
