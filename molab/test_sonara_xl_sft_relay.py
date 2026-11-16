"""Unit checks for SFT engine selection and worker readiness without audio jobs."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("sft_relay_under_test", Path(__file__).parent / "sonara_r2_pull_agent.py")
relay = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(relay)


class SftRelayTests(unittest.TestCase):
    def tearDown(self):
        relay._SFT_PROBE.update(at=0.0, ready=False, lmReady=False)

    def test_sft_ready_from_private_8003_health_only(self):
        relay._SFT_PROBE.update(at=0.0, ready=False)
        with patch.object(relay, "request", return_value={"data": {
            "models_initialized": True, "loaded_model": relay.SFT_MODEL
        }}) as transport, patch.object(relay, "ace_headers", return_value={}):
            self.assertTrue(relay.sft_ready())
            self.assertEqual(transport.call_args.args[:2], ("GET", relay.SFT_LOCAL + "/health"))

    def test_wrong_model_never_claims_sft_ready(self):
        relay._SFT_PROBE.update(at=0.0, ready=False)
        with patch.object(relay, "request", return_value={
            "models_initialized": True, "loaded_model": "acestep-v15-xl-turbo"
        }), patch.object(relay, "ace_headers", return_value={}):
            self.assertFalse(relay.sft_ready())

    def test_sft_lm_planning_requires_real_4b_model(self):
        relay._SFT_PROBE.update(at=0.0, ready=False, lmReady=False)
        true_health = {"data": {
            "models_initialized": True, "loaded_model": relay.SFT_MODEL,
            "llm_initialized": True, "loaded_lm_model": "acestep-5Hz-lm-4B",
        }}
        with patch.object(relay, "request", return_value=true_health), patch.object(
            relay, "ace_headers", return_value={}
        ):
            self.assertTrue(relay.sft_status(force=True)["lmReady"])

        missing_lm = {"data": {
            "models_initialized": True, "loaded_model": relay.SFT_MODEL,
            "llm_initialized": False, "loaded_lm_model": None,
        }}
        with patch.object(relay, "request", return_value=missing_lm), patch.object(
            relay, "ace_headers", return_value={}
        ):
            status = relay.sft_status(force=True)
            self.assertTrue(status["ready"])
            self.assertFalse(status["lmReady"])

    def test_pro_lyric_audit_requires_actual_asr(self):
        payload = {"sonara_r2_generation_profile": "pro",
                   "vocal_mode": "female", "lyrics": "[Verse] Ciao amore"}
        transcriber = lambda method, path, data, timeout: {
            "data": {"lyric_accuracy": 0.93, "mismatch_ranges": [], "language": "it"}
        }
        report = relay.vocal_report("/tmp/song.wav", payload, transcriber)
        self.assertTrue(report["verified"])
        self.assertAlmostEqual(report["lyricAccuracy"], 0.93)
        with patch.object(relay, "local", side_effect=RuntimeError("ASR unavailable")):
            report = relay.vocal_report("/tmp/song.wav", payload)
            self.assertFalse(report["performed"])
            self.assertTrue(report["attempted"])
            self.assertIsNone(report["lyricAccuracy"])

    def test_instrumental_pro_does_not_trigger_transcription(self):
        payload = {"sonara_r2_generation_profile": "pro",
                   "vocal_mode": "instrumental", "lyrics": "[Instrumental]"}
        with patch.object(relay, "local") as transport:
            report = relay.vocal_report("/tmp/song.wav", payload)
            self.assertFalse(report["performed"])
            transport.assert_not_called()

    def test_explicit_local_urls_never_expose_external_hosts(self):
        with self.assertRaises(ValueError):
            relay.request("GET", "https://example.invalid/health")

    def test_existing_turbo_local_still_uses_8001(self):
        with patch.object(relay, "request", return_value={"ok": True}) as transport, patch.object(relay, "ace_headers", return_value={}):
            relay.local("GET", "/health")
            self.assertEqual(transport.call_args.args[1], "http://127.0.0.1:8001/health")
            relay.sft_local("GET", "/health")
            self.assertEqual(transport.call_args.args[1], "http://127.0.0.1:8003/health")


if __name__ == "__main__":
    unittest.main()
