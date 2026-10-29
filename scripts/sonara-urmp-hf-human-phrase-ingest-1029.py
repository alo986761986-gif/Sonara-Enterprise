#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import math
import pathlib
import re
import shutil
import subprocess
import tempfile
import time
import urllib.parse
import urllib.request

ROOT=pathlib.Path("/marimo/SONARA-LORA-DATASET")
DATASET=ROOT/"dataset.json"
OUT=ROOT/"phrase-human-v7-urmp-hf"

HF_REPO="Eredis02/URMP"
HF_API="https://huggingface.co/api/datasets/Eredis02/URMP/tree/main"
HF_RESOLVE="https://huggingface.co/datasets/Eredis02/URMP/resolve/main"

SOURCE_PAGE="https://datadryad.org/dataset/doi:10.5061/dryad.ng3r749"
SOURCE_DOI="10.5061/dryad.ng3r749"
MIRROR_PAGE="https://huggingface.co/datasets/Eredis02/URMP"
ATTRIBUTION=(
    "Li, Bochen; Liu, Xinzhao; Dinesh, Karthik; Duan, Zhiyao; Sharma, Gaurav. "
    "Data from: Creating a multi-track classical music performance dataset for "
    "multi-modal music analysis: challenges, insights, and applications. "
    "Dryad. DOI: 10.5061/dryad.ng3r749. CC0."
)

# Official URMP piece durations from the dataset documentation.
PIECE_DURATION={
    "01_Jupiter_vn_vc":63,
    "03_Dance_fl_cl":97,
    "05_Entertainer_tpt_tpt":87,
    "10_March_tpt_sax":103,
    "11_Maria_ob_vc":104,
    "13_Hark_vn_vn_va":47,
    "24_Pirates_vn_vn_va_vc":50,
    "35_Rondeau_vn_vn_va_db":128,
    "38_Jerusalem_vn_vn_va_vc_db":119,
    "39_Jerusalem_vn_vn_va_sax_db":119,
}

# 12 human phrases across 3 new families. Rondeau double bass is long enough
# for two non-overlapping phrases; all other rows use distinct performances.
SELECTIONS=[
    # bass: 4 phrases / 3 performances
    {"family":"bass","folder":"35_Rondeau_vn_vn_va_db","track":4,"inst":"db","start":10.0},
    {"family":"bass","folder":"35_Rondeau_vn_vn_va_db","track":4,"inst":"db","start":70.0},
    {"family":"bass","folder":"38_Jerusalem_vn_vn_va_vc_db","track":5,"inst":"db","start":18.0},
    {"family":"bass","folder":"39_Jerusalem_vn_vn_va_sax_db","track":5,"inst":"db","start":55.0},

    # bowed strings: 4 distinct performances
    {"family":"bowed-strings","folder":"01_Jupiter_vn_vc","track":1,"inst":"vn","start":12.0},
    {"family":"bowed-strings","folder":"11_Maria_ob_vc","track":2,"inst":"vc","start":25.0},
    {"family":"bowed-strings","folder":"13_Hark_vn_vn_va","track":3,"inst":"va","start":10.0},
    {"family":"bowed-strings","folder":"24_Pirates_vn_vn_va_vc","track":4,"inst":"vc","start":10.0},

    # brass / woodwinds: 4 distinct performances
    {"family":"brass-woodwinds","folder":"03_Dance_fl_cl","track":1,"inst":"fl","start":20.0},
    {"family":"brass-woodwinds","folder":"05_Entertainer_tpt_tpt","track":1,"inst":"tpt","start":20.0},
    {"family":"brass-woodwinds","folder":"10_March_tpt_sax","track":2,"inst":"sax","start":20.0},
    {"family":"brass-woodwinds","folder":"11_Maria_ob_vc","track":1,"inst":"ob","start":20.0},
]

