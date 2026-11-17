"""V10 musical evidence for SONARA Remix Pro (CPU, no audio generation).

Bounds IO and memory. The pitch-class spectrum is a *coarse* tonal proxy,
not key/chord/melody transcription. It MUST NOT be used to assert that a
remix is artistic, original, licensed or musically correct.
"""
from __future__ import annotations

import math
from pathlib import Path

REVISION = "sonara-v10-tonal-evidence-and-transitions-r1"
_PITCH_CLASSES = ("C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B")


def tonal_profile(path, *, max_seconds=72):
    """Compute a bounded, robust chroma-like spectrum from real WAV audio."""
    import numpy as np
    import soundfile as sf

    if not isinstance(max_seconds, int) or not 8 <= max_seconds <= 90:
        raise ValueError("Invalid bounded analysis duration")
    with sf.SoundFile(str(Path(path).resolve(strict=True))) as f:
        if f.channels not in (1, 2) or not 22050 <= f.samplerate <= 96000:
            raise ValueError("Invalid music source for tonal analysis")
        if not 2 <= f.frames / f.samplerate <= 900:
            raise ValueError("Invalid source duration")
        sr = f.samplerate
        nfft = 16384
        freqs = np.fft.rfftfreq(nfft, 1 / sr)
        valid = (freqs >= 80) & (freqs <= 3200)
        notes = np.rint(69 + 12 * np.log2(np.maximum(freqs[valid], 1) / 440)).astype(int)
        pc = notes % 12
        hist = np.zeros(12, dtype=np.float64)
        frame_count = 0
        scanned = 0
        limit = min(f.frames, sr * max_seconds)
        stride = int(sr * 1.5)
        while scanned < limit:
            raw = f.read(min(stride, limit - scanned), dtype="float32", always_2d=True)
            scanned += len(raw)
            if not len(raw):
                break
            if not np.isfinite(raw).all():
                raise ValueError("Non-finite source samples")
            mono = np.mean(raw, axis=1, dtype=np.float64)
            if len(mono) < 512 or float(np.sqrt(np.mean(mono * mono))) < .0015:
                continue
            if len(mono) > nfft:
                offset = (len(mono) - nfft) // 2
                mono = mono[offset:offset+nfft]
            elif len(mono) < nfft:
                mono = np.pad(mono, (0, nfft-len(mono)))
            spectrum = np.abs(np.fft.rfft(mono * np.hanning(nfft)))[valid]
            floor = float(np.median(spectrum))
            peaks = np.maximum(spectrum - floor * 2.5, 0)
            power = np.sqrt(peaks)
            if float(np.sum(power)) < 1e-7:
                continue
            hist += np.bincount(pc, weights=power, minlength=12)
            frame_count += 1
    total = float(np.sum(hist))
    if not frame_count or total <= 1e-8:
        return {"revision": REVISION, "status": "unverified", "observations": 0,
                "pitchClassEnergy": None, "prominentClasses": [], "confidence": 0.}
    normalized = hist / total
    ratio = float(np.max(normalized) / max(1e-9, np.mean(normalized)))
    confidence = float(np.clip((ratio - 1) / 4, 0, 1))
    # A strong tonal 'fingerprint' is still not verified song key or harmony.
    return {"revision": REVISION, "status": "measured-proxy", "observations": frame_count,
            "pitchClassEnergy": [round(float(x), 6) for x in normalized],
            "prominentClasses": [_PITCH_CLASSES[int(i)] for i in np.argsort(-normalized)[:3]],
            "confidence": round(confidence, 3)}


