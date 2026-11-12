"""SONARA V7 Rhythm Lock CPU-only tests, synthetic original-A kick.

No customer audio, GPU, network, tokens or jobs.
"""
from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from sonara_remix_pro_v7_rhythm import (
    rhythm_controls, measure_a_rhythm, retime_real_a_loop
)


class RhythmLockTests(unittest.TestCase):
    def test_allowlist_bounds_meter_and_phrase_grid(self):
        self.assertEqual(rhythm_controls(None)["meter"], "4/4")
        self.assertEqual(rhythm_controls({"tempoMode":"manual", "meter":"4/4",
            "phraseBars":16,"vocalGrid":"bar"})["phraseBars"],16)
        for settings in (
            {"meter":"3/4"}, {"phraseBars":12},
            {"tempoMode":"wild"}, {"bypassQC":True},
            {"vocalGrid":"quarter"}, {"phraseBars":True},
        ):
            with self.assertRaises(ValueError):
                rhythm_controls(settings)

    def test_rhythm_detects_real_kicks_and_does_not_invent_bpm(self):
        import numpy as np
        import soundfile as sf
        sample_rate=44100
        bpm=124
        samples=np.zeros((sample_rate*15,2),np.float32)
        kick=np.sin(2*np.pi*76*np.arange(2400)/sample_rate).astype(np.float32)
        kick*=np.exp(-np.arange(2400)/460).astype(np.float32)
        for t in np.arange(.14,15,60/bpm):
            pos=round(t*sample_rate)
            if pos+len(kick)<len(samples):
                samples[pos:pos+len(kick),0]+=.5*kick
                samples[pos:pos+len(kick),1]+=.5*kick
        with tempfile.TemporaryDirectory() as d:
            path=Path(d)/"a-drums.wav"
            sf.write(path,samples,sample_rate)
            result=measure_a_rhythm(path,report_bpm=124,tempo_mode="source-a")
            self.assertTrue(result["measured"])
            self.assertGreater(result["confidence"],.48)
            self.assertAlmostEqual(result["sourceBpm"],bpm,delta=1.0)
            self.assertEqual(result["meter"],"4/4")
            self.assertAlmostEqual(result["kickPhaseSeconds"],.14,delta=.07)
            manual=measure_a_rhythm(path,report_bpm=124,requested_bpm=128,
                                    tempo_mode="manual")
            self.assertAlmostEqual(manual["outputBpm"],128,delta=.001)
            self.assertGreater(manual["retimeRatio"],1.)
            # Previous error: requested BPM must never override source waveform
            # evidence to claim an unrelated BPM.
            with self.assertRaisesRegex(ValueError,"too far"):
                measure_a_rhythm(path,report_bpm=124,requested_bpm=170,
                                 tempo_mode="manual")

    def test_original_drums_only_pitch_preserving_retime(self):
        import numpy as np
        source=124.
        target=128.
        sample_rate=44100
        bars=2
        frames=round(bars*4*60/source*sample_rate)
        x=np.zeros((frames,2),dtype=np.float32)
        kick=np.sin(2*np.pi*80*np.arange(1800)/sample_rate).astype(np.float32)
        kick*=np.exp(-np.arange(1800)/380).astype(np.float32)
        for i in range(8):
            start=round(i*60/source*sample_rate)
            if start+len(kick)<=frames:
                x[start:start+len(kick)] += kick[:,None]*.35
        result=retime_real_a_loop(x,source_bpm=source,
                                  output_bpm=target,bars=bars)
        self.assertEqual(result.shape,
            (round(bars*4*60/target*sample_rate),2))
        self.assertTrue(np.isfinite(result).all())
        with self.assertRaises(ValueError):
            retime_real_a_loop(x,source_bpm=source,
                               output_bpm=170.,bars=bars)


if __name__ == "__main__":
    unittest.main()
