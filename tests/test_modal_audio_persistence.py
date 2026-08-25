"""Regression checks for SONARA's Modal audio-storage topology."""

from __future__ import annotations

import ast
import unittest
from pathlib import Path


DEPLOYMENT_FILE = (
    Path(__file__).resolve().parents[1] / "modal" / "sonara_acestep_professional.py"
)


class ModalAudioPersistenceTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.source = DEPLOYMENT_FILE.read_text(encoding="utf-8")
        cls.tree = ast.parse(cls.source)

    def test_api_temp_directory_is_on_output_volume(self) -> None:
        self.assertIn('API_TMP_DIR = f"{OUTPUTS_DIR}/runtime"', self.source)
        self.assertIn('"ACESTEP_TMPDIR": API_TMP_DIR', self.source)
        self.assertIn("OUTPUTS_DIR: output_volume", self.source)

    def test_in_memory_api_uses_one_authoritative_container(self) -> None:
        self.assertIn("max_containers=1", self.source)
        self.assertNotIn("max_containers=2", self.source)

    def test_web_server_persists_generated_audio(self) -> None:
        function_names = {
            node.name for node in self.tree.body if isinstance(node, ast.FunctionDef)
        }
        self.assertIn("_commit_outputs_forever", function_names)
        self.assertIn("output_volume.commit()", self.source)
        self.assertIn("output_volume.reload()", self.source)

    def test_image_keeps_volume_mount_point_empty(self) -> None:
        self.assertNotIn(
            "mkdir -p /app/checkpoints /app/gradio_outputs/runtime/api_audio",
            self.source,
        )


if __name__ == "__main__":
    unittest.main()
