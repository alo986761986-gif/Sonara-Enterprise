#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
from collections import Counter

ACE=pathlib.Path("/marimo/SONARA-ACE-Step-CLEAN")
CHECKPOINTS=ACE/"checkpoints"
SOURCE=pathlib.Path("/marimo/SONARA-LORA-DATASET")
SOURCE_JSON=SOURCE/"dataset.json"

WORK=ACE/"sonara_training"/"physical_realism_v4"
AUDIO=WORK/"audio"
ACE_JSON=WORK/"dataset_v4_ace.json"
TENSORS=WORK/"tensors"
SOURCE_DIGEST_FILE=WORK/"source_dataset_sha256.txt"
REPORT=WORK/"sonara_v4_preprocess_report.json"

UV=shutil.which("uv") or "/usr/local/bin/uv"
MODEL_VARIANT="acestep-v15-xl-turbo"
TAG="<SONARA_PHYSICAL_REALISM>"

ALLOWED_LICENSES={"OWNED","EXPLICITLY_LICENSED","CC0_PUBLIC_DOMAIN","CC_BY_4_0"}
REQUIRED_FAMILIES={
    "piano-keys","guitars-fretted","acoustic-drums",
    "bass","bowed-strings","brass-woodwinds",
}
PHRASE_TYPES={"phrase","phrase_level","performance","full_performance"}

def sha256_file(path:pathlib.Path)->str:
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            b=f.read(1024*1024)
            if not b:
                break
            h.update(b)
    return h.hexdigest()

def load_rows():
    if not SOURCE_JSON.is_file():
        raise SystemExit("V4_SOURCE_DATASET_JSON_MISSING")
    rows=json.loads(SOURCE_JSON.read_text(encoding="utf-8"))
    if not isinstance(rows,list) or not rows:
        raise SystemExit("V4_SOURCE_DATASET_JSON_INVALID")
    return rows

