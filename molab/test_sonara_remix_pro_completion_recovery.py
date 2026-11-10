"""Offline retry and reconciliation tests: no GPU, customer jobs or HTTP."""
import ast
from pathlib import Path
import unittest
from unittest.mock import Mock

FILE = Path(__file__).with_name("sonara_remix_pro_r2_agent.py")


class ProAgentError(RuntimeError):
    pass


def isolated_completion():
    tree = ast.parse(FILE.read_text())
    fn = next(node for node in tree.body if isinstance(node, ast.FunctionDef)
              and node.name == "confirm_gateway_completion")
    scope = {
        "ProAgentError": ProAgentError,
        "time": Mock(sleep=Mock()),
        "urllib": Mock(error=Mock(URLError=OSError)),
        "TimeoutError": TimeoutError,
        "OSError": OSError,
    }
    exec(compile(ast.Module(body=[fn],type_ignores=[]),str(FILE),"exec"),scope)
    return scope


class ConfirmCompletionTest(unittest.TestCase):
    def test_success_never_duplicates_a_job(self):
        scope=isolated_completion()
        call=Mock(return_value={"ok":True})
        scope["request"]=call
        scope["confirm_gateway_completion"]("srpro_abc","lease",{"actualDurationSeconds":30})
        self.assertEqual(call.call_count,1)

    def test_missing_ack_is_reconciled_from_signed_receipt(self):
        scope=isolated_completion()
        calls=[]
        def request(method,path,data=None,lease=None,timeout=120):
            calls.append((method,path,lease))
            if method=="POST":
                raise ProAgentError("simulated lost network response")
            return {"ok":True,"completed":True}
        scope["request"]=request
        scope["confirm_gateway_completion"]("srpro_abc","lease",{"actualDurationSeconds":30})
        self.assertEqual([x[0] for x in calls],["POST","GET"])
        self.assertTrue(calls[1][1].endswith("/receipt"))
        self.assertEqual(calls[1][2],"lease")

    def test_active_lease_retries_then_confirms(self):
        scope=isolated_completion()
        attempts={"n":0}
        def request(method,path,data=None,lease=None,timeout=120):
            if method=="GET":
                return {"ok":True,"completed":False}
            attempts["n"]+=1
            if attempts["n"]==1:
                raise ProAgentError("server conflict")
            return {"ok":True}
        scope["request"]=request
        scope["confirm_gateway_completion"]("srpro_abc","lease",{},attempts=3)
        self.assertEqual(attempts["n"],2)

    def test_missing_receipt_never_fabricates_a_completed_master(self):
        scope=isolated_completion()
        scope["request"]=Mock(side_effect=ProAgentError("unavailable"))
        with self.assertRaises(ProAgentError):
            scope["confirm_gateway_completion"]("srpro_abc","lease",{},attempts=2)

if __name__=="__main__":
    unittest.main()
