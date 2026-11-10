"""Offline safety regression for the guarded V6 GPU handoff."""
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("sonara_v6_handoff",
                                               HERE / "sonara_remix_pro_gpu_v6_handoff.py")
guard = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(guard)


class V6HandoffSafety(unittest.TestCase):
    def test_git_pins_and_isolated_paths(self):
        self.assertEqual(len(guard.PINNED_COMMIT), 40)
        self.assertEqual(set(guard.BLOBS),
                         {"sonara_remix_pro_r2_agent.py",
                          "sonara_remix_pro_v5.py","sonara_remix_pro_v6.py",
                          "sonara_remix_pro_fusion.py"})
        for name, sha in guard.BLOBS.items():
            self.assertEqual(len(sha), 40)
            self.assertEqual(guard.git_blob((HERE / name).read_bytes()), sha)
        self.assertNotIn("ACE-Step", str(guard.ROOT))
        self.assertNotIn("SIGKILL", (HERE / "sonara_remix_pro_gpu_v6_handoff.py").read_text())

    def test_default_is_read_only(self):
        with patch.object(guard, "activate", side_effect=AssertionError("unsafe install")):
            guard.main([])
            guard.main(["--activate"])
            guard.main(["--confirm-maintenance"])

    def test_unknown_module_cannot_be_updated(self):
        with patch.object(guard, "ROOT", Path("/not-an-existing-molab-private-env")):
            with self.assertRaises((guard.Blocked, OSError)):
                guard.verify_current_files()


if __name__=="__main__":
    unittest.main()
