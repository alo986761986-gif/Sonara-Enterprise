"""Sonara Generation Runtime - LeVo model selector."""

import threading
from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel, Field, ConfigDict


class ModelCapability(BaseModel):
    """Specification of a LeVo generation model capability."""

    model_config = ConfigDict(frozen=True)

    model_name: str = Field(..., description="Unique model identifier string")
    quality_tier: str = Field(default="GOLD", description="Quality tier (GOLD, SILVER, BRONZE)")
    genre_specializations: List[str] = Field(default_factory=list, description="Primary supported genre keys")
    parameter_count_b: float = Field(default=1.0, gt=0.0, description="Relative model size indicator")
    min_vram_gb: float = Field(default=22.0, ge=0.0, description="Minimum GPU VRAM required in GB")
    sample_rate_hz: int = Field(default=44100, gt=0, description="Audio output sample rate")
    latent_channels: int = Field(default=1, gt=0, description="Compatibility field")
    default_inference_steps: int = Field(default=1, gt=0, description="Compatibility field")
    supported_bpm_range: Tuple[float, float] = Field(default=(40.0, 220.0), description="Supported BPM range")


class ModelSelectionRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    genre: str = Field(..., min_length=1)
    subgenre: Optional[str] = None
    bpm: float = Field(default=128.0, gt=0.0)
    target_quality: float = Field(default=85.0, ge=0.0, le=100.0)
    max_vram_gb: Optional[float] = Field(None, ge=0.0)
    preferred_model: Optional[str] = None
    allow_fallbacks: bool = True


class ModelSelectionResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    selected_model: ModelCapability
    inference_steps: int = Field(..., gt=0)
    sample_rate_hz: int = Field(..., gt=0)
    fallback_models: List[str] = Field(default_factory=list)
    selection_reason: str
    estimated_latency_sec: float = Field(..., ge=0.0)


class ModelSelector:
    """Selects the active Sonara LeVo model."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._catalog: Dict[str, ModelCapability] = {}
        self._populate_default_catalog()

    def _populate_default_catalog(self) -> None:
        defaults = [
            ModelCapability(
                model_name="SongGeneration-v2-large",
                quality_tier="GOLD",
                genre_specializations=[
                    "house", "melodic house", "tech house", "afro house", "progressive house",
                    "deep house", "organic house", "techno", "trance", "drum & bass",
                    "hip hop", "trap", "lo-fi", "ambient", "cinematic", "electronic"
                ],
                parameter_count_b=1.0,
                min_vram_gb=22.0,
                sample_rate_hz=44100,
                latent_channels=1,
                default_inference_steps=1,
                supported_bpm_range=(40.0, 220.0),
            ),
        ]
        for model in defaults:
            self._catalog[model.model_name] = model

    def register_model(self, capability: ModelCapability) -> None:
        with self._lock:
            self._catalog[capability.model_name] = capability

    def get_model(self, model_name: str) -> Optional[ModelCapability]:
        with self._lock:
            return self._catalog.get(model_name)

    def list_models(self) -> List[ModelCapability]:
        with self._lock:
            return list(self._catalog.values())

    def select_model(self, request: ModelSelectionRequest) -> ModelSelectionResult:
        with self._lock:
            catalog_list = list(self._catalog.values())

        if not catalog_list:
            raise ValueError("No LeVo models registered")

        chosen = self._catalog.get(request.preferred_model or "") or catalog_list[0]

        if request.max_vram_gb is not None and request.max_vram_gb < chosen.min_vram_gb:
            if not request.allow_fallbacks:
                raise ValueError(
                    f"{chosen.model_name} requires about {chosen.min_vram_gb} GB VRAM; "
                    f"only {request.max_vram_gb} GB was supplied"
                )
            reason = (
                f"Selected {chosen.model_name}; LEVO_LOW_MEM may be required because "
                f"reported VRAM is below {chosen.min_vram_gb} GB"
            )
        else:
            reason = f"Selected Sonara native LeVo model {chosen.model_name}"

        return ModelSelectionResult(
            selected_model=chosen,
            inference_steps=chosen.default_inference_steps,
            sample_rate_hz=chosen.sample_rate_hz,
            fallback_models=[],
            selection_reason=reason,
            estimated_latency_sec=60.0,
        )
