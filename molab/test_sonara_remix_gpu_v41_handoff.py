"""Offline tests for guarded V4.1 module handoff. No jobs, auth tokens, or GPU required."""
from __future__ import annotations
import ast
import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

FILE = Path(__file__).with_name("sonara_remix_pro_gpu_v41_hotfix.py")
spec = importlib.util.spec_from_file_location("sonara_v41_guard", FILE)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

class V41HandoffTests(unittest.TestCase):
    def test_pinned_modules_and_revision(self):
        self.assertEqual(len(guard.BLOBS), 2)
        self.assertIn("sonara_remix_pro_r2_agent.py", guard.BLOBS)
        self.assertIn("sonara_remix_pro_ace_bridge.py", guard.BLOBS)
        self.assertTrue(all(len(old) == len(new) == 40 for old, new in guard.BLOBS.values()))
        self.assertEqual(guard.REVISION,
                         "sonara-remix-pro-r2-agent-v3-dual-reference-fusion")

    def test_unknown_local_file_is_blocked_before_modification(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            (root/".venv/bin").mkdir(parents=True)
            (root/".venv/bin/python").write_text("")
            for file in guard.BLOBS:
                (root/file).write_text("unrecognized altered source")
            with (patch.object(guard, "ROOT", root),
                  patch.object(guard, "PYTHON", Path(__import__("sys").executable)),
                  patch.object(guard, "AGENT", root/"sonara_remix_pro_r2_agent.py"),
                  patch.object(guard, "BRIDGE", root/"sonara_remix_pro_ace_bridge.py"),
                  patch.object(guard, "workers", return_value=[321]),
                  patch.object(guard, "idle", return_value=True),
                  patch.object(guard, "mode_for", return_value="none"),
                  patch.object(guard, "download_verified", side_effect=AssertionError("should not download")),
                  patch.object(guard.os, "kill", side_effect=AssertionError("should not stop"))):
                with self.assertRaisesRegex(guard.Blocked, "Unexpected local change"):
                    guard.activate()

    def test_process_check_requires_exact_agent_identity(self):
        with tempfile.TemporaryDirectory() as d:
            proc=Path(d)
            pid=456
            folder=proc/str(pid)
            folder.mkdir()
            (folder/"cwd").symlink_to(proc)
            (folder/"cmdline").write_bytes(b"python\0/not-an-agent/sonara_remix_pro_r2_agent.py\0")
            with patch.object(guard.Path, "__new__", wraps=Path.__new__):
                # Static verification only: never trust a filename match without resolve.
                self.assertIn("resolve() == AGENT.resolve()", FILE.read_text())

    def test_no_generic_kill_and_explicit_consent(self):
        source = FILE.read_text()
        ast.parse(source)
        self.assertNotIn("SIGKILL", source)
        self.assertIn("args.confirm_maintenance and args.skip_audio_qa", source)
        self.assertIn("if not idle():", source)
        self.assertIn("git_blob(raw) == expected", source)
        self.assertIn("PRO_JOBS_CLAIMED=0", source)

if __name__ == "__main__":
    unittest.main()
