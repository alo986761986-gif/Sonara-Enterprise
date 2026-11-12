"""SONARA V7 Rhythm Lock: verify original-A kick tempo and a 4/4 beat grid.

No synthetic kick, drum substitution or audio publication. Measured confidence
is a kick-periodicity proxy, NOT proof of musical meter/downbeat transcription.
Manual tempo deviations beyond a conservative pitch-preserving retime window
are rejected before ACE-Step, rather than falsely labelling an unchanged kick.
"""
from __future__ import annotations

import math
from pathlib import Path

REVISION = "sonara-v7-rhythm-lock-v1"
METER = "4/4"
ALLOWED_PHRASE_BARS = (4, 8, 16)
ALLOWED_VOCAL_GRIDS = ("bar", "half-bar")
MAX_RETIME_RATIO = 1.12


def rhythm_controls(raw):
    if raw is None:
        raw = {}
    if not isinstance(raw, dict) or set(raw) - {
            "tempoMode", "meter", "phraseBars", "vocalGrid"}:
        raise ValueError("Unknown rhythm controls")
    result = {"tempoMode": "source-a", "meter": METER,
              "phraseBars": 8, "vocalGrid": "half-bar", **raw}
    if result["tempoMode"] not in ("source-a", "manual"):
        raise ValueError("Invalid tempo mode")
    if result["meter"] != METER:
        raise ValueError("House rhythm lock supports 4/4 only")
    if type(result["phraseBars"]) is not int or result["phraseBars"] not in ALLOWED_PHRASE_BARS:
        raise ValueError("Phrase bars must be 4, 8, or 16")
    if result["vocalGrid"] not in ALLOWED_VOCAL_GRIDS:
        raise ValueError("Invalid vocal entrance grid")
    return result


def _bpm(value):
    try:
        bpm = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return bpm if math.isfinite(bpm) and 55 <= bpm <= 200 else None


