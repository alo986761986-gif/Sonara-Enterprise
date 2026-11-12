"""SONARA Remix Pro V8: explicit HOUSE song form, opt-in and source-safe.

A musical timeline, not a beat/downbeat or chord transcriber. The sections
define conditioning and stem dynamics; human listening is still required.
No generated hits, no copied customer mix, no GPU or network side effects.
"""
from __future__ import annotations

import math

SONGFORM_REVISION = "sonara-v8-songform-conditional-v1"
NAMES = ("intro", "main_theme", "development", "break", "theme_return", "outro")


def plan_song_form(seconds, bpm, *, rate=44100, b_influence=50):
    """Allocate intro/theme/development/break/reprise/outro on an A-tempo grid.

    Each section has one guide source. Reprise uses source A so the guide
    can recall the original theme rather than restarting an A-B-A collage
    every 30 seconds. Both original sources remain independently conditioned.
    A tempo is not proof of the first downbeat or musical section labels.
    """
    if type(seconds) is not int or seconds not in range(30, 481, 30):
        raise ValueError("Invalid SONARA output duration")
    try:
        tempo = float(bpm)
    except (ValueError, TypeError, OverflowError) as exc:
        raise ValueError("Verified A tempo is required") from exc
    if not math.isfinite(tempo) or not 55 <= tempo <= 200:
        raise ValueError("A tempo is out of range")
    if type(rate) is not int or not 8000 <= rate <= 96000:
        raise ValueError("Invalid sample rate")
    if type(b_influence) is not int or b_influence not in range(20, 81, 5):
        raise ValueError("Invalid source B influence")
    total_frames = seconds * rate
    bar_frames = round(4 * 60 * rate / tempo)
    available_bars = total_frames // bar_frames
    if available_bars < 6:
        raise ValueError("Not enough A-tempo bars for an articulated remix")
    influence = (b_influence - 20) / 60
    weights = (.08, .23, .20 + .07 * influence,
               .11 + .07 * influence, .28 - .14 * influence, .10)
    extras = available_bars - len(NAMES)
    fractions = [extras * value for value in weights]
    bars = [1 + math.floor(value) for value in fractions]
    remaining = available_bars - sum(bars)
    for index in sorted(range(len(NAMES)),
                        key=lambda i: (fractions[i] % 1, -i), reverse=True)[:remaining]:
        bars[index] += 1
    frames = [count * bar_frames for count in bars]
    frames[-1] += total_frames - sum(frames)
    roles = ("a", "a", "b", "b", "a", "a")
    sections = []
    at = 0
    for name, role, nframes in zip(NAMES, roles, frames):
        if nframes <= 0:
            raise ValueError("Invalid song form section")
        sections.append({
            "name": name, "role": role, "startFrame": at,
            "endFrame": at + nframes, "frames": nframes,
            "startSeconds": round(at / rate, 4),
            "endSeconds": round((at + nframes) / rate, 4),
        })
        at += nframes
    if at != total_frames:
        raise ValueError("Song form frame mismatch")
    b_seconds = sum(s["frames"] for s in sections if s["role"] == "b") / rate
    if b_seconds < 8.0:
        raise ValueError("Too little real source B conditioning")
    return {
        "revision": SONGFORM_REVISION,
        "seconds": seconds, "tempoBpm": round(tempo, 3),
        "barSeconds": bar_frames / rate, "rate": rate,
        "sections": sections, "sourceBSeconds": round(b_seconds, 3),
        "estimatedBeatGridNotVerifiedDownbeat": True,
    }


def section_gains(start_frame, frames, rate, form, mode="balanced"):
    """Smooth real-waveform gain only, with no second drum or fabricated theme.

    Section contrast creates musical room for the recurring guide theme.
    In explosive mode the A kick stays continuously audible until the tail.
    Applying equal absolute frame positions gives seamless chunk boundaries.
    """
    import numpy as np

    if mode not in ("balanced", "experimental", "wild", "explosive"):
        raise ValueError("Invalid song form mode")
    if not isinstance(form, dict) or form.get("revision") != SONGFORM_REVISION:
        raise ValueError("Invalid authenticated song form")
    if type(start_frame) is not int or start_frame < 0 or type(frames) is not int or frames < 0:
        raise ValueError("Invalid frame window")
    if rate != form.get("rate") or start_frame + frames > form["seconds"] * rate:
        raise ValueError("Song form frame rate or duration mismatch")

    profile = {
        "intro":       (.70, .18, .34),
        "main_theme":  (.99, .89, .83),
        "development": (.98, .87, .92),
        "break":       (.74, .34, .52),
        "theme_return": (1., 1., 1.),
        "outro":       (.78, .37, .34),
    }
    if mode == "experimental":
        profile.update({"development": (.96, .73, 1.),
                        "break": (.64, .23, .61)})
    elif mode == "wild":
        profile.update({"development": (1., .78, 1.),
                        "break": (.69, .26, .42),
                        "theme_return": (1., 1., 1.05)})
    elif mode == "explosive":
        profile = {
            "intro": (.98, .82, .82), "main_theme": (1., .96, .92),
            "development": (1., .95, .99), "break": (.98, .90, .91),
            "theme_return": (1., 1., 1.), "outro": (.98, .86, .82),
        }

    time = (start_frame + np.arange(frames, dtype=np.float64)) / rate
    first = profile[NAMES[0]]
    curves = [np.full(frames, value, dtype=np.float64) for value in first]
    fade = min(.65, max(.22, form["barSeconds"] * .25))
    previous = first
    for section in form["sections"][1:]:
        next_level = profile[section["name"]]
        boundary = section["startFrame"] / rate
        s = np.clip((time - boundary) / fade + .5, 0., 1.)
        smooth = s * s * (3. - 2. * s)
        for i in range(3):
            curves[i] += (next_level[i] - previous[i]) * smooth
        previous = next_level
    # Short click-free beginning and a genuinely tapered ending.
    fade_in = np.clip(time / .15, 0., 1.)
    tail = .15 if mode == "explosive" else min(2.2, form["barSeconds"])
    fade_out = np.clip((form["seconds"] - time) / tail, 0., 1.)
    curves = tuple(
        np.asarray(np.clip(curve * fade_in * fade_out, 0., 1.08), dtype=np.float32)
        for curve in curves
    )
    return curves
