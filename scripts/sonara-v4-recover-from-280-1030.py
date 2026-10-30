#!/usr/bin/env python3
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import urllib.request

PIN="447f509bd96d5dbb600c75616117c32e961d62a9"
RAW=f"https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/{PIN}"

ROOT=pathlib.Path("/marimo")
DATASET=ROOT/"SONARA-LORA-DATASET"
ACE=ROOT/"SONARA-ACE-Step-CLEAN"

STEPS=[
    ("v4-curated-human-phrases","scripts/sonara-v4-curated-human-phrases-1030.py"),
    ("dataset-intake-final","scripts/sonara-lora-dataset-intake-1029.py"),
    ("v4-preprocess","scripts/sonara-v4-fixed-preprocess-1030.py"),
    ("v4-train","scripts/sonara-lora-v4-fixed-train-1030.py"),
    ("v3-v4-audio-benchmark","scripts/sonara-v4-audio-benchmark-runner-1030.py"),
]

def fetch(rel):
    target=ROOT/("sonara_v4_recovery_"+pathlib.PurePosixPath(rel).name)
    req=urllib.request.Request(
        RAW+"/"+rel,
        headers={"User-Agent":"SONARA-V4-Recovery/1.0","Cache-Control":"no-cache"},
    )
    with urllib.request.urlopen(req,timeout=120) as response:
        target.write_bytes(response.read())
    return target

def run(label,rel):
    script=fetch(rel)
    print("\n=== SONARA V4 RECOVERY STEP: "+label+" ===",flush=True)
    result=subprocess.run([sys.executable,"-u",str(script)],text=True)
    if result.returncode!=0:
        raise SystemExit("SONARA_V4_RECOVERY_STOPPED_AT="+label+" CODE="+str(result.returncode))

def readiness():
    path=DATASET/"sonara_dataset_readiness.json"
    if not path.is_file():
        raise SystemExit("V4_READINESS_REPORT_MISSING")
    data=json.loads(path.read_text(encoding="utf-8"))
    phrases=data.get("phraseFamilyCounts") or {}
    required={
        "acoustic-drums":12,
        "piano-keys":12,
        "guitars-fretted":10,
        "bass":8,
        "bowed-strings":8,
        "brass-woodwinds":8,
    }
    checks={
        "rowsAtLeast320":int(data.get("audioFiles") or 0)>=320,
        "allRightsReady":int(data.get("rightsReady") or 0)==int(data.get("audioFiles") or -1),
        "realAudioAtLeast300":int(data.get("realFiles") or 0)>=300,
        "phraseAtLeast60":int(data.get("phraseLevelPerformances") or 0)>=60,
        "allSixPhraseFamilies":int(data.get("phraseFamilyCoverage") or 0)>=6,
        "perFamilyMinimums":all(int(phrases.get(k) or 0)>=v for k,v in required.items()),
        "maxFamilyShare":float(data.get("maxFamilyShare") or 1)<=0.35,
        "maxPhraseFamilyShare":float(data.get("maxPhraseFamilyShare") or 1)<=0.30,
    }
    print("V4_RECOVERY_DATASET_GATE="+json.dumps(checks,separators=(",",":")),flush=True)
    print("V4_RECOVERY_ROWS="+str(data.get("audioFiles")),flush=True)
    print("V4_RECOVERY_PHRASES="+str(data.get("phraseLevelPerformances")),flush=True)
    print("V4_RECOVERY_PHRASE_FAMILIES="+json.dumps(phrases,separators=(",",":")),flush=True)
    if not all(checks.values()):
        raise SystemExit("SONARA_V4_RECOVERY_DATASET_GATE_FAILED")
    print("SONARA_V4_RECOVERY_DATASET_GATE_PASSED=True",flush=True)

def main():
    print("=== SONARA V4 RECOVERY FROM 280 ===",flush=True)
    print("SOURCE_PIN="+PIN,flush=True)
    print("PRODUCTION_ENGINE_UNCHANGED=True",flush=True)

    manifest=DATASET/"dataset.json"
    if not manifest.is_file():
        raise SystemExit("SONARA_V4_EXISTING_DATASET_MISSING")
    if not ACE.is_dir():
        raise SystemExit("SONARA_ACE_STEP_ROOT_MISSING")

    rows=json.loads(manifest.read_text(encoding="utf-8"))
    print("EXISTING_DATASET_ROWS="+str(len(rows)),flush=True)
    if len(rows)<280:
        raise SystemExit("SONARA_V4_EXISTING_DATASET_TOO_SMALL="+str(len(rows)))

    backup=DATASET/"dataset.pre_curated_v4_backup.json"
    if not backup.is_file():
        backup.write_bytes(manifest.read_bytes())
        print("RECOVERY_BACKUP="+str(backup),flush=True)

    run(*STEPS[0])
    run(*STEPS[1])
    readiness()

    run(*STEPS[2])
    run(*STEPS[3])

    adapter=ACE/"sonara_training"/"physical_realism_v4_fixed"/"output"/"final"/"adapter_model.safetensors"
    if not adapter.is_file() or adapter.stat().st_size<1024:
        raise SystemExit("V4_ADAPTER_NOT_CREATED")
    print("V4_ADAPTER_READY=True",flush=True)
    print("V4_PRODUCTION_ACTIVE=False",flush=True)

    run(*STEPS[4])

    print("\n=== SONARA V4 RECOVERY COMPLETE ===",flush=True)
    print("V4_DATASET_GATE_PASSED=True",flush=True)
    print("V4_TRAINING_COMPLETE=True",flush=True)
    print("V3_V4_BENCHMARK_COMPLETE=True",flush=True)
    print("V4_PRODUCTION_ACTIVE=False",flush=True)
    print("NEXT_ACTION=REVIEW_BLIND_BENCHMARK",flush=True)

if __name__=="__main__":
    main()
