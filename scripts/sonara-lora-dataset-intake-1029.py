#!/usr/bin/env python3
from __future__ import annotations
import json
import pathlib
import hashlib
from datetime import datetime, timezone

ROOT=pathlib.Path("/marimo/SONARA-LORA-DATASET")
AUDIO_EXTS={".wav",".flac",".mp3",".ogg",".opus",".m4a",".aac"}
FAMILY_RULES=[
    ("acoustic-drums",("drum","batteria","kit","snare","kick","cymbal","ride","hihat","hi-hat","tom")),
    ("piano-keys",("piano","rhodes","wurlitzer","keys","keyboard","clavinet")),
    ("guitars-fretted",("guitar","chitarra","mandolin","ukulele","sitar","oud")),
    ("bass",("bass","basso","contrabass","upright")),
    ("bowed-strings",("violin","viola","cello","strings","archi","violino","violoncello")),
    ("brass-woodwinds",("sax","saxophone","trumpet","trombone","horn","flute","clarinet","oboe","bassoon","fiati","ottoni")),
]

def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            chunk=f.read(1024*1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def infer_family(path):
    text=" ".join([path.stem.lower(),*(p.lower() for p in path.parts[-3:])])
    for family,words in FAMILY_RULES:
        if any(word in text for word in words):
            return family
    return "unknown"

def prompt_for(family):
    prompts={
        "acoustic-drums":"Real acoustic drum kit performance with human dynamics, ghost notes, non-identical stick attacks, natural cymbal decay, shell resonance, room continuity and phrase-aware fills.",
        "piano-keys":"Real piano or electric piano performance with velocity-shaped attacks, sympathetic resonance, pedal behavior, natural key releases and physically playable voicings.",
        "guitars-fretted":"Real guitar performance with pick or finger dynamics, physically playable chord shapes, string/fret resonance, non-identical strums and believable amp/cab tone when electric.",
        "bass":"Real bass performance with physical string attack, note-length variation, slides only when playable, finger/pick variation and natural low-end body resonance.",
        "bowed-strings":"Real bowed-string performance with changing bow pressure/speed, connected legato, phrase-shaped vibrato, natural bow changes and wooden-body resonance.",
        "brass-woodwinds":"Real brass or woodwind performance with breath-capacity phrasing, register-dependent timbre, articulation changes, natural pitch connections and no synthetic endless sustain.",
        "unknown":"Professional recorded human instrumental performance with natural articulation, dynamics, room continuity, physical playability and non-repeating transients."
    }
    return prompts[family]

def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    files=sorted(p for p in ROOT.rglob("*") if p.is_file() and p.suffix.lower() in AUDIO_EXTS)
    print("AUDIO_FILES_FOUND="+str(len(files)))
    if not files:
        print("TRAINING_READY=False")
        print("NEXT_ACTION=PUT_REAL_AUDIO_IN_"+str(ROOT))
        return

    manifest_path=ROOT/"dataset.json"
    existing=[]
    if manifest_path.is_file():
        try:
            data=json.loads(manifest_path.read_text(encoding="utf-8"))
            if isinstance(data,list):
                existing=data
        except Exception:
            pass
    by_rel={str(row.get("audio_path") or ""):row for row in existing if isinstance(row,dict)}

    rows=[]
    family_counts={}
    rights_ready=0
    real_count=0
    for p in files:
        rel=str(p.relative_to(ROOT))
        old=by_rel.get(rel,{})
        family=str(old.get("instrument_family") or infer_family(p)).strip().lower()
        family_counts[family]=family_counts.get(family,0)+1
        license_type=str(old.get("license_type") or "UNDECLARED").upper()
        rights=old.get("rights_to_train") is True
        synthetic=bool(old.get("synthetic",False))
        if rights and license_type in {"OWNED","EXPLICITLY_LICENSED"}:
            rights_ready+=1
        if not synthetic:
            real_count+=1
        rows.append({
            "audio_path":rel,
            "prompt_override":str(old.get("prompt_override") or prompt_for(family)),
            "genre":str(old.get("genre") or ""),
            "subgenre":str(old.get("subgenre") or ""),
            "instrument_family":family,
            "license_type":license_type,
            "rights_to_train":rights,
            "synthetic":synthetic,
            "bpm":old.get("bpm"),
            "key":str(old.get("key") or ""),
            "time_signature":str(old.get("time_signature") or "4"),
            "custom_tag":"<SONARA_PHYSICAL_REALISM>",
            "sha256":sha256(p),
        })

    manifest_path.write_text(json.dumps(rows,indent=2)+"\n",encoding="utf-8")
    report={
        "generatedAt":datetime.now(timezone.utc).isoformat(),
        "audioFiles":len(files),
        "realFiles":real_count,
        "rightsReady":rights_ready,
        "families":family_counts,
        "manifest":str(manifest_path),
        "developmentReady":rights_ready==len(files) and len(files)>=1,
        "promotionReady":rights_ready==len(files) and real_count==len(files) and len(files)>=50,
    }
    (ROOT/"sonara_dataset_readiness.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    print("DATASET_MANIFEST="+str(manifest_path))
    print("RIGHTS_READY="+str(rights_ready)+"/"+str(len(files)))
    print("REAL_AUDIO="+str(real_count)+"/"+str(len(files)))
    print("FAMILIES="+json.dumps(family_counts,separators=(",",":")))
    print("DEVELOPMENT_READY="+str(report["developmentReady"]))
    print("PROMOTION_READY="+str(report["promotionReady"]))
    if not report["developmentReady"]:
        print("TRAINING_READY=False")
        print("NEXT_ACTION=SET_LICENSE_TYPE_AND_RIGHTS_TO_TRAIN_IN_DATASET_JSON")
    else:
        print("TRAINING_READY=True")
        print("NEXT_ACTION=RUN_OFFICIAL_ACE_STEP_LORA_TRAINER")

if __name__=="__main__":
    main()
