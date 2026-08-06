"""Unit tests for Merkle DAG commit chaining and verification in Sonara Core V8."""

import pytest
from engine.core.track_merkle import (
    compute_commit_hash,
    verify_commit_hash,
    compute_merkle_root,
    GENESIS_PARENT_COMMIT_HASH,
)
from engine.core.track_hash import compute_entity_hash, validate_sha256


def test_compute_commit_hash_genesis() -> None:
    """Tests commit hash computation for a genesis root node."""
    entity_payload = {"genre": "Techno", "bpm": 130.0, "seed": 42}
    entity_hash = compute_entity_hash(entity_payload)
    timestamp = "2026-08-01T12:00:00+00:00"

    commit_hash = compute_commit_hash(
        parent_commit_hash=None,
        entity_hash=entity_hash,
        timestamp=timestamp,
    )

    assert validate_sha256(commit_hash)
    assert len(commit_hash) == 64
    assert verify_commit_hash(commit_hash, None, entity_hash, timestamp)


def test_compute_commit_hash_chaining() -> None:
    """Tests commit hash chaining from parent to child."""
    parent_commit = "1111111111111111111111111111111111111111111111111111111111111111"
    child_payload = {"genre": "Techno", "generation": 1}
    child_entity_hash = compute_entity_hash(child_payload)
    timestamp = "2026-08-01T12:05:00+00:00"

    child_commit = compute_commit_hash(
        parent_commit_hash=parent_commit,
        entity_hash=child_entity_hash,
        timestamp=timestamp,
    )

    assert validate_sha256(child_commit)
    assert child_commit != parent_commit
    assert verify_commit_hash(child_commit, parent_commit, child_entity_hash, timestamp)


def test_verify_commit_hash_detects_tampering() -> None:
    """Tests that altering entity payload or timestamp invalidates the commit hash."""
    parent_commit = "1111111111111111111111111111111111111111111111111111111111111111"
    original_payload = {"quality_score": 90.0}
    original_entity_hash = compute_entity_hash(original_payload)
    timestamp = "2026-08-01T12:00:00+00:00"

    valid_commit = compute_commit_hash(parent_commit, original_entity_hash, timestamp)

    # Tampered entity hash
    tampered_payload = {"quality_score": 99.9}
    tampered_entity_hash = compute_entity_hash(tampered_payload)

    assert not verify_commit_hash(valid_commit, parent_commit, tampered_entity_hash, timestamp)
    # Tampered timestamp
    assert not verify_commit_hash(valid_commit, parent_commit, original_entity_hash, "2026-08-01T12:00:01+00:00")


def test_merkle_root_computation() -> None:
    """Tests Merkle Root Hash calculation over leaf lists."""
    leaf1 = "a" * 64
    leaf2 = "b" * 64
    leaf3 = "c" * 64

    root1 = compute_merkle_root([leaf1, leaf2])
    root2 = compute_merkle_root([leaf1, leaf2, leaf3])

    assert validate_sha256(root1)
    assert validate_sha256(root2)
    assert root1 != root2


def test_merkle_root_empty_list() -> None:
    """Tests Merkle root calculation for an empty list returns GENESIS hash."""
    assert compute_merkle_root([]) == GENESIS_PARENT_COMMIT_HASH


def test_invalid_hash_format_raises_error() -> None:
    """Tests that invalid hash strings raise ValueError in compute_commit_hash."""
    with pytest.raises(ValueError) as exc_info:
        compute_commit_hash("invalid-hash", "a" * 64, "2026-08-01T12:00:00Z")

    assert "Invalid parent commit hash" in str(exc_info.value)
