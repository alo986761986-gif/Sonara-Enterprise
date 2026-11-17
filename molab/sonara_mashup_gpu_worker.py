#!/usr/bin/env python3
"""SONARA Mashup GPU v1: isolated Demucs stems, NO ACE-Step generation.

Runs in the existing verified private Remix Pro Python environment but in a
separate process and queue. Never prints tokens/customer audio or writes to
the ACE-Step or Remix Pro working directories.
"""
from __future__ import annotations
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request

from sonara_mashup_music_director_v2 import create_master, valid_config

API = "https://api.sonaraenterprise.com/api/sonara-relay/"
REV = "sonara-mashup-htdemucs-v1"
ROOT = Path("/marimo/SONARA-MASHUP-GPU")
PRO_ROOT = Path("/marimo/SONARA-REMIX-PRO")
TOKEN = Path.home() / ".sonara" / "relay.token"
MAX_BYTES = 64 * 1024 * 1024
STOP = threading.Event()
STEMS = ("vocals", "drums", "bass", "other")
MODES = ("club", "dialogue", "instrumental")
AUDIO_FORMATS = {"wav", "flac", "mp3", "m4a", "ogg"}
class MashupError(RuntimeError):
    pass

def check_runtime(*, model=False):
    import torch
    import demucs
    import numpy
    import soundfile
    import librosa
    valid_config({"vocalPolicy":"dialogue","masterProfile":"studio"})
    if not torch.cuda.is_available() or tuple(torch.cuda.get_device_capability(0)) != (12, 0):
        raise MashupError("RTX PRO 6000 Blackwell CUDA non disponibile")
    if "sm_120" not in torch.cuda.get_arch_list():
        raise MashupError("Installazione Torch priva del supporto Blackwell")
    with torch.no_grad():
        sample = torch.ones((8,8), device="cuda")
        assert float((sample@sample)[0,0])==8.0
    if shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None:
        raise MashupError("FFmpeg e FFprobe richiesti")
    if model:
        from demucs.pretrained import get_model
        net = get_model("htdemucs")
        net.to("cuda")
        net.eval()
        del net
        torch.cuda.empty_cache()
    return True

def headers(lease=None, data=False):
    secret=TOKEN.read_text(encoding="ascii").strip()
    if not (32<=len(secret)<=512) or not secret.isascii() or any(c.isspace() for c in secret):
        raise MashupError("Credenziale MoLab esistente non valida")
    h={"X-Sonara-Relay-Token":secret,
       "X-Sonara-Pro-Agent-Revision":"sonara-remix-pro-r2-agent-v3-dual-reference-fusion",
       "User-Agent":"SONARA-Mashup-HTDemucs/1.0",
       "Accept":"application/json",
       "X-Sonara-Mashup-Director-Revision":"music-director-v2"}
    if lease:h["X-Sonara-Mashup-Lease"]=lease
    if data:h["Content-Type"]="application/json"
    return h

def call(path, method="GET", payload=None, lease=None, binary=False, timeout=55):
    if not path.startswith("mashup-"):raise MashupError("Percorso API non autorizzato")
    h=headers(lease,data=isinstance(payload,dict))
    body=json.dumps(payload).encode() if isinstance(payload,dict) else payload
    if isinstance(body,bytes) and not isinstance(payload,dict):
        h["Content-Type"]="audio/wav"
    req=urllib.request.Request(API+path,data=body,method=method,headers=h)
    opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
    try:
        with opener.open(req,timeout=timeout) as response:
            if binary:
                length=int(response.headers.get("content-length") or 0)
                if length>MAX_BYTES:raise MashupError("Sorgente oltre 64 MiB")
                block=response.read(MAX_BYTES+1)
                if len(block)<44 or len(block)>MAX_BYTES:raise MashupError("Sorgente R2 non valida")
                return block
            reply=json.load(response)
            if not isinstance(reply,dict):raise MashupError("Gateway non valido")
            return reply
    except urllib.error.HTTPError as exc:
        raise MashupError("Gateway Mashup HTTP "+str(exc.code)) from exc

def beat():
    return call("mashup-heartbeat","POST",{
        "revision":REV,"gpuReady":True,"demucsReady":True,"musicDirectorV2":True
    })

