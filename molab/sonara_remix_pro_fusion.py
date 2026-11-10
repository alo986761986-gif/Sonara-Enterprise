"""Two-source AI composition planning for SONARA Remix Pro.

No PCM from A is added to PCM from B. A is an independently prepared
structural conditioning input; B is an independently prepared style/reference
input to ACE-Step. The model, not a summing mixer, creates the final music.
This module never starts ACE-Step, touches the main relay, or uses a tunnel.
"""
from __future__ import annotations

import math
import hashlib
from pathlib import Path

import numpy as np
import soundfile as sf

FUSION_REVISION = "sonara-dual-reference-musical-coherence-v2"


class FusionPlanError(RuntimeError):
    pass


def _input_audio(path):
    audio = Path(path).expanduser().resolve(strict=True)
    if not audio.is_file() or audio.suffix.lower() != ".wav":
        raise FusionPlanError("A genuine normalized WAV source is required")
    with sf.SoundFile(str(audio)) as info:
        if not 22050 <= info.samplerate <= 96000 or info.channels not in (1, 2):
            raise FusionPlanError("Unsupported reference WAV format")
        if not 10 <= info.frames / info.samplerate <= 900:
            raise FusionPlanError("Source must have 10-900 seconds of genuine audio")
    return audio


def _destination(path, sources):
    dest = Path(path).expanduser().resolve()
    if dest in sources or dest.exists():
        raise FusionPlanError("Refusing to overwrite source or existing audio")
    dest.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    return dest


