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


## Executable handoff: no Vercel and no TinyFish

**First dependency:** access to the existing MoLab RTX PRO 6000 notebook's Python runtime. The GitHub connector can commit and review source code; it cannot execute code inside that GPU session or authenticate to Cloudflare. Do not mark the real GPU QA or public deploy completed until actual stdout/API evidence exists.

### 1. MoLab isolated installer (does not restart anything)

Use the current MoLab notebook with the existing GPU/venv. The installer checks the lock and refuses to change code while the dedicated Remix Pro agent is processing; do not terminate jobs to bypass this lock. Run in a MoLab Python cell, using a distinct function/local variables to avoid marimo duplicate global bindings:

```python
def sonara_v3_install_safe():
    import subprocess
    from pathlib import Path
    from urllib.request import urlopen
    import tempfile
    url = ("https://raw.githubusercontent.com/alo986761986-gif/"
           "Sonara-Enterprise/3f2d7d2bfc3387ecd495ec50f6d8d0f8b5463e15/"
           "molab/install_sonara_remix_fusion_v3.py")
    data = urlopen(url, timeout=30).read()
    # This script itself downloads only four Git-blob-hash-pinned source modules.
    with tempfile.TemporaryDirectory(prefix="sonara-v3-installer-") as d:
        file = Path(d) / "install.py"
        file.write_bytes(data)
        python = "/marimo/SONARA-REMIX-PRO/.venv/bin/python"
        subprocess.run([python, str(file)], check=True)
        # ONLY if preflight confirms no running Pro agent and explicit backup approval:
        # subprocess.run([python, str(file), "--install"], check=True)

sonara_v3_install_safe()
```

After checking the preflight report and confirming **there are no active Pro jobs**, rerun the same cell with the commented `--install` command enabled. Four version-pinned modules are installed with a backup under `/marimo/SONARA-REMIX-PRO/backups/`. The existing site, R2, main relay, and ACE-Step are not changed. No tokens are displayed.

### 2. Genuine GPU A+B audition, no customer billing

Place two different, authorized WAVs under `/marimo`; use their actual filenames, not placeholders. Run the isolated QA runner **only after V3 installation**:

```sh
/marimo/SONARA-REMIX-PRO/.venv/bin/python \
  /marimo/SONARA-REMIX-PRO/sonara_remix_pro_live_qa.py \
  --source-a /marimo/INPUT_A_AUTORIZZATO.wav \
  --source-b /marimo/INPUT_B_AUTORIZZATO.wav \
  --rights-confirmed \
  --duration 30 \
  --prompt "Create a single newly composed song fusing A's musical identity with B's rhythmic and timbral character. Never overlap the source recordings." \
  --auth-mode none
```

Use `--auth-mode required` instead if the existing ACE-Step local API requires authentication; never print or commit a token. The runner checks Demucs on both sources, sends an A-only structural guide and separate B-only style reference to ACE-Step, audits the resulting WAV and writes a private `qa-report.json`. Verify `SONARA_QA_REAL_ACE_STEP_DUAL_REFERENCE=True` and `SONARA_QA_AUDIO_TECHNICAL_PASS=True`, **then listen** for originality, the identifiable influence of both A and B, natural drums, clean vocals and connected sections. Repeat with a longer duration only after the first run passes. Automated audio metrics cannot confirm artistic quality.

### 3. Cloudflare-only staged rollout

Never use the repo's `deploy-vercel-production.yml`. The manual guarded entrypoint is `scripts/deploy-remix-fusion-cloudflare.cjs` and requires Wrangler plus the existing Cloudflare API token in the trusted environment, not in GitHub or chat text. Its gateway stage requires saved rollback and a drained V2 Pro queue; only after the V3 GPU heartbeat has been verified may the final frontend stage run. Do not skip the gates, and verify the public `/api/sonara-relay/pro-capabilities` reports `fusionAvailable: true`.

The protected release remains **not deployed** when these preconditions are unmet.

**GitHub Actions limitation:** a new `workflow_dispatch` workflow is not runnable from the GitHub Actions UI until its workflow file exists on the default branch. The proposed `.github/workflows/sonara-remix-fusion-cloudflare-manual.yml` currently lives on the feature branch; do not merge it or assume that a production release has happened without reviewing other main-branch automation. The standalone deployment script can be run only in a trusted authenticated environment after both stages' safety prerequisites are satisfied.
