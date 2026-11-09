"""No-network static tests for immutable SONARA Remix Pro V4 installer."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest
from unittest import mock

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "sonara_remix_quality_v4", HERE / "install_sonara_remix_quality_v4.py"
)
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)


class InstallerV4Tests(unittest.TestCase):
    def test_exact_pinned_files_match_repository(self):
        self.assertEqual(len(installer.EXPECTED), 5)
        self.assertEqual(len(installer.PINNED_COMMIT), 40)
        self.assertIn(installer.PINNED_COMMIT, installer.URL_ROOT)
        for name, expected in installer.EXPECTED.items():
            with self.subTest(name=name):
                data = (HERE / name).read_bytes()
                self.assertEqual(installer.git_blob_sha(data), expected)
                compile(data, name, "exec")

    def test_no_mutable_branch_or_missing_checksums(self):
        self.assertNotIn("/main/", installer.URL_ROOT)
        self.assertNotIn("/feature/", installer.URL_ROOT)
        self.assertNotIn("/fix/", installer.URL_ROOT)
        for digest in installer.EXPECTED.values():
            self.assertEqual(len(digest), 40)
        self.assertNotEqual(installer.git_blob_sha(b"not-a-module"),
                            next(iter(installer.EXPECTED.values())))

    def test_installer_never_targets_main_engine(self):
        self.assertEqual(installer.ROOT.as_posix(), "/marimo/SONARA-REMIX-PRO")
        self.assertEqual(installer.AGENT_LOCK.name, "remix-pro-agent.lock")
        self.assertNotIn("ACE-STEP", str(installer.ROOT))
        with mock.patch.object(installer.sys, "executable", "/usr/bin/python"):
            with mock.patch.object(installer.sys, "argv", ["installer"]):
                with self.assertRaises(RuntimeError):
                    installer.main()


if __name__ == "__main__":
    unittest.main()
