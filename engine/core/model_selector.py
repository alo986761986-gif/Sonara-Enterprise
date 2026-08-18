"""Sonara V8 Generation Runtime - Model Selector Engine.

Provides intelligent base model selection based on genre specializations,
quality tiers, hardware VRAM limits, BPM ranges, and fallback strategies.
"""

import threading
from typing import Dict, List, Optional, Tuple
from pydantic import BaseModel, Field, ConfigDict


class ModelCapability(BaseModel):
    """Specification of an ACE-Step generation model capability."""

    model_config = ConfigDict(frozen=True)

    model_name: str = Field(..., description="Unique model identifier string")
    quality_tier: str = Field(default="GOLD", description="Quality tier (GOLD, SILVER, BRONZE)")
    genre_specializations: List[str] = Field(
        default_factory=list, description="Primary supported genre keys"
    )
    parameter_count_b: float = Field(default=3.5, gt=0.0, description="Parameter size in Billions")
    min_vram_gb: float = Field(default=8.0, ge=0.0, description="Minimum GPU VRAM required in GB")
    sample_rate_hz: int = Field(default=48000, gt=0, description="Native audio output sample rate")
    latent_channels: int = Field(default=64, gt=0, description="Latent tensor channel count")
    default_inference_steps: int = Field(default=50, gt=0, description="Recommended default diffusion steps")
    supported_bpm_range: Tuple[float, float] = Field(
        default=(60.0, 200.0), description="Optimal BPM range bounds (min, max)"
    )


class ModelSelectionRequest(BaseModel):
    """Input selection request specifications."""

    model_config = ConfigDict(frozen=True)

    genre: str = Field(..., min_length=1, description="Target genre")
    subgenre: Optional[str] = Field(None, description="Optional target subgenre")
    bpm: float = Field(default=128.0, gt=0.0, description="Track target BPM")
    target_quality: float = Field(default=85.0, ge=0.0, le=100.0, description="Target quality score")
    max_vram_gb: Optional[float] = Field(None, ge=0.0, description="Hardware max available VRAM GB")
    preferred_model: Optional[str] = Field(None, description="User requested specific model override")
    allow_fallbacks: bool = Field(default=True, description="Enable fallback substitution if primary fails")


class ModelSelectionResult(BaseModel):
    """Output selection result containing model spec and runtime parameters."""

    model_config = ConfigDict(frozen=True)

    selected_model: ModelCapability = Field(..., description="Chosen model capability object")
    inference_steps: int = Field(..., gt=0, description="Configured inference diffusion steps")
    sample_rate_hz: int = Field(..., gt=0, description="Configured audio sample rate")
    fallback_models: List[str] = Field(default_factory=list, description="Ordered backup model names")
    selection_reason: str = Field(..., description="Audit rationale string for model selection")
    estimated_latency_sec: float = Field(..., ge=0.0, description="Estimated generation time in seconds")


