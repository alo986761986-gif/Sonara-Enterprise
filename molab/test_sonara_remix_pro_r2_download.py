"""Regression for real Remix Pro R2 range streaming; no customer audio or network calls."""
import ast
import io
import pathlib
import re
import tempfile
import time
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parent
AGENT = ROOT / "sonara_remix_pro_r2_agent.py"


class FakeResponse:
    def __init__(self, data, start, end, total, *, status=206, corrupt=None, truncated=False):
        self.status = status
        self.headers = {"Content-Range": corrupt if corrupt is not None else
                        f"bytes {start}-{end}/{total}"}
        self.data = data[start:end + 1]
        if truncated:
            self.data = self.data[:-1]
    def __enter__(self):
        return self
    def __exit__(self, *args):
        return False
    def read(self, length):
        return self.data[:length]


class FakeClient:
    def __init__(self, audio, *, fail_once=False, forbid=False, corrupt=False, truncated=False):
        self.audio = audio
        self.fail_once = fail_once
        self.forbid = forbid
        self.corrupt = corrupt
        self.truncated = truncated
        self.calls = []
    def open(self, request, timeout=0):
        self.calls.append(request.get_header("Range"))
        if self.forbid:
            raise urllib.error.HTTPError(request.full_url, 403, "Forbidden", {}, io.BytesIO())
        if self.fail_once:
            self.fail_once = False
            raise urllib.error.URLError("temporary network interruption")
        match = re.fullmatch(r"bytes=(\d+)-(\d+)", request.get_header("Range") or "")
        if not match:
            raise AssertionError("Missing explicit range")
        start, desired_end = map(int, match.groups())
        end = min(desired_end, len(self.audio) - 1)
        return FakeResponse(self.audio, start, end, len(self.audio),
                            corrupt="incorrect" if self.corrupt else None,
                            truncated=self.truncated)


def agent_functions(client, *, chunk_bytes=31):
    tree = ast.parse(AGENT.read_text())
    wanted_funcs = {"download_source", "_source_http_error"}
    wanted_classes = {"ProAgentError", "SourceTransferError"}
    chosen = [node for node in tree.body
              if (isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and
                  node.name in wanted_funcs) or
                 (isinstance(node, ast.ClassDef) and node.name in wanted_classes)]
    assert len(chosen) == 4
    scope = {
        "Path": pathlib.Path, "re": re, "urllib": urllib, "time": time,
        "SOURCE_FORMATS": frozenset(("wav", "mp3")), "MAX_WAV_BYTES": 512*1024*1024,
        "_SOURCE_RANGE_BYTES": chunk_bytes, "_SOURCE_RETRIES": 3,
        "_SOURCE_HTTP_ERRORS": frozenset((401,403,404,409,429,500,502,503,504)),
        "_SOURCE_RETRY_HTTP": frozenset((429,500,502,503,504)),
        "CLIENT": client, "BASE": "https://api.sonaraenterprise.com/api/sonara-relay",
        "token_headers": lambda: {"X-Sonara-Relay-Token": "test-only-key"},
        "verify_audio_source": lambda path, fmt: pathlib.Path(path),
    }
    with patch("time.sleep", return_value=None):
        exec(compile(ast.Module(body=chosen, type_ignores=[]),
                     str(AGENT), "exec"), scope)
    return scope


class RealR2RangeTests(unittest.TestCase):
    def test_streams_multiple_validated_ranges_without_overlaps(self):
        data = b"RIFF" + b"0"*4 + b"WAVE" + b"Z"*90
        client = FakeClient(data)
        f = agent_functions(client)
        with tempfile.TemporaryDirectory() as name:
            with patch("time.sleep", return_value=None):
                path = f["download_source"]("srpro_test", "lease", "a", "source-a",
                                            pathlib.Path(name))
            self.assertEqual(path.read_bytes(), data)
        self.assertEqual(client.calls, ["bytes=0-30","bytes=31-61",
                                        "bytes=62-92","bytes=93-123"])

    def test_one_transient_connection_error_retries_same_range(self):
        data = b"RIFF" + b"0"*4 + b"WAVE" + b"Z"*35
        client = FakeClient(data, fail_once=True)
        f = agent_functions(client, chunk_bytes=1024)
        with tempfile.TemporaryDirectory() as name:
            with patch("time.sleep", return_value=None):
                path = f["download_source"]("srpro_test", "lease", "a", "source-a",
                                            pathlib.Path(name))
            self.assertEqual(path.read_bytes(), data)
        self.assertEqual(client.calls, ["bytes=0-1023","bytes=0-1023"])

    def test_permission_failure_has_safe_code_and_no_partial_file(self):
        client = FakeClient(b"Z"*100, forbid=True)
        f = agent_functions(client)
        with tempfile.TemporaryDirectory() as name:
            folder = pathlib.Path(name)
            with self.assertRaises(f["SourceTransferError"]) as caught:
                f["download_source"]("srpro_test", "lease", "b", "source-b", folder)
            self.assertEqual(caught.exception.code, "SOURCE_HTTP_403")
            self.assertEqual(list(folder.iterdir()), [])
        self.assertEqual(len(client.calls), 1)

    def test_corrupted_range_is_rejected_with_no_audio_artifact(self):
        client = FakeClient(b"Z"*100, corrupt=True)
        f = agent_functions(client)
        with tempfile.TemporaryDirectory() as name:
            folder = pathlib.Path(name)
            with self.assertRaises(f["SourceTransferError"]) as caught:
                f["download_source"]("srpro_test", "lease", "a", "source-a", folder)
            self.assertEqual(caught.exception.code, "SOURCE_TRANSFER_INVALID")
            self.assertEqual(list(folder.iterdir()), [])

    def test_repeated_truncated_responses_reject_without_audio(self):
        client = FakeClient(b"Z"*100, truncated=True)
        f = agent_functions(client)
        with tempfile.TemporaryDirectory() as name:
            folder = pathlib.Path(name)
            with patch("time.sleep", return_value=None):
                with self.assertRaises(f["SourceTransferError"]) as caught:
                    f["download_source"]("srpro_test", "lease", "a", "source-a", folder)
            self.assertEqual(caught.exception.code, "SOURCE_NETWORK_ERROR")
            self.assertEqual(list(folder.iterdir()), [])
        self.assertEqual(len(client.calls), 3)


if __name__ == "__main__":
    unittest.main()
