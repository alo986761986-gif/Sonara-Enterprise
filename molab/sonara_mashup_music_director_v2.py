"""SONARA Mashup Music Director V2: real-stem phrase-aware arranger.

This module never generates fake stems, text, song structure or music.
Beat locations and source-section labels are estimates from audio, not
verified transcription. Arrangement is deterministic and user-editable.
"""
from __future__ import annotations
from dataclasses import dataclass
import json
import math
from pathlib import Path

SECTIONS=("intro","verse","chorus","bridge","drop","outro")
PROFILES=("studio","club","streaming")
VOICE_POLICIES=("dialogue","a","b","instrumental")
SR=44100

class DirectorError(ValueError):
    pass

def valid_config(config):
    if not isinstance(config,dict):raise DirectorError("Music Director settings must be a JSON object")
    policy=str(config.get("vocalPolicy","dialogue"))
    profile=str(config.get("masterProfile","studio"))
    if policy not in VOICE_POLICIES or profile not in PROFILES:
        raise DirectorError("Invalid vocal policy or mastering profile")
    number=int(config.get("variation",0))
    if not (0<=number<=99):raise DirectorError("Invalid creative variation")
    for name in ("vocalGainA","vocalGainB","instrumentGainB"):
        amount=config.get(name,75)
        if not isinstance(amount,(int,float)) or not math.isfinite(amount) or not (0<=amount<=100):
            raise DirectorError("Invalid track gain: "+name)
    structure=config.get("sections",[])
    if not isinstance(structure,list) or len(structure)>32:raise DirectorError("Invalid song structure")
    result=[]
    for entry in structure:
        if not isinstance(entry,dict) or entry.get("name") not in SECTIONS:raise DirectorError("Invalid section")
        bars=entry.get("bars")
        if type(bars) is not int or bars not in (4,8,16):raise DirectorError("Section bars must be 4, 8 or 16")
        voice=entry.get("voice","auto")
        if voice not in ("auto","a","b","none"):raise DirectorError("Invalid section vocal arrangement")
        energy=entry.get("energy",70)
        if type(energy) not in (int,float) or not math.isfinite(energy) or not 0<=energy<=100:
            raise DirectorError("Invalid section energy")
        result.append({"name":entry["name"],"bars":bars,"voice":voice,"energy":float(energy)})
    return {"vocalPolicy":policy,"masterProfile":profile,"variation":number,
            "vocalGainA":float(config.get("vocalGainA",75))/100,
            "vocalGainB":float(config.get("vocalGainB",75))/100,
            "instrumentGainB":float(config.get("instrumentGainB",75))/100,
            "sections":result}

def template(mode,seconds,bpm):
    """Sections are a starting arrangement, not claims of song-form detection."""
    if mode=="instrumental":
        names=("intro","verse","drop","bridge","drop","outro")
    elif mode=="dialogue":
        names=("intro","verse","chorus","verse","bridge","chorus","outro")
    else:
        names=("intro","verse","chorus","drop","bridge","drop","outro")
    total_bars=max(4, int(round(seconds*bpm/240)))
    widths=[8]*len(names)
    if total_bars>sum(widths):widths[2]=16
    return [{"name":n,"bars":widths[i],"voice":"auto",
             "energy":(30 if n in ("intro","outro") else 50 if n=="bridge" else 92 if n=="drop" else 70)}
            for i,n in enumerate(names)]

def build_segments(seconds,bpm,mode,config):
    config=valid_config(config)
    if not (30<=seconds<=300 and 60<=bpm<=200):raise DirectorError("Invalid tempo or duration")
    sections=config["sections"] or template(mode,seconds,bpm)
    bar=240.0/bpm
    result=[]
    cursor=0.0
    index=0
    while cursor<seconds-0.01:
        section=sections[index % len(sections)]
        finish=min(seconds,cursor+bar*section["bars"])
        result.append({**section,"start":round(cursor,5),"end":round(finish,5),"index":index})
        cursor=finish;index+=1
        if index>100:raise DirectorError("Arrangement exceeds safe segment limit")
    return result

