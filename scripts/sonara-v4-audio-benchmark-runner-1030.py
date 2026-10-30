#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import pathlib
import urllib.request

ROOT=pathlib.Path("/marimo")
ACE=ROOT/"SONARA-ACE-Step-CLEAN"
PLAN=ROOT/"SONARA-PHYSICAL-REALISM-V4-BENCHMARK.json"
BENCH_ROOT=ROOT/"SONARA-V4-AUDIO-BENCHMARK"
RAW="https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/sonara-v3-audio-benchmark-runner-1029.py"

BASELINE_NAME="sonara_physical_realism_v3_fixed_dev"
CANDIDATE_NAME="sonara_physical_realism_v4_fixed_dev"
BASELINE_PATH=str(ACE/"sonara_training"/"physical_realism_v3_fixed"/"output"/"final")
CANDIDATE_PATH=str(ACE/"sonara_training"/"physical_realism_v4_fixed"/"output"/"final")
BASELINE_SCALE=0.55
CANDIDATE_SCALE=0.45

CASES=[
  {"id":"PRV4_01_jazz_fusion","genre":"Jazz Fusion","bpm":170,"key":"E minor",
   "prompt":"Jazz Fusion, 170 BPM, E minor, live acoustic drums, electric bass, Rhodes piano, tenor saxophone and electric guitar; deep human pocket, ghost notes, expressive phrase interaction, realistic drum articulation, natural piano dynamics, no repetitive machine-like percussion."},
  {"id":"PRV4_02_funk","genre":"Funk","bpm":112,"key":"E minor",
   "prompt":"Funk, 112 BPM, E minor, live drums, slap bass, clavinet, brass accents and clean guitar; human pocket, changing ghost notes, dynamic accents, realistic kit resonance, expressive comping and no static repeated drum pattern."},
  {"id":"PRV4_03_soul_keys","genre":"Soul","bpm":92,"key":"A minor",
   "prompt":"Soul, 92 BPM, A minor, acoustic drums, electric bass, Rhodes and piano, clean guitar and brass; expressive human timing, pedal and key-release realism, breathing room, dynamic phrases and natural ensemble interaction."},
  {"id":"PRV4_04_alt_rock","genre":"Alternative Rock","bpm":132,"key":"D major",
   "prompt":"Alternative Rock, 132 BPM, D major, live drum kit, bass guitar and two electric guitars; realistic drummer dynamics, natural fills, non-identical cymbal transients, guitar articulation, bass interaction and evolving band performance."},
  {"id":"PRV4_05_modern_jazz","genre":"Modern Jazz","bpm":138,"key":"C minor",
   "prompt":"Modern Jazz, 138 BPM, C minor, acoustic drum kit, upright bass, piano and tenor saxophone; natural swing, drummer interaction, piano velocity and pedal nuance, breath-shaped sax phrasing and realistic ensemble interplay."},
  {"id":"PRV4_06_chamber","genre":"Chamber Classical","bpm":84,"key":"G minor",
   "prompt":"Chamber ensemble, 84 BPM, G minor, piano, violin, viola, cello, double bass, clarinet and French horn; natural bow changes, piano dynamics and releases, breath phrasing, realistic legato, dynamic articulation and acoustic room resonance."}
]

def download_runner():
    target=ROOT/"sonara_v4_benchmark_base.py"
    req=urllib.request.Request(RAW,headers={"User-Agent":"SONARA-V4-Benchmark/1.0","Cache-Control":"no-cache"})
    with urllib.request.urlopen(req,timeout=120) as response:
        target.write_bytes(response.read())
    return target

def load_module(path):
    spec=importlib.util.spec_from_file_location("sonara_v4_bench_base",path)
    module=importlib.util.module_from_spec(spec)
    assert spec and spec.loader
    spec.loader.exec_module(module)
    return module

def ensure_loaded(module):
    status=module.lora_status()
    if bool(status.get("lora_loaded")):
        module.call("POST","/v1/lora/toggle",{"use_lora":False},60)
        module.call("POST","/v1/lora/unload",{},180)
    for name,path,scale in [
        (BASELINE_NAME,BASELINE_PATH,BASELINE_SCALE),
        (CANDIDATE_NAME,CANDIDATE_PATH,CANDIDATE_SCALE),
    ]:
        module.call("POST","/v1/lora/load",{"lora_path":path,"adapter_name":name},180)
        module.call("POST","/v1/lora/scale",{"adapter_name":name,"scale":scale},60)
        module.call("POST","/v1/lora/toggle",{"use_lora":False},60)
    status=module.lora_status()
    adapters=set(status.get("adapters") or [])
    if BASELINE_NAME not in adapters or CANDIDATE_NAME not in adapters:
        raise SystemExit("V3_V4_BENCHMARK_ADAPTER_LOAD_FAILED")
    if bool(status.get("use_lora")):
        raise SystemExit("V3_V4_BENCHMARK_LORA_MUST_START_OFF")