def validate_gate(rows):
    missing_files=[]
    rights_bad=[]
    license_bad=[]
    ccby_bad=[]

    for idx,row in enumerate(rows):
        raw=str(row.get("audio_path") or "")
        p=(SOURCE/raw).resolve() if raw and not pathlib.Path(raw).is_absolute() else pathlib.Path(raw).resolve()
        if not raw or not p.is_file():
            missing_files.append(idx)
        if row.get("rights_to_train") is not True:
            rights_bad.append(idx)
        lic=str(row.get("license_type") or "").upper()
        if lic not in ALLOWED_LICENSES:
            license_bad.append(idx)
        if lic=="CC_BY_4_0" and not str(row.get("source_attribution") or "").strip():
            ccby_bad.append(idx)

    if missing_files:
        raise SystemExit("V4_MISSING_AUDIO_FILES="+json.dumps(missing_files[:20]))
    if rights_bad:
        raise SystemExit("V4_RIGHTS_INVALID="+json.dumps(rights_bad[:20]))
    if license_bad:
        raise SystemExit("V4_LICENSE_INVALID="+json.dumps(license_bad[:20]))
    if ccby_bad:
        raise SystemExit("V4_CCBY_ATTRIBUTION_MISSING="+json.dumps(ccby_bad[:20]))

    promotion_rows=[r for r in rows if r.get("promotion_eligible") is not False]
    augmentation_rows=[r for r in rows if r.get("promotion_eligible") is False]

    synthetic_promotion=[r for r in promotion_rows if bool(r.get("synthetic",False))]
    if synthetic_promotion:
        raise SystemExit("V4_SYNTHETIC_PROMOTION_ROWS="+str(len(synthetic_promotion)))

    family_counts=Counter(
        str(r.get("instrument_family") or "unknown").strip().lower()
        for r in promotion_rows
    )
    missing_families=sorted(REQUIRED_FAMILIES-set(family_counts))
    max_family_share=max(family_counts.values())/len(promotion_rows)

    phrase_rows=[
        r for r in promotion_rows
        if str(r.get("performance_type") or "").strip().lower() in PHRASE_TYPES
        and not bool(r.get("synthetic",False))
    ]
    phrase_counts=Counter(
        str(r.get("instrument_family") or "unknown").strip().lower()
        for r in phrase_rows
    )
    phrase_total=len(phrase_rows)
    phrase_coverage=len(phrase_counts)
    max_phrase_share=max(phrase_counts.values())/phrase_total if phrase_total else 1.0

    required_phrase_min={
        "acoustic-drums":12,
        "piano-keys":12,
        "guitars-fretted":10,
        "bass":8,
        "bowed-strings":8,
        "brass-woodwinds":8,
    }
    phrase_family_min_ok=all(
        phrase_counts.get(family,0)>=minimum
        for family,minimum in required_phrase_min.items()
    )
    gates={
        "datasetRowsAtLeast320":len(rows)>=320,
        "promotionRowsAtLeast300":len(promotion_rows)>=300,
        "augmentationRowsAtMost20Pct":len(augmentation_rows)<=max(8,int(len(rows)*0.20)),
        "allSixFamilies":not missing_families,
        "maxFamilyShareAtMost35Pct":max_family_share<=0.35,
        "humanPhrasesAtLeast60":phrase_total>=60,
        "phraseFamiliesAllSix":phrase_coverage>=6,
        "perFamilyPhraseMinimums":phrase_family_min_ok,
        "maxPhraseFamilyShareAtMost30Pct":max_phrase_share<=0.30,
    }
    if not all(gates.values()):
        raise SystemExit("V4_PROMOTION_GATE_FAILED="+json.dumps(gates,separators=(",",":")))

    return {
        "datasetRows":len(rows),
        "promotionRows":len(promotion_rows),
        "augmentationRows":len(augmentation_rows),
        "familyCounts":dict(sorted(family_counts.items())),
        "maxFamilyShare":round(max_family_share,6),
        "humanPhraseLevel":phrase_total,
        "phraseFamilyCounts":dict(sorted(phrase_counts.items())),
        "phraseFamilyCoverage":phrase_coverage,
        "maxPhraseFamilyShare":round(max_phrase_share,6),
        "gates":gates,
    }

def safe_token(value,max_len=54):
    text=re.sub(r"[^A-Za-z0-9._-]+","_",str(value or "")).strip("._-")
    return (text or "audio")[:max_len]

