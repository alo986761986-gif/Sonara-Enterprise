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
