"""Offline checks for private XL SFT audio verification."""
import io
import unittest
import wave
from unittest.mock import patch
import sonara_xl_sft_private_smoke as smoke

class SFTSmokeTests(unittest.TestCase):
    def test_output_path_from_result(self):
        self.assertEqual(smoke.audio_path({"result": '[{"audio_path":"/tmp/sample.wav"}]'}), "/tmp/sample.wav")
        self.assertIsNone(smoke.audio_path({"result": "[]"}))

    def test_quality_profile_has_sft_50_steps(self):
        payload = smoke.request_payload()
        self.assertEqual(payload["model"], smoke.SFT_NAME)
        self.assertEqual(payload["inference_steps"], 50)
        self.assertEqual(payload["audio_duration"], 10)
        self.assertEqual(payload["batch_size"], 1)

    def test_check_mode_does_not_submit_audio_job(self):
        with patch.object(smoke, "available", return_value=True), patch.object(smoke, "local") as api:
            self.assertEqual(smoke.run(test=False), 0)
            api.assert_not_called()

    def test_untrusted_host_cannot_be_requested(self):
        with self.assertRaises(ValueError):
            smoke.local("https://example.org", "/health")

if __name__ == "__main__":
    unittest.main()
