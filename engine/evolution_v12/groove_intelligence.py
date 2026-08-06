"""Sonara V12 Autonomous Evolution Engine - Groove Intelligence."""

from typing import Dict, Any, List, Tuple
import math

class GrooveIntelligence:
    """Tunes rhythmic swing and micro-timing with sample-exact 4/4 grid quantization."""

    def get_groove_profile(self, style: str) -> Dict[str, Any]:
        style_lower = style.lower()
        if "house" in style_lower or "techno" in style_lower:
            swing_pct = 12.5
        elif "hiphop" in style_lower or "lofi" in style_lower:
            swing_pct = 25.0
        else:
            swing_pct = 0.0

        return {
            "style": style,
            "swing_pct": swing_pct,
            "humanize_ms": 0.0,
            "quantization_grid": "16th_triplet_locked" if swing_pct > 0 else "16th_straight_locked"
        }

    def calculate_grid_offsets(
        self,
        sample_rate: int,
        bpm: float,
        swing_pct: float = 0.0
    ) -> Dict[str, float]:
        """Calculates exact sample intervals for quarter-note beat anchors and 16th-note ticks."""
        samples_per_beat = (sample_rate * 60.0) / max(40.0, min(240.0, bpm))
        samples_per_tick = samples_per_beat / 4.0  # 16th note grid
        samples_per_bar = samples_per_beat * 4.0   # 4/4 bar anchor

        # Swing shifts offbeat 16th ticks without disturbing the main beat anchor
        swing_offset_samples = (samples_per_tick * (swing_pct / 100.0))

        return {
            "samples_per_beat": samples_per_beat,
            "samples_per_tick": samples_per_tick,
            "samples_per_bar": samples_per_bar,
            "swing_offset_samples": swing_offset_samples
        }

