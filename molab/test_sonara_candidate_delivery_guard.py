import unittest
import importlib.util
from pathlib import Path

from sonara_candidate_delivery_guard import select_deliverable_candidates


def candidate(score, ok=True, duration=30.0):
    return {
        "score": score,
        "audio": {
            "ok": ok,
            "durationSeconds": duration,
            "sampleRate": 48000,
            "channels": 2,
        },
    }


class CandidateGuardTests(unittest.TestCase):
    def test_single_file_agent_embeds_delivery_guard(self):
        agent_path = Path(__file__).with_name("sonara_r2_pull_agent.py")
        spec = importlib.util.spec_from_file_location("sonara_relay_agent_guard_check", agent_path)
        agent = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(agent)
        candidates = [candidate(91), candidate(80, ok=False), candidate(88)]
        self.assertEqual(
            [item["score"] for item in agent.select_deliverable_candidates(candidates, 2)],
            [91, 88],
        )

    def test_relay_quality_metrics_do_not_cancel_antiphase_stereo(self):
        import math
        import struct
        import tempfile
        import wave

        agent_path = Path(__file__).with_name("sonara_r2_pull_agent.py")
        spec = importlib.util.spec_from_file_location("sonara_relay_audio_check", agent_path)
        agent = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(agent)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "opposite_phase.wav"
            with wave.open(str(path), "wb") as wav:
                wav.setnchannels(2)
                wav.setsampwidth(2)
                wav.setframerate(48000)
                frames = bytearray()
                for i in range(4800):
                    sample = round(0.65 * 32767 * math.sin(2 * math.pi * 440 * i / 48000))
                    frames.extend(struct.pack("<hh", sample, -sample))
                wav.writeframes(frames)
            report = agent.wav_quality_report(path)
            self.assertTrue(report["ok"])
            self.assertGreater(report["peakDb"], -5)
            self.assertGreater(report["rmsDb"], -10)
            self.assertLess(report["silenceRatio"], 0.02)

    def test_delivers_two_valid_candidates_in_score_order(self):
        result = select_deliverable_candidates(
            [candidate(82), candidate(96), candidate(89)], 2
        )
        self.assertEqual([item["score"] for item in result], [96, 89])

    def test_skips_corrupt_candidate_b_when_spare_exists(self):
        result = select_deliverable_candidates(
            [candidate(94), candidate(99, ok=False), candidate(78)], 2
        )
        self.assertEqual([item["score"] for item in result], [94, 78])

    def test_rejects_incomplete_ab_before_upload(self):
        with self.assertRaisesRegex(RuntimeError, "Insufficient valid PCM"):
            select_deliverable_candidates(
                [candidate(90), candidate(0, ok=False)], 2
            )

    def test_never_promotes_invalid_pcm_even_with_high_score(self):
        selected = select_deliverable_candidates(
            [candidate(99, duration=0), candidate(80)], 1
        )
        self.assertEqual(selected[0]["score"], 80)

    def test_non_finite_score_is_not_deliverable(self):
        with self.assertRaises(RuntimeError):
            select_deliverable_candidates([candidate(float("nan"))], 1)

    def test_below_perfect_score_is_not_rejected_as_unmusical(self):
        selected = select_deliverable_candidates([candidate(25)], 1)
        self.assertEqual(selected[0]["score"], 25)


if __name__ == "__main__":
    unittest.main()
