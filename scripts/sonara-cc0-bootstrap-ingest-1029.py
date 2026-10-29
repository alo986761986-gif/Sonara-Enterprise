#!/usr/bin/env python3
from __future__ import annotations
import hashlib
import json
import pathlib
import urllib.request
import zipfile

ROOT=pathlib.Path("/marimo/SONARA-LORA-DATASET")
CACHE=ROOT/"_downloads"
RAW_BASE="https://raw.githubusercontent.com/facebookincubator/Meta-open-sound/main"
COLLECTIONS=[
    {
        "id":"meta-piano",
        "family":"piano-keys",
        "release":"https://github.com/facebookincubator/Meta-open-sound/releases/download/meta-piano-v1.0.0/meta-open-sound-meta-piano-wav.zip",
        "sha256":"ee9023dbde849ecab393a098aa0cfbd6f2ef48d4a096b9c08808b72fc913f70e",
        "manifest":"systems/instruments/meta-piano/manifest.json",
        "count":32,
        "prompt":"Real upright piano performance source, 24-bit/48 kHz, with genuine hammer attack, register-specific string/body resonance, natural decay and four recorded velocity layers.",
    },
    {
        "id":"meta-nylon-guitar",
        "family":"guitars-fretted",
        "release":"https://github.com/facebookincubator/Meta-open-sound/releases/download/meta-nylon-guitar-v1.0.0/meta-open-sound-meta-nylon-guitar-wav.zip",
        "sha256":"e7fa168b97a72ecc1257917f85cb524fe7c2e1f098dfdcaf8f5c0e29cabe768e",
        "manifest":"systems/instruments/meta-nylon-guitar/manifest.json",
        "count":32,
        "prompt":"Real nylon-string guitar source, 24-bit/48 kHz, with genuine finger/pick dynamics, string resonance, position-dependent tone and natural decay.",
    },
    {
        "id":"meta-steel-guitar",
        "family":"guitars-fretted",
        "release":"https://github.com/facebookincubator/Meta-open-sound/releases/download/meta-steel-guitar-v1.0.0/meta-open-sound-meta-steel-guitar-wav.zip",
        "sha256":"caaa8a9c07217f4a82d1dfd9f5657c286155464b66bf4dd27797811c2558a909",
        "manifest":"systems/instruments/meta-steel-guitar/manifest.json",
        "count":32,
        "prompt":"Real steel-string acoustic guitar source, 24-bit/48 kHz, with authentic pick attack, string/fret resonance, dynamic layers and natural body decay.",
    },
]

def sha256_file(path):
    h=hashlib.sha256()
    with open(path,"rb") as f:
        while True:
            chunk=f.read(1024*1024)
            if not chunk:
                break
            h.update(chunk)
    return h.hexdigest()

def fetch_json(url):
    req=urllib.request.Request(url,headers={"User-Agent":"SONARA-CC0-Ingest/1.0"})
    with urllib.request.urlopen(req,timeout=60) as response:
        return json.loads(response.read().decode("utf-8"))

def download(url,path):
    req=urllib.request.Request(url,headers={"User-Agent":"SONARA-CC0-Ingest/1.0"})
    with urllib.request.urlopen(req,timeout=180) as response, open(path,"wb") as out:
        total=response.headers.get("Content-Length")
        read=0
        while True:
            chunk=response.read(1024*1024)
            if not chunk:
                break
            out.write(chunk)
            read+=len(chunk)
            if read%(100*1024*1024)<1024*1024:
                print(f"DOWNLOADED_MB={read//(1024*1024)}",flush=True)

def evenly_select(names,count):
    if len(names)<=count:
        return names
    picks=[]
    for i in range(count):
        idx=round(i*(len(names)-1)/(count-1))
        picks.append(names[idx])
    seen=set()
    return [x for x in picks if not (x in seen or seen.add(x))]

def main():
    ROOT.mkdir(parents=True,exist_ok=True)
    CACHE.mkdir(parents=True,exist_ok=True)
    rows=[]
    for col in COLLECTIONS:
        print("COLLECTION="+col["id"],flush=True)
        manifest=fetch_json(f'{RAW_BASE}/{col["manifest"]}')
        names=[str(item["file"]) for item in manifest.get("samples",[]) if isinstance(item,dict) and item.get("file")]
        selected=evenly_select(names,col["count"])
        archive=CACHE/(col["id"]+".zip")
        if not archive.is_file() or sha256_file(archive)!=col["sha256"]:
            if archive.exists():
                archive.unlink()
            print("DOWNLOAD_START="+col["release"],flush=True)
            download(col["release"],archive)
        digest=sha256_file(archive)
        if digest!=col["sha256"]:
            raise SystemExit(f'CHECKSUM_MISMATCH={col["id"]}:{digest}')
        print("CHECKSUM_OK="+col["id"],flush=True)

        target_dir=ROOT/col["id"]
        target_dir.mkdir(parents=True,exist_ok=True)
        with zipfile.ZipFile(archive) as zf:
            by_base={pathlib.PurePosixPath(name).name:name for name in zf.namelist() if not name.endswith("/")}
            for source_name in selected:
                member=by_base.get(pathlib.PurePosixPath(source_name).name)
                if not member:
                    raise SystemExit(f'MISSING_SAMPLE={col["id"]}:{source_name}')
                dest=target_dir/pathlib.PurePosixPath(source_name).name
                if not dest.is_file():
                    with zf.open(member) as src, open(dest,"wb") as out:
                        while True:
                            chunk=src.read(1024*1024)
                            if not chunk:
                                break
                            out.write(chunk)
                rows.append({
                    "audio_path":str(dest.relative_to(ROOT)),
                    "prompt_override":col["prompt"],
                    "genre":"Recorded Instrument",
                    "subgenre":col["id"],
                    "instrument_family":col["family"],
                    "license_type":"CC0_PUBLIC_DOMAIN",
                    "rights_to_train":True,
                    "synthetic":False,
                    "bpm":None,
                    "key":"",
                    "time_signature":"4",
                    "custom_tag":"<SONARA_PHYSICAL_REALISM>",
                    "source":"Meta Open Sound",
                    "source_collection":col["id"],
                    "source_license":"CC0-1.0",
                    "source_url":col["release"],
                    "sha256":sha256_file(dest),
                })
        archive.unlink(missing_ok=True)
        print("EXTRACTED="+col["id"]+":"+str(len(selected)),flush=True)

    dataset=ROOT/"dataset.json"
    dataset.write_text(json.dumps(rows,indent=2)+"\n",encoding="utf-8")
    provenance={
        "datasetVersion":"sonara-cc0-physical-bootstrap-v1",
        "source":"facebookincubator/Meta-open-sound",
        "license":"CC0-1.0",
        "tracks":len(rows),
        "lossless":True,
        "sampleRateHz":48000,
        "bitDepth":24,
        "collections":[c["id"] for c in COLLECTIONS],
        "promotionNote":"Bootstrap corpus for timbre/physical articulation. Add phrase-level performances and more instrument families before final production promotion."
    }
    (ROOT/"PROVENANCE.json").write_text(json.dumps(provenance,indent=2)+"\n",encoding="utf-8")
    print("AUDIO_FILES_IMPORTED="+str(len(rows)),flush=True)
    print("DATASET_JSON="+str(dataset),flush=True)
    print("LICENSE=CC0-1.0",flush=True)
    print("RIGHTS_TO_TRAIN=True",flush=True)
    print("LOSSLESS_WAV=True",flush=True)
    print("NEXT_ACTION=RUN_DATASET_INTAKE",flush=True)

if __name__=="__main__":
    main()
