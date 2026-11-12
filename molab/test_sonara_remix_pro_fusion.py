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

    def test_explosive_dual_hook_guide_uses_both_sources_without_output_mashup(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            sr = 22050
            duration = 15
            t = np.arange(sr * duration, dtype=np.float32) / sr
            a = .16 * np.sin(2 * np.pi * 220 * t)
            b = .14 * np.sin(2 * np.pi * 440 * t)
            voice_a = .12 * np.sin(2 * np.pi * 280 * t)
            voice_b = .11 * np.sin(2 * np.pi * 500 * t)
            files = {}
            for name, audio in (("a",a), ("b",b), ("va",voice_a), ("vb",voice_b)):
                path = root / (name + ".wav")
                sf.write(str(path), audio, sr, subtype="PCM_24")
                files[name] = path
            path = root / "private-guide.wav"
            info = fusion.make_dual_hook_conditioning_guide(
                files["a"], files["b"], path, 30,
                vocals_a=files["va"], vocals_b=files["vb"])
            self.assertTrue(info["containsSourceA"])
            self.assertTrue(info["containsSourceB"])
            self.assertFalse(info["publishableAudio"])
            self.assertEqual(info["sections"],["a","b","a"])
            self.assertEqual(info["selection"],"measured-stem-energy-not-chorus-transcription")
            with sf.SoundFile(str(path)) as result:
                self.assertEqual(result.frames, sr * 30)
                self.assertEqual(result.channels,2)
                a_section = result.read(sr*4, dtype="float32", always_2d=True)
                result.seek(sr*12)
                b_section = result.read(sr*4, dtype="float32", always_2d=True)
            self.assertTrue(np.isfinite(a_section).all())
            self.assertTrue(np.isfinite(b_section).all())
            self.assertGreater(np.std(a_section),.01)
            self.assertGreater(np.std(b_section),.01)
            # At least two different original pitches survive as guidance.
            def dominant(chunk):
                data=np.fft.rfft(chunk[:,0])
                hz=np.fft.rfftfreq(len(chunk),1/sr)
                return float(hz[np.argmax(np.abs(data))])
            self.assertAlmostEqual(dominant(a_section),220,delta=3)
            self.assertAlmostEqual(dominant(b_section),440,delta=3)
            with self.assertRaises(fusion.FusionPlanError):
                fusion.make_dual_hook_conditioning_guide(files["a"],files["b"],path,30)

    def test_long_dual_source_guide_contains_b_in_every_30_second_cycle(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            sr = 22050
            t = np.arange(sr * 12, dtype=np.float32) / sr
            fa, fb = root / "source-a.wav", root / "source-b.wav"
            sf.write(fa, .14 * np.sin(2 * np.pi * 220 * t), sr, subtype="PCM_24")
            sf.write(fb, .14 * np.sin(2 * np.pi * 440 * t), sr, subtype="PCM_24")
            for influence in (20, 50, 80):
                out = root / ("guide-" + str(influence) + ".wav")
                result = fusion.make_dual_hook_conditioning_guide(
                    fa, fb, out, 90, b_influence=influence)
                self.assertEqual(result["sections"], ["a", "b", "a"] * 3)
                self.assertEqual(result["frames"], sr * 90)
                self.assertTrue(result["containsSourceA"])
                self.assertTrue(result["containsSourceB"])
                self.assertFalse(result["publishableAudio"])
                self.assertGreater(result["sourceBGuideSeconds"], 0)
                with sf.SoundFile(out) as file:
                    for cycle in range(3):
                        file.seek(int((cycle * 30 + 14) * sr))
                        b_audio = file.read(sr * 2, dtype="float32", always_2d=True)
                        file.seek(int((cycle * 30 + 2) * sr))
                        a_audio = file.read(sr * 2, dtype="float32", always_2d=True)
                        def dominant(block):
                            spectrum = np.fft.rfft(block[:, 0])
                            freq = np.fft.rfftfreq(len(block), 1 / sr)
                            return float(freq[np.argmax(np.abs(spectrum))])
                        self.assertAlmostEqual(dominant(a_audio), 220, delta=2)
                        self.assertAlmostEqual(dominant(b_audio), 440, delta=2)
            self.assertGreater(
                fusion.make_dual_hook_conditioning_guide(
                    fa, fb, root / "guide-high.wav", 30,
                    b_influence=80)["sourceBGuideSeconds"],
                fusion.make_dual_hook_conditioning_guide(
                    fa, fb, root / "guide-low.wav", 30,
                    b_influence=20)["sourceBGuideSeconds"],
            )

    def test_explosive_homogeneity_transitions_are_smoother(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            sr = 22050
            t = np.arange(sr * 12, dtype=np.float32) / sr
            a = root / "a.wav"
            b = root / "b.wav"
            sf.write(a, .2 * np.sin(2 * np.pi * 220 * t), sr)
            sf.write(b, .2 * np.sin(2 * np.pi * 440 * t), sr)
            standard = fusion.make_dual_hook_conditioning_guide(
                a, b, root / "standard.wav", 30, homogeneous=False)
            explosive = fusion.make_dual_hook_conditioning_guide(
                a, b, root / "explosive.wav", 30, homogeneous=True)
            self.assertGreater(explosive["conditioningTransitionSeconds"],
                               standard["conditioningTransitionSeconds"])
            self.assertTrue(explosive["homogeneousTransitionsRequested"])
            self.assertEqual(explosive["sections"], standard["sections"])
            self.assertEqual(explosive["frames"], sr * 30)
            self.assertTrue(explosive["containsSourceB"])
            self.assertFalse(explosive["publishableAudio"])

    def test_dual_hook_influence_rejects_invalid_values(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            sr = 22050
            for name in ("a", "b"):
                sf.write(root / (name + ".wav"),
                         np.ones(sr * 12, dtype=np.float32) * 0.03,
                         sr)
            for invalid in (-5, 10, 81, 33, True, "50"):
                with self.subTest(invalid=invalid), self.assertRaises(fusion.FusionPlanError):
                    fusion.make_dual_hook_conditioning_guide(
                        root / "a.wav", root / "b.wav",
                        root / "unused.wav", 30, b_influence=invalid)

    def test_explosive_prompt_contains_vocal_and_hook_instructions(self):
        p=fusion.build_fusion_prompt(
            "Fuse two different genres into one new original composition",
            {"tempoBpm":125,"tempoConfidence":.8,"key":"C minor","keyConfidence":.9},
            {"tempoBpm":98,"tempoConfidence":.8,"key":"G minor","keyConfidence":.9},
            requested_seconds=180,explosive=True)
        self.assertIn("DUAL-HOOK FORM",p)
        self.assertIn("never synthesize a third singer",p)
        self.assertIn("reserve clean space for the actual original vocals",p)
        self.assertIn("No audible cut",p)
        self.assertIn("FINAL NON-NEGOTIABLE RHYTHM LOCK",p)
        self.assertIn("NO silent bars",p)
        self.assertIn("same BPM and drum pattern",p)
        self.assertIn("ONE mandatory",p)

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

    def test_identical_audio_A_B_is_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            sr = 22050
            t = np.arange(sr * 12, dtype=np.float32) / sr
            tone = 0.2 * np.sin(2 * np.pi * 240 * t)
            a, b = root / "a.wav", root / "b.wav"
            sf.write(a, tone, sr, subtype="PCM_16")
            b.write_bytes(a.read_bytes())
            with self.assertRaises(fusion.FusionPlanError):
                fusion.ensure_distinct_sources(a, b)
            with self.assertRaises(fusion.FusionPlanError):
                fusion.ensure_distinct_sources(a, a)
            sf.write(b, 0.2 * np.sin(2 * np.pi * 400 * t), sr, subtype="PCM_16")
            self.assertTrue(fusion.ensure_distinct_sources(a, b))

    def test_unverified_bpm_never_blocks_two_source_fusion(self):
        no_tempo = {"tempoBpm": None, "tempoConfidence": 0}
        self.assertIsNone(fusion.select_fusion_tempo(None, no_tempo, None, no_tempo))
        self.assertEqual(
            fusion.select_fusion_tempo(None, no_tempo, None,
                                       {"tempoBpm": 127.5, "tempoConfidence": 0.8}),
            127.5,
        )
        self.assertEqual(
            fusion.select_fusion_tempo(119, no_tempo, 127.5, no_tempo), 119.0,
        )
        self.assertEqual(
            fusion.select_fusion_tempo(None, {"tempoBpm": 133, "tempoConfidence": 0.9},
                                       125, no_tempo), 125.0,
        )
        for invalid in (0, 500, -5, "bogus", float("inf")):
            with self.subTest(bpm=invalid), self.assertRaises(fusion.FusionPlanError):
                fusion.select_fusion_tempo(invalid, no_tempo, None, no_tempo)

    def test_invalid_duration_and_overwrite_rejected(self):
        with tempfile.TemporaryDirectory() as td:
            source = pathlib.Path(td) / "input.wav"
            sf.write(source, np.zeros((22050 * 10, 2), dtype=np.float32), 22050)
            with self.assertRaises(fusion.FusionPlanError):
                fusion.make_structural_guide(source, pathlib.Path(td)/"bad.wav", 31)
            with self.assertRaises(fusion.FusionPlanError):
                fusion.make_structural_guide(source, source, 30)


    def test_loop_seam_has_no_abrupt_discontinuity(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            sr = 22050
            # A discontinuous loop: source starts at +0.5 and ends at -0.5.
            a = np.linspace(0.5, -0.5, sr * 12, dtype=np.float32)
            fa, out = root/"saw.wav", root/"guide.wav"
            sf.write(fa, a, sr, subtype="PCM_16")
            info = fusion.make_structural_guide(fa, out, 30)
            self.assertEqual(info["source"], "a-only")
            self.assertEqual(info["sourceRepetitions"], 2)
            self.assertGreater(info["loopCrossfadeSeconds"], 0)
            with sf.SoundFile(out) as wav:
                self.assertEqual(wav.frames, 30 * sr)
                wav.seek(sr * 12 - 1)
                seam = wav.read(3, dtype="float32", always_2d=True)
            self.assertLess(np.max(np.abs(np.diff(seam, axis=0))), 0.01)

    def test_selects_steady_b_groove_passage_not_silent_intro(self):
        with tempfile.TemporaryDirectory() as td:
            root = pathlib.Path(td)
            sr = 22050
            duration = 90
            t = np.arange(sr * duration, dtype=np.float32) / sr
            # The original B contains musical material throughout.
            b = (0.10 * np.sin(2*np.pi*220*t)).astype(np.float32)
            # Demucs drum activity: clear sustained passage late in B.
            drums = np.zeros(len(t), dtype=np.float32)
            drums[48*sr:78*sr] = .3 * np.sin(2*np.pi*100*t[48*sr:78*sr])
            fb, fd, out = root/"b.wav", root/"drums.wav", root/"bref.wav"
            sf.write(fb, b, sr, subtype="PCM_16")
            sf.write(fd, drums, sr, subtype="PCM_16")
            picked = fusion.make_independent_style_reference(
                fb, out, max_seconds=20, activity_audio_path=fd)
            self.assertGreater(picked["startSeconds"], 35)
            self.assertEqual(picked["activitySource"], "b-drums")
            self.assertIs(picked["containsSourceA"], False)
            with sf.SoundFile(out) as wav:
                self.assertEqual(wav.frames, 20*sr)

    def test_one_anchor_tempo_tonic_and_bass_source(self):
        prompt = fusion.build_fusion_prompt(
            "A musical, clean club remix with a recognizable theme.",
            {"tempoBpm": 110, "tempoConfidence": .9,
             "key": "C minor", "keyConfidence": .9},
            {"tempoBpm": 126, "tempoConfidence": .9,
             "key": "D minor", "keyConfidence": .9},
            target_bpm=126, target_key="C minor", bass_from="b",
            requested_seconds=240)
        self.assertIn("ONE mandatory target tempo: 126.0 BPM", prompt)
        self.assertIn("ONE mandatory tonal center: C minor", prompt)
        self.assertIn("ONE recognizable main hook", prompt)
        self.assertIn("bass timbre and rhythmic vocabulary from B", prompt)
        self.assertIn("same", prompt.lower())
        self.assertNotIn("DJ mix", prompt.split("Creator direction:")[-1])


if __name__ == "__main__":
    unittest.main()
