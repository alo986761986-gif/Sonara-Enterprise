"""SONARA Remix Pro: measured music analysis, optional real Demucs stems,
two-song stem arrangement and transparent offline WAV mastering.

Isolated offline pipeline: it does NOT modify or restart the live ACE-Step
engine, Cloudflare relay, credentials, or existing site. The RTX is optional.
Python 3.12+. Licensed/authorized audio only.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time

VERSION = "sonara-remix-pro-toolkit-v1"
AUDIO_EXTENSIONS = {".wav", ".flac", ".mp3", ".m4a", ".ogg"}
STEM_NAMES = ("vocals", "drums", "bass", "other")
MAX_INPUT_BYTES = 512 * 1024 * 1024
MAX_AUDIO_SECONDS = 600


class RemixProError(RuntimeError):
    pass


def source_file(value):
    try:
        path = Path(value).expanduser().resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise RemixProError("Audio source file not found or unavailable") from exc
    if not path.is_file() or path.suffix.lower() not in AUDIO_EXTENSIONS:
        raise RemixProError("Expected an existing supported audio file")
    if not 0 < path.stat().st_size <= MAX_INPUT_BYTES:
        raise RemixProError("Audio source file size is invalid")
    return path


def _deps():
    try:
        import numpy as np
        import librosa
        import soundfile as sf
        from scipy.signal import resample_poly
    except ImportError as exc:
        raise RemixProError("Missing audio dependencies: install the separate Remix Pro environment") from exc
    return np, librosa, sf, resample_poly


def audio_hash(path):
    digest = hashlib.sha256()
    with source_file(path).open("rb") as audio:
        for block in iter(lambda: audio.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def analyze_audio(path, max_analysis_seconds=120):
    """Actual waveform tempo/key estimators with uncertainty, never fake metadata."""
    np, librosa, _, _ = _deps()
    path = source_file(path)
    y, sr = librosa.load(str(path), sr=22050, mono=True, duration=min(180, max_analysis_seconds))
    if not len(y) or np.max(np.abs(y)) < 1e-5:
        return {"version": VERSION, "tempoBpm": None, "tempoConfidence": 0,
                "key": None, "keyConfidence": 0, "beatTimesSeconds": [],
                "boundaryCandidatesSeconds": [], "warnings": ["silence-or-empty"]}
    hop = 512
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=hop)[0]
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset, sr=sr, hop_length=hop, trim=False)
    beats = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop)
    bpm = float(np.asarray(tempo).ravel()[0]) if np.asarray(tempo).size else 0
    intervals = np.diff(beats)
    beat_consistency = float(np.clip(1 - np.std(intervals) / (np.mean(intervals) + 1e-9) * 3, 0, 1)) if len(intervals) > 3 else 0
    confidence = round(beat_consistency, 3) if 55 <= bpm <= 200 and len(beats) >= 8 else 0
    measured_bpm = round(bpm, 1) if confidence >= 0.45 else None

    # 12 pitch classes; compare Krumhansl-Schmuckler templates, not a guaranteed key.
    chord = librosa.feature.chroma_stft(y=y, sr=sr, n_fft=4096, hop_length=2048)
    chroma = np.mean(chord, axis=1)
    chroma = chroma / max(np.linalg.norm(chroma), 1e-9)
    major = np.array([6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88])
    minor = np.array([6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17])
    options = []
    labels = ("C","C#","D","D#","E","F","F#","G","G#","A","A#","B")
    for root in range(12):
        for label, template in (("major", major), ("minor", minor)):
            shifted = np.roll(template, root)
            score = float(np.corrcoef(chroma, shifted)[0,1])
            options.append((score, f"{labels[root]} {label}"))
    options.sort(reverse=True)
    key_margin = max(0, options[0][0] - options[1][0])
    key_confidence = round(float(np.clip(key_margin / 0.13, 0, 1)), 3)
    key = options[0][1] if options[0][0] >= 0.45 and key_confidence >= 0.5 else None

    # Coarse energy-change candidates, NOT invented verse/chorus labels.
    per_second = max(1, round(sr / hop))
    novelty = []
    for i in range(per_second, len(rms) - per_second, per_second):
        before = float(np.mean(rms[i - per_second:i]))
        after = float(np.mean(rms[i:i + per_second]))
        if max(before, after) > 0.015 and abs(after-before) / max(before, after) > 0.45:
            candidate = round(i * hop / sr, 1)
            if not novelty or candidate - novelty[-1] >= 6:
                novelty.append(candidate)
    warnings = []
    if measured_bpm is None:
        warnings.append("tempo-unverified")
    if key is None:
        warnings.append("key-uncertain")
    warnings.append("beat-grid-is-not-downbeat-or-bar-verification")
    return {
        "version": VERSION, "durationSecondsMeasured": round(len(y)/sr,2),
        "tempoBpm": measured_bpm, "tempoConfidence": confidence,
        "key": key, "keyConfidence": key_confidence,
        "beatTimesSeconds": [round(float(v),3) for v in beats[:160].tolist()],
        "boundaryCandidatesSeconds": novelty[:24],
        "analysisMethod": "librosa:onset+beat+chroma-stft+energy-novelty",
        "warnings": warnings
    }


def preflight():
    modules = ("numpy", "scipy", "librosa", "soundfile", "pyloudnorm", "demucs", "torch")
    available = {module: importlib.util.find_spec(module) is not None for module in modules}
    # A missing module is never represented as a verified capability.
    return {"version": VERSION, "optionalModulesInstalled": available,
            "analysisReady": all(available.get(x, False) for x in ("numpy","scipy","librosa","soundfile")),
            "masteringReady": all(available.get(x, False) for x in ("numpy","scipy","pyloudnorm")),
            "demucsModulePresent": available["demucs"],
            "demucsModelVerified": False, "gpuInferenceVerified": False,
            "note": "A model must actually run before separation can be marked ready."}


def separate_stems(path, output_root, *, device="cpu", timeout_seconds=3600):
    """Real Demucs CLI; no fake stem outputs, explicit opt-in GPU."""
    path = source_file(path)
    if device not in ("cpu", "cuda"):
        raise RemixProError("Device must be cpu or cuda")
    output_root = Path(output_root).expanduser().resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    digest = audio_hash(path)
    destination = output_root / digest[:20]
    manifest_path = destination / "stems-manifest.json"
    if manifest_path.is_file():
        try:
            previous = json.loads(manifest_path.read_text())
            if previous.get("sourceSha256") == digest and previous.get("separationModel") == "htdemucs" and all(
                (destination / f"{name}.wav").is_file() for name in STEM_NAMES
            ):
                return previous
        except (ValueError, OSError):
            pass
    destination.mkdir(parents=True, exist_ok=True)
    scratch = destination / "demucs-working"
    cmd = [
        sys.executable, "-m", "demucs.separate", "-n", "htdemucs",
        "--device", device, "--shifts", "1", "--overlap", "0.1",
        "--out", str(scratch), str(path)
    ]
    try:
        subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=timeout_seconds)
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        raise RemixProError("Demucs separation failed or exceeded the time limit; original audio untouched") from exc
    stem_folder = scratch / "htdemucs" / path.stem
    files = {}
    for name in STEM_NAMES:
        origin = stem_folder / f"{name}.wav"
        if not origin.is_file() or origin.stat().st_size <= 44:
            raise RemixProError(f"Real {name} stem missing, separation was not accepted")
        destination_file = destination / f"{name}.wav"
        destination_file.write_bytes(origin.read_bytes())
        files[name] = destination_file.name
    manifest = {
        "version": VERSION, "sourceSha256": digest,
        "separationModel": "htdemucs", "algorithm": "real-inference",
        "stemsVerified": True, "stemFiles": files, "device": device
    }
    manifest_path.write_text(json.dumps(manifest, indent=2))
    return manifest


def _load_stem(folder, name, sr=44100):
    np, librosa, _, _ = _deps()
    folder = Path(folder).expanduser().resolve()
    if name not in STEM_NAMES:
        raise RemixProError("Unsupported stem name")
    stem = folder / f"{name}.wav"
    if not stem.is_file():
        raise RemixProError(f"Missing real {name} stem; run separate first")
    audio, _ = librosa.load(str(stem), sr=sr, mono=False)
    if audio.ndim == 1:
        audio = np.vstack([audio, audio])
    return np.asarray(audio[:2], dtype=np.float32).T


def _audio_at_timeline(audio, length, offset):
    np, _, _, _ = _deps()
    result = np.zeros((length, 2), dtype=np.float32)
    source_begin = max(0, -offset)
    destination_begin = max(0, offset)
    n = min(len(audio) - source_begin, length - destination_begin)
    if n > 0:
        result[destination_begin:destination_begin+n] = audio[source_begin:source_begin+n]
    return result



def _phrase_loop_stem(audio, frames, bpm, *, offset=0, sr=44100):
    """Repeat REAL source phrases, with crossfades, to fill the requested timeline.

    The cycle is an integer multiple of 16 beats whenever input permits.
    This avoids silence/padding and keeps the beat grid stable while extending
    short authorized material. No synthetic stems are manufactured.
    """
    np, _, _, _ = _deps()
    if audio.ndim != 2 or audio.shape[1] != 2 or not len(audio):
        raise RemixProError("A verified real stereo source stem is required")
    if not 55 <= bpm <= 200 or frames <= 0:
        raise RemixProError("Invalid source tempo or requested output duration")
    phrase = max(1, int(round(16 * 60.0 / bpm * sr)))
    cycle = len(audio) // phrase * phrase
    if cycle < int(4 * sr):
        cycle = len(audio)
    if cycle < int(sr):
        raise RemixProError("Source stem is too short for phrase arrangement")
    # A 180 ms crossfade hides discontinuities at source loop joins; the
    # crossfade is not a fabricated silent/padded extension.
    fade_frames = min(int(round(0.18 * sr)), max(1, cycle // 8))
    fade = np.linspace(0, 1, fade_frames, dtype=np.float32)[:, None]
    output = np.zeros((frames, 2), dtype=np.float32)
    cursor = int(offset)
    loops = 0
    while cursor < frames:
        src_start = max(0, -cursor)
        dst_start = max(0, cursor)
        n = min(cycle - src_start, frames - dst_start)
        if n > 0:
            take = audio[src_start:src_start + n]
            if loops and src_start == 0 and dst_start < frames:
                m = min(fade_frames, n, frames - dst_start)
                if m:
                    output[dst_start:dst_start + m] = (
                        output[dst_start:dst_start + m] * (1 - fade[:m])
                        + take[:m] * fade[:m]
                    )
                output[dst_start + m:dst_start + n] = take[m:]
            else:
                output[dst_start:dst_start + n] = take
        loops += 1
        cursor += max(1, cycle - fade_frames)
    return output, loops

def _stretch_stereo(stereo, ratio):
    np, librosa, _, _ = _deps()
    if not 0.8 <= ratio <= 1.25:
        raise RemixProError("Tempo difference exceeds safe +/-25% stretch range")
    if abs(ratio - 1) < .008:
        return stereo
    channels = [librosa.effects.time_stretch(stereo[:,c], rate=ratio) for c in range(2)]
    n = min(map(len, channels))
    return np.column_stack([v[:n] for v in channels]).astype(np.float32)


def transparent_master(audio, sr=44100, lufs=-14.0, peak_ceiling=-1.0):
    """Modest loudness matching followed by measured 4x oversampled peak ceiling.
    Global attenuation only if above the peak limit. No fake true limiter.
    """
    np, _, _, upsample = _deps()
    import pyloudnorm as pyln
    if audio.ndim != 2 or audio.shape[1] != 2 or len(audio) < sr:
        raise RemixProError("Expected at least one second of stereo audio")
    if not np.isfinite(audio).all():
        raise RemixProError("Non-finite audio samples")
    meter = pyln.Meter(sr)
    current_lufs = float(meter.integrated_loudness(audio))
    if not math.isfinite(current_lufs):
        raise RemixProError("No measurable integrated loudness")
    gain_db = min(9.0, max(-12.0, lufs - current_lufs))
    result = audio.astype(np.float64) * (10 ** (gain_db / 20.0))
    # Bounded-memory 4x intersample-peak approximation. A full 8-minute
    # stereo WAV would require over a gigabyte if oversampled in one array.
    # Short overlapping windows keep peak detection practical on MoLab.
    detected = float(np.max(np.abs(result)))
    window = max(1, int(sr * 4))
    for start in range(0, len(result), window):
        piece = result[max(0, start - 32):min(len(result), start + window + 32)]
        detected = max(detected, float(np.max(np.abs(upsample(piece, 4, 1, axis=0)))))
    ceiling = 10 ** (peak_ceiling / 20.0)
    correction = min(1.0, ceiling / max(detected, 1e-9))
    result *= correction
    metadata = {
        "lufsBefore": round(current_lufs, 2),
        "lufsAfter": round(float(meter.integrated_loudness(result)), 2),
        "approxTruePeakDb": round(20 * math.log10(max(detected * correction, 1e-12)),2),
        "peakCeilingDbTP": peak_ceiling,
        "masteringMethod": "loudness-matched-global-gain-4x-peak-check-not-brickwall-limiter"
    }
    # Avoid softclip distortion; no gain increase on over-limit output.
    return np.asarray(result, dtype=np.float32), metadata


def combine_two_songs(a, b, stems_a, stems_b, destination, *,
                      bpm_a=None, bpm_b=None, bass_from="a", max_seconds=180):
    """Create ONE real A+B remix WAV with the exact creator-selected duration.

    A provides vocals and harmony; B supplies verified real drums/groove.
    Bass is selectable. When songs are shorter than the requested duration,
    real source phrases are re-arranged with 16-beat-aligned crossfades:
    the result must NEVER be silently shortened to the source's last frame.
    """
    np, _, sf, _ = _deps()
    a, b = source_file(a), source_file(b)
    digest_a, digest_b = audio_hash(a), audio_hash(b)
    if digest_a == digest_b:
        raise RemixProError("Brano A e Brano B devono contenere due audio differenti")
    try:
        seconds = int(max_seconds)
    except (TypeError, ValueError, OverflowError) as exc:
        raise RemixProError("Requested remix duration must be an exact multiple of 30 seconds") from exc
    if seconds != max_seconds or seconds < 30 or seconds > 480 or seconds % 30:
        raise RemixProError("Requested remix duration must be 30-480 seconds in 30-second steps")
    destination = Path(destination).expanduser().resolve()
    if destination.exists() or destination in (a, b):
        raise RemixProError("Refusing to overwrite existing or original source audio")

    report_a, report_b = analyze_audio(a), analyze_audio(b)
    tempo_a = float(bpm_a) if bpm_a else report_a["tempoBpm"]
    tempo_b = float(bpm_b) if bpm_b else report_b["tempoBpm"]
    if not tempo_a or not tempo_b or not (55 <= tempo_a <= 200 and 55 <= tempo_b <= 200):
        raise RemixProError("Unverified BPM: pass explicit --bpm-a and --bpm-b before combining")
    if bass_from not in ("a", "b"):
        raise RemixProError("bass-from must be a or b")
    for audio, folder, digest in ((a, stems_a, digest_a), (b, stems_b, digest_b)):
        manifest = Path(folder).expanduser().resolve() / "stems-manifest.json"
        if not manifest.is_file():
            raise RemixProError("Missing authentic Demucs manifest for a source")
        data = json.loads(manifest.read_text())
        if (data.get("sourceSha256") != digest or
            data.get("separationModel") != "htdemucs" or
            data.get("stemsVerified") is not True):
            raise RemixProError("Stem manifest does not belong to its source audio")
    if (bass_from == "b" and report_a["key"] and report_b["key"] and
        report_a["key"] != report_b["key"]):
        raise RemixProError("Incompatible measured tonal centers for B bass; keep A bass or edit sources first")

    ratio = tempo_a / tempo_b
    frames = seconds * 44100
    vocals = _load_stem(stems_a, "vocals")
    harmony = _load_stem(stems_a, "other")
    bass = _load_stem(stems_a if bass_from == "a" else stems_b, "bass")
    drums = _stretch_stereo(_load_stem(stems_b, "drums"), ratio)
    if bass_from == "b":
        bass = _stretch_stereo(bass, ratio)

    # A completely silent drum stem cannot truthfully deliver B's groove.
    if float(np.sqrt(np.mean(np.square(drums[:min(len(drums), 44100 * 20)].astype(np.float64))))) < 0.000015:
        raise RemixProError("Brano B non contiene una batteria riconoscibile da fondere con A")

    beat_a = report_a["beatTimesSeconds"][0] if report_a["beatTimesSeconds"] else 0
    beat_b = report_b["beatTimesSeconds"][0] if report_b["beatTimesSeconds"] else 0
    drum_offset = round((beat_a - beat_b / ratio) * 44100)
    assigned = (
        ("vocalsA", vocals, 0, 0.90),
        ("harmoniesA", harmony, 0, 0.62),
        ("bass" + bass_from.upper(), bass, drum_offset if bass_from == "b" else 0, 0.73),
        ("drumsB", drums, drum_offset, 0.89),
    )
    rendered = np.zeros((frames, 2), dtype=np.float32)
    loop_counts = {}
    for role, stem, offset, gain in assigned:
        aligned, count = _phrase_loop_stem(stem, frames, tempo_a, offset=offset)
        loop_counts[role] = count
        # Genuine stem-based arrangement: real A melody + B rhythmic identity.
        # A subtle sectional structure opens space for verses, breakdowns and
        # chorus/drop variation without manufacturing or faking audio sources.
        if role == "vocalsA":
            boundaries = ((0.00, 0.06, .50), (.38, .43, .72), (.72, .78, .64))
        elif role == "drumsB":
            boundaries = ((0.00, 0.05, .64), (.46, .51, .44), (.90, .94, .68))
        else:
            boundaries = ()
        for lo, hi, factor in boundaries:
            first, last = int(lo * frames), int(hi * frames)
            if last > first:
                aligned[first:last] *= factor
        rendered += aligned * gain
        del aligned
    del vocals, harmony, bass, drums

    if not np.isfinite(rendered).all() or np.max(np.abs(rendered)) < 0.0001:
        raise RemixProError("Authentic A+B stem arrangement contained no usable music")
    # Only fade edges of the one continuous 8-minute stereo master.
    n_in = min(frames // 2, int(.020 * 44100))
    n_out = min(frames // 2, int(.250 * 44100))
    rendered[:n_in] *= np.linspace(0, 1, n_in)[:, None]
    rendered[-n_out:] *= np.linspace(1, 0, n_out)[:, None]
    rendered, loudness = transparent_master(rendered)
    destination.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(destination), rendered, 44100, subtype="PCM_24")
    with sf.SoundFile(str(destination)) as output:
        if (output.frames != frames or output.samplerate != 44100 or
            output.channels != 2):
            destination.unlink(missing_ok=True)
            raise RemixProError("A+B remix export was shorter than the selected duration")
    result = {
        "version": VERSION, "output": str(destination),
        "sourceA": digest_a, "sourceB": digest_b,
        "sourceBpmA": report_a["tempoBpm"], "sourceBpmB": report_b["tempoBpm"],
        "usedBpmA": tempo_a, "usedBpmB": tempo_b,
        "bpmSourceA": "manual" if bpm_a else "measured",
        "bpmSourceB": "manual" if bpm_b else "measured",
        "sourceKeyA": report_a["key"], "sourceKeyB": report_b["key"],
        "beatOffsetMethod": "first-measured-beat-not-downbeat",
        "stemRoles": [row[0] for row in assigned],
        "requestedSeconds": seconds, "seconds": round(frames / 44100, 3),
        "durationVerified": True, "realSourceAUsed": True,
        "realSourceBUsed": True, "oneContinuousOutput": True,
        "phraseCycleCounts": loop_counts,
        "stretchRatioB": round(ratio, 4), "master": loudness,
        "warnings": ["Shorter original source passages repeat on the 16-beat grid when extended.",
                     "No automatic chord transcription or phrase-preserving composition.",
                     "Human listening required for artistic quality."]
    }
    destination.with_suffix(".report.json").write_text(json.dumps(result, indent=2))
    return result

def main(argv=None):
    parser = argparse.ArgumentParser(description="SONARA Remix Pro offline toolkit (no active-site side effects)")
    commands = parser.add_subparsers(dest="command",required=True)
    commands.add_parser("preflight")
    a = commands.add_parser("analyze")
    a.add_argument("audio")
    a.add_argument("--output")
    s = commands.add_parser("separate")
    s.add_argument("audio")
    s.add_argument("--out",required=True)
    s.add_argument("--device",choices=("cpu","cuda"),default="cpu")
    m = commands.add_parser("two-song")
    m.add_argument("--a",required=True)
    m.add_argument("--b",required=True)
    m.add_argument("--stems-a",required=True)
    m.add_argument("--stems-b",required=True)
    m.add_argument("--output",required=True)
    m.add_argument("--bpm-a",type=float)
    m.add_argument("--bpm-b",type=float)
    m.add_argument("--bass-from",choices=("a","b"),default="a")
    m.add_argument("--max-seconds",type=int,default=180)
    auto = commands.add_parser("two-song-auto")
    auto.add_argument("--a", required=True)
    auto.add_argument("--b", required=True)
    auto.add_argument("--cache", required=True)
    auto.add_argument("--output", required=True)
    auto.add_argument("--device", choices=("cpu","cuda"), default="cpu")
    auto.add_argument("--bpm-a", type=float)
    auto.add_argument("--bpm-b", type=float)
    auto.add_argument("--bass-from", choices=("a","b"), default="a")
    auto.add_argument("--max-seconds", type=int, default=180)
    args = parser.parse_args(argv)
    try:
        if args.command == "preflight":
            result = preflight()
        elif args.command == "analyze":
            result = analyze_audio(args.audio)
            if args.output:
                Path(args.output).write_text(json.dumps(result,indent=2))
        elif args.command == "separate":
            result = separate_stems(args.audio,args.out,device=args.device)
        elif args.command == "two-song-auto":
            manifest_a = separate_stems(args.a, args.cache, device=args.device)
            manifest_b = separate_stems(args.b, args.cache, device=args.device)
            stem_a = Path(args.cache).expanduser().resolve() / manifest_a["sourceSha256"][:20]
            stem_b = Path(args.cache).expanduser().resolve() / manifest_b["sourceSha256"][:20]
            result = combine_two_songs(args.a,args.b,stem_a,stem_b,args.output,
                         bpm_a=args.bpm_a,bpm_b=args.bpm_b,bass_from=args.bass_from,
                         max_seconds=args.max_seconds)
        else:
            result = combine_two_songs(args.a,args.b,args.stems_a,args.stems_b,args.output,
                         bpm_a=args.bpm_a,bpm_b=args.bpm_b,bass_from=args.bass_from,
                         max_seconds=args.max_seconds)
        print(json.dumps(result,indent=2,ensure_ascii=False))
        return 0
    except (RemixProError, OSError, ValueError) as exc:
        print(json.dumps({"ok":False,"errorClass":type(exc).__name__,"message":str(exc)}),file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
