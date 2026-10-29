#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import importlib.util
import json
import math
import os
import pathlib
import random
import shutil
import struct
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import wave

API="http://127.0.0.1:8001"
ROOT=pathlib.Path("/marimo/SONARA-V3-AUDIO-BENCHMARK")
RAW=ROOT/"raw"
BLIND=ROOT/"blind"
REPORT=ROOT/"benchmark_report.json"
UNBLIND=ROOT/"unblind_map.json"
BLIND_MANIFEST=ROOT/"blind_manifest.json"
PLAN=pathlib.Path("/marimo/SONARA-PHYSICAL-REALISM-V3-BENCHMARK.json")

ACE=pathlib.Path("/marimo/SONARA-ACE-Step-CLEAN")
V2_PATH=ACE/"sonara_training"/"physical_realism_v2_fixed"/"output"/"final"
V3_PATH=ACE/"sonara_training"/"physical_realism_v3_fixed"/"output"/"final"

V2_NAME="sonara_physical_realism_v2_fixed_dev"
V3_NAME="sonara_physical_realism_v3_fixed_dev"
V2_SCALE=0.60
V3_SCALE=0.55
MODEL="acestep-v15-xl-turbo"

V2_RUNTIME_URL=(
    "https://raw.githubusercontent.com/"
    "alo986761986-gif/Sonara-Enterprise/"
    "18cc947b9639da54e6011ba4e80b1c544b994db5/"
    "scripts/ace-step-real-music-v2-speed-quality-upgrade-0902.py"
)

def request_json(method,path,payload=None,timeout=180):
    body=None if payload is None else json.dumps(payload).encode("utf-8")
    req=urllib.request.Request(
        API+path,
        data=body,
        headers={
            "Content-Type":"application/json",
            "Accept":"application/json",
            "User-Agent":"SONARA-V3-Clean-Benchmark/1.0",
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
            "User-Agent":"SONARA-V3-Clean-Benchmark/1.0",
        },
    )
    with urllib.request.urlopen(req,timeout=timeout) as response:
        return response.read()

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

def load_v2_runtime_module():
    target=pathlib.Path("/tmp/sonara-v2-runtime-clean-benchmark.py")
    req=urllib.request.Request(
        V2_RUNTIME_URL,
        headers={
            "User-Agent":"SONARA-V3-Clean-Benchmark/1.0",
            "Cache-Control":"no-cache",
        },
    )
    with urllib.request.urlopen(req,timeout=60) as response:
        target.write_bytes(response.read())
    spec=importlib.util.spec_from_file_location("sonara_v2_runtime_clean_benchmark",target)
    if spec is None or spec.loader is None:
        raise RuntimeError("V2_RUNTIME_MODULE_LOAD_FAILED")
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

RUNTIME=None
API_PROC=None

def clean_restart_api():
    global RUNTIME,API_PROC
    if RUNTIME is None:
        RUNTIME=load_v2_runtime_module()
    proc,backend,compile_model,health=RUNTIME.start_best_api()
    API_PROC=proc

    status=request_json("GET","/v1/lora/status",None,30)
    print(
        "CLEAN_API_RESTART="
        +json.dumps({
            "pid":proc.pid,
            "backend":backend,
            "compile":bool(compile_model),
            "lora_loaded":bool(status.get("lora_loaded")),
            "use_lora":bool(status.get("use_lora")),
            "adapters":status.get("adapters") or [],
        },separators=(",",":")),
        flush=True,
    )

    # A freshly restarted base process must not carry prior development adapters.
    if bool(status.get("lora_loaded")):
        raise RuntimeError("FRESH_API_STILL_HAS_LORA_LOADED")
    if status.get("adapters"):
        raise RuntimeError("FRESH_API_STILL_HAS_ADAPTER_REGISTRY")
    return proc

