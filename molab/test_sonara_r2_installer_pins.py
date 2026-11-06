"""Offline release gate: installer pin hashes match reviewed source files."""
import hashlib
import pathlib
import unittest
import sonara_r2_install as installer


HERE = pathlib.Path(__file__).resolve().parent


class InstallerPinTests(unittest.TestCase):
    def test_all_sources_are_exactly_pinned(self):
        for name, expected in [
            ("sonara_r2_pull_agent.py", installer.EXPECTED_AGENT_SHA256),
            ("sonara_bpm_verification.py", installer.EXPECTED_BPM_SHA256),
            ("sonara_tempo_evidence.py", installer.EXPECTED_EVIDENCE_SHA256),
        ]:
            with self.subTest(file=name):
                data = (HERE / name).read_bytes()
                self.assertEqual(hashlib.sha256(data).hexdigest(), expected)

    def test_installer_does_not_run_when_imported(self):
        self.assertTrue(callable(installer.main))
        self.assertTrue(callable(installer.reviewed_evidence_source))


if __name__ == "__main__":
    unittest.main()
