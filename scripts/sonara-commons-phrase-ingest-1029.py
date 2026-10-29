#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import html
import json
import pathlib
import re
import shutil
import subprocess
import tempfile
import urllib.parse
import urllib.request

ROOT=pathlib.Path("/marimo/SONARA-LORA-DATASET")
DATASET=ROOT/"dataset.json"
OUT=ROOT/"commons-phrase-v1"
API="https://commons.wikimedia.org/w/api.php"
UA="SONARA-Physical-Realism-Phrase-Ingest/1.0 (Wikimedia Commons; provenance-preserving)"

TARGETS={
    "acoustic-drums":{
        "count":4,
        "queries":["drum solo performance", "drummer solo", "snare drum solo", "percussion solo performance", "tabla solo performance"],
        "prompt":"Real human acoustic drum or percussion phrase with natural groove, limb-plausible coordination, dynamic accents, ghost-note variation, cymbal/skin decay and continuous room response.",
    },
    "piano-keys":{
        "count":4,
        "queries":["piano solo performance", "piano improvisation performance", "piano recital solo"],
        "prompt":"Real human piano phrase with expressive timing, velocity-shaped hammer attacks, pedal continuity, natural key releases, register-dependent resonance and physically playable voicings.",
    },
    "guitars-fretted":{
        "count":4,
        "queries":["classical guitar solo performance", "acoustic guitar solo performance", "guitar improvisation performance", "guitar recital solo"],
        "prompt":"Real human guitar phrase with playable fretboard motion, pick/finger variation, natural string order, chord releases, fret/string resonance and phrase-level timing.",
    },
    "bass":{
        "count":4,
        "queries":["double bass solo performance", "contrabass solo performance", "upright bass solo performance", "bass guitar solo performance"],
        "prompt":"Real human bass phrase with physical string attack, finger/pick variation, natural note lengths, playable position changes, slides and coherent low-end body resonance.",
    },
    "bowed-strings":{
        "count":4,
        "queries":["violin solo performance", "cello solo performance", "viola solo performance", "violin recital solo"],
        "prompt":"Real human bowed-string phrase with natural bow changes, connected legato, position shifts, phrase-shaped vibrato, dynamic bow pressure/speed and resonant wooden body.",
    },
    "brass-woodwinds":{
        "count":4,
        "queries":["flute solo performance", "clarinet solo performance", "saxophone solo performance", "trumpet solo performance", "trombone solo performance", "oboe solo performance"],
        "prompt":"Real human brass or woodwind phrase with breath-capacity phrasing, idiomatic articulation, register-dependent timbre, natural pitch connections and expressive dynamics.",
    },
}

FAMILY_EVIDENCE={
    "acoustic-drums":[
        "drum","drums","drummer","drumset","drum set","percussion","percussionist",
        "snare","tom-tom","tom tom","cajon","cajón","bongo","conga","tabla","darbuka",
        "tambourine","shaker","timpani","marimba","vibraphone"
    ],
    "piano-keys":["piano","pianoforte","pianist","fortepiano","rhodes","wurlitzer","clavinet"],
    "guitars-fretted":[
        "guitar","guitarra","guitare","gitarre","guitarist","lute","mandolin","ukulele",
        "oud","sitar"
    ],
    "bass":[
        "double bass","contrabass","contrabasso","upright bass","bass guitar",
        "electric bass","bassist","bass solo"
    ],
    "bowed-strings":[
        "violin","violino","violinist","viola","violist","cello","violoncello",
        "cellist","bowed string"
    ],
    "brass-woodwinds":[
        "flute","flaut","flauto","flutist","clarinet","clarinett","saxophone","sax",
        "trumpet","trombone","oboe","bassoon","fagott","french horn","horn solo",
        "woodwind","brass solo"
    ],
}

PERFORMANCE_EVIDENCE=[
    "solo","improvis","performance","recital","exercise","etude","étude","study",
    "practice","demonstration","demo","phrase","riff","groove","cadence","cadenza",
    "excerpt","movement","session"
]

FULL_MIX_BLOCKLIST=[
    "orchestra","orchestral","his gang","and his orchestra","ensemble","quartet",
    "quintet","sextet","septet","octet","band","choir","chorus","opera","symphony",
    "concerto with orchestra","full mix","song","recording of"
]

def _text_blob(candidate):
    meta=candidate.get("meta") or {}
    values=[
        candidate.get("title",""),
        meta_value(meta,"ImageDescription"),
        meta_value(meta,"ObjectName"),
        meta_value(meta,"Credit"),
        meta_value(meta,"Artist"),
        meta_value(meta,"Categories"),
    ]
    return " ".join(str(v or "") for v in values).lower()

