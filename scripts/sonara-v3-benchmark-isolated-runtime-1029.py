#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import math
import os
import pathlib
import random
import shutil
import signal
import struct
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import wave

PROD_API="http://127.0.0.1:8001"
BENCH_PORT=8011
BENCH_API=f"http://127.0.0.1:{BENCH_PORT}"

ACE_PROD=pathlib.Path("/marimo/SONARA-ACE-Step-CLEAN")
PYTHON=ACE_PROD/".venv/bin/python"
CHECKPOINTS=ACE_PROD/"checkpoints"
CLEAN=pathlib.Path("/marimo/SONARA-ACE-Step-BENCHMARK-CLEAN")
UPSTREAM="https://github.com/ace-step/ACE-Step-1.5.git"
UPSTREAM_PIN="ca1e85fe9430179831e6bc6be790c332190a3866"

PLAN=pathlib.Path("/marimo/SONARA-PHYSICAL-REALISM-V3-BENCHMARK.json")
ROOT=pathlib.Path("/marimo/SONARA-V3-AUDIO-BENCHMARK")
RAW=ROOT/"raw"
BLIND=ROOT/"blind"
REPORT=ROOT/"benchmark_report_isolated.json"
UNBLIND=ROOT/"unblind_map_isolated.json"
BLIND_MANIFEST=ROOT/"blind_manifest_isolated.json"
API_LOG=ROOT/"isolated_api_8011.log"

V2_PATH=ACE_PROD/"sonara_training"/"physical_realism_v2_fixed"/"output"/"final"
V3_PATH=ACE_PROD/"sonara_training"/"physical_realism_v3_fixed"/"output"/"final"
V2_NAME="sonara_physical_realism_v2_fixed_dev"
V3_NAME="sonara_physical_realism_v3_fixed_dev"
V2_SCALE=0.60
V3_SCALE=0.55
MODEL="acestep-v15-xl-turbo"

