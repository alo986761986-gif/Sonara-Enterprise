#!/usr/bin/env python3
from __future__ import annotations

import json
import pathlib
import urllib.error
import urllib.request

API="http://127.0.0.1:8001"
PLAN=pathlib.Path("/marimo/SONARA-PHYSICAL-REALISM-V3-BENCHMARK.json")
EXPECTED_V2="sonara_physical_realism_v2_fixed_dev"
EXPECTED_V3="sonara_physical_realism_v3_fixed_dev"
EXPECTED_V2_SCALE=0.60
EXPECTED_V3_SCALE=0.55

PLAN_DATA="{\"version\":\"sonara-physical-realism-v3-benchmark-v1\",\"purpose\":\"Controlled V2 Fixed vs V3 Fixed development benchmark focused on physical instrument realism, anti-repetitive percussion, phrase continuity, and A/B consistency.\",\"model\":\"acestep-v15-xl-turbo\",\"lm\":\"acestep-5Hz-lm-4B\",\"production_change\":false,\"requires_explicit_audio_generation_approval\":true,\"comparison\":{\"baseline\":{\"adapter_name\":\"sonara_physical_realism_v2_fixed_dev\",\"adapter_sha256\":\"6887ed270c8e4a67c589d6c41da0a57777ffd99470d1e89f196b988545c46bcc\",\"scale\":0.6},\"candidate\":{\"adapter_name\":\"sonara_physical_realism_v3_fixed_dev\",\"adapter_sha256\":\"23a582687d4c45f508e059753c06e8ca905c6e16b09aecfb65f89819d081907e\",\"scale\":0.55}},\"protocol\":{\"identical_prompt\":true,\"identical_seed\":true,\"identical_duration\":true,\"identical_generation_parameters\":true,\"anonymize_for_scoring\":true,\"physical_wav_required\":true,\"sha256_each_output\":true,\"no_claim_of_superiority_without_audio_evidence\":true},\"generation\":{\"duration_seconds\":30,\"sample_rate_hz\":48000,\"channels\":2,\"seeds\":[42,1337],\"candidates_per_case_per_adapter\":1},\"metrics\":[\"natural_instrument_behavior\",\"no_static_tu_tu_tu_percussion\",\"transient_variation\",\"microtiming_variation\",\"phrase_continuity\",\"instrument_family_fidelity\",\"section_development\",\"spectral_balance\",\"no_clipping\",\"low_silence\",\"a_b_consistency\"],\"cases\":[{\"id\":\"PR01_jazz_fusion_live\",\"genre\":\"Jazz Fusion\",\"bpm\":170,\"key\":\"E minor\",\"prompt\":\"Jazz Fusion, 170 BPM, E minor, live acoustic drums, electric bass, Rhodes piano, saxophone and electric guitar; natural human groove, expressive phrasing, realistic drum articulation, no repetitive machine-like percussion.\"},{\"id\":\"PR02_funk_live\",\"genre\":\"Funk\",\"bpm\":112,\"key\":\"E minor\",\"prompt\":\"Funk, 112 BPM, E minor, live drums, slap bass, clavinet, brass accents and clean guitar; human pocket, ghost notes, dynamic accents, natural instrument resonance and no static repeated drum pattern.\"},{\"id\":\"PR03_alt_rock_band\",\"genre\":\"Alternative Rock\",\"bpm\":132,\"key\":\"D major\",\"prompt\":\"Alternative Rock, 132 BPM, D major, live drum kit, bass guitar, two electric guitars; realistic drummer dynamics, natural fills, guitar articulation, bass interaction and evolving band performance.\"},{\"id\":\"PR04_acoustic_soul\",\"genre\":\"Soul\",\"bpm\":92,\"key\":\"A minor\",\"prompt\":\"Soul, 92 BPM, A minor, acoustic drums, electric bass, Rhodes, clean guitar and brass section; expressive human timing, breathing room, dynamic phrases and realistic acoustic articulation.\"},{\"id\":\"PR05_jazz_quartet\",\"genre\":\"Modern Jazz\",\"bpm\":138,\"key\":\"C minor\",\"prompt\":\"Modern Jazz, 138 BPM, C minor, acoustic drum kit, upright bass, piano and tenor saxophone; natural swing, drummer interaction, breath-shaped sax phrasing, piano dynamics and realistic ensemble interplay.\"},{\"id\":\"PR06_orchestral_chamber\",\"genre\":\"Chamber Classical\",\"bpm\":84,\"key\":\"G minor\",\"prompt\":\"Chamber ensemble, 84 BPM, G minor, violin, viola, cello, double bass, clarinet and French horn; natural bow changes, breath phrasing, realistic legato, dynamic articulation and acoustic room resonance.\"}],\"promotion_gate\":{\"minimum_pairs\":12,\"static_percussion_failures_max\":0,\"clipping_failures_max\":0,\"candidate_must_not_regress_natural_instrument_behavior\":true,\"candidate_must_not_regress_phrase_continuity\":true,\"candidate_must_not_regress_a_b_consistency\":true,\"final_status_on_pass\":\"READY_FOR_CONTROLLED_PRODUCTION_CANARY\",\"final_status_on_fail\":\"KEEP_V3_DEVELOPMENT_ONLY\"}}"

