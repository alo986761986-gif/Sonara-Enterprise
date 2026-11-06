"""Ranking regressions: never certify BPM from spectral support."""
import unittest
from sonara_tempo_evidence import rank_candidates, candidate_sort_key


def item(score, *, verified=False, support=None):
    return {
        'score': score,
        'tempo': {'bpmVerified': verified, 'bpmStatus': 'verified' if verified else 'mismatch'},
        'tempoEvidence': {'available': support is not None, 'support': support}
    }


class TempoRankingTests(unittest.TestCase):
    def test_pulse_support_can_choose_b_over_a_if_neither_verified(self):
        a, b = item(95, support=0.00), item(90, support=0.78)
        self.assertIs(rank_candidates([a, b])[0], b)

    def test_verification_always_outranks_pulse_hint(self):
        a, b = item(85, verified=True, support=0.05), item(98, support=0.95)
        self.assertIs(rank_candidates([a, b])[0], a)

    def test_rank_never_changes_verification_data(self):
        a, b = item(95, support=0.00), item(90, support=0.78)
        ranked = rank_candidates([a, b])
        self.assertEqual([v['tempo']['bpmVerified'] for v in ranked], [False, False])
        self.assertEqual([a['score'], b['score']], [95, 90])

    def test_fallback_retains_original_quality_ranking(self):
        a, b = item(95), item(90)
        self.assertIs(rank_candidates([a, b])[0], a)

    def test_bad_evidence_cannot_be_treated_as_verified(self):
        a, b = item(50, support=1.0), item(90, verified=True)
        self.assertGreater(candidate_sort_key(b), candidate_sort_key(a))

    def test_repetitive_audio_cannot_outrank_natural_audio_only_by_bpm(self):
        from sonara_tempo_evidence import rank_candidates
        repeated = item(90, support=1.0)
        repeated['audio'] = {'ok': True, 'rhythmicRepetitionRisk': True}
        natural = item(85, support=0.55)
        natural['audio'] = {'ok': True, 'rhythmicRepetitionRisk': False}
        self.assertIs(rank_candidates([repeated, natural])[0], natural)

    def test_clipped_audio_never_wins_on_tempo_support_alone(self):
        from sonara_tempo_evidence import rank_candidates
        clipped = item(95, support=1.0)
        clipped['audio'] = {'ok': True, 'clippingRatio': 0.02}
        clean = item(85, support=0.4)
        clean['audio'] = {'ok': True, 'clippingRatio': 0}
        self.assertIs(rank_candidates([clipped, clean])[0], clean)

    def test_unverified_85_bpm_is_not_a_verified_170_bpm(self):
        a = item(99, support=0.9)
        a['tempo'] = {'requestedBpm': 170, 'detectedBpm': 85,
                      'bpmStatus': 'octave-ambiguous', 'bpmVerified': False}
        self.assertFalse(a['tempo']['bpmVerified'])
        self.assertFalse(candidate_sort_key(a)[1])

    def test_real_synthetic_clicks_support_requested_170_over_140(self):
        import tempfile
        import wave
        import numpy as np
        from pathlib import Path
        from sonara_tempo_evidence import tempo_evidence

        def write_click(path, bpm):
            rate, seconds = 12000, 30
            samples = np.zeros(rate * seconds, dtype=np.float32)
            ticks = np.arange(0, len(samples), rate * 60.0 / bpm).astype(int)
            for tick in ticks:
                tail = min(220, len(samples) - tick)
                samples[tick:tick + tail] += (
                    np.exp(-np.arange(tail) / 40.0) * 0.8
                ).astype(np.float32)
            pcm = np.clip(samples * 32767, -32768, 32767).astype("<i2")
            with wave.open(str(path), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(rate)
                wav.writeframes(pcm.tobytes())

        with tempfile.TemporaryDirectory() as tmp:
            p170 = Path(tmp) / "170.wav"
            p140 = Path(tmp) / "140.wav"
            write_click(p170, 170)
            write_click(p140, 140)
            good = tempo_evidence(p170, 170)
            wrong = tempo_evidence(p140, 170)
            self.assertTrue(good["available"])
            self.assertTrue(wrong["available"])
            self.assertGreater(good["support"], wrong["support"] + 0.2)
            self.assertFalse(good["verified"])
            self.assertFalse(wrong["verified"])
            self.assertEqual(len(good["windowStrengths"]), 3)

    def test_silence_never_provides_ranking_evidence(self):
        import tempfile
        import wave
        from pathlib import Path
        from sonara_tempo_evidence import tempo_evidence
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "silence.wav"
            with wave.open(str(path), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(12000)
                wav.writeframes(bytes(12000 * 22 * 2))
            self.assertFalse(tempo_evidence(path, 170)["available"])


if __name__ == "__main__":
    unittest.main()
