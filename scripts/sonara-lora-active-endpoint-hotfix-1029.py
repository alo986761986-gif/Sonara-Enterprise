#!/usr/bin/env python3
from __future__ import annotations

import importlib.util
import json
import pathlib
import subprocess
import sys
import time
import urllib.error
import urllib.request

ROOT=pathlib.Path("/marimo/SONARA-ACE-Step-CLEAN")
PYTHON=ROOT/".venv/bin/python"
ROUTES=ROOT/"acestep/api/http/lora_routes.py"
API="http://127.0.0.1:8001"

V2_PATH="/marimo/SONARA-ACE-Step-CLEAN/sonara_training/physical_realism_v2_fixed/output/final"
V3_PATH="/marimo/SONARA-ACE-Step-CLEAN/sonara_training/physical_realism_v3_fixed/output/final"
V2_NAME="sonara_physical_realism_v2_fixed_dev"
V3_NAME="sonara_physical_realism_v3_fixed_dev"
V2_SCALE=0.60
V3_SCALE=0.55

V2_SCRIPT_URL=(
    "https://raw.githubusercontent.com/"
    "alo986761986-gif/Sonara-Enterprise/"
    "18cc947b9639da54e6011ba4e80b1c544b994db5/"
    "scripts/ace-step-real-music-v2-speed-quality-upgrade-0902.py"
)

