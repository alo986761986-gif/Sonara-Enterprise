# SONARA / MoLab RTX PRO 6000 — Authorized production activation

Updated 22 October 2026. The owner has stated that express authorization to connect MoLab to SONARA is available. Before activation, retain the written authorization from the MoLab provider; standard MoLab restrictions at https://molab.marimo.io/pages/molab/restrictions prohibit external proxying without such approval.

## Current proven state

The interactive MoLab notebook has already completed actual local instrumental and Italian-vocal WAV generation with `acestep-v15-xl-turbo` and `acestep-5Hz-lm-4B`. No model reinstall is necessary.

## Architecture

```
sonaraenterprise.com / Vercel billing and UI
              |
    api.sonaraenterprise.com (Cloudflare Worker, auth and rate/billing)
              |
    Cloudflare private ACE_STEP_API_KEY secret
              |
    https://molab.sonaraenterprise.com (Named Tunnel: sonara-molab-secure-v2)
              |
    localhost:8002 (SONARA authenticated gateway, no unauthenticated requests)
              |
    localhost:8001 (existing ACE-Step API; XL Turbo + LM 4B loaded)
```

**No RunPod. No checkpoint deletion.** The new gateway protects the upstream public endpoint without restarting the existing model process. Keep the MoLab notebook active; the domain can remain stable, but compute uptime is dependent on the MoLab session.

## 1. Start the authorized bridge on MoLab

Open https://molab.marimo.io/notebooks/nb_zJvcNwh1tmMWd9XJoMhiyW and run this in a NEW Python cell:

```python
def _():
    import urllib.request
    url = (
        "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/"
        "feature/sonara-molab-xl-only-20261022/scripts/"
        "sonara-molab-connect-production.py"
    )
    source = urllib.request.urlopen(url, timeout=30).read().decode("utf-8")
    scope = {"__name__": "sonara_molab_connect"}
    exec(compile(source, url, "exec"), scope)
    scope["main"]()
_()
```

If prompted, complete Cloudflare's one-time account/domain login for `sonaraenterprise.com`. The installer reuses the existing ACE-Step API, sets up a dedicated authenticated loopback gateway on port 8002, creates a separate stable Named Tunnel, updates only the `molab.sonaraenterprise.com` DNS record, and validates authorized/anonymous health.

It prints `SONARA_MOLAB_XL_URL=https://molab.sonaraenterprise.com` on success. It also prints a **private secret value** under `GITHUB_ACTIONS_SECRET_VALUE`. Copy the value privately into GitHub Actions secrets; do not paste the value into a chat, an issue, repository code, or logs/screenshots. Clear the notebook cell output after copying it.

Local private key file: `/marimo/.sonara_private/molab_xl_gateway_key` (permissions `0600`). Preserve this file or restore the same secret on future notebook resets. The tunnel credential file and local config are also private.

If existing ACE-Step API itself enforces a DIFFERENT key, configure `SONARA_MOLAB_UPSTREAM_API_KEY` in the notebook environment to that private key. Never publish or hardcode it.

## 2. Set production secrets on GitHub Actions and Vercel

1. In https://github.com/alo986761986-gif/Sonara-Enterprise/settings/secrets/actions, create or update the repository secret **`SONARA_ACESTEP_API_KEY`** with the *gateway* private value from the MoLab output. Never reuse a published key.
2. Confirm the GitHub Actions deployment credential **`CLOUDFLARE_API_TOKEN`** (or `CF_API_TOKEN`) exists. If available, `CLOUDFLARE_ACCOUNT_ID` is also used; the workflow may derive account ID from the Cloudflare zone.
3. Generate a separate, high-entropy secret of at least **32 characters** for internal billing-to-worker authentication. Set that **identical** value as:
   - GitHub Actions repository secret `SONARA_INTERNAL_PROXY_SECRET`
   - Vercel **Production** environment variable `SONARA_INTERNAL_PROXY_SECRET` in the SONARA `sonara-enterprise` project, under Project Settings → Environment Variables.
