"""Offline regression for isolated V4.2 quality update: no real jobs."""
from __future__ import annotations
import ast
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
FILE = ROOT / "sonara_remix_pro_gpu_v42_quality_hotfix.py"
spec = importlib.util.spec_from_file_location("sonara_v42_guard", FILE)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


class V42HandoffTests(unittest.TestCase):
    def test_pinned_files_are_exact_known_revisions(self):
        self.assertEqual(guard.PINNED_COMMIT,
                         "e30179d261de88ddf7d75fb7f31803530b0d0e7f")
        self.assertEqual(guard.BLOBS, {
            "sonara_remix_pro_r2_agent.py": (
                "b982eda6e1f4c81ed99075478853e98276ccd718",
                "c0e5392a458139bda3d1d3b7297e5b2cb0085dfb"),
            "sonara_remix_pro_quality.py": (
                "496428a8af25492246f49d5bf25d281781d17315",
                "d31e42a4ba52e15fee08436f997f95b0b7561054"),
        })
        # Keep the V4.2 installer pinned and immutable, while the repository
        # may contain the later V5 dedicated agent. V5 has independent SHA tests.
        for name, (_, current_sha) in guard.BLOBS.items():
            released_sha = (
                "a394d33fcac721246f6821dd62f3a9b529435d01"
                if name == "sonara_remix_pro_r2_agent.py" else current_sha
            )
            self.assertEqual(guard.git_blob((ROOT / name).read_bytes()),
                             released_sha)
        self.assertEqual(guard.REVISION,
                         "sonara-remix-pro-r2-agent-v3-dual-reference-fusion")

    def test_unknown_worker_changes_refuse_stop_or_download(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / ".venv/bin").mkdir(parents=True)
            (root / ".venv/bin/python").write_text("")
            for file in ("sonara_remix_pro_r2_agent.py",
                         "sonara_remix_pro_ace_bridge.py",
                         "sonara_remix_pro_quality.py"):
                (root / file).write_text("unrecognized private edits")
            with (patch.object(guard, "ROOT", root),
                  patch.object(guard, "PYTHON", Path(__import__("sys").executable)),
                  patch.object(guard, "AGENT", root / "sonara_remix_pro_r2_agent.py"),
                  patch.object(guard, "BRIDGE", root / "sonara_remix_pro_ace_bridge.py"),
                  patch.object(guard, "workers", return_value=[321]),
                  patch.object(guard, "idle", return_value=True),
                  patch.object(guard, "mode_for", return_value="none"),
                  patch.object(guard, "download_verified",
                               side_effect=AssertionError("never download")),
                  patch.object(guard.os, "kill",
                               side_effect=AssertionError("never stop"))):
                with self.assertRaisesRegex(guard.Blocked, "Unexpected local change"):
                    guard.activate()

    def test_no_main_engine_or_unsafe_background_operations(self):
        code = FILE.read_text()
        ast.parse(code)
        self.assertNotIn("SIGKILL", code)
        self.assertIn("args.confirm_maintenance and args.skip_audio_qa", code)
        self.assertIn("PRO_JOBS_CLAIMED=0", code)
        self.assertIn("git_blob(raw) == expected", code)
        self.assertIn("if not idle():", code)
        self.assertNotIn("/marimo/SONARA-ACE-Step", code)


if __name__ == "__main__":
    unittest.main()
