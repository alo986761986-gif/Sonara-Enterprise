#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
import pathlib
import subprocess
import urllib.request

PIN="92c55120267dcbd5bb0c00aa23b8cb32b7d35929"
REPO="alo986761986-gif/Sonara-Enterprise"
RAW=f"https://raw.githubusercontent.com/{REPO}/{PIN}"

ROOT=pathlib.Path("/marimo")
ACE=ROOT/"SONARA-ACE-Step-CLEAN"
DATA=ROOT/"SONARA-LORA-DATASET"
V2_WORK=ACE/"sonara_training"/"physical_realism_v2"
TENSORS=V2_WORK/"tensors"

SCRIPTS=[
    "scripts/sonara-cc0-bootstrap-ingest-1029.py",
    "scripts/sonara-cc0-balanced-v2-ingest-1029.py",
    "scripts/sonara-lora-dataset-intake-1029.py",
]
OFFICIAL="scripts/sonara-official-lora-train-1029.py"

EXPECTED_FAMILIES={
    "piano-keys":32,
    "guitars-fretted":64,
    "acoustic-drums":24,
    "bass":24,
    "bowed-strings":24,
    "brass-woodwinds":24,
}

def fetch(url:str,target:pathlib.Path)->None:
    req=urllib.request.Request(
        url,
        headers={
            "User-Agent":"SONARA-V2-Rebuild-1030/1.0",
            "Cache-Control":"no-cache",
        },
    )
    with urllib.request.urlopen(req,timeout=120) as r:
        target.write_bytes(r.read())

def run_script(rel:str)->None:
    target=pathlib.Path("/tmp")/pathlib.Path(rel).name
    fetch(f"{RAW}/{rel}",target)
    print("RUN_SCRIPT="+rel,flush=True)
    done=subprocess.run(["python3",str(target)],text=True)
    if done.returncode!=0:
        raise SystemExit(f"SCRIPT_FAILED={rel}:{done.returncode}")

def sha256_file(path:pathlib.Path)->str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b=f.read(1024*1024)
            if not b:
                break
            h.update(b)
    return h.hexdigest()

def tensor_inventory_sha256(directory:pathlib.Path)->str:
    h=hashlib.sha256()
    for p in sorted(directory.glob("*.pt"),key=lambda x:x.name):
        h.update(p.name.encode("utf-8"))
        h.update(b"\0")
        h.update(str(p.stat().st_size).encode("ascii"))
        h.update(b"\0")
        h.update(sha256_file(p).encode("ascii"))
        h.update(b"\n")
    return h.hexdigest()

