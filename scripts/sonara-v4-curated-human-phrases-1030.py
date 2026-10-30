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
import urllib.error
import urllib.parse
import urllib.request
import time

ROOT=pathlib.Path("/marimo/SONARA-LORA-DATASET")
DATASET=ROOT/"dataset.json"
OUT=ROOT/"phrase-human-v4-curated"
CACHE=OUT/"_source_cache"
COMMONS_API="https://commons.wikimedia.org/w/api.php"
UA="SONARA-Physical-Realism-V4-Curated/1.0"

COMMONS_SOURCES=[
    {
        "family":"acoustic-drums",
        "title":"File:Drums.ogg",
        "clips":[5,35,65,95,125,155,185,215,245,275,305],
        "prompt":"Real human drum-kit performance phrase with natural groove, changing stick velocity, ghost-note and accent variation, non-identical transients, cymbal/skin decay and continuous room response."
    },
    {
        "family":"acoustic-drums",
        "title":"File:Drum - Cadence B.ogg",
        "clips":[2,33,64],
        "prompt":"Real human drum cadence phrase with physical stick articulation, changing accents, realistic rebound, non-identical repeated hits, phrase-level dynamics and natural drum resonance."
    },
    {
        "family":"piano-keys",
        "title":"File:George Gershwin's \"Rhapsody in Blue\" piano solo.mp3",
        "clips":[30,150,270,390,510,630,750],
        "prompt":"Real human piano performance phrase with expressive microtiming, velocity-shaped hammer attacks, physically playable voicings, pedal continuity, natural key releases and register-dependent resonance."
    },
    {
        "family":"piano-keys",
        "title":"File:Rimsky-Korsakov - Scheherazade - 1. Largo e maestoso for Piano solo.ogg",
        "clips":[20,90,160,230,300,370,440],
        "prompt":"Real human piano performance phrase with phrase-shaped dynamics, varied attack weight, pedal and release continuity, natural resonance, playable voicings and connected musical phrasing."
    },
]CLIP_SECONDS=24.0
URMP_EXTRA_PER_FAMILY={"bass":4,"bowed-strings":4,"brass-woodwinds":4}
ALLOWED_LICENSE_MARKERS=("cc0","public domain","public-domain","pd-","pdm")

def sha256(path:pathlib.Path)->str:
    h=hashlib.sha256()
    with path.open("rb") as f:
        while True:
            b=f.read(1024*1024)
            if not b:
                break
            h.update(b)
    return h.hexdigest()

def request_json(params):
    url=COMMONS_API+"?"+urllib.parse.urlencode(params)
    req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"application/json"})
    with urllib.request.urlopen(req,timeout=90) as r:
        return json.loads(r.read().decode("utf-8"))

def meta_text(meta,key):
    value=meta.get(key,{})
    if isinstance(value,dict):
        value=value.get("value","")
    return re.sub(r"<[^>]+>"," ",html.unescape(str(value or ""))).strip()

def commons_source(title):
    data=request_json({
        "action":"query","format":"json","titles":title,
        "prop":"imageinfo","iiprop":"url|mime|size|extmetadata"
    })
    pages=(data.get("query") or {}).get("pages") or {}
    if not pages:
        raise RuntimeError("COMMONS_PAGE_MISSING="+title)
    page=next(iter(pages.values()))
    infos=page.get("imageinfo") or []
    if not infos:
        raise RuntimeError("COMMONS_IMAGEINFO_MISSING="+title)
    info=infos[0]
    meta=info.get("extmetadata") or {}
    license_short=meta_text(meta,"LicenseShortName")
    license_name=meta_text(meta,"License")
    license_url=meta_text(meta,"LicenseUrl")
    copyrighted=meta_text(meta,"Copyrighted").lower()
    blob=" ".join([license_short,license_name,license_url]).lower()
    license_ok=any(marker in blob for marker in ALLOWED_LICENSE_MARKERS) or copyrighted in {"false","0","no"}
    if not license_ok:
        raise RuntimeError("COMMONS_LICENSE_NOT_ALLOWED="+title+":"+license_short)
    url=str(info.get("url") or "")
    if not url:
        raise RuntimeError("COMMONS_MEDIA_URL_MISSING="+title)
    redirect="https://commons.wikimedia.org/wiki/Special:Redirect/file/"+urllib.parse.quote(title.removeprefix("File:").replace(" ","_"),safe="()_-'%22")
    return {
        "url":url,
        "fallback_url":redirect,
        "license":license_short or license_name or "Public domain / CC0",
        "license_url":license_url,
        "artist":meta_text(meta,"Artist"),
        "credit":meta_text(meta,"Credit"),
        "description":meta_text(meta,"ImageDescription"),
        "page":"https://commons.wikimedia.org/wiki/"+urllib.parse.quote(title.replace(" ","_"),safe=":/_'\""),
    }

