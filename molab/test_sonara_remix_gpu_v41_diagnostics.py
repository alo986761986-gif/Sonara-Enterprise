"""Offline regression tests for V4.1 safe failure diagnosis; no audio jobs."""
from __future__ import annotations
import ast
import pathlib
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parent

class GPUFailureDiagnosticsTests(unittest.TestCase):
    def test_bridge_recognizes_failed_ace_status_two(self):
        from sonara_remix_pro_ace_bridge import _status
        for value in (2, "2", -1, "failed", "error", "cancelled"):
            self.assertEqual(_status(value), "failed")
        for value in (0, "0", "queued", "processing"):
            self.assertEqual(_status(value), "pending")
        self.assertEqual(_status(1), "complete")

    def test_agent_has_safe_failure_code_for_each_processing_stage(self):
        source = (ROOT / "sonara_remix_pro_r2_agent.py").read_text()
        tree = ast.parse(source)
        value = next(n.value for n in tree.body if
            isinstance(n, ast.Assign) and any(
                isinstance(target, ast.Name) and target.id == "FAILURE_CODES"
                for target in n.targets))
        codes = ast.literal_eval(value)
        expected = {"analysis", "demucs_a", "demucs_b", "fusion_plan",
                    "ace_step", "mastering", "quality_gate", "upload", "completion"}
        self.assertEqual(set(codes), expected)
        self.assertTrue(all(value.startswith("REMIX_") for value in codes.values()))
        self.assertIn('lastFailureStep=failure_step', source)
        self.assertIn('lastFailureCode=code', source)
        self.assertIn('status("waiting_for_authorized_job", lastCompleted=job, lastFailureCode=None)', source)

    def test_previous_error_never_contains_credentials_or_audio(self):
        source = (ROOT / "sonara_remix_pro_r2_agent.py").read_text()
        tree = ast.parse(source)
        function = next(n for n in tree.body if
            isinstance(n, ast.FunctionDef) and n.name == "status")
        labels = {node.id for node in ast.walk(function) if isinstance(node, ast.Name)}
        self.assertNotIn("TOKEN_FILE", labels)
        self.assertNotIn("PRIVATE", labels)
        self.assertIn("FAILURE_CODE_SET", labels)

if __name__ == "__main__":
    unittest.main()
