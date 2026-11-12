"""Quality rejection classification contract without GPU, network or customer jobs."""
from __future__ import annotations
import ast
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parent
AGENT = ROOT / "sonara_remix_pro_r2_agent.py"


def functions_under_test():
    module = ast.parse(AGENT.read_text(encoding="utf-8"))
    names = {"safe_quality_codes", "safe_failure_exception_class",
             "classify_failure_code"}
    classes = {"ProAgentError", "SourceTransferError"}
    selected = [
        node for node in module.body
        if (isinstance(node, ast.FunctionDef) and node.name in names)
        or (isinstance(node, ast.ClassDef) and node.name in classes)
    ]
    assert len(selected) == 5
    ns = {"FAILURE_CODES": {
        "quality_gate": "REMIX_AUDIO_QUALITY_REJECTED",
        "mastering": "REMIX_MASTERING_FAILED"
    }, "QUALITY_REASON_CODES": {
        "master-true-peak-too-high", "master-too-quiet",
        "explosive-unwanted-rhythmic-break"
    }, "SAFE_FAILURE_EXCEPTION_CLASSES": {
        "RuntimeError", "V5QualityRejected", "OtherException"
    }}
    exec(compile(ast.Module(body=selected, type_ignores=[]),
                 str(AGENT), "exec"), ns)
    return ns


class QualityFailureClassificationTests(unittest.TestCase):
    def test_qc_exception_is_not_fake_audio_rejection(self):
        funcs = functions_under_test()
        code = funcs["classify_failure_code"](
            RuntimeError("internal error"), step="quality_gate",
            phase="processing", quality_codes=[])
        self.assertEqual(code, "REMIX_PROCESSING_ERROR")

    def test_measured_rejection_preserves_audio_rejection(self):
        funcs = functions_under_test()
        code = funcs["classify_failure_code"](
            RuntimeError("failed"), step="quality_gate", phase="processing",
            quality_codes=["explosive-unwanted-rhythmic-break"])
        self.assertEqual(code, "REMIX_AUDIO_QUALITY_REJECTED")

    def test_original_error_codes_unchanged_outside_quality_gate(self):
        funcs = functions_under_test()
        self.assertEqual(funcs["classify_failure_code"](
            RuntimeError("failed"), step="mastering",
            phase="processing", quality_codes=[]),
            "REMIX_MASTERING_FAILED")
        self.assertEqual(funcs["classify_failure_code"](
            RuntimeError("failed"), step="quality_gate",
            phase="normalize_a", quality_codes=[]),
            "SOURCE_DECODER_FAILED")

    def test_user_exception_message_never_persisted_as_class(self):
        funcs = functions_under_test()
        class SecretMessage(RuntimeError):
            pass
        self.assertEqual(funcs["safe_failure_exception_class"](
            SecretMessage("private data")), "OtherException")


if __name__ == "__main__":
    unittest.main()
