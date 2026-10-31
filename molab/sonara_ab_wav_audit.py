"""Offline SONARA A/B PCM WAV health report.

Reads existing generated WAV files only. Does not generate, alter or upload audio.
This is an objective signal-integrity audit, NOT a subjective music-quality score.
"""
from __future__ import annotations
import argparse
import json
import math
import struct
import wave
from pathlib import Path


def _decode_pcm(data: bytes, width: int) -> float:
    if width == 1:
        return (data[0] - 128) / 128.0
    if width == 2:
        return struct.unpack("<h", data)[0] / 32768.0
    if width == 3:
        value = int.from_bytes(data, "little", signed=True)
        return value / 8388608.0
    if width == 4:
        return struct.unpack("<i", data)[0] / 2147483648.0
    raise ValueError("Only 8/16/24/32-bit integer PCM is supported")


def audit_wav(path: str | Path, sample_limit: int = 250_000) -> dict:
    path = Path(path)
    with wave.open(str(path), "rb") as audio:
        channels = audio.getnchannels()
        width = audio.getsampwidth()
        rate = audio.getframerate()
        frames = audio.getnframes()
        if channels not in (1, 2) or width not in (1, 2, 3, 4) or rate <= 0:
            raise ValueError("Expected mono/stereo integer PCM WAV")
        stride = max(1, frames // sample_limit)
        peaks = [0.0] * channels
        power = [0.0] * channels
        dc = [0.0] * channels
        clipped = [0] * channels
        silent = 0
        stereo_xy = stereo_x2 = stereo_y2 = 0.0
        count = 0
        block_frames = 16384
        frame_index = 0
        while True:
            data = audio.readframes(block_frames)
            if not data:
                break
            frame_size = channels * width
            available = len(data) // frame_size
            for i in range(available):
                if (frame_index + i) % stride:
                    continue
                values = [
                    _decode_pcm(data[(i * channels + ch) * width:(i * channels + ch + 1) * width], width)
                    for ch in range(channels)
                ]
                for ch, value in enumerate(values):
                    absolute = abs(value)
                    peaks[ch] = max(peaks[ch], absolute)
                    power[ch] += value * value
                    dc[ch] += value
                    if absolute >= 0.999:
                        clipped[ch] += 1
                if max(map(abs, values)) <= 0.001:
                    silent += 1
                if channels == 2:
                    stereo_xy += values[0] * values[1]
                    stereo_x2 += values[0] ** 2
                    stereo_y2 += values[1] ** 2
                count += 1
            frame_index += available
    if not count:
        raise ValueError("WAV contains no PCM frames")

    peak = max(peaks)
    return {
        "file": path.name,
        "sample_rate_hz": rate,
        "channels": channels,
        "bit_depth": width * 8,
        "duration_seconds": round(frames / rate, 3),
        "sampled_frames": count,
        "channel_peak_dbfs": [round(20 * math.log10(max(x, 1e-12)), 2) for x in peaks],
        "channel_rms_dbfs": [round(10 * math.log10(max(x / count, 1e-24)), 2) for x in power],
        "peak_dbfs": round(20 * math.log10(max(peak, 1e-12)), 2),
        "clipped_sample_ratio": round(sum(clipped) / (count * channels), 8),
        "silence_frame_ratio": round(silent / count, 6),
        "channel_dc_offset": [round(x / count, 6) for x in dc],
        "stereo_correlation": (
            round(stereo_xy / math.sqrt(stereo_x2 * stereo_y2), 4)
            if channels == 2 and stereo_x2 > 0 and stereo_y2 > 0 else None
        ),
        "warnings": (
            (["possible_digital_clipping"] if sum(clipped) / (count * channels) > 0.0005 else [])
            + (["extended_low_level_or_silence"] if silent / count > 0.28 else [])
            + (["large_dc_offset"] if max(abs(x / count) for x in dc) > 0.02 else [])
            + (["highly_anti_correlated_stereo"] if channels == 2 and stereo_x2 > 0 and stereo_y2 > 0
                and stereo_xy / math.sqrt(stereo_x2 * stereo_y2) < -0.8 else [])
        ),
    }


def audit_pair(path_a: str | Path, path_b: str | Path) -> dict:
    a, b = audit_wav(path_a), audit_wav(path_b)
    return {
        "standard": "SONARA_AB_SIGNAL_INTEGRITY_V1",
        "note": "Signal-integrity metrics cannot establish instrument realism, lyrics accuracy, or Suno/Udio parity.",
        "A": a,
        "B": b,
        "duration_delta_seconds": round(abs(a["duration_seconds"] - b["duration_seconds"]), 3),
        "rms_delta_db": round(abs(sum(a["channel_rms_dbfs"]) / a["channels"]
                               - sum(b["channel_rms_dbfs"]) / b["channels"]), 2),
        "review_required": bool(a["warnings"] or b["warnings"]),
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Audit two existing SONARA PCM WAV files, without modifying them.")
    parser.add_argument("wav_a")
    parser.add_argument("wav_b")
    args = parser.parse_args()
    print(json.dumps(audit_pair(args.wav_a, args.wav_b), indent=2))
