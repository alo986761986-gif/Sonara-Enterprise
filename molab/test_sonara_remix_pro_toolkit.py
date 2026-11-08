"""Safe offline quality checks for SONARA Remix Pro; no GPU/model downloads."""
from __future__ import annotations
import json
import math
import tempfile
import unittest
import wave
from pathlib import Path
from unittest import mock

from sonara_remix_pro_toolkit import (
    RemixProError, STEM_NAMES, VERSION, audio_hash, analyze_audio,
    combine_two_songs, preflight, separate_stems, source_file, transparent_master
)


def fixture(path, seconds=3, rate=22050, frequency=440):
    import numpy as np
    times = np.arange(int(seconds * rate), dtype=np.float64) / rate
    # Periodic signal with a measured source WAV; never masquerades as a full song.
    signal = (0.08 * np.sin(2 * np.pi * frequency * times)).astype(np.float32)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes((signal * 32767).astype("<i2").tobytes())


class SONARARemixProTests(unittest.TestCase):
    def test_preflight_truthful(self):
        info = preflight()
        self.assertEqual(info["version"], VERSION)
        self.assertFalse(info["demucsModelVerified"])
        self.assertFalse(info["gpuInferenceVerified"])

    def test_audio_path_and_fingerprint(self):
        with tempfile.TemporaryDirectory() as d:
            good = Path(d) / "a.wav"
            fixture(good)
            self.assertEqual(source_file(good), good.resolve())
            self.assertEqual(audio_hash(good), audio_hash(good))
            self.assertEqual(len(audio_hash(good)), 64)
            with self.assertRaises(RemixProError):
                source_file(Path(d) / "missing.wav")
            strange = Path(d) / "a.json"
            strange.write_text("{}")
            with self.assertRaises(RemixProError):
                source_file(strange)

    def test_measured_not_fake_tempo_and_key(self):
        with tempfile.TemporaryDirectory() as d:
            silence = Path(d) / "silence.wav"
            with wave.open(str(silence), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(22050)
                wav.writeframes(b"\x00\x00" * 22050 * 3)
            report = analyze_audio(silence)
            self.assertIsNone(report["tempoBpm"])
            self.assertIsNone(report["key"])
            self.assertIn("silence-or-empty", report["warnings"])

    def test_stems_are_real_files_with_source_cache_binding(self):
        import numpy as np
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            source = folder / "song.wav"
            fixture(source)
            def fake_demucs(cmd, **kwargs):
                self.assertIn("demucs.separate", cmd)
                self.assertIn("--out", cmd)
                scratch = Path(cmd[cmd.index("--out") + 1])
                output = scratch / "htdemucs" / source.stem
                output.mkdir(parents=True, exist_ok=True)
                for name in STEM_NAMES:
                    fixture(output / (name + ".wav"))
                return mock.Mock(returncode=0)
            with mock.patch("sonara_remix_pro_toolkit.subprocess.run", side_effect=fake_demucs) as called:
                manifest = separate_stems(source, folder / "cache")
                self.assertTrue(manifest["stemsVerified"])
                self.assertEqual(manifest["sourceSha256"], audio_hash(source))
                self.assertEqual(set(manifest["stemFiles"]), set(STEM_NAMES))
                self.assertTrue((folder / "cache" / audio_hash(source)[:20] / "stems-manifest.json").exists())
                second = separate_stems(source, folder / "cache")
                self.assertEqual(manifest, second)
                self.assertEqual(called.call_count, 1)

    def test_bad_stems_cannot_be_used_for_other_source(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            a, b = root / "a.wav", root / "b.wav"
            fixture(a, seconds=3, frequency=330)
            fixture(b, seconds=3, frequency=440)
            fake_a = root / "stem-a"
            fake_b = root / "stem-b"
            fake_a.mkdir()
            fake_b.mkdir()
            (fake_a / "stems-manifest.json").write_text(json.dumps({
                "sourceSha256": audio_hash(a), "separationModel": "htdemucs", "stemsVerified": True
            }))
            (fake_b / "stems-manifest.json").write_text(json.dumps({
                "sourceSha256": audio_hash(a), "separationModel": "htdemucs", "stemsVerified": True
            }))
            with mock.patch("sonara_remix_pro_toolkit.analyze_audio", return_value={
                "tempoBpm": 120, "key": None, "beatTimesSeconds": [0.4]
            }):
                with self.assertRaisesRegex(RemixProError, "Stem manifest does not belong"):
                    combine_two_songs(a, b, fake_a, fake_b, root / "remix.wav",
                                      bpm_a=120, bpm_b=120)

    def test_true_peak_and_loudness_report(self):
        import numpy as np
        sr = 44100
        t = np.arange(sr * 2) / sr
        stereo = np.column_stack([0.9 * np.sin(2 * np.pi * 997 * t),
                                  0.9 * np.sin(2 * np.pi * 997 * t)])
        result, report = transparent_master(stereo.astype(np.float32), sr=sr)
        self.assertTrue(np.isfinite(result).all())
        self.assertLessEqual(np.max(np.abs(result)), 1.0)
        self.assertLessEqual(report["approxTruePeakDb"], -0.95)
        self.assertEqual(report["peakCeilingDbTP"], -1.0)
        self.assertIn("lufsAfter", report)


if __name__ == "__main__":
    unittest.main()
