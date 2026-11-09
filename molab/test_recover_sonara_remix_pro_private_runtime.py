"""Offline fail-closed recovery tests; never create a venv or access the network."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SOURCE=Path(__file__).with_name("recover_sonara_remix_pro_private_runtime.py")
spec=importlib.util.spec_from_file_location("sonara_recover_private",SOURCE)
recovery=importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class PrivateRecoveryTests(unittest.TestCase):
    def test_authorization_requires_known_fingerprint(self):
        self.assertFalse(recovery.token_is_authorized("fake_"+"q"*90))
        self.assertFalse(recovery.token_is_authorized(""))
        self.assertFalse(recovery.token_is_authorized("a"*40))
        self.assertFalse(recovery.token_is_authorized("x"*128+"\n"))

    def test_unapproved_token_never_written(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(recovery,"TOKEN",Path(tmp)/"relay.token"):
                with self.assertRaises(recovery.RecoverError):
                    recovery.copy_authorized_token("unapproved_value"*4)
                self.assertFalse((Path(tmp)/"relay.token").exists())

    def test_private_venv_only_and_never_main_ace(self):
        self.assertEqual(recovery.ROOT, Path("/marimo/SONARA-REMIX-PRO"))
        self.assertEqual(recovery.PYTHON, recovery.ROOT/".venv/bin/python")
        self.assertEqual(recovery.TOKEN, Path.home()/".sonara/relay.token")
        self.assertNotIn("ACE-STEP", str(recovery.PYTHON))

    def test_missing_venv_never_starts_any_worker(self):
        with patch.object(recovery,"check_host",return_value=True),\
            patch.object(recovery,"candidates",return_value=(False,None,None)),\
            patch.object(recovery,"isolated_venv_present",return_value=False),\
            patch.object(recovery,"restore_venv") as install,\
            patch.object(recovery,"copy_authorized_token") as restore:
            recovery.main([])
            install.assert_not_called()
            restore.assert_not_called()

    def test_unrecognized_token_cannot_be_forced(self):
        with patch.object(recovery,"check_host",return_value=True),\
            patch.object(recovery,"candidates",return_value=(False,None,None)),\
            patch.object(recovery,"isolated_venv_present",return_value=False),\
            patch.object(recovery,"restore_venv") as install:
            with self.assertRaisesRegex(recovery.RecoverError,"Cloudflare pairing required"):
                recovery.main(["--restore-known-token"])
            install.assert_not_called()

    def test_restore_only_explicitly_authorized_existing_token(self):
        with patch.object(recovery,"check_host",return_value=True),\
            patch.object(recovery,"candidates",return_value=(False,"trusted","secret")),\
            patch.object(recovery,"isolated_venv_present",return_value=False),\
            patch.object(recovery,"copy_authorized_token") as restore:
            recovery.main(["--restore-known-token"])
            restore.assert_called_once_with("secret")

    def test_fail_if_gpu_or_process_state_uncertain(self):
        with patch.object(recovery,"ROOT",Path("/marimo/SONARA-REMIX-PRO")),\
            patch.object(recovery,"restricted_gpu",return_value=False):
            with self.assertRaises(recovery.RecoverError):
                recovery.check_host()

if __name__=="__main__":
    unittest.main()
