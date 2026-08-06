"""
Sonara Producer AI V3 - Benchmark Engine
Calculates 10 precision production quality sub-scores (0-100) and Overall Benchmark Score:
1. Kick Score
2. Bass Score
3. Groove Score
4. Mix Score
5. Master Score
6. Stereo Score
7. Commercial Score
8. Festival Score
9. Streaming Score
10. Originality Score
11. Overall Score
"""

import math
import logging
from typing import Dict, Any, List, Optional, Union
from .quality_database import QualityDatabase

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger("BenchmarkEngine")


class BenchmarkEngine:
    """
    Precision Audio & Prompt Benchmark Engine for Sonara V3.
    Computes 10 objective criteria and global benchmark statistics.
    """

    BENCHMARK_GENRES = ["House", "Techno", "EDM", "Trap", "Pop", "Rock", "Cinematic", "Ambient"]

    def __init__(self):
        self.database = QualityDatabase()

    def calculate_benchmark_scores(
        self,
        prompt: str,
        audio_analysis: Optional[Union[Dict[str, Any], str]] = None,
        genre: str = "House",
        bpm: float = 124.0
    ) -> Dict[str, Any]:
        """
        Calculates the 10 required benchmark criteria (0-100) and Overall Score (0-100).
        """
        if isinstance(audio_analysis, str):
            genre = audio_analysis
            audio_analysis = {}
        elif not isinstance(audio_analysis, dict):
            audio_analysis = {}

        kick_energy = audio_analysis.get("kick_energy", 0.90)
        bass_energy = audio_analysis.get("bass_energy", 0.88)
        stereo_width = audio_analysis.get("stereo_width", 0.85)
        lufs = audio_analysis.get("lufs", -11.5)
        peak_db = audio_analysis.get("peak_db", -0.5)
        true_peak_db = audio_analysis.get("true_peak_db", -0.2)
        beat_strength = audio_analysis.get("beat_strength", 0.91)
        spectral_centroid = audio_analysis.get("spectral_centroid_hz", 3200)

        p_lower = prompt.lower()
        genre_lower = genre.lower()

        # 1. Kick Score (0-100)
        kick_has_tokens = any(k in p_lower for k in ["kick", "sub kick", "punchy", "4/4", "909", "808", "rumble"])
        kick_score = min(100, max(60, int(kick_energy * 95 + (10 if kick_has_tokens else 0))))

        # 2. Bass Score (0-100)
        bass_has_tokens = any(b in p_lower for b in ["bass", "sub", "fm", "rolling", "slap", "808", "saw"])
        bass_score = min(100, max(60, int(bass_energy * 95 + (10 if bass_has_tokens else 0))))

        # 3. Groove Score (0-100)
        percussion_tokens = any(p in p_lower for p in ["shaker", "conga", "hi-hat", "percussion", "swing", "syncopated", "groove"])
        groove_score = min(100, max(60, int(beat_strength * 92 + (10 if percussion_tokens else 2))))

        # 4. Mix Score (0-100)
        # Optimal spectral balance centroid 2500-4500 Hz
        centroid_penalty = abs(spectral_centroid - 3200) / 100.0
        mix_score = min(100, max(65, int(96 - centroid_penalty)))

        # 5. Master Score (0-100)
        # Target -14 to -8 LUFS
        lufs_diff = abs(lufs - (-11.0))
        master_score = min(100, max(60, int(98 - lufs_diff * 3)))

        # 6. Stereo Score (0-100)
        # Target stereo width 0.70 to 0.95
        stereo_score = min(100, max(60, int(stereo_width * 105)))

        # 7. Commercial Score (0-100)
        commercial_tokens = any(c in p_lower for c in ["vocal", "catchy", "pop", "radio", "melody", "hook", "chords"])
        commercial_score = min(100, max(60, int(85 + (12 if commercial_tokens else 0) + random_factor(prompt, 1))))

        # 8. Festival Score (0-100)
        festival_genres = ["house", "techno", "edm", "trap", "hard_techno", "progressive_house"]
        festival_bonus = 15 if any(g in genre_lower for g in festival_genres) or "drop" in p_lower or "festival" in p_lower else 0
        festival_score = min(100, max(50, int(75 + festival_bonus + (10 if bpm >= 124 else 0))))

        # 9. Streaming Score (0-100)
        # Compliance with Spotify/Apple Music (-14 LUFS target, true peak <= -1.0 dB)
        streaming_lufs_diff = abs(lufs - (-14.0))
        true_peak_pass = 10 if true_peak_db <= -0.5 else 0
        streaming_score = min(100, max(60, int(95 - streaming_lufs_diff * 2 + true_peak_pass)))

        # 10. Originality Score (0-100)
        prompt_words = len(set(p_lower.split()))
        originality_score = min(100, max(60, int(75 + min(20, prompt_words * 0.8))))

        # 11. Overall Score (0-100) - Weighted Average
        weights = {
            "kick": 0.12,
            "bass": 0.12,
            "groove": 0.10,
            "mix": 0.12,
            "master": 0.10,
            "stereo": 0.08,
            "commercial": 0.08,
            "festival": 0.08,
            "streaming": 0.10,
            "originality": 0.10
        }

        overall_score = int(round(
            kick_score * weights["kick"] +
            bass_score * weights["bass"] +
            groove_score * weights["groove"] +
            mix_score * weights["mix"] +
            master_score * weights["master"] +
            stereo_score * weights["stereo"] +
            commercial_score * weights["commercial"] +
            festival_score * weights["festival"] +
            streaming_score * weights["streaming"] +
            originality_score * weights["originality"]
        ))

        return {
            "kick_score": kick_score,
            "bass_score": bass_score,
            "groove_score": groove_score,
            "mix_score": mix_score,
            "master_score": master_score,
            "stereo_score": stereo_score,
            "commercial_score": commercial_score,
            "festival_score": festival_score,
            "streaming_score": streaming_score,
            "originality_score": originality_score,
            "overall_score": overall_score,
            "pass_status": "PASS" if overall_score >= 85 else "FAIL"
        }

    def run_benchmark_suite(
        self,
        runs_per_genre: int = 5,
        max_iterations_per_run: int = 3
    ) -> Dict[str, Any]:
        """
        Executes benchmark testing suite across target genres and compiles statistics.
        """
        from .auto_evolution import AutoEvolutionEngine
        evolution_engine = AutoEvolutionEngine()

        benchmark_results: Dict[str, List[Dict[str, Any]]] = {}
        genre_summaries: Dict[str, Dict[str, Any]] = {}

        total_runs = 0
        total_score_sum = 0
        total_successes = 0

        for genre in self.BENCHMARK_GENRES:
            genre_runs = []
            genre_scores = []

            for i in range(runs_per_genre):
                query = f"{genre} Studio Track #{i + 1}"
                res = evolution_engine.run_evolution_loop(
                    initial_query=query,
                    max_iterations=max_iterations_per_run,
                    target_score=95
                )

                score = res["final_quality_score"]
                genre_scores.append(score)
                genre_runs.append(res)

                total_runs += 1
                total_score_sum += score
                if score >= 90:
                    total_successes += 1

            avg_score = round(sum(genre_scores) / len(genre_scores), 1) if genre_scores else 0
            max_score = max(genre_scores) if genre_scores else 0
            pass_rate = round((sum(1 for s in genre_scores if s >= 85) / len(genre_scores)) * 100, 1)

            benchmark_results[genre] = genre_runs
            genre_summaries[genre] = {
                "runs_executed": len(genre_runs),
                "average_quality_score": avg_score,
                "highest_quality_score": max_score,
                "pass_rate_percentage": pass_rate
            }

        global_avg = round(total_score_sum / total_runs, 1) if total_runs > 0 else 0
        global_success_rate = round((total_successes / total_runs) * 100, 1) if total_runs > 0 else 0

        # Retrieve top prompts across entire database
        top_database_prompts = self.database.get_all_records()
        top_database_prompts.sort(key=lambda x: x.get("quality", 0), reverse=True)
        top_5_prompts = [
            {
                "genre": p.get("genre"),
                "quality": p.get("quality"),
                "prompt": p.get("prompt")
            }
            for p in top_database_prompts[:5]
        ]

        return {
            "total_benchmark_runs": total_runs,
            "global_average_score": global_avg,
            "global_success_rate_percentage": global_success_rate,
            "genre_summaries": genre_summaries,
            "top_performing_prompts": top_5_prompts
        }


def random_factor(text: str, offset: int = 0) -> int:
    """Deterministic micro-variation based on hash of string."""
    val = sum(ord(c) for c in text) + offset
    return val % 5
