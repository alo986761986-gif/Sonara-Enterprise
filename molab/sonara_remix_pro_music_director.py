"""SONARA V9 Music Director: local, measured arrangement of two authorized songs.

Six coordinated jobs:
  (1) source form/phrase evidence, (2) shared creative theme and harmonic
  direction, (3) bar-aligned section/groove changes, (4) distinct A/B voice
  dialogue, (5) vocal spectral pocket, (6) post-render musical proxies.
All features are explicitly opt-in on the authenticated GPU worker.
No lyrics transcription, no claims of reliable song-section recognition,
no other model calls, no external audio upload, no generated drums or vocals.
"""
from __future__ import annotations

import math

DIRECTOR_REVISION = "sonara-v9-measured-music-director-r1"
SECTION_ORDER = ("intro", "main_theme", "development", "break", "theme_return", "outro")


def _number(value, minimum, maximum):
    try:
        f = float(value)
    except (TypeError, ValueError, OverflowError) as exc:
        raise ValueError("Invalid musical measurement") from exc
    if not math.isfinite(f) or not minimum <= f <= maximum:
        raise ValueError("Out-of-range musical measurement")
    return f


def _envelope(path, *, seconds_per_window=.5):
    """Bounded streaming 0.5s intensity + spectral-change proxy, not transcription."""
    import numpy as np
    import soundfile as sf

    with sf.SoundFile(str(path)) as stream:
        if stream.channels not in (1, 2) or not 22050 <= stream.samplerate <= 96000:
            raise ValueError("Unsupported verified music source")
        if not 10 <= stream.frames / stream.samplerate <= 900.5:
            raise ValueError("Source duration outside authorized range")
        window = max(512, round(stream.samplerate * seconds_per_window))
        rms, changes = [], []
        previous = None
        while True:
            block = stream.read(window, dtype="float32", always_2d=True)
            if not len(block):
                break
            if not np.isfinite(block).all():
                raise ValueError("Non-finite source audio")
            mono = np.mean(block, axis=1, dtype=np.float64)
            rms.append(float(np.sqrt(np.mean(mono ** 2))))
            # Small FFT summary per window; no raw song audio escapes this function.
            subset = mono[:min(len(mono), 8192)]
            mag = np.abs(np.fft.rfft(subset * np.hanning(len(subset))))
            mag = mag / max(1e-9, float(np.sum(mag)))
            if previous is None:
                changes.append(0.)
            else:
                n = min(len(previous), len(mag))
                changes.append(float(np.sum(np.maximum(mag[:n] - previous[:n], 0.))))
            previous = mag
    if not rms or not max(rms) > .0002:
        raise ValueError("Insufficient measurable original musical activity")
    return np.asarray(rms, dtype=np.float64), np.asarray(changes, dtype=np.float64)


def _relative(values):
    import numpy as np
    v = np.asarray(values, dtype=np.float64)
    cap = max(1e-8, float(np.quantile(v, .9)))
    return np.clip(v / cap, 0., 1.5)


def _moments(energy, novelty, vocal, drum, *, window=.5):
    """Rank different recorded moments; prefer phrase novelty, not loudness alone."""
    import numpy as np
    n = min(map(len, (energy, novelty, vocal, drum)))
    e, u, v, d = [_relative(x[:n]) for x in (energy, novelty, vocal, drum)]
    # At 0.5s resolution, choose non-adjacent excerpts as alternatives.
    score = .36 * e + .29 * u + .24 * v + .11 * d
    ranked = np.argsort(-score, kind="stable")
    choices = []
    min_gap = max(8, round(8 / window))
    for pos in ranked:
        t = float(pos) * window
        if not all(abs(t - other) >= min_gap * window for other in choices):
            continue
        choices.append(t)
        if len(choices) == 5:
            break
    if not choices:
        raise ValueError("No usable original musical moments")
    quiet = np.argsort(e + .8 * v + .2 * (1 - d), kind="stable")
    intro = next((float(k) * window for k in quiet if d[k] >= .18), choices[0])
    return {"main": round(choices[0], 2),
            "alternative": round(choices[1] if len(choices) > 1 else choices[0], 2),
            "quiet": round(intro, 2), "candidateCount": len(choices),
            "measuredIntensity": round(float(np.median(e)), 3),
            "measuredSpectralChange": round(float(np.median(u)), 3)}


