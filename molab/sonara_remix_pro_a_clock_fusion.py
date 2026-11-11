"""SONARA Remix Pro: one A-derived clock, two authentic source voices.

This is an audio arrangement/mixing stage, not speech synthesis. The ONLY
deliberately mixed drum stem is the authorized A drum stem. The ACE-Step
generated drum stem is discarded; its bass/other stems make a new backing.
Real A/B vocal phrases are sequenced at detected activity boundaries rather
than fixed 15/30-second chorus swaps. No ASR or lyrical guarantees.
"""
from __future__ import annotations

from pathlib import Path
import math

import numpy as np
import soundfile as sf
from scipy.ndimage import uniform_filter1d
from scipy.signal import butter, resample_poly, sosfilt


class OneClockFusionError(RuntimeError):
    pass


RATE = 44100


def _validate(path, *, min_duration=1):
    path = Path(path).expanduser().resolve(strict=True)
    if not path.is_file() or path.suffix.lower() != ".wav":
        raise OneClockFusionError("Verified WAV audio is required")
    with sf.SoundFile(str(path)) as stream:
        if stream.channels not in (1, 2) or not 22050 <= stream.samplerate <= 96000:
            raise OneClockFusionError("Unsupported source stem format")
        if stream.frames < min_duration * stream.samplerate:
            raise OneClockFusionError("Source audio is too short")
    return path


def _to_stereo(source):
    if source.shape[1] == 1:
        return np.repeat(source, 2, axis=1)
    return source[:, :2]