def call(method,path,payload=None,timeout=180):
    body=None if payload is None else json.dumps(payload).encode("utf-8")
    req=urllib.request.Request(
        API+path,
        data=body,
        headers={
            "Content-Type":"application/json",
            "Accept":"application/json",
            "User-Agent":"SONARA-LoRA-Active-Hotfix/1.0",
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

def patch_route():
    if not ROUTES.is_file():
        raise SystemExit("LORA_ROUTES_FILE_MISSING")

    text=ROUTES.read_text(encoding="utf-8")
    original=text

    model_marker='class ToggleLoRARequest(BaseModel):\n    """Request payload for enabling/disabling loaded LoRA adapters."""\n\n    use_lora: bool = Field(..., description="Enable or disable LoRA")\n'
    model_insert=model_marker+'\n\nclass SetActiveLoRARequest(BaseModel):\n    """Request payload for selecting the active loaded LoRA adapter."""\n\n    adapter_name: str = Field(..., min_length=1, description="Loaded adapter name to activate")\n'

    if "class SetActiveLoRARequest(BaseModel):" not in text:
        if model_marker not in text:
            raise SystemExit("LORA_ACTIVE_MODEL_PATCH_MARKER_MISSING")
        text=text.replace(model_marker,model_insert,1)

    endpoint_marker='    @app.post("/v1/lora/scale")\n'
    endpoint_insert='''    @app.post("/v1/lora/active")
    async def set_active_lora_endpoint(request: SetActiveLoRARequest, _: None = Depends(verify_api_key)):
        """Select the active loaded LoRA adapter for inference."""

        handler = _require_initialized_handler(app)
        try:
            name = request.adapter_name.strip()
            result = handler.set_active_lora_adapter(name)
            if _is_success_message(result):
                return wrap_response({"message": result, "adapter_name": name})
            return wrap_response(None, code=400, error=result)
        except Exception as exc:
            return wrap_response(None, code=500, error=f"Failed to select active LoRA adapter: {str(exc)}")

'''
    if '@app.post("/v1/lora/active")' not in text:
        if endpoint_marker not in text:
            raise SystemExit("LORA_ACTIVE_ENDPOINT_PATCH_MARKER_MISSING")
        text=text.replace(endpoint_marker,endpoint_insert+endpoint_marker,1)

    if text!=original:
        backup=ROUTES.with_suffix(ROUTES.suffix+".before-sonara-active-endpoint")
        if not backup.exists():
            backup.write_text(original,encoding="utf-8")
        ROUTES.write_text(text,encoding="utf-8")
        print("LORA_ACTIVE_ENDPOINT_PATCHED=True",flush=True)
    else:
        print("LORA_ACTIVE_ENDPOINT_PATCHED=ALREADY",flush=True)

    subprocess.run([str(PYTHON),"-m","py_compile",str(ROUTES)],cwd=str(ROOT),check=True)
    print("LORA_ACTIVE_ENDPOINT_SYNTAX_OK=True",flush=True)

def load_v2_runtime_module():
    target=pathlib.Path("/tmp/sonara-v2-runtime-restart.py")
    req=urllib.request.Request(
        V2_SCRIPT_URL,
        headers={"User-Agent":"SONARA-LoRA-Active-Hotfix/1.0","Cache-Control":"no-cache"},
    )
    with urllib.request.urlopen(req,timeout=60) as response:
        target.write_bytes(response.read())
    spec=importlib.util.spec_from_file_location("sonara_v2_runtime_restart",target)
    if spec is None or spec.loader is None:
        raise SystemExit("V2_RUNTIME_MODULE_LOAD_FAILED")
    mod=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod

def wait_endpoint(timeout=60):
    deadline=time.monotonic()+timeout
    last=None
    while time.monotonic()<deadline:
        try:
            status=call("GET","/v1/lora/status",None,10)
            return status
        except Exception as exc:
            last=exc
            time.sleep(1)
    raise RuntimeError("LORA_STATUS_AFTER_RESTART_UNAVAILABLE") from last

def load_adapter(path,name,scale):
    call("POST","/v1/lora/load",{"lora_path":path,"adapter_name":name},180)
    call("POST","/v1/lora/scale",{"adapter_name":name,"scale":scale},60)

def main():
    patch_route()

    v2=load_v2_runtime_module()
    proc,backend,compile_model,health=v2.start_best_api()

    print("ACE_STEP_API_RESTARTED=True",flush=True)
    print("ACE_STEP_API_PID="+str(proc.pid),flush=True)
    print("ACE_STEP_LM_BACKEND="+str(backend),flush=True)
    print("ACE_STEP_TORCH_COMPILE="+str(bool(compile_model)).lower(),flush=True)

    wait_endpoint(60)

    # Fresh API has no adapters. Reload the two canonical benchmark adapters.
    load_adapter(V2_PATH,V2_NAME,V2_SCALE)
    load_adapter(V3_PATH,V3_NAME,V3_SCALE)

    call("POST","/v1/lora/active",{"adapter_name":V2_NAME},60)
    st_v2=call("GET","/v1/lora/status",None,30)
    if st_v2.get("active_adapter")!=V2_NAME:
        raise SystemExit("ACTIVE_ENDPOINT_V2_VERIFY_FAILED")
    print("ACTIVE_ENDPOINT_V2_OK=True",flush=True)

    call("POST","/v1/lora/active",{"adapter_name":V3_NAME},60)
    st_v3=call("GET","/v1/lora/status",None,30)
    if st_v3.get("active_adapter")!=V3_NAME:
        raise SystemExit("ACTIVE_ENDPOINT_V3_VERIFY_FAILED")
    print("ACTIVE_ENDPOINT_V3_OK=True",flush=True)

    call("POST","/v1/lora/toggle",{"use_lora":False},60)
    final=call("GET","/v1/lora/status",None,30)

    if bool(final.get("use_lora")):
        raise SystemExit("LORA_NOT_OFF_AFTER_HOTFIX")
    if V2_NAME not in set(final.get("adapters") or []):
        raise SystemExit("V2_NOT_RELOADED_AFTER_HOTFIX")
    if V3_NAME not in set(final.get("adapters") or []):
        raise SystemExit("V3_NOT_RELOADED_AFTER_HOTFIX")

    print("LORA_ACTIVE_ENDPOINT_READY=True",flush=True)
    print("V2_RELOADED=True",flush=True)
    print("V3_RELOADED=True",flush=True)
    print("V2_SCALE="+str((final.get("scales") or {}).get(V2_NAME)),flush=True)
    print("V3_SCALE="+str((final.get("scales") or {}).get(V3_NAME)),flush=True)
    print("ACTIVE_ADAPTER="+str(final.get("active_adapter")),flush=True)
    print("LORA_ACTIVE=False",flush=True)
    print("NO_AUDIO_GENERATED=True",flush=True)
    print("NEXT_ACTION=RERUN_V3_AUDIO_BENCHMARK",flush=True)

if __name__=="__main__":
    main()
