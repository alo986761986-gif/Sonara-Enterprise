#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import pathlib

ROOT=pathlib.Path("/marimo/SONARA-V3-AUDIO-BENCHMARK")
MANIFEST=ROOT/"blind_manifest_isolated.json"
UNBLIND=ROOT/"unblind_map_isolated.json"
TEMPLATE=ROOT/"blind_review_template.json"
SUMMARY=ROOT/"blind_review_precheck.json"

EXPECTED_PAIRS=12
EXPECTED_CLIPS=24

def sha256(path:pathlib.Path)->str:
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            b=f.read(1024*1024)
            if not b:
                break
            h.update(b)
    return h.hexdigest()

def main():
    if not MANIFEST.is_file():
        raise SystemExit("BLIND_MANIFEST_MISSING")
    if not UNBLIND.is_file():
        raise SystemExit("UNBLIND_MAP_MISSING")

    manifest=json.loads(MANIFEST.read_text(encoding="utf-8"))
    if not isinstance(manifest,list) or len(manifest)!=EXPECTED_PAIRS:
        raise SystemExit(f"BLIND_PAIR_COUNT_INVALID={len(manifest) if isinstance(manifest,list) else 'NA'}")

    rows=[]
    bad=[]
    total_clips=0

    for item in manifest:
        pair_number=int(item.get("pairNumber") or 0)
        clips=item.get("clips") or {}
        x=clips.get("X") or {}
        y=clips.get("Y") or {}
        if pair_number<1 or pair_number>EXPECTED_PAIRS:
            bad.append({"pairNumber":pair_number,"error":"PAIR_NUMBER_INVALID"})
            continue

        validated={}
        for label,meta in (("X",x),("Y",y)):
            p=pathlib.Path(str(meta.get("path") or ""))
            expected=str(meta.get("sha256") or "")
            if not p.is_file():
                bad.append({"pairNumber":pair_number,"clip":label,"error":"FILE_MISSING","path":str(p)})
                continue
            actual=sha256(p)
            if actual!=expected:
                bad.append({"pairNumber":pair_number,"clip":label,"error":"SHA_MISMATCH","path":str(p)})
                continue
            validated[label]={
                "path":str(p),
                "sha256":actual,
                "bytes":p.stat().st_size,
            }
            total_clips+=1

        rows.append({
            "pairNumber":pair_number,
            "pairId":item.get("pairId"),
            "caseId":item.get("caseId"),
            "genre":item.get("genre"),
            "bpm":item.get("bpm"),
            "key":item.get("key"),
            "seed":item.get("seed"),
            "X":validated.get("X"),
            "Y":validated.get("Y"),
            "review":{
                "preference":None,
                "naturalInstruments":None,
                "drumsNatural":None,
                "phraseContinuity":None,
                "aBConsistency":None,
                "notes":"",
            },
        })

    if bad:
        raise SystemExit("BLIND_REVIEW_PRECHECK_FAILED="+json.dumps(bad,separators=(",",":")))

    if total_clips!=EXPECTED_CLIPS:
        raise SystemExit(f"BLIND_CLIP_COUNT_INVALID={total_clips}/{EXPECTED_CLIPS}")

    template={
        "version":"sonara-physical-realism-v3-blind-review-v1",
        "instructions":{
            "preference":"For each pair choose X, Y, or TIE without opening unblind_map_isolated.json.",
            "naturalInstruments":"Rate 1-5: realism of physical instruments.",
            "drumsNatural":"Rate 1-5: natural drum/percussion behavior; 1 means machine-like/repetitive, 5 means natural.",
            "phraseContinuity":"Rate 1-5: musical phrase continuity and development.",
            "aBConsistency":"Rate 1-5: consistency of instrumentation and musical behavior.",
            "notes":"Optional short notes; specifically note any repetitive tu-tu-tu percussion."
        },
        "pairs":rows,
        "reviewComplete":False,
        "unblinded":False,
    }
    TEMPLATE.write_text(json.dumps(template,indent=2)+"\n",encoding="utf-8")

    summary={
        "pairs":len(rows),
        "clips":total_clips,
        "allShaVerified":True,
        "reviewTemplate":str(TEMPLATE),
        "blindManifest":str(MANIFEST),
        "unblindMap":str(UNBLIND),
        "unblindMapMustRemainClosedUntilReviewComplete":True,
    }
    SUMMARY.write_text(json.dumps(summary,indent=2)+"\n",encoding="utf-8")

    print("BLIND_REVIEW_PRECHECK_OK=True",flush=True)
    print("BLIND_PAIRS=12",flush=True)
    print("BLIND_CLIPS=24",flush=True)
    print("ALL_SHA256_VERIFIED=True",flush=True)
    print("UNBLIND_MAP_MUST_REMAIN_CLOSED=True",flush=True)
    print("REVIEW_TEMPLATE="+str(TEMPLATE),flush=True)
    print("BLIND_AUDIO_DIR="+str(ROOT/"blind"),flush=True)
    print("NEXT_ACTION=LISTEN_AND_SCORE_X_Y",flush=True)
    print("NO_PRODUCTION_CHANGE=True",flush=True)
    print("NO_AUDIO_GENERATED=True",flush=True)

if __name__=="__main__":
    main()