def _kick_envelope(path, seconds=32):
    """Read the loudest of three bounded original A-drums windows.

    Select a window with an audible 35-160 Hz pulse so that silent intros do
    not cause false estimates. No shared cross-user analysis or disk cache.
    """
    import numpy as np
    import soundfile as sf
    from scipy.signal import butter, sosfilt

    p = Path(path)
    if not p.is_file() or p.is_symlink():
        raise ValueError("Verified original A drum stem is required")
    with sf.SoundFile(str(p)) as audio:
        if audio.samplerate != 44100 or audio.channels not in (1, 2):
            raise ValueError("Original A drums must be 44.1 kHz mono/stereo")
        frames = audio.frames
        window = min(frames, round(44100 * seconds))
        if window < 44100 * 6:
            raise ValueError("Original A drums are too short")
        starts = sorted({
            0, max(0, (frames-window)//2), max(0, frames-window)
        })
        sos = butter(3, (35, 160), fs=44100,
                     btype="bandpass", output="sos")
        best = None
        for start in starts:
            audio.seek(start)
            block = audio.read(window, dtype="float32", always_2d=True)
            if len(block) != window or not np.isfinite(block).all():
                raise ValueError("Non-finite original A drum audio")
            low = sosfilt(sos, block.mean(axis=1)).astype(np.float32)
            energy = float(np.mean(low.astype(np.float64)**2))
            if best is None or energy > best[0]:
                best = (energy, start, low)
    _, source_frame, low = best
    hop = 441  # 10ms, low-band RMS
    count = len(low)//hop
    envelope = np.sqrt(np.mean(low[:count*hop].reshape(count,hop)
                         .astype(np.float64)**2,axis=1))
    return envelope, source_frame/44100, hop/44100


def measure_a_rhythm(drums_a, *, report_bpm=None, requested_bpm=None,
                     tempo_mode="source-a"):
    """Return a guarded original-A pulse estimate and any permitted retime.

    The source tempo and first-kick phase are real waveform measurements if
    confidence passes threshold. Manual BPM uses pitch-preserving time stretch
    of ONLY the authorized A drum loop, never the real A/B voices.
    """
    import numpy as np
    from scipy.signal import find_peaks
    if tempo_mode not in ("source-a", "manual"):
        raise ValueError("Unknown tempo mode")
    report = _bpm(report_bpm)
    requested = _bpm(requested_bpm)
    if tempo_mode == "manual" and requested is None:
        raise ValueError("Manual rhythm needs BPM A between 55 and 200")
    env, offset, hop = _kick_envelope(drums_a)
    high = float(np.quantile(env,.94))
    low = float(np.quantile(env,.32))
    prominence = max(.0003, .16*max(0., high-low))
    peaks, props = find_peaks(env,prominence=prominence,
                              distance=max(1,round(.23/hop)))
    if len(peaks) < 10:
        if tempo_mode == "manual":
            raise ValueError("Cannot verify source A pulse for safe manual retiming")
        if report is None:
            raise ValueError("Original A tempo uncertain: choose a rhythmic source A")
        return {"sourceBpm":report, "outputBpm":report, "kickPhaseSeconds":0.,
                "confidence":0., "measured":False,"retimeRatio":1.,
                "tempoMode":"source-a","meter":METER,
                "beatGridBasis":"analyzer-estimate-not-downbeat-verified"}
    strength=np.asarray(props["prominences"],dtype=np.float64)
    strength=np.clip(strength,0.,np.quantile(strength,.90))
    times=offset+peaks.astype(np.float64)*hop
    norm=float(np.sum(strength))
    if norm<=0:
        raise ValueError("Original A kick onset evidence unavailable")
    # Prior favours the analyzed tempo to avoid half/double-time ambiguity;
    # grid coherence supplies the waveform measurement for actual drift.
    prior=report if report is not None else requested
    candidates=np.arange(55.,200.001,.20,dtype=np.float64)
    if prior is not None:
        # True tempo may differ a little from librosa's estimate.
        # Keep octave relatives available for a false half/double BPM.
        around=[b for b in (prior,prior/2,prior*2) if 55<=b<=200]
        mask=np.zeros(len(candidates),dtype=bool)
        for pivot in around:
            mask |= np.abs(candidates-pivot)<=max(4.,.08*pivot)
        candidates=candidates[mask]
    if not len(candidates):
        raise ValueError("No valid tempo candidates")
    best=None
    for bpm in candidates:
        phase=times*(bpm/60.)*(2*np.pi)
        z=np.sum(strength*np.exp(1j*phase))/norm
        coherence=float(abs(z))
        # Only a small prior bonus; measured kick onsets dominate.
        preferred= .035 * (1-max(0.,min(1.,abs(math.log2(bpm/prior))))) if prior else 0.
        score=coherence+preferred
        if best is None or score>best[0]:
            best=(score,coherence,float(bpm),float(np.angle(z)))
    _, coherence, measured_bpm, angle=best
    reliable=coherence>=.48
    if not reliable:
        if tempo_mode == "manual":
            raise ValueError("Low-confidence source A pulse; manual BPM cannot be guaranteed")
        if report is None:
            raise ValueError("Source A beat pulse cannot be measured reliably")
        return {"sourceBpm":report, "outputBpm":report, "kickPhaseSeconds":0.,
                "confidence":round(coherence,3), "measured":False,
                "retimeRatio":1., "tempoMode":"source-a","meter":METER,
                "beatGridBasis":"analyzer-estimate-not-downbeat-verified"}

    source=round(measured_bpm,2)
    period=60/source
    phase_offset=round(((angle%(2*np.pi))/(2*np.pi))*period,5)
    target=source if tempo_mode=="source-a" else requested
    rate=round(float(target/source),6)
    if tempo_mode=="manual" and not (1/MAX_RETIME_RATIO <= rate <= MAX_RETIME_RATIO):
        raise ValueError("Manual BPM is too far from source A pulse for safe pitch-preserving retiming (max +/-12%)")
    return {"sourceBpm":source,"outputBpm":round(float(target),2),
            "kickPhaseSeconds":phase_offset,"confidence":round(coherence,3),
            "measured":True,"retimeRatio":rate,
            "tempoMode":tempo_mode,"meter":METER,
            "beatGridBasis":"measured-kick-periodicity-not-verified-downbeat"}


def retime_real_a_loop(loop, *, source_bpm, output_bpm, bars, rate=44100):
    """Retune original A drums by at most 12% without pitch shifting.

    The caller must pass exactly one 4/4 bar-aligned source loop. Librosa's
    phase vocoder preserves pitch; some transients may soften, so the same
    technical QC and listening checks remain mandatory.
    """
    import numpy as np
    source=_bpm(source_bpm)
    target=_bpm(output_bpm)
    if source is None or target is None or bars not in (2,4,8,16):
        raise ValueError("Invalid real A drum retiming parameters")
    if not isinstance(loop,np.ndarray) or loop.ndim!=2 or loop.shape[1]!=2:
        raise ValueError("Real stereo A drum loop required")
    ratio=target/source
    if not 1/MAX_RETIME_RATIO <= ratio <= MAX_RETIME_RATIO:
        raise ValueError("Unsafe real-drum tempo shift")
    if abs(ratio-1.)<.0003:
        return np.asarray(loop,dtype=np.float32).copy()
    import librosa
    stretched=librosa.effects.time_stretch(np.asarray(loop,dtype=np.float32).T,rate=ratio).T
    expected=round(bars*4*60/target*rate)
    if abs(len(stretched)-expected)>max(64,round(.03*rate)):
        raise ValueError("Retimed original A drums do not match the target bar length")
    if len(stretched)>expected:
        stretched=stretched[:expected]
    elif len(stretched)<expected:
        stretched=np.pad(stretched,((0,expected-len(stretched)),(0,0)),mode="edge")
    if not np.isfinite(stretched).all():
        raise ValueError("Retimed original A drums are invalid")
    return np.asarray(stretched,dtype=np.float32)
