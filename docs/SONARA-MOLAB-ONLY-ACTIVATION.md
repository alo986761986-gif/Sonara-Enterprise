# SONARA: MoLab RTX PRO 6000 exclusively (no RunPod)

## Scope
Only the MoLab GPU hosts ACE-Step XL Turbo and the `acestep-5Hz-lm-4B` language model. The SONARA website remains on Vercel/Cloudflare, where Cloudflare proxies API requests through the stable named tunnel `https://molab.sonaraenterprise.com`.

## Before activating
- Keep the MoLab RTX PRO 6000 notebook and GPU session active. MoLab may stop or reset notebook sessions, so a named DNS address is stable **but not an uptime guarantee**.
- Reuse the existing ACE-Step installation at `/marimo/SONARA-ACE-Step-CLEAN`, including checkpoints. Do **not** run an automated clean bootstrap when the models are already installed.
- Store a long random `SONARA_ACESTEP_API_KEY` only in the private MoLab environment, not in notebook source code, Git, console output, or frontend assets. The same value must be added as GitHub Actions secret `SONARA_ACESTEP_API_KEY`.
- In MoLab run `scripts/molab-sonara-xl-stable-tunnel-setup.py` once. Complete Cloudflare's authorization for `sonaraenterprise.com` to create `sonara-molab-xl`; do not publish API traffic before auth is enabled.
- Launch `scripts/molab-sonara-xl-supervisor.py` on MoLab. It now explicitly enables both Turbo and LM 4B, requires the private API key, and checks that both models are initialized. Keep the supervisor alive during production traffic.

## Verification
1. Locally, with `Authorization: Bearer <private-key>`, check `http://127.0.0.1:8001/health`: `models_initialized=true`, `llm_initialized=true`, `loaded_model=acestep-v15-xl-turbo`, `loaded_lm_model=acestep-5Hz-lm-4B`.
2. Verify the same result on `https://molab.sonaraenterprise.com/health` using the private Bearer token. Unauthenticated and incorrect-key `POST /query_result` calls **must** return HTTP 401 or 403.
3. Confirm the public endpoint can submit a real generation with the correct token, poll completion, and download a WAV. Do not expose the token to users.
4. Once the real audio test passes, update `.github/molab-xl-trigger` to `SONARA_MOLAB_XL_URL=https://molab.sonaraenterprise.com`; keep `MODE=MOLAB_XL_ONLY` and `MODEL=acestep-v15-xl-turbo`. The MoLab workflow is already present; after merge and when secrets are configured, triggering it validates GPU readiness and auth before updating Cloudflare Worker secrets and deployment.
5. Verify from the SONARA public site `/api/molab/ready` then `/api/engine/generate`, job polling, WAV playback/download, authorization and billing.

## Important cautions
- **Do not use RunPod or Kaggle as fallback** for this deployment.
- Never run the previous RunPod workflow or update `.github/runpod-xl-trigger`.
- `localhost:8001` is only local to MoLab, never a usable external Cloudflare origin.
- A named tunnel fixes DNS churn, not GPU suspend, cold start, or unexpected kernel shutdown.
- The old MoLab trigger uses an expired-looking temporary `trycloudflare.com` address. Do not re-trigger it unchanged.
- The change is kept in a draft PR and is **not live** until tunnel, auth, sound-generation and production tests pass.
