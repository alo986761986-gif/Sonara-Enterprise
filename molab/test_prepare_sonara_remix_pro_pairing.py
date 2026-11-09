"""SONARA Remix Pro pairing tests; never create actual tokens or contact Cloudflare."""
import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

source=Path(__file__).with_name("prepare_sonara_remix_pro_pairing.py")
spec=importlib.util.spec_from_file_location("sonara_pairing",source)
pairing=importlib.util.module_from_spec(spec)
spec.loader.exec_module(pairing)

class DummyResponse:
    status=200
    def __enter__(self): return self
    def __exit__(self,*args): return False

class DummyOpener:
    def open(self,request,timeout=None):
        assert request.full_url == pairing.ENDPOINT
        assert request.get_method()=="GET"
        assert request.headers.get("X-sonara-relay-token")
        return DummyResponse()

class PairingSafetyTests(unittest.TestCase):
    def test_invalid_token(self):
        for token in ("", "short", "x"*31, "x"*513, "A"*32+" "):
            self.assertFalse(pairing._valid(token))
        self.assertTrue(pairing._valid("a"*48))

    def test_token_creation_and_idempotency(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/"SONARA-REMIX-PRO"
            (root/".venv/bin").mkdir(parents=True)
            (root/".venv/bin/python").touch()
            (root/"sonara_remix_pro_r2_agent.py").touch()
            home=Path(tmp)/"home"
            with patch.object(pairing,"ROOT",root),                patch.object(pairing,"PYTHON",root/".venv/bin/python"),                patch.object(pairing,"HOME",home),                patch.object(pairing,"TOKEN",home/"relay.token"),                patch.object(pairing.urllib.request,"build_opener",return_value=DummyOpener()):
                one=pairing.prepare()
                token=(home/"relay.token").read_text()
                two=pairing.prepare()
                self.assertEqual(one["fingerprint"],two["fingerprint"])
                self.assertEqual((home/"relay.token").read_text(),token)
                self.assertTrue(one["authenticated"])
                self.assertTrue((home/"relay.token").is_file())

    def test_does_not_modify_existing_invalid_token(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)/"SONARA-REMIX-PRO"
            (root/".venv/bin").mkdir(parents=True)
            (root/".venv/bin/python").touch()
            (root/"sonara_remix_pro_r2_agent.py").touch()
            home=Path(tmp)/"home"
            home.mkdir()
            token=home/"relay.token"
            token.write_text("invalid")
            with patch.object(pairing,"ROOT",root),                patch.object(pairing,"PYTHON",root/".venv/bin/python"),                patch.object(pairing,"HOME",home),                patch.object(pairing,"TOKEN",token):
                with self.assertRaises(RuntimeError):
                    pairing.prepare()
                self.assertEqual(token.read_text(),"invalid")

if __name__=="__main__":
    unittest.main()
