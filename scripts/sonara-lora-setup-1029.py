#!/usr/bin/env python3
from __future__ import annotations
import json
import pathlib
import shutil
import subprocess
import urllib.request

ROOT=pathlib.Path("/marimo")
SIDESTEP=ROOT/"Side-Step"
DATA=ROOT/"SONARA-LORA-DATASET"
TENSORS=ROOT/"SONARA-LORA-TENSORS"
OUT=ROOT/"SONARA-LORA-OUTPUT"
TEMPLATE_URL="https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/engine/physical_realism_dataset_template.json"

def run(cmd,cwd=None):
    print("RUN="+" ".join(str(x) for x in cmd),flush=True)
    subprocess.run([str(x) for x in cmd],cwd=str(cwd) if cwd else None,check=True)

def main():
    uv=shutil.which("uv")
    if not uv:
        raise SystemExit("UV_MISSING")
    if not shutil.which("git"):
        raise SystemExit("GIT_MISSING")

    DATA.mkdir(parents=True,exist_ok=True)
    TENSORS.mkdir(parents=True,exist_ok=True)
    OUT.mkdir(parents=True,exist_ok=True)

    if not SIDESTEP.is_dir():
        run(["git","clone","--depth","1","https://github.com/koda-dernet/Side-Step.git",str(SIDESTEP)])
    else:
        run(["git","fetch","--depth","1","origin","main"],cwd=SIDESTEP)
        run(["git","checkout","main"],cwd=SIDESTEP)
        run(["git","reset","--hard","origin/main"],cwd=SIDESTEP)

    run([uv,"sync"],cwd=SIDESTEP)

    dataset_json=DATA/"dataset.json"
    if not dataset_json.exists():
        req=urllib.request.Request(TEMPLATE_URL,headers={"User-Agent":"SONARA-LoRA-Setup/1.0"})
        with urllib.request.urlopen(req,timeout=30) as response:
            template=response.read()
        dataset_json.write_bytes(template)

    status={
        "sideStepInstalled":SIDESTEP.is_dir(),
        "datasetDir":str(DATA),
        "datasetJson":str(dataset_json),
        "tensorDir":str(TENSORS),
        "outputDir":str(OUT),
        "trainingReady":False,
        "reason":"Add owned/explicitly licensed real audio and update dataset.json before training."
    }
    (ROOT/"SONARA-LORA-SETUP.json").write_text(json.dumps(status,indent=2)+"\n",encoding="utf-8")
    print("SIDESTEP_INSTALLED=True")
    print("DATASET_DIR="+str(DATA))
    print("DATASET_JSON="+str(dataset_json))
    print("TENSOR_DIR="+str(TENSORS))
    print("OUTPUT_DIR="+str(OUT))
    print("TRAINING_READY=False")
    print("NEXT_ACTION=ADD_REAL_LICENSED_AUDIO")

if __name__=="__main__":
    main()
