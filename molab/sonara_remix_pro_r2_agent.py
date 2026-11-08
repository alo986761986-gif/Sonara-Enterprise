"""SONARA Remix Pro independent outbound HTTPS/443 agent.

Requires the already verified /marimo/SONARA-REMIX-PRO/.venv, Demucs 4.1,
CUDA-sm120 and existing private ~/.sonara/relay.token. Does not start or
modify ACE-Step. Dedicated lock and queue; no customer audio in public logs.
"""
from __future__ import annotations
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import signal
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import wave

from sonara_remix_pro_toolkit import (
    analyze_audio, combine_two_songs, separate_stems, transparent_master
)
from sonara_remix_pro_ace_bridge import render as ace_cover
from sonara_remix_pro_quality import audit_wav
import soundfile as sf

ROOT = Path("/marimo/SONARA-REMIX-PRO")
PRIVATE = ROOT / "private-jobs"
STEM_CACHE = ROOT / "private-stem-cache"
HOME = Path.home() / ".sonara"
TOKEN_FILE = HOME / "relay.token"
STATUS_FILE = HOME / "remix-pro-agent-status.json"
LOCK_FILE = HOME / "remix-pro-agent.lock"
BASE = "https://api.sonaraenterprise.com/api/sonara-relay"
REVISION = "sonara-remix-pro-r2-agent-v1"
MAX_WAV_BYTES = 80 * 1024 * 1024
STOP = False
JOB = re.compile(r"^srpro_[0-9a-f-]{36}$")


class ProAgentError(RuntimeError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


CLIENT = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())


def token_headers():
    secret = TOKEN_FILE.read_text(encoding="utf-8").strip()
    if len(secret) < 32 or not secret.isascii() or any(c.isspace() for c in secret):
        raise ProAgentError("Invalid existing SONARA relay credential")
    return {"X-Sonara-Relay-Token": secret, "X-Sonara-Pro-Agent-Revision": REVISION}


def request(method, path, data=None, lease=None, *, binary=False, timeout=120):
    if not path.startswith("/api/sonara-relay/pro-") or "//" in path:
        raise ProAgentError("Disallowed gateway path")
    h = {**token_headers(), "Accept": "application/octet-stream" if binary else "application/json"}
    if lease:
        h["X-Sonara-Pro-Lease"] = lease
    if isinstance(data, dict):
        payload = json.dumps(data).encode()
        h["Content-Type"] = "application/json"
    elif isinstance(data, (bytes, bytearray)):
        payload = data
        h["Content-Type"] = "audio/wav"
    else:
        payload = None
    req = urllib.request.Request(BASE.removesuffix("/api/sonara-relay") + path,
                                 data=payload, method=method, headers=h)
    try:
        with CLIENT.open(req, timeout=timeout) as res:
            if binary:
                length = int(res.headers.get("content-length") or 0)
                if length > MAX_WAV_BYTES:
                    raise ProAgentError("Private source too large")
                data = res.read(MAX_WAV_BYTES + 1)
                if not 44 <= len(data) <= MAX_WAV_BYTES:
                    raise ProAgentError("Source WAV empty or oversized")
                return data
            data = json.load(res)
            if not isinstance(data, dict) or data.get("error"):
                raise ProAgentError("SONARA Remix Pro gateway rejected request")
            return data
    except urllib.error.HTTPError as exc:
        raise ProAgentError("SONARA Remix Pro gateway HTTP " + str(exc.code)) from exc


def status(state, **safe):
    HOME.mkdir(mode=0o700, exist_ok=True)
    safe_data = {"revision": REVISION, "state": state, "updatedAt": int(time.time()), **safe}
    path = STATUS_FILE.with_suffix(".tmp")
    path.write_text(json.dumps(safe_data))
    path.chmod(0o600)
    path.replace(STATUS_FILE)


def validate_wav(path):
    p = Path(path)
    if not p.is_file() or not 44 <= p.stat().st_size <= MAX_WAV_BYTES:
        raise ProAgentError("Real WAV file is missing or oversized")
    with wave.open(str(p), "rb") as f:
        if not 10 <= f.getnframes() / f.getframerate() <= 600:
            raise ProAgentError("WAV duration unsupported")
        if f.getnchannels() not in (1, 2):
            raise ProAgentError("WAV channel layout unsupported")
    return p


