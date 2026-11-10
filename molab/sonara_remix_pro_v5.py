"""SONARA Remix Pro V5: measured two-reference creative production.

This module is isolated from main ACE-Step and the public relay. No fake stems,
perceptual scores or claims of verified A+B melodic identity. Candidate
selection ranks measurable technical quality only, not artistic merit.
"""
from __future__ import annotations

import math
from pathlib import Path

GENRE_PROFILES = {
    "auto": "Follow the actual material of A and B; natural instrument phrasing and arrangement.",
    "house": "Four-on-the-floor house with humanized kick, lively syncopated hats, musical bass, evolving keys and tasteful fills.",
    "tech-house": "Tight tech-house percussion, deliberate kick and bass interplay, controlled groove variations, detailed organic shakers.",
    "deep-house": "Warm deep-house chords, expressive bass, natural hi-hat dynamics, spacious pads, nuanced rhythmic subdivisions.",
    "jazz-fusion": "Human-performance jazz fusion, articulate live kit, dynamic bass, tasteful keys and guitar interplay, expressive improvisational fills.",
    "hip-hop": "Organic hip-hop rhythm pocket, articulated snare, varied swing, natural bass and clear lead phrasing, no robotic repetitions.",
    "latin-house": "Latin house percussion with clave-aware groove, congas and shakers, syncopated bass, natural hand-percussion dynamics.",
    "pop": "Contemporary pop structure, lively acoustic and electronic instrumentation, coherent hooks and a polished but dynamic mix.",
}
VERSIONS = ("groove-first", "melody-first", "balanced-arrangement")


class V5QualityRejected(RuntimeError):
    """All genuinely generated candidates failed the technical release gate."""


class V5ControlError(ValueError):
    pass


def v5_controls(params, duration):
    """Allowlisted, bounded controls; no untrusted dynamic engine parameters."""
    if not isinstance(params, dict) or params.get("v5") is not True:
        raise V5ControlError("V5 was not explicitly requested")
    try:
        seconds = int(duration)
        mix = int(params.get("bInfluence", 50))
        candidates = int(params.get("candidateCount", 1))
    except (ValueError, TypeError) as exc:
        raise V5ControlError("Invalid V5 numeric control") from exc
    if seconds < 30 or seconds > 480 or seconds % 30:
        raise V5ControlError("Unsupported output duration")
    if not 20 <= mix <= 80 or not 1 <= candidates <= 3:
        raise V5ControlError("V5 controls outside safe range")
    genre = str(params.get("genre") or "auto")
    if genre not in GENRE_PROFILES:
        raise V5ControlError("Unknown music genre")
    mode = str(params.get("durationMode") or "manual")
    if mode not in ("manual", "auto"):
        raise V5ControlError("Invalid duration selection mode")
    # GPU budget: at most three short, two medium, one long candidate.
    maximum = 3 if seconds <= 90 else 2 if seconds <= 180 else 1
    if candidates > maximum:
        raise V5ControlError("Candidate count exceeds duration-based GPU budget")
    return {
        "bInfluence": mix, "genre": genre, "candidateCount": candidates,
        "durationMode": mode, "durationSec": seconds,
    }