def _read_region(path, start_seconds, frames, *, rate=RATE):
    """Preserve phonemes and pitch; only resample when sample rates differ."""
    with sf.SoundFile(str(path)) as source:
        sr = source.samplerate
        source.seek(min(source.frames, max(0, round(start_seconds * sr))))
        wanted = math.ceil(frames * sr / rate) + (4 if sr != rate else 0)
        audio = _to_stereo(source.read(wanted, dtype="float32", always_2d=True))
    if sr != rate and len(audio):
        d = math.gcd(sr, rate)
        audio = resample_poly(audio, rate // d, sr // d, axis=0).astype(np.float32)
    result = np.zeros((frames, 2), np.float32)
    n = min(frames, len(audio))
    result[:n] = audio[:n]
    if not np.isfinite(result).all():
        raise OneClockFusionError("Invalid source vocal samples")
    return result


def _profile(path, block_seconds=.2):
    """Find quiet vocal boundaries using stem RMS, not invented transcripts."""
    energy = []
    with sf.SoundFile(str(path)) as stream:
        frames = max(1, round(stream.samplerate * block_seconds))
        while True:
            piece = stream.read(frames, dtype="float32", always_2d=True)
            if not len(piece):
                break
            if not np.isfinite(piece).all():
                raise OneClockFusionError("Non-finite vocal stem")
            energy.append(float(np.sqrt(np.mean(np.square(piece.astype(np.float64))))))
    values = np.asarray(energy, dtype=np.float32)
    peak = float(values.max()) if len(values) else 0.
    threshold = max(.0027, .13 * peak)
    active = values >= threshold
    # Fill sub-word gaps shorter than ~0.4 seconds; retain natural phrase ends.
    for i in range(1, max(1, len(active) - 2)):
        if active[i - 1] and active[i + 1]:
            active[i] = True
    # A separated vocal proxy can contain leakage; do not claim singer identity.
    if peak < .004 or np.count_nonzero(active) < 10:
        return {"audible": False, "regions": [], "peak": peak}
    borders = np.diff(np.r_[False, active, False].astype(np.int8))
    begins = np.flatnonzero(borders == 1)
    ends = np.flatnonzero(borders == -1)
    regions = []
    for begin, end in zip(begins, ends):
        if (end - begin) * block_seconds < 1.25:
            continue
        # Long continuous vocals are separated only near the quietest
        # approximate phrase transition; never repeat the same 30s hook.
        cursor = int(begin)
        while cursor < int(end):
            if (end - cursor) * block_seconds <= 13.5:
                split = int(end)
            else:
                target = cursor + round(11.2 / block_seconds)
                left = max(cursor + round(6.0 / block_seconds),
                           target - round(1.4 / block_seconds))
                right = min(int(end), target + round(1.4 / block_seconds))
                split = int(left + np.argmin(values[left:right])) if right > left else target
            if (split - cursor) * block_seconds >= 1.6:
                start = max(0., cursor * block_seconds - .10)
                duration = (split - cursor) * block_seconds + .16
                mean = float(np.mean(values[cursor:split]))
                regions.append((start, duration, mean))
            cursor = split
    return {"audible": bool(regions), "regions": regions, "peak": peak}


def _plan_vocals(profile_a, profile_b, seconds, tempo):
    """Choose real, progressively different phrases in one unified song form.

    Tempo A defines bar boundaries. Not a fixed 15s/30s A/B chorus alternation.
    Voice sections vary with authentic phrase duration and 2-bar checkpoints.
    Most of the time only one voice is foregrounded, avoiding muddled duets.
    """
    bars = 4 * 60. / tempo
    intro = min(2 * bars, seconds * .11)
    outro = min(2 * bars, seconds * .10)
    end = seconds - outro
    if end - intro < 15.:
        raise OneClockFusionError("Not enough space for two authentic voices")
    # Two-source phrase dialogue with evolving lead/support roles, rather than
    # repeated source choruses. Every selected source region is advanced.
    sequence = ("a", "b", "a", "b", "b", "a", "b", "a", "a", "b")
    profiles = {"a": profile_a, "b": profile_b}
    indices = {"a": 0, "b": 0}
    repeated = {"a": False, "b": False}
    events = []
    cursor = intro
    section = 0
    pulse = 60. / tempo
    while cursor < end - 1.8:
        if section > 96:
            raise OneClockFusionError("Unbounded phrase arrangement")
        role = sequence[section % len(sequence)]
        profile = profiles[role]
        if not profile["regions"]:
            raise OneClockFusionError("Both original vocal stems must contain usable phrases")
        passages = profile["regions"]
        nth = indices[role]
        if nth >= len(passages):
            repeated[role] = True
        start, duration, rms = passages[nth % len(passages)]
        indices[role] += 1
        # 2 to 4 bars of music, bounded by the actual recorded phrase length.
        available = end - cursor
        duration = min(duration, 4. * bars, available)
        if duration >= 1.65:
            events.append({
                "role": role, "at": cursor, "source": start,
                "duration": duration, "rms": rms
            })
            cursor += duration + max(.22, .5 * pulse)
        else:
            cursor += 2 * pulse
        # Align NEXT entrance to A's half-bar pulse, with a short breath.
        grid = 2 * pulse
        cursor = math.ceil((cursor - 1e-8) / grid) * grid
        section += 1
    if len(events) < 2 or {e["role"] for e in events} != {"a", "b"}:
        raise OneClockFusionError("Both voices could not be placed in the arrangement")
    return events, repeated, {"introSeconds": round(intro, 2),
                              "outroSeconds": round(outro, 2),
                              "vocalPhrases": len(events),
                              "musicalGrid": "half-bar-A",
                              "fixedChorusAlternation": False}


def _choose_a_drum_loop(path, tempo):
    """Choose an audible 8-bar A kit phrase. No B or generated drums are used."""
    with sf.SoundFile(str(path)) as stream:
        if stream.samplerate != RATE:
            raise OneClockFusionError("Verified Demucs A drums must be 44.1 kHz")
        phrase = min(stream.frames, max(round(8 * 4 * 60 / tempo * RATE),
                                        int(5 * RATE)))
        if phrase < int(4 * RATE):
            raise OneClockFusionError("A drum reference is too short for a steady groove")
        maximum = max(0, stream.frames - phrase)
        positions = [round(maximum * i / 8) for i in range(9)]
        best = (-1.0, None)
        lowpass = butter(3, 160, fs=RATE, btype="lowpass", output="sos")
        for pos in sorted(set(positions)):
            stream.seek(pos)
            audio = _to_stereo(stream.read(phrase, dtype="float32", always_2d=True))
            if len(audio) != phrase or not np.isfinite(audio).all():
                raise OneClockFusionError("Invalid original A drum audio")
            low = sosfilt(lowpass, audio.mean(axis=1))
            power = float(np.sqrt(np.mean(np.square(low.astype(np.float64)))))
            full = float(np.sqrt(np.mean(np.square(audio.astype(np.float64)))))
            score = power * 1.25 + .10 * full
            if score > best[0]:
                best = (score, audio)
        if best[1] is None or best[0] < .003:
            raise OneClockFusionError("No usable original A drum/kick groove was found")
        loop = best[1]
        # Smooth only the loop join; keep the original percussive pulse.
        fade = min(round(.035 * RATE), len(loop) // 20)
        if fade > 2:
            curve = np.linspace(0, 1, fade, dtype=np.float32)[:, None]
            loop[:fade] = loop[-fade:] * (1 - curve) + loop[:fade] * curve
        return loop


def _voice_chunk(events, voices, start, frames):
    result = np.zeros((frames, 2), dtype=np.float32)
    vocal_mask = np.zeros(frames, dtype=np.float32)
    for event in events:
        first = round(event["at"] * RATE)
        last = first + round(event["duration"] * RATE)
        left = max(start, first)
        right = min(start + frames, last)
        if right <= left:
            continue
        n = right - left
        source_at = event["source"] + (left - first) / RATE
        clip = _read_region(voices[event["role"]], source_at, n)
        k = np.arange(left - first, left - first + n, dtype=np.float32)
        fade = max(1, round(.095 * RATE))
        total = max(1, last - first)
        envelope = np.minimum(1., np.minimum((k + 1.) / fade,
                                             (total - k) / fade))
        envelope = np.maximum(0., envelope).astype(np.float32)
        # Bounded individual phrase gain. No new syllables or timbre synthesis.
        gain = max(.55, min(1.7, .075 / max(.002, event["rms"])))
        lo = left - start
        result[lo:lo+n] += clip * (gain * envelope[:, None])
        vocal_mask[lo:lo+n] = np.maximum(vocal_mask[lo:lo+n], envelope)
    return result, vocal_mask


def compose_one_a_clock(*, bass, other, drums_a, vocals_a, vocals_b,
                        destination, expected_seconds, tempo_a, lease_check=None):
    """Write private FLOAT premaster. Exactly one authentic A drum clock.

    This is not a promise of automatic harmonic/semantic fidelity. The caller
    must apply the real master and release gate before any R2 upload.
    """
    try:
        tempo = float(tempo_a)
    except (TypeError, ValueError) as exc:
        raise OneClockFusionError("A BPM must be provided") from exc
    if not math.isfinite(tempo) or not 55 <= tempo <= 200:
        raise OneClockFusionError("A BPM must be between 55 and 200")
    if type(expected_seconds) is not int or expected_seconds not in range(30, 481, 30):
        raise OneClockFusionError("Expected duration is invalid")
    sources = [_validate(p) for p in (bass, other, drums_a, vocals_a, vocals_b)]
    bass, other, drums_a, vocals_a, vocals_b = sources
    destination = Path(destination).expanduser().resolve()
    if destination.is_symlink() or destination.exists() or destination in sources:
        raise OneClockFusionError("Refusing to overwrite an existing or source WAV")
    if not destination.parent.is_dir():
        raise OneClockFusionError("Private output directory does not exist")
    frames_total = expected_seconds * RATE
    for part in (bass, other):
        with sf.SoundFile(str(part)) as stream:
            if stream.samplerate != RATE or abs(stream.frames - frames_total) > RATE // 10:
                raise OneClockFusionError("Generated instrumental stem duration mismatch")
    profiles = {"a": _profile(vocals_a), "b": _profile(vocals_b)}
    if not profiles["a"]["audible"] or not profiles["b"]["audible"]:
        raise OneClockFusionError("Both source songs must contain usable original vocals")
    events, repeats, structure = _plan_vocals(
        profiles["a"], profiles["b"], expected_seconds, tempo)
    if lease_check:
        lease_check("a_kick_lock")
    a_drums = _choose_a_drum_loop(drums_a, tempo)
    chunk_frames = max(round(4 * 4 * 60. / tempo * RATE), RATE * 2)
    highpass_other = butter(2, 145, fs=RATE, btype="highpass", output="sos")
    highpass_voice = butter(2, 75, fs=RATE, btype="highpass", output="sos")
    lowpass_kick = butter(2, 145, fs=RATE, btype="lowpass", output="sos")
    voices = {"a": vocals_a, "b": vocals_b}
    success = False
    try:
        with sf.SoundFile(str(bass)) as bass_stream, \
             sf.SoundFile(str(other)) as other_stream, \
             sf.SoundFile(str(destination), mode="x", samplerate=RATE,
                          channels=2, subtype="FLOAT", format="WAV") as output:
            for start in range(0, frames_total, chunk_frames):
                if lease_check:
                    lease_check("a_clock_vocal_mix")
                n = min(chunk_frames, frames_total - start)
                b = _to_stereo(bass_stream.read(n, dtype="float32", always_2d=True))
                o = _to_stereo(other_stream.read(n, dtype="float32", always_2d=True))
                if len(b) != n or len(o) != n or not (
                    np.isfinite(b).all() and np.isfinite(o).all()):
                    raise OneClockFusionError("Incomplete AI instrumental backing")
                drums = a_drums[(start + np.arange(n)) % len(a_drums)]
                # No second kick: do not read the generated drum stem.
                vocals, vocal_mask = _voice_chunk(events, voices, start, n)
                vocals = sosfilt(highpass_voice, vocals, axis=0).astype(np.float32)
                o = sosfilt(highpass_other, o, axis=0).astype(np.float32)
                # Spectral separation + gentle side-chain: kick controls bass,
                # voice controls the competing accompaniment, never vice versa.
                low = sosfilt(lowpass_kick, drums.mean(axis=1))
                thump = uniform_filter1d(np.abs(low).astype(np.float32),
                                        size=max(1, round(.035 * RATE)))
                norm = np.clip(thump / max(.012, float(np.percentile(thump, 90))),
                               0, 1)
                bass_gain = .65 * (1 - .24 * norm)
                presence = uniform_filter1d(vocal_mask, size=round(.08 * RATE))
                other_gain = .56 * (1 - .43 * np.clip(presence, 0, 1))
                result = (.82 * drums + b * bass_gain[:, None] +
                          o * other_gain[:, None] + .88 * vocals)
                if not np.isfinite(result).all():
                    raise OneClockFusionError("Non-finite mastered audio precursor")
                output.write(result.astype(np.float32))
        # The technical release gate forbids intermediate clipping too.
        # A fixed GLOBAL attenuation avoids compressor pumping between phrases.
        measured_peak = 0.
        with sf.SoundFile(str(destination), mode="r+") as done:
            if done.frames != frames_total or done.channels != 2:
                raise OneClockFusionError("Remix length or channel count mismatch")
            for position in range(0, frames_total, RATE * 8):
                done.seek(position)
                measured = done.read(min(RATE * 8, frames_total - position),
                                     dtype="float32", always_2d=True)
                measured_peak = max(measured_peak, float(np.max(np.abs(measured))))
            if measured_peak > .92:
                attenuation = .92 / measured_peak
                for position in range(0, frames_total, RATE * 8):
                    done.seek(position)
                    piece = done.read(min(RATE * 8, frames_total - position),
                                      dtype="float32", always_2d=True)
                    done.seek(position)
                    done.write(piece * attenuation)
        success = True
        return {
            "oneClockSource": "original-A-demucs-drums",
            "tempoSource": "A",
            "tempoBpm": round(tempo, 2),
            "voiceBlend": "source-phrase-dialogue-in-new-A-pulse-arrangement",
            "onlyOneDeliberateDrumStem": True,
            "generatedDrumsDiscarded": True,
            "originalVoiceAUsed": True,
            "originalVoiceBUsed": True,
            "sourceVocalsResung": False,
            "vocalTimeStretchPerformed": False,
            "transcriptionOrTranslationPerformed": False,
            "originalPhrasesRepeatedToFill": repeats,
            "structure": structure,
            "listeningRequiredForHarmonyAndLyrics": True,
        }
    finally:
        if not success:
            destination.unlink(missing_ok=True)
