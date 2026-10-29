#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import tarfile
import tempfile
import urllib.parse
import urllib.request

ROOT=pathlib.Path("/marimo/SONARA-LORA-DATASET")
DATASET=ROOT/"dataset.json"
CACHE=pathlib.Path("/marimo/SONARA-URMP-CACHE")
OUT=ROOT/"phrase-human-v6-urmp"

DRYAD="https://datadryad.org"
DOI="doi:10.5061/dryad.ng3r749"
SOURCE_PAGE="https://datadryad.org/dataset/doi:10.5061/dryad.ng3r749"
ATTRIBUTION=(
    "Li, Bochen; Liu, Xinzhao; Dinesh, Karthik; Duan, Zhiyao; Sharma, Gaurav. "
    "Data from: Creating a multi-track classical music performance dataset for "
    "multi-modal music analysis: challenges, insights, and applications. Dryad. "
    "DOI: 10.5061/dryad.ng3r749. CC0."
)

GROUPS={
    "bass":{
        "count":4,
        "tokens":["_db_"],
        "prompt":"Real human double-bass performance phrase with natural finger/bow articulation, physical string resonance, playable position changes, note-length variation and continuous acoustic room response.",
    },
    "bowed-strings":{
        "count":4,
        "tokens":["_vn_","_va_","_vc_"],
        "prompt":"Real human bowed-string performance phrase with natural bow changes, connected legato, position shifts, phrase-shaped vibrato, dynamic bow pressure and resonant wooden body.",
    },
    "brass-woodwinds":{
        "count":4,
        "tokens":["_fl_","_cl_","_ob_","_bn_","_sax_","_tpt_","_hn_","_tbn_","_tba_"],
        "prompt":"Real human brass or woodwind performance phrase with breath-capacity phrasing, idiomatic articulation, register-dependent tone, natural pitch connections and expressive dynamics.",
    },
}

def request_json(url,timeout=90):
    req=urllib.request.Request(
        url,
        headers={
            "User-Agent":"SONARA-URMP-Ingest/1.0",
            "Accept":"application/json",
        },
    )
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def abs_url(href):
    if str(href).startswith("http"):
        return str(href)
    return DRYAD+str(href)

def dryad_archive_metadata():
    encoded=urllib.parse.quote(DOI,safe="")
    versions=request_json(f"{DRYAD}/api/v2/datasets/{encoded}/versions")
    version_rows=((versions.get("_embedded") or {}).get("stash:versions") or [])
    if not version_rows:
        raise SystemExit("DRYAD_VERSIONS_EMPTY")
    published=[v for v in version_rows if str(v.get("curationStatus") or "").lower()=="published"]
    chosen=max(published or version_rows,key=lambda v:int(v.get("versionNumber") or 0))
    version_id=chosen.get("id")
    if version_id is None:
        href=((chosen.get("_links") or {}).get("self") or {}).get("href","")
        version_id=str(href).rstrip("/").split("/")[-1]
    if not str(version_id).isdigit():
        raise SystemExit("DRYAD_VERSION_ID_INVALID")

    url=f"{DRYAD}/api/v2/versions/{version_id}/files"
    files=[]
    while url:
        page=request_json(url)
        files.extend(((page.get("_embedded") or {}).get("stash:files") or []))
        next_link=((page.get("_links") or {}).get("next") or {}).get("href")
        url=abs_url(next_link) if next_link else None

    matches=[f for f in files if pathlib.PurePosixPath(str(f.get("path") or "")).name=="Dataset.tar.gz"]
    if len(matches)!=1:
        raise SystemExit(f"DRYAD_ARCHIVE_MATCHES={len(matches)}")
    item=matches[0]
    download=((item.get("_links") or {}).get("stash:download") or {}).get("href")
    if not download:
        raise SystemExit("DRYAD_DOWNLOAD_LINK_MISSING")
    return {
        "versionId":int(version_id),
        "path":str(item.get("path")),
        "size":int(item.get("size") or 0),
        "digest":str(item.get("digest") or "").lower(),
        "digestType":str(item.get("digestType") or "").lower(),
        "downloadUrl":abs_url(download),
    }

def digest_file(path,algo):
    h=hashlib.new(algo)
    with open(path,"rb") as f:
        while True:
            b=f.read(8*1024*1024)
            if not b: break
            h.update(b)
    return h.hexdigest()