def download(url,path,fallback_url=None,attempts=10):
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.is_file() and path.stat().st_size>=100000:
        print("COMMONS_SOURCE_CACHE_HIT="+path.name,flush=True)
        return

    urls=[url]
    if fallback_url and fallback_url not in urls:
        urls.append(fallback_url)
    last=None
    for attempt in range(1,attempts+1):
        candidate=urls[(attempt-1)%len(urls)]
        part=path.with_suffix(path.suffix+".part")
        part.unlink(missing_ok=True)
        try:
            req=urllib.request.Request(
                candidate,
                headers={
                    "User-Agent":UA,
                    "Accept":"audio/*,video/*,application/octet-stream,*/*;q=0.1",
                    "Accept-Encoding":"identity",
                    "Cache-Control":"no-cache",
                    "Referer":"https://commons.wikimedia.org/",
                },
            )
            with urllib.request.urlopen(req,timeout=300) as r, part.open("wb") as out:
                while True:
                    b=r.read(2*1024*1024)
                    if not b:
                        break
                    out.write(b)
            if part.stat().st_size<100000:
                raise RuntimeError("SOURCE_TOO_SMALL="+str(part))
            part.replace(path)
            print("COMMONS_DOWNLOAD_OK="+path.name+" ATTEMPT="+str(attempt),flush=True)
            return
        except urllib.error.HTTPError as exc:
            last=exc
            part.unlink(missing_ok=True)
            if exc.code==429:
                raw=str(exc.headers.get("Retry-After") or "").strip()
                try:
                    delay=max(5,min(120,int(raw)))
                except Exception:
                    delay=min(120,10*attempt)
                print("COMMONS_HTTP_429_RETRY="+str(attempt)+"/"+str(attempts)+" DELAY_SECONDS="+str(delay),flush=True)
                time.sleep(delay)
                continue
            if exc.code in (500,502,503,504):
                delay=min(60,5*attempt)
                print("COMMONS_HTTP_RETRY="+str(exc.code)+" ATTEMPT="+str(attempt)+" DELAY_SECONDS="+str(delay),flush=True)
                time.sleep(delay)
                continue
            raise
        except Exception as exc:
            last=exc
            part.unlink(missing_ok=True)
            if attempt>=attempts:
                break
            delay=min(60,5*attempt)
            print("COMMONS_DOWNLOAD_RETRY="+str(attempt)+"/"+str(attempts)+" ERROR="+type(exc).__name__+" DELAY_SECONDS="+str(delay),flush=True)
            time.sleep(delay)
    raise RuntimeError("COMMONS_DOWNLOAD_FAILED_AFTER_RETRIES="+type(last).__name__)

def probe_duration(path):
    r=subprocess.run([
        "ffprobe","-v","error","-show_entries","format=duration",
        "-of","default=noprint_wrappers=1:nokey=1",str(path)
    ],text=True,capture_output=True,check=True)
    return float(r.stdout.strip())

def make_clip(src,dest,start,duration=CLIP_SECONDS):
    total=probe_duration(src)
    if start<0 or start+duration>total+0.25:
        raise RuntimeError(f"CLIP_RANGE_INVALID={src.name}:{start}+{duration}>{total}")
    dest.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run([
        "ffmpeg","-y","-v","error","-ss",f"{start:.3f}","-i",str(src),
        "-t",f"{duration:.3f}","-ar","48000","-ac","2","-c:a","pcm_s24le",str(dest)
    ],check=True)
    if not dest.is_file() or dest.stat().st_size<100000:
        raise RuntimeError("CLIP_CREATE_FAILED="+str(dest))

