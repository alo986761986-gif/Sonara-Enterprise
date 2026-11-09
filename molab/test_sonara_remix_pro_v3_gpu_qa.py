"""Offline regression tests: V3 GPU QA must not infer success without real GPU."""
from __future__ import annotations
import importlib.util
from pathlib import Path
import tempfile
from types import SimpleNamespace
from unittest import TestCase, main
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("sonara_remix_pro_v3_gpu_qa", HERE / "sonara_remix_pro_v3_gpu_qa.py")
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


def args(**changes):
    defaults = dict(
        rights_confirmed=False,
        maintenance_window_confirmed=False,
        source_a="/marimo/not-present-a.wav",
        source_b="/marimo/not-present-b.wav",
        duration=30, bpm_a=120, bpm_b=120,
        prompt="One original A+B composition",
        strength=0.72, noise=0.0, auth_mode="required",
        bass_from="a", key="",
    )
    defaults.update(changes)
    return SimpleNamespace(**defaults)


class V3QASafetyTests(TestCase):
    def test_requires_explicit_rights_and_maintenance(self):
        with self.assertRaisesRegex(qa.V3QAFailure, "rights"):
            qa.check_params(args())
        with self.assertRaisesRegex(qa.V3QAFailure, "maintenance"):
            qa.check_params(args(rights_confirmed=True))
        qa.check_params(args(rights_confirmed=True, maintenance_window_confirmed=True))

    def test_rejects_bad_duration_and_cover_parameters(self):
        base = dict(rights_confirmed=True, maintenance_window_confirmed=True)
        with self.assertRaisesRegex(qa.V3QAFailure, "Duration"):
            qa.check_params(args(duration=31, **base))
        with self.assertRaisesRegex(qa.V3QAFailure, "conditioning"):
            qa.check_params(args(noise=0.31, **base))
        with self.assertRaisesRegex(qa.V3QAFailure, "BPM"):
            qa.check_params(args(bpm_b=250, **base))

    def test_no_implicit_gpu_run(self):
        with patch.object(qa, "run", side_effect=AssertionError("GPU must not be called")):
            self.assertEqual(qa.main([]), 2)
            self.assertEqual(qa.main(["--run"]), 2)

    def test_process_identity_and_closed_missing_proc(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            worker = root / "2718"
            worker.mkdir()
            (worker / "cwd").symlink_to("/marimo/SONARA-REMIX-PRO")
            (worker / "cmdline").write_bytes(
                b"python" + bytes([0])
                + b"/marimo/SONARA-REMIX-PRO/sonara_remix_pro_r2_agent.py"
                + bytes([0])
            )
            with patch.object(qa, "AGENT", Path("/marimo/SONARA-REMIX-PRO/sonara_remix_pro_r2_agent.py")):
                self.assertEqual(qa._active_pro_pids(root), [2718])
            with self.assertRaisesRegex(qa.V3QAFailure, "process"):
                qa._active_pro_pids(root / "not-present")


if __name__ == "__main__":
    main()
