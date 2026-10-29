#!/usr/bin/env python3
from __future__ import annotations
import json, pathlib
ROOT=pathlib.Path("/marimo/SONARA-LORA-DATASET")
DATASET=ROOT/"dataset.json"

def main():
    if not DATASET.is_file():
        raise SystemExit("DATASET_JSON_MISSING")
    rows=json.loads(DATASET.read_text(encoding="utf-8"))
    changed=0
    for row in rows:
        if str(row.get("dataset_stage") or "")!="phrase-seed-v4-jaz-drm":
            continue
        row["synthetic"]=True
        row["performance_type"]="programmed_loop"
        row["prompt_override"]="Jazz drum-kit groove with varied velocity, ghost-note patterns, cymbal decay, dynamic fills and non-identical repeated hits; algorithmically sequenced from licensed multi-velocity drum samples."
        row["promotion_eligible"]=False
        row["promotion_exclusion_reason"]="Algorithmically generated from MIDI patterns and multisamples; useful for rhythm augmentation but not human phrase-level training."
        changed+=1
    DATASET.write_text(json.dumps(rows,indent=2)+"\n",encoding="utf-8")
    print("JAZ_DRM_ROWS_RECLASSIFIED="+str(changed))
    print("JAZ_DRM_COUNTS_AS_HUMAN_PHRASE=False")
    print("DATASET_ROWS="+str(len(rows)))
    print("RETURN_STATUS=OK")
if __name__=="__main__":
    main()