def http_json(base,method,path,payload=None,timeout=180):
    body=None if payload is None else json.dumps(payload).encode("utf-8")
    req=urllib.request.Request(
        base+path,
        data=body,
        headers={
            "Content-Type":"application/json",
            "Accept":"application/json",
            "User-Agent":"SONARA-V3-Isolated-Benchmark/1.0",
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

def get_audio(path_or_url,timeout=180):
    if path_or_url.startswith("http://") or path_or_url.startswith("https://"):
        url=path_or_url
    elif path_or_url.startswith("/v1/audio"):
        url=BENCH_API+path_or_url
    else:
        url=BENCH_API+"/v1/audio?"+urllib.parse.urlencode({"path":path_or_url})
    req=urllib.request.Request(
        url,
        headers={
            "Accept":"audio/wav,application/octet-stream,*/*;q=0.1",
            "User-Agent":"SONARA-V3-Isolated-Benchmark/1.0",
        },
    )
    with urllib.request.urlopen(req,timeout=timeout) as response:
        return response.read()

def run(cmd,cwd=None,env=None,timeout=None,capture=False):
    kwargs={
        "cwd":str(cwd) if cwd else None,
        "env":env,
        "text":True,
        "check":True,
        "timeout":timeout,
    }
    if capture:
        kwargs["stdout"]=subprocess.PIPE
        kwargs["stderr"]=subprocess.STDOUT
    return subprocess.run([str(x) for x in cmd],**kwargs)

def sha256_file(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            b=f.read(1024*1024)
            if not b:
                break
            h.update(b)
    return h.hexdigest()

def ensure_clean_checkout():
    if not shutil.which("git"):
        raise SystemExit("GIT_NOT_AVAILABLE")
    if not PYTHON.is_file():
        raise SystemExit("ACE_PRODUCTION_VENV_PYTHON_MISSING")
    if not CHECKPOINTS.is_dir():
        raise SystemExit("ACE_CHECKPOINTS_MISSING")

    if not (CLEAN/".git").is_dir():
        if CLEAN.exists():
            shutil.rmtree(CLEAN)
        run([
            "git","clone","--filter=blob:none","--no-checkout",
            UPSTREAM,str(CLEAN)
        ],timeout=300)

    run(["git","fetch","--force","origin",UPSTREAM_PIN],cwd=CLEAN,timeout=300)
    run(["git","checkout","--force",UPSTREAM_PIN],cwd=CLEAN,timeout=120)
    run(["git","clean","-fdx"],cwd=CLEAN,timeout=120)

    head=run(["git","rev-parse","HEAD"],cwd=CLEAN,capture=True,timeout=30).stdout.strip()
    if head!=UPSTREAM_PIN:
        raise SystemExit("CLEAN_RUNTIME_PIN_MISMATCH="+head)

    probe=run(
        [
            str(PYTHON),"-c",
            "import pathlib,acestep; print(pathlib.Path(acestep.__file__).resolve())",
        ],
        cwd=CLEAN,
        env={**os.environ,"PYTHONPATH":str(CLEAN)},
        capture=True,
        timeout=30,
    ).stdout.strip().splitlines()[-1]
    if not str(probe).startswith(str(CLEAN)):
        raise SystemExit("CLEAN_RUNTIME_IMPORT_NOT_ISOLATED="+probe)

    print("ISOLATED_RUNTIME_PIN="+head,flush=True)
    print("ISOLATED_RUNTIME_IMPORT="+probe,flush=True)

def kill_benchmark_api():
    try:
        rows=subprocess.check_output(["ps","-eo","pid=,args="],text=True)
    except Exception:
        return
    me=os.getpid()
    targets=[]
    for row in rows.splitlines():
        parts=row.strip().split(maxsplit=1)
        if len(parts)!=2:
            continue
        try:
            pid=int(parts[0])
        except ValueError:
            continue
        if pid==me:
            continue
        cmd=parts[1]
        if "acestep.api_server" in cmd and f"--port {BENCH_PORT}" in cmd:
            targets.append(pid)
    for pid in targets:
        try:
            os.kill(pid,signal.SIGTERM)
        except Exception:
            pass
    if targets:
        time.sleep(3)

def gpu_snapshot():
    smi=shutil.which("nvidia-smi")
    if not smi:
        print("GPU_SNAPSHOT=UNAVAILABLE",flush=True)
        return
    try:
        out=run([
            smi,
            "--query-gpu=name,memory.total,memory.used,memory.free",
            "--format=csv,noheader,nounits",
        ],capture=True,timeout=20).stdout.strip()
        print("GPU_SNAPSHOT="+out.replace("\n"," | "),flush=True)
    except Exception as exc:
        print("GPU_SNAPSHOT_ERROR="+type(exc).__name__,flush=True)

def benchmark_env():
    env=os.environ.copy()
    env.pop("VIRTUAL_ENV",None)
    env.pop("ACESTEP_API_KEY",None)
    env.update({
        "PYTHONPATH":str(CLEAN),
        "ACESTEP_PROJECT_ROOT":str(CLEAN),
        "ACESTEP_CHECKPOINTS_DIR":str(CHECKPOINTS),
        "ACESTEP_CONFIG_PATH":MODEL,
        "ACESTEP_DEVICE":"cuda",
        "ACESTEP_INIT_LLM":"false",
        "ACESTEP_LM_BACKEND":"pt",
        "ACESTEP_USE_FLASH_ATTENTION":"false",
        "ACESTEP_COMPILE_MODEL":"false",
        "ACESTEP_OFFLOAD_TO_CPU":"false",
        "ACESTEP_OFFLOAD_DIT_TO_CPU":"false",
        "ACESTEP_NO_INIT":"false",
        "ACESTEP_API_HOST":"127.0.0.1",
        "ACESTEP_API_PORT":str(BENCH_PORT),
        "ACESTEP_API_WORKERS":"1",
        "ACESTEP_QUEUE_WORKERS":"1",
        "ACESTEP_QUEUE_MAXSIZE":"32",
        "ACESTEP_DOWNLOAD_SOURCE":"huggingface",
        "TOKENIZERS_PARALLELISM":"false",
        "MPLBACKEND":"Agg",
        "PYTHONUNBUFFERED":"1",
        "PYTORCH_CUDA_ALLOC_CONF":"expandable_segments:True",
        "TRITON_CACHE_DIR":str(ROOT/"triton-cache"),
        "TORCHINDUCTOR_CACHE_DIR":str(ROOT/"torchinductor-cache"),
    })
    return env

def start_isolated_api():
    kill_benchmark_api()
    ROOT.mkdir(parents=True,exist_ok=True)
    API_LOG.write_text("",encoding="utf-8")
    stream=API_LOG.open("a",encoding="utf-8",buffering=1)
    proc=subprocess.Popen(
        [
            str(PYTHON),"-m","acestep.api_server",
            "--host","127.0.0.1",
            "--port",str(BENCH_PORT),
            "--download-source","huggingface",
        ],
        cwd=str(CLEAN),
        env=benchmark_env(),
        stdout=stream,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    deadline=time.monotonic()+600
    last=None
    while time.monotonic()<deadline:
        if proc.poll() is not None:
            tail=API_LOG.read_text(errors="replace")[-12000:] if API_LOG.exists() else ""
            raise RuntimeError("ISOLATED_API_EXITED\n"+tail)
        try:
            health=http_json(BENCH_API,"GET","/health",None,15)
            last=health
            if (
                isinstance(health,dict)
                and health.get("models_initialized") is True
                and str(health.get("loaded_model") or "")==MODEL
            ):
                status=http_json(BENCH_API,"GET","/v1/lora/status",None,30)
                print(
                    "ISOLATED_API_READY="
                    +json.dumps({
                        "pid":proc.pid,
                        "model":health.get("loaded_model"),
                        "llm_initialized":health.get("llm_initialized"),
                        "lora_loaded":status.get("lora_loaded"),
                        "use_lora":status.get("use_lora"),
                        "adapters":status.get("adapters") or [],
                    },separators=(",",":")),
                    flush=True,
                )
                if bool(status.get("lora_loaded")) or (status.get("adapters") or []):
                    raise RuntimeError("ISOLATED_RUNTIME_UNEXPECTED_LORA_STATE")
                return proc
        except RuntimeError:
            raise
        except Exception:
            pass
        time.sleep(2)

    tail=API_LOG.read_text(errors="replace")[-12000:] if API_LOG.exists() else ""
    raise RuntimeError("ISOLATED_API_START_TIMEOUT last="+repr(last)+"\n"+tail)

def stop_isolated_api(proc):
    if proc is None:
        return
    if proc.poll() is None:
        try:
            os.killpg(proc.pid,signal.SIGTERM)
        except Exception:
            try:
                proc.terminate()
            except Exception:
                pass
        try:
            proc.wait(timeout=20)
        except Exception:
            try:
                os.killpg(proc.pid,signal.SIGKILL)
            except Exception:
                pass
    print("ISOLATED_API_STOPPED=True",flush=True)

def load_only_adapter(name,path,scale):
    before=http_json(BENCH_API,"GET","/v1/lora/status",None,30)
    if bool(before.get("lora_loaded")) or (before.get("adapters") or []):
        raise RuntimeError("ISOLATED_API_NOT_CLEAN_BEFORE_LOAD")

    http_json(BENCH_API,"POST","/v1/lora/load",{
        "lora_path":str(path),
        "adapter_name":name,
    },180)
    http_json(BENCH_API,"POST","/v1/lora/scale",{
        "adapter_name":name,
        "scale":scale,
    },60)

    status=http_json(BENCH_API,"GET","/v1/lora/status",None,30)
    adapters=set(status.get("adapters") or [])
    if adapters!={name}:
        raise RuntimeError("ISOLATED_ADAPTER_SET_INVALID="+repr(sorted(adapters)))
    if str(status.get("active_adapter") or "")!=name:
        raise RuntimeError("ISOLATED_ACTIVE_ADAPTER_INVALID")
    if not bool(status.get("use_lora")):
        http_json(BENCH_API,"POST","/v1/lora/toggle",{"use_lora":True},60)
        status=http_json(BENCH_API,"GET","/v1/lora/status",None,30)
    if not bool(status.get("use_lora")):
        raise RuntimeError("ISOLATED_LORA_ENABLE_FAILED")
    actual=float((status.get("scales") or {}).get(name,-1))
    if abs(actual-scale)>1e-6:
        raise RuntimeError(f"ISOLATED_SCALE_INVALID={actual}/{scale}")
    print(f"ISOLATED_ADAPTER_READY={name} SCALE={actual}",flush=True)

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
        rows=http_json(BENCH_API,"POST","/query_result",{"task_id_list":[task_id]},60)
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

def generate(case,seed,label,out_path):
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
    released=http_json(BENCH_API,"POST","/release_task",payload,120)
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
    data=get_audio(file_ref,180)
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
    return {"taskId":task_id,"sha256":digest,"bytes":len(data),"payload":payload}

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
    return cases,seeds

def run_phase(label,name,path,scale,cases,seeds,records):
    print(f"=== ISOLATED_PHASE_{label.upper()} ===",flush=True)
    proc=None
    try:
        proc=start_isolated_api()
        load_only_adapter(name,path,scale)
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
                            "sha256":sha256_file(out),
                            "bytes":out.stat().st_size,
                            "payload":None,
                        }
                    else:
                        out.unlink(missing_ok=True)
                        generation=generate(case,seed,label,out)
                else:
                    generation=generate(case,seed,label,out)

                metrics=wav_quality_report(out)
                if not metrics.get("ok"):
                    raise RuntimeError("WAV_QUALITY_ANALYSIS_FAILED="+out.name)

                records.append({
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
                })
                print(
                    f"PHASE_PROGRESS={label}:{done}/{total} "
                    f"SCORE={metrics['score']} "
                    f"STATIC_PERCUSSION={metrics.get('staticPercussionFlag')}",
                    flush=True,
                )
        print(f"ISOLATED_PHASE_{label.upper()}_COMPLETE=True",flush=True)
    finally:
        stop_isolated_api(proc)

def build_report(records,cases,seeds):
    by_key={(x["pairId"],x["adapterLabel"]):x for x in records}
    pairs=[]
    blind_manifest=[]
    unblind={}
    pair_number=0

    for case in cases:
        for seed in seeds:
            pair_number+=1
            pair_id=f"{case['id']}_s{seed}"
            v2=by_key[(pair_id,"v2")]
            v3=by_key[(pair_id,"v3")]

            rng=random.Random(int(hashlib.sha256(pair_id.encode()).hexdigest()[:16],16))
            mapping={"X":"v3","Y":"v2"} if bool(rng.getrandbits(1)) else {"X":"v2","Y":"v3"}
            blind_entry={
                "pairNumber":pair_number,
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
        "version":"sonara-physical-realism-v3-isolated-runtime-benchmark-v1",
        "upstreamRuntimePin":UPSTREAM_PIN,
        "benchmarkApiPort":BENCH_PORT,
        "productionApiPort":8001,
        "productionApiMutated":False,
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

    print("=== SONARA V3 ISOLATED AUDIO BENCHMARK COMPLETE ===",flush=True)
    print("GENERATED_CLIPS="+str(len(records))+"/24",flush=True)
    print("V2_AGGREGATE="+json.dumps(agg_v2,separators=(",",":")),flush=True)
    print("V3_AGGREGATE="+json.dumps(agg_v3,separators=(",",":")),flush=True)
    print("OBJECTIVE_WINS="+json.dumps(wins,separators=(",",":")),flush=True)
    print("OBJECTIVE_GATE="+json.dumps(gate,separators=(",",":")),flush=True)
    print("OBJECTIVE_GATE_PASSED="+str(all(gate.values())),flush=True)
    print("HUMAN_BLIND_REVIEW_REQUIRED=True",flush=True)
    print("AUTOMATIC_PRODUCTION_PROMOTION=False",flush=True)
    print("PRODUCTION_API_8001_MUTATED=False",flush=True)
    print("BLIND_AUDIO_DIR="+str(BLIND),flush=True)
    print("BLIND_MANIFEST="+str(BLIND_MANIFEST),flush=True)
    print("REPORT_JSON="+str(REPORT),flush=True)
    print("NEXT_ACTION=RUN_BLIND_LISTENING_REVIEW",flush=True)

def prod_snapshot():
    try:
        health=http_json(PROD_API,"GET","/health",None,15)
        status=http_json(PROD_API,"GET","/v1/lora/status",None,15)
        return {
            "health":{
                "models_initialized":health.get("models_initialized"),
                "llm_initialized":health.get("llm_initialized"),
                "loaded_model":health.get("loaded_model"),
                "loaded_lm_model":health.get("loaded_lm_model"),
            },
            "lora":status,
        }
    except Exception as exc:
        return {"error":type(exc).__name__}

def main():
    cases,seeds=ensure_plan()
    ROOT.mkdir(parents=True,exist_ok=True)
    RAW.mkdir(parents=True,exist_ok=True)
    BLIND.mkdir(parents=True,exist_ok=True)

    if not (V2_PATH/"adapter_model.safetensors").is_file():
        raise SystemExit("V2_ADAPTER_MISSING")
    if not (V3_PATH/"adapter_model.safetensors").is_file():
        raise SystemExit("V3_ADAPTER_MISSING")

    print("BENCHMARK_MODE=ISOLATED_UPSTREAM_RUNTIME",flush=True)
    print("BENCHMARK_API_PORT=8011",flush=True)
    print("PRODUCTION_API_PORT=8001",flush=True)
    print("PRODUCTION_API_POST_REQUESTS=0",flush=True)
    print("AUDIO_BENCHMARK_AUTHORIZED=True",flush=True)
    print("EXPECTED_AUDIO_CLIPS=24",flush=True)

    before=prod_snapshot()
    print("PRODUCTION_SNAPSHOT_BEFORE="+json.dumps(before,separators=(",",":")),flush=True)

    gpu_snapshot()
    ensure_clean_checkout()

    records=[]
    try:
        run_phase("v2",V2_NAME,V2_PATH,V2_SCALE,cases,seeds,records)
        run_phase("v3",V3_NAME,V3_PATH,V3_SCALE,cases,seeds,records)
        build_report(records,cases,seeds)
    finally:
        kill_benchmark_api()

    after=prod_snapshot()
    print("PRODUCTION_SNAPSHOT_AFTER="+json.dumps(after,separators=(",",":")),flush=True)
    print("PRODUCTION_API_8001_UNTOUCHED=True",flush=True)

if __name__=="__main__":
    main()