def add_commons(rows):
    rows=[r for r in rows if str(r.get("dataset_stage") or "")!="phrase-human-v4-curated-commons"]
    (OUT/"commons").mkdir(parents=True,exist_ok=True)
    added=[]
    for source_index,spec in enumerate(COMMONS_SOURCES,1):
        meta=commons_source(spec["title"])
        suffix=pathlib.Path(urllib.parse.urlparse(meta["url"]).path).suffix or ".bin"
        cache_name=hashlib.sha256(spec["title"].encode("utf-8")).hexdigest()[:16]+suffix
        src=CACHE/cache_name
        CACHE.mkdir(parents=True,exist_ok=True)
        try:
            download(meta["url"],src,meta.get("fallback_url"))
            total=probe_duration(src)
            print(f"V4_COMMONS_SOURCE_OK={spec['family']}:{spec['title']} DURATION={total:.2f} LICENSE={meta['license']}",flush=True)
            for local_idx,start in enumerate(spec["clips"],1):
                dest=OUT/"commons"/spec["family"]/f"{source_index:02d}_{local_idx:02d}.wav"
                make_clip(src,dest,float(start))
                row={
                    "audio_path":str(dest.relative_to(ROOT)),
                    "prompt_override":spec["prompt"],
                    "genre":"Human Performance Phrase",
                    "subgenre":"Curated Wikimedia Commons performance",
                    "instrument_family":spec["family"],
                    "license_type":"CC0_PUBLIC_DOMAIN",
                    "rights_to_train":True,
                    "synthetic":False,
                    "bpm":None,
                    "key":"",
                    "time_signature":"4",
                    "performance_type":"phrase_level",
                    "promotion_eligible":True,
                    "custom_tag":"<SONARA_PHYSICAL_REALISM>",
                    "dataset_stage":"phrase-human-v4-curated-commons",
                    "source":"Wikimedia Commons",
                    "source_title":spec["title"],
                    "source_url":meta["url"],
                    "source_page":meta["page"],
                    "source_license":meta["license"],
                    "source_license_url":meta["license_url"],
                    "source_artist":meta["artist"],
                    "source_credit":meta["credit"],
                    "source_description":meta["description"],
                    "training_clip_start_seconds":float(start),
                    "training_clip_seconds":CLIP_SECONDS,
                    "sha256":sha256(dest),
                }
                rows.append(row)
                added.append(row)
                print(f"V4_COMMONS_PHRASE_ADDED={spec['family']}:{len([x for x in added if x['instrument_family']==spec['family']])}",flush=True)
        finally:
            pass
    return rows,added

def intervals_overlap(a,b):
    return max(a[0],b[0]) < min(a[1],b[1])

def choose_extra_intervals(rows,family,count):
    source_rows=[
        r for r in rows
        if str(r.get("dataset_stage") or "")=="phrase-human-v7-urmp-hf"
        and str(r.get("instrument_family") or "")==family
        and str(r.get("transport_mirror_url") or "")
    ]
    if not source_rows:
        raise RuntimeError("URMP_BASE_ROWS_MISSING="+family)

    groups={}
    for r in source_rows:
        url=str(r["transport_mirror_url"])
        g=groups.setdefault(url,{
            "rows":[],
            "duration":float(r.get("source_duration_seconds") or 0),
            "used":[],
        })
        g["rows"].append(r)
        start=float(r.get("training_clip_start_seconds") or 0)
        length=float(r.get("training_clip_seconds") or CLIP_SECONDS)
        g["used"].append((start,start+length))

    picks=[]
    for url,g in groups.items():
        total=float(g["duration"])
        starts=[]
        cursor=0.0
        while cursor+CLIP_SECONDS<=total-0.25:
            starts.append(cursor)
            cursor+=CLIP_SECONDS+1.0
        for start in starts:
            interval=(start,start+CLIP_SECONDS)
            if any(intervals_overlap(interval,u) for u in g["used"]):
                continue
            if any(p["url"]==url and intervals_overlap(interval,p["interval"]) for p in picks):
                continue
            picks.append({"url":url,"start":start,"interval":interval,"template":g["rows"][0]})
            if len(picks)>=count:
                return picks
    raise RuntimeError(f"URMP_EXTRA_INTERVALS_INSUFFICIENT={family}:{len(picks)}/{count}")

