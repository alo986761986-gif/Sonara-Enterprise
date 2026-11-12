"""CPU-only SONARA V7 regressions; never accesses customer files or jobs."""
from __future__ import annotations

import unittest
from sonara_remix_pro_v7 import (
    harmonic_guidance, arrange_vocal_phrases, measured_candidate_priority,
    mastering_safety_snapshot, authentic_a_groove_gain,
)


class V7DeepFusionTests(unittest.TestCase):
    def test_uncertain_keys_never_claim_harmonic_accuracy(self):
        report = harmonic_guidance({"key": "A minor", "keyConfidence": .9},
                                   {"key": "C major", "keyConfidence": .95})
        self.assertEqual(report["mode"], "different-estimated-tonal-centers")
        self.assertIn("Never pitch-shift", report["prompt"])
        uncertain = harmonic_guidance({"key": "A minor", "keyConfidence": .1}, {})
        self.assertEqual(uncertain["mode"], "key-uncertain")
        agreed = harmonic_guidance({"key": "A minor", "keyConfidence": .9},
                                   {"key": "A minor", "keyConfidence": .8})
        self.assertEqual(agreed["mode"], "compatible-estimated-tonal-centers")

    def test_authentic_voices_both_present_and_regions_advance(self):
        a = {"audible": True, "regions": [(i * 9., 7., .07) for i in range(12)]}
        b = {"audible": True, "regions": [(i * 10., 8., .09) for i in range(12)]}
        events, repeat, structure = arrange_vocal_phrases(a, b, 180, 124)
        self.assertEqual({e["role"] for e in events}, {"a", "b"})
        self.assertGreaterEqual(structure["voiceASeconds"], 5.)
        self.assertGreaterEqual(structure["voiceBSeconds"], 5.)
        self.assertFalse(repeat["a"])
        self.assertFalse(repeat["b"])
        for left, right in zip(events, events[1:]):
            self.assertLess(left["at"], right["at"])
            self.assertLessEqual(left["at"] + left["duration"], right["at"] + 1e-4)

    def test_groove_only_changes_gain_without_invented_hits(self):
        import numpy as np
        g = authentic_a_groove_gain(0, 44100 * 10, 44100, 124.)
        self.assertTrue(np.isfinite(g).all())
        self.assertGreaterEqual(float(g.min()), .97)
        self.assertLessEqual(float(g.max()), 1.02)
        original = np.zeros_like(g)
        original[::10000] = 1.
        rendered = original * g
        self.assertEqual(np.count_nonzero(original), np.count_nonzero(rendered))

    def test_candidate_metric_requires_original_voices(self):
        report = {"originalVoiceAUsed": True, "originalVoiceBUsed": True,
                  "modelGeneratedLeadVocalsRetained": False,
                  "originalPhrasesRepeatedToFill": {"a": False, "b": True}}
        self.assertLess(measured_candidate_priority(86., report, {"suspiciousJoins": 2}), 86.)
        with self.assertRaises(ValueError):
            measured_candidate_priority(86., {**report, "originalVoiceBUsed": False})

    def test_master_report_is_measured_not_fabricated(self):
        result = mastering_safety_snapshot({
            "integratedLufs": -14.1, "approxTruePeakDbTp": -1.1,
            "crestFactorDb": 11.3})
        self.assertEqual(result["measuredLufs"], -14.1)
        self.assertIs(result["qualityGateBypassed"], False)
        with self.assertRaises(ValueError):
            mastering_safety_snapshot({"integratedLufs": None})


if __name__ == "__main__":
    unittest.main()
