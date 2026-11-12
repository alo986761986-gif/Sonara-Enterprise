"""Offline safety tests for private SONARA V7 reconnect. No GPU, jobs or network."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parent / "sonara_v7_full_runtime_reconnect.py"
spec = importlib.util.spec_from_file_location("sonara_v7_full_reconnect", SOURCE)
reconnect = importlib.util.module_from_spec(spec)
spec.loader.exec_module(reconnect)


class SafeReconnectTests(unittest.TestCase):
    def test_private_modules_are_all_version_pinned(self):
        self.assertEqual(len(reconnect.REQUIRED_MODULES), 11)
        for path, sha in reconnect.REQUIRED_MODULES.items():
            self.assertTrue(path.endswith(".py"))
            self.assertRegex(sha, r"^[0-9a-f]{40}$")
            self.assertNotIn("ace-step", path)
            self.assertNotIn("main.py", path)
        self.assertIn("sonara_remix_pro_v7_rhythm.py",
                      reconnect.REQUIRED_MODULES)
        self.assertIn("sonara_remix_pro_v6.py",
                      reconnect.REQUIRED_MODULES)

    def test_missing_modules_block_without_ever_modifying(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with patch.object(reconnect,"PRIVATE",root), patch.object(reconnect,"HOME",root), patch.object(reconnect,"VENV",root), patch.object(reconnect,"TOKEN",root/"token"), patch.object(reconnect,"WORKER",root/"worker"):
                (root/"token").write_text("x"*40)
                (root/"worker").write_text("safe")
                with self.assertRaises(reconnect.Blocked):
                    reconnect.installed()
                self.assertEqual((root/"worker").read_text(),"safe")

    def test_fake_module_is_rejected_before_worker_start(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for name in reconnect.REQUIRED_MODULES:
                (root/name).write_text("not a trusted V7 release")
            (root/"token").write_text("x"*40)
            (root/"worker").write_text("safe")
            with patch.object(reconnect,"PRIVATE",root), patch.object(reconnect,"HOME",root), patch.object(reconnect,"VENV",root), patch.object(reconnect,"TOKEN",root/"token"), patch.object(reconnect,"WORKER",root/"worker"):
                with self.assertRaises(reconnect.Blocked):
                    reconnect.installed()

    def test_no_second_worker_is_launched_if_one_exists(self):
        with patch.object(reconnect,"worker_processes",return_value=[40440]), patch.object(reconnect,"fresh_status",return_value={"revision":reconnect.EXPECTED_REVISION}), patch.object(reconnect,"capability_check",return_value={
            "available": True,"fusionAvailable": True,"v5Available": True,
            "v6Available": True,"v7Available": True,"v7RhythmAvailable": True,
            "v7CreativeModesAvailable": True}), patch("subprocess.Popen") as launch:
            self.assertTrue(reconnect.ensure_pro_worker(Path("/venv/bin/python"),False))
            launch.assert_not_called()

    def test_readonly_checks_do_not_start_anything(self):
        with patch.object(reconnect,"installed"), patch.object(reconnect,"worker_processes",return_value=[]), patch.object(reconnect,"ace_health",return_value={}), patch.object(reconnect,"fresh_status",return_value={}), patch.object(reconnect,"capability_check",return_value={}), patch("subprocess.Popen") as launch:
            self.assertEqual(reconnect.main(False),0)
            launch.assert_not_called()


if __name__ == "__main__":
    unittest.main()
