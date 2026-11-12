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
    "sonara_remix_pro_fusion.py",
    "sonara_remix_pro_original_voices.py",
    "sonara_remix_pro_a_clock_fusion.py",
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
from sonara_remix_pro_fusion import (
    make_structural_guide, make_dual_hook_conditioning_guide, make_independent_style_reference, build_fusion_prompt,
    select_fusion_tempo, ensure_distinct_sources,
)
import soundfile as sf

ROOT = Path("/marimo/SONARA-REMIX-PRO")
PRIVATE = ROOT / "private-jobs"
HOME = Path.home() / ".sonara"
TOKEN_FILE = HOME / "relay.token"
STATUS_FILE = HOME / "remix-pro-agent-status.json"
LOCK_FILE = HOME / "remix-pro-agent.lock"
BASE = "https://api.sonaraenterprise.com/api/sonara-relay"
REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"
MAX_WAV_BYTES = 512 * 1024 * 1024
SOURCE_FORMATS = frozenset(("wav","mp3","flac","m4a","mp4","mov","m4v","aac","ogg",
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


def confirm_gateway_completion(job, lease, payload, attempts=5):
    """Verify final R2 commitment without recreating a job or hiding errors.

    A response can be lost after the server commits the WAV. On a temporary
    network error, query the lease-bound private receipt before retrying.
    The endpoint never returns customer data, tokens or audio content.
    """
    endpoint = f"/api/sonara-relay/pro-job/{job}"
    last_error = None
    for index in range(attempts):
        try:
            reply = request("POST", endpoint + "/complete",
                            payload, lease, timeout=50)
            if reply.get("ok") is True:
                return
            last_error = ProAgentError("Completion was not acknowledged")
        except (ProAgentError, urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
        try:
            receipt = request("GET", endpoint + "/receipt", lease=lease, timeout=20)
            if receipt.get("ok") is True and receipt.get("completed") is True:
                return
            # An active, unchanged lease is safe for another attempt. Never
            # retry an expired or stolen lease and never create another job.
            if receipt.get("ok") is not True or receipt.get("completed") is not False:
                raise ProAgentError("Completion receipt is not safely retryable")
        except (ProAgentError, urllib.error.URLError, TimeoutError, OSError):
            # Unknown receipt status must not be treated as confirmed.
            # A bounded retry may still recover from a transient outage.
            if index + 1 >= attempts:
                break
        if index + 1 < attempts:
            time.sleep(min(2 * (index + 1), 6))
    raise ProAgentError("Gateway completion and private receipt not confirmed") from last_error


FAILURE_STEPS = frozenset((
    "download_a", "download_b", "normalize_a", "normalize_b",
    "analysis", "demucs_a", "demucs_b", "fusion_plan",
    "ace_step", "vocal_fusion", "mastering", "quality_gate",
    "upload", "completion",
))
FAILURE_CODES = {
    "analysis": "REMIX_ANALYSIS_FAILED",
    "demucs_a": "REMIX_DEMUCS_FAILED",
    "demucs_b": "REMIX_DEMUCS_FAILED",
    "fusion_plan": "REMIX_FUSION_PLAN_FAILED",
    "ace_step": "REMIX_ACE_STEP_FAILED",
    "vocal_fusion": "REMIX_VOCAL_FUSION_FAILED",
    "mastering": "REMIX_MASTERING_FAILED",
    "quality_gate": "REMIX_AUDIO_QUALITY_REJECTED",
    "upload": "REMIX_UPLOAD_FAILED",
    "completion": "REMIX_COMPLETION_FAILED",
}
FAILURE_CODE_SET = frozenset(FAILURE_CODES.values()) | frozenset((
    "REMIX_PROCESSING_ERROR", "REMIX_DURATION_MISMATCH", "REMIX_INVALID_DURATION",
    "SOURCE_DECODER_FAILED",
))
# Diagnostic codes are strictly allowlisted: no user text, identifiers or waveform
# data is ever persisted in the status file or written to the agent log.
QUALITY_REASON_CODES = frozenset(
    name + "-" + reason
    for name in ("arranged", "generated", "master")
    for reason in ("duration-mismatch", "excessive-silence",
                   "sample-clipping", "overcompressed")
) | frozenset((
    "master-true-peak-too-high",
    "missing-useful-output-spectral-data",
    "spectral-band-0-collapsed",
    "spectral-band-1-collapsed",
    "spectral-band-2-collapsed",
    "mastering-safety",
    "master-too-quiet",
    "explosive-unwanted-rhythmic-break",
))


def safe_quality_codes(values):
    if not isinstance(values, (list, tuple, set)):
        return []
    return sorted({v for v in values
                   if isinstance(v, str) and v in QUALITY_REASON_CODES})[:16]


# Only class *names* from this fixed list may persist in local diagnostics.
# Never persist raw exception messages, tracebacks, customer paths, job IDs or audio.
SAFE_FAILURE_EXCEPTION_CLASSES = frozenset((
    "MemoryError", "ValueError", "TypeError", "OSError", "RuntimeError",
    "RemixProError", "OneClockFusionError", "V5ControlError",
    "V5QualityRejected", "V6ControlError", "ProAgentError",
    "SourceTransferError", "TimeoutError", "FileNotFoundError",
    "PermissionError", "AssertionError", "AttributeError", "KeyError",
    "IndexError", "ZeroDivisionError", "OverflowError",
    "UnboundLocalError", "NameError", "SoundFileRuntimeError",
    "LinAlgError", "OtherException",
))
SAFE_FAILURE_KINDS = frozenset((
    "measured_audio_rejection", "quality_stage_exception", "other_failure",
))


def safe_failure_exception_class(value):
    candidate = value if isinstance(value, str) else type(value).__name__
    return (candidate if candidate in SAFE_FAILURE_EXCEPTION_CLASSES
            else "OtherException")


def classify_failure_code(error, *, step, phase, quality_codes):
    """Only measured technical vetoes may be reported as 'audio rejected'.

    Previously *any* exception while the agent was in its quality_gate stage
    became REMIX_AUDIO_QUALITY_REJECTED even without a QC verdict; this masked
    runtime failures and caused repeated ineffective threshold changes.
    """
    if isinstance(error, SourceTransferError):
        return error.code
    if phase in ("normalize_a", "normalize_b"):
        return "SOURCE_DECODER_FAILED"
    if step == "quality_gate":
        return ("REMIX_AUDIO_QUALITY_REJECTED"
                if safe_quality_codes(quality_codes)
                else "REMIX_PROCESSING_ERROR")
    return FAILURE_CODES.get(step, "REMIX_PROCESSING_ERROR")


def status(state, **safe):
    HOME.mkdir(mode=0o700, exist_ok=True)
    safe_data = {"revision": REVISION, "state": state, "updatedAt": int(time.time()), **safe}
    if "lastQualityFailureCodes" in safe:
        safe_data["lastQualityFailureCodes"] = safe_quality_codes(safe["lastQualityFailureCodes"])
    if "lastFailureExceptionClass" in safe:
        safe_data["lastFailureExceptionClass"] = safe_failure_exception_class(
            safe["lastFailureExceptionClass"])
    if "lastFailureKind" in safe:
        safe_data["lastFailureKind"] = (
            safe["lastFailureKind"]
            if safe["lastFailureKind"] in SAFE_FAILURE_KINDS else "other_failure")
    # Preserve only fixed, non-sensitive failure codes between idle polls.
    # Never retain a user ID, job ID, source path, token, prompt or traceback.
    if "lastFailureCode" not in safe and state != "processing":
        try:
            previous = json.loads(STATUS_FILE.read_text(encoding="utf-8"))
            if (isinstance(previous, dict)
                    and previous.get("lastFailureCode") in FAILURE_CODE_SET
                    and previous.get("lastFailureStep") in FAILURE_STEPS
                    and time.time() - float(previous.get("lastFailureAt") or 0) < 86400):
                safe_data["lastFailureCode"] = previous["lastFailureCode"]
                safe_data["lastFailureStep"] = previous["lastFailureStep"]
                safe_data["lastFailureAt"] = previous["lastFailureAt"]
                safe_data["lastQualityFailureCodes"] = safe_quality_codes(
                    previous.get("lastQualityFailureCodes", [])
                )
                safe_data["lastFailureExceptionClass"] = safe_failure_exception_class(
                    previous.get("lastFailureExceptionClass", "OtherException")
                )
                previous_kind = previous.get("lastFailureKind")
                if previous_kind in SAFE_FAILURE_KINDS:
                    safe_data["lastFailureKind"] = previous_kind
        except (OSError, ValueError, TypeError):
            pass
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
    """Inspect the first audio track, ignoring video, artwork and subtitles.

    FFmpeg normalization maps 0:a:0 explicitly and discards all non-audio
    streams. Keep local-file-only probing and the existing duration/codec
    constraints. Multiple audio tracks are allowed; the first is selected.
    """
    if not multiformat_ready():
        raise SourceTransferError("SOURCE_DECODER_UNAVAILABLE")
    try:
        probe = subprocess.run(
            ["ffprobe", "-v", "error", "-protocol_whitelist", "file",
             "-show_entries",
             "stream=codec_type,channels,sample_rate,duration:format=duration",
             "-of", "json", str(path)],
            check=True, capture_output=True, text=True, timeout=45
        )
        metadata = json.loads(probe.stdout)
        streams = metadata.get("streams") or []
        audio_streams = [stream for stream in streams
                         if stream.get("codec_type") == "audio"]
        if not audio_streams:
            raise SourceTransferError("SOURCE_STREAM_UNSUPPORTED")
        selected = audio_streams[0]
        rate = int(selected.get("sample_rate") or 0)
        channels = int(selected.get("channels") or 0)
        # Video duration can differ from the music. Prefer the selected
        # audio stream's real length, falling back to container metadata.
        try:
            duration = float(selected.get("duration"))
        except (TypeError, ValueError):
            duration = 0.0
        if duration <= 0:
            duration = float((metadata.get("format") or {}).get("duration") or 0)
    except SourceTransferError:
        raise
    except (ValueError, KeyError, TypeError, subprocess.SubprocessError, OSError) as exc:
        raise SourceTransferError("SOURCE_UNREADABLE_AUDIO") from exc
    if not duration >= 10:
        raise SourceTransferError("SOURCE_DURATION_TOO_SHORT")
    if duration > 900:
        raise SourceTransferError("SOURCE_DURATION_TOO_LONG")
    # Accept bounded genuine multichannel/high-rate input only for controlled
    # downmix/resample into a normal PCM24 stereo WAV before model inference.
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
    # Advertise V5 only if the isolated module can be imported.
    try:
        import sonara_remix_pro_v5 as v5
        ready = callable(v5.render_candidates)
    except (ImportError, AttributeError):
        ready = False
    v6_ready = False
    explosive_ready = False
    if ready:
        try:
            from sonara_remix_pro_v6 import v6_controls, musical_dna, compose_direction, creative_judge, master_v6
            v6_ready = all(callable(x) for x in (
                v6_controls, musical_dna, compose_direction, creative_judge, master_v6))
            if v6_ready:
                from sonara_remix_pro_v6 import MODES
                explosive_ready = ('explosive' in MODES and
                    callable(make_dual_hook_conditioning_guide))
        except (ImportError, AttributeError):
            pass
    v7_ready = False
    if v6_ready:
        try:
            from sonara_remix_pro_v7 import (
                arrange_vocal_phrases, harmonic_guidance,
                authentic_a_groove_gain, measured_candidate_priority,
                mastering_safety_snapshot)
            from sonara_remix_pro_a_clock_fusion import V7_FUSION_REVISION
            from sonara_remix_pro_v5 import V7_CANDIDATE_REVISION
            v7_ready = (
                V7_FUSION_REVISION == 'v7-authentic-phrase-groove-v1'
                and V7_CANDIDATE_REVISION == 'v7-measured-candidate-harmony-v1'
                and all(callable(x) for x in (
                    arrange_vocal_phrases, harmonic_guidance,
                    authentic_a_groove_gain, measured_candidate_priority,
                    mastering_safety_snapshot)))
        except (ImportError, AttributeError):
            pass
    creative_modes_ready = False
    if v7_ready:
        try:
            from sonara_remix_pro_v6 import V7_MODES_REVISION
            from sonara_remix_pro_v7 import (
                V7_MODE_AUDIO_REVISION, creative_accompaniment_gain)
            creative_modes_ready = (
                V7_MODES_REVISION == "sonara-v7-mode-differentiation-r1"
                and V7_MODE_AUDIO_REVISION == "sonara-v7-creative-voice-motion-r1"
                and callable(creative_accompaniment_gain))
        except (ImportError, AttributeError):
            pass
    rhythm_ready = False
    if v7_ready:
        try:
            from sonara_remix_pro_v7_rhythm import (
                REVISION, rhythm_controls, measure_a_rhythm, retime_real_a_loop)
            rhythm_ready = (REVISION == "sonara-v7-rhythm-lock-v1"
                and all(callable(x) for x in (
                    rhythm_controls, measure_a_rhythm, retime_real_a_loop)))
        except (ImportError, AttributeError):
            pass
    song_form_ready = False
    if v7_ready:
        try:
            from sonara_remix_pro_songform import (
                SONGFORM_REVISION, plan_song_form, section_gains)
            song_form_ready = (
                SONGFORM_REVISION == "sonara-v8-songform-conditional-v1"
                and callable(plan_song_form) and callable(section_gains))
        except (ImportError, AttributeError):
            pass
    return {"gpuReady": True, "formatsReady": multiformat_ready(),
            "v5Ready": ready, "v6Ready": v6_ready, "v7Ready": v7_ready,
            "v7RhythmReady": rhythm_ready,
            "v7CreativeModesReady": creative_modes_ready,
            "v8SongFormReady": song_form_ready,
            "v6ExplosiveReady": explosive_ready}


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
    failure_step = "download_a"
    quality_codes = []
    try:
        with Renewer(job, lease) as renewal:
            progress(job, lease, "downloading", renewal)
            original_a = download_source(job, lease, "a", "source-a", folder,
                                         item.get("sourceFormatA") or "wav")
            failure_phase = "source_b"
            failure_step = "download_b"
            original_b = download_source(job, lease, "b", "source-b", folder,
                                         item.get("sourceFormatB") or "wav")
            failure_phase = "normalize_a"
            failure_step = "normalize_a"
            a = normalized_audio_source(original_a, folder / "normalized-a.wav")
            failure_phase = "normalize_b"
            failure_step = "normalize_b"
            b = normalized_audio_source(original_b, folder / "normalized-b.wav")
            ensure_distinct_sources(a, b)
            failure_phase = "processing"
            failure_step = "analysis"
            progress(job, lease, "analyzing", renewal)
            report_a = analyze_audio(a)
            report_b = analyze_audio(b)
            if params.get("v6") is True:
                # Never adopt B's BPM when A is the authoritative house clock.
                # Without a credible A pulse, require the creator's A BPM.
                bpm_a = select_fusion_tempo(params.get("bpmA"), report_a, None, {})
                if bpm_a is None and params.get("v7RhythmControls") is None:
                    raise ProAgentError("Remix V6 requires source A tempo or explicit BPM A")
            else:
                bpm_a = select_fusion_tempo(params.get("bpmA"), report_a,
                                             params.get("bpmB"), report_b)
            # Uncertain BPM is legitimate for ambient and syncopated music.
            # ACE-Step can derive the pulse from its two audio references.
            # No synthesized or guessed BPM values are supplied.
            progress(job, lease, "separating", renewal)
            env_cache = ROOT / "model-cache"
            os.environ["TORCH_HOME"] = str(env_cache)
            os.environ["XDG_CACHE_HOME"] = str(ROOT / "private-cache")
            failure_step = "demucs_a"
            manifest_a = separate_stems(a, stem_cache, device="cuda")
            failure_step = "demucs_b"
            manifest_b = separate_stems(b, stem_cache, device="cuda")
            source_a = stem_cache / manifest_a["sourceSha256"][:20]
            source_b = stem_cache / manifest_b["sourceSha256"][:20]
            rhythm_data = None
            if params.get("v7RhythmControls") is not None:
                failure_step = "rhythm_lock"
                if params.get("v7Studio") is not True:
                    raise ProAgentError("Rhythm Lock requires authenticated V7")
                from sonara_remix_pro_v7_rhythm import (
                    rhythm_controls, measure_a_rhythm)
                controls = rhythm_controls(params["v7RhythmControls"])
                if controls["tempoMode"] == "manual" and params.get("bpmA") is None:
                    raise ProAgentError("Manual A tempo is required for Rhythm Lock")
                rhythm_data = measure_a_rhythm(
                    source_a / "drums.wav",
                    report_bpm=report_a.get("tempoBpm"),
                    requested_bpm=params.get("bpmA"),
                    tempo_mode=controls["tempoMode"])
                rhythm_data.update({
                    "vocalGrid": controls["vocalGrid"],
                    "phraseBars": controls["phraseBars"]})
                bpm_a = rhythm_data["outputBpm"]
            failure_step = "fusion_plan"
            progress(job, lease, "arranging", renewal)
            requested_seconds = int(params.get("durationSec") or 60)
            if requested_seconds not in range(30, 481, 30):
                raise SourceTransferError("REMIX_INVALID_DURATION")

            song_form = None
            if params.get("v8SongForm") is True:
                if pro_heartbeat_payload().get("v8SongFormReady") is not True:
                    raise ProAgentError("V8 song form worker is not fully installed")
                if params.get("v7Studio") is not True or params.get("v6") is not True:
                    raise ProAgentError("V8 song form requires V7 Studio and V6 original-source path")
                if bpm_a is None:
                    raise ProAgentError("V8 song form needs a verified A tempo")
                from sonara_remix_pro_songform import plan_song_form
                song_form = plan_song_form(
                    requested_seconds, bpm_a,
                    b_influence=int(params.get("bInfluence", 50)))
            # In V6, BOTH real source hooks reach ACE-Step's primary
            # conditioning guide in short alternating phrases. B is also an
            # independent style reference. This is a PRIVATE GUIDE only:
            # the final music must be newly generated, not a PCM mashup.
            explosive = (params.get('v6') is True and
                isinstance(params.get('v6Controls'), dict) and
                params['v6Controls'].get('mode') == 'explosive')
            guide = folder / ('dual-hook-guide-ab.wav' if params.get('v6') is True
                              else 'structural-guide-a.wav')
            style = folder / 'style-reference-b.wav'
            if params.get('v6') is True:
                guide_report = make_dual_hook_conditioning_guide(
                    a, b, guide, requested_seconds,
                    vocals_a=source_a / 'vocals.wav',
                    vocals_b=source_b / 'vocals.wav',
                    b_influence=int(params.get('bInfluence', 50)),
                    homogeneous=explosive,
                    song_form=song_form,
                )
                if (guide_report.get('containsSourceA') is not True or
                        guide_report.get('containsSourceB') is not True or
                        guide_report.get('publishableAudio') is not False or
                        guide_report.get('sourceBGuideSeconds', 0) < 8):
                    raise ProAgentError('A+B dual-source conditioning was not verified')
            else:
                guide_report = make_structural_guide(a, guide, requested_seconds)
                if guide_report.get('containsSourceB') is not False:
                    raise ProAgentError('Legacy structural guide unexpectedly includes B')
            style_report = make_independent_style_reference(
                b, style, activity_audio_path=source_b / 'drums.wav')
            if style_report.get('containsSourceA') is not False:
                raise ProAgentError('Independent B reference was modified')
            # Check actual B reference audio before incurring a GPU job.
            # This verifies an audible reference, never proves stylistic fusion.
            style_audit = audit_wav(style)
            if (style_audit.get("integratedLufs") is None
                    or style_audit.get("nearSilenceFrameRatio", 1) > 0.70
                    or style_audit.get("rmsDbFs", -120) < -52):
                raise ProAgentError("B style reference is too quiet for reliable conditioning")
            prompt = build_fusion_prompt(
                str(params.get("prompt") or ""), report_a, report_b,
                target_bpm=bpm_a, target_key=params.get("key") or report_a.get("key"),
                bass_from=params.get("bassFrom") or "a",
                requested_seconds=requested_seconds,
                explosive=explosive,
            )
            failure_step = "ace_step"
            progress(job, lease, "regenerating", renewal)
            if params.get("v5") is True:
                from sonara_remix_pro_v5 import render_candidates, v5_controls, V5QualityRejected
                v5_controls(params, requested_seconds)
                if params.get("v6") is True:
                    from sonara_remix_pro_v6 import v6_controls
                    v6_controls(params)
                if params.get("v7Studio") is True:
                    if params.get("v6") is not True:
                        raise ProAgentError("V7 Studio requires verified V6")
                    from sonara_remix_pro_v7 import V7_REVISION
                    if V7_REVISION != "sonara-v7-deep-fusion-safe-v1":
                        raise ProAgentError("Unexpected V7 revision")
                def mark_render_phase(stage):
                    nonlocal failure_step
                    if stage not in ("ace_step", "vocal_fusion", "mastering", "quality_gate"):
                        raise ProAgentError("Unrecognized private render stage")
                    failure_step = stage

                try:
                    choice = render_candidates(
                        guide=guide, style=style, folder=folder,
                        base_prompt=prompt,
                        params={**params, "creatorPrompt": str(params.get("prompt") or "")[:1800],
                                **({"sourceReportA": report_a,
                                           "sourceReportB": report_b}
                                          if params.get("v6") is True else {}),
                                **({"v7Rhythm": rhythm_data}
                                   if rhythm_data is not None else {}),
                                **({"v8SongFormPlan": song_form}
                                   if song_form is not None else {})},
                        b_drums=(source_a if params.get("v6") is True else source_b) / "drums.wav", engine=ace_cover,
                        vocals_a=source_a / "vocals.wav",
                        vocals_b=source_b / "vocals.wav",
                        a_drums=source_a / "drums.wav",
                        mode=auth_mode, bpm=bpm_a,
                        key=params.get("key") or report_a.get("key") or None,
                        lease_check=lambda step: renewal.verify(),
                        phase_callback=mark_render_phase,
                    )
                except V5QualityRejected as exc:
                    failure_step = "quality_gate"
                    quality_codes = safe_quality_codes(str(exc).split(","))
                    if quality_codes:
                        print("SONARA PRO quality failure codes:",
                              ",".join(quality_codes), flush=True)
                    raise
                master_file, audit = choice["master"], choice["audit"]
                v5_metadata = {
                    "candidateCount": choice["candidatesGenerated"],
                    "acceptedCandidates": choice["candidatesAccepted"],
                    "technicalScore": choice["technicalScore"],
                    "artisticListeningRequired": True,
                }
                if params.get("v6") is True:
                    preserved = choice.get("originalVoices")
                    if not isinstance(preserved, dict) or preserved.get(
                        "modelGeneratedLeadVocalsRetained") is not False:
                        raise ProAgentError("Original A/B voice preservation was not verified")
                    v5_metadata["originalVoicesAAndB"] = {
                        "sourceAUsed": preserved.get("originalVoiceAUsed") is True,
                        "sourceBUsed": preserved.get("originalVoiceBUsed") is True,
                        "translationPerformed": False,
                        "separatedSourceVocals": True,
                    }
                    v6_metadata = choice.get("v6Judge") or {}
                    v5_metadata["v6Selection"] = {
                        "selectionScore": v6_metadata.get("selectionScore"),
                        "spectralDiversityProxy": v6_metadata.get("spectralDiversityProxy"),
                        "continuityProxy": v6_metadata.get("continuityProxy"),
                        "isArtisticJudgment": False,
                    }
                    v5_metadata["v6Master"] = params.get("v6Controls", {}).get("master", "streaming")
                    if params.get("v7Studio") is True:
                        if song_form is not None:
                            v5_metadata["v8SongForm"] = {
                                "revision": song_form["revision"],
                                "sectionNames": [s["name"] for s in song_form["sections"]],
                                "estimatedGridNotVerifiedDownbeat": True,
                                "artisticListeningRequired": True,
                            }
                        if rhythm_data is not None:
                            measured_rhythm = preserved.get("v7RhythmLock")
                            if not isinstance(measured_rhythm, dict) or abs(
                                    float(measured_rhythm.get("outputBpm", 0))
                                    - float(rhythm_data["outputBpm"])) > .05:
                                raise ProAgentError("V7 rhythm report does not match the verified A clock")
                        measurements = choice.get("v7Measurements")
                        mode_used = params.get("v6Controls", {}).get("mode")
                        if (not isinstance(measurements, dict) or
                                measurements.get("creativeMode") != mode_used or
                                preserved.get("creativeModeApplied") != mode_used):
                            raise ProAgentError("Selected creative mode was not applied to actual audio")
                        if not isinstance(
                                measurements.get("master"), dict):
                            raise ProAgentError("V7 measured mastering not verified")
                        v5_metadata["v7Result"] = {
                            "measuredSelectionPriority": measurements.get("priority"),
                            "master": measurements.get("master"),
                            "harmonicEstimate": measurements.get("harmonicEstimate"),
                            "creativeMode": mode_used,
                            "originalVoiceContractVerified": True,
                            "oneClockSourceA": preserved.get("oneClockSource")
                                == "original-A-demucs-drums",
                            **({"rhythm": {
                                "sourceBpm": rhythm_data["sourceBpm"],
                                "outputBpm": rhythm_data["outputBpm"],
                                "confidence": rhythm_data["confidence"],
                                "retimeRatio": rhythm_data["retimeRatio"],
                                "beatGridBasis": rhythm_data["beatGridBasis"],
                                "meter": rhythm_data["meter"],
                                "phraseBars": rhythm_data["phraseBars"],
                                "vocalGrid": rhythm_data["vocalGrid"],
                            }} if rhythm_data is not None else {}),
                        }
            else:
                failure_step = "ace_step"
                progress(job, lease, "regenerating", renewal)
                generated = folder / "generated.wav"
                result = ace_cover(
                    guide, generated, prompt,
                    mode=auth_mode,
                    strength=float(params.get("coverStrength") if params.get("coverStrength") is not None else .72),
                    noise=float(params.get("coverNoise") if params.get("coverNoise") is not None else 0.0),
                    bpm=bpm_a,
                    key=params.get("key") or report_a.get("key") or None,
                    reference_audio_path=style,
                )
                if result.get("durationVerified") is not True or result.get("oneContinuousOutput") is not True:
                    raise SourceTransferError("REMIX_DURATION_MISMATCH")
                if result.get("status")!="completed":
                    raise ProAgentError("Local ACE-Step did not complete the job")
                failure_step = "mastering"
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
                failure_step = "quality_gate"
                gate = release_gate(
                    guide, generated, master_file,
                    expected_seconds=requested_seconds,
                    require_b_motif=True,
                )
                if not gate["acceptedTechnical"]:
                    # Log only allowlisted technical reason codes, never customer data.
                    quality_codes = safe_quality_codes(gate["failures"])
                    print("SONARA PRO quality failure codes:",
                          ",".join(quality_codes), flush=True)
                    raise ProAgentError("Post-cover audio quality gate rejected the result")
                if abs(float(audit.get("durationSeconds") or 0) - requested_seconds) > 0.1:
                    raise SourceTransferError("REMIX_DURATION_MISMATCH")
                if audit.get("integratedLufs") is None or audit.get("approxTruePeakDbTp", 0) > -0.8:
                    quality_codes = ["mastering-safety"]
                    raise ProAgentError("Mastering verification failed")
            failure_step = "upload"
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
            failure_step = "completion"
            confirm_gateway_completion(
                job, lease,
                {"actualDurationSeconds": float(audit["durationSeconds"]),
                 "singleTrack": True, "twoSources": True,
                 **(v5_metadata if params.get("v5") is True else {})}
            )
        status("waiting_for_authorized_job", lastCompleted=job, lastFailureCode=None)
        print("SONARA PRO job completed:", job, flush=True)
    except Exception as error:
        code = classify_failure_code(
            error, step=failure_step, phase=failure_phase,
            quality_codes=quality_codes)
        safe_class = safe_failure_exception_class(error)
        failure_kind = (
            "measured_audio_rejection" if code == "REMIX_AUDIO_QUALITY_REJECTED"
            else "quality_stage_exception" if failure_step == "quality_gate"
            else "other_failure")
        # Only the allowlisted class and fixed reason codes reach logs/status.
        if failure_step == "quality_gate":
            print("SONARA PRO quality gate diagnostic:",
                  failure_kind, safe_class, flush=True)
        print("SONARA PRO job failed:", job, code, failure_phase, failure_step, flush=True)
        try:
            request("POST",f"/api/sonara-relay/pro-job/{job}/fail",
                    {"errorCode":code,"failurePhase":failure_phase},lease,timeout=30)
        except Exception:
            pass
        status("waiting_for_authorized_job", lastFailed=job,
               errorClass=safe_class, errorCode=code,
               failurePhase=failure_phase, lastFailureCode=code,
               lastFailureStep=failure_step, lastFailureAt=int(time.time()),
               lastFailureExceptionClass=safe_class,
               lastFailureKind=failure_kind,
               lastQualityFailureCodes=quality_codes if failure_step == "quality_gate" else [])
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
    for name in ("sonara_remix_pro_toolkit.py","sonara_remix_pro_ace_bridge.py","sonara_remix_pro_fusion.py"):
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
        print("PRO_V5_AVAILABLE="+str(caps.get("v5Available") is True),flush=True)
        print("PRO_V6_AVAILABLE="+str(caps.get("v6Available") is True),flush=True)
        print("PRO_V7_AVAILABLE="+str(caps.get("v7Available") is True),flush=True)
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
            readiness = pro_heartbeat_payload()
            response = request("POST","/api/sonara-relay/pro-claim",
                               {"v5Ready": readiness.get("v5Ready") is True,
                                "v6Ready": readiness.get("v6Ready") is True,
                                "v8SongFormReady": readiness.get("v8SongFormReady") is True})
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
