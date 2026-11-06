"""Read-only 4-track tempo diagnostics using NumPy; no extra generation.

Runs on original MoLab WAVs from SONARA_BPM_LM_COMPARISON.
Reports independent onset autocorrelation in 10-second windows, without
declaring musical tempo exact from a single autocorrelation peak.
"""
from __future__ import annotations

import sys
import wave
from pathlib import Path

TARGET = 170.0
BANDS = {"full": (40, 4500), "drums": (40, 380), "percussion": (380, 4500)}
BPM_GRID_STEP = 0.5


def read_audio(path):
    import numpy as np
    with wave.open(str(path), "rb") as wav:
        channels = wav.getnchannels()
        rate = wav.getframerate()
        width = wav.getsampwidth()
        frames = min(wav.getnframes(), 45 * rate)
        raw = wav.readframes(frames)
    if channels < 1 or channels > 8 or rate < 8000 or width not in (1, 2, 3, 4):
        raise ValueError("Unsupported PCM WAV format")
    if width == 1:
        values = (np.frombuffer(raw, dtype=np.uint8).astype(np.float32) - 128.0) / 128.0
    elif width == 2:
        values = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
    elif width == 3:
        buf = np.frombuffer(raw, dtype=np.uint8)
        buf = buf[:len(buf) // 3 * 3].reshape(-1, 3).astype(np.int32)
        codes = buf[:, 0] | (buf[:, 1] << 8) | (buf[:, 2] << 16)
        values = ((codes ^ 0x800000) - 0x800000).astype(np.float32) / 8388608.0
    else:
        values = np.frombuffer(raw, dtype="<i4").astype(np.float32) / 2147483648.0
    length = len(values) // channels
    if length == 0:
        raise ValueError("Empty PCM WAV")
    values = values[:length * channels].reshape(-1, channels).mean(axis=1)
    stride = max(1, round(rate / 12000))
    return values[::stride], rate / stride


def onset_bands(audio, sample_rate):
    import numpy as np
    size = 1024
    hop = 256
    if len(audio) < size + hop * 100:
        raise ValueError("Audio shorter than onset analysis window")
    frames = np.lib.stride_tricks.sliding_window_view(audio, size)[::hop]
    mag = np.log1p(np.abs(np.fft.rfft(frames * np.hanning(size), axis=1)))
    diff = np.maximum(0, np.diff(mag, axis=0))
    freq = np.fft.rfftfreq(size, 1 / sample_rate)
    results = {}
    for name, (lo, hi) in BANDS.items():
        band = (freq >= lo) & (freq <= hi)
        flux = diff[:, band].mean(axis=1)
        # Remove slow energy fluctuations without forcing a desired tempo.
        flux = np.maximum(0, flux - np.mean(flux) * 0.30)
        results[name] = flux
    return results, sample_rate / hop


def periodicity(envelope, frame_rate, target=TARGET):
    import numpy as np
    x = np.asarray(envelope, dtype=np.float64)
    if x.size < 150:
        return {"status": "too-short"}
    x = np.maximum(0, x) - float(np.mean(x))
    energy = float(np.dot(x, x))
    if energy < 1e-10:
        return {"status": "no-onsets"}
    maximum_lag = min(x.size - 2, int(60 / 40 * frame_rate) + 3)
    # Autocorrelation computed from the actual onsets, not the requested BPM.
    ac = np.array([float(np.dot(x[:-lag], x[lag:])) / (x.size - lag)
                   for lag in range(1, maximum_lag + 1)])
    bpm_grid = np.arange(40.0, 220.01, BPM_GRID_STEP)
    delays = 60.0 * frame_rate / bpm_grid
    response = np.interp(delays, np.arange(1, ac.size + 1), ac)
    response = np.maximum(0, response)
    best = float(response.max())
    if best < 1e-12:
        return {"status": "no-periodic-pulse"}
    index = list(np.argsort(response)[::-1])
    candidates = []
    for i in index:
        bpm = float(bpm_grid[i])
        if all(abs(bpm - old) > 5 for old in candidates):
            candidates.append(bpm)
        if len(candidates) >= 5:
            break
    strength = float(np.interp(target, bpm_grid, response) / best)
    def band_strength(bpm):
        return round(float(np.interp(bpm, bpm_grid, response) / best), 3)
    return {
        "status": "measured",
        "candidates": candidates,
        "strength170": round(strength, 3),
        "strength140": band_strength(140),
        "strength85": band_strength(85),
        "strength70": band_strength(70),
        "near170": any(abs(v - target) <= 5 for v in candidates[:3]),
    }


def inspect(path):
    import numpy as np
    audio, sr = read_audio(path)
    bands, frame_rate = onset_bands(audio, sr)
    details = {}
    for name, flux in bands.items():
        complete = periodicity(flux, frame_rate)
        windows = []
        span = max(1, round(10 * frame_rate))
        for start in range(0, len(flux), span):
            part = flux[start:start + span]
            if len(part) < round(8 * frame_rate):
                continue
            windows.append(periodicity(part, frame_rate))
        details[name] = {"full": complete, "windows": windows}
    return details


def files(directory):
    if directory:
        root = Path(directory)
    else:
        base = Path("/marimo/SONARA_BPM_LM_COMPARISON")
        folders = sorted([item for item in base.iterdir() if item.is_dir()], reverse=True) if base.is_dir() else []
        if not folders:
            raise FileNotFoundError("No SONARA LM comparison output folder")
        root = folders[0]
    modes = (
        ("LM_ON_A.wav", "LM_ON_B.wav", "LM_OFF_A.wav", "LM_OFF_B.wav"),
        ("PROMPT_BPM_A.wav", "PROMPT_BPM_B.wav", "METADATA_ONLY_A.wav", "METADATA_ONLY_B.wav"),
    )
    names = next((variant for variant in modes if all((root / name).is_file() for name in variant)), modes[0])
    return root, [(name, root / name) for name in names]


def main(directory=None):
    root, items = files(directory)
    print("SONARA_4_TRACK_PULSE_AUDIT=READ_ONLY")
    print("AUDIT_DIR=", root)
    print("REQUESTED_BPM=170")
    print("NO_AUDIO_CHANGES=True")
    for name, path in items:
        print("TRACK=", name)
        if not path.is_file():
            print("WAV_MISSING=True")
            continue
        result = inspect(path)
        for band, report in result.items():
            full = report["full"]
            print(band.upper() + "_BPM_CANDIDATES=", full.get("candidates"))
            print(band.upper() + "_170_STRENGTH=", full.get("strength170"))
            print(band.upper() + "_140_STRENGTH=", full.get("strength140"))
            print(band.upper() + "_WINDOW_TOP_BPM=", [
                (w.get("candidates") or [None])[0] for w in report["windows"]
            ])
            print(band.upper() + "_WINDOW_170_STRENGTH=", [
                w.get("strength170") for w in report["windows"]
            ])
    print("STATUS=diagnostic-only; no BPM is certified from this audit alone")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else None)
