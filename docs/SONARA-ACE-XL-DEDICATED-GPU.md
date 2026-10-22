# SONARA / ACE-Step XL Turbo 4B + LM 4B — dedicated GPU cutover

This guide prepares the existing SONARA Cloudflare API router for an authorized, externally reachable **dedicated GPU**. It does **not** turn MoLab into a public origin. The verified MoLab API on localhost:8001 is useful for local tests only; a 200 /health on localhost is not a public endpoint.

## Existing SONARA architecture

- Browser/frontend: SONARA (Vercel/Cloudflare web deployment).
- Edge/backend: `api.sonaraenterprise.com`; the deployed router is selected via `wrangler.jsonc`.
- Music interface: `POST /api/engine/generate`, `GET /api/music/job/:id`, and `GET /api/molab/audio?path=...`.
- Upstream ACE-Step: `/health`, `/release_task`, `/query_result`, `/v1/audio`.
- For compatibility, the existing router reads the private Cloudflare secret `SONARA_MOLAB_XL_URL` even after switching its origin to RunPod. The name is legacy and does not require MoLab.

Do not point the Cloudflare secret at localhost, any expired trycloudflare.com address, or another notebook platform.

## Dedicated GPU requirements

1. Provision a GPU pod/server with sufficient memory and a **public HTTPS** ingress for port 8001. The RunPod workflow expects a `https://<pod-id>-8001.proxy.runpod.net` URL. A pod must be running and its proxy active before deploying.
2. Install ACE-Step 1.5 with the XL Turbo checkpoint and `acestep-5Hz-lm-4B`. Keep model checkpoints on persistent storage. The repository includes `runpod/sonara-xl-template.env` and `scripts/runpod-sonara-xl-start.sh` for images with ACE-Step installed at `/app`, its virtualenv at `/app/.venv`, and a persistent `/workspace`. These scripts do not install a base image or provision a GPU.
3. Set a long random `SONARA_ACESTEP_API_KEY` on the **RunPod server** as a private environment secret. The startup script refuses to publish an API without it.
4. Ensure the API is configured for `ACESTEP_CONFIG_PATH=acestep-v15-xl-turbo`, `ACESTEP_INIT_LLM=true`, `ACESTEP_LM_MODEL_PATH=acestep-5Hz-lm-4B`, and `ACESTEP_NO_INIT=false`. These values are in the included template.
5. Confirm the endpoint from an independent host, not localhost:
   ```bash
   curl -fsS -H "Authorization: Bearer $SONARA_ACESTEP_API_KEY" "$SONARA_RUNPOD_XL_URL/health"
   ```
   Expect `data.models_initialized=true`, `data.llm_initialized=true`, `data.loaded_model=acestep-v15-xl-turbo`, and `data.loaded_lm_model=acestep-5Hz-lm-4B`. Also verify the API rejects a request with a missing or invalid API key, particularly for job submission and audio access.
6. Verify generation and download **before** cutover. Health alone does not demonstrate audio generation. Keep an eye on GPU memory, restart behavior, job polling, persistent audio storage, access controls and traffic limits.
7. In GitHub repository settings add Actions secret `SONARA_ACESTEP_API_KEY` (same value as the GPU server). Cloudflare credentials `CLOUDFLARE_API_TOKEN` / `CF_API_TOKEN` and account ID or zone access must also already be configured. Never store keys in repository files or `VITE_*` variables.
8. Update `.github/runpod-xl-trigger` to your *actual* public GPU endpoint and retain `MODEL=acestep-v15-xl-turbo` and `MODE=RUNPOD_XL_ONLY`. Updating `main` will trigger `.github/workflows/configure-runpod-xl.yml`. That workflow checks upstream health/LM using the private Bearer key, sets Cloudflare secrets `SONARA_MOLAB_XL_URL` and `ACE_STEP_API_KEY`, deploys and verifies `/api/molab/ready`. Do not trigger while the pod URL is still `REPLACE-POD-ID`.
9. After the workflow reports success, test SONARA via its **public site**: generate → poll `/api/music/job/:id` → stream/download `/api/molab/audio`. Verify billing/auth gating and that the browser never receives upstream secrets.

## Operational notes

- Cloudflare and the public website are **not deployed by this branch alone**. Merge and configure the secrets only after provisioning the GPU and testing the origin.
- The SONARA Cloudflare router's `realMusicReady` now recognizes the **standard ACE-Step** LM status; custom `sonara_realism_api_v1` remains an optional extension marker. This does **not** install the custom realism extension.
- The existing SONARA codebase has several wrappers for music generation and studio features. Verify them against a real generation, not only `/health`. Never claim every custom feature is active based on the default ACE-Step health response.
- Protect the upstream API from public misuse with API key enforcement, egress/domain restrictions as appropriate, rate limits, billing/auth checks and logs free of secrets. The Pod proxy is internet-facing.
- Replacing a Quick Tunnel with a stable HTTPS GPU origin removes the *specific tunnel failure* behind the observed HTTP 530. It does not guarantee uptime if the pod is stopped or the API crashes.
