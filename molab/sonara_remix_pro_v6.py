"""SONARA Remix Pro V6 Creative DNA engine.

An opt-in overlay on the verified private V5 generation path. Extracts real,
bounded features from authorized source audio and source-separated drums.
No fabricated beat/chord transcription, semantic fidelity scores or fake audio.
The render remains a single ACE-Step generated WAV; no A+B waveform overlay.
"""
from __future__ import annotations

from dataclasses import dataclass
import math
from pathlib import Path

MODES = ("balanced", "experimental", "wild", "explosive")
MASTERS = ("streaming", "club")
COMPONENTS = ("melody", "harmony", "groove", "timbre", "humanize")


class V6ControlError(ValueError):
    pass


@dataclass(frozen=True)
class CreativeControls:
    mode: str = "balanced"
    melody: int = 65
    harmony: int = 60
    groove: int = 65
    timbre: int = 55
    humanize: int = 60
    master: str = "streaming"


def v6_controls(params):
    if not isinstance(params, dict) or params.get("v6") is not True:
        raise V6ControlError("V6 is not enabled for this job")
    raw = params.get("v6Controls")
    if not isinstance(raw, dict) or set(raw) - set(CreativeControls.__dataclass_fields__):
        raise V6ControlError("Invalid V6 controls")
    values = {**vars(CreativeControls()), **raw}
    if values["mode"] not in MODES or values["master"] not in MASTERS:
        raise V6ControlError("Unsupported V6 mode or mastering profile")
    for key in COMPONENTS:
        value = values[key]
        if type(value) is not int or not 0 <= value <= 100 or value % 5:
            raise V6ControlError("V6 controls must be integers 0-100, step 5")
    return CreativeControls(**values)


def _confidence(report, key):
    value = report.get(key) if isinstance(report, dict) else None
    try:
        return round(min(1.0, max(0.0, float(value))), 3)
    except (ValueError, TypeError):
        return 0.0


def musical_dna(report_a, report_b, drums_b=None):
    """Summarize measured music evidence only; no transcription claims.

    Analysis reports come from the existing librosa/onset/chroma analyzer.
    Drum density is optional and measured by the existing V5 stem feature.
    """
    a = report_a if isinstance(report_a, dict) else {}
    b = report_b if isinstance(report_b, dict) else {}
    groove = drums_b if isinstance(drums_b, dict) else {}
    def describe(source):
        tempo = source.get("tempoBpm")
        try:
            tempo = float(tempo)
            if not math.isfinite(tempo) or not 40 <= tempo <= 220:
                tempo = None
        except (TypeError, ValueError):
            tempo = None
        key = source.get("key")
        if not isinstance(key, str) or len(key) > 24:
            key = None
        boundaries = source.get("boundaryCandidatesSeconds")
        times = []
        if isinstance(boundaries, list):
            for x in boundaries[:24]:
                try:
                    seconds = float(x)
                    if math.isfinite(seconds) and 0 <= seconds <= 900:
                        times.append(round(seconds, 1))
                except (TypeError, ValueError):
                    continue
        return {
            "tempoBpm": round(tempo, 1) if tempo is not None and _confidence(source, "tempoConfidence") >= .45 else None,
            "tempoConfidence": _confidence(source, "tempoConfidence"),
            "keyEstimate": key if _confidence(source, "keyConfidence") >= .5 else None,
            "keyConfidence": _confidence(source, "keyConfidence"),
            "energyBoundariesSeconds": times,
            "boundaryMethod": "energy-change-proxy-not-verified-musical-form",
        }
    result = {"version": "sonara-v6-measured-dna-v1",
              "a": describe(a), "b": describe(b),
              "grooveOnsetsPerSecond": None,
              "analysisLimit": "No verified chord/lyric transcription or semantic source similarity"}
    if groove.get("confidence") == "measured-onset-proxy":
        try:
            v = float(groove.get("onsetsPerSecond"))
            if math.isfinite(v) and 0 <= v <= 100:
                result["grooveOnsetsPerSecond"] = round(v, 2)
        except (TypeError, ValueError):
            pass
    return result


