#!/usr/bin/env python3
from __future__ import annotations
import hashlib
import json
import pathlib
import re
import shutil
import subprocess
import urllib.request

ROOT=pathlib.Path("/marimo/SONARA-LORA-DATASET")
DATASET=ROOT/"dataset.json"
OUT=ROOT/"phrase-seed-v4"/"acoustic-drums"
BASE="https://raw.githubusercontent.com/patchbanks/WaivOps-JAZ-DRM/main/examples/"
FILES=[
"135bpm_jaz_drm_id_01_000086.mp3",
"160bpm_jaz_drm_id_01_000526.mp3",
"168bpm_jaz_drm_id_01_000643.mp3",
"172bpm_jaz_drm_id_01_000754.mp3",
"175bpm_jaz_drm_id_01_000846.mp3",
"182bpm_jaz_drm_id_01_000924.mp3",
"185bpm_jaz_drm_id_01_000978.mp3",
"195bpm_jaz_drm_id_01_001222.mp3",
]
ATTRIBUTION="WaivOps, JAZ-DRM Dataset, 2025, DOI 10.5281/zenodo.15658848, CC BY 4.0"
LICENSE_URL="https://creativecommons.org/licenses/by/4.0/"
SOURCE_REPO="https://github.com/patchbanks/WaivOps-JAZ-DRM"

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            b=f.read(1024*1024)
            if not b: break
            h.update(b)
    return h.hexdigest()

def download(url,path):
    req=urllib.request.Request(url,headers={"User-Agent":"SONARA-JAZ-DRM-Ingest/1.0"})
    with urllib.request.urlopen(req,timeout=120) as r, open(path,"wb") as out:
        while True:
            b=r.read(1024*1024)
            if not b: break
            out.write(b)

def duration(path):
    p=subprocess.run([
        "ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1",str(path)
    ],text=True,capture_output=True,check=True)
    return float(p.stdout.strip())

def main():
    if not DATASET.is_file():
        raise SystemExit("DATASET_JSON_MISSING")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise SystemExit("FFMPEG_OR_FFPROBE_MISSING")
    rows=json.loads(DATASET.read_text(encoding="utf-8"))
    if not isinstance(rows,list):
        raise SystemExit("DATASET_JSON_INVALID")

    rows=[r for r in rows if str(r.get("dataset_stage") or "")!="phrase-seed-v4-jaz-drm"]
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True,exist_ok=True)

    added=[]
    for idx,name in enumerate(FILES,1):
        src=OUT/("_src_"+name)
        dest=OUT/(f"{idx:02d}_"+pathlib.Path(name).stem+".wav")
        download(BASE+name,src)
        dur=duration(src)
        if dur < 4.0:
            src.unlink(missing_ok=True)
            continue
        subprocess.run([
            "ffmpeg","-y","-v","error","-i",str(src),
            "-ar","48000","-ac","2","-c:a","pcm_s24le",str(dest)
        ],check=True)
        src.unlink(missing_ok=True)
        bpm_match=re.match(r"(\d+)bpm_",name)
        bpm=int(bpm_match.group(1)) if bpm_match else None
        row={
            "audio_path":str(dest.relative_to(ROOT)),
            "prompt_override":"Jazz drum-kit groove with varied velocity, ghost-note patterns, cymbal decay, dynamic fills and non-identical repeated hits; algorithmically sequenced from licensed multi-velocity drum samples.",
            "genre":"Jazz",
            "subgenre":"Jazz Drums",
            "instrument_family":"acoustic-drums",
            "license_type":"CC_BY_4_0",
            "rights_to_train":True,
            "synthetic":True,
            "bpm":bpm,
            "key":"",
            "time_signature":"4",
            "performance_type":"programmed_loop",
            "custom_tag":"<SONARA_PHYSICAL_REALISM>",
            "dataset_stage":"phrase-seed-v4-jaz-drm",
            "source":"WaivOps JAZ-DRM",
            "source_url":BASE+name,
            "source_repo":SOURCE_REPO,
            "source_license":"CC BY 4.0",
            "source_license_url":LICENSE_URL,
            "source_attribution":ATTRIBUTION,
            "sha256":sha256(dest),
        }
        rows.append(row)
        added.append(row)
        print("JAZ_DRUM_PHRASE_IMPORTED="+str(idx)+"/"+str(len(FILES))+" BPM="+str(bpm),flush=True)

    DATASET.write_text(json.dumps(rows,indent=2)+"\n",encoding="utf-8")
    report={
        "version":"sonara-phrase-seed-v4",
        "source":"WaivOps JAZ-DRM examples",
        "license":"CC BY 4.0",
        "added":len(added),
        "family":"acoustic-drums",
        "promotionReady":False,
        "reason":"Rhythmic augmentation only: JAZ-DRM loops are algorithmically generated from MIDI patterns and multisamples, so they do not count as human phrase-level promotion data."
    }
    (ROOT/"phrase_seed_v4_report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print("PHRASE_LEVEL_ADDED="+str(len(added)),flush=True)
    print("ATTRIBUTION_RECORDED=True",flush=True)
    print("PROMOTION_READY=False",flush=True)
    print("NEXT_ACTION=RUN_DATASET_INTAKE",flush=True)

if __name__=="__main__":
    main()
