"""Conservative tempo evidence for ranking *unverified* SONARA takes.

Never certifies BPM; only compares onset pulse energy around the requested
quarter-note tempo across three time windows using local PCM WAV and NumPy.
If NumPy/WAV unavailable, callers must retain their existing score order.
"""
from __future__ import annotations

import math
import wave
from pathlib import Path


def tempo_evidence(path, target_bpm):
    """Return normalized support for target pulse; never a BPM verification."""
    try:
        import numpy as np
    except ImportError:
        return {"available": False, "reason": "numpy-unavailable"}

    try:
        bpm = float(target_bpm)
        if not math.isfinite(bpm) or not 40 <= bpm <= 220:
            return {"available": False, "reason": "no-target"}
        with wave.open(str(Path(path)), "rb") as wav:
            channels = wav.getnchannels()
            sample_rate = wav.getframerate()
            width = wav.getsampwidth()
            if width != 2 or not 1 <= channels <= 2 or not 8000 <= sample_rate <= 192000:
                return {"available": False, "reason": "unsupported-pcm"}
            total_frames = min(wav.getnframes(), 45 * sample_rate)
            raw = wav.readframes(total_frames)
        audio = np.frombuffer(raw, dtype="<i2")
        count = audio.size // channels
        if count < sample_rate * 18:
            return {"available": False, "reason": "too-short"}
        audio = audio[:count * channels].reshape(-1, channels).mean(axis=1).astype(np.float32)
        stride = max(1, round(sample_rate / 12000))
        audio = audio[::stride]
        rate = sample_rate / stride

        size, hop = 1024, 256
        frames = np.lib.stride_tricks.sliding_window_view(audio, size)[::hop]
        spect = np.log1p(np.abs(np.fft.rfft(frames * np.hanning(size), axis=1)))
        frequencies = np.fft.rfftfreq(size, d=1 / rate)
        mask = (frequencies >= 40) & (frequencies <= 4500)
        flux = np.maximum(0, np.diff(spect[:, mask], axis=0)).mean(axis=1)
        flux = np.maximum(0, flux - np.mean(flux) * 0.3)
        frame_rate = rate / hop

        grid = np.arange(40.0, 220.01, 0.5)
        lags = 60.0 * frame_rate / grid
        span = int(round(10 * frame_rate))
        windows = []
        for start in range(0, len(flux), span):
            part = flux[start:start + span]
            if len(part) < 8 * frame_rate:
                continue
            x = part.astype(np.float64) - float(np.mean(part))
            if float(np.dot(x, x)) <= 1e-9:
                continue
            max_lag = min(int(np.ceil(np.max(lags))) + 1, len(x) - 1)
            correlation = np.array([
                np.dot(x[:-lag], x[lag:]) / (len(x) - lag)
                for lag in range(1, max_lag + 1)
            ])
            spectrum = np.maximum(0, np.interp(lags, np.arange(1, len(correlation) + 1), correlation))
            best = float(np.max(spectrum))
            if best <= 1e-12:
                continue
            # Normalized at 1 for the strongest local candidate (not a probability).
            strength = float(np.max(np.interp(
                np.arange(max(40.0, bpm - 3), min(220.0, bpm + 3) + 0.01, 0.5),
                grid, spectrum
            )) / best)
            windows.append(round(strength, 3))

        if len(windows) < 2:
            return {"available": False, "reason": "insufficient-windows"}

        # Window-minimum penalizes unstable beats rather than a single lucky phrase.
        # This is ranking evidence only: no verification flag is returned.
        return {
            "available": True,
            "method": "pcm-spectral-onset-windowed-autocorrelation",
            "targetBpm": round(bpm),
            "windowStrengths": windows,
            "support": round(float(np.mean(windows)) * 0.55 + float(np.min(windows)) * 0.45, 3),
            "verified": False,
        }
    except (OSError, ValueError, wave.Error, OverflowError, MemoryError):
        return {"available": False, "reason": "analysis-unavailable"}


def candidate_sort_key(candidate):
    """Prefer verified beats, then evidence, then independent audio quality."""
    tempo = candidate.get("tempo") or {}
    evidence = candidate.get("tempoEvidence") or {}
    verified = tempo.get("bpmVerified") is True and tempo.get("bpmStatus") == "verified"
    support = evidence.get("support") if evidence.get("available") is True else None
    if not isinstance(support, (int, float)) or not math.isfinite(support):
        support = -1.0
    return (verified, float(support), float(candidate.get("score") or 0))


def rank_candidates(candidates):
    """Sort a copy; original takes and audio are never modified."""
    return sorted(candidates, key=candidate_sort_key, reverse=True)
