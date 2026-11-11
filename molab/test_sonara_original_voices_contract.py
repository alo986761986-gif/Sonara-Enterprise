"""CPU-only safety contract for original-language dual-vocal Remix Pro V6."""
from __future__ import annotations
import ast
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent


def source(name):
    return (HERE / name).read_text(encoding="utf-8")


class VoiceContracts(unittest.TestCase):
    def test_all_changed_modules_have_valid_python_syntax(self):
        for name in ("sonara_remix_pro_original_voices.py",
                     "sonara_remix_pro_original_voices_install.py",
                     "sonara_remix_pro_v5.py", "sonara_remix_pro_r2_agent.py"):
            with self.subTest(name=name):
                ast.parse(source(name), filename=name)

    def test_v6_engine_restores_both_real_vocals(self):
        text = source("sonara_remix_pro_v5.py")
        self.assertIn("from sonara_remix_pro_original_voices import restore_original_voices", text)
        self.assertIn("vocals_a=vocals_a, vocals_b=vocals_b", text)
        self.assertIn("generated = original_mix", text)
        self.assertIn("if v6 is not None:", text)
        self.assertIn("voice_report = restore_original_voices(", text)

    def test_worker_passes_private_demucs_stems(self):
        text = source("sonara_remix_pro_r2_agent.py")
        self.assertIn('vocals_a=source_a / "vocals.wav"', text)
        self.assertIn('vocals_b=source_b / "vocals.wav"', text)
        self.assertIn('"sonara_remix_pro_original_voices.py"', text)
        self.assertIn('"translationPerformed": False', text)

    def test_no_translation_or_speech_cloning(self):
        text = source("sonara_remix_pro_original_voices.py")
        self.assertIn("'transcriptionOrTranslationPerformed': False", text)
        self.assertIn("'modelGeneratedLeadVocalsRetained': False", text)
        self.assertIn("('drums', 'bass', 'other')", text)
        self.assertIn("if destination.exists()", text)
        self.assertIn("lease_check('vocal_arrangement')", text)
        self.assertNotIn("from transformers import", text)
        self.assertNotIn("translate(", text)
        self.assertNotIn("tts(", text)

    def test_maintenance_is_idle_only_and_has_rollback(self):
        text = source("sonara_remix_pro_original_voices_install.py")
        self.assertIn("two_idle_heartbeats(pid)", text)
        self.assertIn("if not idle(pid):", text)
        self.assertIn("SONARA_VOICES_ROLLBACK_COMPLETED=True", text)
        self.assertNotIn("SIGKILL", text)


if __name__ == "__main__":
    unittest.main()