def stage(rows):
    WORK.mkdir(parents=True,exist_ok=True)
    if AUDIO.exists():
        shutil.rmtree(AUDIO)
    AUDIO.mkdir(parents=True,exist_ok=True)

    samples=[]
    hardlinks=0
    copies=0

    for idx,row in enumerate(rows,1):
        raw=pathlib.Path(str(row.get("audio_path")))
        src=raw if raw.is_absolute() else SOURCE/raw
        src=src.resolve()

        family=safe_token(row.get("instrument_family") or "unknown",28)
        stem=safe_token(src.stem,54)
        ext=src.suffix.lower() if src.suffix else ".wav"
        filename=f"{idx:04d}_{family}_{stem}{ext}"
        dest=AUDIO/filename

        try:
            os.link(src,dest)
            hardlinks+=1
        except Exception:
            shutil.copy2(src,dest)
            copies+=1

        caption=str(row.get("prompt_override") or row.get("prompt") or "").strip()
        if not caption:
            raise SystemExit(f"V4_PROMPT_MISSING={idx}")

        duration=(
            row.get("training_clip_seconds")
            or row.get("source_duration_seconds")
            or row.get("duration")
            or 0
        )

        sample={
            "filename":filename,
            "audio_path":str(dest),
            "caption":caption,
            "lyrics":"[Instrumental]",
            "genre":str(row.get("genre") or row.get("subgenre") or row.get("instrument_family") or "Recorded performance"),
            "bpm":row.get("bpm"),
            "keyscale":str(row.get("key") or row.get("keyscale") or ""),
            "timesignature":str(row.get("time_signature") or row.get("timesignature") or "4"),
            "duration":duration,
            "is_instrumental":True,
            "custom_tag":TAG,
            "prompt_override":"caption",

            # Preserve SONARA provenance/audit fields in the staged manifest.
            "instrument_family":row.get("instrument_family"),
            "performance_type":row.get("performance_type"),
            "promotion_eligible":row.get("promotion_eligible",True),
            "synthetic":bool(row.get("synthetic",False)),
            "license_type":row.get("license_type"),
            "rights_to_train":row.get("rights_to_train"),
            "source":row.get("source"),
            "source_url":row.get("source_url"),
            "source_page":row.get("source_page"),
            "source_license":row.get("source_license"),
            "source_license_url":row.get("source_license_url"),
            "source_attribution":row.get("source_attribution"),
            "original_audio_path":str(row.get("audio_path")),
        }
        samples.append(sample)

    staged={
        "metadata":{
            "dataset_name":"sonara_physical_realism_v4",
            "custom_tag":TAG,
            "tag_position":"prepend",
            "genre_ratio":0,
            "all_instrumental":True,
            "source_dataset_sha256":sha256_file(SOURCE_JSON),
            "dataset_rows":len(samples),
        },
        "samples":samples,
    }
    ACE_JSON.write_text(json.dumps(staged,indent=2)+"\n",encoding="utf-8")

    print("STAGED_AUDIO_FILES="+str(len(samples)),flush=True)
    print("STAGED_HARDLINKS="+str(hardlinks),flush=True)
    print("STAGED_COPIES="+str(copies),flush=True)
    print("ACE_DATASET_JSON="+str(ACE_JSON),flush=True)
    return staged

def prepare_tensor_dir(source_digest):
    previous=SOURCE_DIGEST_FILE.read_text(encoding="utf-8").strip() if SOURCE_DIGEST_FILE.is_file() else ""
    if previous and previous!=source_digest:
        print("V4_DATASET_CHANGED=True",flush=True)
        if TENSORS.exists():
            shutil.rmtree(TENSORS)
    elif not previous and TENSORS.exists():
        # Unknown provenance: do not trust stale tensors.
        shutil.rmtree(TENSORS)

    TENSORS.mkdir(parents=True,exist_ok=True)
    SOURCE_DIGEST_FILE.write_text(source_digest+"\n",encoding="utf-8")

def run_preprocess(expected_count):
    if not ACE.is_dir():
        raise SystemExit("ACE_ROOT_MISSING")
    if not (ACE/"acestep"/"training_v2"/"preprocess.py").is_file():
        raise SystemExit("ACE_TRAINING_V2_PREPROCESS_MISSING")
    if not (CHECKPOINTS/MODEL_VARIANT).is_dir():
        raise SystemExit("XL_TURBO_CHECKPOINT_MISSING")

    existing=len([
        p for p in TENSORS.glob("*.pt")
        if not p.name.endswith(".tmp.pt")
    ])
    print("V4_EXISTING_TENSORS="+str(existing),flush=True)

    if existing<expected_count:
        cmd=[
            UV,"run","python","-m","acestep.training_v2.cli.train_fixed",
            "--plain","--yes",
            "--checkpoint-dir",str(CHECKPOINTS),
            "--model-variant",MODEL_VARIANT,
            "--base-model","xl_turbo",
            "--device","cuda:0",
            "--precision","bf16",
            "--preprocess",
            "--audio-dir",str(AUDIO),
            "--dataset-json",str(ACE_JSON),
            "--tensor-output",str(TENSORS),
            "--max-duration","240",
        ]
        print("RUN="+" ".join(str(x) for x in cmd),flush=True)
        subprocess.run([str(x) for x in cmd],cwd=str(ACE),check=True)

