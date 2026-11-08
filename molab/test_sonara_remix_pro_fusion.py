"""Offline regression tests for separate-reference music fusion. No GPU or secrets."""
import importlib.util
import pathlib
import tempfile
import unittest
import wave

import numpy as np
import soundfile as sf

ROOT = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("sonara_remix_pro_fusion", ROOT / "sonara_remix_pro_fusion.py")
fusion = importlib.util.module_from_spec(spec)
spec.loader.exec_module(fusion)


class TwoSourceFusionTests(unittest.TestCase):
    def test_guide_and_reference_remain_independent(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            sr = 22050
            t = np.arange(sr * 12, dtype=np.float32) / sr
            a = np.column_stack([0.28*np.sin(2*np.pi*220*t)]*2)
            b = np.column_stack([0.12*np.sin(2*np.pi*330*t)]*2)
            fa, fb = root/"a.wav", root/"b.wav"
            sf.write(fa, a, sr, subtype="PCM_16")
            sf.write(fb, b, sr, subtype="PCM_16")
            ga, rb = root/"guide.wav", root/"reference.wav"
            plan = fusion.make_structural_guide(fa, ga, 30)
            style = fusion.make_independent_style_reference(fb, rb)
            self.assertEqual(plan["source"], "a-only")
            self.assertIs(plan["containsSourceB"], False)
            self.assertEqual(style["source"], "b-only")
            self.assertIs(style["containsSourceA"], False)
            with sf.SoundFile(ga) as f:
                self.assertEqual(f.frames, 30 * sr)
            with sf.SoundFile(rb) as f:
                self.assertEqual(f.frames, 12 * sr)
            generated_a, _ = sf.read(ga, always_2d=True, frames=sr)
            generated_b, _ = sf.read(rb, always_2d=True, frames=sr)
            self.assertLess(np.max(np.abs(generated_a[:, 0]-a[:sr, 0])), 0.001)
            self.assertLess(np.max(np.abs(generated_b[:, 0]-b[:sr, 0])), 0.001)
            self.assertGreater(np.max(np.abs(generated_a[:, 0]-generated_b[:, 0])), .1)

    def test_prompt_is_composition_not_overlay(self):
        p = fusion.build_fusion_prompt(
            "Mix the melodic colors of both sources into a new track",
            {"tempoBpm": 123, "tempoConfidence": .9, "key": "C major", "keyConfidence": .9},
            {"tempoBpm": 125, "tempoConfidence": .8, "key": "D minor", "keyConfidence": .9})
        self.assertIn("Compose ONE entirely new", p)
        self.assertIn("NEVER add raw A+B stems together", p)
        self.assertIn("Measured A pulse: 123 BPM", p)
        self.assertIn("Measured B pulse: 125 BPM", p)
        self.assertIn("compatible tonal center", p)

    def test_invalid_duration_and_overwrite_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            source = pathlib.Path(td) / "input.wav"
            sf.write(source, np.zeros((22050 * 10, 2), dtype=np.float32), 22050)
            with self.assertRaises(fusion.FusionPlanError):
                fusion.make_structural_guide(source, pathlib.Path(td)/"bad.wav", 31)
            with self.assertRaises(fusion.FusionPlanError):
                fusion.make_structural_guide(source, source, 30)


if __name__ == "__main__":
    unittest.main()
