# SONARA: ACE-Step XL Turbo + LM 4B on MoLab (interactive notebook only)

## Status — external SONARA website activation BLOCKED

The owner selected **MoLab RTX PRO 6000**, not RunPod.

As of 22 October 2026, official MoLab restrictions (updated 24 June 2026) explicitly prohibit exposing MoLab compute to outside traffic by proxy/tunnel and using its GPUs to serve third-party web traffic, including reselling its AI endpoints. See https://molab.marimo.io/pages/molab/restrictions .

**Do not deploy an externally exposed API, start Cloudflare tunnels, or connect production SONARA to the notebook without explicit written authorization from MoLab.** The MoLab production-binding GitHub workflow is manual-only and requires an additional authorization guard. This draft is not intended for merging or deployment.

## Supported task: interactive notebook generation

1. Open the existing MoLab notebook at https://molab.marimo.io/notebooks/nb_zJvcNwh1tmMWd9XJoMhiyW and activate the assigned GPU.
2. Start or reuse the existing ACE-Step API **only inside the notebook** at `http://127.0.0.1:8001`. Ensure it has both `acestep-v15-xl-turbo` and `acestep-5Hz-lm-4B` initialized.
3. Do not delete or reinstall the existing checkpoints.
4. Run `scripts/molab-sonara-interactive-test-20261022.py` **in that notebook**. It contacts loopback only; checks `/health`; submits a 10-second original instrumental sample to `/release_task`; polls `/query_result`; downloads a WAV through `/v1/audio` into `/marimo/SONARA_MOLAB_TEST_XL_TURBO.wav`.
5. If the local API enforces a key, set `SONARA_ACESTEP_API_KEY` privately in the MoLab environment and restart the test, never placing the value in repository files or a publicly shared cell. The test does not need or expose Cloudflare.
6. Inspect or listen to the WAV in MoLab and verify that the generation completed using the correct checkpoints.

Example MoLab Python cell (no proxy/tunnel):

```python
import urllib.request
url = (
    "https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/"
    "feature/sonara-molab-xl-only-20261022/"
    "scripts/molab-sonara-interactive-test-20261022.py"
)
source = urllib.request.urlopen(url, timeout=30).read().decode("utf-8")
scope = {"__name__": "sonara_molab_interactive_test"}
exec(compile(source, url, "exec"), scope)
local_wav = scope["main"]()
```

The source is on the user's GitHub branch. The code can be reviewed before execution.

## Production gap

The SONARA website (Vercel/Cloudflare) needs a GPU origin that explicitly permits serving external requests, or documented permission from MoLab. Under current MoLab restrictions, the notebook can run interactive development, not the production website audio backend. No RunPod GPU is being provisioned or used. The public site must remain unchanged until a permitted origin and an authenticated end-to-end generation test are available.

## Diagnostics

- Local API status: `http://127.0.0.1:8001/health` (reachable only from MoLab).
- Expected fields: `models_initialized: true`, `llm_initialized: true`, model `acestep-v15-xl-turbo`, language model `acestep-5Hz-lm-4B`.
- Regression tests: `node --test` after bundled esbuild import resolution as configured in `.github/workflows/test-molab-only.yml`.