def load_official():
    target=pathlib.Path("/tmp/sonara-official-lora-train-1029.py")
    fetch(f"{RAW}/{OFFICIAL}",target)
    spec=importlib.util.spec_from_file_location("sonara_official_lora_train_1029",target)
    if spec is None or spec.loader is None:
        raise SystemExit("OFFICIAL_TRAINER_IMPORT_FAILED")
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def main():
    print("=== SONARA V2 FIXED - REBUILD DATASET + TENSORS 1030 ===",flush=True)
    print("SONARA_SOURCE_PIN="+PIN,flush=True)
    print("NO_TRAINING=True",flush=True)
    print("NO_AUDIO_GENERATED=True",flush=True)

    if not ACE.is_dir():
        raise SystemExit("ACE_ROOT_MISSING")
    if not (ACE/"checkpoints"/"acestep-v15-xl-turbo").is_dir():
        raise SystemExit("XL_TURBO_CHECKPOINT_MISSING")
    if not (ACE/"acestep"/"training_v2"/"trainer_fixed.py").is_file():
        raise SystemExit("ACE_TRAINING_V2_FIXED_MISSING")

    # Rebuild from the versioned source pipeline.
    for rel in SCRIPTS:
        run_script(rel)

    manifest=DATA/"dataset.json"
    if not manifest.is_file():
        raise SystemExit("V2_DATASET_JSON_MISSING")

    rows=json.loads(manifest.read_text(encoding="utf-8"))
    if not isinstance(rows,list):
        raise SystemExit("V2_DATASET_JSON_INVALID")

    counts={}
    rights_ready=0
    real_rows=0
    for row in rows:
        fam=str(row.get("instrument_family") or "unknown")
        counts[fam]=counts.get(fam,0)+1
        if row.get("rights_to_train") is True:
            rights_ready+=1
        if not bool(row.get("synthetic",False)):
            real_rows+=1

    print("V2_DATASET_ROWS="+str(len(rows)),flush=True)
    print("V2_FAMILIES="+json.dumps(counts,separators=(",",":")),flush=True)
    print("V2_RIGHTS_READY="+str(rights_ready)+"/"+str(len(rows)),flush=True)
    print("V2_REAL_AUDIO="+str(real_rows)+"/"+str(len(rows)),flush=True)

    if len(rows)!=192:
        raise SystemExit("V2_DATASET_ROW_COUNT_INVALID="+str(len(rows)))
    if counts!=EXPECTED_FAMILIES:
        raise SystemExit(
            "V2_FAMILY_COUNTS_INVALID="
            +json.dumps(counts,separators=(",",":"))
        )
    if rights_ready!=192 or real_rows!=192:
        raise SystemExit("V2_DATASET_RIGHTS_OR_REAL_AUDIO_INVALID")

    official=load_official()
    rows2,resolved,report=official.validate_dataset(DATA,manifest,False)
    if len(rows2)!=192:
        raise SystemExit("OFFICIAL_VALIDATION_ROW_COUNT_INVALID")

    official.healthcheck()
    safe_root=official.detect_ace_api_root()
    if pathlib.Path(safe_root).resolve()!=ACE.resolve():
        raise SystemExit("ACE_SAFE_ROOT_UNEXPECTED="+str(safe_root))

    workspace,audio_dir,tensor_dir,out_dir,staged=official.stage_dataset_inside_safe_root(
        DATA,
        resolved,
        safe_root,
        "physical_realism_v2",
    )
    print("V2_STAGED_AUDIO="+str(len(staged)),flush=True)

    official_dataset=official.configure_dataset(audio_dir,staged)
    print("V2_OFFICIAL_DATASET="+str(official_dataset),flush=True)

    info=official.preprocess(tensor_dir)
    pt_count=len(list(pathlib.Path(tensor_dir).glob("*.pt")))

    if pt_count!=192:
        raise SystemExit("V2_TENSOR_COUNT_INVALID="+str(pt_count))

    manifest_sha=sha256_file(manifest)
    inventory_sha=tensor_inventory_sha256(pathlib.Path(tensor_dir))

    report_out={
        "version":"sonara-v2-dataset-tensor-rebuild-1030",
        "sourcePin":PIN,
        "datasetRows":len(rows),
        "families":counts,
        "rightsReady":rights_ready,
        "realAudioRows":real_rows,
        "datasetManifestSha256":manifest_sha,
        "preprocessedTensors":pt_count,
        "tensorInventorySha256":inventory_sha,
        "tensorDir":str(tensor_dir),
        "trainingStarted":False,
        "audioGenerated":False,
        "nextAction":"TRAIN_V2_FIXED",
    }
    result=V2_WORK/"sonara_v2_rebuild_report_1030.json"
    result.write_text(json.dumps(report_out,indent=2)+"\n",encoding="utf-8")

    print("=== SONARA V2 REBUILD COMPLETE ===",flush=True)
    print("V2_DATASET_READY=True",flush=True)
    print("V2_PREPROCESSED_TENSORS="+str(pt_count),flush=True)
    print("V2_DATASET_MANIFEST_SHA256="+manifest_sha,flush=True)
    print("V2_TENSOR_INVENTORY_SHA256="+inventory_sha,flush=True)
    print("V2_TENSORS_READY=True",flush=True)
    print("TRAINING_STARTED=False",flush=True)
    print("NO_AUDIO_GENERATED=True",flush=True)
    print("RESULT_JSON="+str(result),flush=True)
    print("NEXT_ACTION=TRAIN_V2_FIXED",flush=True)

if __name__=="__main__":
    main()