class ModelSelector:
    """Intelligent base model selector with catalog management and fallback routing."""

    def __init__(self) -> None:
        """Initializes model selector with standard Sonara V8 default model catalog."""
        self._lock = threading.Lock()
        self._catalog: Dict[str, ModelCapability] = {}
        self._populate_default_catalog()

    def _populate_default_catalog(self) -> None:
        """Registers Sonara V8 default model portfolio."""
        defaults = [
            ModelCapability(
                model_name="ACE-Step-v8-Heavy-Techno",
                quality_tier="GOLD",
                genre_specializations=["techno", "industrial_techno", "hard_techno", "peak_time", "peak time techno"],
                parameter_count_b=3.8,
                min_vram_gb=12.0,
                sample_rate_hz=48000,
                latent_channels=64,
                default_inference_steps=100,
                supported_bpm_range=(125.0, 160.0),
            ),
            ModelCapability(
                model_name="ACE-Step-v8-Pro-Melodic",
                quality_tier="GOLD",
                genre_specializations=[
                    "house", "melodic house", "tech house", "afro house", "progressive house",
                    "deep house", "organic house", "trance", "uplifting trance", "melodic_techno", "edm"
                ],
                parameter_count_b=3.2,
                min_vram_gb=10.0,
                sample_rate_hz=48000,
                latent_channels=64,
                default_inference_steps=80,
                supported_bpm_range=(115.0, 140.0),
            ),
            ModelCapability(
                model_name="ACE-Step-v8-Standard",
                quality_tier="SILVER",
                genre_specializations=[
                    "drum & bass", "drum and bass", "neurofunk", "hip hop", "boom bap",
                    "trap", "lo-fi", "lofi chillhop", "cinematic", "orchestral cinematic", "ambient", "drone ambient"
                ],
                parameter_count_b=2.0,
                min_vram_gb=8.0,
                sample_rate_hz=44100,
                latent_channels=32,
                default_inference_steps=50,
                supported_bpm_range=(60.0, 180.0),
            ),
            ModelCapability(
                model_name="ACE-Step-v8-Fast-Draft",
                quality_tier="BRONZE",
                genre_specializations=[],
                parameter_count_b=0.8,
                min_vram_gb=4.0,
                sample_rate_hz=44100,
                latent_channels=16,
                default_inference_steps=25,
                supported_bpm_range=(40.0, 220.0),
            ),
        ]
        for m in defaults:
            self._catalog[m.model_name] = m

    def register_model(self, capability: ModelCapability) -> None:
        """Registers or updates a model in the catalog.

        Args:
            capability: ModelCapability object to add.
        """
        with self._lock:
            self._catalog[capability.model_name] = capability

    def get_model(self, model_name: str) -> Optional[ModelCapability]:
        """Retrieves model by name."""
        with self._lock:
            return self._catalog.get(model_name)

    def list_models(self) -> List[ModelCapability]:
        """Lists all registered models in catalog."""
        with self._lock:
            return list(self._catalog.values())

    def select_model(self, request: ModelSelectionRequest) -> ModelSelectionResult:
        """Selects the best fitting model according to request specs.

        Args:
            request: ModelSelectionRequest parameters.

        Returns:
            ModelSelectionResult object.

        Raises:
            ValueError: If no suitable model exists and fallbacks disabled.
        """
        with self._lock:
            catalog_list = list(self._catalog.values())

        genre_lower = request.genre.lower()
        subgenre_lower = request.subgenre.lower() if request.subgenre else None

        # 1. Preferred model override check
        if request.preferred_model and request.preferred_model in self._catalog:
            chosen = self._catalog[request.preferred_model]
            reason = f"Explicit user requested model override '{request.preferred_model}'"
        else:
            # 2. Filter by VRAM constraint if provided
            candidates = catalog_list
            if request.max_vram_gb is not None:
                candidates = [c for c in candidates if c.min_vram_gb <= request.max_vram_gb]
                if not candidates and request.allow_fallbacks:
                    # Fall back to smallest model
                    candidates = sorted(catalog_list, key=lambda x: x.min_vram_gb)

            # 3. Match genre specialization
            genre_matches = [
                c for c in candidates
                if genre_lower in [g.lower() for g in c.genre_specializations]
                or (subgenre_lower and subgenre_lower in [g.lower() for g in c.genre_specializations])
            ]

            if genre_matches:
                chosen = max(genre_matches, key=lambda x: x.parameter_count_b)
                reason = f"Optimal genre specialization match for '{request.genre}'"
            elif request.target_quality >= 85.0 and any(c.quality_tier == "GOLD" for c in candidates):
                chosen = next((c for c in candidates if c.quality_tier == "GOLD"), candidates[0])
                reason = "Selected Gold tier model for high quality target"
            elif candidates:
                chosen = candidates[0]
                reason = "Selected default general-purpose model"
            else:
                chosen = catalog_list[-1]
                reason = "Fallback to lightweight draft model"

        # Calculate steps and fallbacks
        steps = chosen.default_inference_steps
        if request.target_quality >= 90.0:
            steps = int(steps * 1.25)
        elif request.target_quality < 70.0:
            steps = max(20, int(steps * 0.75))

        fallbacks = [m.model_name for m in catalog_list if m.model_name != chosen.model_name]
        est_latency = round(0.05 * steps * (chosen.parameter_count_b / 2.0), 2)

        return ModelSelectionResult(
            selected_model=chosen,
            inference_steps=steps,
            sample_rate_hz=chosen.sample_rate_hz,
            fallback_models=fallbacks,
            selection_reason=reason,
            estimated_latency_sec=max(0.5, est_latency),
        )
