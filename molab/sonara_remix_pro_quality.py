"""Instrument-agnostic measured quality audit for SONARA Remix Pro WAV exports.

No invented source similarity or pass score. Reports actual measurable phenomena
and flags requiring a human listening review. Does not modify the WAV.
"""
from __future__ import annotations
import argparse
import json
import math
from pathlib import Path

from sonara_remix_pro_toolkit import RemixProError, analyze_audio, source_file


def audit_wav(path):
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly
    import pyloudnorm as pyln

    file = source_file(path)
    with sf.SoundFile(str(file)) as wav:
        if wav.frames < wav.samplerate or wav.frames > wav.samplerate * 600:
            raise RemixProError("Quality audit supports 1-600 seconds")
        audio = wav.read(dtype="float32", always_2d=True)
        sr = wav.samplerate

    if not len(audio) or not np.isfinite(audio).all():
        raise RemixProError("WAV contains empty or invalid samples")
    peak = float(np.max(np.abs(audio)))
    rms = float(np.sqrt(np.mean(np.square(audio.astype(np.float64)))))
    clipped = float(np.mean(np.any(np.abs(audio) >= 0.9999, axis=1)))
    # Compute a 4x oversampled approximation in 1-second overlapping slices
    # to avoid >1 GB allocations for extended song exports.
    true_peak = peak
    window = 4 * sr
    for start in range(0,len(audio),window):
        chunk = audio[max(0,start-8):min(len(audio),start+window+8)]
        true_peak = max(true_peak,float(np.max(np.abs(resample_poly(chunk,4,1,axis=0)))))
    loudness = float(pyln.Meter(sr).integrated_loudness(audio))
    silence_ratio = float(np.mean(np.max(np.abs(audio),axis=1)<0.0007))
    crest = 20 * math.log10(max(peak,1e-12)/max(rms,1e-12))
    mono = np.mean(audio,axis=1)
    if len(audio[0])>1 and np.std(audio[:,0])>1e-9 and np.std(audio[:,1])>1e-9:
        stereo_correlation = float(np.corrcoef(audio[:,0],audio[:,1])[0,1])
    else:
        stereo_correlation = None
    return {
        "path":str(file),"durationSeconds":round(len(audio)/sr,2),
        "sampleRate":sr,"channels":int(audio.shape[1]),
        "integratedLufs":round(loudness,2) if math.isfinite(loudness) else None,
        "samplePeakDbFs":round(20*math.log10(max(peak,1e-12)),2),
        "approxTruePeakDbTp":round(20*math.log10(max(true_peak,1e-12)),2),
        "rmsDbFs":round(20*math.log10(max(rms,1e-12)),2),
        "crestFactorDb":round(crest,2),
        "clippedFrameRatio":round(clipped,7),
        "nearSilenceFrameRatio":round(silence_ratio,4),
        "stereoCorrelation":round(stereo_correlation,3) if stereo_correlation is not None and math.isfinite(stereo_correlation) else None,
        "peakMethod":"4x oversampled approximation; not a certified meter"
    }


def audit_remix(original, remix):
    original = source_file(original)
    remix = source_file(remix)
    # The original may be MP3: librosa measures the original for temporal/tonal
    # comparison; audio mixing QC is restricted to the actual exported WAV.
    original_music = analyze_audio(original)
    remix_music = analyze_audio(remix)
    output = audit_wav(remix)
    bpm_a = original_music.get("tempoBpm")
    bpm_b = remix_music.get("tempoBpm")
    if bpm_a is not None and bpm_b is not None:
        tempo_deviation = round(abs(float(bpm_a)-float(bpm_b)),2)
    else:
        tempo_deviation = None
    a_key = original_music.get("key")
    b_key = remix_music.get("key")
    issues = []
    if tempo_deviation is None:
        issues.append("tempo-alignment-not-verified")
    elif tempo_deviation>5:
        issues.append("measured-bpm-divergence-needs-musical-review")
    if a_key is None or b_key is None:
        issues.append("tonal-center-not-verified")
    elif a_key!=b_key:
        issues.append("estimated-key-change-needs-musical-review")
    if output["clippedFrameRatio"]>0.0001 or output["approxTruePeakDbTp"]>-0.3:
        issues.append("possible-clipping-or-true-peak-risk")
    if output["nearSilenceFrameRatio"]>0.15:
        issues.append("possible-unintended-silence")
    if output["integratedLufs"] is None:
        issues.append("loudness-unmeasurable")
    return {
        "version":"sonara-remix-pro-audio-audit-v1",
        "originalAnalysis":original_music,
        "remixAnalysis":remix_music,
        "remixAudio":output,
        "tempoDeviationBpm":tempo_deviation,
        "estimatedKeyMatch": a_key==b_key if a_key and b_key else None,
        "reviewFlags":issues,
        "humanListeningRequired":True,
        "importantLimit":"No verified melodic, harmonic, stem-separation or perceptual-quality score can be inferred from these measures."
    }