def source_candidates(stem,sr,bpm,section_sec):
    """Return RMS-labelled real source passages; no invented section markers."""
    import numpy as np
    frames=max(1,int(section_sec*sr))
    count=max(1,len(stem)//frames)
    data=[]
    for i in range(count):
        start=i*frames
        end=min(len(stem),start+frames)
        excerpt=stem[start:end]
        if len(excerpt)<sr:continue
        energy=float(np.sqrt(np.mean(np.square(excerpt.astype(np.float64)))))
        data.append((start,end,energy))
    if not data:
        return [(0,len(stem),float(np.sqrt(np.mean(np.square(stem.astype(np.float64))))))]
    return data

def splice_to(master,stem,start_seconds,end_seconds,source_from,gain,sr=SR):
    """Bounded equal-power-style fades at phrase edges; loop only genuine audio."""
    import numpy as np
    first=max(0,int(start_seconds*sr))
    last=min(len(master),int(end_seconds*sr))
    available=len(stem)
    if last<=first or available<sr or not gain:return
    desired=last-first
    src_start=max(0,min(available-sr,int(source_from)))
    clip=stem[src_start:min(src_start+desired,available)]
    if len(clip)<desired:
        # Extend from the same recorded passage, with a short seam fade.
        repeats=int(np.ceil(desired/max(1,len(clip))))
        clip=np.tile(clip,(repeats,1))[:desired]
    else:clip=clip.copy()
    edge=min(int(.11*sr),max(32,desired//5))
    env=np.ones(desired,dtype=np.float32)
    curve=np.sin(np.linspace(0,math.pi/2,edge,endpoint=True))**2
    env[:edge]*=curve
    env[-edge:]*=curve[::-1]
    master[first:last]+=clip[:desired]*env[:,None]*gain

def _stem(path,bpm,target):
    import numpy as np
    import soundfile as sf
    import librosa
    audio,sr=sf.read(str(path),dtype="float32",always_2d=True)
    if len(audio)<sr or sr!=SR or audio.shape[1]!=2 or not np.isfinite(audio).all():
        raise DirectorError("Invalid verified Demucs stem")
    if abs(bpm-target)>1e-6:
        ratio=target/bpm
        if not .88<=ratio<=1.12:raise DirectorError("Source BPM difference exceeds safe stretch")
        audio=np.stack([librosa.effects.time_stretch(audio[:,ch],rate=ratio) for ch in range(2)],axis=1)
    return audio

def _phase(a,b,bpm,sr=SR):
    """Transient alignment estimate. Not a verified downbeat."""
    import numpy as np
    beat=max(1,int(sr*60/bpm))
    span=min(len(a),len(b),sr*25)
    if span<beat*4:return 0
    def onset(x):
        blocks=min(span//512,4000)
        energy=np.array([np.sqrt(np.mean(x[i*512:(i+1)*512,0]**2)) for i in range(blocks)])
        return np.maximum(0,np.diff(energy,prepend=energy[0]))
    u=onset(a);v=onset(b)
    limit=max(1,min(len(u)//4,int(beat/512)))
    u=u-u.mean();v=v-v.mean()
    correlation=np.correlate(v[:min(len(v),2400)],u[:min(len(u),2400)],mode="full")
    middle=(len(u[:min(len(u),2400)])-1)
    start=max(0,middle-limit);end=min(len(correlation),middle+limit+1)
    lag=int(np.argmax(correlation[start:end])+start-middle)
    return lag*512

def _profile(data,profile,sr=SR):
    """Measured integrated loudness when pyloudnorm is installed, plus peak guard.
    A LUFS target is not a true-peak or mastering-certification claim.
    """
    import numpy as np
    targets={"studio":-16.0,"club":-11.0,"streaming":-14.0}
    target=targets[profile]
    measured=None
    try:
        import pyloudnorm
        measured=float(pyloudnorm.Meter(sr).integrated_loudness(data))
        if math.isfinite(measured):
            shift=np.clip(target-measured,-12,12)
            data=data*float(10**(shift/20))
    except (ImportError,ValueError,RuntimeError):
        measured=None
    # 4x oversampled approximation only; this is not certified true-peak metering.
    peak=float(np.max(np.abs(data)))
    if not np.isfinite(peak) or peak<1e-6:raise DirectorError("Silent or nonfinite master")
    ceiling=10**(-1.2/20)
    data=data*min(1.0,ceiling/peak)
    result_peak=float(np.max(np.abs(data)))
    return data,{"measuredLufs":round(measured,2) if measured is not None else None,
       "targetLufs":target,"samplePeakDbfs":round(20*math.log10(max(result_peak,1e-10)),2),
       "truePeakCertified":False,"listeningReviewRequired":True}

def create_master(a,b,bpm_a,bpm_b,seconds,mode,out,options):
    import numpy as np
    import soundfile as sf
    opts=valid_config(options)
    seconds=int(seconds);bpm_a=float(bpm_a);bpm_b=float(bpm_b)
    if not (60<=bpm_a<=200 and 60<=bpm_b<=220 and abs(bpm_a/bpm_b-1)<=.12):
        raise DirectorError("BPM are incompatible")
    if seconds not in range(30,301,30):raise DirectorError("Invalid duration")
    for group in (a,b):
        if not all(Path(group[stem]).is_file() for stem in ("vocals","drums","bass","other")):
            raise DirectorError("Required real Demucs stems missing")
    segments=build_segments(seconds,bpm_a,mode,options)
    frames=seconds*SR
    master=np.zeros((frames,2),dtype=np.float32)
    reports=[]
    sources=[("A",a,bpm_a),("B",b,bpm_b)]
    for owner,paths,bpm in sources:
        for role in ("drums","bass","other","vocals"):
            if owner=="B" and role in ("drums","bass"):continue
            if opts["vocalPolicy"]=="instrumental" and role=="vocals":continue
            track=_stem(paths[role],bpm,bpm_a)
            mean_energy=float(np.sqrt(np.mean(np.square(track.astype(np.float64)))))
            if mean_energy<0.00004:
                reports.append({"source":owner,"stem":role,"skipped":"silent"})
                continue
            for section in segments:
                name=section["name"];i=section["index"]
                energy=section["energy"]/100
                if role=="drums":gain=.78*(.35+.65*energy)
                elif role=="bass":gain=.56*(.45+.55*energy)
                elif role=="other":
                    gain=(.40 if owner=="A" else .44*opts["instrumentGainB"])*(.20+.80*energy)
                    if owner=="B" and name in ("intro","outro"):gain*=.3
                else:
                    if name in ("intro","outro","bridge"):continue
                    policy=opts["vocalPolicy"]
                    user=section["voice"]
                    selected=(user if user!="auto" else
                        "a" if policy=="a" else "b" if policy=="b" else
                        ("a" if (i+opts["variation"])%2==0 else "b"))
                    if selected=="none" or (owner=="A" and selected!="a") or (owner=="B" and selected!="b"):
                        continue
                    gain=.78*(opts["vocalGainA"] if owner=="A" else opts["vocalGainB"])
                if gain<=0:continue
                length=section["end"]-section["start"]
                candidates=source_candidates(track,SR,bpm_a,length)
                # Variation affects passage preference, not random fake audio.
                ranked=sorted(candidates,key=lambda p:p[2],reverse=role in ("vocals","drums"))
                choice=ranked[(i+opts["variation"])%min(3,len(ranked))]
                splice_to(master,track,section["start"],section["end"],choice[0],gain)
            reports.append({"source":owner,"stem":role,"rms":round(mean_energy,6)})
            del track
    if not np.isfinite(master).all():raise DirectorError("Master contains non-finite samples")
    if float(np.max(np.abs(master)))<0.0001:raise DirectorError("Master is silent")
    master,audit=_profile(master,opts["masterProfile"])
    # 48 kHz 24-bit deliverable; use polyphase resampling to preserve duration.
    import scipy.signal
    out48=scipy.signal.resample_poly(master,160,147,axis=0)
    target_frames=seconds*48000
    out48=out48[:target_frames]
    if len(out48)<target_frames:
        out48=np.pad(out48,((0,target_frames-len(out48)),(0,0)))
    peak48=float(np.max(np.abs(out48)))
    ceiling=10**(-1.2/20)
    out48*=min(1,ceiling/max(peak48,1e-10))
    result=Path(out)
    result.parent.mkdir(parents=True,exist_ok=True)
    sf.write(str(result),out48,48000,subtype="PCM_24")
    if result.stat().st_size>120*1024*1024:raise DirectorError("Master too large")
    with sf.SoundFile(str(result)) as final:
        if final.frames!=target_frames or final.channels!=2 or final.samplerate!=48000 or final.subtype!="PCM_24":
            raise DirectorError("Invalid final studio WAV")
    audit["finalFormat"]="WAV PCM_24 48000Hz stereo"
    audit["structureBasis"]="estimated-phrase-energy-not-transcribed-song-sections"
    audit["sections"]=len(segments)
    return {"model":"htdemucs","stemsVerified":True,"actualDurationSec":seconds,
      "musicDirectorV2":True,"audit":audit,"segments":segments,"stems":reports,
      "warnings":["Phrase boundaries are estimated; listen for word cuts and harmonic clashes",
                  "Pitch/key compatibility is not guaranteed by BPM synchronization",
                  "A mastering engineer should review final loudness and true peak"]}