def candidate_matches_family(candidate,family):
    blob=_text_blob(candidate)
    if any(block in blob for block in FULL_MIX_BLOCKLIST):
        # Allow orchestral terms only when the title/description explicitly foregrounds
        # the target instrument and says solo.
        instrument_ok=any(term in blob for term in FAMILY_EVIDENCE[family])
        solo_ok="solo" in blob
        if not (instrument_ok and solo_ok):
            return False
    instrument_ok=any(term in blob for term in FAMILY_EVIDENCE[family])
    performance_ok=any(term in blob for term in PERFORMANCE_EVIDENCE)
    return instrument_ok and performance_ok

def canonical_performance_key(candidate):
    title=str(candidate.get("title") or "").lower()
    title=title.removeprefix("file:")
    title=re.sub(r"\.(wav|flac|mp3|ogg|oga|opus|m4a|aac)$","",title)
    title=re.sub(r"[^a-z0-9]+"," ",title).strip()
    return title


def request_json(params, timeout=60):
    query=urllib.parse.urlencode(params)
    req=urllib.request.Request(
        API+"?"+query,
        headers={"User-Agent":UA,"Accept":"application/json"},
    )
    with urllib.request.urlopen(req,timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))

def clean_html(value):
    if isinstance(value,dict):
        value=value.get("value","")
    text=html.unescape(str(value or ""))
    return re.sub(r"<[^>]+>"," ",text).replace("\n"," ").strip()

def meta_value(meta,key):
    value=meta.get(key,{})
    return clean_html(value)

def license_ok(meta):
    short=meta_value(meta,"LicenseShortName").lower()
    license_name=meta_value(meta,"License").lower()
    usage=meta_value(meta,"UsageTerms").lower()
    license_url=meta_value(meta,"LicenseUrl").lower()
    copyrighted=meta_value(meta,"Copyrighted").lower()

    cc0_signal=(
        "cc0" in short
        or "cc-zero" in license_name
        or "publicdomain/zero/1.0" in license_url
        or "creative commons cc0" in usage
    )
    public_domain_signal=(
        "public domain" in short
        or "public domain" in usage
        or license_name in {"pd","public-domain","public domain"}
    )
    explicitly_not_copyrighted=copyrighted in {"false","0","no",""}
    return cc0_signal or (public_domain_signal and explicitly_not_copyrighted)

def _search_file_titles(term, limit=120):
    titles=[]
    sroffset=None
    while len(titles)<limit:
        params={
            "action":"query",
            "format":"json",
            "list":"search",
            "srsearch":f"{term} filetype:audio",
            "srnamespace":"6",
            "srlimit":"50",
        }
        if sroffset is not None:
            params["sroffset"]=str(sroffset)
        data=request_json(params)
        batch=((data.get("query") or {}).get("search") or [])
        for item in batch:
            title=str(item.get("title") or "")
            if title and title not in titles:
                titles.append(title)
                if len(titles)>=limit:
                    break
        cont=data.get("continue") or {}
        if "sroffset" not in cont or not batch:
            break
        sroffset=cont["sroffset"]
    return titles


def _category_file_titles(term, limit=120):
    # Fallback: search relevant Commons categories, then enumerate file members.
    data=request_json({
        "action":"query",
        "format":"json",
        "list":"search",
        "srsearch":term,
        "srnamespace":"14",
        "srlimit":"10",
    })
    categories=[str(x.get("title") or "") for x in ((data.get("query") or {}).get("search") or [])]
    titles=[]
    for category in categories:
        cmcontinue=None
        while len(titles)<limit:
            params={
                "action":"query",
                "format":"json",
                "list":"categorymembers",
                "cmtitle":category,
                "cmnamespace":"6",
                "cmlimit":"100",
                "cmtype":"file",
            }
            if cmcontinue:
                params["cmcontinue"]=cmcontinue
            page=request_json(params)
            members=((page.get("query") or {}).get("categorymembers") or [])
            for item in members:
                title=str(item.get("title") or "")
                if title and title not in titles:
                    titles.append(title)
                    if len(titles)>=limit:
                        break
            cont=page.get("continue") or {}
            cmcontinue=cont.get("cmcontinue")
            if not cmcontinue or not members:
                break
        if len(titles)>=limit:
            break
    return titles


