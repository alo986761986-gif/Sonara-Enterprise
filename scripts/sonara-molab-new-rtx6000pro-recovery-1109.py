#!/usr/bin/env python3
"""SONARA clean MoLab RTX PRO 6000 recovery, 9 Nov 2026.
Pinned core and isolated Remix Pro V3 + Musical Coherence V2.
No website deploy, no customer audio, no credentials printed.
Safe to rerun after Cloudflare pairing.
"""
from __future__ import annotations

import ast
import fcntl
import hashlib
import json
import os
import secrets
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

REPO = "alo986761986-gif/Sonara-Enterprise"
MAIN = "02bdb1b590d74c75e548749e3aec6bd4db4ace96"
CORE_COMMIT, CORE_BLOB = MAIN, "9a46b335bcf512bd6b6a813071e04616706c282b"
V3_COMMIT, V3_BLOB = "f56de2fa63385570082e7b4e2f070c0ca711e3b1", "4707ea856d294732a0eaab91a339db2fa0cc6b86"
Q2_COMMIT, Q2_BLOB = "c948f09cf78a06347bcda49352262cb7fccd75e3", "001a331102f299d776ecd8a9ea4a9f010dfacfc7"
BASE = {
 "sonara_remix_pro_toolkit.py": "0f9efb21f0d7228d3106c66b716660b049e8a75a",
 "sonara_remix_pro_quality.py": "1acfc68a8757ab7f5ddd7749681ae32e3ea6197a",
 "sonara_remix_pro_gpu_setup.py": "e3e1b9bf461b357602d2aee87b638dda663e59b8",
 "sonara_remix_pro_r2_agent.py": "ddc5c97ebf20782629e8c07646694feff2b8a5e1",
 "sonara_remix_pro_ace_bridge.py": "2439a989bcd792679ad6134caf7be4fbcadff723",
 "sonara_remix_pro_live_qa.py": "3a6760c4e05c25f0ad843cdd9525ed426920a103",
}
QUALITY = {
 "sonara_remix_pro_fusion.py": "9b74b6a3c891dcb272d8927f6fd7bb64c7833200",
 "sonara_remix_pro_ace_bridge.py": "09f6c3bbff4b8b33bc811dbb37c2add4b7b4db49",
 "sonara_remix_pro_r2_agent.py": "0e3cade1b4f884ce7aefaab9cd02c0514a6fe0f6",
}
CORE = Path("/marimo/SONARA-ACE-Step-CLEAN")
PRO = Path("/marimo/SONARA-REMIX-PRO")
PY = PRO / ".venv/bin/python"
HOME = Path.home() / ".sonara"
TOKEN = HOME / "relay.token"
AGENT = PRO / "sonara_remix_pro_r2_agent.py"
LOCK = HOME / "remix-pro-agent.lock"
STATUS = HOME / "remix-pro-agent-status.json"
REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"

def ensure(value, message):
    if not value:
        raise RuntimeError(message)

def sha(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()

def get(commit, path, digest):
    url = f"https://raw.githubusercontent.com/{REPO}/{commit}/{path}"
    req = urllib.request.Request(url, headers={"User-Agent": "SONARA-MoLab-RTX6000-Recovery/1.0", "Accept": "text/plain"})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=60) as response:
        data = response.read(200001)
    ensure(0 < len(data) <= 200000 and sha(data) == digest, "Pinned file integrity check failed: " + path)
    ast.parse(data.decode("utf-8"), filename=path)
    return data

def execute(command, timeout=3600):
    subprocess.run([str(v) for v in command], check=True, timeout=timeout)

def get_health():
    req = urllib.request.Request("http://127.0.0.1:8001/health", headers={"Accept":"application/json"})
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req, timeout=12) as response:
        body = json.load(response)
    return body.get("data", body) if isinstance(body, dict) else {}

def healthy():
    try:
        body = get_health()
        return (body.get("models_initialized") is True and body.get("llm_initialized") is True
                and body.get("loaded_model") == "acestep-v15-xl-turbo"
                and body.get("loaded_lm_model") == "acestep-5Hz-lm-4B")
    except (OSError, ValueError, urllib.error.URLError):
        return False

