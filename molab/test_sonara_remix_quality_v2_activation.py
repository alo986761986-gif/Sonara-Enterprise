"""Offline safety tests for V2 quality activation, without GPU or API access."""
import importlib.util
from pathlib import Path
import unittest

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location(
    "quality_activation", HERE / "activate_sonara_remix_quality_v2.py"
)
activation = importlib.util.module_from_spec(spec)
spec.loader.exec_module(activation)


class MusicalCoherenceV2ActivationTests(unittest.TestCase):
    NOW = 2000000000.0

    def report(self, **overrides):
        return dict(
            revision=activation.REVISION,
            state="waiting_for_authorized_job",
            updatedAt=self.NOW - 10,
            **overrides,
        )

    def test_known_idle_agent_is_safe(self):
        self.assertEqual(activation.safely_idle(self.report(), self.NOW), "IDLE")

    def test_unknown_or_outdated_revision_never_handoffs(self):
        cases = [
            {"revision": "legacy-v2", "state": "waiting_for_authorized_job", "updatedAt": self.NOW-10},
            {"revision": activation.REVISION, "state": "processing", "updatedAt": self.NOW-10},
            {"revision": activation.REVISION, "state": "waiting_for_authorized_job",
             "jobId": "srpro-real", "updatedAt": self.NOW-10},
            {"revision": activation.REVISION, "state": "waiting_for_authorized_job",
             "updatedAt": self.NOW-90},
            {"revision": activation.REVISION, "state": "connection_unavailable",
             "updatedAt": self.NOW-10},
            {},
        ]
        for state in cases:
            with self.subTest(state=state):
                self.assertNotEqual(activation.safely_idle(state, self.NOW), "IDLE")

    def test_exact_immutable_installer_hash(self):
        self.assertEqual(len(activation.INSTALLER_COMMIT), 40)
        self.assertEqual(len(activation.INSTALLER_SHA), 40)
        self.assertNotIn("/main/", activation.INSTALLER_URL)
        self.assertNotIn("/feature/", activation.INSTALLER_URL)
        installer = (HERE / "install_sonara_remix_quality_v2.py").read_bytes()
        self.assertEqual(activation.git_blob_sha(installer), activation.INSTALLER_SHA)

    def test_mode_must_match_old_agent(self):
        self.assertEqual(activation.choose_auth_mode(
            ["/marimo/SONARA-REMIX-PRO/.venv/bin/python", "agent.py",
             "--auth-mode=none"]), "none")
        self.assertEqual(activation.choose_auth_mode(
            ["python", "agent.py", "--auth-mode", "required"]), "required")


if __name__ == "__main__":
    unittest.main()
