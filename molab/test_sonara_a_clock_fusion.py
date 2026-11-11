"""CPU-only synthetic signal tests for ONE A-derived kick and A/B voice fusion."""
from pathlib import Path
import tempfile
import unittest

import numpy as np
import soundfile as sf

from sonara_remix_pro_a_clock_fusion import (
    OneClockFusionError, _plan_vocals, compose_one_a_clock,
)


class HouseOneClockTests(unittest.TestCase):
    def test_phrase_plan_has_varied_lengths_and_no_chorus_blocks(self):
        a = {"audible": True, "regions": [(3, 3.2, .08), (18, 4.1, .07),
                                         (43, 3.4, .09)]}
        b = {"audible": True, "regions": [(5, 2.6, .06), (24, 5., .08),
                                         (56, 3.8, .06)]}
        events, repeats, structure = _plan_vocals(a, b, 120, 124)
        self.assertEqual({e["role"] for e in events}, {"a", "b"})
        self.assertFalse(structure["fixedChorusAlternation"])
        self.assertGreater(len(set(round(e["duration"], 1) for e in events)), 1)
        self.assertTrue(all(events[i+1]["at"] > events[i]["at"]
                            for i in range(len(events)-1)))

    def test_actual_render_has_single_clock_and_both_source_voices(self):
        sr = 44100
        length = 30 * sr
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            x = np.arange(length, dtype=np.float32) / sr
            t = np.arange(12 * sr, dtype=np.float32) / sr
            # Only the source A drum file has four-on-the-floor transients.
            kick = np.zeros(len(t), dtype=np.float32)
            for beat in np.arange(0, 12, .5):
                start = round(beat * sr)
                size = min(round(.17 * sr), len(kick) - start)
                kick[start:start+size] += (
                    .30 * np.exp(-np.arange(size)/(.053 * sr))
                    * np.sin(2*np.pi*58*np.arange(size)/sr)
                )
            def wav(name, audio):
                p = root / (name + ".wav")
                sf.write(p, np.asarray(audio, np.float32), sr,
                         subtype="FLOAT")
                return p
            drums = wav("source-a-drums", kick)
            bass = wav("generated-bass", .06 * np.sin(2*np.pi*86*x))
            other = wav("generated-other", .04 * np.sin(2*np.pi*500*x))
            a = np.zeros(length, np.float32)
            b = np.zeros(length, np.float32)
            for lo, hi in ((1, 5), (10, 14), (19, 23)):
                mask = (x >= lo) & (x < hi)
                a[mask] = .13 * np.sin(2*np.pi*225*x[mask])
            for lo, hi in ((3, 7), (12, 16), (22, 26)):
                mask = (x >= lo) & (x < hi)
                b[mask] = .12 * np.sin(2*np.pi*300*x[mask])
            voice_a = wav("voice-a", a)
            voice_b = wav("voice-b", b)
            destination = root / "fusion.wav"
            result = compose_one_a_clock(
                bass=bass, other=other, drums_a=drums, vocals_a=voice_a,
                vocals_b=voice_b, destination=destination,
                expected_seconds=30, tempo_a=120)
            self.assertEqual(result["tempoSource"], "A")
            self.assertTrue(result["onlyOneDeliberateDrumStem"])
            self.assertTrue(result["generatedDrumsDiscarded"])
            self.assertTrue(result["originalVoiceAUsed"])
            self.assertTrue(result["originalVoiceBUsed"])
            self.assertFalse(result["sourceVocalsResung"])
            with sf.SoundFile(str(destination)) as final:
                self.assertEqual(final.frames, length)
                self.assertEqual(final.channels, 2)
                output = final.read(dtype="float32", always_2d=True)
                self.assertTrue(np.isfinite(output).all())
                self.assertLessEqual(np.max(np.abs(output)), .925)

    def test_never_infer_b_as_a_clock_or_accept_unknown_tempo(self):
        a = {"audible": False, "regions": []}
        b = {"audible": True, "regions": [(0, 5, .05)]}
        with self.assertRaises(OneClockFusionError):
            _plan_vocals(a, b, 60, 120)
        with self.assertRaises(OneClockFusionError):
            _plan_vocals({"audible": True, "regions": [(0, 3, .05)]},
                         b, 30, 0)


if __name__ == "__main__":
    unittest.main()
