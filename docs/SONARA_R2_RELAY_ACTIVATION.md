# SONARA R2 pull relay (HTTPS 443, MoLab only)

Status: **staged / NOT production active**. Do not flip the public switch until the secret provisioning and MoLab agent are ready.

## Architecture
- Users authenticate/pay through the existing SONARA Vercel gateway.
- Vercel posts to \`https://api.sonaraenterprise.com/api/engine/generate\` with \`X-Sonara-Internal-Secret\`.
- When Worker env \`SONARA_R2_RELAY_ENABLED=true\`, the entrypoint enqueues \`sr2_...\` in the *private* \`sonara-generated-audio\` R2 bucket.
- MoLab uses outbound HTTPS/443 to claim queued work, invoke the **local** ACE-Step API on 127.0.0.1:8001, upload WAV bytes to R2 and mark the job complete.
- Frontend polls \`/api/music/job/sr2_<uuid>\`. Browser audio URLs point to \`api.sonaraenterprise.com/api/sonara-relay/job/.../audio/N\`.
- No Cloudflare Tunnel, no RunPod, no other GPU.
- This relies on the notebook being awake; it is *not* a 24/7 managed backend.

## Safe activation checklist
1. Cloudflare account \`6457cd56968628985436e0706053aa1d\`: private R2 bucket \`sonara-generated-audio\` exists.
2. Deploy the **reviewed** Worker build to staging after resolving the existing Cloudflare Git build failure, with \`SONARA_AUDIO_BUCKET\` R2 binding. Keep \`SONARA_R2_RELAY_ENABLED\` unset/false until ready.
3. Generate **two different cryptographically random secrets**, one for the Worker-only MoLab agent and one for billing-gateway submission. Put:
   - \`SONARA_RELAY_TOKEN\` = agent secret in Cloudflare Worker **encrypted Secret**
   - \`SONARA_INTERNAL_PROXY_SECRET\` = gateway secret in Cloudflare Worker **encrypted Secret** and Vercel **encrypted** production environment. Do not commit either.
   - The identical agent secret is stored as \`~/.sonara/relay.token\` on MoLab (permissions 0600), *never* in notebook code or print output. Do not reuse Cloudflare tunnel token as relay token.
4. On MoLab, make sure the ACE-Step API is already running at \`http://127.0.0.1:8001\`, and \`/home/marimo/ACE-STEP/.sonara-api-key\` is available privately. Check that ACE-Step is initialized before activation.
5. Use one MoLab cell with local-only variables (wrap in \`def _():\`) to install \`molab/sonara_r2_pull_agent.py\` in \`~/.sonara\`; launch it in a *separate* long-lived process. The agent does not submit any music itself. **Never print the relay token.** It only processes user-generated authorized queue requests.
6. Verify private auth/claim without generating test audio, check that job polling is reachable. Verify Vercel's \`SONARA_ENGINE_API_URL\` points to \`https://api.sonaraenterprise.com\`.
7. Set \`SONARA_MUSIC_PROVIDER=ace_step_xl\` on Vercel **only after** both secrets, R2, Worker route, and MoLab poller are ready, otherwise it will replace the currently used music provider with a broken one.
8. Set Cloudflare Worker \`SONARA_R2_RELAY_ENABLED=true\` only at the controlled launch, ensure \`SONARA_YUE_WORKER_URL\` does not override the R2 route (the R2 check is done before old routing). Keep rollback option = remove switch + restore Vercel provider.
9. Note: Current MVP relay can return up to 2 WAVs and supports basic lease renewal. Prior to scale: add reliable transactional claims (Durable Object), audio retention/purge, per-account access controls, multipart large-WAV handling, persistent rate limits, and paid-job reconciliation.

## Endpoints
| Method | Path | Access |
| --- | --- | --- |
| POST | \`/api/sonara-relay/enqueue\` | Vercel internal secret |
| POST | \`/api/sonara-relay/claim\` | MoLab agent token |
| POST | \`/api/sonara-relay/job/:id/renew\` | MoLab token + lease |
| PUT | \`/api/sonara-relay/job/:id/audio/:index\` | MoLab token + lease |
| POST | \`/api/sonara-relay/job/:id/complete\` | MoLab token + lease |
| POST | \`/api/sonara-relay/job/:id/fail\` | MoLab token + lease |
| GET | \`/api/music/job/:id\` | Unpredictable job ID (MVP); protect under auth before wide release |
| GET | \`/api/sonara-relay/job/:id/audio/:index\` | Unpredictable job ID (MVP); protect under auth before wide release |

**Important:** R2's object storage is not a transactional task queue. This is a controlled low-volume bridge; consider a Cloudflare Durable Object for strict single-owner job claim and quotas in production.