def _fetch_file_infos(titles):
    out=[]
    for offset in range(0,len(titles),25):
        batch=titles[offset:offset+25]
        data=request_json({
            "action":"query",
            "format":"json",
            "titles":"|".join(batch),
            "prop":"imageinfo",
            "iiprop":"url|mime|mediatype|size|extmetadata",
        })
        pages=(data.get("query") or {}).get("pages") or {}
        for page in pages.values():
            infos=page.get("imageinfo") or []
            if not infos:
                continue
            info=infos[0]
            meta=info.get("extmetadata") or {}
            url=str(info.get("url") or "")
            mime=str(info.get("mime") or "").lower()
            title=str(page.get("title") or "")
            suffix=pathlib.Path(urllib.parse.urlparse(url).path).suffix.lower()
            audio_like=(
                mime.startswith("audio/")
                or suffix in {".wav",".flac",".mp3",".ogg",".oga",".opus",".m4a",".aac"}
            )
            if not audio_like:
                continue
            out.append({
                "title":title,
                "url":url,
                "mime":mime,
                "mediatype":str(info.get("mediatype") or ""),
                "size":info.get("size"),
                "meta":meta,
            })
    return out


def query_candidates(term,family):
    titles=_search_file_titles(term,120)
    direct_infos=_fetch_file_infos(titles)
    direct_audio=len(direct_infos)
    accepted=[
        item for item in direct_infos
        if license_ok(item["meta"]) and candidate_matches_family(item,family)
    ]

    print(
        "COMMONS_SEARCH="
        +term
        +" FILE_HITS="+str(len(titles))
        +" AUDIO_HITS="+str(direct_audio)
        +" STRICT_MATCHES="+str(len(accepted)),
        flush=True,
    )

    if len(accepted)>=8:
        return accepted

    category_titles=_category_file_titles(term,120)
    category_infos=_fetch_file_infos(category_titles)
    existing={item["url"] for item in accepted}
    for item in category_infos:
        if item["url"] in existing:
            continue
        if license_ok(item["meta"]) and candidate_matches_family(item,family):
            accepted.append(item)
            existing.add(item["url"])

    print(
        "COMMONS_CATEGORY_FALLBACK="
        +term
        +" FILE_HITS="+str(len(category_titles))
        +" AUDIO_HITS="+str(len(category_infos))
        +" STRICT_MATCHES_TOTAL="+str(len(accepted)),
        flush=True,
    )
    return accepted