PROMPTS={
    "bass":"Real human double-bass performance phrase with natural finger or bow articulation, physical string resonance, playable position changes, note-length variation and continuous acoustic room response.",
    "bowed-strings":"Real human bowed-string performance phrase with natural bow changes, connected legato, position shifts, phrase-shaped vibrato, dynamic bow pressure and resonant wooden body.",
    "brass-woodwinds":"Real human brass or woodwind performance phrase with breath-capacity phrasing, idiomatic articulation, register-dependent tone, natural pitch connections and expressive dynamics.",
}

def request_json(url,timeout=90):
    req=urllib.request.Request(
        url,
        headers={
            "User-Agent":"SONARA-URMP-HF-Ingest/1.0",
            "Accept":"application/json",
            "Cache-Control":"no-cache",
        },
    )
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def folder_entries(folder):
    encoded=urllib.parse.quote(folder,safe="")
    url=f"{HF_API}/{encoded}?recursive=false&expand=false"
    data=request_json(url)
    if not isinstance(data,list):
        raise RuntimeError(f"HF_TREE_INVALID={folder}")
    return data

def resolve_source_path(folder,track,inst):
    entries=folder_entries(folder)
    expected=re.compile(
        rf"^AuSep_{int(track)}_{re.escape(inst)}_.+\.wav$",
        re.IGNORECASE,
    )
    matches=[]
    for item in entries:
        path=str(item.get("path") or "")
        name=pathlib.PurePosixPath(path).name
        if expected.match(name):
            matches.append(path)
    if len(matches)!=1:
        available=[
            pathlib.PurePosixPath(str(x.get("path") or "")).name
            for x in entries
            if "AuSep_" in str(x.get("path") or "")
        ]
        raise RuntimeError(
            f"HF_STEM_MATCH_COUNT={folder}:{track}:{inst}:{len(matches)}:"
            +json.dumps(available[:30],separators=(",",":"))
        )
    return matches[0]

def download(url,path,attempts=4):
    last=None
    for attempt in range(1,attempts+1):
        part=path.with_suffix(path.suffix+".part")
        part.unlink(missing_ok=True)
        try:
            req=urllib.request.Request(
                url,
                headers={
                    "User-Agent":"Mozilla/5.0 SONARA-URMP-HF-Ingest/1.0",
                    "Accept":"application/octet-stream,audio/wav,*/*;q=0.1",
                    "Cache-Control":"no-cache",
                },
            )
            with urllib.request.urlopen(req,timeout=180) as r, open(part,"wb") as out:
                ctype=str(r.headers.get("Content-Type") or "").lower()
                if "text/html" in ctype or "application/json" in ctype:
                    raise RuntimeError("unexpected_content_type="+ctype)
                while True:
                    b=r.read(2*1024*1024)
                    if not b:
                        break
                    out.write(b)
            if part.stat().st_size < 1024*1024:
                raise RuntimeError(f"source_too_small={part.stat().st_size}")
            part.replace(path)
            print(
                f"URMP_MIRROR_DOWNLOAD_OK={path.name} ATTEMPT={attempt} "
                f"SIZE={path.stat().st_size}",
                flush=True,
            )
            return
        except Exception as exc:
            last=exc
            part.unlink(missing_ok=True)
            print(
                f"URMP_MIRROR_DOWNLOAD_RETRY={path.name} ATTEMPT={attempt} ERROR={exc}",
                flush=True,
            )
            time.sleep(min(2*attempt,6))
    raise RuntimeError(f"URMP_MIRROR_DOWNLOAD_FAILED={path.name}:{last}")

def ffprobe(path):
    p=subprocess.run([
        "ffprobe","-v","error",
        "-select_streams","a:0",
        "-show_entries",
        "stream=codec_name,sample_rate,channels,bits_per_raw_sample,bits_per_sample:format=duration",
        "-of","json",str(path)
    ],text=True,capture_output=True,check=True)
    data=json.loads(p.stdout)
    streams=data.get("streams") or []
    if not streams:
        raise RuntimeError("NO_AUDIO_STREAM")
    s=streams[0]
    dur=float((data.get("format") or {}).get("duration") or 0.0)
    return {
        "codec":str(s.get("codec_name") or ""),
        "sample_rate":int(s.get("sample_rate") or 0),
        "channels":int(s.get("channels") or 0),
        "bits_raw":int(s.get("bits_per_raw_sample") or 0),
        "bits_sample":int(s.get("bits_per_sample") or 0),
        "duration":dur,
    }

