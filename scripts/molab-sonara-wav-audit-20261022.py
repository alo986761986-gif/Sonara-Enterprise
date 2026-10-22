#!/usr/bin/env python3
"""Inspect generated SONARA WAV within the MoLab notebook, without network access.

Reports duration, channels, PCM depth, sample rate, RMS/peak level, clipping and
silence detection. It does not modify the WAV or start any public service.
"""
from __future__ import annotations

from array import array
import math
from pathlib import Path
import sys
import wave

DEFAULT_PATH = Path("/marimo/SONARA_MOLAB_TEST_XL_TURBO.wav")


def _pcm_values(raw: bytes, sample_width: int):
    if sample_width == 1:
        for byte in raw:
            yield (byte - 128) / 128.0
    elif sample_width in (2, 4):
        typecode = "h" if sample_width == 2 else "i"
        scale = float(1 << (8 * sample_width - 1))
        vals = array(typecode)
        vals.frombytes(raw)
        if sys.byteorder != "little":
            vals.byteswap()
        for value in vals:
            yield value / scale
    elif sample_width == 3:
        for i in range(0, len(raw) - len(raw) % 3, 3):
            value = int.from_bytes(raw[i:i+3], "little", signed=True)
            yield value / 8388608.0
    else:
        raise ValueError(f"Unsupported PCM sample width: {sample_width} bytes")


def inspect(path=DEFAULT_PATH):
    path = Path(path)
    if not path.is_file():
        raise FileNotFoundError(f"WAV not found: {path}")
    total = 0
    sum_squared = 0.0
    sum_signed = 0.0
    peak = 0.0
    clipped = 0
    with wave.open(str(path), "rb") as w:
        channels = w.getnchannels()
        rate = w.getframerate()
        frame_count = w.getnframes()
        width = w.getsampwidth()
        encoding = w.getcomptype()
        if encoding != "NONE":
            raise ValueError("Expected uncompressed PCM WAV")
        if channels <= 0 or rate <= 0 or frame_count <= 0:
            raise ValueError("Missing or invalid WAV audio parameters")
        duration = frame_count / rate
        while True:
            raw = w.readframes(32768)
            if not raw:
                break
            for v in _pcm_values(raw, width):
                total += 1
                sum_squared += v * v
                sum_signed += v
                magnitude = abs(v)
                if magnitude > peak:
                    peak = magnitude
                if magnitude >= 0.9999:
                    clipped += 1
    if not total:
        raise ValueError("WAV contains no audio samples")

    rms = math.sqrt(sum_squared / total)
    rms_dbfs = 20 * math.log10(max(rms, 1e-12))
    peak_dbfs = 20 * math.log10(max(peak, 1e-12))
    dc_offset = sum_signed / total
    clip_percent = 100.0 * clipped / total
    warnings = []
    if not (8 <= duration <= 12):
        warnings.append("Duration differs from the requested 10-second smoke test")
    if channels not in (1, 2):
        warnings.append("Unexpected channel count for music audio")
    if rms_dbfs < -50:
        warnings.append("The output is almost silent; inspect playback")
    if clip_percent > 0.1:
        warnings.append("Frequent near-full-scale samples; check audible clipping")
    if abs(dc_offset) > 0.05:
        warnings.append("High DC offset; inspect audio waveform")

    print("SONARA MoLab WAV AUDIO AUDIT")
    print("FILE:", path)
    print("FILE_BYTES:", path.stat().st_size)
    print("DURATION_SECONDS:", round(duration, 3))
    print("SAMPLE_RATE_HZ:", rate)
    print("CHANNELS:", channels)
    print("PCM_BIT_DEPTH:", width * 8)
    print("RMS_DBFS:", round(rms_dbfs, 2))
    print("PEAK_DBFS:", round(peak_dbfs, 2))
    print("CLIPPED_PERCENT:", round(clip_percent, 5))
    print("DC_OFFSET:", round(dc_offset, 6))
    print("VALID_AUDIO:", "YES" if not warnings else "WARNING")
    for warning in warnings:
        print("WARNING:", warning)
    print("Listening is still required to judge vocals, genre, artifacts and musical quality.")
    return {
        "duration_seconds": duration,
        "sample_rate": rate,
        "channels": channels,
        "bit_depth": width * 8,
        "rms_dbfs": rms_dbfs,
        "peak_dbfs": peak_dbfs,
        "clipped_percent": clip_percent,
        "warnings": warnings,
    }


if __name__ == "__main__":
    inspect(Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH)
