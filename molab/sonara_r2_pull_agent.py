"""SONARA MoLab pull agent. Only outbound HTTPS/443 to Cloudflare; local ACE-Step on 127.0.0.1:8001.
Requires private relay token file ~/.sonara/relay.token, same value as SONARA_RELAY_TOKEN Worker secret.
ACE-Step API key is read from /home/marimo/ACE-STEP/.sonara-api-key.
No user music is generated until the Worker has an authorized queued request.
"""
import json, os, time, pathlib, urllib.request, urllib.error, urllib.parse, subprocess, sys
from typing import Any
ROOT = pathlib.Path.home()/".sonara"
ENDPOINT="https://api.sonaraenterprise.com/api/sonara-relay"
LOCAL="http://127.0.0.1:8001"
TOKEN_FILE=ROOT/"relay.token"
ACE_KEY_FILE=pathlib.Path("/home/marimo/ACE-STEP/.sonara-api-key")
LOG=ROOT/"relay-agent.log"
def request(method,url,payload=None,headers=None,timeout=45):
    raw = json.dumps(payload).encode() if isinstance(payload,(dict,list)) else payload
    h={"User-Agent":"SONARA-MoLab-R2Relay/1","Accept":"application/json"}
    if raw is not None and isinstance(payload,(dict,list)):h["Content-Type"]="application/json"
    if headers:h.update(headers)
    req=urllib.request.Request(url,method=method,data=raw,headers=h)
    with urllib.request.urlopen(req,timeout=timeout) as r:
        if "application/json" in r.headers.get("Content-Type",""):return json.load(r)
        return r.read()
def claim_headers():
    return {"X-Sonara-Relay-Token":TOKEN_FILE.read_text().strip()}
def ace_headers():
    if not ACE_KEY_FILE.is_file():raise RuntimeError("ACE_STEP_API_KEY not found; do not expose the service")
    k=ACE_KEY_FILE.read_text().strip()
    return {"Authorization":"Bearer "+k,"X-API-Key":k}
def local(method,path,payload=None,timeout=60):
    return request(method,LOCAL+path,payload,ace_headers(),timeout)
def task_id(response):
    x=response.get("data",response)
    return x.get("task_id") if isinstance(x,dict) else None
def normalize_status(v):
    if isinstance(v,int):return v
    s=str(v).strip().lower()
    if s in ("1","success","completed","done","finished"):return 1
    if s in ("0","queued","pending","running","processing",""):return 0
    return -1
def extract_paths(task):
    result=task.get("result") or []
    if isinstance(result,str):
        try:result=json.loads(result)
        except:result=[]
    found=[]
    def add(o):
        if isinstance(o,list):
            for x in o:add(x)
        elif isinstance(o,dict):
            for k in ("audio_path","audio_file","file","path","url","audio","outputs","result"):
                if k in o:add(o[k])
        elif isinstance(o,str):
            p=urllib.parse.urlsplit(o)
            path=urllib.parse.parse_qs(p.query).get("path",[None])[0]
            if not path and o.startswith("/") and not o.startswith("/v1/audio"):path=o
            if path and path not in found:found.append(path)
    add(result)
    return found[:2]
def process(j):
    job=j["jobId"];lease=j["leaseId"]
    head={**claim_headers(),"X-Sonara-Lease":lease}
    def renew():
        request("POST",ENDPOINT+"/job/"+job+"/renew",{},head,20)
    try:
        response=local("POST","/release_task",j["payload"],timeout=120)
        tid=task_id(response)
        if not tid:raise RuntimeError("ACE-Step did not return task_id")
        last=time.monotonic()
        for i in range(200):
            time.sleep(8)
            if time.monotonic()-last>360:
                renew();last=time.monotonic()
            answer=local("POST","/query_result",{"task_id_list":[tid]},timeout=50)
            data=answer.get("data",[])
            task=data[0] if isinstance(data,list) and data else (data if isinstance(data,dict) else {})
            st=normalize_status(task.get("status"))
            if st<0:raise RuntimeError("ACE-Step task failed")
            if st==1:
                paths=extract_paths(task)
                if not paths:raise RuntimeError("ACE-Step completed but audio path missing")
                for idx,p in enumerate(paths):
                    q=urllib.parse.urlencode({"path":p})
                    data=local("GET","/v1/audio?"+q,timeout=90)
                    if not isinstance(data,bytes) or len(data)<44:raise RuntimeError("Invalid WAV bytes")
                    request("PUT",ENDPOINT+"/job/"+job+"/audio/"+str(idx),data,{**head,"Content-Type":"audio/wav"},timeout=120)
                request("POST",ENDPOINT+"/job/"+job+"/complete",{},head,30)
                print("SONARA: uploaded",len(paths),"audio file(s), job",job,flush=True)
                return
        raise RuntimeError("Job exceeded maximum polling time")
    except Exception as e:
        print("SONARA job",job,"error",type(e).__name__,str(e)[:150],flush=True)
        try:request("POST",ENDPOINT+"/job/"+job+"/fail",{},head,20)
        except Exception:pass
def main():
    if not TOKEN_FILE.is_file():raise SystemExit("Missing private relay token: "+str(TOKEN_FILE))
    if not ACE_KEY_FILE.is_file():raise SystemExit("Missing local ACE-Step key")
    print("SONARA: waiting for authorized jobs over HTTPS 443; no test generation",flush=True)
    while True:
        try:
            data=request("POST",ENDPOINT+"/claim",{},claim_headers(),timeout=50)
            if data.get("jobId"):process(data)
            else:time.sleep(5)
        except KeyboardInterrupt:raise
        except Exception as e:
            print("SONARA relay offline:",type(e).__name__,str(e)[:125],flush=True)
            time.sleep(25)
if __name__=="__main__":main()
