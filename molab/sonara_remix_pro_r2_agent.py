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
import sys
import re
import shutil
import signal
import tempfile
import subprocess
from functools import lru_cache
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import wave

# Marimo launches code cells and external Python processes with different
# sys.path policies (including possible PYTHONSAFEPATH). Resolve trusted sibling
# modules from the exact agent directory before any project-local imports.
_AGENT_DIRECTORY = Path(__file__).resolve().parent
_MOLAB_ROOT = Path("/marimo/SONARA-REMIX-PRO")
if _AGENT_DIRECTORY != _MOLAB_ROOT.resolve():
    raise RuntimeError("Unexpected Remix Pro agent directory")
for _module in (
    "sonara_remix_pro_toolkit.py",
    "sonara_remix_pro_ace_bridge.py",
    "sonara_remix_pro_quality.py",
):
    if not (_AGENT_DIRECTORY / _module).is_file():
        raise RuntimeError("Missing local Remix Pro module: " + _module)
if str(_AGENT_DIRECTORY) not in sys.path:
    sys.path.insert(0, str(_AGENT_DIRECTORY))

from sonara_remix_pro_toolkit import (
    analyze_audio, combine_two_songs, separate_stems, transparent_master
)
from sonara_remix_pro_ace_bridge import render_long_remix as ace_cover
from sonara_remix_pro_quality import audit_wav, release_gate
import soundfile as sf

ROOT = Path("/marimo/SONARA-REMIX-PRO")
PRIVATE = ROOT / "private-jobs"
HOME = Path.home() / ".sonara"
TOKEN_FILE = HOME / "relay.token"
STATUS_FILE = HOME / "remix-pro-agent-status.json"
LOCK_FILE = HOME / "remix-pro-agent.lock"
BASE = "https://api.sonaraenterprise.com/api/sonara-relay"
REVISION = "sonara-remix-pro-r2-agent-v2-longwav"
MAX_WAV_BYTES = 512 * 1024 * 1024
SOURCE_FORMATS = frozenset(("wav","mp3","flac","m4a","mp4","aac","ogg",
                           "oga","opus","aif","aiff","aifc","webm","wma",
                           "caf","amr","ac3"))
STOP = False
JOB = re.compile(r"^srpro_[0-9a-f-]{36}$")


class ProAgentError(RuntimeError):
    pass


class SourceTransferError(ProAgentError):
    """Allowlisted error code; never contains customer audio or gateway secrets."""
    def __init__(self, code):
        super().__init__(code)
        self.code = code


_SOURCE_HTTP_ERRORS = frozenset((401, 403, 404, 409, 429, 500, 502, 503, 504))
_SOURCE_RETRY_HTTP = frozenset((429, 500, 502, 503, 504))
_SOURCE_RANGE_BYTES = 8 * 1024 * 1024
_SOURCE_RETRIES = 3


def _source_http_error(code):
    return "SOURCE_HTTP_" + str(code) if code in _SOURCE_HTTP_ERRORS else "SOURCE_NETWORK_ERROR"


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
    h = {**token_headers(), "User-Agent": "SONARA-Remix-Pro-Agent/1.0 (+https://sonaraenterprise.com)",
         "Accept": "application/octet-stream" if binary else "application/json"}
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



def pro_activation_pending():
    """Distinguish an intentionally closed Pro queue from network failure.

    The heartbeat happens first and establishes GPU/authentication readiness.
    When Pro capabilities are unavailable, do not poll the gated pro-claim
    endpoint: it returns HTTP 503 by design until the billing gate is enabled.
    """
    caps = request("GET", "/api/sonara-relay/pro-capabilities")
    if caps.get("available") is True:
        return False
    status("waiting_for_pro_activation", siteGenerationAvailable=False)
    return True



@lru_cache(maxsize=1)
def multiformat_ready():
    """Fail closed if verified FFmpeg and FFprobe are not installed."""
    for executable in ("ffmpeg", "ffprobe"):
        binary = shutil.which(executable)
        if not binary:
            return False
        try:
            version = subprocess.run([binary, "-version"], capture_output=True,
                                     text=True, timeout=8, check=True)
            if not version.stdout.lower().startswith(executable + " version"):
                return False
        except (subprocess.SubprocessError, OSError):
            return False
    return True


