"""SONARA V7 measured, conservative improvements on top of V6.

This package contains no model loading, GPU changes, new job claims, pitch
shifting, fabricated drum hits, synthetic vocals or quality-gate bypass.
It is activated ONLY by a per-job v7Studio flag from an authenticated gateway.
"""
from __future__ import annotations

import math

V7_REVISION = "sonara-v7-deep-fusion-safe-v1"
V7_MODE_AUDIO_REVISION = "sonara-v7-creative-voice-motion-r1"


def _valid_tempo(tempo):
    try:
        t = float(tempo)
    except (TypeError, ValueError) as exc:
        raise ValueError("Missing verified A tempo") from exc
    if not math.isfinite(t) or not 55 <= t <= 200:
        raise ValueError("A tempo outside authorized House range")
    return t


def harmonic_guidance(report_a, report_b):
    """Guarded key guidance only; never claims verified chord or note matching."""
    def inspect(report):
        if not isinstance(report, dict):
            return None
        key = report.get("key")
        confidence = report.get("keyConfidence")
        try:
            confidence = float(confidence)
        except (TypeError, ValueError):
            return None
        if not math.isfinite(confidence) or confidence < .55:
            return None
        if not isinstance(key, str) or not 1 <= len(key) <= 24:
            return None
        if any(not (c.isalnum() or c in " #bm-/") for c in key):
            return None
        return key
    key_a, key_b = inspect(report_a), inspect(report_b)
    if key_a and key_b and key_a.lower() == key_b.lower():
        return {
            "mode": "compatible-estimated-tonal-centers", "keyA": key_a,
            "prompt": "Both source key estimates agree. Keep one coherent harmonic centre around source A without changing either original vocal recording."}
    if key_a and key_b:
        return {
            "mode": "different-estimated-tonal-centers", "keyA": key_a,
            "prompt": "The source key estimates disagree: favour sparse sustained pads and a supportive A-centred bass, avoid clashing thirds and dominant chord substitutions. Never pitch-shift or resing either voice."}
    return {
        "mode": "key-uncertain", "keyA": key_a,
        "prompt": "Source key estimates are insufficiently reliable. Use sparse non-conflicting harmony and avoid strong asserted chord changes; do not infer or force a key."}


def arrange_vocal_phrases(profile_a, profile_b, seconds, tempo, *, grid_mode='half-bar', phrase_bars=8, creative_mode='balanced'):
    """Real-phrase voice scheduling on the A half-bar grid.

    Select an unused region whenever available, prioritize balanced voice
    coverage and longer intact phrases, avoid a fixed ABAB/30-second chorus
    alternation. Does not claim to understand words or lyrics.
    """
    t = _valid_tempo(tempo)
    if type(seconds) is not int or seconds < 30 or seconds > 480:
        raise ValueError("Unsupported duration")
    if grid_mode not in ("bar", "half-bar") or phrase_bars not in (4, 8, 16):
        raise ValueError("Unsupported 4/4 phrase alignment")
    if creative_mode not in ("balanced", "experimental", "wild", "explosive"):
        raise ValueError("Invalid original-voice arrangement mode")
    profiles = {"a": profile_a, "b": profile_b}
    for role in ("a", "b"):
        item = profiles[role]
        if not isinstance(item, dict) or not item.get("audible") or not item.get("regions"):
            raise ValueError("Both authentic sources need usable vocal regions")
    bar = 4 * 60 / t
    half_bar = (4 if grid_mode == 'bar' else 2) * 60 / t
    intro = min(seconds * .11, 2 * bar)
    outro = min(seconds * .10, 2 * bar)
    end = seconds - outro
    cursor = math.ceil(intro / half_bar) * half_bar
    indices = {"a": 0, "b": 0}
    # Real regions only. Deterministic different phrase paths per mode;
    # no AI-generated singing or repeated 30-second vocal hooks.
    orders = {}
    for role in ("a", "b"):
        total = len(profiles[role]["regions"])
        if creative_mode == "balanced":
            order = list(range(total))
        elif creative_mode == "experimental":
            order = list(range(0, total, 2)) + list(range(1, total, 2))
        elif creative_mode == "wild":
            order = list(range(total - 1, -1, -1))
        else:  # Explosive: evolve from earlier source phrases, no abrupt reset.
            order = list(range(total))
        orders[role] = order
    used = {"a": 0., "b": 0.}
    repeats = {"a": False, "b": False}
    events = []
    last_role = None
    section = 0
    while cursor + 1.6 < end:
        if section >= 120:
            break
        available = end - cursor
        options = []
        for role in ("a", "b"):
            regions = profiles[role]["regions"]
            original_index = orders[role][indices[role] % len(regions)]
            source, duration, rms = regions[original_index]
            if not all(math.isfinite(float(z)) for z in (source, duration, rms)):
                raise ValueError("Non-finite vocal boundary metadata")
            remaining = max(0., min(float(duration), 4 * bar, available))
            if remaining < 1.65:
                continue
            shortage = used[role] / max(1., used["a"] + used["b"])
            novelty = 3 if indices[role] < len(regions) else -2
            mode_prefs = {
                "balanced": (4.0, .7, 3.0),
                "experimental": (2.8, 1.7, 2.2),
                "wild": (1.6, 2.4, 1.2),
                "explosive": (3.2, .3, 3.6),
            }
            balance_weight, switch_weight, duration_weight = mode_prefs[creative_mode]
            switch = switch_weight if role != last_role else -switch_weight
            # Fresh authentic phrases, but mode changes actual choice and length.
            score = balance_weight * (1 - shortage) + novelty + switch + min(duration_weight, remaining / 4)
            options.append((score, role, source, remaining, rms))
        if not options:
            break
        _, role, source, duration, rms = max(options, key=lambda o: (o[0], o[1]))
        max_bars = {"balanced":4, "experimental":3, "wild":2, "explosive":4}[creative_mode]
        duration = min(duration, max_bars * bar)
        if indices[role] >= len(profiles[role]["regions"]):
            repeats[role] = True
        indices[role] += 1
        events.append({
            "role": role, "at": round(cursor, 5),
            "source": float(source), "duration": float(duration),
            "rms": float(rms),
        })
        used[role] += duration
        last_role = role
        breathing = {"balanced":.25, "experimental":.75,
                     "wild":.50, "explosive":.08}[creative_mode] * 60 / t
        cursor = math.ceil((cursor + duration + breathing) / half_bar) * half_bar
        section += 1
    if len(events) < 2 or {e["role"] for e in events} != {"a", "b"}:
        raise ValueError("Cannot arrange both original voices into the requested duration")
    return events, repeats, {
        "introSeconds": round(intro, 2), "outroSeconds": round(outro, 2),
        "vocalPhrases": len(events), "musicalGrid": "half-bar-A",
        "fixedChorusAlternation": False,
        "v7PhrasePlanner": "mode-distinct-authentic-phrases-v2",
        "creativeMode": creative_mode,
        "vocalGrid": grid_mode,
        "phraseBars": phrase_bars,
        "voiceASeconds": round(used["a"], 2),
        "voiceBSeconds": round(used["b"], 2),
    }


