"""Offline tests for the guarded RTX PRO 6000 Remix Pro GPU bootstrap.

No torch, Demucs downloads, GPU, customer jobs or model inference in CI.
"""
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

import sonara_remix_pro_gpu_setup as gpu


class GPUSetupTests(unittest.TestCase):
    def test_preflight_never_installs_or_downloads(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "sonara_remix_pro_toolkit.py").write_text("# offline fixture\n")
            with patch.object(gpu, "ROOT", root), patch.object(gpu, "VENV", root), \
                patch.object(gpu.sys, "prefix", str(root)), \
                patch.object(gpu, "_inspect_gpu", return_value={
                    "device": "NVIDIA RTX PRO 6000 Blackwell Server Edition",
                    "computeCapability": "12.0",
                    "driverVersion": "570.0",
                    "freeMemoryMiB": 60000
                }), patch.object(gpu, "_pip", side_effect=AssertionError("No installs")), \
                patch.object(gpu, "_gpu_kernel_check", side_effect=AssertionError("No GPU inference")), \
                patch.object(gpu.shutil, "disk_usage", return_value=Mock(free=40 * 1024**3)):
                result = gpu.setup(install=False, smoke=False)
            self.assertFalse(result["installed"])
            self.assertFalse(result["modelInferenceVerified"])

    def test_not_in_isolated_venv_refuses_bootstrap(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "sonara_remix_pro_toolkit.py").write_text("# offline fixture\n")
            with patch.object(gpu, "ROOT", root), patch.object(gpu, "VENV", root), \
                patch.object(gpu.sys, "prefix", "/usr"), \
                patch.object(gpu, "_inspect_gpu", side_effect=AssertionError("Do not inspect")):
                with self.assertRaisesRegex(gpu.GPUSetupError, "Run with"):
                    gpu.setup(install=True, smoke=True)

    def test_wrong_gpu_and_insufficient_gpu_memory_are_rejected(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            (root / "sonara_remix_pro_toolkit.py").write_text("# offline fixture\n")
            insufficient = {"device": "NVIDIA RTX PRO 6000 Blackwell Server Edition",
                            "computeCapability": "12.0","driverVersion":"570.0",
                            "freeMemoryMiB":2000}
            with patch.object(gpu, "ROOT", root), patch.object(gpu, "VENV", root), \
                patch.object(gpu.sys, "prefix", str(root)), \
                patch.object(gpu, "_inspect_gpu", return_value=insufficient), \
                patch.object(gpu.shutil, "disk_usage", return_value=Mock(free=40 * 1024**3)), \
                patch.object(gpu, "_pip", side_effect=AssertionError("No installs")):
                with self.assertRaisesRegex(gpu.GPUSetupError, "GPU VRAM"):
                    gpu.setup(install=True, smoke=True)

    def test_wrong_torch_version_never_overwritten(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            (root / "sonara_remix_pro_toolkit.py").write_text("# offline fixture\n")
            installed=lambda name: "2.6.0" if name=="torch" else None
            with patch.object(gpu, "ROOT", root), patch.object(gpu, "VENV", root), \
                patch.object(gpu.sys, "prefix", str(root)), \
                patch.object(gpu, "_inspect_gpu", return_value={
                    "device":"NVIDIA RTX PRO 6000 Blackwell Server Edition",
                    "computeCapability":"12.0","driverVersion":"570.0",
                    "freeMemoryMiB":30000
                }), patch.object(gpu, "_installed", side_effect=installed), \
                patch.object(gpu.shutil, "disk_usage", return_value=Mock(free=40*1024**3)), \
                patch.object(gpu, "_pip", side_effect=AssertionError("No overwrite")):
                with self.assertRaisesRegex(gpu.GPUSetupError, "Different torch"):
                    gpu.setup(install=True, smoke=False)


if __name__ == "__main__":
    unittest.main()
