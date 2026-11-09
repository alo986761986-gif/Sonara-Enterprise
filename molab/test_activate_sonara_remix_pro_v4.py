"""Offline safety tests for guarded SONARA V3 -> V4 handoff.

All tests use synthetic state and no GPU, HTTP, signals, tokens or real services.
"""
from __future__ import annotations
import importlib.util
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).with_name("activate_sonara_remix_pro_v4.py")
spec = importlib.util.spec_from_file_location("sonara_v4_handoff", SOURCE)
handoff = importlib.util.module_from_spec(spec)
spec.loader.exec_module(handoff)


class V4HandoffSafetyTests(unittest.TestCase):
    def snapshot(self, *, state="waiting_for_authorized_job", age=3, **extra):
        return {
            "revision": handoff.REVISION,
            "state": state,
            "updatedAt": 2000000000.0-age,
            **extra,
        }

    def test_only_recent_idle_v3_is_eligible(self):
        now = 2000000000.0
        self.assertEqual(handoff.idle_reason(self.snapshot(), now), "CONFIRMED_IDLE")
        self.assertEqual(handoff.idle_reason(self.snapshot(age=60), now), "STALE_STATUS")
        self.assertEqual(handoff.idle_reason(self.snapshot(state="processing"), now), "ACTIVE_JOB")
        self.assertEqual(handoff.idle_reason(self.snapshot(jobId="srpro_test"), now), "ACTIVE_JOB")
        self.assertEqual(handoff.idle_reason(self.snapshot(leaseId="lease_test"), now), "ACTIVE_JOB")
        self.assertEqual(handoff.idle_reason(self.snapshot(state="connection_unavailable"), now),
                         "UNCONFIRMED_IDLE")
        self.assertEqual(handoff.idle_reason(self.snapshot(revision="unknown"), now),
                         "UNKNOWN_AGENT_REVISION")

    def test_unsafe_time_values_are_blocked(self):
        now = 2000000000.0
        for val in ("bad", None, float("nan"), float("inf")):
            with self.subTest(updatedAt=val):
                result = handoff.idle_reason(self.snapshot(updatedAt=val), now)
                self.assertNotEqual(result, "CONFIRMED_IDLE")

    def test_process_identity_is_exact(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d)
            for pid, args in ((1321, [b"python", b"/marimo/SONARA-REMIX-PRO/sonara_remix_pro_r2_agent.py"]),
                              (1322, [b"python", b"/tmp/sonara_remix_pro_r2_agent.py"])):
                folder = root / str(pid)
                folder.mkdir()
                (folder / "cmdline").write_bytes(bytes([0]).join(args) + bytes([0]))
                (folder / "cwd").symlink_to("/marimo/SONARA-REMIX-PRO")
            self.assertEqual(handoff.pro_pids(root), [1321])

    def test_default_preflight_does_not_touch_worker(self):
        with patch.object(handoff, "env_read_only"), \
             patch.object(handoff, "pro_pids", return_value=[1321]), \
             patch.object(handoff, "installed_matches", return_value=False), \
             patch.object(handoff, "verified_installer", side_effect=AssertionError("download")), \
             patch.object(handoff, "stop_if_confirmed_idle", side_effect=AssertionError("signal")), \
             patch.object(handoff, "install_verified", side_effect=AssertionError("install")):
            handoff.main([])

    def test_activate_requires_both_confirmations_before_any_io(self):
        with patch.object(handoff, "env_read_only", side_effect=AssertionError("IO before approval")):
            with self.assertRaises(handoff.HandoffBlocked):
                handoff.main(["--activate"])
            with self.assertRaises(handoff.HandoffBlocked):
                handoff.main(["--activate", "--confirm-maintenance"])

    def test_no_unverified_worker_or_gateway_start(self):
        with patch.object(handoff, "env_read_only"), \
             patch.object(handoff, "pro_pids", return_value=[]), \
             patch.object(handoff, "installed_matches", return_value=False), \
             patch.object(handoff, "verified_installer", return_value=b"verified"), \
             patch.object(handoff, "public_capabilities", side_effect=handoff.HandoffBlocked("offline")), \
             patch.object(handoff, "install_verified", side_effect=AssertionError("unexpected install")):
            with self.assertRaises(handoff.HandoffBlocked):
                handoff.main(["--activate", "--confirm-maintenance", "--confirm-audio-qa",
                              "--auth-mode", "none"])

    def test_immutable_installer_manifest(self):
        self.assertEqual(len(handoff.INSTALLER_COMMIT), 40)
        self.assertEqual(len(handoff.INSTALLER_BLOB), 40)
        self.assertEqual(len(handoff.EXPECTED_BLOBS), 5)
        self.assertNotIn("/main/", handoff.INSTALLER_URL)
        self.assertNotIn("/fix/", handoff.INSTALLER_URL)
        self.assertTrue(handoff.CAPABILITIES.startswith("https://"))

if __name__ == "__main__":
    unittest.main()
