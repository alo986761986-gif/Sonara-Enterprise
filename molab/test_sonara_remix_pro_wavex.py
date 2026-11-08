"""Real libsndfile regression: accept valid PCM/float WAVEX, reject unsafe WAV."""
import ast
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import soundfile as sf

AGENT = Path(__file__).with_name("sonara_remix_pro_r2_agent.py")


class ProAgentError(RuntimeError):
    pass


def validator():
    tree = ast.parse(AGENT.read_text())
    funcs = [node for node in tree.body
             if isinstance(node, ast.FunctionDef) and node.name == "validate_wav"]
    assert len(funcs) == 1
    context = {"Path": Path, "sf": sf, "ProAgentError": ProAgentError,
               "MAX_WAV_BYTES": 512 * 1024 * 1024}
    exec(compile(ast.Module(body=funcs, type_ignores=[]), str(AGENT), "exec"),
         context)
    return context["validate_wav"]


def make_audio(path, fmt="WAVEX", subtype="PCM_24", channels=2,
               rate=8000, seconds=11):
    # All samples are synthetic silence, no customer music or copyrighted audio.
    frames = [[0.0] * channels for _ in range(rate * seconds)]
    sf.write(str(path), frames, rate, format=fmt, subtype=subtype)


class WavexSourceTests(unittest.TestCase):
    def test_genuine_daw_wavex_pcm24_and_float_are_accepted(self):
        with tempfile.TemporaryDirectory() as directory:
            for subtype in ("PCM_24", "FLOAT"):
                path = Path(directory) / (subtype.lower() + ".wav")
                make_audio(path, subtype=subtype)
                with sf.SoundFile(str(path)) as input_audio:
                    self.assertEqual(input_audio.format, "WAVEX")
                    self.assertEqual(input_audio.subtype, subtype)
                self.assertEqual(validator()(path), path)

    def test_standard_pcm_wav_remains_supported(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "normal.wav"
            make_audio(path, fmt="WAV", subtype="PCM_16")
            self.assertEqual(validator()(path), path)

    def test_reject_truncated_and_three_channel_wavex(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "short.wav"
            make_audio(path, seconds=9)
            with self.assertRaises(ProAgentError):
                validator()(path)
            path3 = Path(directory) / "three.wav"
            make_audio(path3, channels=3)
            with self.assertRaises(ProAgentError):
                validator()(path3)

    def test_reject_non_pcm_subtype_and_invalid_samplerate(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "fake.wav"
            path.write_bytes(b"RIFF" + bytes(60))
            standard = SimpleNamespace(
                format="WAVEX", subtype="ULAW", samplerate=48000,
                frames=48000 * 11, channels=2,
            )
            standard.__enter__ = lambda: standard
            # Patch the file-open path, never the validation logic.
            class FakeAudio:
                def __init__(self, **kwargs):
                    self.__dict__.update(kwargs)
                def __enter__(self):
                    return self
                def __exit__(self, *_):
                    pass
            with patch.object(sf, "SoundFile", return_value=FakeAudio(**vars(standard))):
                with self.assertRaises(ProAgentError):
                    validator()(path)
            with patch.object(sf, "SoundFile", return_value=FakeAudio(
                format="WAVEX", subtype="PCM_24", samplerate=192000,
                frames=192000 * 11, channels=2)):
                with self.assertRaises(ProAgentError):
                    validator()(path)


if __name__ == "__main__":
    unittest.main()
