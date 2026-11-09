"""No-network static tests for immutable SONARA Remix Pro V4 installer."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import unittest
import tempfile
from unittest import mock

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location(
    "sonara_remix_quality_v4", HERE / "install_sonara_remix_quality_v4.py"
)
installer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(installer)


class InstallerV4Tests(unittest.TestCase):
    def test_original_v4_immutable_pins_and_later_verified_modules(self):
        self.assertEqual(len(installer.EXPECTED), 5)
        self.assertEqual(len(installer.PINNED_COMMIT), 40)
        self.assertIn(installer.PINNED_COMMIT, installer.URL_ROOT)
        # The V4 installer MUST keep installing its historical, immutable
        # five-file snapshot. It must never silently install a newer QA patch.
        # The separate V4.1/V4.2 handoffs verify their own SHA-pinned files.
        from sonara_remix_pro_gpu_v41_hotfix import BLOBS as V41_BLOBS
        self.assertEqual(len(V41_BLOBS), 2)
        self.assertEqual(V41_BLOBS["sonara_remix_pro_r2_agent.py"][0],
                         installer.EXPECTED["sonara_remix_pro_r2_agent.py"])
        self.assertEqual(installer.EXPECTED["sonara_remix_pro_quality.py"],
                         "496428a8af25492246f49d5bf25d281781d17315")
        released_updates = {
            "sonara_remix_pro_r2_agent.py":
                "a394d33fcac721246f6821dd62f3a9b529435d01",
            "sonara_remix_pro_quality.py":
                "d31e42a4ba52e15fee08436f997f95b0b7561054",
        }
        for name, pinned in installer.EXPECTED.items():
            with self.subTest(name=name):
                data = (HERE / name).read_bytes()
                self.assertEqual(installer.git_blob_sha(data),
                                 released_updates.get(
                                     name, V41_BLOBS[name][1] if name in V41_BLOBS
                                     else pinned))
                compile(data, name, "exec")

    def test_live_agent_is_detected_without_relying_on_lock(self):
        with tempfile.TemporaryDirectory() as d:
            proc = Path(d)
            valid = proc / "2019"
            valid.mkdir()
            (valid / "cmdline").write_bytes(
                b"python" + bytes([0]) + b"/marimo/SONARA-REMIX-PRO/sonara_remix_pro_r2_agent.py" + bytes([0])
            )
            (valid / "cwd").symlink_to(Path("/marimo/SONARA-REMIX-PRO"))
            other = proc / "2020"
            other.mkdir()
            (other / "cmdline").write_bytes(b"python" + bytes([0]) + b"/some/other_script.py" + bytes([0]))
            (other / "cwd").symlink_to(Path("/tmp"))
            with mock.patch.object(installer, "ROOT", Path("/marimo/SONARA-REMIX-PRO")):
                self.assertEqual(installer.active_pro_agent_pids(proc), [2019])

    def test_missing_proctable_blocks_install_preflight(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaisesRegex(RuntimeError, "Cannot inspect"):
                installer.active_pro_agent_pids(Path(d) / "missing")

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
