"""Offline V5 deployment guard tests. No GPU, jobs, Cloudflare or network."""
from __future__ import annotations
import ast
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
FILE = ROOT / "sonara_remix_pro_gpu_v5_handoff.py"
spec = importlib.util.spec_from_file_location("sonara_v5_guard", FILE)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class V5GuardTests(unittest.TestCase):
    def test_pinned_sources_match_current_verified_content(self):
        self.assertEqual(guard.PINNED_COMMIT, "2a0a8c53bb2f1bc29ea761648b84326a97b8ec11")
        self.assertEqual(guard.BLOBS["sonara_remix_pro_r2_agent.py"][0],
                         "c0e5392a458139bda3d1d3b7297e5b2cb0085dfb")
        self.assertIsNone(guard.BLOBS["sonara_remix_pro_v5.py"][0])
        # Historical handoff stays SHA-pinned. Repository files can evolve
        # under the separate opt-in V6 release; never mutate V5 installer pins.
        current_release = {
            "sonara_remix_pro_r2_agent.py": "49d538e3b1159f3d6a463903aedce62372fe5862",
            "sonara_remix_pro_v5.py": "e937601430b302380f10be2f45e36e88973416b6",
        }
        for name, (_, new_sha) in guard.BLOBS.items():
            self.assertEqual(len(new_sha), 40)
            self.assertEqual(guard.git_blob((ROOT / name).read_bytes()),
                             current_release.get(name, new_sha))

    def test_restore_removes_new_module_when_missing_before_install(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            new_module = root / "sonara_remix_pro_v5.py"
            new_module.write_text("new file")
            with patch.object(guard, "ROOT", root), patch.object(guard, "workers", return_value=[1]):
                guard.restore({"sonara_remix_pro_v5.py": None}, "required")
            self.assertFalse(new_module.exists())

    def test_unrecognized_code_is_rejected_before_shutdown(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / ".venv/bin").mkdir(parents=True)
            (root / ".venv/bin/python").write_text("")
            (root / "sonara_remix_pro_r2_agent.py").write_text("altered")
            (root / "sonara_remix_pro_ace_bridge.py").write_text("keep")
            (root / "sonara_remix_pro_quality.py").write_text("keep")
            with (patch.object(guard, "ROOT", root),
                  patch.object(guard, "PYTHON", Path(__import__("sys").executable)),
                  patch.object(guard, "AGENT", root / "sonara_remix_pro_r2_agent.py"),
                  patch.object(guard, "BRIDGE", root / "sonara_remix_pro_ace_bridge.py"),
                  patch.object(guard, "workers", return_value=[88]),
                  patch.object(guard, "idle", return_value=True),
                  patch.object(guard, "mode_for", return_value="required"),
                  patch.object(guard, "download_verified", side_effect=AssertionError("network unexpected")),
                  patch.object(guard.os, "kill", side_effect=AssertionError("unsafe shutdown"))):
                with self.assertRaisesRegex(guard.Blocked, "Unexpected local change"):
                    guard.activate()

    def test_security_guards_present(self):
        src = FILE.read_text()
        ast.parse(src)
        self.assertNotIn("SIGKILL", src)
        self.assertIn("PRO_V5_AVAILABLE=True", src)
        self.assertIn("PRO_JOBS_CLAIMED=0", src)
        self.assertIn("if not idle():", src)
        self.assertIn("args.confirm_maintenance and args.skip_audio_qa", src)
        self.assertNotIn("/marimo/SONARA-ACE-Step", src)


if __name__ == "__main__":
    unittest.main()
