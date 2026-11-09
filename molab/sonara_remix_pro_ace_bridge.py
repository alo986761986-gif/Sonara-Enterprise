"""Optional, explicit ACE-Step XL Turbo cover from a verified Remix Pro WAV.

This module never starts ACE-Step, changes the live relay, or sends public URLs.
Calling render() triggers exactly one real task on fixed 127.0.0.1:8001 and
polls that task without submitting duplicates. No test/demo audio is generated.
"""
from __future__ import annotations
import argparse
import json
import os
import pathlib
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
import wave

LOCAL = "http://127.0.0.1:8001"
KEY_FILE = pathlib.Path("/home/marimo/ACE-STEP/.sonara-api-key")
MAX_BYTES = 512 * 1024 * 1024


class ACEBridgeError(RuntimeError):
    pass


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def _headers(mode):
    if mode == "none":
        return {}
    if mode != "required":
        raise ACEBridgeError("Unknown local API auth mode")
    try:
        key = KEY_FILE.read_text(encoding="utf-8").strip()
    except OSError as exc:
        raise ACEBridgeError("Private local ACE-Step API key is unavailable") from exc
    if not key:
        raise ACEBridgeError("Private local API credential is empty")
    return {"Authorization": "Bearer " + key}


def _request(path, data=None, *, mode="required", timeout=40):
    if not path.startswith("/") or path.startswith("//"):
        raise ACEBridgeError("Local API path must be relative")
    # Proxyless loopback only. No arbitrary host, remote URLs or redirects.
    headers = {"Accept": "application/json", **_headers(mode)}
    raw = None if data is None else json.dumps(data).encode("utf-8")
    if raw is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(LOCAL + path, data=raw, method="POST" if raw else "GET", headers=headers)
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
    try:
        with opener.open(req, timeout=timeout) as response:
            result = response.read(MAX_BYTES + 1)
            if len(result) > MAX_BYTES:
                raise ACEBridgeError("Unexpected oversized local ACE-Step response")
            if "application/json" in response.headers.get("Content-Type", ""):
                body = json.loads(result)
                if not isinstance(body, dict) or body.get("error") or int(body.get("code", 200)) >= 400:
                    raise ACEBridgeError("Local ACE-Step returned an application error")
                return body
            return result
    except urllib.error.HTTPError as exc:
        raise ACEBridgeError("Local ACE-Step rejected the request (HTTP " + str(exc.code) + ")") from exc


def _status(value):
    text = str(value).lower().strip()
    if text in ("1", "success", "completed", "succeeded", "done", "finished"):
        return "complete"
    if text in ("2", "-1", "failed", "failure", "error", "cancelled", "canceled"):
        return "failed"
    return "pending"


def _result_path(task):
    raw = task.get("result") or []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except (ValueError, TypeError):
            raw = [{"audio_path": raw}]
    def find(value):
        if isinstance(value, list):
            for item in value:
                found = find(item)
                if found:
                    return found
        if isinstance(value, dict):
            for key in ("audio_path", "audio_file", "file", "path", "url", "audio", "outputs", "result"):
                if key in value:
                    found = find(value[key])
                    if found:
                        return found
        if isinstance(value, str):
            parsed = urllib.parse.urlsplit(value)
            if parsed.scheme and parsed.netloc and parsed.netloc not in ("127.0.0.1:8001", "api.sonaraenterprise.com"):
                return None
            path = urllib.parse.parse_qs(parsed.query).get("path", [None])[0]
            if path and path.startswith("/"):
                return path
            if value.startswith("/") and not value.startswith("/v1/audio"):
                return value
        return None
    return find(raw)


