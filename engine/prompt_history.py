"""
Sonara Producer AI V3 - Prompt History
Logs and tracks every prompt generation attempt, optimization step, seed, and quality metric.
"""

import os
import json
import time
from typing import Dict, Any, List, Optional

class PromptHistory:
    """
    Tracks prompt evolution lifecycle across iterative refinement sessions.
    Stores original prompt, optimized prompt, quality score, seed, tempo, genre, and duration.
    """

    HISTORY_FILE = os.path.join(os.path.dirname(__file__), "prompt_history.json")

    def __init__(self, history_file: Optional[str] = None):
        self.history_file = history_file or self.HISTORY_FILE
        self.history_log: List[Dict[str, Any]] = []
        self.load_history()

    def load_history(self) -> None:
        """Loads prompt execution history from JSON file."""
        if os.path.exists(self.history_file):
            try:
                with open(self.history_file, "r", encoding="utf-8") as f:
                    self.history_log = json.load(f)
            except Exception as e:
                print(f"[PromptHistory] Warning reading history file ({e}), initializing empty history.")
                self.history_log = []

    def save_history(self) -> None:
        """Persists history entries to disk."""
        try:
            os.makedirs(os.path.dirname(self.history_file), exist_ok=True)
            with open(self.history_file, "w", encoding="utf-8") as f:
                json.dump(self.history_log, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"[PromptHistory] Failed to write history file: {e}")

    def log_generation(
        self,
        original_prompt: str,
        optimized_prompt: str,
        quality_score: int,
        genre: str,
        seed: int = 42,
        tempo: float = 124.0,
        iteration: int = 1,
        audio_metrics: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Creates and stores a detailed prompt history entry.
        """
        entry = {
            "entry_id": f"hist_{int(time.time() * 1000)}",
            "timestamp": time.strftime("%Y-%m-%d %H:%M:%S"),
            "original_prompt": original_prompt,
            "optimized_prompt": optimized_prompt,
            "quality_score": quality_score,
            "genre": genre,
            "seed": seed,
            "tempo": tempo,
            "iteration": iteration,
            "audio_metrics": audio_metrics or {}
        }
        self.history_log.append(entry)
        self.save_history()
        return entry

    def get_history_by_genre(self, genre: str) -> List[Dict[str, Any]]:
        """Retrieves history entries matching a given genre."""
        return [
            h for h in self.history_log
            if genre.lower() in h.get("genre", "").lower()
        ]

    def get_recent_history(self, limit: int = 20) -> List[Dict[str, Any]]:
        """Returns N most recent history entries."""
        return self.history_log[-limit:]