def probe_audio_source(path):
    """Safely inspect one decodable audio stream; no external protocols or media logs."""
    if not multiformat_ready():
        raise SourceTransferError("SOURCE_DECODER_UNAVAILABLE")
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-protocol_whitelist", "file",
             "-show_entries", "stream=codec_type,channels,sample_rate:format=duration",
             "-of", "json", str(path)],
            check=True, capture_output=True, text=True, timeout=45
        )
        metadata = json.loads(probe.stdout)
        streams = metadata.get("streams") or []
        if len(streams) != 1 or streams[0].get("codec_type") != "audio":
            raise SourceTransferError("SOURCE_STREAM_UNSUPPORTED")
        rate = int(streams[0].get("sample_rate") or 0)
        channels = int(streams[0].get("channels") or 0)
        duration = float((metadata.get("format") or {}).get("duration") or 0)
    except SourceTransferError:
        raise
    except (ValueError, KeyError, TypeError, subprocess.SubprocessError, OSError) as exc:
        raise SourceTransferError("SOURCE_UNREADABLE_AUDIO") from exc
    if duration < 10:
        raise SourceTransferError("SOURCE_DURATION_TOO_SHORT")
    if duration > 900:
        raise SourceTransferError("SOURCE_DURATION_TOO_LONG")
    # Accept bounded genuine multichannel/high-rate input only for controlled
    # downmix/resample into a high-resolution PCM24 stereo WAV before model inference.
    if not 1 <= channels <= 8:
        raise SourceTransferError("SOURCE_CHANNELS_UNSUPPORTED")
    if not 8000 <= rate <= 192000:
        raise SourceTransferError("SOURCE_SAMPLERATE_UNSUPPORTED")
    return Path(path)


def verify_audio_source(path, fmt):
    """Validate a downloaded real audio stream, including decodable WAV variants."""
    p = Path(path)
    if fmt not in SOURCE_FORMATS or p.suffix.lower() != "." + fmt:
        raise SourceTransferError("SOURCE_STREAM_UNSUPPORTED")
    if not p.is_file() or not 44 <= p.stat().st_size <= MAX_WAV_BYTES:
        raise SourceTransferError("SOURCE_OVERSIZE" if p.is_file() and
                                  p.stat().st_size > MAX_WAV_BYTES else
                                  "SOURCE_UNREADABLE_AUDIO")
    if fmt == "wav":
        try:
            return validate_wav(p)
        except ProAgentError:
            # A RIFF WAVE can be decodable by FFmpeg even if libsndfile cannot
            # open its codec, metadata, or nonstandard but valid header.
            return probe_audio_source(p)
    return probe_audio_source(p)


def normalized_audio_source(source, destination):
    """Use original valid PCM/float WAV; transcode other decodable audio safely."""
    source = Path(source)
    if source.suffix.lower() == ".wav":
        try:
            return validate_wav(source)
        except ProAgentError:
            # Previous source validation already checked bounds with FFprobe.
            probe_audio_source(source)
    else:
        probe_audio_source(source)
    if destination.exists():
        raise ProAgentError("Refusing to replace a private normalized WAV")
    try:
        subprocess.run(
            ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error",
             "-protocol_whitelist", "file",
             "-i", str(source), "-map", "0:a:0", "-vn", "-sn", "-dn",
             "-ac", "2", "-ar", "44100", "-c:a", "pcm_s24le",
             "-f", "wav", "-n", str(destination)],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
            timeout=300
        )
        destination.chmod(0o600)
        validate_wav(destination)
        return destination
    except (subprocess.SubprocessError, OSError, ProAgentError) as exc:
        destination.unlink(missing_ok=True)
        raise SourceTransferError("SOURCE_DECODER_FAILED") from exc

def pro_heartbeat_payload():
    return {"gpuReady": True, "formatsReady": multiformat_ready()}


def validate_wav(path):
    p = Path(path)
    if not p.is_file() or not 44 <= p.stat().st_size <= MAX_WAV_BYTES:
        raise ProAgentError("Real WAV file is missing or oversized")
    # libsndfile identifies valid WAVE_FORMAT_EXTENSIBLE PCM/float as WAVEX,
    # not WAV. The Cloudflare uploader already accepts these genuine files.
    # Keep the codec, duration and channel limits; do not admit compressed WAV.
    try:
        with sf.SoundFile(str(p)) as f:
            if f.format not in ("WAV", "WAVEX") or f.subtype not in (
                "PCM_U8", "PCM_16", "PCM_24", "PCM_32", "FLOAT", "DOUBLE"
            ):
                raise ProAgentError("WAV must contain supported PCM or float audio")
            if not 8000 <= f.samplerate <= 96000 or not 10 <= f.frames / f.samplerate <= 900:
                raise ProAgentError("WAV sample rate or duration unsupported")
            if f.channels not in (1, 2):
                raise ProAgentError("WAV channel layout unsupported")
    except (OSError, RuntimeError, ValueError) as exc:
        raise ProAgentError("Invalid readable WAV") from exc
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