class LeaseKeeper:
    def __init__(self,jid,lease):
        self.jid,self.lease=jid,lease
        self.stop=threading.Event()
        self.failed=threading.Event()
        self.thread=threading.Thread(target=self.loop,daemon=True)
    def loop(self):
        while not self.stop.wait(45):
            try:
                if call("mashup-job/"+self.jid+"/renew","POST",{},self.lease).get("ok") is not True:
                    self.failed.set()
                beat()
            except Exception:
                self.failed.set()
            if self.failed.is_set():break
    def __enter__(self):self.thread.start();return self
    def __exit__(self,*_):self.stop.set();self.thread.join(timeout=5)
    def verify(self):
        if self.failed.is_set():raise MashupError("Lease GPU scaduta: master non pubblicato")

def stage(jid,lease,name,keeper):
    keeper.verify()
    call("mashup-job/"+jid+"/progress","POST",{"stage":name},lease)

def ffmpeg_decode(source,output):
    probe=subprocess.run(["ffprobe","-v","error","-show_entries",
        "format=duration","-of","default=noprint_wrappers=1:nokey=1",str(source)],
        capture_output=True,text=True,timeout=40,check=True)
    try:duration=float(probe.stdout.strip())
    except ValueError:raise MashupError("Durata sorgente non leggibile")
    if not (10<=duration<=900):raise MashupError("Sorgente fuori durata 10-900 secondi")
    subprocess.run(["ffmpeg","-nostdin","-loglevel","error","-y","-i",str(source),
        "-vn","-ac","2","-ar","44100","-c:a","pcm_f32le",str(output)],
        capture_output=True,check=True,timeout=150)
    if not output.is_file() or output.stat().st_size<=44:
        raise MashupError("Decodifica PCM non riuscita")

def separate(audio,folder):
    """Actual Demucs GPU inference; fails if stems are not genuine."""
    import soundfile as sf
    cmd=[sys.executable,"-m","demucs.separate","-n","htdemucs",
         "--device","cuda","--shifts","1","--overlap","0.25",
         "--out",str(folder),str(audio)]
    subprocess.run(cmd,check=True,capture_output=True,timeout=1800)
    stemroot=folder/"htdemucs"/audio.stem
    result={}
    for kind in STEMS:
        stem=stemroot/(kind+".wav")
        if not stem.is_file() or stem.stat().st_size<1000:
            raise MashupError("Stem autentico mancante: "+kind)
        with sf.SoundFile(stem) as f:
            if f.channels!=2 or f.frames<44100:raise MashupError("Stem Demucs non valido: "+kind)
        result[kind]=stem
    return result

def audio_stem(path,seconds,bpm,target_bpm):
    """Pitch-preserving stereo time stretching for B, conservative +-12%."""
    import numpy as np
    import librosa
    import soundfile as sf
    data,sr=sf.read(path,dtype="float32",always_2d=True)
    if sr!=44100:raise MashupError("Stem sample rate inatteso")
    if not np.isfinite(data).all():raise MashupError("Stem con campioni non finiti")
    if bpm!=target_bpm:
        ratio=target_bpm/bpm
        if not .88<=ratio<=1.12:raise MashupError("BPM incompatibili")
        data=np.stack([librosa.effects.time_stretch(data[:,k],rate=ratio) for k in range(2)],axis=1)
    if len(data)<44100:raise MashupError("Stem troppo corto")
    return data

def paste_loop(destination,source,gain,begin,end,ramp=0.015):
    """Bounded additions of real stem phrases with smooth edits, no generated vocals."""
    import numpy as np
    n=len(destination)
    start=max(0,min(n,int(begin*44100)))
    stop=max(start,min(n,int(end*44100)))
    if stop<=start or len(source)<44100:return
    chunk=32768
    edge=int(max(.005,min(ramp,.25))*44100)
    for left in range(start,stop,chunk):
        right=min(stop,left+chunk)
        idx=(np.arange(left-start,right-start,dtype=np.int64)%len(source))
        audio=source[idx].copy()
        # Local phrase fade-ins/outs and repeated-source seam de-clicking.
        local=np.arange(left-start,right-start)
        envelope=np.ones((right-left,),dtype=np.float32)
        envelope=np.minimum(envelope,np.maximum(0,local/edge))
        envelope=np.minimum(envelope,np.maximum(0,(stop-start-local-1)/edge))
        offset=local%len(source)
        envelope=np.minimum(envelope,np.maximum(0,offset/edge))
        envelope=np.minimum(envelope,np.maximum(0,(len(source)-offset-1)/edge))
        destination[left:right]+=audio*(envelope[:,None]*gain)