def add_urmp_extra(rows):
    rows=[r for r in rows if str(r.get("dataset_stage") or "")!="phrase-human-v4-curated-urmp-extra"]
    if OUT.joinpath("urmp-extra").exists():
        shutil.rmtree(OUT/"urmp-extra")
    added=[]
    for family,count in URMP_EXTRA_PER_FAMILY.items():
        picks=choose_extra_intervals(rows,family,count)
        cache={}
        try:
            for idx,pick in enumerate(picks,1):
                url=pick["url"]
                if url not in cache:
                    with tempfile.NamedTemporaryFile(prefix="sonara_v4_urmp_",suffix=".wav",delete=False) as tmp:
                        src=pathlib.Path(tmp.name)
                    download(url,src)
                    cache[url]=src
                src=cache[url]
                dest=OUT/"urmp-extra"/family/f"{idx:02d}.wav"
                make_clip(src,dest,float(pick["start"]))
                base=dict(pick["template"])
                row={
                    **base,
                    "audio_path":str(dest.relative_to(ROOT)),
                    "dataset_stage":"phrase-human-v4-curated-urmp-extra",
                    "training_clip_start_seconds":float(pick["start"]),
                    "training_clip_seconds":CLIP_SECONDS,
                    "sha256":sha256(dest),
                }
                rows.append(row)
                added.append(row)
                print(f"V4_URMP_EXTRA_PHRASE_ADDED={family}:{idx}/{count} START={pick['start']}",flush=True)
        finally:
            for src in cache.values():
                src.unlink(missing_ok=True)
    return rows,added

def main():
    if not DATASET.is_file():
        raise SystemExit("DATASET_JSON_MISSING")
    if not shutil.which("ffmpeg") or not shutil.which("ffprobe"):
        raise SystemExit("FFMPEG_OR_FFPROBE_MISSING")
    rows=json.loads(DATASET.read_text(encoding="utf-8"))
    if not isinstance(rows,list):
        raise SystemExit("DATASET_JSON_INVALID")

    rows,commons_added=add_commons(rows)
    rows,urmp_added=add_urmp_extra(rows)
    DATASET.write_text(json.dumps(rows,indent=2)+"\n",encoding="utf-8")

    phrase_counts={}
    for r in rows:
        if str(r.get("performance_type") or "").lower() in {"phrase","phrase_level","performance","full_performance"} and not bool(r.get("synthetic",False)):
            fam=str(r.get("instrument_family") or "unknown")
            phrase_counts[fam]=phrase_counts.get(fam,0)+1

    report={
        "version":"sonara-physical-realism-v4-curated-human-phrases",
        "commonsAdded":len(commons_added),
        "urmpExtraAdded":len(urmp_added),
        "totalAdded":len(commons_added)+len(urmp_added),
        "datasetRows":len(rows),
        "phraseFamilyCounts":phrase_counts,
        "expectedDatasetRows":320,
        "licensePolicy":"Wikimedia Commons CC0/Public Domain plus URMP CC0 only.",
    }
    (ROOT/"sonara_v4_curated_phrase_report.json").write_text(json.dumps(report,indent=2)+"\n",encoding="utf-8")

    print("V4_CURATED_COMMONS_ADDED="+str(len(commons_added)),flush=True)
    print("V4_CURATED_URMP_EXTRA_ADDED="+str(len(urmp_added)),flush=True)
    print("V4_CURATED_TOTAL_ADDED="+str(report["totalAdded"]),flush=True)
    print("V4_DATASET_ROWS_AFTER_CURATED="+str(len(rows)),flush=True)
    print("V4_PHRASE_FAMILY_COUNTS="+json.dumps(phrase_counts,separators=(",",":")),flush=True)
    if len(commons_added)!=28 or len(urmp_added)!=12 or len(rows)!=320:
        raise SystemExit("V4_CURATED_COUNT_GATE_FAILED")
    required={"acoustic-drums":14,"piano-keys":14,"guitars-fretted":12,"bass":8,"bowed-strings":8,"brass-woodwinds":8}
    if any(int(phrase_counts.get(k) or 0)<v for k,v in required.items()):
        raise SystemExit("V4_CURATED_PHRASE_GATE_FAILED")
    print("V4_CURATED_PHRASE_GATE_PASSED=True",flush=True)

if __name__=="__main__":
    main()
