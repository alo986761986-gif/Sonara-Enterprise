"""Tests for guarded V6->V10 MoLab recovery without touching a GPU."""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sonara_remix_pro_v10_fresh_handoff as h


class FreshHandoffTests(unittest.TestCase):
    def test_target_file_pins_match_repository(self):
        root = Path(__file__).resolve().parent
        for name, (_, expected) in h.MODULES.items():
            with self.subTest(name=name):
                self.assertEqual(h.blob((root / name).read_bytes()), expected)

    def test_restorer_is_sha_pinned(self):
        root = Path(__file__).resolve().parent
        self.assertEqual(h.blob((root / h.RECOVERY).read_bytes()), h.RECOVERY_SHA)
        self.assertEqual(len(h.COMMIT), 40)

    def test_unknown_file_is_rejected_without_modifying_it(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            with patch.object(h, "ROOT", root):
                with patch.object(h, "MODULES", {"known.py": ("a"*40, "b"*40)}):
                    with patch.object(h, "PRESERVED_V6", {}):
                        p = root / "known.py"
                        p.write_text("unknown")
                        with self.assertRaises(h.Blocked):
                            h.read_modules()
                        self.assertEqual(p.read_text(), "unknown")

    def test_only_entire_old_or_new_state_is_accepted(self):
        with tempfile.TemporaryDirectory() as td:
            root = Path(td)
            (root / "one.py").write_bytes(b"old-one")
            with patch.object(h, "ROOT", root):
                with patch.object(h, "MODULES", {
                    "one.py": (h.blob(b"old-one"), h.blob(b"new-one")),
                    "two.py": (None, h.blob(b"new-two")),
                }):
                    with patch.object(h, "PRESERVED_V6", {}):
                        old, installed = h.read_modules()
                        self.assertFalse(installed)
                        self.assertEqual(old["one.py"], b"old-one")
                        (root / "two.py").write_bytes(b"new-two")
                        with self.assertRaises(h.Blocked):
                            h.read_modules()
                        (root / "one.py").write_bytes(b"new-one")
                        new, installed = h.read_modules()
                        self.assertTrue(installed)
                        self.assertEqual(new["two.py"], b"new-two")


if __name__ == "__main__":
    unittest.main()