def download_source(job, lease, endpoint, name, folder, source_format='wav'):
    """Bounded 8 MiB HTTP Range reads from private R2, retrying only transient errors.

    The R2 Worker returns 206 + Content-Range; strict validation prevents a
    partial or duplicated audio stream being passed into Demucs/ACE-Step.
    """
    if source_format not in SOURCE_FORMATS:
        raise SourceTransferError("SOURCE_INVALID_AUDIO")
    name = name + "." + source_format
    path = f"/api/sonara-relay/pro-job/{job}/source/{endpoint}"
    headers = {**token_headers(),
               "User-Agent": "SONARA-Remix-Pro-Agent/1.0 (+https://sonaraenterprise.com)",
               "Accept": "application/octet-stream", "X-Sonara-Pro-Lease": lease}
    url = BASE.removesuffix("/api/sonara-relay") + path
    target = folder / name
    offset = 0
    total = None
    try:
        with target.open("xb") as handle:
            while total is None or offset < total:
                stop = offset + _SOURCE_RANGE_BYTES - 1
                last_error = None
                for attempt in range(_SOURCE_RETRIES):
                    request_headers = {**headers, "Range": f"bytes={offset}-{stop}"}
                    req = urllib.request.Request(url, method="GET", headers=request_headers)
                    try:
                        with CLIENT.open(req, timeout=90) as response:
                            if response.status != 206:
                                raise SourceTransferError("SOURCE_TRANSFER_INVALID")
                            content_range = str(response.headers.get("Content-Range") or "")
                            match = re.fullmatch(r"bytes (\d+)-(\d+)/(\d+)", content_range)
                            if not match:
                                raise SourceTransferError("SOURCE_TRANSFER_INVALID")
                            begin, end, remote_total = (int(x) for x in match.groups())
                            if not (44 <= remote_total <= MAX_WAV_BYTES):
                                raise SourceTransferError("SOURCE_OVERSIZE" if remote_total > MAX_WAV_BYTES else "SOURCE_TRANSFER_INVALID")
                            if total is not None and remote_total != total:
                                raise SourceTransferError("SOURCE_TRANSFER_INVALID")
                            if begin != offset or end != min(stop, remote_total - 1):
                                raise SourceTransferError("SOURCE_TRANSFER_INVALID")
                            expected = end - begin + 1
                            piece = response.read(expected + 1)
                            if len(piece) != expected:
                                raise OSError("Incomplete HTTP range")
                            handle.write(piece)
                            offset += expected
                            total = remote_total
                            last_error = None
                            break
                    except urllib.error.HTTPError as exc:
                        code = int(exc.code)
                        last_error = SourceTransferError(_source_http_error(code))
                        if code not in _SOURCE_RETRY_HTTP:
                            raise last_error from exc
                    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
                        last_error = SourceTransferError("SOURCE_NETWORK_ERROR")
                    if attempt + 1 < _SOURCE_RETRIES:
                        time.sleep(attempt + 1)
                if last_error is not None:
                    raise last_error
        target.chmod(0o600)
        try:
            return verify_audio_source(target, source_format)
        except SourceTransferError:
            raise
        except ProAgentError as exc:
            raise SourceTransferError("SOURCE_UNREADABLE_AUDIO") from exc
    except Exception:
        target.unlink(missing_ok=True)
        raise


