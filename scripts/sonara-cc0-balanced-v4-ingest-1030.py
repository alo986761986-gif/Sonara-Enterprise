#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import pathlib
import urllib.parse
import urllib.request

ROOT=pathlib.Path("/marimo/SONARA-LORA-DATASET")
DATASET=ROOT/"dataset.json"

SOURCES={
    "vsco":{
        "repo":"sgossner/VSCO-2-CE",
        "branch":"master",
        "license":"CC0-1.0",
        "license_url":"https://raw.githubusercontent.com/sgossner/VSCO-2-CE/master/LICENSE",
    },
    "growlybass":{
        "repo":"sfzinstruments/karoryfer.growlybass",
        "branch":"master",
        "license":"CC0-1.0",
        "license_url":"https://raw.githubusercontent.com/sfzinstruments/karoryfer.growlybass/master/LICENSE",
    },
    "drumkit":{
        "repo":"0x4D44/ferrosintesis",
        "branch":"main",
        "license":"CC0-1.0",
        "license_url":"https://raw.githubusercontent.com/0x4D44/ferrosintesis/main/crates/ferrosintesis-samples-drumkit/LICENSE-CC0",
        "provenance_url":"https://raw.githubusercontent.com/0x4D44/ferrosintesis/main/crates/ferrosintesis-samples-drumkit/PROVENANCE.md",
    },
}

def req_bytes(url,timeout=120):
    req=urllib.request.Request(url,headers={"User-Agent":"SONARA-CC0-Balanced-V4-Ingest/1.0"})
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return r.read()