def download_archive(meta,path):
    expected_size=int(meta["size"])
    reserve=6*1024**3
    free=shutil.disk_usage("/marimo").free
    print("DISK_FREE_GB="+f"{free/1024**3:.2f}",flush=True)
    print("URMP_ARCHIVE_GB="+f"{expected_size/1024**3:.2f}",flush=True)
    if expected_size and free < expected_size+reserve:
        raise SystemExit(
            "INSUFFICIENT_DISK_FOR_URMP="
            +f"FREE_GB={free/1024**3:.2f};REQUIRED_GB={(expected_size+reserve)/1024**3:.2f}"
        )

    CACHE.mkdir(parents=True,exist_ok=True)
    part=path.with_suffix(path.suffix+".part")
    if path.is_file() and (not expected_size or path.stat().st_size==expected_size):
        print("URMP_ARCHIVE_CACHE_HIT=True",flush=True)
    else:
        path.unlink(missing_ok=True)
        part.unlink(missing_ok=True)
        req=urllib.request.Request(
            meta["downloadUrl"],
            headers={
                "User-Agent":"SONARA-URMP-Ingest/1.0",
                "Accept":"application/octet-stream",
            },
        )
        with urllib.request.urlopen(req,timeout=300) as r, open(part,"wb") as out:
            total=0
            next_report=512*1024**2
            while True:
                b=r.read(4*1024*1024)
                if not b: break
                out.write(b)
                total+=len(b)
                if total>=next_report:
                    print("URMP_DOWNLOADED_GB="+f"{total/1024**3:.2f}",flush=True)
                    next_report+=512*1024**2
        if expected_size and part.stat().st_size!=expected_size:
            raise SystemExit(
                f"URMP_SIZE_MISMATCH={part.stat().st_size}/{expected_size}"
            )
        part.replace(path)

    dtype=str(meta.get("digestType") or "")
    expected=str(meta.get("digest") or "")
    if expected and dtype in {"sha-256","sha256","md5"}:
        algo="sha256" if "sha" in dtype else "md5"
        actual=digest_file(path,algo)
        if actual.lower()!=expected.lower():
            raise SystemExit(f"URMP_DIGEST_MISMATCH={actual}/{expected}")
        print("URMP_ARCHIVE_DIGEST_VERIFIED=True",flush=True)
    else:
        print("URMP_ARCHIVE_DIGEST_AVAILABLE=False",flush=True)

def duration(path):
    p=subprocess.run([
        "ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1",str(path)
    ],text=True,capture_output=True,check=True)
    return float(p.stdout.strip())

def member_piece_key(name):
    parts=pathlib.PurePosixPath(name).parts
    for part in parts:
        if any(ch.isdigit() for ch in part) and "_" in part:
            return part.lower()
    return str(pathlib.PurePosixPath(name).parent).lower()

def is_isolated_audio(name):
    low="/"+name.lower().replace("\\","/")+"/"
    base=pathlib.PurePosixPath(name).name.lower()
    if not base.endswith(".wav"):
        return False
    if "mix" in base or "aumix" in base:
        return False
    # URMP individual recordings conventionally include AuSep; accept tokenized
    # isolated tracks even if a package version uses a slightly different prefix.
    return ("ausep" in base) or any(
        token in base
        for spec in GROUPS.values()
        for token in spec["tokens"]
    )

def family_for(name):
    base=pathlib.PurePosixPath(name).name.lower()
    for family,spec in GROUPS.items():
        if any(token in base for token in spec["tokens"]):
            return family
    return None

def choose_members(tf):
    chosen={family:[] for family in GROUPS}
    used_piece={family:set() for family in GROUPS}
    members=[
        m for m in tf.getmembers()
        if m.isfile() and is_isolated_audio(m.name)
    ]
    # Stable ordering, then prefer diversity across pieces and instruments.
    members.sort(key=lambda m:m.name.lower())

    for member in members:
        family=family_for(member.name)
        if family is None or len(chosen[family])>=GROUPS[family]["count"]:
            continue
        piece=member_piece_key(member.name)
        if piece in used_piece[family]:
            continue
        chosen[family].append(member)
        used_piece[family].add(piece)

    missing={k:GROUPS[k]["count"]-len(v) for k,v in chosen.items() if len(v)<GROUPS[k]["count"]}
    if missing:
        # Relax distinct-piece constraint only if needed.
        selected_names={m.name for vals in chosen.values() for m in vals}
        for member in members:
            family=family_for(member.name)
            if family is None or len(chosen[family])>=GROUPS[family]["count"] or member.name in selected_names:
                continue
            chosen[family].append(member)
            selected_names.add(member.name)
        missing={k:GROUPS[k]["count"]-len(v) for k,v in chosen.items() if len(v)<GROUPS[k]["count"]}
    if missing:
        raise SystemExit("URMP_NOT_ENOUGH_ISOLATED_TRACKS="+json.dumps(missing,separators=(",",":")))
    return chosen