def compose_direction(controls, dna, candidate_index, candidate_count):
    """Compose meaningfully different arrangements without audio collage."""
    if not isinstance(controls, CreativeControls):
        raise V6ControlError("Controls not validated")
    if not isinstance(dna, dict) or not isinstance(candidate_count, int) or not 1 <= candidate_count <= 3:
        raise V6ControlError("Invalid composition plan")
    if not isinstance(candidate_index, int) or candidate_index not in range(candidate_count):
        raise V6ControlError("Invalid candidate index")
    themes = (
        "Melody-led: reinterpret A's phrasing, answer it with fresh B-inspired syncopation; introduce a contrasting second hook.",
        "Rhythm-led: start from B's feel, write a new melodic counter-line and develop the low-end dialogue without stacking original stems.",
        "Transformation-led: deliberately contrast short breakdown and groove sections, reinterpret the motif during the final return.",
    )
    mode = {
        "balanced": "Build a cohesive song with a recurring identity; musical development must be smooth.",
        "experimental": "Explore novel harmonic voicings and meaningful arrangement variations with consistent tonal center.",
        "wild": "Use bold contrasts and unexpected but musically coherent hook transformations; avoid repetitive formulaic arrangements.",
        "explosive": "EXPLOSIVE CONTINUOUS-GROOVE FUSION — CONTINUITY LOCK: keep one strict BPM, one time signature, ONE constant kick/snare/hi-hat/bass pocket for every bar, including introductions, vocals, refrains and transitions. The A and B hook families and fresh call-and-response vocals evolve ABOVE the same uninterrupted groove. Add harmonies, choirs, instruments and effects without ever cutting, dropping, stopping or switching the drum rhythm. No breakdowns, silences, stop-start transitions, half-time, double-time, tempo jumps or rhythm resets. The climactic chorus keeps exactly the same pulse.",
    }[controls.mode]
    def intensity(value):
        return "subtle" if value < 35 else "strong" if value >= 75 else "moderate"
    evidence = []
    if dna.get("a", {}).get("tempoBpm") is not None:
        evidence.append("A measured pulse: " + str(dna["a"]["tempoBpm"]) + " BPM (not downbeat-verified).")
    if dna.get("b", {}).get("tempoBpm") is not None:
        evidence.append("B measured pulse: " + str(dna["b"]["tempoBpm"]) + " BPM (not downbeat-verified).")
    if dna.get("grooveOnsetsPerSecond") is not None:
        evidence.append("Measured B drum onset proxy: " + str(dna["grooveOnsetsPerSecond"]) + "/second; not a verified swing metric.")
    theme = ("Stable pulse: reinterpret A melody and B hook as alternating melodic or vocal calls over a single invariant kick/bass groove."
             if controls.mode == "explosive" else themes[candidate_index % len(themes)])
    return " ".join([
        "SONARA CREATIVE DNA V6: create ONE original cohesive musical performance, never overlay, edit together, or medley source audio.",
        mode, theme,
        "A melodic phrasing influence " + intensity(controls.melody) + ".",
        "A harmonic motion influence " + intensity(controls.harmony) + "; use only one stable compatible key.",
        "B groove language influence " + intensity(controls.groove) + ".",
        "B instrument color influence " + intensity(controls.timbre) + "; do not reproduce unverified instruments literally.",
        "Performance naturalness " + intensity(controls.humanize) +
        ": vary velocities, ghost notes, intentional fills and bass articulation, never randomized off-beat notes.",
        "Dynamics: evolve vocal and harmonic texture, natural hi-hat velocity and restrained fills; the foundational drum beat remains continuous and recognizable.",
        *([
            "DUAL SOURCE CHORUS PLAN: A-derived main refrain -> B-derived answering refrain -> combined NEW final refrain with memorable vocal hook; do not preserve incompatible pitches or stack raw vocals.",
            "Where both sources demonstrably contain singing, reinterpret BOTH vocal phrasings and any intelligible refrain into NEW lead/call-response singing, backing choir and harmonies; do not invent exact lyric transcription or assume vocal content from onset activity alone.",
            "Orchestration: energetic bass and the same repeating kick/snare groove, colorful keys, guitars or brass when appropriate, synth layers, subtle sweeps, controlled delays and reverbs, an instrumentally fuller final chorus WITHOUT a beat break or a different rhythm; maintain clarity, space and believable human performances.",
            "CONTINUITY LOCK: consistent backing groove throughout; retain the exact drum pattern, tempo, meter and kick/bass rhythmic relationship across ALL sections. A richer finale changes orchestration, not the beat. The references are inspiration for a single regenerated song, never an A/B recording splice or raw stem overlay."
        ] if controls.mode == "explosive" else []),
        *evidence,
    ])[:2100]


