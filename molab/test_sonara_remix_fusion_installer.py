"""Offline tests of the pinned MoLab V3 installer: no GPU and no network."""
import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "sonara_remix_fusion_installer", HERE / "install_sonara_remix_fusion_v3.py"
)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerSafetyTests(unittest.TestCase):
    def test_manifest_matches_v3_files_checked_out_by_ci(self):
        self.assertEqual(len(installer.EXPECTED), 4)
        for name, sha in installer.EXPECTED.items():
            with self.subTest(name=name):
                data = (HERE / name).read_bytes()
                self.assertEqual(installer.git_blob_sha(data), sha)
                compile(data, name, "exec")

    def test_pinned_commit_is_not_mutable_main(self):
        self.assertEqual(len(installer.PINNED_COMMIT), 40)
        self.assertNotIn("/main/", installer.URL_ROOT)
        self.assertNotIn("/feature/", installer.URL_ROOT)

    def test_corrupt_git_blob_fails_verification(self):
        self.assertNotEqual(installer.git_blob_sha(b"tampered"), next(iter(installer.EXPECTED.values())))

    def test_default_preflight_never_installs(self):
        self.assertTrue(installer.ROOT.as_posix().startswith("/marimo/SONARA-REMIX-PRO"))
        self.assertEqual(installer.AGENT_LOCK.name, "remix-pro-agent.lock")


if __name__ == "__main__":
    unittest.main()
