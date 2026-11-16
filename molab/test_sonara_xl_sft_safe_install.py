"""Offline checks for SONARA's checkpoint-only XL SFT installer."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import sonara_xl_sft_safe_install as installer


class SFTInstallerTests(unittest.TestCase):
    def test_missing_shards_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp)
            (p / "config.json").write_text("{}")
            (p / "model.safetensors.index.json").write_text(json.dumps({"weight_map": {
                str(i): f"model-{i:05d}-of-00004.safetensors" for i in range(1, 5)
            }}))
            (p / "modeling_acestep_v15_xl_base.py").write_text("# model")
            (p / "silence_latent.pt").write_bytes(b"ok")
            self.assertFalse(installer.weights_verified(p, minimum=4)[0])
            for i in range(1, 5):
                (p / f"model-{i:05d}-of-00004.safetensors").write_bytes(b"x")
            self.assertTrue(installer.weights_verified(p, minimum=4)[0])

    def test_invalid_shard_names_rejected(self):
        with tempfile.TemporaryDirectory() as temp:
            p = Path(temp)
            (p / "config.json").write_text("{}")
            (p / "model.safetensors.index.json").write_text(json.dumps({"weight_map": {
                str(i): ("../unsafe.safetensors" if i == 1 else f"model-{i:05d}.safetensors")
                for i in range(1, 5)
            }}))
            self.assertFalse(installer.weights_verified(p, minimum=1)[0])

    def test_check_is_read_only(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "checkpoints").mkdir()
            with patch.object(installer, "choose_root", return_value=root), patch.object(
                installer, "health", return_value={}
            ), patch.object(installer, "download_only_new_model") as download:
                self.assertEqual(installer.run(["--check"]), 0)
                download.assert_not_called()


if __name__ == "__main__":
    unittest.main()