def write_phrase(tf,member,dest):
    with tempfile.NamedTemporaryFile(prefix="sonara_urmp_",suffix=".wav",delete=False) as temp:
        temp_path=pathlib.Path(temp.name)
        src=tf.extractfile(member)
        if src is None:
            raise RuntimeError("tar_extract_failed")
        shutil.copyfileobj(src,temp)

    try:
        dur=duration(temp_path)
        if dur<12.0:
            raise RuntimeError(f"source_too_short={dur}")
        clip=min(24.0,dur)
        start=0.0 if dur<=clip+2.0 else min(max(1.0,dur*0.20),dur-clip-1.0)
        dest.parent.mkdir(parents=True,exist_ok=True)
        subprocess.run([
            "ffmpeg","-y","-v","error",
            "-ss",f"{start:.3f}","-i",str(temp_path),
            "-t",f"{clip:.3f}",
            "-ar","48000","-ac","2","-c:a","pcm_s24le",str(dest)
        ],check=True)
        return dur,clip
    finally:
        temp_path.unlink(missing_ok=True)

def sha256(path):
    return digest_file(path,"sha256")

def load_rows():
    if not DATASET.is_file():
        raise SystemExit("DATASET_JSON_MISSING")
    rows=json.loads(DATASET.read_text(encoding="utf-8"))
    if not isinstance(rows,list):
        raise SystemExit("DATASET_JSON_INVALID")
    return rows

def main():
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise SystemExit("FFMPEG_OR_FFPROBE_MISSING")

    rows=load_rows()
    rows=[r for r in rows if str(r.get("dataset_stage") or "")!="phrase-human-v6-urmp"]
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True,exist_ok=True)

    meta=dryad_archive_metadata()
    print("DRYAD_VERSION_ID="+str(meta["versionId"]),flush=True)
    print("DRYAD_FILE="+meta["path"],flush=True)
    archive=CACHE/"Dataset.tar.gz"

    try:
        download_archive(meta,archive)
        added=[]
        with tarfile.open(archive,"r:gz") as tf:
            chosen=choose_members(tf)
            for family,members in chosen.items():
                for idx,member in enumerate(members,1):
                    dest=OUT/family/f"{idx:02d}_{pathlib.PurePosixPath(member.name).name}"
                    source_dur,clip_dur=write_phrase(tf,member,dest)
                    row={
                        "audio_path":str(dest.relative_to(ROOT)),
                        "prompt_override":GROUPS[family]["prompt"],
                        "genre":"Human Performance Phrase",
                        "subgenre":"URMP Isolated Instrument Performance",
                        "instrument_family":family,
                        "license_type":"CC0_PUBLIC_DOMAIN",
                        "rights_to_train":True,
                        "synthetic":False,
                        "bpm":None,
                        "key":"",
                        "time_signature":"4",
                        "performance_type":"phrase_level",
                        "promotion_eligible":True,
                        "custom_tag":"<SONARA_PHYSICAL_REALISM>",
                        "dataset_stage":"phrase-human-v6-urmp",
                        "source":"URMP Dataset",
                        "source_page":SOURCE_PAGE,
                        "source_doi":"10.5061/dryad.ng3r749",
                        "source_license":"CC0-1.0",
                        "source_attribution":ATTRIBUTION,
                        "source_archive_member":member.name,
                        "source_duration_seconds":round(source_dur,3),
                        "training_clip_seconds":round(clip_dur,3),
                        "sha256":sha256(dest),
                    }
                    rows.append(row)
                    added.append(row)
                    print(
                        f"URMP_HUMAN_PHRASE_IMPORTED={family}:{idx}/{len(members)} "
                        f"DURATION={clip_dur:.2f}s MEMBER={member.name}",
                        flush=True,
                    )

        DATASET.write_text(json.dumps(rows,indent=2)+"\n",encoding="utf-8")
        counts={}
        for row in added:
            fam=row["instrument_family"]
            counts[fam]=counts.get(fam,0)+1
        report={
            "version":"sonara-phrase-human-v6-urmp",
            "source":"URMP / Dryad",
            "license":"CC0-1.0",
            "added":len(added),
            "families":counts,
            "humanPhraseLevel":len(added),
            "archiveDigestVerified":True,
            "promotionReadyExpectedAfterIntake":len(added)>=12,
        }
        (ROOT/"phrase_human_v6_urmp_report.json").write_text(
            json.dumps(report,indent=2)+"\n",encoding="utf-8"
        )
        print("URMP_HUMAN_PHRASE_LEVEL_ADDED="+str(len(added)),flush=True)
        print("URMP_PHRASE_FAMILIES="+json.dumps(counts,separators=(",",":")),flush=True)
        print("ATTRIBUTION_RECORDED=True",flush=True)
        print("NEXT_ACTION=RUN_DATASET_INTAKE",flush=True)
    finally:
        archive.unlink(missing_ok=True)
        (archive.with_suffix(archive.suffix+".part")).unlink(missing_ok=True)
        try:
            CACHE.rmdir()
        except Exception:
            pass
        print("URMP_ARCHIVE_REMOVED=True",flush=True)

if __name__=="__main__":
    main()
