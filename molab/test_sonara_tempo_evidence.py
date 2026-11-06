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

    def test_unverified_85_bpm_is_not_a_verified_170_bpm(self):
        a = item(99, support=0.9)
        a['tempo'] = {'requestedBpm': 170, 'detectedBpm': 85,
                      'bpmStatus': 'octave-ambiguous', 'bpmVerified': False}
        self.assertFalse(a['tempo']['bpmVerified'])
        self.assertFalse(candidate_sort_key(a)[0])


if __name__ == "__main__":
    unittest.main()
