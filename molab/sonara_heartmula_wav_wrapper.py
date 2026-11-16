#!/usr/bin/env python3
"""Run official HeartMuLa generation with a SONARA 24-bit WAV writer.

HeartMuLa's official pipeline calls torchaudio.save() during postprocessing.
With TorchAudio 2.10 that now depends on optional TorchCodec native FFmpeg
bindings. Rather than changing the installed ACE-Step environment or adding
a brittle codec dependency, this wrapper replaces only the local, single-
process torchaudio.save function with soundfile's WAV encoder. It leaves
HeartMuLa model weights, inference, prompts and CUDA operation unchanged.

Usage inside the isolated HeartMuLa venv:
 python molab/sonara_heartmula_wav_wrapper.py /path/to/heartlib/examples/run_music_generation.py --model_path ...
"""
from __future__ import annotations

import runpy
import sys
from pathlib import Path


def _save_wav(path, src, sample_rate, *args, **kwargs):
    import numpy as np
    import soundfile as sf

    target = Path(path)
    if target.suffix.lower() != ".wav":
        raise ValueError("SONARA HeartMuLa output must be a WAV file")
    # Match torchaudio.save's [channels, samples] tensor convention.
    tensor = src.detach().to("cpu").float()
    if tensor.ndim != 2 or tensor.shape[0] not in (1, 2):
        raise ValueError("Unexpected HeartMuLa audio shape")
    audio = tensor.numpy().T
    if audio.size == 0 or not np.isfinite(audio).all():
        raise ValueError("HeartMuLa generated invalid audio samples")
    rate = int(sample_rate)
    if rate <= 0:
        raise ValueError("Invalid HeartMuLa sample rate")
    target.parent.mkdir(parents=True, exist_ok=True)
    # 48kHz stereo 24-bit PCM: 4 min uses ~69MB (<80MB R2 job cap).
    sf.write(str(target), audio, rate, format="WAV", subtype="PCM_24")


def main():
    if len(sys.argv) < 3:
        raise SystemExit("Usage: sonara_heartmula_wav_wrapper.py <official_example.py> --model_path ...")
    official = Path(sys.argv[1]).resolve()
    if official.name != "run_music_generation.py" or not official.is_file():
        raise SystemExit("Expected official HeartMuLa examples/run_music_generation.py")

    # The official HeartMuLa example is left intact. The patch applies only in
    # this fresh inference subprocess and affects only the output encoder.
    import torchaudio
    torchaudio.save = _save_wav
    sys.argv = [str(official), *sys.argv[2:]]
    runpy.run_path(str(official), run_name="__main__")


if __name__ == "__main__":
    main()