def make_structural_guide(source_a, destination, seconds):
    """Produce a seamless A-only, exact-length cover-conditioning guide.

    Short user-supplied A may need to repeat. Unlike the old raw file reset,
    every source loop has a short raised-cosine crossfade; we never concatenate
    discontinuous sample edges. Source B is NEVER written into this guide.
    The guide is not the published audio: ACE-Step recomposes it.
    """
    source_a = _input_audio(source_a)
    if not isinstance(seconds, int) or seconds < 30 or seconds > 480 or seconds % 30:
        raise FusionPlanError("Output duration must be 30-480 seconds in steps of 30")
    dest = _destination(destination, (source_a,))
    written, repeated = 0, 0
    try:
        with sf.SoundFile(str(source_a)) as src:
            sr, channels = src.samplerate, src.channels
            target_frames = int(sr * seconds)
            seam_frames = min(max(2, int(sr * 0.12)), max(2, src.frames // 16))
            # w+ enables a bounded in-place correction of the last 120ms;
            # no need to load the entire recording into GPU memory.
            with sf.SoundFile(str(dest), "w+", samplerate=sr,
                              channels=2, subtype="PCM_24", format="WAV") as out:
                src.seek(0)
                while written < target_frames:
                    if src.tell() >= src.frames:
                        fade = min(seam_frames, written, src.frames // 2)
                        if fade >= 2:
                            out.flush()
                            out.seek(written - fade)
                            tail = out.read(fade, dtype="float32", always_2d=True)
                            src.seek(0)
                            head = src.read(fade, dtype="float32", always_2d=True)
                            if channels == 1:
                                head = np.repeat(head, 2, axis=1)
                            if len(tail) != fade or len(head) != fade:
                                raise FusionPlanError("Unable to crossfade A-only loop")
                            alpha = (0.5 - 0.5 * np.cos(
                                np.linspace(0.0, math.pi, fade, dtype=np.float32)
                            ))[:, None]
                            out.seek(written - fade)
                            out.write(tail * (1.0 - alpha) + head * alpha)
                            out.seek(written)
                        else:
                            src.seek(0)
                        repeated += 1
                    frames = min(65536, target_frames - written, src.frames - src.tell())
                    if frames <= 0:
                        raise FusionPlanError("Invalid source loop progress")
                    chunk = src.read(frames, dtype="float32", always_2d=True)
                    if len(chunk) != frames or not np.isfinite(chunk).all():
                        raise FusionPlanError("A guide contains missing or invalid audio")
                    if channels == 1:
                        chunk = np.repeat(chunk, 2, axis=1)
                    out.write(chunk)
                    written += frames
        with sf.SoundFile(str(dest)) as check:
            if check.frames != target_frames or check.channels != 2:
                raise FusionPlanError("Structural guide has incorrect duration")
        return {"revision": FUSION_REVISION, "seconds": seconds,
                "source": "a-only", "sourceRepetitions": repeated,
                "loopCrossfadeSeconds": 0.12 if repeated else 0.0,
                "containsSourceB": False, "frames": target_frames}
    except BaseException:
        dest.unlink(missing_ok=True)
        raise



def make_dual_hook_conditioning_guide(source_a, source_b, destination, seconds, *,
                                      vocals_a=None, vocals_b=None):
    """Prepare A/B motif *conditioning*, never a deliverable mashup.

    Only the subsequent ACE-Step cover creates the publishable music. The
    private guide exposes substantial, non-overlaid A and B phrases so B's
    melodic/vocal material is not reduced to drum style alone. Phrase
    selection is an energy proxy, NOT verified chorus or lyric recognition.
    Model faithfulness to either phrase must be assessed by listening.
    """
    from scipy.signal import resample_poly
    a = _input_audio(source_a)
    b = _input_audio(source_b)
    if a == b:
        raise FusionPlanError("Dual-hook conditioning requires distinct sources")
    if not isinstance(seconds, int) or seconds < 30 or seconds > 480 or seconds % 30:
        raise FusionPlanError("Invalid dual-hook duration")
    dest = _destination(destination, (a, b))
    vocal_paths = {}
    for role, source, candidate in (("a", a, vocals_a), ("b", b, vocals_b)):
        if candidate is None:
            continue
        stem = _input_audio(candidate)
        with sf.SoundFile(str(source)) as song, sf.SoundFile(str(stem)) as voice:
            if abs(song.frames / song.samplerate - voice.frames / voice.samplerate) > 1:
                raise FusionPlanError("Vocal stem and music duration do not agree")
        vocal_paths[role] = stem
    # Three phrases in short edits, five for full productions. Each role is
    # an independent original excerpt; not a sum of incompatible A/B tracks.
    weights = (("a", .34), ("b", .33), ("a", .33)) if seconds <= 60 else (
        ("a", .20), ("b", .22), ("a", .17), ("b", .23), ("a", .18)
    )
    with sf.SoundFile(str(a)) as info_a:
        sr = info_a.samplerate
    total_frames = sr * seconds
    roles = [role for role, _ in weights]
    lengths = [int(total_frames * portion) for _, portion in weights[:-1]]
    lengths.append(total_frames - sum(lengths))
    if any(x < sr * 6 for x in lengths):
        raise FusionPlanError("Dual-hook sections are too short")

    def best_excerpt(song_path, vocals_path, required_frames):
        with sf.SoundFile(str(song_path)) as song:
            length = song.frames / song.samplerate
            excerpt_seconds = min(length, max(10., min(45., required_frames / sr)))
        available = max(0., length - excerpt_seconds)
        positions = sorted(set(round(available * i / 8, 3) for i in range(9)))
        voice_activity = False
        if vocals_path:
            with sf.SoundFile(str(vocals_path)) as vocals:
                # A Demucs vocal stem is only a signal proxy: leakage is
                # possible, so never assert a singer or words were detected.
                vocals.seek(max(0, (vocals.frames - vocals.samplerate * 10) // 2))
                sample = vocals.read(min(vocals.samplerate * 10, vocals.frames),
                                      dtype="float32", always_2d=True)
                voice_activity = (len(sample) > 0 and
                                  float(np.sqrt(np.mean(sample.astype(np.float64) ** 2))) > .003)
        ranked = []
        for position in positions:
            music = _reference_activity_score(song_path, position, excerpt_seconds)
            voice = (_reference_activity_score(vocals_path, position, excerpt_seconds)
                     if vocals_path and voice_activity else music)
            ranked.append((.75 * voice + .25 * music, -abs(position - available / 2), position))
        start = max(ranked)[2]
        with sf.SoundFile(str(song_path)) as song:
            song.seek(min(song.frames - 1, int(start * song.samplerate)))
            length_frames = min(song.frames - song.tell(),
                                max(1, int(excerpt_seconds * song.samplerate)))
            audio = song.read(length_frames, dtype="float32", always_2d=True)
            source_sr = song.samplerate
            if song.channels == 1:
                audio = np.repeat(audio, 2, axis=1)
        if not len(audio) or not np.isfinite(audio).all():
            raise FusionPlanError("Selected A/B conditioning phrase is invalid")
        if source_sr != sr:
            divisor = math.gcd(sr, source_sr)
            audio = resample_poly(audio, sr // divisor, source_sr // divisor, axis=0).astype(np.float32)
        rms = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2)))
        if not math.isfinite(rms) or rms < 1e-5:
            raise FusionPlanError("Selected A/B conditioning phrase is silent")
        # Match reference loudness gently; do not alter either user upload.
        gain = min(2.5, max(.35, .12 / rms))
        audio = np.clip(audio * gain, -.95, .95).astype(np.float32)
        return audio, start, voice_activity

    def extended_phrase(excerpt, frames):
        """Repeat private conditioning phrases with 120-ms smoothed seams."""
        count = int(math.ceil(frames / len(excerpt)))
        piece = np.tile(excerpt, (count, 1))[:frames].copy()
        fade = min(int(sr * .12), max(2, len(excerpt) // 12))
        for seam in range(len(excerpt), frames, len(excerpt)):
            n = min(fade, seam, frames - seam)
            if n > 1:
                # A crossfade over the original timeline, not artificial
                # silence or copied output used as a model result.
                blend = (0.5 - 0.5 * np.cos(
                    np.linspace(0, math.pi, n * 2, dtype=np.float32)
                ))[:, None]
                old = piece[seam-n:seam].copy()
                new = piece[seam:seam+n].copy()
                piece[seam-n:seam+n] = (
                    np.concatenate((old, old), axis=0) * (1 - blend) +
                    np.concatenate((new, new), axis=0) * blend
                )
        return piece

    selected = {}
    try:
        for role, path, required in (("a", a, max(lengths)), ("b", b, max(lengths))):
            selected[role] = best_excerpt(path, vocal_paths.get(role), required)
        fade = min(int(sr * .35), min(lengths) // 8)
        written = 0
        with sf.SoundFile(str(dest), "w+", samplerate=sr, channels=2,
                          subtype="PCM_24", format="WAV") as output:
            for index, (role, nominal) in enumerate(zip(roles, lengths)):
                excerpt, _, _ = selected[role]
                piece = extended_phrase(excerpt, nominal + (fade if index else 0))
                if index:
                    output.flush()
                    output.seek(written - fade)
                    previous = output.read(fade, dtype="float32", always_2d=True)
                    if len(previous) != fade:
                        raise FusionPlanError("Cannot join A/B conditioning phrases")
                    alpha = (0.5 - 0.5 * np.cos(
                        np.linspace(0, math.pi, fade, dtype=np.float32)
                    ))[:, None]
                    output.seek(written - fade)
                    output.write(previous * (1 - alpha) + piece[:fade] * alpha)
                    output.seek(written)
                    output.write(piece[fade:])
                else:
                    output.write(piece)
                written += nominal
            output.flush()
        with sf.SoundFile(str(dest)) as check:
            if check.frames != total_frames or check.channels != 2 or check.samplerate != sr:
                raise FusionPlanError("Dual-hook conditioning duration mismatch")
        return {
            "revision": "sonara-v6-dual-hook-reference-v1",
            "source": "a-b-alternating-conditioning-only",
            "seconds": seconds, "frames": total_frames,
            "containsSourceB": True, "containsSourceA": True,
            "sections": roles,
            "selection": "measured-stem-energy-not-chorus-transcription",
            "vocalStemActivityA": bool(selected["a"][2]),
            "vocalStemActivityB": bool(selected["b"][2]),
            "publishableAudio": False,
        }
    except BaseException:
        dest.unlink(missing_ok=True)
        raise


def _reference_activity_score(source_path, start_seconds, seconds):
    """Measured sustained source activity, not an invented genre or quality score."""
    with sf.SoundFile(str(source_path)) as src:
        begin = max(0, min(src.frames - 1, round(start_seconds * src.samplerate)))
        src.seek(begin)
        frames_left = min(src.frames - begin, round(seconds * src.samplerate))
        levels, clipped = [], 0
        while frames_left > 0:
            chunk = src.read(min(frames_left, src.samplerate),
                             dtype="float32", always_2d=True)
            if not len(chunk):
                break
            levels.append(float(np.sqrt(np.mean(np.square(chunk.astype(np.float64))))))
            clipped += int(np.count_nonzero(np.max(np.abs(chunk), axis=1) >= 0.998))
            frames_left -= len(chunk)
    if not levels:
        return -1000.0
    values = np.asarray(levels, dtype=np.float64)
    active = float(np.mean(values >= 0.004))
    energy = float(np.median(np.minimum(values, 0.25)))
    clipping = clipped / max(1, int(seconds * src.samplerate))
    # Prefer a sustained musical passage, not a loud isolated peak or silence.
    return 3.0 * active + min(1.0, energy * 9) - 2.0 * clipping


def make_independent_style_reference(source_b, destination, max_seconds=45,
                                     activity_audio_path=None):
    """Select an audible B-only musical passage for consistent style conditioning.

    When real Demucs drums from B are available, use their measured rhythmic
    activity to select a passage; exported samples still come from ORIGINAL B,
    never an A+B waveform overlay. No fake drum/tempo estimates are returned.
    """
    source_b = _input_audio(source_b)
    if not 10 <= max_seconds <= 60:
        raise FusionPlanError("Invalid reference excerpt duration")
    dest = _destination(destination, (source_b,))
    activity = _input_audio(activity_audio_path) if activity_audio_path else source_b
    with sf.SoundFile(str(source_b)) as info, sf.SoundFile(str(activity)) as act:
        if abs(info.frames / info.samplerate - act.frames / act.samplerate) > 1.0:
            raise FusionPlanError("B groove activity and original durations differ")
        length = min(info.frames / info.samplerate, float(max_seconds))
        available = max(0.0, info.frames / info.samplerate - length)
    try:
        positions = sorted(set(round(available * index / 10, 4) for index in range(11)))
        # Consistent active groove is more useful than a quiet intro or breakdown.
        candidates = [(float(_reference_activity_score(activity, start, length)) -
                       0.025 * abs(start - available / 2) / max(1.0, available),
                       start) for start in positions]
        _, selected_start = max(candidates)
        with sf.SoundFile(str(source_b)) as src:
            frames = min(src.frames, int(max_seconds * src.samplerate))
            start = min(src.frames - frames, int(round(selected_start * src.samplerate)))
            src.seek(start)
            data = src.read(frames, dtype="float32", always_2d=True)
            if src.channels == 1:
                data = np.repeat(data, 2, axis=1)
            if len(data) != frames or not np.isfinite(data).all() or np.max(np.abs(data)) < 1e-5:
                raise FusionPlanError("Style reference B is silent or unreadable")
            sf.write(str(dest), data, src.samplerate, subtype="PCM_24")
            return {"revision": FUSION_REVISION, "seconds": round(frames / src.samplerate, 2),
                    "startSeconds": round(start / src.samplerate, 2),
                    "activityBasedSelection": True,
                    "activitySource": "b-drums" if activity_audio_path else "b-original",
                    "source": "b-only", "containsSourceA": False}
    except BaseException:
        dest.unlink(missing_ok=True)
        raise



def ensure_distinct_sources(source_a, source_b):
    """Reject identical normalized source audio, without exposing audio hashes."""
    a = _input_audio(source_a)
    b = _input_audio(source_b)
    if a == b:
        raise FusionPlanError("A and B must be two genuinely different audio sources")
    def digest(path):
        h = hashlib.sha256()
        with path.open("rb") as audio:
            for chunk in iter(lambda: audio.read(1024 * 1024), b""):
                h.update(chunk)
        return h.digest()
    if digest(a) == digest(b):
        raise FusionPlanError("A and B have identical audio content")
    return True


def select_fusion_tempo(explicit_a, report_a, explicit_b, report_b):
    """Use a verified musical tempo when known; never block creative fusion otherwise.

    A user-selected tempo takes priority. The analyzer may be uncertain on
    syncopated/ambient tracks; B's tempo may provide a useful fallback, and
    finally the generator is allowed to infer tempo from its audio references.
    """
    def parsed(value, explicit):
        if value is None or value == "":
            return None
        try:
            number = float(value)
        except (ValueError, TypeError, OverflowError):
            if explicit:
                raise FusionPlanError("Invalid user-selected BPM")
            return None
        if not math.isfinite(number) or not 40 <= number <= 220:
            if explicit:
                raise FusionPlanError("Selected BPM must be between 40 and 220")
            return None
        return round(number, 2)

    # Explicit creator choices always outrank inferred values from either track.
    for value, explicit in (
        (explicit_a, True),
        (explicit_b, True),
        (report_a.get("tempoBpm"), False),
        (report_b.get("tempoBpm"), False),
    ):
        found = parsed(value, explicit)
        if found is not None:
            return found
    return None


def build_fusion_prompt(creator_prompt, report_a, report_b, *,
                        target_bpm=None, target_key=None, bass_from="a",
                        requested_seconds=None):
    """One stable musical brief for all sections, honoring creator controls.

    Reports can disagree about key/tempo. They are observations, NOT two
    simultaneous instructions to the model. A single chosen pulse and key
    anchor the final composition; B contributes the rhythmic vocabulary.
    """
    creator = str(creator_prompt or "").strip()
    if not creator:
        raise FusionPlanError("The creator's musical direction is required")
    if bass_from not in ("a", "b"):
        raise FusionPlanError("Bass source must be A or B")

    def measured(report, field, confidence_field):
        value = report.get(field)
        try:
            confidence = float(report.get(confidence_field) or 0)
        except (TypeError, ValueError):
            confidence = 0
        return str(value) if value and math.isfinite(confidence) and confidence >= 0.45 else None

    tempo_a = measured(report_a, "tempoBpm", "tempoConfidence")
    tempo_b = measured(report_b, "tempoBpm", "tempoConfidence")
    key_a = measured(report_a, "key", "keyConfidence")
    key_b = measured(report_b, "key", "keyConfidence")
    key_anchor = (str(target_key).strip() if target_key else key_a) or None
    bpm_anchor = target_bpm if target_bpm is not None else (
        float(tempo_a) if tempo_a else float(tempo_b) if tempo_b else None
    )
    if bpm_anchor is not None and (not math.isfinite(float(bpm_anchor)) or
                                  not 40 <= float(bpm_anchor) <= 220):
        raise FusionPlanError("Target tempo outside 40-220 BPM")
    facts = []
    if tempo_a:
        facts.append("Measured A pulse: " + tempo_a + " BPM.")
    if tempo_b:
        facts.append("Measured B pulse: " + tempo_b + " BPM.")
    if key_a:
        facts.append("Measured A tonal center: " + key_a + ".")
    if key_b:
        facts.append("Measured B tonal center: " + key_b + ".")
    if bpm_anchor is not None:
        facts.append("ONE mandatory target tempo: " + str(round(float(bpm_anchor), 1)) +
                     " BPM. Adapt B's groove to this pulse; do not change meter or tempo mid-song.")
    if key_anchor:
        facts.append("ONE mandatory tonal center: " + key_anchor +
                     ". Reharmonize B's colors into this key; never superpose conflicting chords.")
    if key_a and key_b and key_a != key_b:
        facts.append("Transform B's melodic gestures into a compatible tonal center; never retain clashing simultaneous keys.")
    bass_direction = (
        "Anchor the bass line to A's harmonic root motion; B supplies rhythmic "
        "syncopation, drum articulation and production energy."
        if bass_from == "a" else
        "Take the bass timbre and rhythmic vocabulary from B, but revoice "
        "all bass notes to A's chord progression and the single target key."
    )
    form = (
        "Form: concise introduction, recognizable A-derived main theme, "
        "B-inspired groove entrance, controlled development, a short breakdown, "
        "strong return of the SAME hook, and a resolved ending. "
        if requested_seconds is None or requested_seconds >= 120 else
        "Form: establish the A-derived hook, introduce B's groove, vary it and "
        "resolve clearly within the short requested duration. "
    )
    instruction = (
        "SONARA ORIGINAL TWO-SONG FUSION. Compose ONE entirely new, coherent "
        "musical performance inspired by BOTH independently supplied songs. "
        "Audio A supplies the melodic/harmonic foundation and central motif. "
        "Audio B supplies rhythmic phrasing, drum textures and instrumental color. "
        "Keep ONE tempo, ONE tonic, ONE recognizable main hook, ONE consistent "
        "drum kit and a unified production palette from beginning to end. "
        + bass_direction + " " + form +
        "Natural human drum grooves: varied hi-hat velocity, ghost notes and "
        "occasional short fills; never a monotonous repeated synthetic kick pattern. "
        "Use musical counterpoint and space instead of stacking unrelated "
        "melodies, vocal lines or chord changes. If voices are present, keep "
        "the phrasing intelligible and free of overlapping gibberish. "
        "Regenerate the complete audio through the model; NEVER add raw A+B "
        "stems together, layer original recordings, alternate unchanged songs, "
        "or create a DJ mix, mashup or medley. Preserve natural transitions, "
        "musical dynamics and a balanced master. "
    )
    return (instruction + " ".join(facts) + " Creator direction: " + creator)[:9000]
