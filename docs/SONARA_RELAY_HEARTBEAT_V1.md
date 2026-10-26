# SONARA Relay Heartbeat V1

The MoLab relay already calls /api/sonara-relay/auth before every claim cycle. The Worker now records that successful authenticated call as a safe heartbeat in private R2.

This provides:
- agentOnline and revision in read-only readiness diagnostics;
- truthful job stages for QUEUED vs LEASED;
- no more artificial 10% floor masking a relay-offline condition;
- currentStage in authenticated job polling.

No token, prompt, job owner, lease or signed audio URL is exposed by readiness diagnostics.
