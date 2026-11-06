"""Measure an independent rhythmic pulse from real PCM WAV audio.

No claimed BPM is inferred from the user's target: target BPM is used only
for comparison after detection. An octave-related pulse is marked ambiguous
rather than silently reported as the requested number.

This is a conservative rhythm-audit, not a guarantee of musicological meter.
"""
from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

_MIN_BPM = 40
_MAX_BPM = 220


def _rms(chunk: bytes, width: int) -> float:
    # Subsample ~1/8 of the interleaved PCM samples to limit CPU use.
    if width == 2:
        samples = memoryview(chunk).cast('h')[::8]
        if not samples:
            return 0.0
        return math.sqrt(sum(int(s) * int(s) for s in samples) / len(samples)) / 32768.0
    if width == 1:
        samples = memoryview(chunk)[::8]
        return math.sqrt(sum((int(s) - 128) ** 2 for s in samples) / len(samples)) / 128.0 if samples else 0.0
    step = 8 * width
    if width == 3:
        values = (int.from_bytes(chunk[i:i + 3], 'little', signed=True) for i in range(0, len(chunk) - 2, step))
        scale = 8388608.0
    elif width == 4:
        values = (struct.unpack_from('<i', chunk, i)[0] for i in range(0, len(chunk) - 3, step))
        scale = 2147483648.0
    else:
        raise ValueError('Unsupported PCM sample width')
    count = 0
    total = 0.0
    for value in values:
        total += value * value
        count += 1
    return math.sqrt(total / count) / scale if count else 0.0


def _onsets(path: Path, seconds=90.0):
    with wave.open(str(path), 'rb') as wav:
        rate = wav.getframerate()
        channels = wav.getnchannels()
        width = wav.getsampwidth()
        duration = wav.getnframes() / float(rate) if rate else 0.0
        if rate <= 0 or channels < 1 or width not in (1, 2, 3, 4) or duration < 8:
            return [], 0.0, duration
        hop = max(1, int(rate * 0.02))
        limit = min(int(seconds * rate), wav.getnframes())
        energy = []
        for _ in range(0, limit, hop):
            raw = wav.readframes(min(hop, limit - len(energy) * hop))
            if not raw:
                break
            energy.append(_rms(raw, width))
    if len(energy) < 300:
        return [], 0.0, duration
    changes = [max(0.0, energy[i] - energy[i - 1]) for i in range(1, len(energy))]
    avg = sum(changes) / len(changes)
    flux = [max(0.0, value - avg * 0.5) for value in changes]
    return flux, rate / hop, duration


