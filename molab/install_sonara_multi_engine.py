#!/usr/bin/env python3
"""Install independent music engines on a SONARA MoLab GPU without touching ACE-Step.

Usage:
  python molab/install_sonara_multi_engine.py --heartmula
  python molab/install_sonara_multi_engine.py --stable-audio
  python molab/install_sonara_multi_engine.py --all

Stable Audio checkpoint access requires first accepting its Hugging Face conditions.
Use HF_TOKEN from a private environment only, never commit tokens.
This script neither activates cloud deployment nor modifies existing ACE workers.
"""
import argparse
import os
from pathlib import Path
import shutil
import subprocess
import sys

ROOT = Path.home() / ".sonara" / "multi-engine-v1"
HEART = ROOT / "heartlib"
STABLE = ROOT / "stable-audio-3"


def run(args, cwd=None):
    print("RUN", args[0], " ".join(args[1:3]), flush=True)
    subprocess.run(args, check=True, cwd=cwd)


def uv():
    if shutil.which("uv"):
        return shutil.which("uv")
    target = ROOT / "tools-venv"
    run([sys.executable, "-m", "venv", str(target)])
    py = target / "bin" / "python"
    run([str(py), "-m", "pip", "install", "uv"])
    return str(target / "bin" / "uv")


def download(repo, target):
    run([UV, "tool", "run", "--from", "huggingface_hub", "hf",
         "download", "--local-dir", str(target), repo])


def clone(url, dst):
    if not (dst / ".git").exists():
        run(["git", "clone", "--depth", "1", url, str(dst)])
    else:
        print("Existing git source retained:", dst)


def heartmula():
    clone("https://github.com/HeartMuLa/heartlib.git", HEART)
    venv = ROOT / "heartlib-venv"
    if not (venv / "bin" / "python").exists():
        run([UV, "venv", "--python", "3.10", str(venv)])
    run([UV, "pip", "install", "--python", str(venv / "bin/python"), "-e", str(HEART)])
    checkpoint = HEART / "ckpt"
    download("HeartMuLa/HeartMuLaGen", checkpoint)
    download("HeartMuLa/HeartMuLa-oss-3B-happy-new-year", checkpoint / "HeartMuLa-oss-3B")
    download("HeartMuLa/HeartCodec-oss-20260123", checkpoint / "HeartCodec-oss")
    print("SONARA_HEARTMULA_FILES_DOWNLOADED=True")
    print("Next: run the actual WAV smoke test before advertising readiness.")


def stable():
    if not os.getenv("HF_TOKEN") and not (Path.home() / ".cache/huggingface/token").exists():
        print("WARNING: Stable Audio weights are gated. Accept terms on Hugging Face and authenticate privately.")
    clone("https://github.com/Stability-AI/stable-audio-3.git", STABLE)
    run([UV, "sync", "--no-dev", "--inexact"], cwd=str(STABLE))
    python = STABLE / ".venv" / "bin" / "python"
    # Medium inference explicitly requires Flash Attention 2. Not silently
    # claiming READY if a CUDA/Blackwell-compatible wheel is unavailable.
    test = subprocess.run([str(python), "-c",
        "import torch; import flash_attn; assert torch.cuda.is_available()"],
        capture_output=True, text=True)
    if test.returncode != 0:
        raise RuntimeError(
            "Stable Audio 3 Medium requires Flash Attention 2 + CUDA. "
            "Install a version matching this GPU, Python and PyTorch build "
            "inside " + str(STABLE / ".venv") +
            " and re-run --stable-audio. "
            "Do not install an incompatible prebuilt wheel or change ACE-Step.")
    # Load through huggingface_hub's normal cache, which is where
    # StableAudioModel.from_pretrained('medium') looks for the checkpoint.
    download("stabilityai/stable-audio-3-medium", ROOT / "stable-medium-weights")
    print("SONARA_STABLE_AUDIO_FILES_DOWNLOADED=True")
    print("Use SONARA_STABLE_PYTHON=" + str(STABLE / ".venv/bin/python"))
    print("Next: run the actual WAV smoke test with accepted license.")


if __name__ == "__main__":
    ROOT.mkdir(parents=True, exist_ok=True)
    parser = argparse.ArgumentParser()
    parser.add_argument("--heartmula", action="store_true")
    parser.add_argument("--stable-audio", action="store_true")
    parser.add_argument("--all", action="store_true")
    opts = parser.parse_args()
    if not (opts.heartmula or opts.stable_audio or opts.all):
        parser.error("Select --heartmula, --stable-audio or --all")
    if not shutil.which("git") or not shutil.which("ffmpeg"):
        parser.error("git and ffmpeg are required; install them privately first")
    UV = uv()
    if opts.all or opts.heartmula:
        heartmula()
    if opts.all or opts.stable_audio:
        stable()
