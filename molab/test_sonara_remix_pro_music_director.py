"""V9 end-to-end CPU signal tests: no GPU, customer material or private secrets."""
from __future__ import annotations
import tempfile
import unittest
from pathlib import Path
import numpy as np
import soundfile as sf

from sonara_remix_pro_music_director import (
    DIRECTOR_REVISION, analyse_sources, create_music_direction,
    musical_direction_prompt, arrange_vocal_dialogue, SpectralPocket,
    evaluate_arrangement)
from sonara_remix_pro_songform import plan_song_form
from sonara_remix_pro_fusion import make_dual_hook_conditioning_guide


class V9MusicDirectorTests(unittest.TestCase):
    def test_six_real_sections_guided_by_distinct_source_moments(self):
        rate = 44100
        duration = 30
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            t = np.arange(duration * rate, dtype=np.float64) / rate
            files = {}
            for role, hz in (("a", 155), ("b", 255)):
                music = (.18 * np.sin(2 * np.pi * hz * t)
                         + .07 * np.sin(2 * np.pi * (hz + 33) * t))
                vocals = np.where((t % 7) < 5.0,
                                  .08 * np.sin(2 * np.pi * (hz + 90) * t), 0.)
                drums = .07 * np.sin(2 * np.pi * 60 * t) * np.where(
                    (t % .5) < .14, 1., .03)
                files[role] = {}
                for name, audio in (("music", music), ("vocals", vocals), ("drums", drums)):
                    file = root / f"{role}-{name}.wav"
                    sf.write(str(file), audio.astype(np.float32), rate)
                    files[role][name] = file
            evidence = analyse_sources(
                files["a"]["music"], files["b"]["music"],
                {"vocals": files["a"]["vocals"], "drums": files["a"]["drums"]},
                {"vocals": files["b"]["vocals"], "drums": files["b"]["drums"]})
            form = plan_song_form(30, 124)
            direction = create_music_direction(form, evidence,
                {"key": "C minor", "keyConfidence": .92},
                {"key": "G minor", "keyConfidence": .90})
            self.assertEqual(direction["revision"], DIRECTOR_REVISION)
            self.assertEqual(direction["references"]["main_theme"],
                             direction["references"]["theme_return"])
            self.assertEqual(direction["references"]["development"]["role"], "b")
            self.assertIn("MAIN THEME", musical_direction_prompt(direction))
            guide = root / "guided.wav"
            result = make_dual_hook_conditioning_guide(
                files["a"]["music"], files["b"]["music"], guide, 30,
                song_form=form, director_plan=direction)
            self.assertFalse(result["publishableAudio"])
            self.assertEqual(result["v9MusicDirector"], DIRECTOR_REVISION)
            with sf.SoundFile(str(guide)) as f:
                self.assertEqual(f.frames, 30 * rate)
            vocal_a = {"audible": True, "regions": [(1., 2.1, .03), (7., 2.5, .03)]}
            vocal_b = {"audible": True, "regions": [(3., 2., .04), (9., 2.2, .04)]}
            events, _, info = arrange_vocal_dialogue(vocal_a, vocal_b, form, 124)
            self.assertEqual(info["leadOverlapSeconds"], 0.)
            self.assertIn("a", [e["role"] for e in events])
            self.assertIn("b", [e["role"] for e in events])
            self.assertTrue(all(x["at"]+x["duration"] <= y["at"]
                                for x,y in zip(events,events[1:])))
            premaster = root / "master.wav"
            amp = (.15 + .06 * np.sin(2 * np.pi * t / 12))
            signal = (amp * np.sin(2 * np.pi * 201 * t)).astype(np.float32)
            sf.write(str(premaster), np.column_stack([signal, signal]), rate)
            accepted = evaluate_arrangement(premaster, direction, {
                "originalVoiceAUsed": True, "originalVoiceBUsed": True,
                "modelGeneratedLeadVocalsRetained": False})
            self.assertTrue(0 <= accepted["measuredProxyScore"] <= 100)
            self.assertTrue(accepted["musicalQualityListeningStillRequired"])

    def test_vocal_pocket_is_subtractive_and_finite(self):
        pocket = SpectralPocket(44100)
        t = np.arange(44100, dtype=np.float32)/44100
        source = (.1 * np.sin(2*np.pi*1800*t)).astype(np.float32)
        stereo = np.column_stack([source, source])
        target = pocket.process(stereo, np.ones(len(t), np.float32))
        self.assertTrue(np.isfinite(target).all())
        self.assertLess(np.sqrt(np.mean(target**2)), np.sqrt(np.mean(stereo**2)))
        with self.assertRaises(ValueError):
            pocket.process(stereo, np.ones(len(t)-1, np.float32))

    def test_v9_refuses_forged_plan_or_missing_authentic_voices(self):
        form = plan_song_form(30, 124)
        with self.assertRaises(ValueError):
            musical_direction_prompt({"revision":"spoof"})
        with self.assertRaises(ValueError):
            evaluate_arrangement("/nonexistent", {"revision":"spoof"}, {})
        profile = {"audible":False,"regions":[]}
        with self.assertRaises(ValueError):
            arrange_vocal_dialogue(profile, profile, form, 124)


if __name__=="__main__":
    unittest.main()