def audit_tensors(expected_count):
    pts=sorted(
        p for p in TENSORS.glob("*.pt")
        if not p.name.endswith(".tmp.pt")
    )
    tmp=sorted(TENSORS.glob("*.tmp.pt"))
    if len(pts)!=expected_count:
        raise SystemExit(f"V4_TENSOR_COUNT_INVALID={len(pts)}/{expected_count}")
    if tmp:
        raise SystemExit(f"V4_TMP_TENSORS_REMAIN={len(tmp)}")

    code=r"""
import json, pathlib, sys, torch
root=pathlib.Path(sys.argv[1])
files=sorted(p for p in root.glob("*.pt") if not p.name.endswith(".tmp.pt"))
required={
    "target_latents","attention_mask","encoder_hidden_states",
    "encoder_attention_mask","context_latents","metadata",
}
bad=[]
caption_missing=0
tag_missing=0
for p in files:
    d=torch.load(str(p),map_location="cpu",weights_only=True)
    missing=required-set(d)
    if missing:
        bad.append({"file":p.name,"missing":sorted(missing)})
        continue
    for k in required-{"metadata"}:
        t=d[k]
        if not hasattr(t,"numel") or t.numel()<=0:
            bad.append({"file":p.name,"empty":k})
    meta=d.get("metadata") or {}
    if not str(meta.get("caption") or "").strip():
        caption_missing+=1
    if "<SONARA_PHYSICAL_REALISM>" not in str(meta.get("custom_tag") or ""):
        tag_missing+=1
print(json.dumps({
    "count":len(files),
    "bad":bad[:10],
    "badCount":len(bad),
    "captionMissing":caption_missing,
    "tagMissing":tag_missing,
},separators=(",",":")))
"""
    result=subprocess.run(
        [UV,"run","python","-c",code,str(TENSORS)],
        cwd=str(ACE),
        text=True,
        capture_output=True,
        check=True,
    )
    lines=[x for x in result.stdout.splitlines() if x.strip()]
    if not lines:
        raise SystemExit("V4_TENSOR_AUDIT_NO_OUTPUT")
    audit=json.loads(lines[-1])
    if audit["count"]!=expected_count or audit["badCount"]!=0 or audit["captionMissing"]!=0 or audit["tagMissing"]!=0:
        raise SystemExit("V4_TENSOR_AUDIT_FAILED="+json.dumps(audit,separators=(",",":")))
    return audit

def main():
    rows=load_rows()
    gate=validate_gate(rows)
    print("V4_PROMOTION_GATE="+json.dumps(gate,separators=(",",":")),flush=True)
    print("PROMOTION_READY=True",flush=True)

    source_digest=sha256_file(SOURCE_JSON)
    staged=stage(rows)
    prepare_tensor_dir(source_digest)
    run_preprocess(len(rows))
    audit=audit_tensors(len(rows))

    report={
        "version":"sonara-physical-realism-v4-preprocess",
        "sourceDataset":str(SOURCE_JSON),
        "sourceDatasetSha256":source_digest,
        "stagedDataset":str(ACE_JSON),
        "workspace":str(WORK),
        "tensorDir":str(TENSORS),
        "datasetRows":len(rows),
        "promotionGate":gate,
        "tensorAudit":audit,
        "trainerNext":"ACE-Step training_v2 fixed",
        "audioGenerated":False,
        "nextAction":"TRAIN_V4_FIXED",
    }
    REPORT.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")

    print("PREPROCESSED_TENSORS="+str(audit["count"]),flush=True)
    print("TENSOR_AUDIT_BAD_COUNT="+str(audit["badCount"]),flush=True)
    print("TENSOR_CAPTION_MISSING="+str(audit["captionMissing"]),flush=True)
    print("TENSOR_TAG_MISSING="+str(audit["tagMissing"]),flush=True)
    print("V4_TENSORS_READY=True",flush=True)
    print("NO_AUDIO_GENERATED=True",flush=True)
    print("NEXT_ACTION=TRAIN_V4_FIXED",flush=True)
    print("REPORT_JSON="+str(REPORT),flush=True)

if __name__=="__main__":
    main()
