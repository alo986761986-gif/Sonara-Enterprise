"""Validator component for Track domain invariants in Sonara Core V8.

Enforces absolute domain rules:
- Valid UUID format
- Valid SHA256 hex hashes
- LUFS bounded between -60.0 and 0.0
- BPM > 0.0
- Quality Score bounded between 0.0 and 100.0
- Complete 14-component TrackGenome
- Coherent versioning pointers
- Zero nulls in mandatory fields
"""

from typing import Any, Dict, List
from engine.core.track_hash import validate_sha256
from engine.core.track_schema import UUID_V7_REGEX
from engine.core.track_genome import TrackGenome


class TrackValidationError(Exception):
    """Exception raised when a Track domain entity fails validation rules."""

    def __init__(self, errors: List[str]) -> None:
        """Initializes TrackValidationError with list of error detail strings."""
        self.errors = errors
        super().__init__(f"Track validation failed with {len(errors)} error(s): {'; '.join(errors)}")


class TrackValidator:
    """Domain validator enforcing complete integrity checks on Track entities."""

    @staticmethod
    def validate_entity_data(data: Dict[str, Any]) -> None:
        """Validates raw entity data dictionary against domain invariants.

        Args:
            data: Entity field dictionary.

        Raises:
            TrackValidationError: If one or more domain rules are violated.
        """
        errors: List[str] = []

        # 1. Check mandatory non-null fields
        mandatory_fields = [
            "uuid_v7",
            "root_uuid",
            "generation",
            "created_at",
            "updated_at",
            "genre",
            "subgenre",
            "seed",
            "prompt",
            "engine_version",
            "critic_version",
            "analysis_version",
            "benchmark_version",
            "lora_version",
            "dataset_version",
            "storage_version",
            "knowledge_version",
            "quality_score",
            "critic_score",
            "commercial_score",
            "festival_score",
            "streaming_score",
            "danceability",
            "replay_value",
            "lufs",
            "true_peak",
            "bpm",
            "key",
            "duration",
            "sha256",
            "chromaprint",
            "mfcc_hash",
            "merkle_hash",
            "commit_hash",
            "genome",
        ]

        for field in mandatory_fields:
            if field not in data or data[field] is None:
                errors.append(f"Mandatory field '{field}' is missing or null")

        if errors:
            raise TrackValidationError(errors)

        # 2. Validate UUID formats
        for uuid_field in ["uuid_v7", "root_uuid"]:
            val = str(data[uuid_field])
            if not UUID_V7_REGEX.match(val):
                errors.append(f"Field '{uuid_field}' has invalid UUID format: '{val}'")

        if data.get("parent_uuid") is not None:
            parent_val = str(data["parent_uuid"])
            if not UUID_V7_REGEX.match(parent_val):
                errors.append(f"Field 'parent_uuid' has invalid UUID format: '{parent_val}'")

        # 3. Validate SHA256 hex format for hashes
        for hash_field in ["sha256", "merkle_hash", "commit_hash"]:
            val = str(data[hash_field])
            if not validate_sha256(val):
                errors.append(f"Field '{hash_field}' must be a valid 64-char hex SHA256 string, got: '{val}'")

        # 4. Validate numeric bounds
        lufs = float(data.get("lufs", 0.0))
        if not (-60.0 <= lufs <= 0.0):
            errors.append(f"LUFS must be between -60.0 and 0.0, got {lufs}")

        bpm = float(data.get("bpm", 0.0))
        if bpm <= 0.0:
            errors.append(f"BPM must be strictly greater than 0.0, got {bpm}")

        duration = float(data.get("duration", 0.0))
        if duration <= 0.0:
            errors.append(f"Duration must be strictly greater than 0.0, got {duration}")

        quality_score = float(data.get("quality_score", -1.0))
        if not (0.0 <= quality_score <= 100.0):
            errors.append(f"Quality score must be between 0.0 and 100.0, got {quality_score}")

        # 5. Validate Genome Completeness
        genome_obj = data.get("genome")
        if isinstance(genome_obj, dict):
            try:
                genome_obj = TrackGenome(**genome_obj)
            except Exception as e:
                errors.append(f"TrackGenome parsing failed: {e}")

        if isinstance(genome_obj, TrackGenome):
            required_components = [
                "kick",
                "bass",
                "groove",
                "harmony",
                "arrangement",
                "mix",
                "master",
                "commercial",
                "emotion",
                "energy",
                "originality",
                "stereo",
                "dynamics",
                "replay",
            ]
            for comp in required_components:
                if getattr(genome_obj, comp, None) is None:
                    errors.append(f"Genome component '{comp}' is missing")
        else:
            errors.append("Field 'genome' must be an instance of TrackGenome or valid dict")

        # 6. Validate Coherent Versioning
        gen = int(data.get("generation", -1))
        if gen < 0:
            errors.append(f"Generation must be >= 0, got {gen}")

        if gen == 0 and data.get("parent_uuid") is not None:
            errors.append("Root generation (0) cannot have a parent_uuid")

        if gen > 0 and data.get("parent_uuid") is None:
            errors.append("Non-root generation (>0) must specify a parent_uuid")

        if errors:
            raise TrackValidationError(errors)