def make_master(a,b,bpm_a,bpm_b,seconds,mode,output):
    """One A-clock; genuine stems from both tracks, alternating original vocals."""
    import numpy as np
    import soundfile as sf
    if mode not in MODES:raise MashupError("Modalità non valida")
    if seconds not in range(30,301,30):raise MashupError("Durata non valida")
    if not (60<=bpm_a<=200 and 60<=bpm_b<=220 and abs(bpm_a/bpm_b-1)<=.12):
        raise MashupError("BPM incompatibili")
    tracks={}
    # Process one stem at a time; avoid retaining eight five-minute audio buffers.
    frames=seconds*44100
    audio=np.zeros((frames,2),dtype=np.float32)
    phrase=16*60/bpm_a
    for letter,stems,bpm in (("a",a,bpm_a),("b",b,bpm_b)):
        for name in STEMS:
            # A drives the kick and bass, B contributes voice and melodies.
            if letter=="b" and name in ("bass","drums"):continue
            if letter=="a" and mode=="instrumental" and name=="vocals":continue
            if letter=="b" and mode=="instrumental" and name=="vocals":continue
            stem=audio_stem(stems[name],seconds,bpm,bpm_a)
            gain={"drums":.77,"bass":.7,"other":.50,"vocals":.82}[name]
            if letter=="a" and name in ("drums","bass"):
                paste_loop(audio,stem,gain,0,seconds)
            elif letter=="a" and name=="other":
                paste_loop(audio,stem,.48,0,seconds)
            elif letter=="b" and name=="other":
                for i in range(int(seconds/phrase)+1):
                    if i%4 in (1,2):
                        paste_loop(audio,stem,.40,i*phrase,min(seconds,(i+1)*phrase))
            elif name=="vocals":
                for i in range(int(seconds/phrase)+1):
                    if (i%4 in (0,1))==(letter=="a"):
                        paste_loop(audio,stem,gain,i*phrase,min(seconds,(i+1)*phrase))
            del stem
    if not np.isfinite(audio).all():raise MashupError("Audio non finito")
    peak=float(np.max(np.abs(audio)))
    if peak<.0001:raise MashupError("Mashup silenzioso")
    # Peak-only output ceiling, never claims certified LUFS / true-peak.
    audio*=min(1,.88/peak)
    fade=int(.3*44100)
    audio[:fade]*=np.linspace(0,1,fade,dtype=np.float32)[:,None]
    audio[-fade:]*=np.linspace(1,0,fade,dtype=np.float32)[:,None]
    finalPeak=float(np.max(np.abs(audio)))
    sf.write(str(output),audio,44100,subtype="PCM_16")
    with sf.SoundFile(output) as wav:
        if wav.frames!=frames or wav.channels!=2 or wav.samplerate!=44100:
            raise MashupError("Master non conforme")
    if output.stat().st_size>MAX_BYTES:raise MashupError("Master supera il limite del relay")
    return {"model":"htdemucs","stemsVerified":True,"actualDurationSec":seconds,
            "audit":{"peakDbfs":round(20*np.log10(max(finalPeak,1e-9)),2)}}

