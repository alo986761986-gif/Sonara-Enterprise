"""V10 CPU-only self-tests; use real synthetic WAV, never customer audio."""
import tempfile
import unittest
from pathlib import Path

import numpy as np
import soundfile as sf

from sonara_remix_pro_v10_music_profile import (
    REVISION, tonal_profile, compare_profiles, harmonic_direction,
    transition_report,
)

class V10ProfileTests(unittest.TestCase):
    def test_same_and_different_sources(self):
        with tempfile.TemporaryDirectory() as td:
            t = np.arange(3 * 44100) / 44100
            files = []
            for frequency in (220, 220, 440 * 2 ** (3/12)):
                path = Path(td) / f"test-{len(files)}.wav"
                sf.write(str(path), .3 * np.sin(2*np.pi*frequency*t), 44100)
                files.append(path)
            a, same, different = [tonal_profile(p) for p in files]
            self.assertEqual(a["revision"], REVISION)
            self.assertGreater(a["observations"], 0)
            self.assertEqual(compare_profiles(a, same)["relationship"], "similar-colour-proxy")
            difference = compare_profiles(a, different)
            self.assertNotEqual(difference["relationship"], "similar-colour-proxy")
            self.assertIn("A", harmonic_direction(difference))
            self.assertFalse(difference["verifiedKeyOrChords"])

    def test_silence_is_unverified(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "quiet.wav"
            sf.write(str(path), np.zeros(44100*3), 44100)
            p = tonal_profile(path)
            self.assertEqual(p["status"], "unverified")
            self.assertEqual(compare_profiles(p, p)["relationship"], "uncertain")

    def test_section_transition_evidence(self):
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "master.wav"
            sr = 44100
            t = np.arange(4*sr)/sr
            y = .1 * np.sin(2*np.pi*130*t)
            y[2*sr:] *= .04
            sf.write(str(path), np.stack([y,y],axis=1), sr)
            report = transition_report(path, [
                {"name":"first", "endSeconds":2.},
                {"name":"second", "endSeconds":4.},
            ])
            self.assertTrue(report["advisoryOnly"])
            self.assertEqual(report["needsListeningCount"], 1)
            self.assertGreater(report["maxRmsJumpDb"], 7.)

if __name__ == "__main__":
    unittest.main()
