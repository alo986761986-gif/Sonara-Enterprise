"""Measured mix audit tests: real synthetic audio and honest uncertain values."""
from __future__ import annotations
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from sonara_remix_pro_quality import audit_wav, audit_remix, release_gate


def make_wave(path, level=0.3):
    import numpy as np
    sr=44100
    t=np.arange(sr*2,dtype=float)/sr
    audio=level*np.sin(2*np.pi*440*t)
    pcm=(audio*32767).astype("<i2")
    with wave.open(str(path),"wb") as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(sr)
        f.writeframes(pcm.tobytes())


class AudioAuditTests(unittest.TestCase):
    def test_measured_numbers_are_finite_and_no_fake_certification(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d)/"test.wav"
            make_wave(p)
            data=audit_wav(p)
            self.assertEqual(data["channels"],1)
            self.assertGreater(data["durationSeconds"],1.9)
            self.assertIsNotNone(data["integratedLufs"])
            self.assertLess(data["approxTruePeakDbTp"],0)
            self.assertLess(data["clippedFrameRatio"],0.0001)
            self.assertIn("not a certified meter",data["peakMethod"])

    def test_unverified_tempo_and_key_are_not_a_success(self):
        with tempfile.TemporaryDirectory() as d:
            original=Path(d)/"a.wav"
            remix=Path(d)/"b.wav"
            make_wave(original)
            make_wave(remix)
            with patch("sonara_remix_pro_quality.analyze_audio",return_value={
                "tempoBpm":None,"key":None,"tempoConfidence":0,"keyConfidence":0
            }):
                result=audit_remix(original,remix)
            self.assertIsNone(result["tempoDeviationBpm"])
            self.assertIsNone(result["estimatedKeyMatch"])
            self.assertTrue(result["humanListeningRequired"])
            self.assertIn("tempo-alignment-not-verified",result["reviewFlags"])
            self.assertIn("tonal-center-not-verified",result["reviewFlags"])

    def test_release_gate_accepts_normal_clean_audio(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            arranged, generated, master = (root/"arranged.wav",
                                           root/"generated.wav",
                                           root/"master.wav")
            for path in (arranged, generated, master):
                make_wave(path, level=0.25)
            verdict = release_gate(arranged, generated, master, expected_seconds=2)
            self.assertTrue(verdict["acceptedTechnical"], verdict["failures"])
            self.assertFalse(verdict["perceptualFusionVerified"])
            self.assertTrue(verdict["humanListeningRequired"])

    def test_release_gate_rejects_silent_generated_audio(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            arranged, generated, master = (root/"arranged.wav",
                                           root/"generated.wav",
                                           root/"master.wav")
            make_wave(arranged, level=0.25)
            make_wave(generated, level=0.0)
            make_wave(master, level=0.0)
            verdict = release_gate(arranged, generated, master, expected_seconds=2)
            self.assertFalse(verdict["acceptedTechnical"])
            self.assertIn("generated-excessive-silence", verdict["failures"])

    def test_bad_high_peaks_are_not_reported_as_professional_master(self):
        with tempfile.TemporaryDirectory() as d:
            source=Path(d)/"a.wav"
            remix=Path(d)/"b.wav"
            make_wave(source)
            make_wave(remix,level=1.0)
            with patch("sonara_remix_pro_quality.analyze_audio",return_value={
                "tempoBpm":120.0,"key":"A minor"
            }):
                data=audit_remix(source,remix)
            self.assertIn("possible-clipping-or-true-peak-risk",data["reviewFlags"])
            self.assertTrue(data["humanListeningRequired"])


if __name__=="__main__":
    unittest.main()
