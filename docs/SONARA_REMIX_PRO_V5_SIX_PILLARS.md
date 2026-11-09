# SONARA REMIX PRO V5 — Six-Pillar Creative Studio

## Engineering status

V5 is an **opt-in** isolated worker upgrade, not a claim of proven artistic quality.
The V4.2 production worker remains compatible with the same Cloudflare gateway.
The public site advertises `v5Available` only following an authenticated GPU
heartbeat carrying `v5Ready=true` from the isolated Remix Pro worker.

## Six connected capabilities

1. **A+B independent source direction.** A supplies structural/harmonic material
   while B supplies musical style and measured percussion activity. Prompts ask
   ACE-Step for a *new* performance, not a stem sum. B motif influence is **not**
   quantitatively certified; real listening is required.
2. **Natural instrumentation.** Eight genre profiles specify expressive drums,
   kick/bass interaction, human dynamic variation, phrasing and instrumental
   palette without creating or claiming imaginary stem sounds.
3. **Coherent song form and longer material.** Existing 90-second ACE-Step
   segments stay part of the source-to-cover bridge; V5 directives specify
   intro, hook, groove development, breakdown and resolved ending. Measured
   seam RMS discontinuities are advisory. A passing audio gate is not proof
   of a musically seamless 8-minute arrangement.
4. **Adaptive mastering.** Subsonic high-pass, restrained bass balance, optional
   capped presence correction and existing LUFS/4x approximate intersample-peak
   attenuation. This is **not** a certified true-peak limiter.
5. **Real candidate selection.** Generates serial genuine ACE-Step outputs.
   At most 3 when <=90s, 2 when 120–180s, 1 when >180s. Each candidate
   must pass existing technical quality gate. Ranking uses measured technical
   health only, and the winning WAV is the sole published artifact.
6. **Remix Pro Studio UI.** Genre profile, A/B influence, candidate count and
   random automatic 90–180-second selection. The exact chosen value is sent
   to the server and checked against the resulting WAV. V4.2 fallback is
   retained if the live worker does not advertise V5 readiness.

## Technical release boundaries

- **Never** enable V5 with a frontend-only flag.
- **Never** bypass the authenticated R2 queue, MoLab lease, owner authorization,
  existing billing reservation, restricted source format validation or quality
  release gates.
- **Never** mix source A/B PCM into the final file or publish fake stems.
- **Never** label technicalScore as an artistic score.
- **Never** restart the main ACE-Step XL Turbo engine.
- Only update MoLab during an idle, guarded maintenance handoff.

## Rollout

1. Merge code only after GitHub offline audio, integration and site build tests
   are green.
2. Publish the Cloudflare Worker/assets via the existing GitHub Actions Cloudflare
   deployment; avoid Vercel. Verify the public API stays ready and legacy V4.2
   functions normally while V5 is unavailable.
3. Apply `molab/sonara_remix_pro_gpu_v5_handoff.py` from the private MoLab
   venv. Its immutable GitHub file hashes protect the upgrade. Existing
   V4.2 agent must be idle. Rollback is blocked when there may be an active job.
4. Confirm `PRO_V5_AVAILABLE=True`, `SONARA_V5_WORKER_READY=True` and
   public `v5Available=true` before enabling V5 job submissions.
5. Perform one authorized real 2-song A+B job, inspect musical identity,
   instrumental quality, transitions, BPM fidelity and master; only then
   declare end-to-end audio/creative quality validated.

## Limits and costs

Candidate generation increases total GPU time and cost; the job is not
automatically retried or duplicated on billing/queue errors. User songs and
stems remain private within the existing R2 ownership boundary. The model
is the same local ACE-Step XL Turbo; performance parity with commercial
services is a target, not a measured fact.