def gpu():
    ensure(Path("/marimo").is_dir(), "This script must run inside a MoLab notebook")
    r = subprocess.run(["nvidia-smi", "--query-gpu=name,compute_cap,memory.total", "--format=csv,noheader,nounits"],
                       capture_output=True, text=True, check=True, timeout=20)
    for row in r.stdout.splitlines():
        parts = [p.strip() for p in row.split(",")]
        if len(parts) == 3 and "RTX PRO 6000" in parts[0] and parts[1] in ("12.0", "12") and float(parts[2]) >= 40000:
            print("SONARA_RTX_PRO_6000_BLACKWELL=True", flush=True)
            return
    raise RuntimeError("RTX PRO 6000 Blackwell SM120 not available")

def install_core():
    if healthy():
        print("SONARA_MAIN_ENGINE=ALREADY_READY", flush=True)
        return
    ensure(not CORE.exists(), "ACE-Step directory exists but is unhealthy: protected, not overwritten")
    code = get(CORE_COMMIT, "scripts/ace-step-rtx6000pro-sonara-live-bootstrap-1030.py", CORE_BLOB)
    print("SONARA_MAIN_ENGINE=INSTALLING_PINNED_XL_TURBO_LM4B", flush=True)
    with tempfile.TemporaryDirectory(prefix="sonara-core-") as td:
        path = Path(td) / "install.py"
        path.write_bytes(code)
        execute([sys.executable, path], timeout=5000)
    ensure(healthy(), "Main XL Turbo / LM 4B health did not pass")
    print("SONARA_MAIN_ENGINE=READY", flush=True)

def pro_pids():
    out = []
    for p in Path("/proc").iterdir():
        if not p.name.isdigit():
            continue
        try:
            cwd = (p/"cwd").resolve(strict=True)
            argv = (p/"cmdline").read_bytes().split(b"\0")
            for arg in argv[1:]:
                if arg:
                    candidate = Path(os.fsdecode(arg))
                    candidate = (candidate if candidate.is_absolute() else cwd/candidate).resolve(strict=True)
                    if candidate == AGENT.resolve():
                        out.append(int(p.name))
                        break
        except (OSError, ValueError):
            pass
    return sorted(out)

def stage_base():
    ensure(not pro_pids(), "Existing dedicated Pro worker: refusing to rewrite running code")
    for d in (PRO, HOME):
        ensure(not d.is_symlink(), "Unsafe private directory symlink")
        d.mkdir(parents=True, exist_ok=True, mode=0o700)
        d.chmod(0o700)
    contents = {}
    for name, digest in BASE.items():
        path = PRO/name
        ensure(not path.is_symlink(), "Unsafe file symlink: " + name)
        if path.exists():
            ensure(path.is_file(), "Unrecognized file path: " + name)
            ast.parse(path.read_text(encoding="utf-8"), filename=name)
        else:
            contents[name] = get(MAIN, "molab/" + name, digest)
    with LOCK.open("a+") as lock:
        LOCK.chmod(0o600)
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError("Dedicated Pro lock occupied; no code updated") from exc
        ensure(not pro_pids(), "Pro worker started during module preflight")
        for name, data in contents.items():
            target = PRO/name
            fd = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as stream:
                stream.write(data)
    print("SONARA_REMIX_BASE_MODULES_READY=True", flush=True)

def dependencies_ready():
    if not PY.is_file():
        return False
    check = ("import importlib.util as u,importlib.metadata as m,torch;"
             "assert torch.cuda.is_available() and torch.version.cuda=='12.8';"
             "assert tuple(torch.cuda.get_device_capability(0))==(12,0);"
             "assert 'sm_120' in torch.cuda.get_arch_list();"
             "assert m.version('demucs')=='4.1.0';"
             "assert all(u.find_spec(x) for x in ['librosa','soundfile','numpy','scipy','pyloudnorm','torchaudio'])")
    result = subprocess.run([str(PY), "-c", check], capture_output=True, timeout=100)
    return result.returncode == 0