def release_gate(arranged, generated, master, *, expected_seconds, require_b_motif=False):
    """Conservative technical veto after model inference, before publishing.

    This detects silent/corrupt, highly compressed or spectrally collapsed
    exports, but does NOT certify artistic quality or semantic A/B identity.
    Its results are local-only; no customer waveform is logged.
    """
    import numpy as np
    import soundfile as sf
    from scipy.signal import resample_poly

    inputs = [source_file(p) for p in (arranged, generated, master)]
    reports = [audit_wav(p) for p in inputs]
    reasons = []
    for name, report in zip(("arranged", "generated", "master"), reports):
        if abs(report["durationSeconds"] - expected_seconds) > 0.12:
            reasons.append(name + "-duration-mismatch")
        if report["nearSilenceFrameRatio"] > 0.22:
            reasons.append(name + "-excessive-silence")
        if report["clippedFrameRatio"] > 0.0001:
            reasons.append(name + "-sample-clipping")
        if report["crestFactorDb"] < 3.0:
            reasons.append(name + "-overcompressed")
        if report["approxTruePeakDbTp"] > -0.7:
            reasons.append(name + "-true-peak-too-high")

    def band_energy(path):
        """Welch-like FFT energy bands from the opening 15 seconds.

        Conservative monitoring only: not a learned perceptual score.
        """
        with sf.SoundFile(str(path)) as f:
            sample = f.read(frames=min(f.frames, 15 * f.samplerate),
                            dtype="float32", always_2d=True)
            sr = f.samplerate
        if sample.shape[0] < sr:
            return None
        mono = np.mean(sample, axis=1)
        mono = resample_poly(mono, 1, max(1, sr // 11025)) if sr > 22050 else mono
        rate = sr / (max(1, sr // 11025)) if sr > 22050 else sr
        segment = min(8192, len(mono))
        f = np.fft.rfftfreq(segment, 1 / rate)
        bands = [(30, 180), (180, 1200), (1200, 7000)]
        accum = np.zeros(3, dtype=np.float64)
        frames = 0
        for pos in range(0, len(mono) - segment + 1, segment):
            spectrum = np.abs(np.fft.rfft(mono[pos:pos+segment] * np.hanning(segment)))**2
            for i, (low, high) in enumerate(bands):
                mask = (f >= low) & (f < high)
                accum[i] += float(np.sum(spectrum[mask]))
            frames += 1
        if not frames or float(np.max(accum)) <= 1e-12:
            return None
        return (accum / frames).tolist()

    before, after = band_energy(inputs[0]), band_energy(inputs[2])
    if before is None or after is None:
        reasons.append("missing-useful-spectral-data")
    else:
        # A whole band losing >24 dB is suspicious, even allowing creative EQ.
        for i, (ref, got) in enumerate(zip(before, after)):
            if ref > 1e-9 and got < ref * 0.00398:
                reasons.append("spectral-band-%d-collapsed" % i)
    # Provenance at the arranger level is not evidence that ACE-Step
    # preserved both references: human listening remains mandatory.
    return {
        "acceptedTechnical": not reasons,
        "failures": reasons,
        "master": reports[2],
        "perceptualFusionVerified": False,
        "humanListeningRequired": True,
        "bReferenceConditioningRequested": bool(require_b_motif),
        "bReferenceInfluenceVerified": False,
        "method": "post-cover-technical-veto-v2",
    }


def main(argv=None):
    p=argparse.ArgumentParser(description="Measure SONARA Remix Pro quality vs original; never claim a fake audio-quality score")
    p.add_argument("--original",required=True)
    p.add_argument("--remix",required=True)
    p.add_argument("--output")
    args=p.parse_args(argv)
    try:
        data=audit_remix(args.original,args.remix)
        if args.output:
            output=Path(args.output).expanduser().resolve()
            if output.exists():
                raise RemixProError("Refusing to overwrite an existing quality report")
            output.parent.mkdir(parents=True,exist_ok=True)
            output.write_text(json.dumps(data,indent=2))
        print(json.dumps(data,indent=2))
        return 0
    except (OSError,RemixProError,ValueError) as exc:
        print(json.dumps({"status":"failed","errorClass":type(exc).__name__}))
        return 2


if __name__=="__main__":
    raise SystemExit(main())