def save_bytes(data, name, folder):
    if len(data) > MAX_WAV_BYTES or data[:4] != b"RIFF" or data[8:12] != b"WAVE":
        raise ProAgentError("Private audio source is not a WAV")
    p = folder / name
    if p.exists():
        raise ProAgentError("Refusing to replace a private job audio file")
    with p.open("xb") as f:
        f.write(data)
    p.chmod(0o600)
    validate_wav(p)
    return p


def upload(job, lease, endpoint, source):
    p = Path(source)
    validate_wav(p)
    raw = p.read_bytes()
    response = request("PUT", f"/api/sonara-relay/pro-job/{job}/{endpoint}",
                       raw, lease, timeout=180)
    if response.get("ok") is not True:
        raise ProAgentError("R2 did not confirm an audio artifact")


class Renewer:
    def __init__(self, job, lease):
        self.job = job
        self.lease = lease
        self.stop = threading.Event()
        self.failed = threading.Event()
        self.thread = threading.Thread(target=self.loop, daemon=True)

    def loop(self):
        while not self.stop.wait(45):
            success = False
            for attempt in range(3):
                try:
                    data = request("POST", f"/api/sonara-relay/pro-job/{self.job}/renew",
                                   {}, self.lease, timeout=30)
                    if data.get("ok") is not True:
                        raise ProAgentError("Lease renewal not confirmed")
                    request("POST", "/api/sonara-relay/pro-heartbeat",
                            {"gpuReady": True}, timeout=25)
                    success = True
                    break
                except Exception:
                    if self.stop.wait(3):
                        return
            if not success:
                self.failed.set()
                return

    def __enter__(self):
        self.thread.start()
        return self

    def __exit__(self, *_):
        self.stop.set()
        self.thread.join(timeout=8)

    def verify(self):
        if self.failed.is_set():
            raise ProAgentError("Exclusive lease renewal failed; output cannot be committed")


def progress(job, lease, stage, renewer):
    renewer.verify()
    for attempt in range(3):
        try:
            request("POST", f"/api/sonara-relay/pro-job/{job}/progress", {"stage": stage}, lease)
            status("processing", jobId=job, stage=stage)
            return
        except ProAgentError:
            if attempt == 2:
                raise
            time.sleep(1)


