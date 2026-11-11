"""Offline safety tests for isolated SONARA RTX PRO 6000 V6 restoration."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parent / "sonara_remix_pro_v6_fresh_recovery.py"
spec = importlib.util.spec_from_file_location("sonara_v6_fresh_restore", SOURCE)
restore = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restore)


class FreshRecoveryTests(unittest.TestCase):
    def test_all_sources_pinned_and_no_main_engine_files(self):
        self.assertEqual(len(restore.BLOBS), 10)
        for name, sha in restore.BLOBS.items():
            self.assertTrue(name.endswith(".py"))
            self.assertRegex(sha, r"^[0-9a-f]{40}$")
            self.assertNotIn("ace-step", name)
        self.assertNotIn("main.py", restore.BLOBS)
        self.assertIn("sonara_remix_pro_original_voices.py", restore.BLOBS)
        self.assertIn("sonara_remix_pro_a_clock_fusion.py", restore.BLOBS)

    def test_git_blob_sha1(self):
        self.assertEqual(
            restore.git_blob(b"hello\n"),
            "ce013625030ba8dba906f756967f9e9ca394464a",
        )

    def test_unknown_existing_source_is_not_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            name = "sonara_remix_pro_toolkit.py"
            existing = root / name
            existing.write_text("user customization")
            with patch.object(restore, "ROOT", root):
                with self.assertRaises(restore.RecoveryBlocked):
                    restore.prepare_root({name:b"replacement"})
            self.assertEqual(existing.read_text(), "user customization")

    def test_root_symlink_is_not_followed(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "real"
            source.mkdir()
            link = Path(tmp) / "pro"
            link.symlink_to(source)
            with patch.object(restore, "ROOT", link):
                with self.assertRaises(restore.RecoveryBlocked):
                    restore.prepare_root({})

    def test_main_engine_accepts_nested_health(self):
        import io
        import json
        from unittest.mock import MagicMock
        response = MagicMock()
        response.__enter__.return_value = io.BytesIO(json.dumps({
            "data": {
                "status": "ok",
                "models_initialized": True,
                "llm_initialized": True,
                "loaded_model": "acestep-v15-xl-turbo",
                "loaded_lm_model": "acestep-5Hz-lm-4B",
            }
        }).encode())
        with patch.object(restore.urllib.request, "urlopen", return_value=response):
            restore.check_main_engine()

    def test_main_engine_rejects_uninitialized_nested_health(self):
        import io
        import json
        from unittest.mock import MagicMock
        response = MagicMock()
        response.__enter__.return_value = io.BytesIO(json.dumps({
            "data": {
                "models_initialized": False,
                "llm_initialized": True,
                "loaded_model": "acestep-v15-xl-turbo",
                "loaded_lm_model": "acestep-5Hz-lm-4B",
            }
        }).encode())
        with patch.object(restore.urllib.request, "urlopen", return_value=response):
            with self.assertRaises(restore.RecoveryBlocked):
                restore.check_main_engine()

    def test_private_audio_libraries_installed_before_gpu_smoke(self):
        from unittest.mock import Mock
        calls = []
        def fake_run(argv, **kwargs):
            args = [str(v) for v in argv]
            calls.append(args)
            if "--smoke" in args:
                return Mock(stdout="GPU_KERNEL_TEST_OK=True\\nDEMUCS_REAL_GPU_INFERENCE_VERIFIED=True")
            return Mock(stdout="")
        with patch.object(restore.shutil, "which", return_value="/usr/local/bin/uv"), \
             patch.object(restore.shutil, "disk_usage", return_value=Mock(free=40 * 1024**3)), \
             patch.object(restore.subprocess, "run", return_value=Mock(returncode=1)), \
             patch.object(restore, "run", side_effect=fake_run):
            restore.install_packages()
        audio_index = next(i for i, args in enumerate(calls) if "librosa==0.11.0" in args)
        smoke_index = next(i for i, args in enumerate(calls) if "--smoke" in args)
        self.assertLess(audio_index, smoke_index)

    def test_readonly_mode_has_no_private_file_setup(self):
        with patch.object(restore, "pro_processes", return_value=[]):
            with patch.object(restore, "check_gpu"):
                with patch.object(restore, "check_main_engine"):
                    with patch.object(restore, "check_token"):
                        with patch("sys.argv", ["restore"]):
                            restore.main()


if __name__ == "__main__":
    unittest.main()