def run(item):
    jid,lease=item["jobId"],item["leaseId"]
    if not isinstance(jid,str) or not jid.startswith("smash_") or not isinstance(lease,str):
        raise MashupError("Lease job non valida")
    p=item.get("params") or {}
    mode=p.get("mode")
    seconds=int(p.get("durationSec",0))
    bpm_a=float(p.get("bpmA",0));bpm_b=float(p.get("bpmB",0))
    if mode not in MODES:raise MashupError("Modalità non valida")
    with LeaseKeeper(jid,lease) as guard, tempfile.TemporaryDirectory(prefix="sonara-mashup-") as folder:
        root=Path(folder)
        try:
            stage(jid,lease,"downloading",guard)
            source=[]
            for role in ("a","b"):
                format=str(p.get("format"+role.upper(),""))
                if format not in AUDIO_FORMATS:raise MashupError("Formato sorgente non supportato")
                raw=call("mashup-job/"+jid+"/source/"+role,lease=lease,binary=True)
                path=root/("original-"+role+"."+format)
                path.write_bytes(raw);source.append(path)
            if hashlib.sha256(source[0].read_bytes()).digest()==hashlib.sha256(source[1].read_bytes()).digest():
                raise MashupError("Due brani identici")
            stage(jid,lease,"analyzing",guard)
            converted=[]
            for role,path in zip(("a","b"),source):
                dest=root/(role+".wav");ffmpeg_decode(path,dest);converted.append(dest)
            stage(jid,lease,"separating",guard)
            stems_a=separate(converted[0],root/"stems-a")
            guard.verify()
            stems_b=separate(converted[1],root/"stems-b")
            stage(jid,lease,"arranging",guard)
            output=root/"master.wav"
            if p.get("directorV2") is not None:
                # Server has independently validated the controls and only
                # leases V2 jobs after a fresh V2 worker heartbeat.
                valid_config(p["directorV2"])
                guard.verify()
                proof=create_master(stems_a,stems_b,bpm_a,bpm_b,seconds,mode,output,p["directorV2"])
            else:
                proof=make_master(stems_a,stems_b,bpm_a,bpm_b,seconds,mode,output)
            stage(jid,lease,"mastering",guard)
            guard.verify()
            stage(jid,lease,"uploading",guard)
            call("mashup-job/"+jid+"/audio","PUT",output.read_bytes(),lease,timeout=180)
            guard.verify()
            receipt=call("mashup-job/"+jid+"/complete","POST",proof,lease,timeout=75)
            if receipt.get("ok") is not True:raise MashupError("Master non confermato")
            print("MASHUP_GPU_JOB_COMPLETED",jid,flush=True)
        except Exception as exc:
            code="SOURCES_INCOMPATIBLE" if "incompatib" in str(exc).lower() else (
                "DEMUCS_FAILED" if "demucs" in str(exc).lower() else "AUDIO_INVALID")
            with contextlib.suppress(Exception):
                call("mashup-job/"+jid+"/fail","POST",{"code":code},lease,timeout=30)
            print("MASHUP_GPU_JOB_FAILED",jid,type(exc).__name__,flush=True)

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--preflight",action="store_true")
    parser.add_argument("--once",action="store_true")
    args=parser.parse_args()
    if not TOKEN.is_file():raise MashupError("Token MoLab privato già autorizzato non presente")
    if ROOT.exists() and ROOT.is_symlink():raise MashupError("Percorso privato non sicuro")
    ROOT.mkdir(mode=0o700,parents=True,exist_ok=True)
    check_runtime(model=True)
    # Read-only preflight: never claim GPU V2 online while the old worker
    # might still be running. Agent auth is verified by a read-only endpoint.
    status=call("mashup-agent-check")
    caps=call("mashup-capabilities")
    print("MASHUP_GPU_DEMUCS_REAL_MODEL_READY=True",flush=True)
    print("MASHUP_MUSIC_DIRECTOR_V2_READY=True",flush=True)
    print("MASHUP_GPU_CLOUDFLARE_AUTHENTICATED",status.get("authenticated") is True,flush=True)
    print("MASHUP_GPU_SITE_AVAILABLE",caps.get("available") is True,flush=True)
    print("ACE_STEP_UNMODIFIED=True",flush=True)
    print("NO_CUSTOMER_AUDIO_JOB_CREATED=True",flush=True)
    if args.preflight:
        print("MASHUP_V2_PREFLIGHT_READ_ONLY=True",flush=True)
        return
    # An active worker advertises V2 only after full model and agent checks.
    beat()
    while not STOP.is_set():
        try:
            beat()
            caps=call("mashup-capabilities")
            if caps.get("available") is True:
                claim=call("mashup-claim","POST",{})
                if claim.get("jobId"):run(claim)
            if args.once:break
        except Exception as e:
            print("MASHUP_GPU_WORKER_RETRY",type(e).__name__,flush=True)
            if args.once:raise
        STOP.wait(10)

if __name__=="__main__":
    signal.signal(signal.SIGTERM,lambda *args:STOP.set())
    signal.signal(signal.SIGINT,lambda *args:STOP.set())
    main()
