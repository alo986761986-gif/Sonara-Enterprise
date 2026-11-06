"""Regression tests for real PCM pulse metering (never target-biased)."""
import math
import tempfile
import unittest
import wave
from array import array
from pathlib import Path

from sonara_bpm_verification import verify_wav_tempo


def write_click(path, bpm, *, with_hats=False, seconds=24, sample_rate=12000):
    beat = round(sample_rate * 60.0 / bpm)
    hat = round(sample_rate * 30.0 / bpm)
    samples = array('h')
    for i in range(seconds * sample_rate):
        kick_phase = i % beat
        val = 23000 * math.exp(-kick_phase / (0.006 * sample_rate)) if kick_phase < sample_rate * 0.03 else 0
        if with_hats:
            hat_phase = i % hat
            val += 4500 * math.exp(-hat_phase / (0.002 * sample_rate)) if hat_phase < sample_rate * 0.015 else 0
        samples.append(max(-32768, min(32767, int(val))))
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(sample_rate)
        wav.writeframes(samples.tobytes())


class TempoRegression(unittest.TestCase):
    def check_tempo(self, measured, requested, expected, *, hats=False):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'rhythm.wav'
            write_click(path, measured, with_hats=hats)
            report = verify_wav_tempo(path, requested)
            self.assertEqual(report['requestedBpm'], requested)
            self.assertAlmostEqual(report['detectedBpm'], measured, delta=2)
            self.assertEqual(report['bpmVerified'], expected)
            self.assertEqual(report['bpmStatus'] == 'verified', expected)

    def test_real_170_matches_170(self):
        self.check_tempo(170, 170, True)

    def test_85_must_not_be_relabelled_as_170(self):
        self.check_tempo(85, 170, False)

    def test_85_with_hats_must_not_be_relabelled_as_170(self):
        self.check_tempo(85, 170, False, hats=True)

    def test_exact_half_time_reports_ambiguity_not_false_mismatch(self):
        for hats in (False, True):
            with self.subTest(hats=hats):
                with tempfile.TemporaryDirectory() as folder:
                    path = Path(folder) / 'half-time.wav'
                    write_click(path, 85, with_hats=hats)
                    report = verify_wav_tempo(path, 170)
                    self.assertAlmostEqual(report['detectedBpm'], 85, delta=2)
                    self.assertEqual(report['bpmStatus'], 'octave-ambiguous')
                    self.assertTrue(report['tempoOctaveAmbiguous'])
                    self.assertFalse(report['bpmVerified'])

    def test_unrelated_tempos_remain_mismatches(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'wrong.wav'
            write_click(path, 120)
            report = verify_wav_tempo(path, 170)
            self.assertEqual(report['bpmStatus'], 'mismatch')
            self.assertFalse(report['bpmVerified'])

    def test_120_matches_120(self):
        self.check_tempo(120, 120, True)

    def test_170_with_hats_matches_170(self):
        self.check_tempo(170, 170, True, hats=True)

    def test_silence_cannot_be_verified(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'silence.wav'
            with wave.open(str(path), 'wb') as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(12000)
                wav.writeframes(bytes(12000 * 16 * 2))
            report = verify_wav_tempo(path, 170)
            self.assertEqual(report['bpmStatus'], 'unverified')
            self.assertFalse(report['bpmVerified'])
            self.assertIsNone(report['detectedBpm'])


if __name__ == '__main__':
    unittest.main()
