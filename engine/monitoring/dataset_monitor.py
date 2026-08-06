import logging
from typing import Dict, Any
from engine.dataset_expansion.statistics_engine import StatisticsEngine

logger = logging.getLogger("DatasetMonitor")

class DatasetMonitor:
    """
    Monitors dataset structure, growth, and music category representation.
    Leverages StatisticsEngine to compute comprehensive database stats.
    """

    def __init__(self, db_path: str = "dataset.db"):
        self.stats_engine = StatisticsEngine(db_path=db_path)

    def check_dataset_metrics(self) -> Dict[str, Any]:
        """Gathers overall dataset structure and distributions."""
        try:
            stats = self.stats_engine.get_comprehensive_statistics()
            
            # Format and enrich with metadata-specific monitor variables
            total_tracks = stats.get("total_tracks", 0)
            total_hours = stats.get("total_hours", 0.0)
            
            # Calculate near duplicates rate
            dups = stats.get("duplicates_detected", 0)
            dup_rate = round((dups / max(1, total_tracks + dups)) * 100.0, 2)

            return {
                "total_tracks": total_tracks,
                "total_duration_hours": total_hours,
                "hours_by_genre": stats.get("hours_by_genre", {}),
                "averages": stats.get("averages", {}),
                "duplicates_count": dups,
                "duplicate_rate_pct": dup_rate,
                "bpm_distribution": stats.get("bpm_distribution", {}),
                "key_distribution": stats.get("key_distribution", {}),
                "mood_distribution": stats.get("mood_distribution", {})
            }
        except Exception as e:
            logger.error(f"Error querying dataset monitor metrics: {e}")
            return {
                "total_tracks": 0,
                "total_duration_hours": 0.0,
                "hours_by_genre": {},
                "averages": {},
                "duplicates_count": 0,
                "duplicate_rate_pct": 0.0,
                "bpm_distribution": {},
                "key_distribution": {},
                "mood_distribution": {}
            }