def render(audio_path, output_path, prompt, *, mode="required", strength=0.72,
           noise=0.0, timeout_seconds=1600, bpm=None, key=None,
           reference_audio_path=None):
    """Regenerate one composition from separate A structure and B style references."""
    source = pathlib.Path(audio_path).expanduser().resolve(strict=True)
    output = pathlib.Path(output_path).expanduser().resolve()
    if not source.is_file() or source.suffix.lower() != ".wav" or source.stat().st_size > MAX_BYTES:
        raise ACEBridgeError("Real WAV source required, under 512 MiB")
    if not str(prompt).strip():
        raise ACEBridgeError("An explicit musical remix instruction is required")
    if not 0.35 <= strength <= 0.92 or not 0.0 <= noise <= 0.30:
        raise ACEBridgeError("Invalid cover conditioning strength")
    if bpm is not None and not 40 <= bpm <= 220:
        raise ACEBridgeError("BPM outside verified range")
    with wave.open(str(source), "rb") as wav:
        duration = wav.getnframes() / wav.getframerate()
    if not 10 <= duration <= 600:
        raise ACEBridgeError("Remix Pro cover duration outside 10-600 seconds")
    try:
        reference = pathlib.Path(reference_audio_path).expanduser().resolve(strict=True) if reference_audio_path else None
    except (OSError, RuntimeError) as exc:
        raise ACEBridgeError("B style reference is missing or unavailable") from exc
    if reference is not None:
        if reference == source or reference.suffix.lower() != ".wav" or reference.stat().st_size > MAX_BYTES:
            raise ACEBridgeError("B must be a distinct genuine WAV style reference")
        with wave.open(str(reference), "rb") as refwav:
            if refwav.getnframes() < refwav.getframerate() * 10:
                raise ACEBridgeError("B style reference is too short")
    if output == source or output.exists() or (reference is not None and output == reference):
        raise ACEBridgeError("Output must be new; original and existing files are protected")
    fd, tmp = tempfile.mkstemp(prefix="sonara_pro_cover_", suffix=".wav")
    ref_tmp = None
    try:
        with os.fdopen(fd, "wb") as out, source.open("rb") as inp:
            while True:
                block = inp.read(1024 * 1024)
                if not block:
                    break
                out.write(block)
        if reference is not None:
            # ACE-Step accepts only paths inside its trusted temporary directory.
            # Keep B separate from A, copy it to a private 0600 temp file and
            # retain it until the asynchronous model task has completed.
            ref_fd, ref_tmp = tempfile.mkstemp(prefix="sonara_pro_style_", suffix=".wav")
            with os.fdopen(ref_fd, "wb") as ref_out, reference.open("rb") as ref_in:
                while True:
                    block = ref_in.read(1024 * 1024)
                    if not block:
                        break
                    ref_out.write(block)
        request = {
            "task_type": "cover", "src_audio_path": tmp,
            **({"reference_audio_path": ref_tmp} if ref_tmp is not None else {}),
            "prompt": str(prompt).strip()[:9000], "instruction": str(prompt).strip()[:9000],
            "audio_duration": round(duration, 2), "batch_size": 1,
            "audio_cover_strength": float(strength), "cover_noise_strength": float(noise),
            "audio_format": "wav",
            **({"bpm": int(bpm)} if bpm is not None else {}),
            **({"key_scale": str(key)[:40]} if key else {}),
        }
        answer = _request("/release_task", request, mode=mode, timeout=120)
        obj = answer.get("data", answer)
        task_id = obj.get("task_id") if isinstance(obj, dict) else None
        if not task_id:
            raise ACEBridgeError("ACE-Step did not return a real task ID")
        deadline = time.monotonic() + min(timeout_seconds, 1600)
        while time.monotonic() < deadline:
            response = _request("/query_result", {"task_id_list": [task_id]}, mode=mode, timeout=50)
            items = response.get("data", [])
            item = items[0] if isinstance(items, list) and items else items if isinstance(items, dict) else {}
            status = _status(item.get("status")) if item else "pending"
            if status == "failed":
                raise ACEBridgeError("ACE-Step reported a failed cover task")
            if status == "complete":
                audio = _result_path(item)
                if not audio:
                    raise ACEBridgeError("ACE-Step result did not contain an audio path")
                path_arg = urllib.parse.urlencode({"path": audio})
                raw = _request("/v1/audio?" + path_arg, mode=mode, timeout=120)
                if not isinstance(raw, bytes) or len(raw) < 44 or raw[:4] != b"RIFF" or raw[8:12] != b"WAVE":
                    raise ACEBridgeError("ACE-Step result is not a real RIFF/WAV")
                output.parent.mkdir(parents=True, exist_ok=True)
                if output.exists():
                    raise ACEBridgeError("Output already exists; refusing to overwrite")
                output.write_bytes(raw)
                return {
                    "status": "completed", "taskId": str(task_id),
                    "sourceDurationSeconds": round(duration, 2),
                    "outputPath": str(output), "bytes": len(raw),
                    "model": "existing-local-ACE-Step-cover",
                    "noFakeAudio": True,
                    "independentStyleReference": reference is not None
                }
            time.sleep(2)
        raise ACEBridgeError("ACE-Step cover timed out; task was not duplicated")
    finally:
        pathlib.Path(tmp).unlink(missing_ok=True)
        if ref_tmp is not None:
            pathlib.Path(ref_tmp).unlink(missing_ok=True)


