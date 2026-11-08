"""Safe offline quality checks for SONARA Remix Pro; no GPU/model downloads."""
from __future__ import annotations
import json
import math
import tempfile
import unittest
import wave
from pathlib import Path
from unittest import mock

from sonara_remix_pro_toolkit import (
    RemixProError, STEM_NAMES, VERSION, audio_hash, analyze_audio,
    combine_two_songs, preflight, separate_stems, source_file, transparent_master,
    _dual_source_parts, add_generated_percussion
)


def fixture(path, seconds=3, rate=22050, frequency=440):
    import numpy as np
    times = np.arange(int(seconds * rate), dtype=np.float64) / rate
    # Periodic signal with a measured source WAV; never masquerades as a full song.
    signal = (0.08 * np.sin(2 * np.pi * frequency * times)).astype(np.float32)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(rate)
        handle.writeframes((signal * 32767).astype("<i2").tobytes())


class SONARARemixProTests(unittest.TestCase):
    def test_dual_source_wav_contains_both_melodies_after_mastering(self):
        import numpy as np
        import soundfile as sf
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            sources, folders = [], []
            sr = 44100
            t = np.arange(sr*12)/sr
            for label, frequency in (("a",330), ("b",550)):
                source, folder = root/(label+".wav"), root/label
                fixture(source, seconds=12, frequency=frequency)
                folder.mkdir()
                for name in STEM_NAMES:
                    y = .1*np.sin(2*np.pi*frequency*t) if name == "other" else np.zeros(len(t))
                    sf.write(folder/(name+".wav"), np.column_stack([y,y]), sr)
                (folder/"stems-manifest.json").write_text(json.dumps({
                    "sourceSha256":audio_hash(source), "separationModel":"htdemucs", "stemsVerified":True
                }))
                sources.append(source)
                folders.append(folder)
            output = root/"mix.wav"
            with mock.patch("sonara_remix_pro_toolkit.analyze_audio", return_value={
                "tempoBpm":120, "beatTimesSeconds":[0], "key":None
            }):
                report = combine_two_songs(*sources, *folders, output, dual_source=True, max_seconds=30)
            mixed, rate = sf.read(output)
            self.assertEqual(rate, sr)
            self.assertEqual(len(mixed), sr*12)
            self.assertTrue(report["bothSourcesVerified"])
            self.assertEqual(set(report["stemRoles"]), {"tonalA","tonalB","drumsA","drumsB"})
            for start, frequency in ((2,330),(8,550)):
                segment = mixed[start*sr:(start+1)*sr,0]
                amp = abs(np.dot(segment,np.exp(-2j*np.pi*frequency*np.arange(sr)/sr)))/sr
                self.assertGreater(amp,.01)

    def test_both_tonal_identities_survive_even_without_b_drums(self):
        import numpy as np
        sr = 44100
        t = np.arange(sr * 18) / sr
        def stems(folder, name):
            # Two analytically distinct melodies; percussion intentionally zero.
            frequency = 330 if folder == "a" else 550
            y = .1 * np.sin(2 * np.pi * frequency * t) if name == "other" else np.zeros(len(t))
            return np.column_stack([y, y]).astype(np.float32)
        with mock.patch("sonara_remix_pro_toolkit._load_stem", side_effect=stems):
            parts, length = _dual_source_parts("a", "b", len(t), 1., 0, 120)
        mix = sum(audio * gain for audio, gain in parts.values())
        self.assertEqual(length, len(t))
        def amplitude(frequency, start):
            segment = mix[sr*start:sr*(start+1), 0]
            return abs(np.dot(segment, np.exp(-2j*np.pi*frequency*np.arange(sr)/sr))) / sr
        self.assertGreater(amplitude(330, 2), .025)
        self.assertLess(amplitude(550, 2), 1e-5)
        self.assertGreater(amplitude(550, 10), .025)
        self.assertLess(amplitude(330, 10), 1e-5)

    def test_missing_b_tonal_audio_is_not_reported_as_a_two_song_remix(self):
        import numpy as np
        def stems(folder, name):
            return np.full((44100*12, 2), .05 if folder == "a" else 0, dtype=np.float32)
        with mock.patch("sonara_remix_pro_toolkit._load_stem", side_effect=stems):
            with self.assertRaisesRegex(RemixProError, "Source B"):
                _dual_source_parts("a", "b", 44100*12, 1., 0, 120)

    def test_dual_source_stops_at_shorter_aligned_source(self):
        import numpy as np
        def stems(folder, name):
            seconds = 30 if folder == "a" else 12
            return np.full((44100*seconds, 2), .05, dtype=np.float32)
        with mock.patch("sonara_remix_pro_toolkit._load_stem", side_effect=stems):
            _, length = _dual_source_parts("a", "b", 44100*30, 1., -44100, 120)
        self.assertEqual(length, 44100*11)

    def test_generated_percussion_cannot_replace_original_melodies(self):
        import numpy as np
        import soundfile as sf
        with tempfile.TemporaryDirectory() as d:
            original, drums = Path(d)/"arranged.wav", Path(d)/"drums.wav"
            sr = 44100
            t = np.arange(sr*12)/sr
            melody = .1*np.sin(2*np.pi*330*t) + .1*np.sin(2*np.pi*550*t)
            sf.write(original, np.column_stack([melody, melody]), sr, subtype="FLOAT")
            percussion = .9*np.sin(2*np.pi*1000*t)
            sf.write(drums, np.column_stack([percussion, percussion]), sr, subtype="FLOAT")
            with mock.patch("sonara_remix_pro_toolkit.analyze_audio", return_value={
                "tempoBpm":120, "beatTimesSeconds":[0]
            }):
                final, rate = add_generated_percussion(original, drums, bpm=120)
            self.assertEqual(rate, sr)
            self.assertEqual(len(final), len(melody))
            reference, _ = sf.read(original, dtype="float32", always_2d=True)
            addition = final-reference
            self.assertLessEqual(float(np.sqrt(np.mean(addition**2))/np.sqrt(np.mean(reference**2))), .126)
            for frequency in (330, 550):
                amplitude = abs(np.dot(final[:,0],np.exp(-2j*np.pi*frequency*t)))/len(t)
                self.assertAlmostEqual(amplitude, .05, places=5)

    def test_generated_unmeasured_tempo_fails_instead_of_replacing_mix(self):
        import numpy as np
        import soundfile as sf
        with tempfile.TemporaryDirectory() as d:
            original = Path(d)/"arranged.wav"
            sf.write(original, np.full((44100*12, 2), .05), 44100)
            with mock.patch("sonara_remix_pro_toolkit.analyze_audio", return_value={"tempoBpm":None}):
                with self.assertRaisesRegex(RemixProError, "tempo could not be verified"):
                    add_generated_percussion(original, Path(d)/"drums.wav", bpm=120)

    def test_preflight_truthful(self):
        info = preflight()
        self.assertEqual(info["version"], VERSION)
        self.assertFalse(info["demucsModelVerified"])
        self.assertFalse(info["gpuInferenceVerified"])

    def test_audio_path_and_fingerprint(self):
        with tempfile.TemporaryDirectory() as d:
            good = Path(d) / "a.wav"
            fixture(good)
            self.assertEqual(source_file(good), good.resolve())
            self.assertEqual(audio_hash(good), audio_hash(good))
            self.assertEqual(len(audio_hash(good)), 64)
            with self.assertRaises(RemixProError):
                source_file(Path(d) / "missing.wav")
            strange = Path(d) / "a.json"
            strange.write_text("{}")
            with self.assertRaises(RemixProError):
                source_file(strange)

    def test_measured_not_fake_tempo_and_key(self):
        with tempfile.TemporaryDirectory() as d:
            silence = Path(d) / "silence.wav"
            with wave.open(str(silence), "wb") as wav:
                wav.setnchannels(1)
                wav.setsampwidth(2)
                wav.setframerate(22050)
                wav.writeframes(b"\x00\x00" * 22050 * 3)
            report = analyze_audio(silence)
            self.assertIsNone(report["tempoBpm"])
            self.assertIsNone(report["key"])
            self.assertIn("silence-or-empty", report["warnings"])

    def test_stems_are_real_files_with_source_cache_binding(self):
        import numpy as np
        with tempfile.TemporaryDirectory() as d:
            folder = Path(d)
            source = folder / "song.wav"
            fixture(source)
            def fake_demucs(cmd, **kwargs):
                self.assertIn("demucs.separate", cmd)
                self.assertIn("--out", cmd)
                scratch = Path(cmd[cmd.index("--out") + 1])
                output = scratch / "htdemucs" / source.stem
                output.mkdir(parents=True, exist_ok=True)
                for name in STEM_NAMES:
                    fixture(output / (name + ".wav"))
                return mock.Mock(returncode=0)
            with mock.patch("sonara_remix_pro_toolkit.subprocess.run", side_effect=fake_demucs) as called:
                manifest = separate_stems(source, folder / "cache")
                self.assertTrue(manifest["stemsVerified"])
                self.assertEqual(manifest["sourceSha256"], audio_hash(source))
                self.assertEqual(set(manifest["stemFiles"]), set(STEM_NAMES))
                self.assertTrue((folder / "cache" / audio_hash(source)[:20] / "stems-manifest.json").exists())
                second = separate_stems(source, folder / "cache")
                self.assertEqual(manifest, second)
                self.assertEqual(called.call_count, 1)

    def test_bad_stems_cannot_be_used_for_other_source(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            a, b = root / "a.wav", root / "b.wav"
            fixture(a, seconds=3, frequency=330)
            fixture(b, seconds=3, frequency=440)
            fake_a = root / "stem-a"
            fake_b = root / "stem-b"
            fake_a.mkdir()
            fake_b.mkdir()
            (fake_a / "stems-manifest.json").write_text(json.dumps({
                "sourceSha256": audio_hash(a), "separationModel": "htdemucs", "stemsVerified": True
            }))
            (fake_b / "stems-manifest.json").write_text(json.dumps({
                "sourceSha256": audio_hash(a), "separationModel": "htdemucs", "stemsVerified": True
            }))
            with mock.patch("sonara_remix_pro_toolkit.analyze_audio", return_value={
                "tempoBpm": 120, "key": None, "beatTimesSeconds": [0.4]
            }):
                with self.assertRaisesRegex(RemixProError, "Stem manifest does not belong"):
                    combine_two_songs(a, b, fake_a, fake_b, root / "remix.wav",
                                      bpm_a=120, bpm_b=120)

    def test_true_peak_and_loudness_report(self):
        import numpy as np
        sr = 44100
        t = np.arange(sr * 2) / sr
        stereo = np.column_stack([0.9 * np.sin(2 * np.pi * 997 * t),
                                  0.9 * np.sin(2 * np.pi * 997 * t)])
        result, report = transparent_master(stereo.astype(np.float32), sr=sr)
        self.assertTrue(np.isfinite(result).all())
        self.assertLessEqual(np.max(np.abs(result)), 1.0)
        self.assertLessEqual(report["approxTruePeakDb"], -0.95)
        self.assertEqual(report["peakCeilingDbTP"], -1.0)
        self.assertIn("lufsAfter", report)


if __name__ == "__main__":
    unittest.main()