def load_single_adapter(name,path,scale):
    status=request_json("GET","/v1/lora/status",None,30)
    if bool(status.get("lora_loaded")) or (status.get("adapters") or []):
        raise RuntimeError("SINGLE_ADAPTER_LOAD_REQUIRES_CLEAN_API")

    request_json("POST","/v1/lora/load",{
        "lora_path":str(path),
        "adapter_name":name,
    },180)
    request_json("POST","/v1/lora/scale",{
        "adapter_name":name,
        "scale":scale,
    },60)

    status=request_json("GET","/v1/lora/status",None,30)
    adapters=set(status.get("adapters") or [])
    if name not in adapters:
        raise RuntimeError("SINGLE_ADAPTER_NOT_LOADED="+name)
    if str(status.get("active_adapter") or "")!=name:
        raise RuntimeError("SINGLE_ADAPTER_NOT_ACTIVE="+str(status.get("active_adapter")))
    if not bool(status.get("use_lora")):
        request_json("POST","/v1/lora/toggle",{"use_lora":True},60)
        status=request_json("GET","/v1/lora/status",None,30)
    if not bool(status.get("use_lora")):
        raise RuntimeError("SINGLE_ADAPTER_ENABLE_FAILED")
    actual=float((status.get("scales") or {}).get(name,-1))
    if abs(actual-scale)>1e-6:
        raise RuntimeError(f"SINGLE_ADAPTER_SCALE_MISMATCH={actual}/{scale}")

    print(f"PHASE_ADAPTER_READY={name} SCALE={actual}",flush=True)

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
        rows=request_json("POST","/query_result",{"task_id_list":[task_id]},60)
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