def upload(job, lease, endpoint, source):
    """Short WAVs retain the legacy upload; long exports use 8 MiB R2 parts."""
    p = Path(source)
    validate_wav(p)
    size = p.stat().st_size
    base = f"/api/sonara-relay/pro-job/{job}/{endpoint}"
    if size <= 80 * 1024 * 1024:
        response = request("PUT", base, p.read_bytes(), lease, timeout=180)
        if response.get("ok") is not True:
            raise ProAgentError("R2 did not confirm an audio artifact")
        return
    begin = request("POST", base + "/start", {"bytes": size}, lease)
    part_bytes = begin.get("partBytes")
    total = begin.get("parts")
    if part_bytes != 8 * 1024 * 1024 or not isinstance(total, int) or not 1 <= total <= 64:
        raise ProAgentError("Invalid private multipart upload session")
    receipts = []
    with p.open("rb") as handle:
        for i in range(1, total + 1):
            data = handle.read(part_bytes)
            if not data:
                raise ProAgentError("WAV truncated during upload")
            response = request("PUT", base + f"/part/{i}", data, lease, timeout=180)
            etag = response.get("etag")
            if response.get("partNumber") != i or not isinstance(etag, str):
                raise ProAgentError("R2 did not confirm WAV part")
            receipts.append({"partNumber": i, "etag": etag})
    result = request("POST", base + "/finish", {"parts": receipts}, lease, timeout=180)
    if result.get("ok") is not True:
        raise ProAgentError("R2 did not confirm final WAV")



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
                            pro_heartbeat_payload(), timeout=25)
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
    folder = PRIVATE / job
    folder.mkdir(mode=0o700, exist_ok=False)
    # No shared audio-derived stem cache across accounts.
    stem_cache = folder / "stem-cache"
    stem_cache.mkdir(mode=0o700)
    print("SONARA PRO job claimed:", job, flush=True)
    failure_phase = "source_a"
    try:
        with Renewer(job, lease) as renewal:
            progress(job, lease, "downloading", renewal)
            original_a = download_source(job, lease, "a", "source-a", folder,
                                         item.get("sourceFormatA") or "wav")
            failure_phase = "source_b"
            original_b = download_source(job, lease, "b", "source-b", folder,
                                         item.get("sourceFormatB") or "wav")
            failure_phase = "normalize_a"
            a = normalized_audio_source(original_a, folder / "normalized-a.wav")
            failure_phase = "normalize_b"
            b = normalized_audio_source(original_b, folder / "normalized-b.wav")
            failure_phase = "processing"
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
            manifest_a = separate_stems(a, stem_cache, device="cuda")
            manifest_b = separate_stems(b, stem_cache, device="cuda")
            source_a = stem_cache / manifest_a["sourceSha256"][:20]
            source_b = stem_cache / manifest_b["sourceSha256"][:20]
            progress(job, lease, "arranging", renewal)
            arranged = folder / "arranged.wav"
            requested_seconds = int(params.get("durationSec") or 60)
            if requested_seconds not in range(30, 481, 30):
                raise SourceTransferError("REMIX_INVALID_DURATION")
            plan = combine_two_songs(
                a,b,source_a,source_b,arranged,bpm_a=float(bpm_a),bpm_b=float(bpm_b),
                bass_from="b" if params.get("bassFrom")=="b" else "a",
                max_seconds=requested_seconds
            )
            if (plan.get("durationVerified") is not True
                or plan.get("realSourceAUsed") is not True
                or plan.get("realSourceBUsed") is not True
                or int(plan.get("seconds") or 0) != requested_seconds):
                raise SourceTransferError("REMIX_DURATION_MISMATCH")
            progress(job, lease, "regenerating", renewal)
            generated = folder / "generated.wav"
            result = ace_cover(
                arranged,generated,str(params.get("prompt") or "").strip(),
                mode=auth_mode,
                strength=float(params.get("coverStrength") if params.get("coverStrength") is not None else .86),
                noise=float(params.get("coverNoise") if params.get("coverNoise") is not None else 0.0),
                bpm=float(bpm_a),
                key=params.get("key") or None,
                reference_audio_path=b
            )
            if result.get("durationVerified") is not True or result.get("oneContinuousOutput") is not True:
                raise SourceTransferError("REMIX_DURATION_MISMATCH")
            if result.get("status")!="completed":
                raise ProAgentError("Local ACE-Step did not complete the job")
            progress(job, lease, "mastering", renewal)
            sample, sr = sf.read(str(generated), dtype="float32", always_2d=True)
            if sr < 22050 or sr > 96000 or abs(len(sample) / sr - requested_seconds) > 0.1:
                raise SourceTransferError("REMIX_DURATION_MISMATCH")
            import numpy as np
            if sample.shape[1] == 1:
                sample = np.repeat(sample, 2, axis=1)
            elif sample.shape[1] > 2:
                raise ProAgentError("Only stereo WAV output is supported")
            mastered, metrics = transparent_master(sample, sr=sr)
            master_file = folder / "mastered.wav"
            sf.write(str(master_file), mastered, sr, subtype="PCM_24")
            audit = audit_wav(master_file)
            # Block technically degraded model results before R2 publication.
            # Do not claim that signal statistics can prove artistic fusion.
            gate = release_gate(
                arranged, generated, master_file,
                expected_seconds=requested_seconds,
                require_b_motif=bool(plan.get("bMelodicMotifRole")),
            )
            if not gate["acceptedTechnical"]:
                raise ProAgentError("Post-cover audio quality gate rejected the result")
            if abs(float(audit.get("durationSeconds") or 0) - requested_seconds) > 0.1:
                raise SourceTransferError("REMIX_DURATION_MISMATCH")
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
            response = request("POST",f"/api/sonara-relay/pro-job/{job}/complete",
                               {"actualDurationSeconds": float(audit["durationSeconds"]),
                                "singleTrack": True, "twoSources": True},lease)
            if response.get("ok") is not True:
                raise ProAgentError("Gateway completion not acknowledged")
        status("waiting_for_authorized_job", lastCompleted=job)
        print("SONARA PRO job completed:", job, flush=True)
    except Exception as error:
        code = error.code if isinstance(error, SourceTransferError) else "REMIX_PROCESSING_ERROR"
        if failure_phase in ("normalize_a", "normalize_b"):
            code = "SOURCE_DECODER_FAILED" if "conversion" in str(error).lower() else code
        print("SONARA PRO job failed:", job, code, failure_phase, flush=True)
        try:
            request("POST",f"/api/sonara-relay/pro-job/{job}/fail",
                    {"errorCode":code,"failurePhase":failure_phase},lease,timeout=30)
        except Exception:
            pass
        status("waiting_for_authorized_job", lastFailed=job,
               errorClass=type(error).__name__, errorCode=code,
               failurePhase=failure_phase)
    finally:
        shutil.rmtree(folder, ignore_errors=True)