def verify_wav_tempo(path, requested_bpm=None):
    """Return conservative reported BPM, never a target-biased measurement."""
    requested = None
    try:
        value = float(requested_bpm)
        if math.isfinite(value) and _MIN_BPM <= value <= _MAX_BPM:
            requested = round(value)
    except (ValueError, TypeError):
        pass
    base = {
        'requestedBpm': requested,
        'detectedBpm': None,
        'bpmConfidence': 0.0,
        'bpmError': None,
        'bpmVerified': False,
        'bpmStatus': 'unverified',
        'tempoOctaveAmbiguous': False,
        'method': 'pcm-rms-onset-autocorrelation-v1',
    }
    try:
        flux, rate, duration = _onsets(Path(path))
    except (OSError, ValueError, EOFError, wave.Error):
        return base
    base['analyzedSeconds'] = round(min(duration, 90), 1)
    if not flux or sum(x * x for x in flux) < 1e-9:
        return base

    # Independently pick rhythmic attacks, then vote on the spacing between
    # neighbouring attacks. The requested BPM NEVER influences these votes.
    max_flux = max(flux)
    threshold = max(max_flux * 0.085, sum(flux) / len(flux) * 2.5)
    peaks = []
    last_peak = -99
    for i in range(2, len(flux) - 2):
        value = flux[i]
        if value <= threshold or i - last_peak < max(3, int(0.095 * rate)):
            continue
        if value >= max(flux[i - 2:i + 3]):
            peaks.append((i, value))
            last_peak = i
    if len(peaks) < 8:
        return base

    # Weighted interval histogram. Adjacent attacks count most; longer
    # intervals are retained for a reliable 4-on-floor kick beneath hi-hats.
    events = []
    for i, (a_time, a_strength) in enumerate(peaks):
        for skip in range(1, 5):
            if i + skip >= len(peaks):
                break
            b_time, b_strength = peaks[i + skip]
            interval = (b_time - a_time) / rate
            if interval < 60 / _MAX_BPM or interval > 60 / _MIN_BPM:
                continue
            bpm = 60.0 / interval
            weight = math.sqrt(a_strength * b_strength) / (skip ** 1.20)
            events.append((bpm, weight))
    if len(events) < 8:
        return base

    scores = []
    for bpm_x2 in range(_MIN_BPM * 2, _MAX_BPM * 2 + 1):
        bpm = bpm_x2 / 2.0
        votes = 0.0
        for observed, weight in events:
            delta = (bpm - observed) / 2.6
            if abs(delta) <= 3.0:
                votes += weight * math.exp(-0.5 * delta * delta)
        scores.append((votes, bpm))
    scores.sort(key=lambda x: (x[0], x[1]), reverse=True)
    best_votes, best_bpm = scores[0]
    total = sum(w for _, w in events)
    base['bpmConfidence'] = round(min(1.0, best_votes / max(1e-10, total) * 4.0), 3)
    if best_votes < total * 0.055:
        return base

    # An octave rival cannot count as independent confirmation of the tempo.
    rivals = [
        (v, b) for v, b in scores
        if abs(b - best_bpm) > 4.0 and
        (abs(b - best_bpm * 2) <= 2.5 or abs(b * 2 - best_bpm) <= 2.5)
    ]
    octave = bool(rivals and max(v for v, _ in rivals) >= best_votes * 0.82)
    base['tempoOctaveAmbiguous'] = octave
    # Dequantize the 20ms onset grid by averaging many matching attack gaps.
    # This prevents 170 BPM from being misread as 166.7 because a single gap
    # happens to round to 0.36 s instead of the true 0.3529 s.
    intervals = [
        (peaks[i + 1][0] - peaks[i][0]) / rate
        for i in range(len(peaks) - 1)
        if abs(60 * rate / (peaks[i + 1][0] - peaks[i][0]) - best_bpm) <= best_bpm * 0.10
    ]
    if len(intervals) >= 8:
        refined = 60.0 * len(intervals) / sum(intervals)
        if abs(refined - best_bpm) <= best_bpm * 0.06:
            best_bpm = round(refined, 1)
    base['detectedBpm'] = best_bpm

    if requested is not None:
        difference = round(abs(best_bpm - requested), 1)
        base['bpmError'] = difference
        tolerance = max(2.0, requested * 0.015)

        # A detected 85 BPM pulse in a 170 BPM request may be the
        # half-time beat of a genuine 170 BPM performance. The strongest
        # peak alone cannot identify the musical beat level, even when
        # the double-time rival's score is below the 0.82 threshold.
        # Never force the detected value to 170, and never mark a
        # target-related octave candidate as independently verified.
        octave_near_requested = (
            abs(best_bpm * 2.0 - requested) <= tolerance
            or abs(best_bpm / 2.0 - requested) <= tolerance
        )
        octave = octave or octave_near_requested
        base['tempoOctaveAmbiguous'] = octave
        if octave:
            base['bpmStatus'] = 'octave-ambiguous'
        elif difference <= tolerance:
            base['bpmVerified'] = True
            base['bpmStatus'] = 'verified'
        else:
            base['bpmStatus'] = 'mismatch'
    else:
        base['bpmStatus'] = 'measured-ambiguous' if octave else 'measured'
    return base