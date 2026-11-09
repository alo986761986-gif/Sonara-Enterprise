"""Unit tests of the ACE-Step bridge with mocked loopback — zero paid/inference tasks."""
from __future__ import annotations
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from sonara_remix_pro_ace_bridge import ACEBridgeError, _headers, _result_path, render, render_long_remix


def wav_source(path, seconds=10):
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(22050)
        wav.writeframes(b"\x00\x00" * seconds * 22050)


class ACEBridgeTests(unittest.TestCase):
    def test_one_real_cover_job_without_network_and_preserved_source(self):
        with tempfile.TemporaryDirectory() as d:
            input_wav = Path(d) / "source.wav"
            output_wav = Path(d) / "result.wav"
            wav_source(input_wav)
            original = input_wav.read_bytes()
            calls = []
            def fake_request(path, data=None, **kwargs):
                calls.append((path,data,kwargs))
                if path == "/release_task":
                    self.assertEqual(data["task_type"], "cover")
                    self.assertEqual(data["audio_cover_strength"], .72)
                    self.assertEqual(data["batch_size"], 1)
                    self.assertEqual(data["audio_duration"], 10)
                    self.assertTrue(Path(data["src_audio_path"]).is_file())
                    return {"data":{"task_id":"test-task-id"}}
                if path == "/query_result":
                    self.assertEqual(data["task_id_list"],["test-task-id"])
                    return {"data":[{"status":1, "result":[{"audio_path": "/tmp/ace_output.wav"}]}]}
                if path.startswith("/v1/audio?path="):
                    return original
                raise AssertionError("unexpected local request")
            with patch("sonara_remix_pro_ace_bridge._request", side_effect=fake_request):
                result = render(input_wav,output_wav,"Preserve hook, better drums",mode="none")
            self.assertEqual(result["status"],"completed")
            self.assertTrue(result["noFakeAudio"])
            self.assertEqual(output_wav.read_bytes(),original)
            self.assertEqual(input_wav.read_bytes(),original)
            self.assertEqual(len([p for p,_,_ in calls if p == "/release_task"]),1)
            self.assertEqual(len(calls),3)
            with self.assertRaises(ACEBridgeError):
                render(input_wav,output_wav,"No overwrites",mode="none")


    def test_dual_reference_uses_distinct_trusted_temporary_files(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            a, b, output = root/"a.wav", root/"b.wav", root/"created.wav"
            wav_source(a, seconds=10)
            wav_source(b, seconds=10)
            calls = []
            def fake_request(path, data=None, **kwargs):
                calls.append(path)
                if path == "/release_task":
                    self.assertEqual(data["task_type"], "cover")
                    source = Path(data["src_audio_path"])
                    reference = Path(data["reference_audio_path"])
                    self.assertNotEqual(source, reference)
                    self.assertEqual(source.parent, Path(tempfile.gettempdir()))
                    self.assertEqual(reference.parent, Path(tempfile.gettempdir()))
                    self.assertEqual(source.read_bytes(), a.read_bytes())
                    self.assertEqual(reference.read_bytes(), b.read_bytes())
                    self.assertEqual(source.stat().st_mode & 0o777, 0o600)
                    self.assertEqual(reference.stat().st_mode & 0o777, 0o600)
                    self.assertTrue(source.is_file())
                    self.assertTrue(reference.is_file())
                    self.temp_source, self.temp_reference = source, reference
                    return {"data":{"task_id":"mock-dual-reference"}}
                if path == "/query_result":
                    return {"data":[{"status":1,"result":[{"audio_path":"/tmp/ace_dual.wav"}]}]}
                if path.startswith("/v1/audio?"):
                    return a.read_bytes()
                raise AssertionError(path)
            with patch("sonara_remix_pro_ace_bridge._request", side_effect=fake_request):
                result = render(a, output, "Generate one new musical fusion",
                                mode="none", reference_audio_path=b)
            self.assertEqual(result["status"], "completed")
            self.assertEqual(calls.count("/release_task"), 1)
            self.assertEqual(a.read_bytes(), output.read_bytes())
            self.assertFalse(self.temp_source.exists())
            self.assertFalse(self.temp_reference.exists())
            self.assertTrue(b.is_file())

    def test_long_form_multiple_real_sections_become_one_exact_length_wav(self):
        import soundfile as sf
        import numpy as np
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            src, dst = root / "original-ab.wav", root / "one-remix.wav"
            sr = 22050
            # Synthetic unit fixture: an actual production job must invoke ACE-Step.
            sf.write(str(src), np.full((180*sr, 2), 0.1, dtype=np.float32), sr)
            submissions = []
            def fake_cover(segment, output, prompt, **kwargs):
                submissions.append((segment, output, prompt))
                with sf.SoundFile(str(segment)) as audio:
                    data = audio.read(dtype="float32", always_2d=True)
                    fs = audio.samplerate
                sf.write(str(output), data, fs, subtype="PCM_16")
                return {"status": "completed", "noFakeAudio": True}
            with patch("sonara_remix_pro_ace_bridge.render", side_effect=fake_cover):
                result = render_long_remix(src, dst, "ONE full A+B song",
                    mode="none", segment_seconds=90, crossfade_seconds=2)
            self.assertEqual(result["segmentCount"], 2)
            self.assertTrue(result["oneContinuousOutput"])
            self.assertTrue(result["durationVerified"])
            self.assertEqual(len(submissions), 2)
            self.assertIn("establish the main groove", submissions[0][2])
            self.assertIn("SAME central hook", submissions[1][2])
            self.assertIn("ONE full A+B song", submissions[0][2])
            self.assertIn("ONE full A+B song", submissions[1][2])
            with sf.SoundFile(str(dst)) as output:
                self.assertEqual(output.frames, 180*sr)
                self.assertEqual(output.channels, 2)
                self.assertAlmostEqual(output.frames / output.samplerate, 180)
            self.assertTrue(src.is_file())

    def test_long_form_rejects_short_model_output_instead_of_padding_eight_minutes(self):
        import soundfile as sf
        import numpy as np
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            src, dst = root / "original.wav", root / "final.wav"
            sr = 22050
            sf.write(str(src), np.full((120*sr, 2), 0.1, dtype=np.float32), sr)
            def short_cover(segment, output, prompt, **kwargs):
                sf.write(str(output), np.full((10*sr, 2), .1, dtype=np.float32), sr)
                return {"status": "completed"}
            with patch("sonara_remix_pro_ace_bridge.render", side_effect=short_cover):
                with self.assertRaisesRegex(ACEBridgeError, "shorter than requested"):
                    render_long_remix(src, dst, "Original A+B", mode="none")
            self.assertFalse(dst.exists())

    def test_long_prompt_cannot_hide_musical_section_direction(self):
        from sonara_remix_pro_ace_bridge import _continuous_section_prompt
        direction=_continuous_section_prompt("x" * 9000, 1, 90, 180, 180)
        self.assertTrue(direction.startswith("CONTINUOUS ARRANGEMENT SECTION 2:"))
        self.assertIn("SAME central hook", direction)
        self.assertEqual(len(direction), 9000)

    def test_no_remote_result_urls(self):
        self.assertIsNone(_result_path({"result":[{"url":"https://attacker.example/path.wav"}]}))
        self.assertEqual(_result_path({"result":[{"audio_path":"/tmp/real.wav"}]}),"/tmp/real.wav")

    def test_local_auth_only(self):
        self.assertEqual(_headers("none"),{})
        with self.assertRaises(ACEBridgeError):
            _headers("magic")

    def test_invalid_inputs_rejected_before_inference(self):
        with tempfile.TemporaryDirectory() as d:
            source = Path(d) / "source.wav"
            wav_source(source)
            with patch("sonara_remix_pro_ace_bridge._request", side_effect=AssertionError("no network permitted")):
                with self.assertRaises(ACEBridgeError):
                    render(source,source,"Do not overwrite",mode="none")
                with self.assertRaises(ACEBridgeError):
                    render(source,Path(d)/"x.wav","",mode="none")
                with self.assertRaises(ACEBridgeError):
                    render(source,Path(d)/"x.wav","prompt",mode="none",strength=5)


if __name__ == "__main__":
    unittest.main()