def analyse_sources(song_a, song_b, stems_a, stems_b, *, lease_check=None):
    """Analyze two real audio sources and their existing separated stems.

    Returns only coarse feature statistics and source excerpt offsets;
    there is no singer identification, exact chord transcription or lyrics.
    """
    import numpy as np
    results = {}
    for role, song, stems in (("a", song_a, stems_a), ("b", song_b, stems_b)):
        if lease_check:
            lease_check("director_source_analysis")
        if not isinstance(stems, dict) or set(("vocals", "drums")) - set(stems):
            raise ValueError("Original stem references are incomplete")
        e, n = _envelope(song)
        v, _ = _envelope(stems["vocals"])
        d, _ = _envelope(stems["drums"])
        length = min(len(e), len(v), len(d))
        moments = _moments(e[:length], n[:length], v[:length], d[:length])
        vocal_fraction = float(np.mean(_relative(v[:length]) >= .13))
        drum_fraction = float(np.mean(_relative(d[:length]) >= .13))
        if not np.isfinite(vocal_fraction + drum_fraction):
            raise ValueError("Invalid measured source features")
        results[role] = {
            "moments": moments, "vocalActivityRatio": round(vocal_fraction, 3),
            "drumActivityRatio": round(drum_fraction, 3),
            "durationMeasuredSeconds": round(length * .5, 2),
            "sectionRecognition": "energy-novelty-proxy-not-verse-chorus-transcription",
        }
    return results


def create_music_direction(song_form, source_evidence, report_a, report_b, *,
                           creative_mode="balanced"):
    """Create an explicit A-theme/B-response musical decision graph."""
    from sonara_remix_pro_songform import SONGFORM_REVISION
    if not isinstance(song_form, dict) or song_form.get("revision") != SONGFORM_REVISION:
        raise ValueError("Verified six-section form required")
    if [item.get("name") for item in song_form.get("sections", ())] != list(SECTION_ORDER):
        raise ValueError("Song form is incomplete")
    if creative_mode not in ("balanced", "experimental", "wild", "explosive"):
        raise ValueError("Unsupported director mode")
    if not isinstance(source_evidence, dict) or not all(
            isinstance(source_evidence.get(k), dict) for k in ("a", "b")):
        raise ValueError("Missing independent musical source evidence")
    a, b = (source_evidence[k]["moments"] for k in ("a", "b"))
    for item in (a, b):
        for field in ("main", "alternative", "quiet"):
            _number(item.get(field), 0, 900)
    # Explicit themes: A main motif must return unchanged as conditioning,
    # B's most distinctive musical gesture responds in development.
    references = {
        "intro": {"role": "a", "sourceSeconds": a["quiet"]},
        "main_theme": {"role": "a", "sourceSeconds": a["main"]},
        "development": {"role": "b", "sourceSeconds": b["main"]},
        "break": {"role": "b", "sourceSeconds": b["alternative"]},
        "theme_return": {"role": "a", "sourceSeconds": a["main"]},
        "outro": {"role": "a", "sourceSeconds": a["quiet"]},
    }
    if references["main_theme"] != references["theme_return"]:
        raise ValueError("A theme must return from the same original moment")
    def key(report):
        if not isinstance(report, dict):
            return None
        try:
            c = _number(report.get("keyConfidence"), 0, 1)
        except ValueError:
            return None
        note = report.get("key")
        return note if c >= .60 and isinstance(note, str) and 1 <= len(note) <= 20 else None
    key_a, key_b = key(report_a), key(report_b)
    tonal = ("agree-estimated" if key_a and key_b and key_a == key_b
             else "possibly-different-estimated" if key_a and key_b else "unknown")
    return {
        "revision": DIRECTOR_REVISION,
        "songFormRevision": song_form["revision"],
        "seconds": song_form["seconds"], "tempoBpm": song_form["tempoBpm"],
        "creativeMode": creative_mode,
        "references": references,
        "tonalRelationship": tonal,
        "motifAReprisedFromSameSource": True,
        "musicPlanIsMeasuredProxyNotTranscription": True,
        "sections": song_form["sections"],
    }


def musical_direction_prompt(plan):
    if not isinstance(plan, dict) or plan.get("revision") != DIRECTOR_REVISION:
        raise ValueError("V9 music director plan not authenticated")
    tonal = plan["tonalRelationship"]
    harmony = ("Use sparse compatible voicings and avoid conflicting thirds."
               if tonal != "agree-estimated" else
               "Sustain one consistent tonal centre; preserve vocal harmony.")
    return (
        "MUSIC DIRECTOR V9: Compose ONE genuinely new instrumental House work, "
        "NOT two mixed songs and NOT repeating thirty-second chunks. "
        "A's recognizable principal motif establishes MAIN THEME and returns "
        "after the BREAK with musical development, not a copy-pasted chorus. "
        "B's distinctive gesture inspires counterpoint and answering phrases "
        "in DEVELOPMENT. Keep ONE source-A kick pulse and progressively change "
        "bass movement, percussion texture, accents and instrumental register. "
        "INTRO teases the theme, MAIN THEME introduces it, DEVELOPMENT transforms "
        "the A/B ideas, BREAK provides breathing space, THEME RETURN recalls "
        "the motif with fresh accompaniment, OUTRO has a resolved ending. "
        "Leave ample space for the authentic A/B lead vocal recordings; "
        "do not synthesize singers, re-sing lyrics or stack two leads. "
        + harmony + " Natural instrument separation; controlled low-mid spectrum; "
        "clear drum/bass balance, transitions and real ending."
    )


