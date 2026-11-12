"""CPU-only safety tests: SONARA V7 isolated CUDA environment recovery."""
import importlib.util
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch, MagicMock

SOURCE = Path(__file__).resolve().parent / "sonara_v7_private_python_recovery.py"
spec=importlib.util.spec_from_file_location("sonara_private_venv_recovery",SOURCE)
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class V7PrivatePythonRecoveryTests(unittest.TestCase):
    def test_module_blobs_locked_to_all_v7_revisions(self):
        self.assertEqual(len(mod.V7_BLOBS),11)
        self.assertIn("sonara_remix_pro_v7_rhythm.py",mod.V7_BLOBS)
        self.assertIn("sonara_remix_pro_v6.py",mod.V7_BLOBS)
        self.assertTrue(all(len(h)==40 for h in mod.V7_BLOBS.values()))
        self.assertEqual(mod.GPU_HELPER_SHA,"e3e1b9bf461b357602d2aee87b638dda663e59b8")

    def test_does_not_replace_unknown_local_v7_module(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            home=root/"private"
            home.mkdir()
            (home/"relay.token").write_text("x"*48)
            for name in mod.V7_BLOBS:
                (root/name).write_text("unknown audio module")
            with patch.object(mod,"ROOT",root), patch.object(mod,"HOME",home),patch.object(mod,"TOKEN",home/"relay.token"),patch.object(mod,"VENV",root/".venv"):
                with self.assertRaises(mod.RecoveryBlocked):
                    mod.checked_private_state()
            self.assertEqual((root/"sonara_remix_pro_v7.py").read_text(),"unknown audio module")

    def test_gpu_helper_must_not_overwrite_unrecognized_existing_source(self):
        with tempfile.TemporaryDirectory() as folder:
            helper=Path(folder)/"sonara_remix_pro_gpu_setup.py"
            helper.write_text("not the audited GPU source")
            with patch.object(mod,"GPU_HELPER",helper):
                with self.assertRaises(mod.RecoveryBlocked):
                    mod.restore_gpu_helper()
            self.assertEqual(helper.read_text(),"not the audited GPU source")

    def test_does_not_replace_existing_private_virtualenv(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            venv=root/".venv"
            venv.mkdir()
            with patch.object(mod,"VENV",venv),patch.object(mod,"private_python",return_value=venv/"bin/python"),patch("subprocess.run") as run:
                self.assertFalse(mod.create_venv_only_if_missing())
                run.assert_not_called()

    def test_missing_or_unapproved_token_prevents_install(self):
        with patch.object(mod,"checked_private_state"),patch.object(mod,"authorized_gateway",return_value=False),patch.object(mod,"gpu_preflight") as gpu,patch.object(mod,"create_venv_only_if_missing") as create:
            with self.assertRaises(mod.RecoveryBlocked):
                mod.main(True)
            gpu.assert_not_called()
            create.assert_not_called()

    def test_readonly_stops_before_gpu_or_disk_mutations(self):
        with patch.object(mod,"checked_private_state"),patch.object(mod,"authorized_gateway",return_value=True),patch.object(mod,"gpu_preflight") as gpu,patch.object(mod,"restore_gpu_helper") as helper,patch.object(mod,"create_venv_only_if_missing") as create:
            self.assertEqual(mod.main(False),0)
            gpu.assert_not_called()
            helper.assert_not_called()
            create.assert_not_called()

    def test_install_keeps_main_ace_step_unmodified(self):
        with patch.object(mod,"checked_private_state"),patch.object(mod,"authorized_gateway",return_value=True),patch.object(mod,"gpu_preflight"),patch.object(mod,"restore_gpu_helper"),patch.object(mod,"create_venv_only_if_missing"),patch.object(mod,"install_audio_libraries"),patch.object(mod,"verify_private_gpu"),patch.object(mod,"verify_v7_imports"),patch("subprocess.Popen") as spawn:
            self.assertEqual(mod.main(True),0)
            spawn.assert_not_called()


if __name__=="__main__":
    unittest.main()
