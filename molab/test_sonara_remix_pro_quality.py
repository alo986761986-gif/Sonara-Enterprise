"""Measured mix audit tests: real synthetic audio and honest uncertain values."""
from __future__ import annotations
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

from sonara_remix_pro_quality import (
    audit_wav, audit_remix, release_gate, recover_peak_safe_master
)


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
            self.assertFalse(verdict["bReferenceInfluenceVerified"])
            self.assertTrue(verdict["humanListeningRequired"])

    def test_loud_unmastered_source_does_not_fail_master_ceiling(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            arranged, generated, master = (root/"arranged.wav",
                                           root/"generated.wav",
                                           root/"master.wav")
            make_wave(arranged, level=0.98)
            make_wave(generated, level=0.98)
            make_wave(master, level=0.25)
            verdict = release_gate(arranged, generated, master, expected_seconds=2)
            self.assertTrue(verdict["acceptedTechnical"], verdict["failures"])
            self.assertNotIn("arranged-true-peak-too-high", verdict["failures"])
            self.assertNotIn("generated-true-peak-too-high", verdict["failures"])

    def test_loud_or_clipped_a_guide_does_not_veto_clean_output(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            arranged, generated, master = (
                root/"arranged.wav", root/"generated.wav", root/"master.wav")
            make_wave(arranged, level=1.0)
            make_wave(generated, level=0.2)
            make_wave(master, level=0.2)
            verdict = release_gate(arranged, generated, master, expected_seconds=2)
            self.assertTrue(verdict["acceptedTechnical"], verdict["failures"])
            self.assertTrue(any(reason.startswith("arranged-")
                                for reason in verdict["referenceWarnings"]))
            self.assertFalse(verdict["perceptualFusionVerified"])

    def test_quieter_clean_master_does_not_cause_spectral_false_positive(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            arranged, generated, master = (
                root/"arranged.wav", root/"generated.wav", root/"master.wav")
            make_wave(arranged, level=0.8)
            make_wave(generated, level=0.012)
            make_wave(master, level=0.012)
            verdict = release_gate(arranged, generated, master, expected_seconds=2)
            self.assertTrue(verdict["acceptedTechnical"], verdict["failures"])
            self.assertNotIn("spectral-band-0-collapsed", verdict["failures"])
            self.assertNotIn("spectral-band-1-collapsed", verdict["failures"])
            self.assertNotIn("spectral-band-2-collapsed", verdict["failures"])

    def test_silent_reference_warns_but_never_certifies_fusion(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            arranged, generated, master = (
                root/"arranged.wav", root/"generated.wav", root/"master.wav")
            make_wave(arranged, level=0.0)
            make_wave(generated, level=0.25)
            make_wave(master, level=0.25)
            verdict = release_gate(arranged, generated, master, expected_seconds=2)
            self.assertTrue(verdict["acceptedTechnical"], verdict["failures"])
            self.assertIn("arranged-excessive-silence", verdict["referenceWarnings"])
            self.assertFalse(verdict["bReferenceInfluenceVerified"])

    def test_master_overs_is_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            arranged, generated, master = (root/"arranged.wav",
                                           root/"generated.wav",
                                           root/"master.wav")
            make_wave(arranged, level=0.25)
            make_wave(generated, level=0.25)
            make_wave(master, level=0.98)
            verdict = release_gate(arranged, generated, master, expected_seconds=2)
            self.assertFalse(verdict["acceptedTechnical"])
            self.assertIn("master-true-peak-too-high", verdict["failures"])

    def test_recomposition_spectral_difference_warns_without_veto(self):
        import numpy as np
        import soundfile as sf
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            sr = 22050
            t = np.arange(sr * 3, dtype=np.float64) / sr
            arranged = root / "arranged.wav"
            generated = root / "generated.wav"
            master = root / "master.wav"
            # The dual-source guide has low notes; the generated song has a
            # different instrumentation. This is not automatically damage.
            sf.write(arranged, .15 * np.sin(2*np.pi*100*t), sr)
            sf.write(generated, .15 * np.sin(2*np.pi*2300*t), sr)
            sf.write(master, .15 * np.sin(2*np.pi*2300*t), sr)
            v = release_gate(arranged, generated, master, expected_seconds=3)
            self.assertTrue(v["acceptedTechnical"], v["failures"])
            self.assertTrue(any(x.startswith("spectral-band-")
                                for x in v["referenceWarnings"]))

    def test_peak_recovery_makes_new_file_without_touching_source(self):
        import numpy as np
        import soundfile as sf
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            sr = 22050
            t = np.arange(sr * 3, dtype=np.float64) / sr
            source = root / "generated.wav"
            output = root / "recovered.wav"
            signal = .8*np.sin(2*np.pi*321*t)
            sf.write(source, np.column_stack([signal, signal]), sr, subtype="PCM_24")
            original = source.read_bytes()
            result = recover_peak_safe_master(source, output)
            self.assertTrue(output.is_file())
            self.assertEqual(original, source.read_bytes())
            self.assertLessEqual(result["approxTruePeakDbTp"], -0.9)
            with self.assertRaises(Exception):
                recover_peak_safe_master(source, output)

    def test_master_duration_failure_is_still_hard(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            guide, generated, master = (
                root / "guide.wav", root / "generated.wav", root / "master.wav")
            make_wave(guide)
            make_wave(generated)
            make_wave(master)
            verdict = release_gate(guide, generated, master, expected_seconds=3)
            self.assertFalse(verdict["acceptedTechnical"])
            self.assertIn("master-duration-mismatch", verdict["failures"])

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