def install_dependencies():
    if dependencies_ready():
        print("SONARA_PRIVATE_GPU_AUDIO_DEPENDENCIES_READY=True", flush=True)
        return
    env = PRO/".venv"
    if not PY.is_file():
        ensure(not env.exists(), "Partial private venv: refusing overwrite")
        uv = shutil.which("uv")
        if uv:
            execute([uv,"venv","--python","3.12","--seed",env], timeout=700)
        else:
            ensure(sys.version_info[:2] == (3,12), "Use MoLab Python 3.12 or install uv")
            execute([sys.executable,"-m","venv",env], timeout=300)
    ensure(PY.is_file(), "Private virtual environment missing")
    torch_args = ["torch==2.9.1", "torchaudio==2.9.1"]
    deps = ["demucs==4.1.0", "librosa==0.11.0", "soundfile==0.13.1",
            "numpy>=1.26,<3", "scipy>=1.14,<2", "pyloudnorm==0.1.1"]
    uv = shutil.which("uv")
    if uv:
        execute([uv,"pip","install","--python",PY,"--index-url","https://download.pytorch.org/whl/cu128",*torch_args])
        execute([uv,"pip","install","--python",PY,*deps])
    else:
        execute([PY,"-m","pip","install","--no-input","--index-url","https://download.pytorch.org/whl/cu128",*torch_args])
        execute([PY,"-m","pip","install","--no-input",*deps])
    ensure(dependencies_ready(), "Private CUDA 12.8 and Demucs dependencies did not pass")
    print("SONARA_PRIVATE_GPU_AUDIO_DEPENDENCIES_READY=True", flush=True)

def run_installer(commit, name, digest):
    data = get(commit, "molab/" + name, digest)
    with tempfile.TemporaryDirectory(prefix="sonara-pro-installer-") as td:
        script = Path(td) / "install.py"
        script.write_bytes(data)
        script.chmod(0o600)
        execute([PY, script, "--install"], timeout=450)

def quality_ready():
    return all((PRO/name).is_file() and sha((PRO/name).read_bytes()) == digest
               for name,digest in QUALITY.items())

def upgrade_pro():
    ensure(not pro_pids(), "Active Remix Pro worker: no upgrade performed")
    if not quality_ready():
        current = AGENT.read_text(encoding="utf-8")
        if f'REVISION = "{REVISION}"' not in current:
            run_installer(V3_COMMIT, "install_sonara_remix_fusion_v3.py", V3_BLOB)
        ensure(f'REVISION = "{REVISION}"' in AGENT.read_text(encoding="utf-8"),
               "V3 dual-reference agent not installed")
        run_installer(Q2_COMMIT, "install_sonara_remix_quality_v2.py", Q2_BLOB)
    ensure(quality_ready(), "Final Musical Coherence V2 module hashes do not match")
    print("SONARA_REMIX_PRO_V3_DUAL_REFERENCE_FUSION=True", flush=True)
    print("SONARA_REMIX_MUSICAL_COHERENCE_V2=True", flush=True)

def token_value():
    ensure(not TOKEN.is_symlink(), "Unsafe credential symlink")
    if not TOKEN.exists():
        fd = os.open(TOKEN, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd,"w",encoding="ascii") as stream:
            stream.write(secrets.token_urlsafe(48) + "\n")
    ensure(TOKEN.is_file(), "Private token is missing")
    TOKEN.chmod(0o600)
    value = TOKEN.read_text(encoding="ascii").strip()
    ensure(len(value)>=32 and len(value)<=512 and value.isascii() and not any(c.isspace() for c in value),
           "Private token invalid")
    print("SONARA_TOKEN_SHA256=" + hashlib.sha256(value.encode()).hexdigest(), flush=True)
    print("SONARA_PRIVATE_TOKEN_NOT_DISPLAYED=True", flush=True)
    return value

def relay_auth(token):
    request = urllib.request.Request("https://api.sonaraenterprise.com/api/sonara-relay/auth",
        headers={"User-Agent":"SONARA-MoLab-Relay/1.0 (+https://sonaraenterprise.com)",
                 "X-Sonara-Relay-Token":token, "X-Sonara-Agent-Revision":"sonara-https-agent-guard-v5"})
    try:
        with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(request, timeout=25) as response:
            body=json.load(response)
            return response.status, bool(body.get("authenticated") is True)
    except urllib.error.HTTPError as error:
        return error.code, False
    except (OSError, ValueError, urllib.error.URLError):
        return 0, False

def preflight():
    result=subprocess.run([str(PY),str(AGENT),"--preflight"],cwd=str(PRO),
                          capture_output=True,text=True,timeout=220)
    for line in result.stdout.splitlines():
        if line.startswith(("PRO_GPU_VERIFIED=","PRO_AGENT_AUTHENTICATED=",
                            "PRO_AGENT_REVISION=","PRO_SITE_GENERATION_AVAILABLE=",
                            "PRO_JOBS_CLAIMED=")):
            print(line,flush=True)
    return (result.returncode==0 and "PRO_GPU_VERIFIED=True" in result.stdout and
            "PRO_AGENT_AUTHENTICATED=True" in result.stdout and
            "PRO_AGENT_REVISION="+REVISION in result.stdout)

