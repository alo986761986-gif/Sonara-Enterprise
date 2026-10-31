import tempfile
import unittest
from pathlib import Path

from sonara_professional_stage import sha256, stage_agent


HEADER = b'"""MoLab-only ACE-Step relay. Outbound HTTPS/443; private files, no test songs.\n"""\n'


class AgentStagingTests(unittest.TestCase):
    def test_staging_preserves_original_and_copies_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            current = root / "current.py"
            candidate = root / "candidate.py"
            current.write_bytes(HEADER + b"CURRENT = True\n")
            candidate.write_bytes(HEADER + b"CANDIDATE = True\n")
            original = current.read_bytes()
            report = stage_agent(current, candidate, root / "staging")
            self.assertTrue(report["active_agent_unchanged"])
            self.assertFalse(report["restarted"])
            self.assertEqual(current.read_bytes(), original)
            self.assertEqual(sha256(Path(report["backup_file"])), sha256(current))
            self.assertEqual(sha256(Path(report["staged_file"])), sha256(candidate))

    def test_invalid_python_refused_without_backup(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            current = root / "current.py"
            candidate = root / "candidate.py"
            current.write_bytes(HEADER + b"CURRENT = True\n")
            candidate.write_bytes(HEADER + b"if (\n")
            stage = root / "staging"
            with self.assertRaises(Exception):
                stage_agent(current, candidate, stage)
            self.assertFalse(stage.exists())

    def test_active_agent_cannot_be_staged_as_its_own_candidate(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            current = root / "current.py"
            current.write_bytes(HEADER + b"CURRENT = True\n")
            with self.assertRaises(ValueError):
                stage_agent(current, current, root / "staging")


if __name__ == "__main__":
    unittest.main()
