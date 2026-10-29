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
RECORD_ID="11406378"
RECORD_API=f"https://zenodo.org/api/records/{RECORD_ID}"

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

def fetch_json(url,timeout=60):
    req=urllib.request.Request(
        url,
        headers={
            "User-Agent":"SONARA-EGSet12-Ingest/2.0",
            "Accept":"application/json",
        },
    )
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def zenodo_files():
    record=fetch_json(RECORD_API,60)
    files=record.get("files") or []
    out={}
    for item in files:
        key=str(item.get("key") or item.get("filename") or "")
        if not key.lower().endswith(".wav"):
            continue
        checksum=str(item.get("checksum") or "")
        if checksum.startswith("md5:"):
            checksum=checksum.split(":",1)[1]
        links=item.get("links") or {}
        content_url=links.get("content") or links.get("self")
        if not content_url:
            continue
        out[key]={
            "url":content_url,
            "md5":checksum.lower(),
            "size":int(item.get("size") or 0),
        }
    expected=[f"{i:02d}.wav" for i in range(1,13)]
    missing=[name for name in expected if name not in out]
    if missing:
        raise SystemExit("EGSET12_API_FILES_MISSING="+",".join(missing))
    return [(name,out[name]) for name in expected]

def download_verified(name,meta,path,attempts=4):
    expected_md5=str(meta.get("md5") or "").lower()
    expected_size=int(meta.get("size") or 0)
    url=str(meta.get("url") or "")
    if not expected_md5 or not url:
        raise SystemExit(f"EGSET12_METADATA_INCOMPLETE={name}")

    last_error=None
    for attempt in range(1,attempts+1):
        part=path.with_suffix(path.suffix+".part")
        part.unlink(missing_ok=True)
        try:
            req=urllib.request.Request(
                url,
                headers={
                    "User-Agent":"SONARA-EGSet12-Ingest/2.0",
                    "Accept":"application/octet-stream,audio/wav,*/*;q=0.1",
                    "Cache-Control":"no-cache",
                },
            )
            with urllib.request.urlopen(req,timeout=180) as r, open(part,"wb") as out:
                content_type=str(r.headers.get("Content-Type") or "").lower()
                if "text/html" in content_type or "application/json" in content_type:
                    raise RuntimeError("unexpected_content_type="+content_type)
                while True:
                    b=r.read(1024*1024)
                    if not b:
                        break
                    out.write(b)

            actual_size=part.stat().st_size
            actual_md5=md5(part)
            if expected_size and actual_size != expected_size:
                raise RuntimeError(f"size_mismatch={actual_size}/{expected_size}")
            if actual_md5.lower() != expected_md5:
                raise RuntimeError(f"md5_mismatch={actual_md5}/{expected_md5}")

            part.replace(path)
            print(
                f"EGSET12_DOWNLOAD_VERIFIED={name} ATTEMPT={attempt} "
                f"SIZE={actual_size} MD5={actual_md5}",
                flush=True,
            )
            return
        except Exception as exc:
            last_error=exc
            part.unlink(missing_ok=True)
            print(f"EGSET12_DOWNLOAD_RETRY={name} ATTEMPT={attempt} ERROR={exc}",flush=True)
    raise SystemExit(f"EGSET12_DOWNLOAD_FAILED={name}:{last_error}")

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

    source_files=zenodo_files()
    print("ZENODO_RECORD_METADATA_OK=True",flush=True)
    print("ZENODO_WAV_FILES="+str(len(source_files)),flush=True)

    added=[]
    for idx,(name,meta) in enumerate(source_files,1):
        src=OUT/("_src_"+name)
        dest=OUT/(f"{idx:02d}_egset12.wav")
        url=str(meta["url"])
        expected_md5=str(meta["md5"])
        download_verified(name,meta,src)

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
            "source_record_api":RECORD_API,
            "source_license":"CC BY 4.0",
            "source_license_url":LICENSE_URL,
            "source_attribution":ATTRIBUTION,
            "source_md5":expected_md5,
            "source_size_bytes":int(meta.get("size") or 0),
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
    print("ZENODO_METADATA_DRIVEN=True",flush=True)
    print("CHECKSUMS_VERIFIED=True",flush=True)
    print("ATTRIBUTION_RECORDED=True",flush=True)
    print("PROMOTION_READY=False",flush=True)
    print("NEXT_ACTION=RUN_DATASET_INTAKE",flush=True)

if __name__=="__main__":
    main()
