# SONARA Professional quality: release and rollback checklist

This branch is a **candidate**, not an assertion of live audio improvement. Do not claim Suno/Udio parity without listening to A/B renders.

## Verified in GitHub Actions

- Production-facing request preparation is tested through `prepareMolabR2RelayPayload`.
- Professional/Ultra/Fast profile tests run under Node/TypeScript.
- A/B signal-integrity tests cover clipping, stereo phase cancellation, formats and level mismatch.
- Candidate-delivery tests ensure an invalid or almost-muted WAV is not sent as a valid Song B.
- Standalone MoLab relay-agent import and stereo WAV report are tested with synthetic PCM.

## Deployment boundaries

1. Require passing GitHub CI **and** a READY Vercel preview for the same commit.
2. Obtain a backup of the currently running MoLab agent **before** replacing it. Preserve `~/.sonara`, ACE-Step model weights, LM weights, training data, checkpoints, and existing WAVs.
3. Confirm the MoLab notebook is idle. Do not restart or replace the agent during an authorized generation/upload.
4. Release the reviewed frontend / Cloudflare sources through the established Git/Cloudflare deployment process (do not manually bypass gateway auth or enable a public unauthenticated endpoint).
5. For the MoLab agent, deploy the **single** `molab/sonara_r2_pull_agent.py` from the approved commit. The delivery guard is embedded; no second Python module is required. Do not overwrite private credentials.
6. Start the agent using the site's **existing** supervised startup method. Confirm `waiting_for_authorized_job` and `modelsReady`, with the authenticated HTTPS relay enabled.
7. Generate one short controlled A/B job from SONARA in an authorized session. Confirm **two** WAVs delivered. Compare the reports and listen for acoustic drums, bass, instrumentation, unwanted repetition, genre accuracy, and vocals when selected. The CLI read-only report is:
   `python3 molab/sonara_ab_wav_audit.py path/to/song_A.wav path/to/song_B.wav`
8. Preserve the generated files and report for human review. This diagnostic does **not** rate musical realism or lyric correctness.

## Stop / rollback triggers

- CI failure, preview error, failed authenticated pairing, a stuck job, unexpected A/B count, or degraded musical output.
- On a failed rollout, revert the site deployment through its normal Git/Vercel rollback route and restore the saved prior MoLab agent. **Do not** erase model files, checkpoints, credentials, or previously generated audio.
- Do not bypass a GitHub/production release block; obtain the appropriate review and approval.

## Notes

- Rejecting a corrupt WAV before upload may fail the job rather than silently publish only Song A. This is intentional; retry policy must be validated end-to-end.
- The score used to order candidates is not a guarantee of realism, lyrics accuracy, or better sounding instruments.
- Keep the production service unchanged until all acceptance checks are satisfied.
