"""V5 six-pillar contract tests: real synthetic WAV, no network or GPU jobs."""
from __future__ import annotations
from pathlib import Path
import math
import tempfile
import unittest
from unittest.mock import patch

from sonara_remix_pro_v5 import (
    GENRE_PROFILES, V5ControlError, build_v5_brief, v5_controls,
    drum_activity, professional_master, technical_score, continuity_report,
    continuous_pulse_report,
)


class RemixV5SixPillarsTests(unittest.TestCase):
    def test_opt_in_only_and_gpu_budget(self):
        for kwargs in ({}, {"v5": False}):
            with self.assertRaises(V5ControlError):
                v5_controls(kwargs, 90)
        valid = v5_controls({"v5": True, "candidateCount": 3, "genre": "house",
                             "bInfluence": 65, "durationMode": "auto"}, 90)
        self.assertEqual(valid["candidateCount"], 3)
        self.assertIn("humanized", GENRE_PROFILES["house"])
        for secs, count in ((150, 3), (240, 2), (480, 2)):
            with self.assertRaises(V5ControlError):
                v5_controls({"v5": True, "candidateCount": count}, secs)
        for kw in ({"genre": "../unsafe"}, {"bInfluence": 100},
                   {"candidateCount": 0}, {"durationMode": "unknown"}):
            with self.assertRaises(V5ControlError):
                v5_controls({"v5": True, **kw}, 90)

    def test_two_source_prompt_is_not_mashup(self):
        c = v5_controls({"v5": True, "bInfluence": 75, "genre": "latin-house",
                         "candidateCount": 2, "durationMode": "auto"}, 120)
        prompt = build_v5_brief("New latin house song", c,
                                drum_measurement={"onsetsPerSecond": 2.2,
                                                  "confidence": "measured-onset-proxy"},
                                candidate_index=1)
        self.assertIn("B's expressive rhythmic articulation", prompt)
        self.assertIn("not an overlay or medley", prompt)
        self.assertIn("INTRO -> HOOK", prompt)
        self.assertIn("natural", prompt.lower())

    def test_measurement_and_adaptive_peak_safe_master(self):
        import numpy as np
        import soundfile as sf
        sr = 22050
        n = sr * 3
        t = np.arange(n, dtype=np.float64) / sr
        # Synthetic music-like tones and hand-percussion transients.
        y = .12 * np.sin(2 * math.pi * 90 * t)
        y += .08 * np.sin(2 * math.pi * 440 * t)
        y += .12 * ((np.arange(n) % (sr // 2)) < 60)
        stereo = np.column_stack([y, y * .98]).astype("float32")
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "drums.wav"
            sf.write(str(path), stereo, sr)
            score = drum_activity(path)
            self.assertIn(score["density"], ("sparse", "moderate", "dense"))
            self.assertGreaterEqual(score["onsetsPerSecond"], 0.0)
            mastered, meta = professional_master(stereo, sr, genre="house")
            self.assertTrue(np.isfinite(mastered).all())
            self.assertEqual(mastered.shape, stereo.shape)
            self.assertLess(float(np.max(np.abs(mastered))), 1)
            self.assertFalse(meta["truePeakCertified"])
            self.assertEqual(meta["version"], "sonara-v5-adaptive-master")
            self.assertEqual(continuity_report(path)["measuredJoins"], 0)
            self.assertGreater(technical_score({
                "integratedLufs": -14, "crestFactorDb": 9,
                "nearSilenceFrameRatio": 0, "approxTruePeakDbTp": -1.4,
            }), 80)

    def test_explosive_continuity_measures_real_internal_gaps(self):
        import numpy as np
        import soundfile as sf
        sr=22050
        seconds=16
        t=np.arange(sr*seconds,dtype=np.float64)/sr
        # Bounded synthetic bass + drum pulse, music remains present throughout.
        kick=.16*np.sin(2*np.pi*85*t)
        keys=.065*np.sin(2*np.pi*620*t)
        steady=(kick+keys).astype("float32")
        broken=steady.copy()
        broken[7*sr:10*sr]=keys[7*sr:10*sr].astype("float32")
        silent=steady.copy()
        silent[7*sr:10*sr]=0
        with tempfile.TemporaryDirectory() as root:
            p=Path(root)
            a,b,c=(p/name for name in ("steady.wav","bass-gap.wav","silence.wav"))
            for name,values in ((a,steady),(b,broken),(c,silent)):
                sf.write(name,values,sr)
            fine=continuous_pulse_report(a)
            missing_bass=continuous_pulse_report(b)
            missing_audio=continuous_pulse_report(c)
            self.assertFalse(fine["hasUnwantedBreak"])
            self.assertTrue(missing_bass["hasUnwantedBreak"])
            self.assertTrue(missing_audio["hasUnwantedBreak"])
            self.assertGreaterEqual(missing_bass["longestLowBandGapSeconds"],1.75)
            self.assertGreaterEqual(missing_audio["longestInternalSilenceSeconds"],1.25)

    def test_no_fake_artistic_verification(self):
        from sonara_remix_pro_v5 import render_candidates
        import inspect
        text = inspect.getsource(render_candidates)
        self.assertIn('release_gate(guide, generated, mastered_path', text)
        self.assertIn('V5QualityRejected', text)
        self.assertIn('"artisticListeningRequired": True', text)


if __name__ == "__main__":
    unittest.main()
