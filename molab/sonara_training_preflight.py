"""SONARA Physical Realism V4 read-only licensing and audio preflight.

This NEVER trains, uploads, or modifies files. Promotion fails closed until
all recordings are genuine, authorized, sufficiently diverse and complete.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import subprocess
import wave
from pathlib import Path

FAMILIES = {"acoustic-drums", "piano-keys", "guitars-fretted", "bass",
            "bowed-strings", "brass-woodwinds"}
LICENSES = {"OWNED", "EXPLICITLY_LICENSED", "CC0_PUBLIC_DOMAIN", "CC_BY_4_0"}
EXTENSIONS = {".wav", ".flac", ".mp3", ".ogg", ".opus", ".m4a"}


def audio_duration(path):
    """Reject fake/audio-less files. Compressed formats require real ffprobe."""
    if path.suffix.lower() == ".wav":
        with wave.open(str(path), "rb") as audio:
            if audio.getnchannels() not in (1, 2) or audio.getframerate() < 16000:
                raise ValueError("Unsupported or low-quality WAV")
            if audio.getsampwidth() not in (2, 3, 4):
                raise ValueError("Unsupported PCM format")
            duration = audio.getnframes() / audio.getframerate()
    else:
        probe = shutil.which("ffprobe")
        if not probe:
            raise ValueError("ffprobe required for non-WAV audio validation")
        result = subprocess.run(
            [probe, "-v", "error", "-select_streams", "a:0",
             "-show_entries", "format=duration", "-of", "default=nokey=1:noprint_wrappers=1",
             str(path)], text=True, capture_output=True, timeout=20, check=True
        )
        duration = float(result.stdout.strip())
    if not 5 <= duration <= 900:
        raise ValueError("Invalid real audio duration")
    return duration


def audit_dataset(manifest, root):
    root = Path(root).resolve()
    manifest = Path(manifest)
    result = {
        "readyForTraining": False, "datasetEligibleForPromotion": False,
        "readyForPromotion": False, "requiresModelBenchmark": True,
        "humanProvenanceExternallyVerified": False,
        "totalRows": 0, "verifiedRealFiles": 0, "phraseLevelPerformances": 0,
        "families": {}, "issues": []
    }
    if not root.is_dir() or not manifest.is_file():
        result["issues"].append("dataset-root-or-manifest-missing")
        return result
    try:
        rows = json.loads(manifest.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        result["issues"].append("invalid-manifest-json")
        return result
    if not isinstance(rows, list):
        result["issues"].append("manifest-must-be-array")
        return result
    result["totalRows"] = len(rows)
    seen_hashes = set()
    for index, row in enumerate(rows):
        if not isinstance(row, dict):
            result["issues"].append(f"row-{index}:invalid-entry")
            continue
        license_type = str(row.get("license_type") or "").upper()
        if license_type not in LICENSES or row.get("rights_to_train") is not True:
            result["issues"].append(f"row-{index}:training-rights-not-proven")
        if license_type == "EXPLICITLY_LICENSED" and not str(row.get("license_evidence") or "").strip():
            result["issues"].append(f"row-{index}:license-evidence-required")
        if license_type == "CC_BY_4_0" and (not str(row.get("source_attribution") or "").strip() or not str(row.get("source_license_url") or "").strip()):
            result["issues"].append(f"row-{index}:attribution-and-license-url-required")
        if row.get("synthetic") is not False:
            result["issues"].append(f"row-{index}:real-human-recording-required")
        family = str(row.get("instrument_family") or "").lower()
        if family not in FAMILIES:
            result["issues"].append(f"row-{index}:unsupported-instrument-family")
        else:
            result["families"][family] = result["families"].get(family, 0) + 1
        if not str(row.get("prompt_override") or row.get("prompt") or "").strip():
            result["issues"].append(f"row-{index}:missing-performance-description")
        if row.get("phrase_level_performance") is True:
            result["phraseLevelPerformances"] += 1
        name = str(row.get("audio_path") or row.get("filename") or "")
        path = root / name
        try:
            resolved = path.resolve(strict=True)
            if not resolved.is_relative_to(root) or not resolved.is_file() or resolved.suffix.lower() not in EXTENSIONS:
                raise ValueError("Unsafe or unsupported path")
            if resolved.stat().st_size < 1024:
                raise ValueError("Recording too short or empty")
            audio_duration(resolved)
            digest = hashlib.sha256()
            with resolved.open("rb") as audio:
                for chunk in iter(lambda: audio.read(1024 * 1024), b""):
                    digest.update(chunk)
            checksum = digest.hexdigest()
            if checksum in seen_hashes:
                raise ValueError("Duplicate recording")
            seen_hashes.add(checksum)
            result["verifiedRealFiles"] += int(row.get("synthetic") is False)
        except (OSError, ValueError, subprocess.CalledProcessError, subprocess.TimeoutExpired, wave.Error):
            result["issues"].append(f"row-{index}:missing-unsafe-or-duplicate-audio")
    if len(rows) < 8:
        result["issues"].append("development-requires-at-least-8-tracks")
    eligible = len(rows) >= 8 and result["verifiedRealFiles"] == len(rows) and not result["issues"]
    result["readyForTraining"] = eligible
    promotion_issues = []
    if len(rows) < 50 or result["verifiedRealFiles"] < 50:
        promotion_issues.append("promotion-requires-50-real-authorized-recordings")
    if result["phraseLevelPerformances"] < 24:
        promotion_issues.append("promotion-requires-24-human-performances")
    if set(result["families"]) != FAMILIES:
        promotion_issues.append("promotion-requires-six-instrument-families")
    if len(rows) and max(result["families"].values(), default=0) / len(rows) > .40:
        promotion_issues.append("single-family-exceeds-40-percent")
    result["datasetEligibleForPromotion"] = eligible and not promotion_issues
    # Dataset inspection cannot prove human provenance, a trained adapter,
    # or listening-benchmark quality. No artifact is promoted by this audit.
    result["readyForPromotion"] = False
    result["issues"].extend(promotion_issues)
    if result["datasetEligibleForPromotion"]:
        result["issues"].append("trained-adapter-and-benchmark-not-verified")
    return result


if __name__ == "__main__":
    cli = argparse.ArgumentParser()
    cli.add_argument("--root", default="/marimo/SONARA-LORA-DATASET")
    cli.add_argument("--manifest", default="/marimo/SONARA-LORA-DATASET/dataset.json")
    args = cli.parse_args()
    print(json.dumps(audit_dataset(args.manifest, args.root), indent=2, sort_keys=True))