def arrange_vocal_dialogue(profile_a, profile_b, song_form, tempo, *,
                           creative_mode="balanced"):
    """Stage original whole-phrase performances in theme-led sections.

    One voice at a time; no arbitrary A+B overlap, pitch correction, lyric
    synthesis or timestretch. Fades on phrase boundaries remain in renderer.
    """
    from sonara_remix_pro_v7 import _valid_tempo
    t = _valid_tempo(tempo)
    if creative_mode not in ("balanced", "experimental", "wild", "explosive"):
        raise ValueError("Invalid vocal arrangement mode")
    for profile in (profile_a, profile_b):
        if not isinstance(profile, dict) or not profile.get("audible") or not profile.get("regions"):
            raise ValueError("Both separated original voices require usable phrases")
    if not isinstance(song_form, dict) or [s.get("name") for s in song_form.get("sections", [])] != list(SECTION_ORDER):
        raise ValueError("Missing authentic song form")
    # Each role gets a distinct musical purpose, not ABAB repetition.
    role_map = {
        "intro": [], "main_theme": ["a"], "development": ["b"],
        "break": ["b", "a"], "theme_return": ["a", "b"],
        "outro": ["a"],
    }
    regions = {"a": profile_a["regions"], "b": profile_b["regions"]}
    indices, used, repeats = {"a": 0, "b": 0}, {"a": 0., "b": 0.}, {"a": False, "b": False}
    events = []
    min_voice = 1.65
    for section in song_form["sections"]:
        name = section["name"]
        begin, end = float(section["startSeconds"]), float(section["endSeconds"])
        if end <= begin:
            raise ValueError("Non-positive musical section")
        roles = role_map[name]
        if not roles:
            continue
        # Reserve silence between A and B and natural transition space.
        margin = min(.55, max(.16, (end - begin) * .07))
        cursor = begin + margin
        for offset, role in enumerate(roles):
            slots_left = len(roles) - offset
            available = end - cursor - margin - (slots_left - 1) * .22
            if available < min_voice:
                continue
            limit = min(available / slots_left, 4 * 4 * 60 / t)
            candidates = regions[role]
            best = None
            for probe in range(len(candidates)):
                n = (indices[role] + probe) % len(candidates)
                start, duration, rms = map(float, candidates[n])
                if not all(math.isfinite(q) for q in (start, duration, rms)):
                    continue
                if duration < min_voice:
                    continue
                # Prefer a full real phrase over truncating a word.
                fit = duration <= limit
                key = (fit, min(duration, limit), -probe)
                if best is None or key > best[0]:
                    best = (key, n, start, duration, rms)
            if best is None:
                continue
            _, position, source, phrase_length, rms = best
            length = min(limit, phrase_length)
            if length < min_voice:
                continue
            if indices[role] >= len(candidates):
                repeats[role] = True
            events.append({"role": role, "at": round(cursor, 5),
                           "source": source, "duration": round(length, 5),
                           "rms": rms})
            used[role] += length
            indices[role] += 1
            cursor += length + .22
    if not {"a", "b"}.issubset({e["role"] for e in events}):
        raise ValueError("Musical structure cannot fit both authentic voices")
    if any(left["at"] + left["duration"] > right["at"]
           for left, right in zip(events, events[1:])):
        raise ValueError("Overlapping lead vocals prohibited")
    return events, repeats, {
        "directorVersion": DIRECTOR_REVISION,
        "originalSourceVocalsOnly": True,
        "leadOverlapSeconds": 0.,
        "vocalPhrases": len(events), "voiceASeconds": round(used["a"], 2),
        "voiceBSeconds": round(used["b"], 2),
        "fixedChorusAlternation": False,
        "phrasesAreRealNotTranscribed": True,
    }