def generate(case,seed,label,name,scale,out_path):
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
    released=request_json("POST","/release_task",payload,120)
    task_id=str(released.get("task_id") or "")
    if not task_id:
        raise RuntimeError("TASK_ID_MISSING")
    print(
        f"GENERATION_STARTED={case['id']} SEED={seed} ADAPTER={label} TASK={task_id}",
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
    digest=hashlib.sha256(data).hexdigest()
    print(
        f"GENERATION_COMPLETE={case['id']} SEED={seed} ADAPTER={label} "
        f"BYTES={len(data)} SHA256={digest}",
        flush=True,
    )
    return {
        "taskId":task_id,
        "fileRef":file_ref,
        "bytes":len(data),
        "sha256":digest,
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
            mono=0.0
            valid=0
            for channel in range(channels):
                start=frame_start+channel*width
                chunk=raw[start:start+width]
                if len(chunk)!=width:
                    continue
                value,scale=pcm_sample(chunk,width)
                mono+=value/scale if scale else 0.0
                valid+=1
            if valid<=0:
                continue
            mono/=valid
            absolute=abs(mono)
            peak_ratio=max(peak_ratio,absolute)
            square_sum+=mono*mono
            dc_sum+=mono
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
            raise ValueError("No analyzable samples")

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
            peaks=[
                envelope[i]
                for i in range(1,len(envelope)-1)
                if envelope[i]>=0.02
                and envelope[i]>=envelope[i-1]
                and envelope[i]>=envelope[i+1]
            ]
            if len(peaks)>=4:
                mean_peak=sum(peaks)/len(peaks)
                variance=sum((v-mean_peak)**2 for v in peaks)/len(peaks)
                transient_variation=math.sqrt(variance)/max(mean_peak,1e-9)
                rounded=[round(v,3) for v in peaks]
                counts={}
                for v in rounded:
                    counts[v]=counts.get(v,0)+1
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

def ensure_plan():
    if not PLAN.is_file():
        raise SystemExit("BENCHMARK_PLAN_MISSING")
    plan=json.loads(PLAN.read_text(encoding="utf-8"))
    cases=plan.get("cases") or []
    seeds=(plan.get("generation") or {}).get("seeds") or []
    if len(cases)!=6 or len(seeds)!=2:
        raise SystemExit("BENCHMARK_PLAN_SHAPE_INVALID")
    return plan,cases,seeds

def phase(label,name,path,scale,cases,seeds,records):
    print(f"=== PHASE_{label.upper()}_CLEAN_API ===",flush=True)
    clean_restart_api()
    load_single_adapter(name,path,scale)

    total=len(cases)*len(seeds)
    done=0
    for case in cases:
        for seed in seeds:
            done+=1
            pair_id=f"{case['id']}_s{seed}"
            out=RAW/f"{pair_id}_{label}.wav"

            if out.is_file() and out.stat().st_size>44:
                try:
                    with wave.open(str(out),"rb") as wav:
                        valid=wav.getnframes()>0
                except Exception:
                    valid=False
                if valid:
                    print(f"BENCHMARK_RESUME_HIT={out.name}",flush=True)
                    generation={
                        "taskId":"RESUMED",
                        "fileRef":"",
                        "bytes":out.stat().st_size,
                        "sha256":sha256_file(out),
                        "payload":None,
                    }
                else:
                    out.unlink(missing_ok=True)
                    generation=generate(case,seed,label,name,scale,out)
            else:
                generation=generate(case,seed,label,name,scale,out)

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
            records.append(record)
            print(
                f"PHASE_PROGRESS={label}:{done}/{total} "
                f"SCORE={metrics['score']} "
                f"STATIC_PERCUSSION={metrics.get('staticPercussionFlag')}",
                flush=True,
            )

    request_json("POST","/v1/lora/toggle",{"use_lora":False},60)
    print(f"PHASE_{label.upper()}_COMPLETE=True",flush=True)

def restore_dev_state():
    print("=== RESTORE_DEVELOPMENT_ADAPTERS ===",flush=True)
    clean_restart_api()
    request_json("POST","/v1/lora/load",{
        "lora_path":str(V2_PATH),
        "adapter_name":V2_NAME,
    },180)
    request_json("POST","/v1/lora/scale",{
        "adapter_name":V2_NAME,
        "scale":V2_SCALE,
    },60)
    request_json("POST","/v1/lora/toggle",{"use_lora":False},60)

    request_json("POST","/v1/lora/load",{
        "lora_path":str(V3_PATH),
        "adapter_name":V3_NAME,
    },180)
    request_json("POST","/v1/lora/scale",{
        "adapter_name":V3_NAME,
        "scale":V3_SCALE,
    },60)
    request_json("POST","/v1/lora/toggle",{"use_lora":False},60)

    status=request_json("GET","/v1/lora/status",None,30)
    adapters=set(status.get("adapters") or [])
    if V2_NAME not in adapters or V3_NAME not in adapters:
        raise RuntimeError("FINAL_DEV_ADAPTER_RESTORE_FAILED")
    if bool(status.get("use_lora")):
        raise RuntimeError("FINAL_DEV_STATE_LORA_ACTIVE")

    print("V2_RESTORED_AFTER_BENCHMARK=True",flush=True)
    print("V3_RESTORED_AFTER_BENCHMARK=True",flush=True)
    print("LORA_ACTIVE_AFTER_BENCHMARK=False",flush=True)

def build_reports(records,cases,seeds):
    by_key={(x["pairId"],x["adapterLabel"]):x for x in records}
    pairs=[]
    unblind={}
    blind_manifest=[]

    pair_number=0
    for case in cases:
        for seed in seeds:
            pair_number+=1
            pair_id=f"{case['id']}_s{seed}"
            v2=by_key[(pair_id,"v2")]
            v3=by_key[(pair_id,"v3")]

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
                src=pathlib.Path(by_key[(pair_id,source_label)]["rawPath"])
                dest=BLIND/f"P{pair_number:02d}_{blind_label}.wav"
                hardlink_or_copy(src,dest)
                blind_entry["clips"][blind_label]={
                    "path":str(dest),
                    "sha256":sha256_file(dest),
                }

            blind_manifest.append(blind_entry)
            unblind[f"P{pair_number:02d}"]=mapping

            v2_score=float(v2["metrics"]["score"])
            v3_score=float(v3["metrics"]["score"])
            winner="v3" if v3_score>v2_score else "v2" if v2_score>v3_score else "tie"
            pairs.append({
                "pairNumber":pair_number,
                "pairId":pair_id,
                "caseId":case["id"],
                "seed":int(seed),
                "objectiveWinner":winner,
                "v2Score":v2_score,
                "v3Score":v3_score,
                "v3Delta":round(v3_score-v2_score,2),
            })

    v2clips=[x for x in records if x["adapterLabel"]=="v2"]
    v3clips=[x for x in records if x["adapterLabel"]=="v3"]
    agg_v2=aggregate(v2clips)
    agg_v3=aggregate(v3clips)

    wins={
        "v3":sum(1 for p in pairs if p["objectiveWinner"]=="v3"),
        "v2":sum(1 for p in pairs if p["objectiveWinner"]=="v2"),
        "ties":sum(1 for p in pairs if p["objectiveWinner"]=="tie"),
    }
    gate={
        "all24ClipsPresent":len(records)==24,
        "v3ClippingFailuresZero":agg_v3["clippingFailures"]==0,
        "v3StaticPercussionFlagsZero":agg_v3["staticPercussionFlags"]==0,
        "v3MeanScoreNotBelowV2":(
            agg_v3["meanScore"] is not None
            and agg_v2["meanScore"] is not None
            and agg_v3["meanScore"]>=agg_v2["meanScore"]
        ),
    }

    report={
        "version":"sonara-physical-realism-v3-audio-benchmark-clean-restart-v1",
        "method":"clean API restart between adapter phases",
        "model":MODEL,
        "lmUsed":False,
        "comparisonIsolatedToLoRA":True,
        "records":records,
        "pairs":pairs,
        "aggregate":{"v2":agg_v2,"v3":agg_v3},
        "objectiveWins":wins,
        "objectiveGate":gate,
        "objectiveGatePassed":all(gate.values()),
        "humanBlindReviewRequired":True,
        "automaticProductionPromotion":False,
        "nextAction":"RUN_BLIND_LISTENING_REVIEW",
    }
    REPORT.write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    UNBLIND.write_text(json.dumps(unblind,indent=2)+"\n",encoding="utf-8")
    BLIND_MANIFEST.write_text(json.dumps(blind_manifest,indent=2)+"\n",encoding="utf-8")

    print("=== SONARA V3 AUDIO BENCHMARK COMPLETE ===",flush=True)
    print("GENERATED_CLIPS="+str(len(records))+"/24",flush=True)
    print("V2_AGGREGATE="+json.dumps(agg_v2,separators=(",",":")),flush=True)
    print("V3_AGGREGATE="+json.dumps(agg_v3,separators=(",",":")),flush=True)
    print("OBJECTIVE_WINS="+json.dumps(wins,separators=(",",":")),flush=True)
    print("OBJECTIVE_GATE="+json.dumps(gate,separators=(",",":")),flush=True)
    print("OBJECTIVE_GATE_PASSED="+str(all(gate.values())),flush=True)
    print("HUMAN_BLIND_REVIEW_REQUIRED=True",flush=True)
    print("AUTOMATIC_PRODUCTION_PROMOTION=False",flush=True)
    print("BLIND_AUDIO_DIR="+str(BLIND),flush=True)
    print("BLIND_MANIFEST="+str(BLIND_MANIFEST),flush=True)
    print("REPORT_JSON="+str(REPORT),flush=True)
    print("NEXT_ACTION=RUN_BLIND_LISTENING_REVIEW",flush=True)

def main():
    plan,cases,seeds=ensure_plan()
    ROOT.mkdir(parents=True,exist_ok=True)
    RAW.mkdir(parents=True,exist_ok=True)
    BLIND.mkdir(parents=True,exist_ok=True)

    if not (V2_PATH/"adapter_model.safetensors").is_file():
        raise SystemExit("V2_ADAPTER_MISSING")
    if not (V3_PATH/"adapter_model.safetensors").is_file():
        raise SystemExit("V3_ADAPTER_MISSING")

    print("BENCHMARK_MODE=CLEAN_API_PHASES",flush=True)
    print("AUDIO_BENCHMARK_AUTHORIZED=True",flush=True)
    print("BENCHMARK_CASES="+str(len(cases)),flush=True)
    print("BENCHMARK_SEEDS="+str(len(seeds)),flush=True)
    print("EXPECTED_AUDIO_CLIPS=24",flush=True)

    records=[]
    try:
        phase("v2",V2_NAME,V2_PATH,V2_SCALE,cases,seeds,records)
        phase("v3",V3_NAME,V3_PATH,V3_SCALE,cases,seeds,records)
        build_reports(records,cases,seeds)
    finally:
        restore_dev_state()

if __name__=="__main__":
    main()