def audio_rms(path):
    p=subprocess.run([
        "ffmpeg","-hide_banner","-nostats","-i",str(path),
        "-af","astats=metadata=1:reset=0",
        "-f","null","-"
    ],text=True,capture_output=True)
    text=p.stderr
    vals=re.findall(r"RMS level dB:\s*(-?\d+(?:\.\d+)?)",text)
    if not vals:
        return None
    return float(vals[-1])

def validate_source(path,folder):
    info=ffprobe(path)
    expected=PIECE_DURATION[folder]
    if info["sample_rate"]!=48000:
        raise RuntimeError(f"BAD_SAMPLE_RATE={info['sample_rate']}")
    if info["channels"]!=1:
        raise RuntimeError(f"BAD_CHANNELS={info['channels']}")
    if not info["codec"].startswith("pcm_"):
        raise RuntimeError(f"BAD_CODEC={info['codec']}")
    if abs(info["duration"]-expected)>12.0:
        raise RuntimeError(
            f"BAD_DURATION={info['duration']:.3f}/EXPECTED~{expected}"
        )
    rms=audio_rms(path)
    if rms is None or not math.isfinite(rms) or rms < -70.0:
        raise RuntimeError(f"BAD_RMS_DBFS={rms}")
    return info,rms

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            b=f.read(1024*1024)
            if not b:
                break
            h.update(b)
    return h.hexdigest()

def create_clip(src,dest,start,duration=24.0):
    info=ffprobe(src)
    dur=info["duration"]
    if start+duration>dur-0.5:
        start=max(0.0,dur-duration-0.5)
    dest.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run([
        "ffmpeg","-y","-v","error",
        "-ss",f"{start:.3f}","-i",str(src),
        "-t",f"{duration:.3f}",
        "-ar","48000","-ac","2",
        "-c:a","pcm_s24le",
        str(dest),
    ],check=True)
    return start

