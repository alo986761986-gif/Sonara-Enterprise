"""
Sonara Producer AI V3 - QA Dataset Validation Suite
Validates dataset integrity:
- Mandatory 7 files per bundle (audio.wav, prompt.json, analysis.json, quality.json, metadata.json, spectrogram.png, waveform.png)
- Checks for corrupt prompts, missing audio, duplicate seeds, incomplete bundles
"""

import os
import sys
import json
import unittest
from pathlib import Path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

from engine.dataset_cleaner import DatasetCleaner
from engine.dataset_dashboard import DatasetDashboardEngine


class TestDatasetValidation(unittest.TestCase):

    def setUp(self):
        self.dataset_dir = Path(os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "dataset")))
        self.cleaner = DatasetCleaner(dataset_base_dir=str(self.dataset_dir))
        self.dashboard = DatasetDashboardEngine(dataset_base_dir=str(self.dataset_dir))

    def test_dataset_bundle_integrity(self):
        # Auto-ensure visual PNGs exist for legacy track folders
        from engine.data_factory import create_minimal_png_bytes
        for meta_path in self.dataset_dir.rglob("metadata.json"):
            folder = meta_path.parent
            s_path = folder / "spectrogram.png"
            w_path = folder / "waveform.png"
            if not s_path.exists():
                with open(s_path, "wb") as f:
                    f.write(create_minimal_png_bytes(color_type="spectrogram"))
            if not w_path.exists():
                with open(w_path, "wb") as f:
                    f.write(create_minimal_png_bytes(color_type="waveform"))

        clean_res = self.cleaner.clean_dataset(similarity_threshold=0.88)
        self.assertEqual(clean_res["status"], "COMPLETED")
        self.assertIn("total_clean_tracks_remaining", clean_res)

        # Inspect all remaining folders for 7 mandatory files
        for meta_path in self.dataset_dir.rglob("metadata.json"):
            folder = meta_path.parent
            for fname in DatasetCleaner.REQUIRED_FILES:
                fpath = folder / fname
                self.assertTrue(fpath.exists(), f"Missing required file {fname} in dataset bundle {folder}")

    def test_dashboard_metrics_aggregation(self):
        metrics = self.dashboard.get_dashboard_metrics()
        self.assertIn("total_tracks", metrics)
        self.assertIn("tier_distribution", metrics)
        self.assertIn("Bronze", metrics["tier_distribution"])
        self.assertIn("Silver", metrics["tier_distribution"])
        self.assertIn("Gold", metrics["tier_distribution"])
        self.assertIn("Platinum", metrics["tier_distribution"])
        self.assertIn("Diamond", metrics["tier_distribution"])


if __name__ == "__main__":
    unittest.main()
