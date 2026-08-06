"""Data Transfer Objects (DTOs) for Sonara Core V8.

Provides decoupled input and output data structures for the Service and API boundaries.
"""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, ConfigDict


class CreateTrackDTO(BaseModel):
    """Input DTO for creating a new root Track entity."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    genre: str = Field(..., min_length=1, max_length=64, description="Genre name")
    subgenre: str = Field(..., min_length=1, max_length=64, description="Subgenre name")
    prompt: str = Field(..., min_length=1, max_length=2048, description="Generation prompt")
    audio_bytes: bytes = Field(..., description="Raw audio WAV binary content")
    seed: int = Field(default=42, ge=0, description="Random seed")
    bpm: float = Field(default=124.0, gt=0.0, le=300.0, description="BPM")
    key: str = Field(default="G Minor", min_length=1, max_length=16, description="Key")
    duration: float = Field(default=210.0, gt=0.0, description="Duration in seconds")
    quality_score: float = Field(default=88.5, ge=0.0, le=100.0, description="Quality score")
    lufs: float = Field(default=-9.5, ge=-60.0, le=0.0, description="Integrated LUFS")
    true_peak: float = Field(default=-0.5, ge=-20.0, le=3.0, description="True peak dBFS")


class EvolveTrackDTO(BaseModel):
    """Input DTO for mutating/evolving an existing parent Track entity into a child."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    parent_uuid: str = Field(..., min_length=1, description="Parent Track UUID v7")
    prompt: str = Field(..., min_length=1, max_length=2048, description="Evolution text prompt")
    audio_bytes: bytes = Field(..., description="New evolved audio WAV binary content")
    delta_quality_score: float = Field(default=2.0, description="Delta quality score improvement")
    lora_version: Optional[str] = Field(None, description="Optional LoRA model hash")


class TrackResponseDTO(BaseModel):
    """Output DTO representing a Track entity response."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    uuid_v7: str
    root_uuid: str
    parent_uuid: Optional[str]
    generation: int
    genre: str
    subgenre: str
    quality_score: float
    bpm: float
    key: str
    lufs: float
    sha256: str
    commit_hash: str
    status: str
    created_at: str
    updated_at: str


class SnapshotDTO(BaseModel):
    """Output DTO for aggregate state snapshots."""

    model_config = ConfigDict(frozen=True, extra="forbid")

    snapshot_id: str
    track_uuid: str
    version_number: int
    commit_hash: str
    timestamp: str
    state_summary: Dict[str, Any]
