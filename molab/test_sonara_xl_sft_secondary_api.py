"""Offline safety checks for secondary XL SFT API."""
import unittest
from unittest.mock import patch
import sonara_xl_sft_secondary_api as api

class TestSecondarySFT(unittest.TestCase):
    def test_correct_model_detection(self):
        self.assertTrue(api.ready({"models_initialized": True, "loaded_model": api.MODEL}, api.MODEL))
        self.assertFalse(api.ready({"models_initialized": True, "loaded_model": api.TURBO}, api.MODEL))

    def test_missing_runtime_does_not_start_any_process(self):
        with patch.object(api, "ROOT") as root:
            root.__truediv__.return_value.is_file.return_value = False
            with patch.object(api.subprocess, "Popen") as popen:
                self.assertEqual(api.execute(activate=True), 1)
                popen.assert_not_called()

    def test_secondary_port_is_distinct(self):
        self.assertNotEqual(api.PORT, 8001)
        self.assertEqual(api.PORT, 8003)

if __name__ == "__main__":
    unittest.main()
