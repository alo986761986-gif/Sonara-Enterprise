"""CPU-only V8 song-form regression tests: no GPU or customer jobs."""
import unittest
import numpy as np
from sonara_remix_pro_songform import (
    SONGFORM_REVISION, NAMES, plan_song_form, section_gains,
)


class SongFormTests(unittest.TestCase):
    def test_six_sections_fill_exact_length_with_both_sources(self):
        for duration in (30, 60, 120, 180, 480):
            form = plan_song_form(duration, 124, b_influence=50)
            self.assertEqual(form["revision"], SONGFORM_REVISION)
            self.assertEqual(tuple(s["name"] for s in form["sections"]), NAMES)
            self.assertEqual([s["role"] for s in form["sections"]],
                             ["a", "a", "b", "b", "a", "a"])
            self.assertEqual(form["sections"][0]["startFrame"], 0)
            self.assertEqual(form["sections"][-1]["endFrame"], duration * 44100)
            self.assertTrue(all(s["endFrame"] > s["startFrame"] for s in form["sections"]))
            self.assertGreaterEqual(form["sourceBSeconds"], 8)
            self.assertEqual(sum(s["frames"] for s in form["sections"]), duration * 44100)

    def test_chunk_consistency_and_section_contrast(self):
        form = plan_song_form(120, 124)
        for mode in ("balanced", "experimental", "wild", "explosive"):
            a = section_gains(30000, 12000, 44100, form, mode)
            b = section_gains(42000, 12000, 44100, form, mode)
            c = section_gains(30000, 24000, 44100, form, mode)
            for i in range(3):
                self.assertTrue(np.isfinite(c[i]).all())
                np.testing.assert_allclose(np.concatenate((a[i], b[i])), c[i])
            at_theme = form["sections"][1]["startFrame"] + 44100 * 2
            at_break = form["sections"][3]["startFrame"] + 44100 * 2
            theme = section_gains(at_theme, 1, 44100, form, mode)
            breaking = section_gains(at_break, 1, 44100, form, mode)
            if mode != "explosive":
                self.assertLess(breaking[1][0], theme[1][0])

    def test_real_private_conditioning_uses_six_sections_even_at_30_seconds(self):
        from pathlib import Path
        import tempfile
        import soundfile as sf
        from sonara_remix_pro_fusion import make_dual_hook_conditioning_guide

        sr = 44100
        time = np.arange(18 * sr, dtype=np.float32) / sr
        # Only local synthetic technical signals, never customer material.
        left = np.column_stack([
            .15 * np.sin(2 * np.pi * 220 * time),
            .15 * np.sin(2 * np.pi * 220 * time)])
        right = np.column_stack([
            .12 * np.sin(2 * np.pi * 330 * time),
            .12 * np.sin(2 * np.pi * 330 * time)])
        with tempfile.TemporaryDirectory() as root:
            directory = Path(root)
            a = directory / "a.wav"
            b = directory / "b.wav"
            out = directory / "guide.wav"
            sf.write(str(a), left, sr)
            sf.write(str(b), right, sr)
            form = plan_song_form(30, 124)
            result = make_dual_hook_conditioning_guide(
                a, b, out, 30, b_influence=50, song_form=form)
            self.assertEqual(result["songForm"], list(NAMES))
            self.assertEqual(result["sections"], ["a", "a", "b", "b", "a", "a"])
            self.assertEqual(result["frames"], 30 * sr)
            self.assertFalse(result["publishableAudio"])
            with sf.SoundFile(str(out)) as file:
                self.assertEqual(file.frames, 30 * sr)

    def test_invalid_plans_and_no_unsafe_bpm(self):
        for bpm in (0, 220, float("nan")):
            with self.assertRaises(ValueError):
                plan_song_form(120, bpm)
        for duration in (0, 31, 490):
            with self.assertRaises(ValueError):
                plan_song_form(duration, 124)
        with self.assertRaises(ValueError):
            section_gains(0, 10, 44100, {}, "balanced")


if __name__ == "__main__":
    unittest.main()
