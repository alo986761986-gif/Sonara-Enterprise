"""SONARA independent BPM diagnosis for existing A/B WAVs.
Read only: no API calls, generation, restarts, installs or secrets.
Run from Marimo with runpy.run_path(..., run_name='__main__').
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import wave
from pathlib import Path

# Optional: add exact WAV paths here only if automatic discovery misses them.
MANUAL_WAV_PATHS = [
    '/marimo/SONARA_BPM_TEST_REALE/TRACK_A.wav',
    '/marimo/SONARA_BPM_TEST_REALE/TRACK_B.wav',
]
LOOKBACK_HOURS = 12


def recent_wavs():
    roots = [
        Path('/tmp'), Path('/marimo/SONARA-ACE-Step-XL-TURBO'),
        Path('/marimo/ACE-STEP'), Path('/marimo/.sonara'),
        Path.home() / '.sonara',
    ]
    cutoff = time.time() - LOOKBACK_HOURS * 3600
    skip_names = {
        '.venv', 'venv', '.git', 'node_modules', '.cache',
        'site-packages', 'models', 'checkpoints', 'dataset', 'datasets',
        'training', 'weights', 'huggingface', 'pip', '__pycache__',
    }
    seen = set()
    results = []
    for path_text in MANUAL_WAV_PATHS:
        path = Path(path_text)
        if path.is_file() and path.suffix.lower() == '.wav':
            try:
                with wave.open(str(path), 'rb') as f:
                    duration = f.getnframes() / float(f.getframerate())
                results.append((path.stat().st_mtime, path, duration))
                seen.add(str(path.resolve()))
            except (OSError, wave.Error, ZeroDivisionError):
                pass
    for root in roots:
        if not root.is_dir():
            continue
        for directory, dirs, files in os.walk(root):
            relative = Path(directory).relative_to(root)
            if len(relative.parts) > 6:
                dirs[:] = []
                continue
            dirs[:] = [d for d in dirs if d not in skip_names and not d.startswith('.git')]
            for name in files:
                if not name.lower().endswith('.wav'):
                    continue
                path = Path(directory) / name
                try:
                    key = str(path.resolve())
                    if key in seen or path.is_symlink():
                        continue
                    seen.add(key)
                    stat = path.stat()
                    if stat.st_mtime < cutoff or stat.st_size < 128 * 1024:
                        continue
                    with wave.open(str(path), 'rb') as f:
                        duration = f.getnframes() / float(f.getframerate())
                    if 18 <= duration <= 65:
                        results.append((stat.st_mtime, path, duration))
                except (OSError, wave.Error, ZeroDivisionError):
                    continue
    results.sort(key=lambda row: row[0], reverse=True)
    return results[:6]


def analyze_one(path):
    import numpy as np
    import librosa
    from scipy.signal import find_peaks

    # Spectral onset strength is independent of SONARA's PCM RMS peak histogram.
    y, sr = librosa.load(str(path), sr=22050, mono=True, duration=45.0)
    if len(y) < sr * 8:
        return {'status': 'too-short'}
    hop = 256
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    onset = np.maximum(0, onset - np.median(onset))
    if float(np.sum(onset * onset)) <= 1e-9:
        return {'status': 'no-reliable-onsets'}

    # Local-periodicity detector, no target tempo in selection.
    max_lag = int(np.ceil(60.0 / 40 * sr / hop)) + 2
    ac = librosa.autocorrelate(onset, max_size=max_lag)
    bpm_grid = np.arange(40, 220.01, .5)
    lag = sr * 60 / (hop * bpm_grid)
    # Lag-normalized correlation avoids favoring short lags solely by sample count.
    periodic = np.interp(lag, np.arange(len(ac)), ac)
    periodic = periodic / np.maximum(1.0, len(onset) - lag)
    periodic = np.maximum(periodic, 0)
    best = float(periodic.max())
    peaks, _ = find_peaks(periodic, distance=8)
    top = sorted(peaks, key=lambda i: float(periodic[i]), reverse=True)[:7]
    if not top:
        top = [int(periodic.argmax())]

    # A second independent estimator: dynamic-programming beat tracking.
    track_tempo, beat_frames = librosa.beat.beat_track(
        onset_envelope=onset, sr=sr, hop_length=hop,
        start_bpm=120, trim=False
    )
    track_tempo = float(np.asarray(track_tempo).reshape(-1)[0])
    times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop)
    beat_intervals = np.diff(times)
    tracked_spacing = float(60.0 / np.median(beat_intervals)) if len(beat_intervals) >= 5 else None

    def strength(bpm):
        return round(float(np.interp(bpm, bpm_grid, periodic)) / max(1e-12, best), 3)

    return {
        'method': 'spectral-onset-tempo-vs-beat-track',
        'spectralCandidatesBpm': [float(bpm_grid[i]) for i in top],
        'beatTrackBpm': round(track_tempo, 1),
        'beatSpacingBpm': round(tracked_spacing, 1) if tracked_spacing is not None else None,
        'relativeStrengthAt70': strength(70),
        'relativeStrengthAt85': strength(85),
        'relativeStrengthAt170': strength(170),
        'status': 'diagnostic-only-no-auto-tempo-certification',
    }


def child_main(paths):
    for index, path in enumerate(paths[:2]):
        label = 'A' if index == 0 else 'B'
        print('TRACK_' + label + '_WAV=' + str(path), flush=True)
        try:
            data = analyze_one(path)
            for key, value in data.items():
                print('TRACK_' + label + '_' + key + '=' + json.dumps(value), flush=True)
        except Exception as exc:
            print('TRACK_' + label + '_ANALYSIS_ERROR=' + type(exc).__name__, flush=True)


def main():
    print('=== SONARA BPM - ANALISI INDIPENDENTE A/B ===', flush=True)
    # Prefer the exact A/B WAV files saved by the most recent live benchmark.
    # Their known identity is more reliable than a generic recent-files search.
    manual = [Path(value) for value in MANUAL_WAV_PATHS]
    if len(manual) == 2 and all(path.is_file() and not path.is_symlink() for path in manual):
        hits = []
        for path in manual:
            with wave.open(str(path), 'rb') as wav:
                duration = wav.getnframes() / float(wav.getframerate())
            hits.append((path.stat().st_mtime, path, duration))
        print('SORGENTE_WAV=percorso-esatto-A-B', flush=True)
    else:
        hits = recent_wavs()
        print('SORGENTE_WAV=ricerca-file-recenti', flush=True)
    print('WAV_RECENTI_TROVATI=' + str(len(hits)), flush=True)
    for index, (_, path, duration) in enumerate(hits[:6], 1):
        print('WAV_' + str(index) + '=' + str(path) + ' DURATION=' + str(round(duration, 1)), flush=True)
    if len(hits) < 2:
        print('RISULTATO=non sono stati trovati due WAV recenti da 30 secondi', flush=True)
        print('NESSUNA_MODIFICA_ESEGUITA=True', flush=True)
        return

    # Prefer the engine's venv where librosa/scipy are most likely available.
    options = [Path('/marimo/SONARA-ACE-Step-XL-TURBO/.venv/bin/python'), Path(sys.executable)]
    selected = None
    for python in options:
        if not python.is_file():
            continue
        try:
            p = subprocess.run([str(python), '-c', 'import librosa,numpy,scipy'],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                               timeout=35)
            if p.returncode == 0:
                selected = python
                break
        except (OSError, subprocess.TimeoutExpired):
            continue
    if selected is None:
        print('ANALIZZATORE=librosa/scipy non presenti negli ambienti verificati', flush=True)
        print('NESSUNA_INSTALLAZIONE_ESEGUITA=True', flush=True)
        return

    print('ANALIZZATORE=librosa + scipy (spettro e beat tracking)', flush=True)
    # No use of shell, no network and no side effects.
    process = subprocess.run([str(selected), str(Path(__file__).resolve()), '--child'] + [str(p) for _, p, _ in hits[:2]],
                             capture_output=True, text=True, timeout=160)
    print(process.stdout, end='', flush=True)
    if process.returncode != 0:
        print('ANALISI_TERMINATA_CON_ERRORE=' + str(process.returncode), flush=True)
        print('ULTIMO_ERRORE=' + (process.stderr.strip().splitlines()[-1] if process.stderr.strip() else 'unknown'), flush=True)
    print('ACE_STEP_NON_RIAVVIATO=True', flush=True)
    print('RELAY_NON_MODIFICATO=True', flush=True)


if __name__ == '__main__':
    if '--child' in sys.argv:
        child_main([Path(x) for x in sys.argv[sys.argv.index('--child') + 1:]])
    else:
        main()
