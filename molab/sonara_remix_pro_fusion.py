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

FUSION_REVISION = "sonara-dual-reference-composition-v1"


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
    """Prepare ONLY A as a continuous cover guide of the requested duration.

    For a longer result, replay A's authentic structural phrases for reference.
    This is not the user-facing song: the model must regenerate every frame
    using distinct A and B conditioning. B is NEVER mixed into this guide.
    """
    source_a = _input_audio(source_a)
    if not isinstance(seconds, int) or seconds < 30 or seconds > 480 or seconds % 30:
        raise FusionPlanError("Output duration must be 30-480 seconds in steps of 30")
    dest = _destination(destination, (source_a,))
    written = 0
    repeated = 0
    try:
        with sf.SoundFile(str(source_a)) as src:
            sr, channels = src.samplerate, src.channels
            target_frames = int(sr * seconds)
            with sf.SoundFile(str(dest), "w", samplerate=sr,
                              channels=2, subtype="PCM_16", format="WAV") as out:
                while written < target_frames:
                    frames = min(65536, target_frames - written)
                    chunk = src.read(frames, dtype="float32", always_2d=True)
                    if len(chunk) == 0:
                        src.seek(0)
                        repeated += 1
                        continue
                    if channels == 1:
                        chunk = np.repeat(chunk, 2, axis=1)
                    out.write(chunk)
                    written += len(chunk)
        with sf.SoundFile(str(dest)) as check:
            if check.frames != target_frames or check.channels != 2:
                raise FusionPlanError("Structural guide has incorrect duration")
        return {"revision": FUSION_REVISION, "seconds": seconds,
                "source": "a-only", "sourceRepetitions": repeated,
                "containsSourceB": False, "frames": target_frames}
    except BaseException:
        dest.unlink(missing_ok=True)
        raise


def make_independent_style_reference(source_b, destination, max_seconds=45):
    """Extract a real, non-mixed B excerpt for the model's style input."""
    source_b = _input_audio(source_b)
    if not 10 <= max_seconds <= 60:
        raise FusionPlanError("Invalid reference excerpt duration")
    dest = _destination(destination, (source_b,))
    try:
        with sf.SoundFile(str(source_b)) as src:
            frames = min(src.frames, int(max_seconds * src.samplerate))
            # Use a central musical passage instead of assuming the intro
            # contains the song's groove and full instrumentation.
            start = int((src.frames - frames) * 0.35)
            src.seek(start)
            data = src.read(frames, dtype="float32", always_2d=True)
            if src.channels == 1:
                data = np.repeat(data, 2, axis=1)
            if len(data) != frames or np.max(np.abs(data)) < 1e-5:
                raise FusionPlanError("Style reference B is silent or unreadable")
            sf.write(str(dest), data, src.samplerate, subtype="PCM_16")
        return {"revision": FUSION_REVISION, "seconds": round(frames / src.samplerate, 2),
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

    for value, explicit in (
        (explicit_a, True),
        (report_a.get("tempoBpm"), False),
        (explicit_b, True),
        (report_b.get("tempoBpm"), False),
    ):
        found = parsed(value, explicit)
        if found is not None:
            return found
    return None


def build_fusion_prompt(creator_prompt, report_a, report_b):
    """Build a creative brief from real measured facts, without fake music tags."""
    creator = str(creator_prompt or "").strip()
    if not creator:
        raise FusionPlanError("The creator's musical direction is required")

    def measured(report, field, confidence_field):
        value = report.get(field)
        confidence = float(report.get(confidence_field) or 0)
        return str(value) if value and confidence >= 0.45 else None

    tempo_a = measured(report_a, "tempoBpm", "tempoConfidence")
    tempo_b = measured(report_b, "tempoBpm", "tempoConfidence")
    key_a = measured(report_a, "key", "keyConfidence")
    key_b = measured(report_b, "key", "keyConfidence")

    facts = []
    if tempo_a:
        facts.append("Measured A pulse: " + tempo_a + " BPM.")
    if tempo_b:
        facts.append("Measured B pulse: " + tempo_b + " BPM.")
    if key_a:
        facts.append("Measured A tonal center: " + key_a + ".")
    if key_b:
        facts.append("Measured B tonal center: " + key_b + ".")
    if key_a and key_b and key_a != key_b:
        facts.append("Transform B's melodic gestures into a compatible tonal center; never retain clashing simultaneous keys.")

    instruction = (
        "SONARA ORIGINAL TWO-SONG FUSION. Compose ONE entirely new, coherent "
        "musical performance inspired by BOTH independently supplied songs. "
        "Audio A is structural/melodic guidance; audio B is separate timbre and "
        "musical-style conditioning. Recompose, vary and revoice the melodic "
        "gestures and harmonic identity of A with rhythmic vocabulary, "
        "instrumental timbres, motifs and production energy inspired by B. "
        "Integrate BOTH identities throughout the new composition; develop a "
        "fresh hook and chord voicings, intentional buildup and release, "
        "natural percussion variations, consistent groove, one tonal center "
        "and connected sections. Regenerate the complete music through the "
        "model. NEVER add raw A+B stems together, layer original recordings, "
        "alternate unchanged songs, or make a DJ mix, mashup or medley. "
        "Keep a single purposeful arrangement, realistic instruments, clean "
        "vocal placement and professional transitions. "
    )
    return (instruction + " ".join(facts) + " Creator direction: " + creator)[:9000]
