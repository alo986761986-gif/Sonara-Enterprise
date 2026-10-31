import math
import os
import struct
import tempfile
import unittest
import wave
from pathlib import Path

from sonara_ab_wav_audit import audit_pair, audit_wav


def make_wav(path, left, right=None, rate=48000):
    channels = 2 if right is not None else 1
    with wave.open(str(path), "wb") as wav:
        wav.setnchannels(channels)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        data = bytearray()
        for i, l in enumerate(left):
            data += struct.pack("<h", max(-32768, min(32767, round(l * 32767))))
            if right is not None:
                data += struct.pack("<h", max(-32768, min(32767, round(right[i] * 32767))))
        wav.writeframes(bytes(data))


class ABWavAuditTests(unittest.TestCase):
    def test_antiphase_stereo_does_not_disappear_through_mono_averaging(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "antiphase.wav"
            samples = [0.7 * math.sin(2 * math.pi * 440 * i / 48000) for i in range(4800)]
            make_wav(path, samples, [-x for x in samples])
            report = audit_wav(path)
            self.assertGreater(report["peak_dbfs"], -5)
            self.assertAlmostEqual(report["stereo_correlation"], -1.0, places=3)
            self.assertIn("highly_anti_correlated_stereo", report["warnings"])

    def test_clean_stereo_pair_and_no_source_modification(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / "a.wav", Path(tmp) / "b.wav"
            samples = [0.3 * math.sin(2 * math.pi * 440 * i / 48000) for i in range(4800)]
            make_wav(a, samples, samples)
            make_wav(b, [0.8 * x for x in samples], [0.8 * x for x in samples])
            before = (a.read_bytes(), b.read_bytes())
            result = audit_pair(a, b)
            self.assertEqual(result["standard"], "SONARA_AB_SIGNAL_INTEGRITY_V1")
            self.assertEqual(result["A"]["channels"], 2)
            self.assertFalse(result["review_required"])
            self.assertGreater(result["rms_delta_db"], 1)
            self.assertEqual(before, (a.read_bytes(), b.read_bytes()))

    def test_nearly_full_scale_constant_audio_detects_clipping_and_dc(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "clipped.wav"
            make_wav(path, [1.0] * 4800)
            result = audit_wav(path)
            self.assertIn("possible_digital_clipping", result["warnings"])
            self.assertIn("large_dc_offset", result["warnings"])


if __name__ == "__main__":
    unittest.main()
