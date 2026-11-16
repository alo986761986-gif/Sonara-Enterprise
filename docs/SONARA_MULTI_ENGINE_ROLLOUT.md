# SONARA: HeartMuLa 3B + Stable Audio 3 Medium (isolated rollout)

This integration is **prepared, not activated**. Do not claim successful model
installation or production generation until the GPU tests below complete.

## Architecture
- Keep the original ACE-Step + Remix Pro agents, routes and models unchanged.
- SONARA Creator has an optional engine selector (ACE-Step by default).
- The existing authenticated billing flow meters every request before calling
  the engine. Only an internal gateway may enqueue new-model jobs.
- A separate R2 queue and MoLab HTTPS worker run new engines without changing
  the old ACE engine. Audio returns via signed 30-minute URLs.
- Models become selectable only after a fresh GPU heartbeat from a worker that
  passed a **real WAV smoke test**.
- Stable Audio is separately gated by a Cloudflare configuration switch and a
  locally affirmed model-license status. Never enable it by default.

## Step 1: install on a real MoLab GPU
Run from a checked-out SONARA source tree in MoLab:

    python molab/install_sonara_multi_engine.py --heartmula

This creates separate HeartMuLa venv and downloads the official Happy New Year
3B and HeartCodec weights. ACE-Step is not reinstalled or overwritten.

For Stable Audio 3 Medium:
1. Review Stability AI license **and** the linked Gemma terms.
2. On the Hugging Face model page accept the repository's gated download terms.
3. Privately authenticate HF on the MoLab machine (do not paste the access
   token into a notebook cell, GitHub, a chat or this repository).
4. Run:

    python molab/install_sonara_multi_engine.py --stable-audio

The Stable Audio installer uses the official repo and its pinned uv environment
with CUDA 12.6 wheels. Confirm compatibility with the Blackwell NVIDIA driver.

## Step 2: prove real generation, not just model presence

    python molab/sonara_multi_engine_agent.py --smoke heartmula-3b
    python molab/sonara_multi_engine_agent.py --smoke stable-audio-3-medium --stable-license-accepted

A smoke is successful only if the official inference code generates a readable
WAV. The script keeps the results in ~/.sonara/multi-engine-v1/readiness.json.
The install script by itself never marks a model ready.

A failed model should remain disabled in the site. If a model is replaced or
its dependencies change, remove its readiness flag and run smoke again.

## Step 3: Cloudflare activation — only after Step 2
Cloudflare Worker configuration uses:
- SONARA_MULTI_ENGINE_ENABLED=true
- SONARA_STABLE_AUDIO_LICENSE_OK=true **only if commercially eligible and the
  HF/Gemma terms have actually been accepted**
- Existing SONARA R2 bucket, existing private relay token and internal server
  secret remain unchanged. Do not put secrets in GitHub.

All model downloads and execution happen on MoLab, never inside Cloudflare.
The live GPU must remain active for the model to appear as ready.

## Step 4: launch an isolated worker (no ACE-Step shutdown)

    python molab/sonara_multi_engine_agent.py --serve

For an approved Stable Audio installation:

    python molab/sonara_multi_engine_agent.py --serve --stable-license-accepted

Use process management or a dedicated MoLab session so a single isolated
worker runs on each GPU; do not launch two competing claim loops with the
same token. The worker sends a heartbeat every 15 seconds and renews leases
for long jobs.

## Step 5: publish carefully
Only after smoke tests and gated model access:
- Verify pull-request CI: syntax, queue security tests and production build.
- Deploy Cloudflare Worker + site assets using the existing official
  frontend workflow, without adding a Vercel deployment step.
- Check GET https://api.sonaraenterprise.com/api/sonara-multi/capabilities
  returns actual model readiness.
- Submit a 30-second instrumental Stable Audio test and a HeartMuLa test
  through the authenticated SONARA UI; confirm a nonzero WAV, playback,
  billing accounting and private R2 delivery.
- Confirm ACE-Step regular generation and existing Remix Pro still work.

## Known constraints
- HeartMuLa 3B supports up to ~4 minutes in the official example.
- Stable Audio 3 Medium supports up to 380 seconds; the initial SONARA
  adapter supports text-to-instrumental only.
- This is **not** a new A+B remix engine. Remix Pro is intentionally untouched.
- The existing Creator duration options stop at 480 seconds but the model
  adapter rejects durations above each model's limit.
- Public launch must be blocked if the model, checkpoint download,
  license or real-GPU smoke test remains incomplete.