def perceptual_proxy(candidate, other_candidates):
    """A conservative *measured* spectral distinction proxy, not artistry.

    Compare independent candidates by short-time band-energy proportions
    from sampled windows. Return a measurable diversity metric in [0, 1].
    Sampling keeps GPU RAM and CPU bounded.
    """
    import numpy as np
    import soundfile as sf
    def fingerprint(path):
        bands = []
        with sf.SoundFile(str(Path(path).resolve(strict=True))) as wav:
            sr = wav.samplerate
            if not 22050 <= sr <= 96000:
                raise V6ControlError("Unsupported sample rate for analysis")
            window = min(sr * 2, wav.frames)
            if window < sr:
                raise V6ControlError("Candidate too short")
            for fraction in (.12, .37, .62, .87):
                wav.seek(max(0, int((wav.frames - window) * fraction)))
                y = wav.read(window, dtype="float32", always_2d=True).mean(axis=1)
                if not np.isfinite(y).all():
                    raise V6ControlError("Invalid candidate samples")
                nfft = min(2048, len(y))
                chunk = y[:len(y)//nfft*nfft].reshape(-1, nfft)
                spectra = np.abs(np.fft.rfft(chunk, axis=1)).mean(axis=0)
                hz = np.fft.rfftfreq(nfft, 1 / sr)
                powers = [float(spectra[(hz >= low) & (hz < high)].sum())
                          for low, high in ((30, 150), (150, 700), (700, 2600), (2600, 9000))]
                total = sum(powers) + 1e-9
                bands.extend(x / total for x in powers)
        return np.asarray(bands, dtype=np.float64)
    reference = fingerprint(candidate)
    if not other_candidates:
        return 0.0
    distances = [float(np.abs(reference - fingerprint(other)).mean()) for other in other_candidates]
    return round(min(1.0, max(0.0, min(distances) * 3)), 4)


def creative_judge(audit, technical, dna, candidate, others):
    """Transparent multi-criteria technical/novelty proxy; NOT an artistic rating."""
    import math
    technical = min(100., max(0., float(technical)))
    diversity = perceptual_proxy(candidate, others)
    continuity = audit.get("nearSilenceFrameRatio")
    try:
        continuity = min(1., max(0., float(continuity)))
    except (TypeError, ValueError):
        continuity = 1.
    coherent = 100 * (1 - continuity)
    novelty = 100 * diversity
    return {
        "selectionScore": round(.80 * technical + .12 * coherent + .08 * novelty, 2),
        "technicalScore": round(technical, 2),
        "continuityProxy": round(coherent, 2),
        "spectralDiversityProxy": round(novelty, 2),
        "isArtisticJudgment": False,
        "dnaMeasurementsPresent": bool(dna.get("a") and dna.get("b")),
    }


def master_v6(audio, sr, controls, genre="auto"):
    """Two *selectable* mastering targets; use conservative real DSP.

    Streaming follows V5 adaptive -14 LUFS; club provides warmer, punchier
    -11 LUFS target only when source dynamics/headroom allow it.
    The verified downstream true-peak/quality gate remains authoritative.
    """
    import numpy as np
    from sonara_remix_pro_v5 import professional_master
    if not isinstance(controls, CreativeControls):
        raise V6ControlError("Invalid controls")
    if controls.master == "streaming":
        y, data = professional_master(audio, sr, genre=genre)
        return y, {**data, "profile": "streaming", "requestedLufs": -14.0}
    from sonara_remix_pro_toolkit import transparent_master
    # Apply the same physically measured V5 bass/presence adaptation first.
    y, data = professional_master(audio, sr, genre=genre)
    club, metrics = transparent_master(y, sr=sr, lufs=-11.0, peak_ceiling=-1.0)
    if not np.isfinite(club).all() or np.max(np.abs(club)) > 1.0:
        raise V6ControlError("Unsafe club master samples")
    return club, {**data, **metrics, "profile": "club",
                  "requestedLufs": -11.0, "truePeakCertified": False}