def drum_activity(drum_path, seconds=35):
    """Measure onset density of genuine B drums, not 'detect' unverified style."""
    import numpy as np
    import soundfile as sf
    path = Path(drum_path).resolve(strict=True)
    with sf.SoundFile(str(path)) as wav:
        if wav.samplerate < 8000 or wav.channels not in (1, 2):
            raise ValueError("Invalid B drum stem")
        y = wav.read(min(wav.frames, int(wav.samplerate * seconds)),
                     dtype="float32", always_2d=True)
        sr = wav.samplerate
    if len(y) < sr or not np.isfinite(y).all():
        raise ValueError("Unreadable B drum signal")
    hop = max(1, int(sr * .02))
    power = np.mean(np.square(y[:len(y)//hop*hop].reshape(-1, hop, y.shape[1])), axis=(1,2))
    flux = np.maximum(0, np.diff(np.sqrt(power + 1e-12)))
    if not len(flux) or float(flux.max()) < 1e-5:
        return {"onsetsPerSecond": 0.0, "confidence": "low", "density": "unverified"}
    # Robust threshold; energy changes alone never prove a beat or musical meter.
    threshold = max(float(np.median(flux) + 2.5 * np.std(flux)), 0.012 * float(np.max(np.sqrt(power))))
    hits = int(sum(flux > threshold))
    density = hits / max(.01, len(y)/sr)
    return {
        "onsetsPerSecond": round(density, 2),
        "confidence": "measured-onset-proxy",
        "density": "sparse" if density < .9 else "moderate" if density < 2.8 else "dense",
    }


def build_v5_brief(base_prompt, controls, *, drum_measurement, candidate_index):
    """Musical structure and instrument directives; references remain separate."""
    if candidate_index not in range(controls["candidateCount"]):
        raise V5ControlError("Candidate index outside authorized budget")
    prominence = controls["bInfluence"]
    emphasis = (
        "Retain more of A's recognizable harmonic movement and melodic phrasing; borrow B's drum accents selectively."
        if prominence <= 40 else
        "Transfer B's expressive rhythmic articulation, swing and instrumental palette prominently while reharmonizing into A's single tonal center."
        if prominence >= 65 else
        "Balance A's melodic identity with B's groove language; integrate them in a new single performance."
    )
    variation = (
        "Keep the main A-derived motif prominent and introduce restrained B rhythmic counterpoint.",
        "Give B's rhythmic vocabulary stronger call-and-response against the A-derived hook without replacing A's harmonic identity.",
        "Use dynamic contrast, tasteful breaks and a clear final return of the central theme.",
    )[candidate_index]
    duration = controls["durationSec"]
    form = (
        "INTRO -> HOOK -> GROOVE DEVELOPMENT -> BREAK -> HOOK RETURN -> RESOLUTION."
        if duration >= 120 else
        "HOOK -> GROOVE ENTRANCE -> SHORT DEVELOPMENT -> RESOLUTION."
    )
    activity = drum_measurement or {}
    measured = (
        "Measured B percussion transient density: " + str(activity["onsetsPerSecond"]) +
        " onsets per second (rough signal proxy, not verified tempo)."
        if activity.get("confidence") == "measured-onset-proxy" else
        "Do not invent a beat or swing estimate if source B is rhythmically uncertain."
    )
    return (
        str(base_prompt).strip() + "\n"
        "SONARA V5 CREATIVE PRODUCTION. " + GENRE_PROFILES[controls["genre"]] + " " +
        "Use the two independent audio inputs to compose one new performance, not an overlay or medley. " +
        "Preserve a stable key and target BPM. " + emphasis + " " + variation + " " +
        "FORM: " + form + " " + measured + " " +
        "NATURAL INSTRUMENTATION: vary drum velocities, ghost notes, kick and bass articulation, " +
        "human timing, subtle timbral variation and occasional deliberate fills. " +
        "Avoid mechanical repeated drum syllables, plastic timbres, abrupt kit swaps, " +
        "fake vocal words and abrupt edits. Maintain a recognizable recurring hook " +
        "and consistent sonic space in every long-form segment."
    )[:9000]


def professional_master(audio, sr, *, genre="auto"):
    """Conservative, *actual* adaptive filtering + bass control + peak-safe loudness.

    It does not claim a certified true-peak limiter or magical instrument repair.
    Applies no fake re-synthesis, stem addition or stereo widening.
    """
    import numpy as np
    from scipy.signal import butter, sosfilt
    from sonara_remix_pro_toolkit import transparent_master

    if genre not in GENRE_PROFILES or not 22050 <= sr <= 96000:
        raise V5ControlError("Unsupported mastering profile")
    if audio.ndim != 2 or audio.shape[1] != 2 or len(audio) < sr or not np.isfinite(audio).all():
        raise V5ControlError("Invalid stereo audio")
    # Protect against subsonic accumulation and overbearing bass energy.
    hp = butter(2, 24, "highpass", fs=sr, output="sos")
    filtered = sosfilt(hp, audio, axis=0).astype(np.float32)
    lp = butter(2, 145, "lowpass", fs=sr, output="sos")
    low = sosfilt(lp, filtered, axis=0).astype(np.float32)
    low_rms = float(np.sqrt(np.mean(np.square(low.astype(np.float64)))))
    full_rms = float(np.sqrt(np.mean(np.square(filtered.astype(np.float64)))))
    # Bass band compression is global and restrained, never a sharp pumping envelope.
    low_gain_db = -min(1.4, 7.0 * max(0.0, low_rms / max(full_rms, 1e-7) - .55))
    filtered += low * (10 ** (low_gain_db / 20) - 1.0)
    del low
    # Mild presence correction only when the master is dark, capped at +0.6 dB.
    high = sosfilt(butter(2, 4500, "highpass", fs=sr, output="sos"), filtered, axis=0)
    high_rms = float(np.sqrt(np.mean(np.square(high.astype(np.float64)))))
    if high_rms / max(full_rms, 1e-7) < 0.17:
        filtered += high.astype(np.float32) * (10 ** (.6 / 20) - 1.0)
    del high
    mastered, metrics = transparent_master(filtered, sr=sr, lufs=-14.0,
                                           peak_ceiling=-1.2)
    return mastered, {
        **metrics, "version": "sonara-v5-adaptive-master",
        "adaptiveBassControlDb": round(low_gain_db, 3),
        "subsonicHighPassHz": 24, "presenceCorrectionMaxDb": .6,
        "truePeakCertified": False,
    }


def continuity_report(audio_path, *, section_seconds=90):
    """Check acoustic discontinuities near long-form joins; advisory, not proof."""
    import numpy as np
    import soundfile as sf
    jumps = []
    with sf.SoundFile(str(audio_path)) as wav:
        duration = wav.frames / wav.samplerate
        if duration <= section_seconds:
            return {"measuredJoins": 0, "suspiciousJoins": 0, "maxRmsJumpDb": 0.0}
        for second in range(section_seconds, int(duration), section_seconds):
            center = second * wav.samplerate
            width = min(int(wav.samplerate * .18), center, wav.frames-center)
            if width <= 16:
                continue
            wav.seek(center-width)
            y = wav.read(width*2, dtype="float32", always_2d=True)
            if len(y) != width*2:
                continue
            left = np.sqrt(np.mean(y[:width].astype(np.float64)**2))
            right = np.sqrt(np.mean(y[width:].astype(np.float64)**2))
            jump = abs(20 * math.log10(max(left, 1e-8) / max(right, 1e-8)))
            jumps.append(float(jump))
    return {"measuredJoins": len(jumps), "suspiciousJoins": sum(v > 9 for v in jumps),
            "maxRmsJumpDb": round(max(jumps, default=0.0), 2)}


def technical_score(audit, *, continuity=None):
    """Rank valid masters by measured, conservative technical indicators only."""
    loud = audit.get("integratedLufs")
    if loud is None:
        return 0
    crest = float(audit.get("crestFactorDb") or 0)
    silence = float(audit.get("nearSilenceFrameRatio") or 0)
    peak = float(audit.get("approxTruePeakDbTp") or 0)
    score = 100.0
    score -= min(16.0, abs(float(loud) + 14.0) * 1.5)
    score -= min(24.0, max(0.0, 5.0 - crest) * 6.0)
    score -= min(26.0, silence * 70.0)
    score -= 12.0 if peak > -0.8 else 0.0
    if continuity:
        score -= 4.0 * min(3, int(continuity.get("suspiciousJoins") or 0))
    return round(max(0.0, min(100.0, score)), 1)


def render_candidates(*, guide, style, folder, base_prompt, params, b_drums,
                      engine, mode, bpm, key, lease_check):
    """Generate serial independent real ACE-Step covers; publish one accepted master.

    Caller owns the lease and private scratch directory. No fallback audio, no
    unverified publication, no cross-user caching and no extra queue jobs.
    """
    import numpy as np
    import soundfile as sf
    from sonara_remix_pro_quality import audit_wav, release_gate

    controls = v5_controls(params, int(params["durationSec"]))
    v6 = None
    dna = None
    if params.get("v6") is True:
        from sonara_remix_pro_v6 import v6_controls, musical_dna
        v6 = v6_controls(params)
    try:
        groove = drum_activity(b_drums)
    except (OSError, ValueError):
        groove = {"confidence": "low"}
    if v6 is not None:
        from sonara_remix_pro_v6 import musical_dna
        dna = musical_dna(params.get("sourceReportA"), params.get("sourceReportB"), groove)
    valid = []
    rejection_codes = []
    for index in range(controls["candidateCount"]):
        lease_check("ace_step")
        generated = Path(folder) / ("v5-candidate-%d.wav" % index)
        mastered_path = Path(folder) / ("v5-master-%d.wav" % index)
        prompt = build_v5_brief(base_prompt, controls, drum_measurement=groove,
                                candidate_index=index)
        if v6 is not None:
            from sonara_remix_pro_v6 import compose_direction
            prompt = (prompt + "\n" + compose_direction(v6, dna, index,
                      controls["candidateCount"]))[:9000]
        result = engine(
            guide, generated, prompt, mode=mode,
            strength=float(params.get("coverStrength") if params.get("coverStrength") is not None else .72),
            noise=float(params.get("coverNoise") if params.get("coverNoise") is not None else 0.0),
            bpm=bpm, key=key, reference_audio_path=style)
        if result.get("status") != "completed" or result.get("oneContinuousOutput") is not True or result.get("durationVerified") is not True:
            raise V5ControlError("ACE-Step did not finish verified V5 output")
        lease_check("mastering")
        sample, sr = sf.read(str(generated), dtype="float32", always_2d=True)
        if not 22050 <= sr <= 96000 or abs(len(sample)/sr-controls["durationSec"]) > .1:
            raise V5ControlError("V5 duration mismatch")
        if not np.isfinite(sample).all() or sample.shape[1] not in (1, 2):
            raise V5ControlError("V5 output contains invalid samples")
        if sample.shape[1] == 1:
            sample = np.repeat(sample, 2, axis=1)
        if v6 is None:
            mastered, _ = professional_master(sample, sr, genre=controls["genre"])
        else:
            from sonara_remix_pro_v6 import master_v6
            mastered, _ = master_v6(sample, sr, v6, genre=controls["genre"])
        del sample
        sf.write(str(mastered_path), mastered, sr, subtype="PCM_24")
        del mastered
        lease_check("quality_gate")
        verdict = release_gate(guide, generated, mastered_path,
                               expected_seconds=controls["durationSec"],
                               require_b_motif=True)
        if not verdict["acceptedTechnical"]:
            # Only fixed codes from our measured QA policy are retained.
            rejection_codes.extend(str(x) for x in verdict["failures"])
            continue
        report = audit_wav(mastered_path)
        if report["integratedLufs"] is None or report["approxTruePeakDbTp"] > -0.8:
            rejection_codes.append("mastering-safety")
            continue
        continuity = continuity_report(mastered_path)
        valid.append({
            "generated": generated, "master": mastered_path, "audit": report,
            "gate": verdict, "technicalScore": technical_score(report, continuity=continuity),
            "candidateIndex": index, "continuity": continuity
        })
    if not valid:
        raise V5QualityRejected(",".join(sorted(set(rejection_codes)))[:300])
    if v6 is not None:
        from sonara_remix_pro_v6 import creative_judge
        # Diversity uses only independently generated and QA-accepted audio;
        # it never claims semantic A/B fidelity or objectively superior art.
        for candidate in valid:
            others = [x["master"] for x in valid if x is not candidate]
            candidate["v6Judge"] = creative_judge(
                candidate["audit"], candidate["technicalScore"], dna,
                candidate["master"], others
            )
        winner = max(valid, key=lambda item: item["v6Judge"]["selectionScore"])
    else:
        # V5 continues to rank by measurable technical quality only.
        winner = max(valid, key=lambda item: item["technicalScore"])
    return {**winner, "candidatesGenerated": controls["candidateCount"],
            "candidatesAccepted": len(valid), "grooveMeasurement": groove,
            "artisticListeningRequired": True}
