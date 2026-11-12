"""V9 maintenance safety: SHA-pin audit, no job, no process termination."""
from __future__ import annotations

import importlib.util
import subprocess
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("sonara_v9_installer",
                                              ROOT / "sonara_remix_pro_v9_private_install.py")
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class V9PrivateInstallerSafety(unittest.TestCase):
    def test_all_modules_sha_pinned_to_unique_reviewed_snapshot(self):
        self.assertEqual(len(installer.COMMIT), 40)
        self.assertNotIn("/main/", installer.BASE)
        self.assertEqual(len(installer.FILES), 5)
        self.assertIsNone(installer.FILES["sonara_remix_pro_music_director.py"][0])
        for name, (before, after) in installer.FILES.items():
            self.assertEqual(len(after), 40)
            item = subprocess.run(
                ["git", "show", f"{installer.COMMIT}:molab/{name}"],
                cwd=ROOT.parent, capture_output=True, check=False)
            self.assertEqual(item.returncode, 0)
            self.assertEqual(installer.digest(item.stdout), after)

    def test_read_only_default_and_preserved_private_worker(self):
        code = (ROOT / "sonara_remix_pro_v9_private_install.py").read_text()
        self.assertIn("if not activate:", code)
        self.assertIn("two_idle_heartbeats(pid)", code)
        self.assertIn("if not idle(pid)", code)
        self.assertIn("v9MusicDirectorReady", code)
        self.assertNotIn("SIGKILL", code)
        self.assertNotIn("sonara_generated_audio", code)
        self.assertEqual(installer.ROOT, Path("/marimo/SONARA-REMIX-PRO"))


if __name__ == "__main__":
    unittest.main()
