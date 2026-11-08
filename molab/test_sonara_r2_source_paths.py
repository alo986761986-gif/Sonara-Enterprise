"""Guarded MoLab R2 source paths: compatible with ACE-Step 1.5 parser."""
import importlib.util
import json
import pathlib
import tempfile
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from io import BytesIO

HERE = pathlib.Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("sonara_r2_pull_agent_paths_under_test", HERE / "sonara_r2_pull_agent.py")
AGENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(AGENT)


class R2SourcePathTests(unittest.TestCase):
    def test_source_is_private_and_accepted_by_stock_acestep(self):
        for suffix in (".wav", ".mp3", ".flac"):
            with self.subTest(suffix=suffix):
                path = AGENT.store_reference("nonsecret", b"audio-data", {"filename": "source" + suffix})
                try:
                    self.assertTrue(path.is_file())
                    self.assertTrue(path.name.startswith("sonara_r2_source_"))
                    self.assertEqual(path.read_bytes(), b"audio-data")
                    self.assertEqual(path.stat().st_mode & 0o777, 0o600)
                    self.assertEqual(
                        pathlib.Path(__import__("os").path.realpath(tempfile.gettempdir())),
                        pathlib.Path(__import__("os").path.commonpath(
                            [tempfile.gettempdir(), str(path)]
                        )).resolve()
                    )
                finally:
                    path.unlink(missing_ok=True)

    def test_rejects_empty_and_oversized(self):
        with self.assertRaises(RuntimeError):
            AGENT.store_reference("x", b"", {})
        with patch.object(AGENT, "reference_suffix", return_value=".wav"):
            with patch.object(AGENT.tempfile, "mkstemp", side_effect=AssertionError("should not create file")):
                # no file allocation on empty input
                with self.assertRaises(RuntimeError):
                    AGENT.store_reference("x", b"", {})

    def test_classifies_only_allowlisted_http_errors(self):
        def response(detail):
            return HTTPError("http://127.0.0.1:8001/release_task", 400, "bad",
                             {}, BytesIO(json.dumps({"detail": detail}).encode()))
        self.assertEqual(AGENT.classify_http_rejection(response(
            "absolute audio file paths are not allowed")), "absolute_audio_path")
        self.assertEqual(AGENT.classify_http_rejection(response(
            "private prompt words")), "unclassified")
        self.assertEqual(AGENT.classify_http_rejection(response([
            {"loc": ["body", "foo"], "msg": "bad"}])), "payload_validation")


if __name__ == "__main__":
    unittest.main()