def run_job(item, auth_mode):
    job = str(item.get("jobId") or "")
    lease = str(item.get("leaseId") or "")
    if not JOB.fullmatch(job) or not re.fullmatch(r"[0-9a-f-]{36}", lease):
        raise ProAgentError("Invalid signed job or lease")
    params = item.get("params") or {}
    if not isinstance(params, dict):
        raise ProAgentError("Invalid job parameters")
    PRIVATE.mkdir(mode=0o700, parents=True, exist_ok=True)
    STEM_CACHE.mkdir(mode=0o700, parents=True, exist_ok=True)
    folder = PRIVATE / job
    folder.mkdir(mode=0o700, exist_ok=False)
    print("SONARA PRO job claimed:", job, flush=True)
    try:
        with Renewer(job, lease) as renewal:
            progress(job, lease, "downloading", renewal)
            a = save_bytes(request("GET", f"/api/sonara-relay/pro-job/{job}/source/a",
                                   lease=lease, binary=True), "source-a.wav", folder)
            b = save_bytes(request("GET", f"/api/sonara-relay/pro-job/{job}/source/b",
                                   lease=lease, binary=True), "source-b.wav", folder)
            progress(job, lease, "analyzing", renewal)
            report_a = analyze_audio(a)
            report_b = analyze_audio(b)
            bpm_a = params.get("bpmA") or report_a.get("tempoBpm")
            bpm_b = params.get("bpmB") or report_b.get("tempoBpm")
            if not bpm_a or not bpm_b:
                raise ProAgentError("Tempo non verificabile. Imposta il BPM manualmente per entrambi i brani.")
            progress(job, lease, "separating", renewal)
            env_cache = ROOT / "model-cache"
            os.environ["TORCH_HOME"] = str(env_cache)
            os.environ["XDG_CACHE_HOME"] = str(ROOT / "private-cache")
            manifest_a = separate_stems(a, STEM_CACHE, device="cuda")
            manifest_b = separate_stems(b, STEM_CACHE, device="cuda")
            source_a = STEM_CACHE / manifest_a["sourceSha256"][:20]
            source_b = STEM_CACHE / manifest_b["sourceSha256"][:20]
            progress(job, lease, "arranging", renewal)
            arranged = folder / "arranged.wav"
            combine_two_songs(
                a,b,source_a,source_b,arranged,bpm_a=float(bpm_a),bpm_b=float(bpm_b),
                bass_from="b" if params.get("bassFrom")=="b" else "a",
                max_seconds=int(params.get("durationSec") or 60)
            )
            progress(job, lease, "regenerating", renewal)
            generated = folder / "generated.wav"
            result = ace_cover(
                arranged,generated,str(params.get("prompt") or "").strip(),
                mode=auth_mode,
                strength=float(params.get("coverStrength") or .76),
                noise=float(params.get("coverNoise") or .14),
                bpm=float(bpm_a),
                key=params.get("key") or None
            )
            if result.get("status")!="completed":
                raise ProAgentError("Local ACE-Step did not complete the job")
            progress(job, lease, "mastering", renewal)
            sample, sr = sf.read(str(generated), dtype="float32", always_2d=True)
            if sr < 22050 or sr > 96000 or len(sample) / sr > 120:
                raise ProAgentError("Unsupported generated WAV duration or sample rate")
            import numpy as np
            if sample.shape[1] == 1:
                sample = np.repeat(sample, 2, axis=1)
            elif sample.shape[1] > 2:
                raise ProAgentError("Only stereo WAV output is supported")
            mastered, metrics = transparent_master(sample, sr=sr)
            master_file = folder / "mastered.wav"
            sf.write(str(master_file), mastered, sr, subtype="PCM_24")
            audit = audit_wav(master_file)
            if audit.get("integratedLufs") is None or audit.get("approxTruePeakDbTp", 0) > -0.8:
                raise ProAgentError("Mastering verification failed")
            progress(job, lease, "uploading", renewal)
            # All stems must be authentic model outputs, not synthesized silence.
            for source,remote in ((source_a/"vocals.wav","vocals-a"),
                                  (source_b/"drums.wav","drums-b"),
                                  (source_a/"bass.wav","bass-a"),
                                  (source_a/"other.wav","other-a")):
                renewal.verify()
                upload(job,lease,"stem/"+remote,source)
            upload(job,lease,"audio",master_file)
            renewal.verify()
            response = request("POST",f"/api/sonara-relay/pro-job/{job}/complete",{},lease)
            if response.get("ok") is not True:
                raise ProAgentError("Gateway completion not acknowledged")
        status("waiting_for_authorized_job", lastCompleted=job)
        print("SONARA PRO job completed:", job, flush=True)
    except Exception as error:
        print("SONARA PRO job failed:", job, type(error).__name__, flush=True)
        try:
            request("POST",f"/api/sonara-relay/pro-job/{job}/fail",{},lease,timeout=30)
        except Exception:
            pass
        status("waiting_for_authorized_job", lastFailed=job, errorClass=type(error).__name__)
    finally:
        shutil.rmtree(folder, ignore_errors=True)


def stop_handler(_signal, _frame):
    global STOP
    STOP=True


def main(argv=None):
    parser=argparse.ArgumentParser(description="Isolated SONARA Remix Pro agent")
    parser.add_argument("--auth-mode",choices=("none","required"),default="required")
    parser.add_argument("--once",action="store_true")
    args=parser.parse_args(argv)
    if not (ROOT/".venv/bin/python").resolve()==Path(__import__("sys").executable).resolve():
        raise ProAgentError("Refusing to run in the live ACE-Step environment")
    for name in ("sonara_remix_pro_toolkit.py","sonara_remix_pro_ace_bridge.py"):
        if not (ROOT/name).is_file():
            raise ProAgentError("Missing verified Remix Pro dependency "+name)
    if not TOKEN_FILE.is_file():
        raise ProAgentError("Existing private relay token missing")
    lock=LOCK_FILE.open("a+")
    os.chmod(LOCK_FILE,0o600)
    try:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        raise ProAgentError("A Remix Pro agent is already running")
    signal.signal(signal.SIGINT,stop_handler)
    signal.signal(signal.SIGTERM,stop_handler)
    print("SONARA Remix Pro agent initialized; independent HTTPS/443 queue.",flush=True)
    while not STOP:
        try:
            request("POST","/api/sonara-relay/pro-heartbeat",{"gpuReady":True})
            response = request("POST","/api/sonara-relay/pro-claim",{})
            if response.get("jobId"):
                run_job(response,args.auth_mode)
            else:
                status("waiting_for_authorized_job")
                if args.once:
                    break
                time.sleep(7)
        except KeyboardInterrupt:
            break
        except Exception as error:
            status("connection_unavailable",errorClass=type(error).__name__)
            print("SONARA PRO standby:",type(error).__name__,flush=True)
            if args.once:
                raise
            time.sleep(20)
    status("stopped")


if __name__=="__main__":
    main()
