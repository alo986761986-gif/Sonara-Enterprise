"""Private, fail-closed REAL Remix Pro V3 two-reference GPU acceptance test.

Tests exactly the production V3 architecture: source A structural guide,
independent B style reference, local ACE-Step cover (one or more authentic
sections for long tracks), post-cover mastering, and technical rejection gate.

Only for music the operator is authorized to transform. Never submits a site
job, reads website tokens, changes Cloudflare, or restarts a running model.
It must run while the dedicated Pro worker is STOPPED, with an isolated venv
and a confirmed maintenance window; it obtains that worker's exclusive lock.
This does not guarantee musical creativity; human listening remains essential.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import sys
import time
import uuid

ROOT = Path("/marimo/SONARA-REMIX-PRO")
VENV = ROOT / ".venv/bin/python"
LOCK = Path.home() / ".sonara/remix-pro-agent.lock"
OUTPUTS = ROOT / "private-local-qa"
AGENT = ROOT / "sonara_remix_pro_r2_agent.py"
MAX_SOURCE_BYTES = 512 * 1024 * 1024


class V3QAFailure(RuntimeError):
    pass


def _require(condition, error):
    if not condition:
        raise V3QAFailure(error)


def _active_pro_pids(proc=Path("/proc")):
    """Inspect command-line identity; fail closed if process list is missing."""
    try:
        entries = list(proc.iterdir())
    except OSError as exc:
        raise V3QAFailure("Cannot inspect local process list") from exc
    active = []
    for entry in entries:
        if not entry.name.isdigit():
            continue
        try:
            parts = (entry / "cmdline").read_bytes().split(bytes([0]))
            cwd = (entry / "cwd").resolve()
        except (OSError, RuntimeError):
            continue
        for raw in parts[1:]:
            if b"sonara_remix_pro_r2_agent.py" not in raw:
                continue
            try:
                target = Path(os.fsdecode(raw))
                target = (target if target.is_absolute() else cwd / target).resolve()
            except (OSError, RuntimeError, ValueError):
                continue
            if target == AGENT.resolve():
                active.append(int(entry.name))
                break
    return active


@contextmanager
def maintenance_lock():
    LOCK.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    with LOCK.open("a+") as handle:
        os.chmod(LOCK, 0o600)
        try:
            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise V3QAFailure("Remix Pro worker holds lock; refusing GPU QA") from exc
        try:
            _require(not _active_pro_pids(), "Dedicated Remix Pro agent is still running")
            yield
        finally:
            fcntl.flock(handle, fcntl.LOCK_UN)


def _check_environment():
    _require(ROOT.is_dir() and VENV.is_file(), "Private MoLab Remix Pro environment is absent")
    _require(Path(sys.executable).resolve() == VENV.resolve(),
             "Use only the isolated Remix Pro virtual environment")
    _require(AGENT.is_file(), "V3 agent is missing")
    source = AGENT.read_text(encoding="utf-8")
    _require('REVISION = "sonara-remix-pro-r2-agent-v3-dual-reference-fusion"' in source,
             "Live agent file is not the expected V3 revision")
    _require((ROOT / "sonara_remix_pro_fusion.py").is_file(),
             "Independent two-source fusion planner is absent")
    _require((ROOT / "sonara_remix_pro_quality.py").is_file(),
             "Post-cover audio quality gate is absent")
    return True


def _input_audio(name):
    import numpy as np
    import soundfile as sf

    try:
        audio = Path(name).expanduser().resolve(strict=True)
    except (OSError, RuntimeError) as exc:
        raise V3QAFailure("Input WAV is missing") from exc
    _require(audio.is_relative_to(Path("/marimo")), "Source WAV must remain private under /marimo")
    _require(audio.is_file() and audio.suffix.lower() == ".wav"
             and 44 <= audio.stat().st_size <= MAX_SOURCE_BYTES,
             "Source must be a real local WAV under 512 MiB")
    try:
        with sf.SoundFile(str(audio)) as reader:
            _require(reader.format in ("WAV", "WAVEX") and reader.channels in (1, 2),
                     "Source must have 1 or 2 PCM/float WAV channels")
            _require(reader.subtype in ("PCM_16", "PCM_24", "PCM_32", "FLOAT", "DOUBLE"),
                     "Source WAV encoding is unsupported")
            _require(8000 <= reader.samplerate <= 96000
                     and 10 <= reader.frames / reader.samplerate <= 900,
                     "Source duration or sample rate is unsupported")
            probe = reader.read(min(reader.frames, 8 * reader.samplerate),
                                dtype="float32", always_2d=True)
    except (OSError, RuntimeError, ValueError) as exc:
        raise V3QAFailure("Source WAV is not readable") from exc
    rms = float(np.sqrt(np.mean(np.square(probe.astype(np.float64)))))
    _require(np.isfinite(rms) and rms >= 0.0008, "Source WAV is silent or too quiet")
    return audio


def _fingerprint(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for part in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(part)
    return h.hexdigest()


def check_params(args):
    _require(bool(getattr(args, "rights_confirmed", False)),
             "Both sources require explicit --rights-confirmed")
    _require(bool(getattr(args, "maintenance_window_confirmed", False)),
             "GPU QA requires a confirmed maintenance window")
    _require(bool(getattr(args, "prompt", "").strip()),
             "A new composition prompt is required")
    _require(isinstance(args.duration, int) and args.duration in range(30, 481, 30),
             "Duration must be 30-480 seconds in 30-second increments")
    for name in ("bpm_a", "bpm_b"):
        val = getattr(args, name)
        _require(val is None or 55 <= val <= 200, "BPM outside verified 55-200 range")
    _require(0.35 <= args.strength <= 0.92 and 0 <= args.noise <= 0.30,
             "Invalid ACE-Step conditioning parameters")
    _require(args.auth_mode in ("required", "none"), "Invalid ACE-Step auth mode")


def run(args):
    """Exactly the V3 dual-reference source architecture, never V2 stem overlay."""
    check_params(args)
    _check_environment()
    a, b = _input_audio(args.source_a), _input_audio(args.source_b)
    _require(a != b and _fingerprint(a) != _fingerprint(b),
             "A and B must be distinct authentic WAV files")
    import numpy as np
    import soundfile as sf
    from sonara_remix_pro_fusion import (
        ensure_distinct_sources, select_fusion_tempo, make_structural_guide,
        make_independent_style_reference, build_fusion_prompt,
    )
    from sonara_remix_pro_toolkit import analyze_audio, separate_stems, transparent_master
    from sonara_remix_pro_ace_bridge import render_long_remix
    from sonara_remix_pro_quality import audit_wav, release_gate

    with maintenance_lock():
        ensure_distinct_sources(a, b)
        os.environ["TORCH_HOME"] = str(ROOT / "model-cache")
        os.environ["XDG_CACHE_HOME"] = str(ROOT / "private-cache")
        OUTPUTS.mkdir(mode=0o700, parents=True, exist_ok=True)
        OUTPUTS.chmod(0o700)
        job = OUTPUTS / ("v3_" + uuid.uuid4().hex)
        job.mkdir(mode=0o700)
        print("SONARA_QA_V3_STARTED=True", flush=True)
        print("SONARA_QA_NO_SITE_JOB=True", flush=True)
        print("SONARA_QA_PRO_WORKER_STOPPED=True", flush=True)
        print("SONARA_QA_MAIN_ACE_STEP_UNMODIFIED=True", flush=True)

        report_a, report_b = analyze_audio(a), analyze_audio(b)
        bpm = select_fusion_tempo(args.bpm_a, report_a, args.bpm_b, report_b)
        cache = job / "stems"
        cache.mkdir(mode=0o700)
        ma = separate_stems(a, cache, device="cuda")
        mb = separate_stems(b, cache, device="cuda")
        _require(ma.get("stemsVerified") and mb.get("stemsVerified"),
                 "Demucs A/B stem separation failed")
        stem_b = cache / mb["sourceSha256"][:20] / "drums.wav"
        guide, style = job / "guide-a.wav", job / "style-b.wav"
        guide_report = make_structural_guide(a, guide, args.duration)
        style_report = make_independent_style_reference(
            b, style, activity_audio_path=stem_b
        )
        _require(guide_report.get("containsSourceB") is False
                 and style_report.get("containsSourceA") is False,
                 "Independent references failed provenance inspection")
        b_audit = audit_wav(style)
        _require(b_audit.get("integratedLufs") is not None
                 and b_audit.get("nearSilenceFrameRatio", 1) <= .70
                 and b_audit.get("rmsDbFs", -120) >= -52,
                 "B style excerpt is too quiet for conditioning")
        musical_prompt = build_fusion_prompt(
            args.prompt, report_a, report_b, target_bpm=bpm,
            target_key=args.key or report_a.get("key"),
            bass_from=args.bass_from, requested_seconds=args.duration
        )
        generated = job / "generated.wav"
        cover = render_long_remix(
            guide, generated, musical_prompt, mode=args.auth_mode,
            reference_audio_path=style, strength=args.strength,
            noise=args.noise, bpm=bpm,
            key=args.key or report_a.get("key") or None,
        )
        _require(cover.get("status") == "completed"
                 and cover.get("durationVerified") is True
                 and cover.get("independentStyleReference") is True,
                 "ACE-Step did not complete an independent A/B conditioned cover")
        samples, sr = sf.read(str(generated), dtype="float32", always_2d=True)
        _require(22050 <= sr <= 96000 and samples.shape[1] in (1, 2)
                 and np.isfinite(samples).all(),
                 "Generated WAV has invalid samples, channels, or sample rate")
        if samples.shape[1] == 1:
            samples = np.repeat(samples, 2, axis=1)
        mastered, mastering_metrics = transparent_master(samples, sr=sr)
        master = job / "mastered.wav"
        sf.write(str(master), mastered, sr, subtype="PCM_24")
        master.chmod(0o600)
        gate = release_gate(guide, generated, master,
                            expected_seconds=args.duration,
                            require_b_motif=True)
        report = {
            "pipeline": "V3 independent A guide + independent B style -> ACE-Step -> PCM24 master",
            "technicalPass": gate["acceptedTechnical"],
            "technicalFailureReasons": gate["failures"],
            "humanListeningRequired": True,
            "perceptualFusionVerified": False,
            "bStyleReferenceSubmitted": bool(cover.get("independentStyleReference")),
            "sourceAHashPrefix": _fingerprint(a)[:16],
            "sourceBHashPrefix": _fingerprint(b)[:16],
            "durationSecondsRequested": args.duration,
            "segmentCount": cover.get("segmentCount"),
            "masteringMetrics": mastering_metrics,
            "resultPath": str(master),
            "gateMethod": gate["method"],
        }
        report_file = job / "v3-qa.json"
        report_file.write_text(json.dumps(report, indent=2, default=str), encoding="utf-8")
        report_file.chmod(0o600)
        print("SONARA_QA_V3_REPORT=" + str(report_file), flush=True)
        print("SONARA_QA_V3_TECHNICAL_PASS=" + str(report["technicalPass"]), flush=True)
        print("SONARA_QA_ARTISTIC_LISTENING_REQUIRED=True", flush=True)
        return report


def main(argv=None):
    parser = argparse.ArgumentParser(description="Private V3 dual-reference GPU acceptance QA")
    parser.add_argument("--preflight", action="store_true", help="Read-only checks; NEVER generates audio")
    parser.add_argument("--run", action="store_true", help="Explicitly authorize one local QA render")
    parser.add_argument("--source-a", default="")
    parser.add_argument("--source-b", default="")
    parser.add_argument("--prompt", default="")
    parser.add_argument("--duration", type=int, default=30)
    parser.add_argument("--bpm-a", type=float)
    parser.add_argument("--bpm-b", type=float)
    parser.add_argument("--bass-from", choices=("a", "b"), default="a")
    parser.add_argument("--key", default="")
    parser.add_argument("--auth-mode", choices=("required", "none"), default="required")
    parser.add_argument("--strength", type=float, default=0.72)
    parser.add_argument("--noise", type=float, default=0.0)
    parser.add_argument("--rights-confirmed", action="store_true")
    parser.add_argument("--maintenance-window-confirmed", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.preflight:
            _check_environment()
            print("SONARA_QA_V3_AGENT_PROCESS_COUNT=" + str(len(_active_pro_pids())))
            print("SONARA_QA_V3_PREFLIGHT_OK=True")
            print("SONARA_QA_AUDIO_GENERATED=False")
            return 0
        _require(args.run, "Use --preflight or explicit --run")
        result = run(args)
        return 0 if result["technicalPass"] else 2
    except (V3QAFailure, OSError, ValueError) as exc:
        print("SONARA_QA_V3_FAILED=True")
        print("SONARA_QA_ERROR_CLASS=" + type(exc).__name__)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
