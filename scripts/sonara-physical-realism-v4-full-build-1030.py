#!/usr/bin/env python3
from __future__ import annotations

import json
import pathlib
import subprocess
import sys
import urllib.request

ROOT=pathlib.Path("/marimo")
DATASET=ROOT/"SONARA-LORA-DATASET"
ACE=ROOT/"SONARA-ACE-Step-CLEAN"
PIN="cb55ebebd14bf074030b1fe9d0453d4728b12bb7"\nREPO_RAW=f"https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/{PIN}"

STEPS=[
    ("cc0-bootstrap-v4","scripts/sonara-cc0-bootstrap-v4-ingest-1030.py"),
    ("cc0-balanced-v4","scripts/sonara-cc0-balanced-v4-ingest-1030.py"),
    ("dataset-intake-initial","scripts/sonara-lora-dataset-intake-1029.py"),
    ("egset12-human-guitar","scripts/sonara-egset12-human-phrase-ingest-1029.py"),
    ("urmp-human-phrases","scripts/sonara-urmp-hf-human-phrase-ingest-1029.py"),
    ("commons-v4-human-phrases","scripts/sonara-commons-phrase-v4-ingest-1030.py"),
    ("dataset-intake-final","scripts/sonara-lora-dataset-intake-1029.py"),
    ("v4-preprocess","scripts/sonara-v4-fixed-preprocess-1030.py"),
    ("v4-train","scripts/sonara-lora-v4-fixed-train-1030.py"),
]

def fetch(path:str)->pathlib.Path:
    target=ROOT/("sonara_v4_"+pathlib.PurePosixPath(path).name)
    req=urllib.request.Request(
        REPO_RAW+"/"+path,
        headers={"User-Agent":"SONARA-V4-Pipeline/1.0","Cache-Control":"no-cache"},
    )
    with urllib.request.urlopen(req,timeout=120) as response:
        target.write_bytes(response.read())
    return target

def run(label:str,path:str)->None:
    script=fetch(path)
    print("\n=== SONARA V4 STEP: "+label+" ===",flush=True)
    result=subprocess.run([sys.executable,"-u",str(script)],text=True)
    if result.returncode!=0:
        raise SystemExit("SONARA_V4_PIPELINE_STOPPED_AT="+label+" CODE="+str(result.returncode))

def dataset_gate()->dict:
    report=DATASET/"sonara_dataset_readiness.json"
    if not report.is_file():
        raise SystemExit("SONARA_V4_READINESS_REPORT_MISSING")
    data=json.loads(report.read_text(encoding="utf-8"))
    phrase=data.get("phraseFamilyCounts") or {}
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
        "perFamilyMinimums":all(int(phrase.get(k) or 0)>=v for k,v in required.items()),
        "maxFamilyShare":float(data.get("maxFamilyShare") or 1)<=0.35,
        "maxPhraseFamilyShare":float(data.get("maxPhraseFamilyShare") or 1)<=0.30,
    }
    print("V4_DATASET_GATE="+json.dumps(checks,separators=(",",":")),flush=True)
    print("V4_DATASET_ROWS="+str(data.get("audioFiles")),flush=True)
    print("V4_PHRASE_ROWS="+str(data.get("phraseLevelPerformances")),flush=True)
    print("V4_PHRASE_FAMILIES="+json.dumps(phrase,separators=(",",":")),flush=True)
    if not all(checks.values()):
        raise SystemExit("SONARA_V4_DATASET_GATE_FAILED")
    print("SONARA_V4_DATASET_GATE_PASSED=True",flush=True)
    return data

def main():
    print("=== SONARA PHYSICAL REALISM V4 - FULL BUILD ===",flush=True)\n    print("SONARA_V4_SOURCE_PIN="+PIN,flush=True)
    print("PRODUCTION_ENGINE_UNCHANGED=True",flush=True)
    print("BASE_MODEL=acestep-v15-xl-turbo",flush=True)
    print("LM_MODEL=acestep-5Hz-lm-4B",flush=True)

    DATASET.mkdir(parents=True,exist_ok=True)
    print("SONARA_LORA_DATASET="+str(DATASET),flush=True)
    if not ACE.is_dir():
        raise SystemExit("SONARA_ACE_STEP_ROOT_MISSING")

    backup=DATASET/"dataset.pre_v4_backup.json"
    source=DATASET/"dataset.json"
    if source.is_file() and not backup.is_file():
        backup.write_bytes(source.read_bytes())
        print("V4_DATASET_BACKUP="+str(backup),flush=True)

    for label,path in STEPS[:7]:
        run(label,path)

    dataset_gate()

    for label,path in STEPS[7:]:
        run(label,path)

    adapter=ACE/"sonara_training"/"physical_realism_v4_fixed"/"output"/"final"/"adapter_model.safetensors"
    if not adapter.is_file() or adapter.stat().st_size<1024:
        raise SystemExit("SONARA_V4_ADAPTER_NOT_CREATED")

    print("\n=== SONARA V4 BUILD COMPLETE ===",flush=True)
    print("V4_ADAPTER_READY=True",flush=True)
    print("V4_PRODUCTION_ACTIVE=False",flush=True)

    run("v3-v4-audio-benchmark","scripts/sonara-v4-audio-benchmark-runner-1030.py")

    print("\n=== SONARA V4 FULL PIPELINE COMPLETE ===",flush=True)
    print("V4_TRAINING_COMPLETE=True",flush=True)
    print("V3_V4_BENCHMARK_COMPLETE=True",flush=True)
    print("V4_PRODUCTION_ACTIVE=False",flush=True)
    print("NEXT_ACTION=REVIEW_V3_V4_SUMMARY_AND_BLIND_AUDIO",flush=True)

if __name__=="__main__":
    main()