def main():
    if not DATASET.is_file():
        raise SystemExit("DATASET_JSON_MISSING")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise SystemExit("FFMPEG_OR_FFPROBE_MISSING")

    rows=json.loads(DATASET.read_text(encoding="utf-8"))
    if not isinstance(rows,list):
        raise SystemExit("DATASET_JSON_INVALID")

    rows=[
        r for r in rows
        if str(r.get("dataset_stage") or "")!="phrase-human-v7-urmp-hf"
    ]
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True,exist_ok=True)

    source_cache={}
    source_meta={}
    added=[]

    for index,sel in enumerate(SELECTIONS,1):
        key=(sel["folder"],sel["track"],sel["inst"])
        if key not in source_cache:
            source_path=resolve_source_path(*key)
            encoded=urllib.parse.quote(source_path,safe="/")
            url=f"{HF_RESOLVE}/{encoded}?download=true"

            tmp=OUT/("_source_"+pathlib.PurePosixPath(source_path).name)
            download(url,tmp)
            info,rms=validate_source(tmp,sel["folder"])
            source_cache[key]=tmp
            source_meta[key]={
                "mirror_path":source_path,
                "mirror_url":url,
                "duration":info["duration"],
                "sample_rate":info["sample_rate"],
                "channels":info["channels"],
                "codec":info["codec"],
                "bits_raw":info["bits_raw"],
                "bits_sample":info["bits_sample"],
                "rms_dbfs":rms,
                "sha256":sha256(tmp),
            }
            print(
                "URMP_SOURCE_VERIFIED="
                +sel["folder"]+":"+str(sel["track"])+":"+sel["inst"]
                +f" SR={info['sample_rate']} CH={info['channels']} "
                +f"DURATION={info['duration']:.2f}s RMS={rms:.2f}",
                flush=True,
            )

        src=source_cache[key]
        meta=source_meta[key]
        dest=OUT/sel["family"]/(f"{index:02d}_{sel['folder']}_{sel['inst']}.wav")
        actual_start=create_clip(src,dest,float(sel["start"]),24.0)

        row={
            "audio_path":str(dest.relative_to(ROOT)),
            "prompt_override":PROMPTS[sel["family"]],
            "genre":"Human Performance Phrase",
            "subgenre":"URMP Isolated Instrument Performance",
            "instrument_family":sel["family"],
            "license_type":"CC0_PUBLIC_DOMAIN",
            "rights_to_train":True,
            "synthetic":False,
            "bpm":None,
            "key":"",
            "time_signature":"4",
            "performance_type":"phrase_level",
            "promotion_eligible":True,
            "custom_tag":"<SONARA_PHYSICAL_REALISM>",
            "dataset_stage":"phrase-human-v7-urmp-hf",
            "source":"URMP Dataset",
            "source_page":SOURCE_PAGE,
            "source_doi":SOURCE_DOI,
            "source_license":"CC0-1.0",
            "source_attribution":ATTRIBUTION,
            "transport_mirror":"Hugging Face Eredis02/URMP",
            "transport_mirror_page":MIRROR_PAGE,
            "transport_mirror_path":meta["mirror_path"],
            "transport_mirror_url":meta["mirror_url"],
            "source_track_sha256":meta["sha256"],
            "source_duration_seconds":round(meta["duration"],3),
            "source_sample_rate":meta["sample_rate"],
            "source_channels":meta["channels"],
            "source_codec":meta["codec"],
            "source_rms_dbfs":round(meta["rms_dbfs"],3),
            "training_clip_start_seconds":round(actual_start,3),
            "training_clip_seconds":24.0,
            "sha256":sha256(dest),
        }
        rows.append(row)
        added.append(row)
        fam_count=sum(1 for x in added if x["instrument_family"]==sel["family"])
        print(
            f"URMP_HUMAN_PHRASE_IMPORTED={sel['family']}:{fam_count}/4 "
            f"SOURCE={sel['folder']} TRACK={sel['track']} {sel['inst']}",
            flush=True,
        )

    for path in set(source_cache.values()):
        path.unlink(missing_ok=True)

    DATASET.write_text(json.dumps(rows,indent=2)+"\n",encoding="utf-8")

    counts={}
    for row in added:
        fam=row["instrument_family"]
        counts[fam]=counts.get(fam,0)+1

    report={
        "version":"sonara-phrase-human-v7-urmp-hf",
        "originalSource":"URMP / Dryad",
        "originalLicense":"CC0-1.0",
        "originalDOI":SOURCE_DOI,
        "transportMirror":"Hugging Face Eredis02/URMP",
        "added":len(added),
        "families":counts,
        "humanPhraseLevel":len(added),
        "sourceTracksDownloaded":len(source_meta),
        "integrityChecks":[
            "official URMP folder/instrument naming",
            "48 kHz sample rate",
            "mono isolated source",
            "PCM codec",
            "duration consistent with official URMP documentation",
            "non-silent RMS",
            "SHA-256 recorded per source and training clip",
        ],
    }
    (ROOT/"phrase_human_v7_urmp_hf_report.json").write_text(
        json.dumps(report,indent=2)+"\n",encoding="utf-8"
    )

    print("URMP_HUMAN_PHRASE_LEVEL_ADDED="+str(len(added)),flush=True)
    print("URMP_PHRASE_FAMILIES="+json.dumps(counts,separators=(",",":")),flush=True)
    print("URMP_SOURCE_TRACKS_DOWNLOADED="+str(len(source_meta)),flush=True)
    print("URMP_ORIGINAL_LICENSE=CC0-1.0",flush=True)
    print("URMP_TRANSPORT_MIRROR=HUGGINGFACE",flush=True)
    print("ATTRIBUTION_RECORDED=True",flush=True)
    print("NEXT_ACTION=RUN_DATASET_INTAKE",flush=True)

if __name__=="__main__":
    main()