def compare_profiles(a, b):
    """Keep A as harmonic anchor; use measured evidence to plan B adaptations."""
    import numpy as np
    if not isinstance(a, dict) or not isinstance(b, dict) or any(
            x.get("revision") != REVISION for x in (a, b)):
        raise ValueError("Two measured V10 profiles are required")
    x, y = a.get("pitchClassEnergy"), b.get("pitchClassEnergy")
    if x is None or y is None:
        return {"revision": REVISION, "relationship": "uncertain", "similarity": None,
                "verifiedKeyOrChords": False}
    u, v = np.asarray(x, dtype=np.float64), np.asarray(y, dtype=np.float64)
    if u.shape != (12,) or v.shape != (12,) or not np.isfinite(u).all() or not np.isfinite(v).all():
        raise ValueError("Invalid pitch-class vectors")
    similarity = float(np.dot(u, v) / max(1e-12, np.linalg.norm(u) * np.linalg.norm(v)))
    if min(float(a.get("confidence", 0)), float(b.get("confidence", 0))) < .10:
        relationship = "uncertain"
    elif similarity >= .84:
        relationship = "similar-colour-proxy"
    elif similarity < .63:
        relationship = "potential-harmonic-clash"
    else:
        relationship = "partial-overlap-proxy"
    return {"revision": REVISION, "relationship": relationship,
            "similarity": round(similarity, 3), "verifiedKeyOrChords": False}


def harmonic_direction(comparison):
    """Grounded musical production instruction, without promising a correct transposition."""
    if not isinstance(comparison, dict) or comparison.get("revision") != REVISION:
        raise ValueError("Untrusted harmonic profile")
    relation = comparison.get("relationship")
    if relation == "similar-colour-proxy":
        return ("A/B sampled pitch-class colours broadly align. Keep one A-centred harmonic "
                "bed and let B answer with fresh motifs instead of full overlapping chords. ")
    if relation == "potential-harmonic-clash":
        return ("A/B pitch-class colours appear different. Keep A as the harmonic anchor; "
                "revoice any newly GENERATED B-inspired chords and bass lines rather than "
                "placing the original B accompaniment directly over A. Never pitch-shift "
                "or rewrite the original A/B lead vocal recordings. ")
    if relation in ("partial-overlap-proxy", "uncertain"):
        return ("Tonal compatibility is not proven. Use sparse A-centred harmony, "
                "musical space around both original vocal performances and avoid "
                "simultaneous conflicting full chord stacks. ")
    raise ValueError("Invalid harmonic relationship")


def transition_report(audio_path, sections):
    """Advisory RMS/edge discontinuity check at V8/V9 form boundaries.

    Normal intentional arrangement changes can also score high; never use
    these proxy measurements alone to reject a customer-generated master.
    """
    import numpy as np
    import soundfile as sf
    if not isinstance(sections, list) or not 2 <= len(sections) <= 10:
        raise ValueError("Invalid song form for transition analysis")
    details = []
    with sf.SoundFile(str(audio_path)) as f:
        if f.channels not in (1, 2) or not 22050 <= f.samplerate <= 96000:
            raise ValueError("Unsupported master format")
        for s in sections[:-1]:
            second = float(s["endSeconds"])
            if not math.isfinite(second) or second < .6 or second > f.frames / f.samplerate - .6:
                raise ValueError("Invalid transition boundary")
            midpoint = round(second * f.samplerate)
            window = min(round(.3 * f.samplerate), midpoint, f.frames - midpoint)
            f.seek(midpoint-window)
            arr = f.read(2 * window, dtype="float32", always_2d=True)
            if len(arr) != 2*window or not np.isfinite(arr).all():
                raise ValueError("Unreadable transition")
            before = float(np.sqrt(np.mean(arr[:window].astype(np.float64) ** 2)))
            after = float(np.sqrt(np.mean(arr[window:].astype(np.float64) ** 2)))
            difference = abs(20 * math.log10(max(before, 1e-8) / max(after, 1e-8)))
            edge = float(np.max(np.abs(arr[window] - arr[window-1])))
            details.append({"atSeconds": round(second, 2), "rmsJumpDb": round(difference, 2),
                            "sampleEdgeJump": round(edge, 5),
                            "needsListening": difference > 7 or edge > .2})
    return {"revision": REVISION, "transitions": details,
            "maxRmsJumpDb": max((v["rmsJumpDb"] for v in details), default=0),
            "needsListeningCount": sum(v["needsListening"] for v in details),
            "advisoryOnly": True}