def authentic_a_groove_gain(start_frame, frames, rate, tempo):
    """Small per-bar expression applied ONLY to authentic A drum waveform.

    Generates no percussion, no extra clock, no phase modification and no
    timing shifts. Continuous gain never falls below 0.975.
    """
    import numpy as np
    t = _valid_tempo(tempo)
    if type(start_frame) is not int or start_frame < 0 or frames < 0:
        raise ValueError("Invalid audio chunk")
    indices = start_frame + np.arange(frames, dtype=np.int64)
    beat = np.floor(indices / (rate * 60 / t)).astype(np.int64)
    bar = beat // 4
    # Subtle eight-bar performance dynamics, in step with A rather than B.
    pattern = np.array([1.0, .993, 1.006, .995, 1.003, .992, 1.009, .996],dtype=np.float32)
    return pattern[np.mod(bar, 8)]


def measured_candidate_priority(technical_score, voice_report, continuity=None):
    """Rank existing, technically accepted candidates; not an artistic score."""
    if not isinstance(voice_report, dict):
        raise ValueError("Missing verified original-voice evidence")
    if not (voice_report.get("originalVoiceAUsed") is True
            and voice_report.get("originalVoiceBUsed") is True
            and voice_report.get("modelGeneratedLeadVocalsRetained") is False):
        raise ValueError("Missing original source voice verification")
    score = float(technical_score)
    if not math.isfinite(score) or not 0 <= score <= 100:
        raise ValueError("Invalid measured candidate score")
    joins = 0
    if isinstance(continuity, dict):
        try:
            joins = min(8, max(0, int(continuity.get("suspiciousJoins", 0))))
        except (ValueError, TypeError):
            joins = 0
    repeats = voice_report.get("originalPhrasesRepeatedToFill")
    repeat_cost = (int(bool(repeats.get("a"))) + int(bool(repeats.get("b")))) if isinstance(repeats, dict) else 0
    return max(0., round(score - 1.5 * joins - 1.25 * repeat_cost, 2))


def mastering_safety_snapshot(audit):
    """Only report measurable master characteristics after the real V6 DSP."""
    if not isinstance(audit, dict):
        raise ValueError("Missing audio measurements")
    loudness = audit.get("integratedLufs")
    peak = audit.get("approxTruePeakDbTp")
    crest = audit.get("crestFactorDb")
    if not all(isinstance(v, (float, int)) and math.isfinite(v)
               for v in (loudness, peak, crest)):
        raise ValueError("Audio measurement unavailable")
    return {
        "measuredLufs": round(float(loudness), 2),
        "measuredTruePeakDbTp": round(float(peak), 2),
        "measuredCrestDb": round(float(crest), 2),
        "qualityGateBypassed": False,
    }


def creative_accompaniment_gain(start_frame, frames, rate, tempo, mode):
    """Per-mode smooth dynamics of GENERATED instrumental accompaniment only.

    Does not touch the sole A kick or alter time/BPM; never adds instruments,
    generated vocals, or modifies authentic source vocal recordings. These
    differences are deliberately measurable on the same input material.
    """
    import numpy as np
    t=_valid_tempo(tempo)
    if mode not in ("balanced", "experimental", "wild", "explosive"):
        raise ValueError("Invalid creative mode")
    if not isinstance(start_frame, int) or start_frame<0 or frames<0 or rate<22050:
        raise ValueError("Invalid frame boundaries")
    seconds=(start_frame+np.arange(frames,dtype=np.float64))/rate
    bars=seconds*t/(60*4)
    # Smooth 8- and 16-bar movements; no hard block boundaries, cuts or
    # stop-time effects. The actual A kick is deliberately left untouched.
    wave8=np.sin(2*np.pi*bars/8.)
    wave16=np.sin(2*np.pi*bars/16.)
    if mode=="balanced":
        bass=.91+.045*wave16
        other=.91+.055*wave16
    elif mode=="experimental":
        bass=.83+.10*wave8
        other=.78+.15*wave16
    elif mode=="wild":
        bass=.77+.16*wave8
        other=.72+.20*wave16
    else:
        bass=.97+.022*wave16
        other=.97+.025*wave8
    return (np.asarray(bass,dtype=np.float32),
            np.asarray(other,dtype=np.float32))
