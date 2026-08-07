"""Strict GPU stem separation for the SONARA production pipeline.

This runner never creates synthetic or placeholder stems. It succeeds only when
Demucs v4 runs on CUDA and produces all four expected 44.1 kHz WAV stems.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys


EXPECTED_STEMS = ("drums", "bass", "vocals", "other")


def emit(payload: dict) -> None:
    print("JSON_START" + json.dumps(payload, ensure_ascii=False) + "JSON_END")


def ensure_cuda() -> None:
    try:
        import torch
    except ImportError as exc:
        raise RuntimeError("PyTorch is not installed in the dedicated SONARA environment") from exc

    if not torch.cuda.is_available():
        raise RuntimeError("CUDA is unavailable; CPU or simulated stem separation is forbidden")


def separate(args: argparse.Namespace) -> dict:
    input_path = Path(args.input).expanduser().resolve()
    output_root = Path(args.output).expanduser().resolve()

    if not input_path.is_file():
        raise FileNotFoundError(f"Input audio does not exist: {input_path}")

    ensure_cuda()
    output_root.mkdir(parents=True, exist_ok=True)

    command = [
        sys.executable,
        "-m",
        "demucs.separate",
        "-n",
        args.model,
        "-d",
        "cuda",
        "--segment",
        str(args.segment),
        "--overlap",
        str(args.overlap),
        "--shifts",
        str(args.shifts),
        "--int24",
        "--out",
        str(output_root),
        str(input_path),
    ]

    completed = subprocess.run(
        command,
        check=False,
        text=True,
        capture_output=True,
        env={**os.environ, "PYTHONUNBUFFERED": "1"},
    )
    if completed.returncode != 0:
        raise RuntimeError(completed.stderr.strip() or completed.stdout.strip() or "Demucs failed")

    track_directory = output_root / args.model / input_path.stem
    stems = {
        stem: str((track_directory / f"{stem}.wav").resolve())
        for stem in EXPECTED_STEMS
    }

    missing = [stem for stem, stem_path in stems.items() if not Path(stem_path).is_file()]
    if missing:
        raise RuntimeError(f"Demucs did not produce required stems: {', '.join(missing)}")

    return {
        "status": "COMPLETED",
        "engine": "Demucs v4",
        "model": args.model,
        "device": "cuda",
        "input": str(input_path),
        "output_directory": str(track_directory.resolve()),
        "stems": stems,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="SONARA GPU Demucs stem separation")
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--model", default="htdemucs_ft")
    parser.add_argument("--device", choices=("cuda",), default="cuda")
    parser.add_argument("--segment", type=int, default=7)
    parser.add_argument("--overlap", type=float, default=0.25)
    parser.add_argument("--shifts", type=int, default=1)
    args = parser.parse_args()

    try:
        emit(separate(args))
        return 0
    except Exception as exc:  # noqa: BLE001 - CLI boundary returns a strict error DTO.
        emit({"status": "FAILED", "device": "cuda", "error": str(exc)})
        print(f"[SONARA_STEMS] {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
