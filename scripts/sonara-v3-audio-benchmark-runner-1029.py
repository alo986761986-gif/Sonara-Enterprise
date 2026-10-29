#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import math
import os
import pathlib
import random
import shutil
import struct
import time
import urllib.error
import urllib.parse
import urllib.request
import wave

API="http://127.0.0.1:8001"
PLAN=pathlib.Path("/marimo/SONARA-PHYSICAL-REALISM-V3-BENCHMARK.json")
ROOT=pathlib.Path("/marimo/SONARA-V3-AUDIO-BENCHMARK")
RAW=ROOT/"raw"
BLIND=ROOT/"blind"
REPORT=ROOT/"benchmark_report.json"
UNBLIND=ROOT/"unblind_map.json"
BLIND_MANIFEST=ROOT/"blind_manifest.json"

V2_NAME="sonara_physical_realism_v2_fixed_dev"
V3_NAME="sonara_physical_realism_v3_fixed_dev"
V2_SCALE=0.60
V3_SCALE=0.55
MODEL="acestep-v15-xl-turbo"

def call(method,path,payload=None,timeout=180):
    body=None if payload is None else json.dumps(payload).encode("utf-8")
    req=urllib.request.Request(
        API+path,
        data=body,
        headers={
            "Content-Type":"application/json",
            "Accept":"application/json",
            "User-Agent":"SONARA-V3-Audio-Benchmark/1.0",
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

def get_bytes(path_or_url,timeout=180):
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        url=path_or_url
    elif path_or_url.startswith("/v1/audio"):
        url=API+path_or_url
    else:
        url=API+"/v1/audio?"+urllib.parse.urlencode({"path":path_or_url})
    req=urllib.request.Request(
        url,
        headers={
            "Accept":"audio/wav,application/octet-stream,*/*;q=0.1",
            "User-Agent":"SONARA-V3-Audio-Benchmark/1.0",
        },
    )
    with urllib.request.urlopen(req,timeout=timeout) as response:
        return response.read()

def sha256_bytes(data):
    return hashlib.sha256(data).hexdigest()

def sha256_file(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            b=f.read(1024*1024)
            if not b:
                break
            h.update(b)
    return h.hexdigest()

def normalize_status(value):
    text=str(value).strip().lower()
    if text in {"1","success","completed","succeeded","done","finished"}:
        return 1
    if text in {"0","queued","pending","running","processing","in_progress"}:
        return 0
    return -1

def parse_result(task):
    result=task.get("result") or []
    if isinstance(result,str):
        result=json.loads(result)
    if isinstance(result,dict):
        result=[result]
    if not isinstance(result,list) or not result:
        raise RuntimeError("EMPTY_GENERATION_RESULT")
    return result

def wait_task(task_id,timeout=900):
    deadline=time.monotonic()+timeout
    last_status=None
    while time.monotonic()<deadline:
        rows=call("POST","/query_result",{"task_id_list":[task_id]},60)
        task=rows[0] if isinstance(rows,list) and rows else rows if isinstance(rows,dict) else {}
        if task:
            status=normalize_status(task.get("status"))
            if status!=last_status:
                print(f"TASK_STATUS={task_id}:{status}",flush=True)
                last_status=status
            if status==1:
                return parse_result(task)
            if status<0:
                raise RuntimeError("GENERATION_TASK_FAILED")
        time.sleep(1)
    raise TimeoutError("GENERATION_TASK_TIMEOUT")

def lora_status():
    return call("GET","/v1/lora/status",None,30)

def activate_adapter(name,scale):
    status=lora_status()
    adapters=set(status.get("adapters") or [])
    if name not in adapters:
        raise RuntimeError("LORA_ADAPTER_NOT_LOADED="+name)

    # Explicitly select the adapter through the SONARA hotfix endpoint.
    call("POST","/v1/lora/active",{"adapter_name":name},60)
    call("POST","/v1/lora/scale",{"adapter_name":name,"scale":scale},60)

    status=lora_status()
    if str(status.get("active_adapter") or "")!=name:
        raise RuntimeError(
            "LORA_SWITCH_FAILED="+str(status.get("active_adapter"))+" expected="+name
        )

    if not bool(status.get("use_lora")):
        call("POST","/v1/lora/toggle",{"use_lora":True},60)
        status=lora_status()

    if not bool(status.get("use_lora")):
        raise RuntimeError("LORA_ENABLE_FAILED")
    if str(status.get("active_adapter") or "")!=name:
        raise RuntimeError(
            "LORA_ACTIVE_AFTER_ENABLE_FAILED="+str(status.get("active_adapter"))+" expected="+name
        )

    actual=float((status.get("scales") or {}).get(name,-1))
    if abs(actual-scale)>1e-6:
        raise RuntimeError(f"LORA_SCALE_MISMATCH={name}:{actual}/{scale}")
    print(f"ACTIVE_ADAPTER={name} SCALE={actual}",flush=True)

def disable_lora():
    try:
        call("POST","/v1/lora/toggle",{"use_lora":False},60)
        status=lora_status()
        print("LORA_ACTIVE_AFTER_BENCHMARK="+str(bool(status.get("use_lora"))),flush=True)
    except Exception as exc:
        print("LORA_DISABLE_WARNING="+type(exc).__name__,flush=True)

def generate(case,seed,adapter_name,scale,out_path):
    activate_adapter(adapter_name,scale)

    payload={
        "prompt":case["prompt"],
        "lyrics":"[Instrumental]",
        "thinking":False,
        "use_cot_caption":False,
        "use_cot_language":False,
        "sample_mode":False,
        "use_format":False,
        "model":MODEL,
        "task_type":"text2music",
        "audio_format":"wav",
        "audio_duration":30,
        "bpm":int(case["bpm"]),
        "key_scale":str(case["key"]),
        "time_signature":"4",
        "inference_steps":8,
        "infer_method":"ode",
        "use_random_seed":False,
        "seed":int(seed),
        "batch_size":1,
    }
    released=call("POST","/release_task",payload,120)
    task_id=str(released.get("task_id") or "")
    if not task_id:
        raise RuntimeError("TASK_ID_MISSING")

    print(
        f"GENERATION_STARTED={case['id']} SEED={seed} ADAPTER={adapter_name} TASK={task_id}",
        flush=True,
    )
    result=wait_task(task_id,900)
    item=result[0]
    file_ref=str(
        item.get("file")
        or item.get("url")
        or item.get("audio_path")
        or item.get("path")
        or ""
    )
    if not file_ref:
        raise RuntimeError("AUDIO_REFERENCE_MISSING")

    data=get_bytes(file_ref,180)
    if len(data)<44 or data[:4]!=b"RIFF" or data[8:12]!=b"WAVE":
        raise RuntimeError("INVALID_WAV_RESPONSE")
    out_path.parent.mkdir(parents=True,exist_ok=True)
    out_path.write_bytes(data)

    returned_seed=str(item.get("seed_value") or item.get("seed") or "")
    print(
        f"GENERATION_COMPLETE={case['id']} SEED={seed} ADAPTER={adapter_name} "
        f"BYTES={len(data)} SHA256={sha256_bytes(data)} RETURNED_SEED={returned_seed}",
        flush=True,
    )
    return {
        "taskId":task_id,
        "fileRef":file_ref,
        "returnedSeed":returned_seed,
        "bytes":len(data),
        "sha256":sha256_bytes(data),
        "payload":payload,
    }

def pcm_sample(chunk,width):
    if width==1:
        return chunk[0]-128,127.0
    if width==2:
        return struct.unpack("<h",chunk)[0],32767.0
    if width==3:
        value=int.from_bytes(chunk,"little",signed=False)
        if value & 0x800000:
            value-=1<<24
        return value,8388607.0
    if width==4:
        return struct.unpack("<i",chunk)[0],2147483647.0
    raise ValueError("Unsupported PCM width")

def wav_quality_report(path):
    try:
        with wave.open(str(path),"rb") as wav:
            channels=wav.getnchannels()
            width=wav.getsampwidth()
            rate=wav.getframerate()
            frames=wav.getnframes()
            raw=wav.readframes(frames)

        if width not in (1,2,3,4) or channels<1 or rate<=0 or not raw:
            raise ValueError("Unsupported WAV")

        frame_size=width*channels
        available_frames=len(raw)//frame_size
        if available_frames<=0:
            raise ValueError("Empty WAV")

        stride=max(1,available_frames//200000)
        peak_ratio=0.0
        square_sum=0.0
        clipped=0
        silent=0
        dc_sum=0.0
        seen=0
        envelope=[]
        envelope_acc=0.0
        envelope_count=0
        envelope_bucket=32

        for frame_index in range(0,available_frames,stride):
            frame_start=frame_index*frame_size
            mono_ratio=0.0
            valid_channels=0
            for channel in range(channels):
                start=frame_start+channel*width
                chunk=raw[start:start+width]
                if len(chunk)!=width:
                    continue
                value,scale=pcm_sample(chunk,width)
                mono_ratio+=value/scale if scale else 0.0
                valid_channels+=1
            if valid_channels<=0:
                continue

            mono_ratio/=valid_channels
            absolute=abs(mono_ratio)
            peak_ratio=max(peak_ratio,absolute)
            square_sum+=mono_ratio*mono_ratio
            dc_sum+=mono_ratio
            seen+=1
            envelope_acc+=absolute
            envelope_count+=1

            if envelope_count>=envelope_bucket:
                envelope.append(envelope_acc/envelope_count)
                envelope_acc=0.0
                envelope_count=0

            if absolute>=0.999:
                clipped+=1
            if absolute<=0.001:
                silent+=1

        if seen<=0:
            raise ValueError("No analyzable PCM samples")

        rms_ratio=math.sqrt(square_sum/seen)
        peak_db=20.0*math.log10(max(peak_ratio,1e-9))
        rms_db=20.0*math.log10(max(rms_ratio,1e-9))
        clipping=clipped/seen
        silence=silent/seen
        dc=dc_sum/seen
        duration=frames/float(rate)

        transient_variation=None
        repeated_transient_ratio=None
        if envelope_count:
            envelope.append(envelope_acc/envelope_count)
        if len(envelope)>=8:
            local_peaks=[
                envelope[i]
                for i in range(1,len(envelope)-1)
                if envelope[i]>=0.02
                and envelope[i]>=envelope[i-1]
                and envelope[i]>=envelope[i+1]
            ]
            if len(local_peaks)>=4:
                mean_peak=sum(local_peaks)/len(local_peaks)
                variance=sum((value-mean_peak)**2 for value in local_peaks)/len(local_peaks)
                transient_variation=math.sqrt(variance)/max(mean_peak,1e-9)
                rounded=[round(value,3) for value in local_peaks]
                counts={}
                for value in rounded:
                    counts[value]=counts.get(value,0)+1
                repeated_transient_ratio=max(counts.values())/len(rounded)

        score=100.0
        score-=min(35.0,clipping*50000.0)
        score-=min(30.0,max(0.0,silence-0.08)*150.0)
        score-=min(20.0,abs(dc)*500.0)
        if peak_db>-0.2:
            score-=8.0
        if rms_db>-5.0 or rms_db<-28.0:
            score-=10.0
        if transient_variation is not None and transient_variation<0.08:
            score-=min(18.0,(0.08-transient_variation)*225.0)
        if repeated_transient_ratio is not None and repeated_transient_ratio>0.35:
            score-=min(22.0,(repeated_transient_ratio-0.35)*44.0)

        return {
            "ok":True,
            "durationSeconds":round(duration,3),
            "sampleRate":rate,
            "channels":channels,
            "bitDepth":width*8,
            "peakDb":round(peak_db,2),
            "rmsDb":round(rms_db,2),
            "clippingRatio":round(clipping,6),
            "silenceRatio":round(silence,4),
            "dcOffset":round(dc,6),
            "transientVariation":round(transient_variation,4) if transient_variation is not None else None,
            "repeatedTransientRatio":round(repeated_transient_ratio,4) if repeated_transient_ratio is not None else None,
            "staticPercussionFlag":bool(
                (transient_variation is not None and transient_variation<0.08)
                or (repeated_transient_ratio is not None and repeated_transient_ratio>0.35)
            ),
            "score":round(max(0.0,min(100.0,score)),1),
        }
    except Exception as exc:
        return {"ok":False,"score":0.0,"error":type(exc).__name__}

def mean(values):
    vals=[float(v) for v in values if v is not None]
    return round(sum(vals)/len(vals),4) if vals else None

def aggregate(clips):
    return {
        "clips":len(clips),
        "meanScore":mean([x["metrics"].get("score") for x in clips]),
        "meanTransientVariation":mean([x["metrics"].get("transientVariation") for x in clips]),
        "meanRepeatedTransientRatio":mean([x["metrics"].get("repeatedTransientRatio") for x in clips]),
        "clippingFailures":sum(1 for x in clips if (x["metrics"].get("clippingRatio") or 0)>0.00001),
        "silenceFailures":sum(1 for x in clips if (x["metrics"].get("silenceRatio") or 0)>0.10),
        "staticPercussionFlags":sum(1 for x in clips if x["metrics"].get("staticPercussionFlag") is True),
    }

def hardlink_or_copy(src,dest):
    dest.parent.mkdir(parents=True,exist_ok=True)
    dest.unlink(missing_ok=True)
    try:
        os.link(src,dest)
    except Exception:
        shutil.copy2(src,dest)

def main():
    if not PLAN.is_file():
        raise SystemExit("BENCHMARK_PLAN_MISSING")
    plan=json.loads(PLAN.read_text(encoding="utf-8"))
    cases=plan.get("cases") or []
    seeds=(plan.get("generation") or {}).get("seeds") or []
    if len(cases)!=6 or len(seeds)!=2:
        raise SystemExit("BENCHMARK_PLAN_SHAPE_INVALID")

    ROOT.mkdir(parents=True,exist_ok=True)
    RAW.mkdir(parents=True,exist_ok=True)
    BLIND.mkdir(parents=True,exist_ok=True)

    initial=lora_status()
    adapters=set(initial.get("adapters") or [])
    if V2_NAME not in adapters or V3_NAME not in adapters:
        raise SystemExit("BENCHMARK_ADAPTERS_NOT_LOADED")
    if bool(initial.get("use_lora")):
        raise SystemExit("BENCHMARK_REQUIRES_LORA_OFF_AT_START")

    probe_name=str(initial.get("active_adapter") or V3_NAME)
    try:
        call("POST","/v1/lora/active",{"adapter_name":probe_name},30)
    except Exception as exc:
        raise SystemExit("BENCHMARK_ACTIVE_ENDPOINT_NOT_READY") from exc
    probe_status=lora_status()
    if str(probe_status.get("active_adapter") or "")!=probe_name:
        raise SystemExit("BENCHMARK_ACTIVE_ENDPOINT_VERIFY_FAILED")
    print("LORA_ACTIVE_ENDPOINT_READY=True",flush=True)

    clips=[]
    pairs=[]
    unblind={}
    blind_manifest=[]
    pair_index=0

    print("AUDIO_BENCHMARK_AUTHORIZED=True",flush=True)
    print("BENCHMARK_CASES="+str(len(cases)),flush=True)
    print("BENCHMARK_SEEDS="+str(len(seeds)),flush=True)
    print("EXPECTED_AUDIO_CLIPS="+str(len(cases)*len(seeds)*2),flush=True)

    try:
        for case_index,case in enumerate(cases):
            for seed_index,seed in enumerate(seeds):
                pair_index+=1
                pair_id=f"P{pair_index:02d}_{case['id']}_s{seed}"

                # Alternate order to reduce systematic thermal/order bias.
                if pair_index%2:
                    order=[
                        ("v2",V2_NAME,V2_SCALE),
                        ("v3",V3_NAME,V3_SCALE),
                    ]
                else:
                    order=[
                        ("v3",V3_NAME,V3_SCALE),
                        ("v2",V2_NAME,V2_SCALE),
                    ]

                pair_clips={}
                for label,name,scale in order:
                    out=RAW/f"{pair_id}_{label}.wav"

                    # Resume-safe: a prior completed WAV can be reused.
                    if out.is_file() and out.stat().st_size>44:
                        try:
                            with wave.open(str(out),"rb") as wav:
                                valid=wav.getnframes()>0
                        except Exception:
                            valid=False
                        if valid:
                            generation={
                                "taskId":"RESUMED",
                                "fileRef":"",
                                "returnedSeed":"",
                                "bytes":out.stat().st_size,
                                "sha256":sha256_file(out),
                                "payload":None,
                            }
                            print(f"BENCHMARK_RESUME_HIT={out.name}",flush=True)
                        else:
                            out.unlink(missing_ok=True)
                            generation=generate(case,seed,name,scale,out)
                    else:
                        generation=generate(case,seed,name,scale,out)

                    metrics=wav_quality_report(out)
                    if not metrics.get("ok"):
                        raise RuntimeError("WAV_QUALITY_ANALYSIS_FAILED="+out.name)

                    record={
                        "pairId":pair_id,
                        "caseId":case["id"],
                        "genre":case["genre"],
                        "bpm":case["bpm"],
                        "key":case["key"],
                        "seed":int(seed),
                        "adapterLabel":label,
                        "adapterName":name,
                        "adapterScale":scale,
                        "rawPath":str(out),
                        "sha256":sha256_file(out),
                        "generation":generation,
                        "metrics":metrics,
                    }
                    clips.append(record)
                    pair_clips[label]=record

                    print(
                        f"BENCHMARK_CLIP={pair_id}:{label} SCORE={metrics['score']} "
                        f"TRANSIENT_VARIATION={metrics.get('transientVariation')} "
                        f"REPEATED_TRANSIENT_RATIO={metrics.get('repeatedTransientRatio')} "
                        f"STATIC_PERCUSSION={metrics.get('staticPercussionFlag')}",
                        flush=True,
                    )

                # Deterministic blind X/Y assignment, independent of adapter order.
                blind_rng=random.Random(int(hashlib.sha256(pair_id.encode()).hexdigest()[:16],16))
                v3_is_x=bool(blind_rng.getrandbits(1))
                mapping={"X":"v3","Y":"v2"} if v3_is_x else {"X":"v2","Y":"v3"}

                blind_entry={
                    "pairId":pair_id,
                    "caseId":case["id"],
                    "genre":case["genre"],
                    "bpm":case["bpm"],
                    "key":case["key"],
                    "seed":int(seed),
                    "clips":{},
                }

                for blind_label,source_label in mapping.items():
                    source=pathlib.Path(pair_clips[source_label]["rawPath"])
                    dest=BLIND/f"{pair_id}_{blind_label}.wav"
                    hardlink_or_copy(source,dest)
                    blind_entry["clips"][blind_label]={
                        "path":str(dest),
                        "sha256":sha256_file(dest),
                    }

                blind_manifest.append(blind_entry)
                unblind[pair_id]=mapping

                v2_score=float(pair_clips["v2"]["metrics"]["score"])
                v3_score=float(pair_clips["v3"]["metrics"]["score"])
                objective_winner="v3" if v3_score>v2_score else "v2" if v2_score>v3_score else "tie"

                pairs.append({
                    "pairId":pair_id,
                    "caseId":case["id"],
                    "seed":int(seed),
                    "objectiveWinner":objective_winner,
                    "v2Score":v2_score,
                    "v3Score":v3_score,
                    "v3Delta":round(v3_score-v2_score,2),
                    "blind":blind_entry,
                })

                print(
                    f"PAIR_COMPLETE={pair_index}/12 {pair_id} OBJECTIVE_WINNER={objective_winner} "
                    f"V2={v2_score} V3={v3_score}",
                    flush=True,
                )
    finally:
        disable_lora()

    v2=[x for x in clips if x["adapterLabel"]=="v2"]
    v3=[x for x in clips if x["adapterLabel"]=="v3"]
    agg_v2=aggregate(v2)
    agg_v3=aggregate(v3)

    v3_wins=sum(1 for p in pairs if p["objectiveWinner"]=="v3")
    v2_wins=sum(1 for p in pairs if p["objectiveWinner"]=="v2")
    ties=sum(1 for p in pairs if p["objectiveWinner"]=="tie")

    objective_gate={
        "all24ClipsPresent":len(clips)==24,
        "v3ClippingFailuresZero":agg_v3["clippingFailures"]==0,
        "v3StaticPercussionFlagsZero":agg_v3["staticPercussionFlags"]==0,
        "v3MeanScoreNotBelowV2":(
            agg_v3["meanScore"] is not None and agg_v2["meanScore"] is not None
            and agg_v3["meanScore"]>=agg_v2["meanScore"]
        ),
    }

    report={
        "version":"sonara-physical-realism-v3-audio-benchmark-v1",
        "model":MODEL,
        "lmUsed":False,
        "comparisonIsolatedToLoRA":True,
        "clips":clips,
        "pairs":pairs,
        "aggregate":{"v2":agg_v2,"v3":agg_v3},
        "objectiveWins":{"v3":v3_wins,"v2":v2_wins,"ties":ties},
        "objectiveGate":objective_gate,
        "objectiveGatePassed":all(objective_gate.values()),
        "humanBlindReviewRequired":True,
        "automaticProductionPromotion":False,
        "nextAction":"RUN_BLIND_LISTENING_REVIEW",
    }

    REPORT.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    UNBLIND.write_text(json.dumps(unblind,indent=2)+"\n",encoding="utf-8")
    BLIND_MANIFEST.write_text(json.dumps(blind_manifest,indent=2)+"\n",encoding="utf-8")

    print("=== SONARA V3 AUDIO BENCHMARK COMPLETE ===",flush=True)
    print("GENERATED_CLIPS="+str(len(clips))+"/24",flush=True)
    print("V2_AGGREGATE="+json.dumps(agg_v2,separators=(",",":")),flush=True)
    print("V3_AGGREGATE="+json.dumps(agg_v3,separators=(",",":")),flush=True)
    print("OBJECTIVE_WINS="+json.dumps({"v3":v3_wins,"v2":v2_wins,"ties":ties},separators=(",",":")),flush=True)
    print("OBJECTIVE_GATE="+json.dumps(objective_gate,separators=(",",":")),flush=True)
    print("OBJECTIVE_GATE_PASSED="+str(all(objective_gate.values())),flush=True)
    print("HUMAN_BLIND_REVIEW_REQUIRED=True",flush=True)
    print("AUTOMATIC_PRODUCTION_PROMOTION=False",flush=True)
    print("LORA_ACTIVE=False",flush=True)
    print("BLIND_AUDIO_DIR="+str(BLIND),flush=True)
    print("BLIND_MANIFEST="+str(BLIND_MANIFEST),flush=True)
    print("REPORT_JSON="+str(REPORT),flush=True)
    print("NEXT_ACTION=RUN_BLIND_LISTENING_REVIEW",flush=True)

if __name__=="__main__":
    main()
