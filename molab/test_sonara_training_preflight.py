import json
import tempfile
import unittest
import wave
from pathlib import Path
from sonara_training_preflight import audit_dataset


class TrainingGateTests(unittest.TestCase):
    def wav(self, path, value):
        with wave.open(str(path), "wb") as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(16000)
            audio.writeframes(bytes([value, 0]) * 16000 * 6)

    def make(self, tmp, rows):
        root = Path(tmp)
        (root / 'dataset.json').write_text(json.dumps(rows), encoding='utf-8')
        return audit_dataset(root / 'dataset.json', root)

    def test_missing_recordings_never_train(self):
        with tempfile.TemporaryDirectory() as folder:
            rows = [{
                'audio_path': 'missing.wav', 'license_type': 'OWNED',
                'rights_to_train': True, 'synthetic': False,
                'instrument_family': 'acoustic-drums', 'prompt': 'Live drums'
            }] * 60
            report = self.make(folder, rows)
            self.assertFalse(report['readyForTraining'])
            self.assertFalse(report['readyForPromotion'])
            self.assertEqual(report['verifiedRealFiles'], 0)

    def test_unlicensed_training_never_passes(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.wav(root / 'clip.wav', 16)
            rows = [{
                'audio_path': 'clip.wav', 'license_type': 'EXPLICITLY_LICENSED',
                'rights_to_train': True, 'synthetic': False,
                'instrument_family': 'acoustic-drums', 'prompt': 'Drums'
            }] * 8
            report = self.make(folder, rows)
            self.assertFalse(report['readyForTraining'])
            self.assertIn('row-0:license-evidence-required', report['issues'])

    def test_duplicate_and_traversal_blocked(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.wav(root / 'clip.wav', 16)
            rows = []
            for i in range(8):
                rows.append({
                    'audio_path': '../outside.wav' if i == 0 else 'clip.wav',
                    'license_type': 'OWNED', 'rights_to_train': True,
                    'synthetic': False, 'instrument_family': 'bass',
                    'prompt_override': 'Human bass'
                })
            report = self.make(folder, rows)
            self.assertFalse(report['readyForTraining'])
            self.assertTrue(any('missing-unsafe-or-duplicate-audio' in x for x in report['issues']))

    def test_valid_development_dataset_not_automatically_promotable(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            rows = []
            for i in range(8):
                name = f'clip_{i}.wav'
                self.wav(root / name, i + 1)
                rows.append({
                    'audio_path': name, 'license_type': 'OWNED',
                    'rights_to_train': True, 'synthetic': False,
                    'instrument_family': list(sorted((
                        'acoustic-drums','piano-keys','guitars-fretted','bass',
                        'bowed-strings','brass-woodwinds'
                    )))[i % 6], 'prompt_override': 'Real human phrase',
                    'phrase_level_performance': True
                })
            report = self.make(folder, rows)
            self.assertTrue(report['readyForTraining'])
            self.assertFalse(report['readyForPromotion'])