def _continuous_section_prompt(master_prompt, index, start_frame, end_frame, total_frames):
    """Keep one recognizable hook across long ACE-Step cover chunks.

    Sections are performance directions, not fake song data. Only the actual
    generator writes the audio; each output is independently audited.
    """
    if total_frames <= 0 or end_frame <= start_frame:
        raise ACEBridgeError("Invalid arrangement section bounds")
    first = start_frame == 0
    last = end_frame >= total_frames
    position = start_frame / total_frames
    if first and last:
        role = "single complete musical statement with a resolved final cadence"
    elif first:
        role = "introduce the central motif immediately and establish the main groove"
    elif last:
        role = "bring back the SAME central hook with a confident musical resolution"
    elif position < .50:
        role = "develop the established hook with a controlled new instrumental variation"
    else:
        role = "contrast briefly then return towards the SAME hook and rhythmic foundation"
    direction = (
        "CONTINUOUS ARRANGEMENT SECTION " + str(index + 1) +
        ": " + role + ". Keep one stable BPM, key, vocal identity, drum kit, "
        "bass line style, acoustic space and overall mix balance from adjacent "
        "sections. No unrelated new song, no reset to a fresh intro, no "
        "random melodies. Maintain expressive fills and natural movement. "
        "Finish phrases musically at the boundary; preserve motif identity. "
    )
    # Prepend the section direction: otherwise a 9000-char creator prompt can
    # truncate every section instruction, repeating the same intro.
    return (direction + str(master_prompt).strip())[:9000]