def sha256(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            chunk=f.read(1024*1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def run_capture(cmd):
    return subprocess.run(cmd,text=True,capture_output=True,check=True)

def duration_seconds(path):
    p=run_capture([
        "ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1",str(path)
    ])
    return float(p.stdout.strip())

def transcode_phrase(src,dest,duration):
    if duration < 12.0:
        return False
    clip=min(24.0,duration)
    if duration > clip+3:
        start=min(max(1.0,duration*0.20),duration-clip-1.0)
    else:
        start=0.0
    dest.parent.mkdir(parents=True,exist_ok=True)
    cmd=[
        "ffmpeg","-y","-v","error",
        "-ss",f"{start:.3f}","-i",str(src),
        "-t",f"{clip:.3f}",
        "-ar","48000","-ac","2",
        "-c:a","pcm_s24le",
        str(dest)
    ]
    subprocess.run(cmd,check=True)
    return dest.is_file() and dest.stat().st_size>100000

def download(url,path):
    req=urllib.request.Request(url,headers={"User-Agent":UA})
    with urllib.request.urlopen(req,timeout=180) as response, open(path,"wb") as out:
        while True:
            chunk=response.read(1024*1024)
            if not chunk:
                break
            out.write(chunk)

def load_dataset():
    if not DATASET.is_file():
        raise SystemExit("DATASET_JSON_MISSING")
    data=json.loads(DATASET.read_text(encoding="utf-8"))
    if not isinstance(data,list):
        raise SystemExit("DATASET_JSON_INVALID")
    return data

def main():
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise SystemExit("FFMPEG_OR_FFPROBE_MISSING")

    rows=load_dataset()
    # Rebuild phrase-v1 from scratch on every run. The previous loose-search
    # version admitted false positives and duplicate encodings.
    previous_phrase_rows=[r for r in rows if str(r.get("dataset_stage") or "")=="commons-phrase-v1"]
    rows=[r for r in rows if str(r.get("dataset_stage") or "")!="commons-phrase-v1"]
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True,exist_ok=True)
    print("REMOVED_PREVIOUS_PHRASE_ROWS="+str(len(previous_phrase_rows)),flush=True)
    existing_sources={str(r.get("source_url") or "") for r in rows if isinstance(r,dict)}
    existing_performances=set()

    added=[]
    audit=[]
    for family,spec in TARGETS.items():
        selected=0
        seen_urls=set()
        print("PHRASE_FAMILY="+family,flush=True)
        for term in spec["queries"]:
            if selected>=spec["count"]:
                break
            try:
                candidates=query_candidates(term,family)
            except Exception as exc:
                audit.append({"family":family,"query":term,"status":"query_error","error":str(exc)})
                continue
            print("QUERY="+term+" CANDIDATES="+str(len(candidates)),flush=True)
            for cand in candidates:
                if selected>=spec["count"]:
                    break
                url=str(cand["url"])
                performance_key=canonical_performance_key(cand)
                if url in seen_urls or url in existing_sources or performance_key in existing_performances:
                    continue
                seen_urls.add(url)

                title=str(cand["title"])
                suffix=pathlib.Path(urllib.parse.urlparse(url).path).suffix or ".bin"
                tmp_src=None
                try:
                    with tempfile.NamedTemporaryFile(prefix="sonara_commons_",suffix=suffix,delete=False) as tmp:
                        tmp_src=pathlib.Path(tmp.name)
                    download(url,tmp_src)
                    if tmp_src.stat().st_size<100000:
                        raise RuntimeError("source_too_small")
                    dur=duration_seconds(tmp_src)
                    if dur<12.0:
                        audit.append({"family":family,"title":title,"url":url,"status":"rejected_short","duration":dur})
                        continue

                    safe_name=re.sub(r"[^A-Za-z0-9._-]+","_",pathlib.Path(title.replace("File:","")).stem)[:80]
                    dest=OUT/family/f"{selected+1:02d}_{safe_name}.wav"
                    if not transcode_phrase(tmp_src,dest,dur):
                        raise RuntimeError("transcode_failed")

                    meta=cand["meta"]
                    license_short=meta_value(meta,"LicenseShortName")
                    license_url=meta_value(meta,"LicenseUrl")
                    artist=meta_value(meta,"Artist")
                    credit=meta_value(meta,"Credit")
                    description=meta_value(meta,"ImageDescription")
                    row={
                        "audio_path":str(dest.relative_to(ROOT)),
                        "prompt_override":spec["prompt"],
                        "genre":"Human Performance Phrase",
                        "subgenre":family,
                        "instrument_family":family,
                        "license_type":"CC0_PUBLIC_DOMAIN",
                        "rights_to_train":True,
                        "synthetic":False,
                        "bpm":None,
                        "key":"",
                        "time_signature":"4",
                        "performance_type":"phrase_level",
                        "custom_tag":"<SONARA_PHYSICAL_REALISM>",
                        "dataset_stage":"commons-phrase-v1",
                        "source":"Wikimedia Commons",
                        "source_title":title,
                        "source_url":url,
                        "source_page":"https://commons.wikimedia.org/wiki/"+urllib.parse.quote(title.replace(" ","_"),safe=":/_"),
                        "source_license":license_short,
                        "source_license_url":license_url,
                        "source_artist":artist,
                        "source_credit":credit,
                        "source_description":description,
                        "source_duration_seconds":round(dur,3),
                        "training_clip_seconds":round(min(24.0,dur),3),
                        "sha256":sha256(dest),
                    }
                    rows.append(row)
                    added.append(row)
                    existing_sources.add(url)
                    existing_performances.add(performance_key)
                    selected+=1
                    print("PHRASE_ACCEPTED="+family+":"+str(selected)+"/"+str(spec["count"])+" "+title,flush=True)
                except Exception as exc:
                    audit.append({"family":family,"title":title,"url":url,"status":"error","error":str(exc)})
                finally:
                    if tmp_src is not None:
                        tmp_src.unlink(missing_ok=True)

        if selected<spec["count"]:
            print("PHRASE_FAMILY_INCOMPLETE="+family+":"+str(selected)+"/"+str(spec["count"]),flush=True)

    DATASET.write_text(json.dumps(rows,indent=2)+"\n",encoding="utf-8")
    report={
        "version":"sonara-commons-phrase-v1",
        "target":24,
        "added":len(added),
        "complete":len(added)>=24,
        "families":{},
        "licensePolicy":"Only Wikimedia Commons files reporting CC0 or Public domain with Copyrighted=False are accepted.",
        "auditEntries":len(audit),
    }
    for row in added:
        fam=row["instrument_family"]
        report["families"][fam]=report["families"].get(fam,0)+1

    (ROOT/"commons_phrase_v1_report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")
    (ROOT/"commons_phrase_v1_audit.json").write_text(json.dumps(audit,indent=2)+"\n",encoding="utf-8")

    print("PHRASE_LEVEL_IMPORTED="+str(len(added)),flush=True)
    print("PHRASE_FAMILIES="+json.dumps(report["families"],separators=(",",":")),flush=True)
    print("DATASET_TOTAL_ROWS="+str(len(rows)),flush=True)
    print("PHRASE_GATE_COMPLETE="+str(report["complete"]),flush=True)
    print("NEXT_ACTION=RUN_DATASET_INTAKE",flush=True)

if __name__=="__main__":
    main()