def status():
    try:
        body=json.loads(STATUS.read_text(encoding="utf-8"))
        return body if isinstance(body,dict) else {}
    except (OSError,ValueError):
        return {}

def start_pro():
    current=pro_pids()
    ensure(len(current)<=1, "Multiple Pro workers detected")
    if current:
        row=status()
        ensure(row.get("revision")==REVISION and row.get("state") in
               ("waiting_for_authorized_job","waiting_for_pro_activation","processing"),
               "Existing dedicated worker state cannot be verified")
        print("SONARA_REMIX_PRO_AGENT_ALREADY_RUNNING=True",flush=True)
        return
    if not preflight():
        print("SONARA_PRO_PREFLIGHT_FAILED=True",flush=True)
        print("SONARA_NO_PRO_AGENT_STARTED=True",flush=True)
        return
    log=HOME/"remix-pro-v3-agent.log"
    ensure(not log.is_symlink(), "Unsafe private log")
    mode="none"  # This script verified /health without credentials on loopback.
    fd=os.open(log,os.O_WRONLY|os.O_CREAT|os.O_APPEND,0o600)
    with os.fdopen(fd,"ab") as out:
        process=subprocess.Popen([str(PY),str(AGENT),"--auth-mode",mode],
            cwd=str(PRO),stdin=subprocess.DEVNULL,stdout=out,stderr=subprocess.STDOUT,
            start_new_session=True,close_fds=True)
    launched=time.time()
    end=time.monotonic()+90
    while time.monotonic()<end:
        ensure(process.poll() is None, "Dedicated Pro agent exited early; private log has details")
        row=status()
        if (row.get("revision")==REVISION and
            isinstance(row.get("updatedAt"),(int,float)) and
            row.get("updatedAt")>=launched-3 and
            row.get("state") in ("waiting_for_authorized_job","waiting_for_pro_activation","processing")):
            print("SONARA_REMIX_PRO_GPU_AGENT_ONLINE=True",flush=True)
            print("SONARA_REMIX_PRO_PID="+str(process.pid),flush=True)
            return
        time.sleep(3)
    raise RuntimeError("Pro process started but fresh ready state is unconfirmed")

def main():
    print("=== SONARA NEW MOLAB RTX PRO 6000 - NOV 09 ===",flush=True)
    print("SONARA_NO_AUDIO_JOB_CREATED=True",flush=True)
    print("SONARA_NO_VERCEL_OR_WEBSITE_DEPLOY=True",flush=True)
    gpu()
    install_core()
    ensure(shutil.disk_usage("/marimo").free>=20*(1024**3),
           "At least 20 GiB free disk needed for isolated Remix Pro environment")
    stage_base()
    install_dependencies()
    upgrade_pro()
    token=token_value()
    code,authenticated=relay_auth(token)
    print("SONARA_RELAY_AUTH_HTTP="+str(code),flush=True)
    print("SONARA_RELAY_AUTHENTICATED="+str(authenticated),flush=True)
    if authenticated:
        start_pro()
    else:
        print("SONARA_PAIRING_REQUIRED=True",flush=True)
        print("SONARA_PRO_AGENT_NOT_STARTED=True",flush=True)
        print("SONARA_NEXT_ACTION=PAIR_PRIVATE_TOKEN_FINGERPRINT_IN_CLOUDFLARE",flush=True)
    print("SONARA_MAIN_ENGINE_PRESERVED_BY_REMIX=True",flush=True)
    print("SONARA_INSTALLATION_STAGE_COMPLETE=True",flush=True)

if __name__=="__main__":
    try:
        main()
    except (RuntimeError, OSError, ValueError, subprocess.SubprocessError,
            urllib.error.URLError) as error:
        print("SONARA_RECOVERY_STOPPED_SAFELY=True",flush=True)
        print("SONARA_ERROR_CLASS="+type(error).__name__,flush=True)
        if isinstance(error, RuntimeError):
            print("SONARA_ERROR_REASON="+str(error),flush=True)
        raise SystemExit(1) from None
