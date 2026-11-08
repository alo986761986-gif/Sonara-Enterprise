"""Fail-closed safety tests for the private, real-audio Remix Pro QA runner."""
import importlib.util
import pathlib
import types
import unittest

PATH = pathlib.Path(__file__).parent / "sonara_remix_pro_live_qa.py"
spec = importlib.util.spec_from_file_location("sonara_remix_pro_live_qa", PATH)
qa = importlib.util.module_from_spec(spec)
spec.loader.exec_module(qa)


class QaSafetyTests(unittest.TestCase):
    def arguments(self, **overrides):
        args = dict(
            rights_confirmed=False, source_a="/marimo/does-not-exist-A.wav",
            source_b="/marimo/does-not-exist-B.wav",
            prompt="Make one coherent remix", duration=30,
            bpm_a=120, bpm_b=120, bass_from="a", auth_mode="required",
            strength=.76, noise=.14, key=""
        )
        args.update(overrides)
        return types.SimpleNamespace(**args)

    def test_refuses_unconfirmed_rights_without_gpu_work(self):
        with self.assertRaisesRegex(qa.LocalQAFailure, "rights-confirmed"):
            qa.run(self.arguments())

    def test_refuses_missing_prompt(self):
        with self.assertRaisesRegex(qa.LocalQAFailure, "original musical remix prompt"):
            qa.run(self.arguments(rights_confirmed=True, prompt=" "))

    def test_refuses_invalid_duration(self):
        with self.assertRaisesRegex(qa.LocalQAFailure, "Duration"):
            qa.run(self.arguments(rights_confirmed=True, duration=481))

    def test_refuses_invalid_bpm(self):
        with self.assertRaisesRegex(qa.LocalQAFailure, "BPM A"):
            qa.run(self.arguments(rights_confirmed=True, bpm_a=240))

    def test_refuses_external_paths(self):
        with self.assertRaises(qa.LocalQAFailure):
            qa.private_wav("/etc/passwd")

    def test_main_fails_closed_without_rights(self):
        code = qa.main([
            "--source-a", "/marimo/does-not-exist-A.wav",
            "--source-b", "/marimo/does-not-exist-B.wav",
            "--prompt", "Create one coherent remix"
        ])
        self.assertEqual(code, 2)


if __name__ == "__main__":
    unittest.main()
