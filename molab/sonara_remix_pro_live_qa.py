"""SONARA Remix Pro private two-WAV end-to-end quality gate.

Runs REAL Demucs htdemucs and exactly one REAL local ACE-Step cover task on
authorized existing WAVs, then audits the resulting master. Never calls the
public site, claims a job, changes billing, starts/restarts ACE-Step, or uploads
customer audio. Run only from the isolated /marimo/SONARA-REMIX-PRO/.venv.

A pass proves technical execution, not musical originality or release quality:
a human must listen to the arrangement, voice, groove, transitions, and mix.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
import uuid
import wave


ROOT = Path("/marimo/SONARA-REMIX-PRO")
OUTPUTS = ROOT / "private-local-qa"
MAX_BYTES = 512 * 1024 * 1024


class LocalQAFailure(RuntimeError):
    pass


def private_wav(raw: str) -> Path:
    src = Path(raw).expanduser().resolve(strict=True)
    # Deliberately local-only; don't accept network URLs or arbitrary outside paths.
    if not src.is_relative_to(Path("/marimo")):
        raise LocalQAFailure("Input must be a local WAV under /marimo")
    if src.suffix.lower() != ".wav" or not src.is_file() or not 44 <= src.stat().st_size <= MAX_BYTES:
        raise LocalQAFailure("Input must be an existing local WAV up to 80 MiB")
    with wave.open(str(src), "rb") as f:
        duration = f.getnframes() / f.getframerate()
        if not 10 <= duration <= 900 or f.getnchannels() not in (1, 2):
            raise LocalQAFailure("Source WAV requires 10-900 s and 1 or 2 channels")
    return src


def file_sha256(src: Path) -> str:
    digest = hashlib.sha256()
    with src.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(args) -> dict:
    if not args.rights_confirmed:
        raise LocalQAFailure("Explicit --rights-confirmed is required for both tracks")
    if not args.prompt or not args.prompt.strip():
        raise LocalQAFailure("An original musical remix prompt is required")
    if not 30 <= args.duration <= 480:
        raise LocalQAFailure("Duration must be between 30 and 480 seconds")
    if args.bpm_a is not None and not 55 <= args.bpm_a <= 200:
        raise LocalQAFailure("BPM A outside 55-200")
    if args.bpm_b is not None and not 55 <= args.bpm_b <= 200:
        raise LocalQAFailure("BPM B outside 55-200")
    if not (ROOT / ".venv/bin/python").resolve() == Path(sys.executable).resolve():
        raise LocalQAFailure("Use only the isolated Remix Pro Python environment")
    if not ROOT.is_dir():
        raise LocalQAFailure("Isolated Remix Pro directory missing")

    a = private_wav(args.source_a)
    b = private_wav(args.source_b)
    hash_a, hash_b = file_sha256(a), file_sha256(b)
    if a == b or hash_a == hash_b:
        raise LocalQAFailure("Sources A and B must contain different audio")

    from sonara_remix_pro_toolkit import (
        analyze_audio, separate_stems, combine_two_songs, transparent_master,
        add_generated_percussion
    )
    from sonara_remix_pro_ace_bridge import render as ace_cover
    from sonara_remix_pro_quality import audit_wav, audit_remix
    import soundfile as sf
    import numpy as np

    # Unique private run folder: never overwrite existing source or result.
    OUTPUTS.mkdir(mode=0o700, parents=True, exist_ok=True)
    os.chmod(OUTPUTS, 0o700)
    job_dir = OUTPUTS / ("qa_" + uuid.uuid4().hex)
    job_dir.mkdir(mode=0o700)
    cache = job_dir / "stems"
    cache.mkdir(mode=0o700)
    os.environ["TORCH_HOME"] = str(ROOT / "model-cache")
    os.environ["XDG_CACHE_HOME"] = str(ROOT / "private-cache")

    print("SONARA_QA_START=AUTHORIZED_TWO_WAV", flush=True)
    print("SONARA_QA_LOCAL_ONLY=True", flush=True)
    print("SONARA_QA_BILLING_UNCHANGED=True", flush=True)
    print("SONARA_QA_RELAY_UNCHANGED=True", flush=True)

    report_a = analyze_audio(a)
    report_b = analyze_audio(b)
    bpm_a = args.bpm_a or report_a.get("tempoBpm")
    bpm_b = args.bpm_b or report_b.get("tempoBpm")
    if not bpm_a or not bpm_b:
        raise LocalQAFailure("BPM cannot be verified. Supply --bpm-a and --bpm-b")
    print("SONARA_QA_TEMPO_VERIFIED=True", flush=True)

    manifest_a = separate_stems(a, cache, device="cuda")
    manifest_b = separate_stems(b, cache, device="cuda")
    if not manifest_a.get("stemsVerified") or not manifest_b.get("stemsVerified"):
        raise LocalQAFailure("Demucs did not verify both source stem manifests")
    stems_a = cache / manifest_a["sourceSha256"][:20]
    stems_b = cache / manifest_b["sourceSha256"][:20]
    print("SONARA_QA_REAL_DEMUCS_A_B=True", flush=True)

    arranged = job_dir / "arranged.wav"
    arrangement = combine_two_songs(
        a, b, stems_a, stems_b, arranged,
        bpm_a=float(bpm_a), bpm_b=float(bpm_b),
        bass_from=args.bass_from, max_seconds=args.duration, dual_source=True
    )
    arranged_audit = audit_wav(arranged)
    if arranged_audit.get("durationSeconds", 0) < 10 or arranged_audit.get("channels") != 2:
        raise LocalQAFailure("Merged arrangement failed minimum audio checks")
    print("SONARA_QA_TWO_SONG_MERGE=True", flush=True)

    generated = job_dir / "generated.wav"
    cover = ace_cover(
        arranged, generated, args.prompt, mode=args.auth_mode,
        strength=args.strength, noise=args.noise, bpm=float(bpm_a),
        key=args.key or None
    )
    if cover.get("status") != "completed":
        raise LocalQAFailure("ACE-Step did not produce a completed real cover")
    print("SONARA_QA_REAL_ACE_STEP_COVER=True", flush=True)

    generated_manifest = separate_stems(generated, cache, device="cuda")
    generated_stems = cache / generated_manifest["sourceSha256"][:20]
    audio, sr = add_generated_percussion(arranged, generated_stems / "drums.wav", bpm=float(bpm_a))
    if not 22050 <= sr <= 96000 or not 10 <= len(audio)/sr <= 120:
        raise LocalQAFailure("ACE-Step output has unsupported rate or duration")
    if audio.shape[1] == 1:
        audio = np.repeat(audio, 2, axis=1)
    if audio.shape[1] != 2 or not np.isfinite(audio).all():
        raise LocalQAFailure("ACE-Step output channels or samples invalid")
    mastered, master_metrics = transparent_master(audio, sr=sr)
    master = job_dir / "mastered.wav"
    sf.write(str(master), mastered, sr, subtype="PCM_24")
    measured = audit_wav(master)
    comparison = audit_remix(a, master)
    rejected = (
        measured.get("integratedLufs") is None
        or measured.get("clippedFrameRatio", 1) > 0.0001
        or measured.get("approxTruePeakDbTp", 20) > -0.5
        or measured.get("nearSilenceFrameRatio", 1) > 0.15
    )
    summary = {
        "pipeline": "real-demucs-A-and-B -> dual tonal arrangement -> ACE-Step percussion -> source-preserving master",
        "technicalPass": not rejected,
        "humanListeningRequired": True,
        "sourceAHashPrefix": hash_a[:16],
        "sourceBHashPrefix": hash_b[:16],
        "durationRequestedSeconds": args.duration,
        "arrangementDurationSeconds": arrangement.get("seconds"),
        "finalWav": str(master),
        "audit": {k:v for k,v in measured.items() if k != "path"},
        "audioReviewFlags": comparison.get("reviewFlags", []),
        "masteringMetrics": master_metrics,
        "billingUnchanged": True,
        "siteQueueUnchanged": True
    }
    path = job_dir / "qa-report.json"
    path.write_text(json.dumps(summary, indent=2), encoding="utf-8")
    path.chmod(0o600)
    print("SONARA_QA_REPORT=" + str(path),flush=True)
    print("SONARA_QA_REAL_MASTER=" + str(master),flush=True)
    print("SONARA_QA_AUDIO_TECHNICAL_PASS=" + str(not rejected),flush=True)
    print("SONARA_QA_HUMAN_LISTENING_REQUIRED=True",flush=True)
    return summary


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="SONARA Remix Pro REAL private two-WAV GPU QA")
    p.add_argument("--source-a", required=True, help="Authorized local WAV A under /marimo")
    p.add_argument("--source-b", required=True, help="Authorized local WAV B under /marimo")
    p.add_argument("--rights-confirmed", action="store_true")
    p.add_argument("--prompt", required=True)
    p.add_argument("--duration", type=int, default=30)
    p.add_argument("--bpm-a", type=float)
    p.add_argument("--bpm-b", type=float)
    p.add_argument("--bass-from", choices=("a","b"), default="a")
    p.add_argument("--auth-mode", choices=("required","none"), default="required")
    p.add_argument("--strength", type=float, default=.76)
    p.add_argument("--noise", type=float, default=.14)
    p.add_argument("--key", default="")
    args = p.parse_args(argv)
    try:
        outcome = run(args)
        return 0 if outcome["technicalPass"] else 2
    except Exception as error:
        print("SONARA_QA_RESULT=FAILED", flush=True)
        print("SONARA_QA_ERROR_CLASS=" + type(error).__name__, flush=True)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