def stop_handler(_signal, _frame):
    global STOP
    STOP=True


def main(argv=None):
    parser=argparse.ArgumentParser(description="Isolated SONARA Remix Pro agent")
    parser.add_argument("--auth-mode",choices=("none","required"),default="required")
    parser.add_argument("--once",action="store_true")
    parser.add_argument("--preflight",action="store_true",
                        help="Verify CUDA and authenticated Pro heartbeat; never claim a job")
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
    # Verify real CUDA kernels before any machine heartbeat or customer job.
    import torch
    import importlib.metadata
    if importlib.metadata.version("demucs") != "4.1.0":
        raise ProAgentError("Verified Demucs 4.1 is missing from the private environment")
    if not torch.cuda.is_available() or tuple(torch.cuda.get_device_capability(0)) != (12,0):
        raise ProAgentError("RTX PRO 6000 Blackwell CUDA not ready")
    if "sm_120" not in torch.cuda.get_arch_list():
        raise ProAgentError("PyTorch lacks sm_120 support")
    with torch.no_grad():
        sample = torch.ones((8,8),device="cuda:0")
        if float((sample @ sample)[0,0]) != 8.0:
            raise ProAgentError("CUDA kernel test failed")
    print("SONARA Remix Pro agent initialized; independent HTTPS/443 queue.",flush=True)
    if args.preflight:
        beat = request("POST", "/api/sonara-relay/pro-heartbeat", pro_heartbeat_payload())
        if beat.get("authenticated") is not True:
            raise ProAgentError("Private Pro heartbeat not authenticated")
        caps = request("GET", "/api/sonara-relay/pro-capabilities")
        print("PRO_GPU_VERIFIED=True",flush=True)
        print("PRO_AGENT_AUTHENTICATED=True",flush=True)
        print("PRO_AGENT_REVISION="+REVISION,flush=True)
        print("PRO_SITE_GENERATION_AVAILABLE="+str(caps.get("available") is True),flush=True)
        print("PRO_BILLING_GATE_STILL_REQUIRED="+str(caps.get("available") is not True),flush=True)
        print("PRO_JOBS_CLAIMED=0",flush=True)
        print("ACE_STEP_UNMODIFIED=True",flush=True)
        status("preflight_ready")
        return
    last_gate_pending = None
    while not STOP:
        try:
            request("POST","/api/sonara-relay/pro-heartbeat",pro_heartbeat_payload())
            if pro_activation_pending():
                if last_gate_pending is not True:
                    print("SONARA PRO standby: GPU/auth ready; awaiting Remix Pro activation.",flush=True)
                last_gate_pending = True
                if args.once:
                    break
                time.sleep(20)
                continue
            last_gate_pending = False
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
