# SONARA A+B Original Fusion — gated release (no Vercel)

## Intended behavior
Create Remix AI produces exactly one **newly regenerated composition** that borrows A's melodic/structural traits and B's style/timbral/rhythmic traits. A and B original waveforms are NEVER summed or crossfaded for this job. The classical DJ mixer remains an independent feature.

## Source files
- `src/components/remix/SonaraMultitrackMixer.tsx`: send both originals separately
- `src/components/remix/SonaraRemixProPanel.tsx`: authenticated two-source R2 upload and one-output request
- `molab/sonara_remix_pro_fusion.py`: independent A guide and B reference
- `molab/sonara_remix_pro_ace_bridge.py`: stage both references in private tempdir for local ACE-Step
- `molab/sonara_remix_pro_r2_agent.py`: no `combine_two_songs` at job-generation time
- `cloudflare/sonara-remix-pro-r2.mjs`: version-gated private job queue

## Before deploying
1. Complete all GitHub Remix Pro tests and the website build. CI syntax/regression success does not prove musical fusion.
2. Verify MoLab actual ACE-Step API supports `src_audio_path` + `reference_audio_path` for the selected model and task type. Both paths must be private files in the trusted local temporary directory. Any unsupported/ignored reference must FAIL the release rather than be misrepresented as a validated A+B result.
3. Keep the running main SONARA ACE-Step engine and main relay unchanged. Update only the dedicated `/marimo/SONARA-REMIX-PRO` files on the GPU notebook using an authenticated session. Back up the three existing Python files before replacing, syntax-check replacements and verify the new module is importable from the isolated venv.
4. Stop/restart ONLY the dedicated Remix Pro agent when no job lease is active. Keep the existing per-job R2 records and user assets intact. The new agent revision is `sonara-remix-pro-r2-agent-v3-dual-reference-fusion`; Cloudflare must advertise the exact same revision.
5. Gate a private real end-to-end A+B run using two authorized, distinctive songs. Confirm both model reference inputs are used, one WAV is generated, duration is correct (30 seconds and one long-form trial), output is not simply A or B, no source waveform is summed and no clipping occurs. Assess A/B influence, cohesive musical structure and natural drums by listening. Do NOT claim 'true fusion' based only on waveform or unit tests.
6. Once QA is green, publish **Cloudflare Worker + static assets through Wrangler**, using the repository's supported Cloudflare pipeline. Verify `https://sonaraenterprise.com` loads the new frontend and `/api/sonara-relay/pro-capabilities` reports new agent online.
7. Keep a rollback of the prior Remix Pro agent and Cloudflare release. If the new GPU worker is not available, fail closed and do not silently fall back to a mixed DJ WAV.

## Deployment boundaries
- **Do not use Vercel**, and do not trigger legacy Vercel deploy workflows.
- Do not merge into `main` solely as a deploy trigger unless it has been verified that automatic Vercel hooks cannot deploy this change.
- No Cloudflare or MoLab credentials or R2 tokens should be committed, pasted into a chat or logged.
- The current PR does **not** itself deploy the public site or modify the active MoLab GPU process.