def call(method,path,payload=None,timeout=60):
    body=None if payload is None else json.dumps(payload).encode("utf-8")
    req=urllib.request.Request(
        API+path,
        data=body,
        headers={
            "Content-Type":"application/json",
            "User-Agent":"SONARA-V3-Benchmark-Preflight/1.0",
        },
        method=method,
    )
    try:
        with urllib.request.urlopen(req,timeout=timeout) as response:
            raw=response.read()
    except urllib.error.HTTPError as exc:
        detail=exc.read().decode("utf-8","replace")[:2000]
        raise RuntimeError(f"HTTP_{exc.code}:{path}:{detail}") from exc
    data=json.loads(raw.decode("utf-8")) if raw else {}
    if isinstance(data,dict) and data.get("code") not in (None,200):
        raise RuntimeError(f"ACE_API_ERROR:{path}:{data.get('error')}")
    return data.get("data",data) if isinstance(data,dict) else data

def main():
    status=call("GET","/v1/lora/status",None,30)
    adapters=set(status.get("adapters") or [])
    scales=status.get("scales") or {}

    if EXPECTED_V2 not in adapters:
        raise SystemExit("BENCHMARK_PREFLIGHT_V2_NOT_LOADED")
    if EXPECTED_V3 not in adapters:
        raise SystemExit("BENCHMARK_PREFLIGHT_V3_NOT_LOADED")

    v2_scale=float(scales.get(EXPECTED_V2,-1))
    v3_scale=float(scales.get(EXPECTED_V3,-1))
    if abs(v2_scale-EXPECTED_V2_SCALE)>1e-6:
        raise SystemExit(f"BENCHMARK_PREFLIGHT_V2_SCALE_INVALID={v2_scale}")
    if abs(v3_scale-EXPECTED_V3_SCALE)>1e-6:
        raise SystemExit(f"BENCHMARK_PREFLIGHT_V3_SCALE_INVALID={v3_scale}")

    if bool(status.get("use_lora")):
        raise SystemExit("BENCHMARK_PREFLIGHT_LORA_MUST_BE_OFF")
    if str(status.get("active_adapter") or "") != EXPECTED_V3:
        raise SystemExit("BENCHMARK_PREFLIGHT_ACTIVE_ADAPTER_UNEXPECTED")

    plan=json.loads(PLAN_DATA)
    PLAN.write_text(json.dumps(plan,indent=2)+"\n",encoding="utf-8")

    pairs=len(plan["cases"])*len(plan["generation"]["seeds"])
    clips=pairs*2

    print("BENCHMARK_PREFLIGHT_OK=True",flush=True)
    print("V2_LOADED=True",flush=True)
    print("V3_LOADED=True",flush=True)
    print("V2_SCALE="+str(v2_scale),flush=True)
    print("V3_SCALE="+str(v3_scale),flush=True)
    print("LORA_ACTIVE=False",flush=True)
    print("BENCHMARK_CASES="+str(len(plan["cases"])),flush=True)
    print("BENCHMARK_SEEDS="+str(len(plan["generation"]["seeds"])),flush=True)
    print("BENCHMARK_PAIRS="+str(pairs),flush=True)
    print("BENCHMARK_TOTAL_CLIPS="+str(clips),flush=True)
    print("AUDIO_GENERATION_AUTHORIZED=False",flush=True)
    print("NO_AUDIO_GENERATED=True",flush=True)
    print("PLAN_JSON="+str(PLAN),flush=True)
    print("NEXT_ACTION=AWAIT_EXPLICIT_AUDIO_BENCHMARK_APPROVAL",flush=True)

if __name__=="__main__":
    main()