4. Redeploy SONARA on Vercel after updating its Production environment. A value stored in the dashboard does **not** update an existing deployment automatically.
5. Keep the MoLab gateway key distinct from the internal billing proxy secret. They serve different purposes. Do not add either to `wrangler.jsonc`, public JavaScript, an issue, or source control. The private Cloudflare Worker receives both keys through the Wrangler secrets file at deploy time.

**Security contract:** Vercel `/api/billing/generate` authenticates the customer and forwards `X-Sonara-Internal-Secret` to the Cloudflare Worker; Cloudflare uses `ACE_STEP_API_KEY` to authenticate toward MoLab's gateway. The Worker fails closed if the internal secret is missing, and job polling requires an authenticated Vercel proxy. Generated WAV links use time-limited HMAC signatures; the key is never placed in the browser.

## 3. Review/merge, then deploy

Only after step 1 shows the public HTTPS endpoint active and step 2 is complete:

1. Review and merge https://github.com/alo986761986-gif/Sonara-Enterprise/pull/43 into `main` (the PR may still be marked draft).
2. In GitHub Actions open the workflow **Configure SONARA MoLab XL Only**.
3. Choose `main`, click **Run workflow**, tick **authorization_confirmed** only if provider authorization is in effect **and** `vercel_proxy_secret_configured` only after Vercel's Production environment has the matching secret and has been redeployed.
4. The workflow checks both models and rejects unauthenticated requests, builds the website, then deploys the Cloudflare Worker with the URL, upstream gateway key, and internal proxy secret in **one deployment** using Wrangler `--secrets-file`.

This workflow is manually triggered, not on every push. A failed pre-deployment validation leaves the Worker unchanged.

**Warning:** other workflows in this repository may run on pushes to `main`. Review Actions when merging. If the update degrades an existing deployment, roll back the SONARA Cloudflare Worker to the previously healthy version in the Cloudflare dashboard.

## 4. Live verification

Verify `https://api.sonaraenterprise.com/api/molab/ready` reports:
- `ready=true`
- `provider="molab"`, `model="acestep-v15-xl-turbo"`
- `llmInitialized=true`, `realMusicReady=true`

Then generate an actual track using the normal SONARA website account flow and verify job submission, completion, WAV playback, credit reservation and persistence. The Vercel `/api/billing/job` route must accept `mxl_` IDs and forward them only to the Cloudflare production API using its matching proxy secret.

Additional end-to-end diagnostics:
- GET `https://sonaraenterprise.com/api/billing/health` returns `musicProvider: "ace_step_xl"` once the correct Vercel code is live.
- Unauthenticated POST `https://api.sonaraenterprise.com/api/engine/generate` returns HTTP 401.
- A direct unauthenticated GET of `https://molab.sonaraenterprise.com/health` returns HTTP 401 (this is expected: it must not expose model internals).
- Signed audio URL `/api/molab/audio?path=...&exp=...&sig=...` can play in SONARA; changing `path`, `exp`, or `sig` invalidates it. Links expire after 24 hours.
- An HTTP 530 on `molab.sonaraenterprise.com` indicates the named tunnel is **not connected**, and a 503 on `/api/molab/ready` means the backend is **not ready**. Do not claim production is active in either case.

The previously run local tests alone do NOT prove this public production flow.

## Security and operational limits

- Only use a named tunnel routed to **127.0.0.1:8002**, never expose ACE-Step 8001 directly.
- Never use a quick `trycloudflare.com` tunnel, RunPod, or Kaggle as the production music engine.
- Disable the Named Tunnel and invalidate/rotate `SONARA_ACESTEP_API_KEY` if the authorization is withdrawn or the private key is exposed.
- A MoLab session may suspend; there is no guaranteed 24/7 uptime on notebook compute. An SLA requires the provider to explicitly supply that capability.