def main():
    if not pathlib.Path(BASELINE_PATH,"adapter_model.safetensors").is_file():
        raise SystemExit("V3_BASELINE_ADAPTER_MISSING")
    if not pathlib.Path(CANDIDATE_PATH,"adapter_model.safetensors").is_file():
        raise SystemExit("V4_CANDIDATE_ADAPTER_MISSING")

    plan={
      "version":"sonara-physical-realism-v4-benchmark-v1",
      "purpose":"Controlled V3 Fixed vs V4 Fixed benchmark focused on drums, piano/keys, phrase continuity, natural instruments and A/B consistency.",
      "model":"acestep-v15-xl-turbo",
      "lm":"acestep-5Hz-lm-4B",
      "comparison":{
        "baseline":{"adapter_name":BASELINE_NAME,"scale":BASELINE_SCALE},
        "candidate":{"adapter_name":CANDIDATE_NAME,"scale":CANDIDATE_SCALE},
      },
      "generation":{"duration_seconds":30,"sample_rate_hz":48000,"channels":2,"seeds":[42,1337],"candidates_per_case_per_adapter":1},
      "cases":CASES,
      "automatic_production_promotion":False,
    }
    PLAN.write_text(json.dumps(plan,indent=2)+"\n",encoding="utf-8")

    module=load_module(download_runner())
    module.PLAN=PLAN
    module.ROOT=BENCH_ROOT
    module.RAW=BENCH_ROOT/"raw"
    module.BLIND=BENCH_ROOT/"blind"
    module.REPORT=BENCH_ROOT/"benchmark_report.json"
    module.UNBLIND=BENCH_ROOT/"unblind_map.json"
    module.BLIND_MANIFEST=BENCH_ROOT/"blind_manifest.json"

    # Reuse the proven benchmark implementation; its internal v2/v3 labels are
    # mapped here to V3 baseline / V4 candidate.
    module.V2_NAME=BASELINE_NAME
    module.V3_NAME=CANDIDATE_NAME
    module.V2_PATH=BASELINE_PATH
    module.V3_PATH=CANDIDATE_PATH
    module.V2_SCALE=BASELINE_SCALE
    module.V3_SCALE=CANDIDATE_SCALE

    ensure_loaded(module)
    print("BENCHMARK_BASELINE=V3_FIXED",flush=True)
    print("BENCHMARK_CANDIDATE=V4_FIXED",flush=True)
    print("V4_PRODUCTION_ACTIVE=False",flush=True)
    module.main()

    report=json.loads(module.REPORT.read_text(encoding="utf-8"))
    objective=bool(report.get("objectiveGatePassed"))
    summary={
      "version":"sonara-v3-v4-benchmark-summary-v1",
      "baseline":"V3_FIXED",
      "candidate":"V4_FIXED",
      "baselineAggregate":(report.get("aggregate") or {}).get("v2"),
      "candidateAggregate":(report.get("aggregate") or {}).get("v3"),
      "candidateObjectiveWins":(report.get("objectiveWins") or {}).get("v3"),
      "baselineObjectiveWins":(report.get("objectiveWins") or {}).get("v2"),
      "objectiveGatePassed":objective,
      "humanBlindReviewRequired":True,
      "productionPromotionAllowed":False,
      "nextAction":"HUMAN_BLIND_REVIEW" if objective else "KEEP_V3_AND_REWORK_V4",
    }
    (BENCH_ROOT/"v3_v4_summary.json").write_text(json.dumps(summary,indent=2)+"\n",encoding="utf-8")
    print("V3_V4_OBJECTIVE_GATE_PASSED="+str(objective),flush=True)
    print("HUMAN_BLIND_REVIEW_REQUIRED=True",flush=True)
    print("V4_PRODUCTION_ACTIVE=False",flush=True)
    print("SUMMARY_JSON="+str(BENCH_ROOT/"v3_v4_summary.json"),flush=True)

if __name__=="__main__":
    main()
