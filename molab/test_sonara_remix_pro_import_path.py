"""Regression: agent must resolve trusted local imports before importing modules.

No GPU, Cloudflare token, R2 upload or customer audio is needed.
"""
import ast
from pathlib import Path
import unittest


class RemixProPathTests(unittest.TestCase):
    def test_trusted_path_precedes_local_imports(self):
        path=Path(__file__).with_name("sonara_remix_pro_r2_agent.py")
        source=path.read_text()
        tree=ast.parse(source)
        imports=[]
        for node in tree.body:
            if isinstance(node,ast.ImportFrom) and (node.module or "").startswith("sonara_remix_pro_"):
                imports.append(node.lineno)
        self.assertTrue(imports)
        path_set=source.index("sys.path.insert(0, str(_AGENT_DIRECTORY))")
        local_first=source.index("from sonara_remix_pro_toolkit import")
        self.assertLess(path_set,local_first)
        self.assertIn('if _AGENT_DIRECTORY != _MOLAB_ROOT.resolve()',source)
        self.assertIn('if not (_AGENT_DIRECTORY / _module).is_file()',source)

    def test_disabled_pro_queue_is_expected_standby_not_network_error(self):
        path=Path(__file__).with_name("sonara_remix_pro_r2_agent.py")
        source=path.read_text()
        tree=ast.parse(source)
        handler=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and
                     n.name=="pro_activation_pending")
        names=[n for n in ast.walk(handler) if isinstance(n,ast.Call) and
               isinstance(n.func,ast.Name) and n.func.id=="request"]
        self.assertEqual(len(names),1)
        self.assertIn('"/api/sonara-relay/pro-capabilities"',source)
        self.assertIn('status("waiting_for_pro_activation"',source)
        self.assertIn('if pro_activation_pending():',source)
        self.assertLess(source.index('if pro_activation_pending():'),
                        source.index('response = request("POST","/api/sonara-relay/pro-claim"'))
        self.assertIn('last_gate_pending = True',source)

    def test_agent_compiles(self):
        path=Path(__file__).with_name("sonara_remix_pro_r2_agent.py")
        compile(path.read_text(),str(path),"exec")


if __name__=="__main__":
    unittest.main()