def req_json(url,timeout=120):
    return json.loads(req_bytes(url,timeout).decode("utf-8"))

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            chunk=f.read(1024*1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def verify_cc0():
    for key,src in SOURCES.items():
        text=req_bytes(src["license_url"],60).decode("utf-8","ignore")
        if "CC0 1.0 Universal" not in text and "Creative Commons Zero" not in text:
            raise SystemExit(f"CC0_LICENSE_NOT_VERIFIED={key}")
        print("CC0_VERIFIED="+key,flush=True)

def repo_tree(repo,branch):
    meta=req_json(f"https://api.github.com/repos/{repo}/git/trees/{branch}?recursive=1")
    return [x["path"] for x in meta.get("tree",[]) if x.get("type")=="blob"]

def select_evenly(items,count):
    items=sorted(dict.fromkeys(items))
    if len(items)<count:
        raise SystemExit(f"NOT_ENOUGH_SOURCE_FILES={len(items)}/{count}")
    if count==1:
        return [items[len(items)//2]]
    picks=[]
    used=set()
    for i in range(count):
        idx=round(i*(len(items)-1)/(count-1))
        while idx<len(items) and items[idx] in used:
            idx+=1
        if idx>=len(items):
            idx=0
            while idx<len(items) and items[idx] in used:
                idx+=1
        value=items[idx]
        used.add(value)
        picks.append(value)
    return picks

def raw_url(repo,branch,path):
    encoded=urllib.parse.quote(path,safe="/")
    return f"https://raw.githubusercontent.com/{repo}/{branch}/{encoded}"

def download_one(repo,branch,path,dest):
    dest.parent.mkdir(parents=True,exist_ok=True)
    if not dest.exists():
        data=req_bytes(raw_url(repo,branch,path),180)
        if len(data)<1024:
            raise SystemExit(f"SOURCE_AUDIO_TOO_SMALL={repo}:{path}")
        dest.write_bytes(data)
    return dest

def existing_rows():
    if not DATASET.is_file():
        return []
    data=json.loads(DATASET.read_text(encoding="utf-8"))
    if not isinstance(data,list):
        raise SystemExit("EXISTING_DATASET_JSON_INVALID")
    return data

def make_row(dest,family,prompt,source_name,source_repo,source_path,extra=None):
    row={
        "audio_path":str(dest.relative_to(ROOT)),
        "prompt_override":prompt,
        "genre":"Recorded Instrument",
        "subgenre":source_name,
        "instrument_family":family,
        "license_type":"CC0_PUBLIC_DOMAIN",
        "rights_to_train":True,
        "synthetic":False,
        "bpm":None,
        "key":"",
        "time_signature":"4",
        "performance_type":"note_or_hit",
        "custom_tag":"<SONARA_PHYSICAL_REALISM>",
        "source":source_name,
        "source_repo":source_repo,
        "source_path":source_path,
        "source_license":"CC0-1.0",
        "sha256":sha256(dest),
    }
    if extra:
        row.update(extra)
    return row

def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    verify_cc0()

    rows=existing_rows()
    kept=[r for r in rows if not str(r.get("dataset_stage") or "").startswith("balanced-v4")]
    additions=[]

    # 24 real acoustic drum-kit samples: balanced across core kit pieces,
    # preserving velocity layers and round-robin diversity.
    drum_tree=repo_tree(SOURCES["drumkit"]["repo"],SOURCES["drumkit"]["branch"])
    drum_prefix="crates/ferrosintesis-samples-drumkit/samples/"
    drum_paths=[p for p in drum_tree if p.startswith(drum_prefix) and p.lower().endswith(".flac")]
    wanted_groups={
        "kick":5,"snare":5,"hhc":5,"hho":4,"ride":4,"tomhi":4,"tomlo":3
    }
    for group,count in wanted_groups.items():
        group_paths=[p for p in drum_paths if pathlib.PurePosixPath(p).name.startswith(group+"_")]
        for p in select_evenly(group_paths,count):
            dest=ROOT/"cc0-balanced-v4"/"drums"/pathlib.PurePosixPath(p).name
            download_one(SOURCES["drumkit"]["repo"],SOURCES["drumkit"]["branch"],p,dest)
            additions.append(make_row(
                dest,
                "acoustic-drums",
                "Real acoustic drum-kit hit from a recorded jazz kit, preserving distinct velocity-layer and round-robin articulation, natural transient, shell/cymbal decay and human-source timbre.",
                "Virtuosity Drums via ferrosintesis",
                SOURCES["drumkit"]["repo"],
                p,
                {
                    "dataset_stage":"balanced-v4-drums",
                    "source_provenance":SOURCES["drumkit"]["provenance_url"],
                    "drum_articulation":group,
                },
            ))

    # 24 real electric bass samples from Growlybass, sustain/staccato only.
    bass_tree=repo_tree(SOURCES["growlybass"]["repo"],SOURCES["growlybass"]["branch"])
    bass_paths=[
        p for p in bass_tree
        if p.lower().endswith(".wav")
        and (p.startswith("sustain/") or p.startswith("staccato/"))
    ]
    for p in select_evenly(bass_paths,30):
        dest=ROOT/"cc0-balanced-v4"/"bass"/pathlib.PurePosixPath(p).name
        download_one(SOURCES["growlybass"]["repo"],SOURCES["growlybass"]["branch"],p,dest)
        additions.append(make_row(
            dest,
            "bass",
            "Real electric bass performance sample with genuine string attack, finger/pluck variation, fret resonance, note-body sustain and natural release behavior.",
            "Karoryfer Growlybass",
            SOURCES["growlybass"]["repo"],
            p,
            {"dataset_stage":"balanced-v4-bass"},
        ))

    # VSCO 2 CE: 24 bowed-string samples, preferring sustained/vibrato/spiccato
    # and spreading across cello/viola/violin sections.
    vsco_tree=repo_tree(SOURCES["vsco"]["repo"],SOURCES["vsco"]["branch"])
    string_candidates=[
        p for p in vsco_tree
        if p.startswith("Strings/") and p.lower().endswith(".wav")
        and any(token in p.lower() for token in ("/sus/","/vib/","/spic/","sustain"))
    ]
    if len(string_candidates)<30:
        string_candidates=[p for p in vsco_tree if p.startswith("Strings/") and p.lower().endswith(".wav")]
    for p in select_evenly(string_candidates,30):
        dest=ROOT/"cc0-balanced-v4"/"strings"/pathlib.PurePosixPath(p).name
        download_one(SOURCES["vsco"]["repo"],SOURCES["vsco"]["branch"],p,dest)
        additions.append(make_row(
            dest,
            "bowed-strings",
            "Real bowed-string orchestral recording with genuine bow pressure/speed, register-dependent body resonance, articulation variation and natural section/player timbre.",
            "VSCO 2 Community Edition",
            SOURCES["vsco"]["repo"],
            p,
            {"dataset_stage":"balanced-v4-strings"},
        ))

    # 24 brass/woodwind samples: 12 from each side, preferring sustain/staccato/vibrato.
    brass_candidates=[
        p for p in vsco_tree
        if p.startswith("Brass/") and p.lower().endswith(".wav")
        and any(token in p.lower() for token in ("/sus/","/stac/","/vib/","sustain"))
    ]
    wood_candidates=[
        p for p in vsco_tree
        if p.startswith("Woodwinds/") and p.lower().endswith(".wav")
        and any(token in p.lower() for token in ("/sus/","/stac/","/vib/","sustain"))
    ]
    if len(brass_candidates)<15:
        brass_candidates=[p for p in vsco_tree if p.startswith("Brass/") and p.lower().endswith(".wav")]
    if len(wood_candidates)<15:
        wood_candidates=[p for p in vsco_tree if p.startswith("Woodwinds/") and p.lower().endswith(".wav")]
    for kind,items in (("brass",select_evenly(brass_candidates,15)),("woodwind",select_evenly(wood_candidates,15))):
        for p in items:
            dest=ROOT/"cc0-balanced-v4"/"brass-woodwinds"/pathlib.PurePosixPath(p).name
            download_one(SOURCES["vsco"]["repo"],SOURCES["vsco"]["branch"],p,dest)
            additions.append(make_row(
                dest,
                "brass-woodwinds",
                "Real brass or woodwind orchestral recording with breath-shaped articulation, register-dependent tone, natural attack/release and authentic acoustic resonance.",
                "VSCO 2 Community Edition",
                SOURCES["vsco"]["repo"],
                p,
                {"dataset_stage":"balanced-v4-brass-woodwinds","source_family":kind},
            ))

    if len(additions)!=120:
        raise SystemExit(f"ADDITION_COUNT_INVALID={len(additions)}")

    final=kept+additions
    DATASET.write_text(json.dumps(final,indent=2)+"\n",encoding="utf-8")

    counts={}
    for row in final:
        fam=str(row.get("instrument_family") or "unknown")
        counts[fam]=counts.get(fam,0)+1

    report={
        "existingBefore":len(kept),
        "added":len(additions),
        "total":len(final),
        "families":counts,
        "cc0Verified":True,
        "phraseLevelAdded":0,
        "promotionReady":False,
        "reason":"Balanced timbre/articulation bootstrap complete; phrase-level human performances still required before promotion.",
    }
    (ROOT/"balanced_v2_report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")

    print("CC0_BALANCED_V2_IMPORTED="+str(len(additions)),flush=True)
    print("TOTAL_DATASET_ROWS="+str(len(final)),flush=True)
    print("FAMILIES="+json.dumps(counts,separators=(",",":")),flush=True)
    print("PHRASE_LEVEL_ADDED=0",flush=True)
    print("PROMOTION_READY=False",flush=True)
    print("NEXT_ACTION=RUN_DATASET_INTAKE",flush=True)

if __name__=="__main__":
    main()
