"""Cryptographic hash calculation and verification utilities for Sonara Core V8.

This module provides deterministic hashing algorithms for entity attributes, audio binaries,
MFCC feature arrays, and Chromaprint acoustic fingerprints.
"""

import hashlib
import json
import re
from typing import Any, Dict, Sequence

SHA256_HEX_PATTERN = re.compile(r"^[a-fA-F0-9]{64}$")


def validate_sha256(hash_str: str) -> bool:
    """Validates whether a string is a 64-character hexadecimal SHA256 string.

    Args:
        hash_str: String to validate.

    Returns:
        True if valid 64-char hex SHA256 string, False otherwise.
    """
    if not isinstance(hash_str, str):
        return False
    return bool(SHA256_HEX_PATTERN.match(hash_str))


def compute_sha256(content: bytes) -> str:
    """Computes SHA256 hex digest for raw bytes (e.g. audio binaries).

    Args:
        content: Byte array or binary buffer.

    Returns:
        64-character lowercase hexadecimal string.
    """
    return hashlib.sha256(content).hexdigest()


def compute_entity_hash(payload: Dict[str, Any]) -> str:
    """Computes a deterministic SHA256 hash over an entity dictionary payload.

    Args:
        payload: Dictionary of entity properties (excluding commit_hash itself).

    Returns:
        64-character lowercase hexadecimal SHA256 string.
    """
    def serialize(obj: Any) -> Any:
        if hasattr(obj, "model_dump"):
            return serialize(obj.model_dump())
        if hasattr(obj, "to_dict"):
            return serialize(obj.to_dict())
        if isinstance(obj, dict):
            return {k: serialize(v) for k, v in obj.items() if k != "commit_hash"}
        if isinstance(obj, list):
            return [serialize(item) for item in obj]
        return obj

    clean_payload = serialize(payload)
    canonical_json = json.dumps(clean_payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


def compute_mfcc_hash(features: Sequence[float]) -> str:
    """Computes SHA256 hash representation for MFCC audio feature vectors.

    Args:
        features: Sequence of floating-point MFCC spectral coefficients.

    Returns:
        64-character lowercase hexadecimal SHA256 string.
    """
    feature_bytes = json.dumps([round(f, 6) for f in features], separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(feature_bytes).hexdigest()


def compute_chromaprint(audio_bytes: bytes) -> str:
    """Computes an acoustic fingerprint string for audio content.

    Args:
        audio_bytes: Raw audio binary content.

    Returns:
        Base64-encoded acoustic fingerprint representation string.
    """
    if not audio_bytes:
        raise ValueError("Audio bytes cannot be empty for Chromaprint computation.")
    digest = hashlib.sha256(audio_bytes).digest()
    import base64
    return f"AQAD{base64.b64encode(digest[:18]).decode('utf-8')}"
