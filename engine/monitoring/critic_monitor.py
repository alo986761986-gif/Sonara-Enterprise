import sqlite3
import logging
from typing import Dict, Any

logger = logging.getLogger("CriticMonitor")

class CriticMonitor:
    """
    Tracks quality control trends and music critic categories.
    Queries 'quality' and 'analysis' relational tables in dataset.db.
    """

    def __init__(self, db_path: str = "dataset.db"):
        self.db_path = db_path

    def check_quality_stats(self) -> Dict[str, Any]:
        """Calculates historical quality metrics from vetting pipeline database."""
        metrics = {
            "avg_music_critic_score": 0.0,
            "avg_dsp_score": 0.0, # Composite DSP quality score
            "avg_loudness_lufs": 0.0,
            "avg_true_peak_dbtp": 0.0,
            "avg_crest_factor_db": 0.0,
            "avg_stereo_width": 0.0,
            "category_averages": {
                "commercial_score": 0.0,
                "originality_score": 0.0,
                "dynamics_score": 0.0,
                "master_score": 0.0,
                "mix_score": 0.0
            }
        }

        try:
            conn = sqlite3.connect(self.db_path)
            cursor = conn.cursor()

            # Verify that tables exist
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='quality'")
            if not cursor.fetchone():
                conn.close()
                return metrics

            # 1. Gather Quality (Critic) Averages
            cursor.execute("""
                SELECT 
                    AVG(music_critic_score),
                    AVG(commercial_score),
                    AVG(originality_score),
                    AVG(dynamics_score),
                    AVG(master_score),
                    AVG(mix_score)
                FROM quality
            """)
            row = cursor.fetchone()
            if row and row[0] is not None:
                metrics["avg_music_critic_score"] = round(row[0], 2)
                metrics["category_averages"]["commercial_score"] = round(row[1], 2)
                metrics["category_averages"]["originality_score"] = round(row[2], 2)
                metrics["category_averages"]["dynamics_score"] = round(row[3], 2)
                metrics["category_averages"]["master_score"] = round(row[4], 2)
                metrics["category_averages"]["mix_score"] = round(row[5], 2)

            # 2. Gather Analysis (DSP) Averages
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='analysis'")
            if cursor.fetchone():
                cursor.execute("""
                    SELECT 
                        AVG(lufs),
                        AVG(true_peak),
                        AVG(rms),
                        AVG(stereo_width),
                        AVG(dynamic_range),
                        AVG(beat_strength)
                    FROM analysis
                """)
                row = cursor.fetchone()
                if row and row[0] is not None:
                    metrics["avg_loudness_lufs"] = round(row[0], 2)
                    metrics["avg_true_peak_dbtp"] = round(row[1], 2)
                    
                    # Crest factor approximation = abs(true_peak - rms)
                    avg_rms = row[2] or -15.0
                    avg_tp = row[1] or -1.5
                    metrics["avg_crest_factor_db"] = round(abs(avg_tp - avg_rms), 2)
                    metrics["avg_stereo_width"] = round(row[3] or 0.0, 2)
                    
                    # Composite DSP score derived from alignment with standard targets
                    # LUFS target -14, true peak <= -1, stereo ~0.8
                    lufs_penalty = abs(row[0] - (-14.0)) if row[0] else 0
                    stereo_penalty = abs(row[3] - 0.8) * 10 if row[3] else 0
                    metrics["avg_dsp_score"] = round(max(50.0, 100.0 - (lufs_penalty * 2.0) - stereo_penalty), 2)

            conn.close()
        except Exception as e:
            logger.error(f"Error reading critic quality stats: {e}")

        return metrics
