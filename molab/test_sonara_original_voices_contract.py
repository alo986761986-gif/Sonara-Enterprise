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
                     "sonara_remix_pro_a_clock_fusion.py",
                     "sonara_remix_pro_v5.py", "sonara_remix_pro_r2_agent.py"):
            with self.subTest(name=name):
                ast.parse(source(name), filename=name)

    def test_v6_engine_restores_both_real_vocals(self):
        text = source("sonara_remix_pro_v5.py")
        self.assertIn("from sonara_remix_pro_a_clock_fusion import compose_one_a_clock", text)
        self.assertIn("drums_a=a_drums, vocals_a=vocals_a, vocals_b=vocals_b", text)
        self.assertIn("generated = original_mix", text)
        self.assertIn("if v6 is not None:", text)
        self.assertIn("voice_report = compose_one_a_clock(", text)

    def test_worker_passes_private_demucs_stems(self):
        text = source("sonara_remix_pro_r2_agent.py")
        self.assertIn('vocals_a=source_a / "vocals.wav"', text)
        self.assertIn('vocals_b=source_b / "vocals.wav"', text)
        self.assertIn('"sonara_remix_pro_original_voices.py"', text)
        self.assertIn('"sonara_remix_pro_a_clock_fusion.py"', text)
        self.assertIn('a_drums=source_a / "drums.wav"', text)
        self.assertIn("if bpm_a is None:", text)
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

    def test_a_clock_one_drum_source_and_phrase_plan(self):
        text = source("sonara_remix_pro_a_clock_fusion.py")
        self.assertIn("a_drums = _choose_a_drum_loop(drums_a, tempo)", text)
        self.assertIn('"generatedDrumsDiscarded": True', text)
        self.assertIn('"onlyOneDeliberateDrumStem": True', text)
        self.assertIn("events, repeats, structure = _plan_vocals(", text)
        self.assertIn('"fixedChorusAlternation": False', text)
        self.assertIn("bass_gain = .65 * (1 - .24 * norm)", text)
        self.assertIn('sourceVocalsResung', text)
        self.assertIn('measured_peak > .92', text)

    def test_v6_reports_actual_phase_instead_of_always_ace_step(self):
        worker = source("sonara_remix_pro_r2_agent.py")
        controls = source("sonara_remix_pro_v5.py")
        bridge = source("sonara_remix_pro_ace_bridge.py")
        self.assertIn('"vocal_fusion": "REMIX_VOCAL_FUSION_FAILED"', worker)
        self.assertIn('phase_callback=mark_render_phase', worker)
        self.assertIn('phase_callback("vocal_fusion" if v6 is not None else "mastering")', controls)
        self.assertIn('phase_callback("quality_gate")', controls)
        self.assertIn('"instruction": instruction.strip() if instruction is not None', bridge)
        self.assertIn('phase_callback("ace_step")', controls)
        self.assertIn('**({"instruction": (', controls)

    def test_maintenance_is_idle_only_and_has_rollback(self):
        text = source("sonara_remix_pro_original_voices_install.py")
        self.assertIn("two_idle_heartbeats(pid)", text)
        self.assertIn("if not idle(pid):", text)
        self.assertIn("SONARA_VOICES_ROLLBACK_COMPLETED=True", text)
        self.assertNotIn("SIGKILL", text)


if __name__ == "__main__":
    unittest.main()
