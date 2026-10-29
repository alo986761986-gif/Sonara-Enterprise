#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import pathlib
import shutil
import subprocess
import urllib.request

ROOT=pathlib.Path("/marimo/SONARA-LORA-DATASET")
DATASET=ROOT/"dataset.json"
OUT=ROOT/"phrase-human-v5-egset12"
BASE="https://zenodo.org/records/11406378/files"

FILES=[
("01.wav","2eb739c5fb73e6327bb47267afe3eddf"),
("02.wav","69b8701ea9a81428a6346e0d3d4b9b85"),
("03.wav","28141f17e46399553c52f5ed27bc10e2"),
("04.wav","6fe2f6f915953e8ae28b8a84a7677d0f"),
("05.wav","3435348c2b6702524dade471be70e4eb"),
("06.wav","9f7ead382f373259b466ccd1884ed173"),
("07.wav","77f752ab3e7a5c606a21ac7b0df4fa1c"),
("08.wav","a59f373c00b8a327b37ce28f6601404c"),
("09.wav","593aec1394a905a0c8b255a847f54139"),
("10.wav","123818ef1020102252192d9e7a231e07"),
("11.wav","4bbaecaaa3e58bef6bb15a6cd0979fe2"),
("12.wav","e1ee73508f37d5c28c69877a588665d2"),
]

ATTRIBUTION=(
    "Pedroza, Hegel; Abreu, Wallace; Corey, Ryan; Roman, Iran. "
    "EGSet12: twelve real & original solo electric guitar performances, "
    "Zenodo record 11406378, CC BY 4.0. Associated paper DOI: 10.48550/arXiv.2405.14679."
)
LICENSE_URL="https://creativecommons.org/licenses/by/4.0/"
SOURCE_PAGE="https://zenodo.org/records/11406378"

def md5(path):
    h=hashlib.md5()
    with open(path,"rb") as f:
        while True:
            b=f.read(1024*1024)
            if not b: break
            h.update(b)
    return h.hexdigest()

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            b=f.read(1024*1024)
            if not b: break
            h.update(b)
    return h.hexdigest()

def download(url,path):
    req=urllib.request.Request(url,headers={"User-Agent":"SONARA-EGSet12-Ingest/1.0"})
    with urllib.request.urlopen(req,timeout=180) as r, open(path,"wb") as out:
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

    rows=[r for r in rows if str(r.get("dataset_stage") or "")!="phrase-human-v5-egset12"]
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True,exist_ok=True)

    added=[]
    for idx,(name,expected_md5) in enumerate(FILES,1):
        src=OUT/("_src_"+name)
        dest=OUT/(f"{idx:02d}_egset12.wav")
        url=f"{BASE}/{name}?download=1"
        download(url,src)

        actual_md5=md5(src)
        if actual_md5.lower()!=expected_md5.lower():
            raise SystemExit(f"EGSET12_MD5_MISMATCH={name}:{actual_md5}")

        dur=duration(src)
        if dur < 12.0:
            raise SystemExit(f"EGSET12_TOO_SHORT={name}:{dur}")

        subprocess.run([
            "ffmpeg","-y","-v","error","-i",str(src),
            "-ar","48000","-ac","2","-c:a","pcm_s24le",str(dest)
        ],check=True)
        src.unlink(missing_ok=True)

        row={
            "audio_path":str(dest.relative_to(ROOT)),
            "prompt_override":"Real professional solo electric guitar performance with human phrase timing, pick dynamics, palm muting where performed, playable fretboard motion, chord/note transitions, amplifier response, string resonance and natural releases.",
            "genre":"Human Performance Phrase",
            "subgenre":"Solo Electric Guitar",
            "instrument_family":"guitars-fretted",
            "license_type":"CC_BY_4_0",
            "rights_to_train":True,
            "synthetic":False,
            "bpm":None,
            "key":"",
            "time_signature":"4",
            "performance_type":"phrase_level",
            "promotion_eligible":True,
            "custom_tag":"<SONARA_PHYSICAL_REALISM>",
            "dataset_stage":"phrase-human-v5-egset12",
            "source":"EGSet12",
            "source_url":url,
            "source_page":SOURCE_PAGE,
            "source_license":"CC BY 4.0",
            "source_license_url":LICENSE_URL,
            "source_attribution":ATTRIBUTION,
            "source_md5":expected_md5,
            "source_duration_seconds":round(dur,3),
            "sha256":sha256(dest),
        }
        rows.append(row)
        added.append(row)
        print(f"EGSET12_HUMAN_PHRASE_IMPORTED={idx}/{len(FILES)} DURATION={dur:.2f}s",flush=True)

    DATASET.write_text(json.dumps(rows,indent=2)+"\n",encoding="utf-8")
    report={
        "version":"sonara-phrase-human-v5-egset12",
        "source":"EGSet12",
        "license":"CC BY 4.0",
        "added":len(added),
        "humanPhraseLevel":len(added),
        "family":"guitars-fretted",
        "checksumsVerified":True,
        "attributionRecorded":True,
        "promotionReady":False,
        "reason":"12 real human guitar performances added; promotion still requires at least 24 eligible human phrases across >=4 instrument families."
    }
    (ROOT/"phrase_human_v5_egset12_report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")

    print("HUMAN_PHRASE_LEVEL_ADDED="+str(len(added)),flush=True)
    print("HUMAN_PHRASE_FAMILY=guitars-fretted",flush=True)
    print("CHECKSUMS_VERIFIED=True",flush=True)
    print("ATTRIBUTION_RECORDED=True",flush=True)
    print("PROMOTION_READY=False",flush=True)
    print("NEXT_ACTION=RUN_DATASET_INTAKE",flush=True)

if __name__=="__main__":
    main()