class SpectralPocket:
    """Continuous-state subtractive vocal pocket; no synthetic instruments."""
    def __init__(self, rate):
        from scipy.signal import butter
        import numpy as np
        if type(rate) is not int or rate < 22050 or rate > 96000:
            raise ValueError("Invalid professional mix rate")
        self.rate = rate
        self.sos = butter(2, (1400, 3400), btype="bandpass", fs=rate, output="sos")
        self.zi = np.zeros((len(self.sos), 2, 2), dtype=np.float64)

    def process(self, music, vocal_mask, *, depth=.31):
        import numpy as np
        from scipy.signal import sosfilt
        from scipy.ndimage import uniform_filter1d
        x = np.asarray(music, dtype=np.float32)
        mask = np.asarray(vocal_mask, dtype=np.float32)
        if x.ndim != 2 or x.shape[1] != 2 or mask.shape != (len(x),):
            raise ValueError("Invalid stereo vocal-pocket signal")
        if not np.isfinite(x).all() or not np.isfinite(mask).all():
            raise ValueError("Invalid music samples")
        _number(depth, 0, .45)
        band, self.zi = sosfilt(self.sos, x, axis=0, zi=self.zi)
        activity = uniform_filter1d(
            np.clip(mask, 0, 1), size=max(1, round(.07 * self.rate)))
        return (x - band.astype(np.float32) * (activity[:, None] * depth)).astype(np.float32)


def evaluate_arrangement(path, plan, vocal_report, *, lease_check=None):
    """Conservative, deterministic musical-form *proxies*, never an art critic.

    Measures section contrast, ending, main-theme return level and loudness.
    Does not claim to identify melody, copyright, verses or emotional quality.
    Hard reject only obvious silence or contract violations; rank the rest.
    """
    import numpy as np
    import soundfile as sf
    if not isinstance(plan, dict) or plan.get("revision") != DIRECTOR_REVISION:
        raise ValueError("Invalid V9 plan for final audio evaluation")
    if not isinstance(vocal_report, dict) or not (
            vocal_report.get("originalVoiceAUsed") is True and
            vocal_report.get("originalVoiceBUsed") is True and
            vocal_report.get("modelGeneratedLeadVocalsRetained") is False):
        raise ValueError("Both unmodified original lead vocal sources required")
    if not plan.get("motifAReprisedFromSameSource"):
        raise ValueError("A return motif contract not met")
    energy, names, totals = [], [], []
    with sf.SoundFile(str(path)) as song:
        if song.channels != 2 or not 22050 <= song.samplerate <= 96000:
            raise ValueError("Invalid candidate master")
        if abs(song.frames / song.samplerate - plan["seconds"]) > .10:
            raise ValueError("Director output duration mismatch")
        for s in plan["sections"]:
            if lease_check:
                lease_check("director_measurement")
            song.seek(round(s["startSeconds"] * song.samplerate))
            wanted = max(1, round((s["endSeconds"] - s["startSeconds"]) * song.samplerate))
            sum_sq, count, peak = 0., 0, 0.
            remaining = wanted
            while remaining:
                raw = song.read(min(65536, remaining), dtype="float32", always_2d=True)
                if len(raw) == 0:
                    break
                if not np.isfinite(raw).all():
                    raise ValueError("Invalid finished audio")
                sum_sq += float(np.sum(np.square(raw.astype(np.float64))))
                peak = max(peak, float(np.max(np.abs(raw))))
                count += raw.size
                remaining -= len(raw)
            if count < wanted * 2 - 2:
                raise ValueError("Truncated musical section")
            rms = math.sqrt(sum_sq / count)
            energy.append(rms)
            names.append(s["name"])
            totals.append(peak)
    if names != list(SECTION_ORDER) or min(energy) <= 1e-7 or max(totals) > 1.05:
        raise ValueError("Musical structure has invalid or near-silent section")
    levels = [20 * math.log10(max(x, 1e-9)) for x in energy]
    theme = levels[1]
    low = levels[3]
    reprise = levels[4]
    contrast = max(levels) - min(levels)
    # Score is evidence-based: never promise a human-quality arrangement.
    score = 66. + min(15., max(0., contrast - 1.5) * 2.0)
    score += min(9., max(0., theme - low) * 1.6)
    score += min(7., max(0., reprise - low) * 1.2)
    score -= min(7., abs(reprise - theme) * .8)
    score = float(np.clip(score, 0, 100))
    return {"revision": DIRECTOR_REVISION,
            "sectionRmsDb": dict(zip(names, (round(x, 2) for x in levels))),
            "measuredDynamicContrastDb": round(contrast, 2),
            "measuredThemeReturnDifferenceDb": round(reprise - theme, 2),
            "measuredProxyScore": round(score, 2),
            "musicalQualityListeningStillRequired": True,
            "verifiedOriginalVoiceSources": True,
            "notAProofOfMelodicOrSemanticOriginality": True}