def render_long_remix(audio_path, output_path, prompt, *, mode="required",
                      strength=0.72, noise=0.0, bpm=None, key=None,
                      segment_seconds=90, crossfade_seconds=2,
                      timeout_seconds=3600, reference_audio_path=None):
    """Render an exact-duration A+B remix as ONE stitched WAV.

    ACE-Step cover is applied to contiguous source segments (never to fake
    audio). Longer songs must not be silently reduced to a short single task.
    Every successful segment is real model output, audited for matching duration.
    Uses an A-only structural guide and an independent B-style reference.
    No source-A/B waveform mixing is performed by this bridge.
    """
    import math
    import shutil
    import soundfile as sf
    import numpy as np
    from scipy.signal import resample_poly

    src = pathlib.Path(audio_path).expanduser().resolve(strict=True)
    final = pathlib.Path(output_path).expanduser().resolve()
    if src == final or final.exists():
        raise ACEBridgeError("Output must be new and the source must be preserved")
    if src.suffix.lower() != ".wav" or src.stat().st_size > MAX_BYTES:
        raise ACEBridgeError("A genuine WAV source is required")
    if not 30 <= segment_seconds <= 100 or not 0.5 <= crossfade_seconds <= 4:
        raise ACEBridgeError("Invalid long-form chunk configuration")
    if crossfade_seconds >= segment_seconds / 6:
        raise ACEBridgeError("Crossfade cannot exceed the segment duration")

    with sf.SoundFile(str(src)) as wav:
        sr = wav.samplerate
        source_frames = wav.frames
        if not 22050 <= sr <= 96000 or wav.channels not in (1, 2):
            raise ACEBridgeError("Long-form source sample rate or channels unsupported")
        if not 10 <= source_frames / sr <= 480:
            raise ACEBridgeError("Long-form source duration outside 10-480 seconds")

    # Short songs retain exactly one genuine model task.
    if source_frames / sr <= segment_seconds:
        result = render(src, final, prompt, mode=mode, strength=strength,
                        noise=noise, bpm=bpm, key=key,
                        timeout_seconds=min(timeout_seconds, 1600),
                        reference_audio_path=reference_audio_path)
        with sf.SoundFile(str(final)) as got:
            if abs((got.frames / got.samplerate) - source_frames/sr) > 2:
                final.unlink(missing_ok=True)
                raise ACEBridgeError("ACE-Step returned a shortened cover instead of requested music")
        return {**result, "longForm": False, "segmentCount": 1,
                "oneContinuousOutput": True, "durationVerified": True}

    overlap = int(round(crossfade_seconds * sr))
    take = int(round(segment_seconds * sr))
    step = take - overlap
    if step <= overlap:
        raise ACEBridgeError("Invalid overlap configuration")
    segments = []
    # Use a private temp root for segment source, model outputs and the
    # assembled final; it is removed even if a model task fails.
    with tempfile.TemporaryDirectory(prefix="sonara-pro-longform-") as td:
        tmp = pathlib.Path(td)
        cursor = 0
        start_wall = time.monotonic()
        while cursor < source_frames:
            end = min(source_frames, cursor + take)
            # Fold a final tail shorter than ten seconds into this section,
            # rather than leaving an unrendered gap or generating fake padding.
            if 0 < source_frames - (cursor + step) < 10 * sr:
                end = source_frames
            with sf.SoundFile(str(src)) as input_file:
                input_file.seek(cursor)
                audio = input_file.read(end - cursor, dtype="float32", always_2d=True)
            if len(audio) < sr * 10:
                # Last tiny tail is included in the previous segment instead.
                if not segments:
                    raise ACEBridgeError("Long-form source segment too short")
                break
            n = len(segments)
            source_chunk = tmp / ("source-%03d.wav" % n)
            rendered_chunk = tmp / ("rendered-%03d.wav" % n)
            sf.write(str(source_chunk), audio, sr, subtype="PCM_24")
            remaining = timeout_seconds - (time.monotonic() - start_wall)
            if remaining < 120:
                raise ACEBridgeError("Long-form ACE-Step timeout before all sections finished")
            section_prompt = _continuous_section_prompt(
                prompt, n, cursor, end, source_frames)
            result = render(source_chunk, rendered_chunk, section_prompt,
                            mode=mode, strength=strength, noise=noise,
                            bpm=bpm, key=key,
                            timeout_seconds=min(1600, int(remaining)),
                            reference_audio_path=reference_audio_path)
            if result.get("status") != "completed":
                raise ACEBridgeError("An ACE-Step long-form section did not complete")
            with sf.SoundFile(str(rendered_chunk)) as decoded:
                out_sr = decoded.samplerate
                output_audio = decoded.read(dtype="float32", always_2d=True)
            if not 22050 <= out_sr <= 96000 or output_audio.shape[1] not in (1, 2):
                raise ACEBridgeError("ACE-Step segment has unsupported format")
            if not np.isfinite(output_audio).all():
                raise ACEBridgeError("ACE-Step segment contains non-finite audio")
            if out_sr != sr:
                g = math.gcd(sr, out_sr)
                output_audio = resample_poly(output_audio, sr//g, out_sr//g, axis=0)
            if output_audio.shape[1] == 1:
                output_audio = np.repeat(output_audio, 2, axis=1)
            # Never pad or repeat a failed short generation. Minor frame
            # deviations are allowed only for codec rounding (<=2 seconds).
            if abs(len(output_audio) - len(audio)) > 2 * sr:
                raise ACEBridgeError("ACE-Step generated a section shorter than requested")
            if len(output_audio) < len(audio):
                # Sub-second codec/timing drift: retain authentic overlap
                # only; do not fabricate audio to hit the user-selected time.
                delta = len(audio) - len(output_audio)
                if delta > sr // 10:
                    raise ACEBridgeError("ACE-Step output is not long enough for its source section")
            if len(output_audio) > len(audio):
                output_audio = output_audio[:len(audio)]
            segments.append((cursor, output_audio.astype(np.float32)))
            cursor += step
            if end == source_frames:
                break

        if not segments:
            raise ACEBridgeError("No real long-form sections were rendered")
        # Streaming sum/weight assembly limits GPU-host RAM use. Each real
        # section is crossfaded with its neighbors; one timeline, one WAV.
        stitched = np.zeros((source_frames, 2), dtype=np.float32)
        weights = np.zeros((source_frames,), dtype=np.float32)
        for i, (offset, piece) in enumerate(segments):
            end = min(source_frames, offset + len(piece))
            n = end - offset
            if n <= 0:
                continue
            envelope = np.ones((n,), dtype=np.float32)
            if i > 0:
                fade = min(overlap, n)
                envelope[:fade] = np.linspace(0, 1, fade, dtype=np.float32)
            if i < len(segments)-1:
                fade = min(overlap, n)
                envelope[-fade:] = np.minimum(
                    envelope[-fade:], np.linspace(1, 0, fade, dtype=np.float32))
            stitched[offset:end] += piece[:n] * envelope[:, None]
            weights[offset:end] += envelope
        if np.any(weights <= 1e-7):
            raise ACEBridgeError("ACE-Step long-form composition has uncovered sections")
        stitched /= weights[:, None]
        if not np.isfinite(stitched).all() or np.max(np.abs(stitched)) < 0.0001:
            raise ACEBridgeError("ACE-Step long-form output is silent or invalid")
        # Never leave a partial or misleading final on disk.
        temp_final = tmp / "one-remix-final.wav"
        sf.write(str(temp_final), stitched, sr, subtype="PCM_24")
        with sf.SoundFile(str(temp_final)) as verify:
            if verify.frames != source_frames or verify.channels != 2:
                raise ACEBridgeError("Final long-form WAV is not full-duration stereo")
        final.parent.mkdir(parents=True, exist_ok=True)
        if final.exists():
            raise ACEBridgeError("Existing output cannot be overwritten")
        shutil.copyfile(temp_final, final)
        return {"status": "completed", "outputPath": str(final),
                "bytes": final.stat().st_size, "sourceDurationSeconds": round(source_frames/sr,2),
                "segmentCount": len(segments), "longForm": True,
                "oneContinuousOutput": True, "durationVerified": True,
                "model": "local-ACE-Step-cover-multi-section", "noFakeAudio": True,
                "independentStyleReference": reference_audio_path is not None}

def main(argv=None):
    parser = argparse.ArgumentParser(description="SONARA Remix Pro ACE-Step local cover bridge")
    parser.add_argument("--audio", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--prompt", required=True)
    parser.add_argument("--auth-mode", choices=("none","required"), default="required")
    parser.add_argument("--strength", type=float, default=0.72)
    parser.add_argument("--noise", type=float, default=0.0)
    parser.add_argument("--bpm", type=float)
    parser.add_argument("--key")
    args = parser.parse_args(argv)
    try:
        result = render(args.audio, args.output, args.prompt,
                        mode=args.auth_mode, strength=args.strength, noise=args.noise,
                        bpm=args.bpm, key=args.key)
        print(json.dumps(result, indent=2))
        return 0
    except (ACEBridgeError, OSError, ValueError) as exc:
        # Never print local tokens, API response bodies or prompt lyrics.
        print(json.dumps({"status":"failed", "errorClass":type(exc).__name__}))
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
