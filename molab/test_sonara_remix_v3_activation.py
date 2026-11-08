"""Offline, non-GPU safety checks for the dedicated Pro V2 -> V3 handoff.

No subprocesses are started, no signals are delivered, no private tokens read.
"""
import importlib.util
from pathlib import Path
import unittest

MODULE = Path(__file__).with_name("activate_sonara_remix_pro_v3.py")
spec = importlib.util.spec_from_file_location("sonara_remix_v3_activation", MODULE)
activation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(activation)


class ProActivationHandoffTests(unittest.TestCase):
    NOW = 2000000000.0

    def report(self, state, age=10, **extra):
        return {
            "revision": activation.LEGACY_REVISION,
            "state": state,
            "updatedAt": self.NOW - age,
            **extra,
        }

    def test_idle_legacy_worker_is_eligible(self):
        for state in ("waiting_for_authorized_job", "waiting_for_pro_activation"):
            with self.subTest(state=state):
                reason, _ = activation.safe_v2_handoff_reason(
                    self.report(state), self.NOW
                )
                self.assertEqual(reason, "CONFIRMED_IDLE")

    def test_v2_claim_401_state_is_eligible_only_when_fresh(self):
        reason, _ = activation.safe_v2_handoff_reason(
            self.report("connection_unavailable"), self.NOW
        )
        self.assertEqual(reason, "V2_CLAIM_REJECTED_IDLE")

        reason, _ = activation.safe_v2_handoff_reason(
            self.report("connection_unavailable", age=70), self.NOW
        )
        self.assertEqual(reason, "STALE_AGENT_STATUS")

    def test_active_job_is_never_eligible(self):
        for state in ("processing", "connection_unavailable", "waiting_for_authorized_job"):
            with self.subTest(state=state):
                reason, _ = activation.safe_v2_handoff_reason(
                    self.report(state, jobId="srpro_example"), self.NOW
                )
                self.assertEqual(reason, "ACTIVE_REMIX_JOB")

    def test_wrong_revision_and_unknown_states_are_rejected(self):
        report = self.report("connection_unavailable", revision="unknown")
        reason, _ = activation.safe_v2_handoff_reason(report, self.NOW)
        self.assertEqual(reason, "UNKNOWN_AGENT_REVISION")
        report = self.report("stopped")
        reason, _ = activation.safe_v2_handoff_reason(report, self.NOW)
        self.assertEqual(reason, "UNCONFIRMED_STATE")
        report = self.report("connection_unavailable", age=-5)
        reason, _ = activation.safe_v2_handoff_reason(report, self.NOW)
        self.assertEqual(reason, "STALE_AGENT_STATUS")

    def test_empty_or_invalid_status_is_rejected(self):
        for report in ({}, {"updatedAt": "garbled"}, {"state": "connection_unavailable"}):
            with self.subTest(report=report):
                reason, _ = activation.safe_v2_handoff_reason(report, self.NOW)
                self.assertNotIn(reason, ("CONFIRMED_IDLE", "V2_CLAIM_REJECTED_IDLE"))


if __name__ == "__main__":
    unittest.main()
