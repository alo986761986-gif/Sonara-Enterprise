"""
Sonara Producer AI V4 - Unit Tests for Training Manager & Continuous Training System
"""

import unittest
import os
import shutil
import json
from pathlib import Path
from engine.training_manager import TrainingManager, SUPPORTED_GENRES


class TestTrainingManager(unittest.TestCase):

    def setUp(self):
        self.manager = TrainingManager()

    def test_supported_genres_coverage(self):
        """Verify all required genres are present in SUPPORTED_GENRES."""
        required = [
            "Deep House", "Tech House", "Melodic House", "Melodic Techno",
            "Hard Techno", "Trap", "EDM", "Future Bass"
        ]
        for genre in required:
            self.assertIn(genre, SUPPORTED_GENRES)

    def test_dataset_versioning_and_immutability(self):
        """Test dataset snapshot creation and version_info metadata."""
        v_info = self.manager.create_dataset_version("v_test_suite")
        self.assertEqual(v_info["version_id"], "v_test_suite")
        self.assertTrue(v_info["immutable"])
        self.assertIn("checksum", v_info)
        self.assertIn("genre_breakdown", v_info)

        versions = self.manager.list_dataset_versions()
        v_ids = [v["version_id"] for v in versions]
        self.assertIn("v_test_suite", v_ids)

    def test_dataset_split(self):
        """Test train/val/test automatic split logic."""
        sample_records = [{"id": f"track_{i}", "prompt": f"Prompt {i}"} for i in range(20)]
        train_set, val_set, test_set = self.manager.perform_dataset_split(
            sample_records, train_ratio=0.75, val_ratio=0.15, test_ratio=0.10, seed=42
        )
        self.assertEqual(len(train_set) + len(val_set) + len(test_set), 20)
        self.assertGreater(len(train_set), 0)
        self.assertGreater(len(val_set), 0)
        self.assertGreater(len(test_set), 0)

    def test_lora_training_pipeline_and_artifact_bundle(self):
        """Test queuing, training execution, and verify all 7 required bundle artifacts."""
        job_spec = self.manager.queue_training_job("Deep House", dataset_version="v_test_suite")
        self.assertEqual(job_spec["status"], "QUEUED")

        executed_job = self.manager.execute_training_job(job_spec["job_id"])
        self.assertEqual(executed_job["status"], "COMPLETED")
        self.assertIn("bundle_dir", executed_job)

        bundle_path = Path(executed_job["bundle_dir"])

        # Check all 7 mandatory artifacts:
        # 1. config.json
        self.assertTrue((bundle_path / "config.json").exists())
        # 2. manifest.jsonl
        self.assertTrue((bundle_path / "manifest.jsonl").exists())
        # 3. metadata.csv
        self.assertTrue((bundle_path / "metadata.csv").exists())
        # 4. training.json
        self.assertTrue((bundle_path / "training.json").exists())
        # 5. validation.json
        self.assertTrue((bundle_path / "validation.json").exists())
        # 6. checkpoint/
        self.assertTrue((bundle_path / "checkpoint").is_dir())
        self.assertTrue((bundle_path / "checkpoint" / "adapter_model.bin").exists())
        # 7. logs/
        self.assertTrue((bundle_path / "logs").is_dir())
        self.assertTrue((bundle_path / "logs" / "training.log").exists())

    def test_benchmark_promotion_and_registry(self):
        """Test benchmark calculation, automatic model promotion, and registry query."""
        genre = "Melodic Techno"
        benchmark_res = self.manager.benchmark_lora(genre, lora_score=94.5)
        self.assertIn("improvement_pct", benchmark_res)
        self.assertIn("is_superior", benchmark_res)

        active_model = self.manager.get_active_model_for_genre(genre)
        self.assertIn("model_id", active_model)

    def test_rollback_capability(self):
        """Test model rollback mechanism back to base or previous model."""
        genre = "Deep House"
        rollback_res = self.manager.rollback_model(genre, target_model_id="base")
        self.assertEqual(rollback_res["status"], "ROLLBACK_SUCCESS")
        self.assertEqual(rollback_res["active_model_id"], "base")

        active_now = self.manager.get_active_model_for_genre(genre)
        self.assertEqual(active_now["model_id"], "base")

    def test_research_dashboard_summary(self):
        """Test research dashboard aggregator metrics."""
        summary = self.manager.get_research_dashboard_summary()
        self.assertEqual(summary["status"], "RESEARCH_ENGINE_ACTIVE")
        self.assertIn("supported_genres", summary)
        self.assertIn("active_models_per_genre", summary)


if __name__ == "__main__":
    unittest.main()
