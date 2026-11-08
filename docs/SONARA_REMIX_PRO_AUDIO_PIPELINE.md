# SONARA REMIX PRO — staged GPU architecture (V1)
 
## Present capability and hard limits

This feature branch adds an **isolated, real audio processing toolkit** in
`molab/sonara_remix_pro_toolkit.py`. It does not modify the production ACE-Step XL
Turbo v1.5 + LM 4B, the relay agent or Cloudflare R2. No new endpoint is claimed
to exist until authenticated source/artifact upload, job queue and GPU lifecycle
have been implemented and validated. The current SONARA Remix AI remains usable.

1. **Music analysis**: real waveform measurement with librosa onset/beat tracking,
   chroma-based key estimate and energy-change section boundary **candidates**.
   Low-confidence values are `null`; no fabricated BPM, key, downbeat or
   verse/chorus label.
2. **Stem separation**: run **actual Demucs htdemucs inference** in a separate
   environment and save four stems: vocals, drums, bass and other. On success,
   source-hash manifests allow repeated runs to reuse verified cached stems.
   These are algorithmic estimates; stems can have bleed/artifacts and must be
   listened to. No model weights are distributed in this repository.
3. **Two-song arrangement**: source A vocal and harmonic content + source B
   drums, with a selectable bass source; small time-stretch and detected-beat
   alignment, not just placing two full songs on top of each other. Reject
   unsupported/missing BPM or incompatible cross-song bass harmony when known.
   This is an **offline stem arrangement WAV**. To turn it into a new AI
   generation, import it as source into the existing SONARA Remix AI workflow
   after inspecting it, or run the optional local ACE-Step cover bridge after
   inspecting the source mix (one task, no duplicate billing jobs).
4. **Mastering and QA**: measured integrated loudness, restrained global gain
   and a 4x oversampled approximate intersample-peak check/attenuation. This is
   **not** a professional brickwall limiter, spectral repair tool or certified
   true-peak meter; no claim of SUNO-level audio parity.
5. **Future site integration**: requires a separate reviewed phase: authenticated
   per-user Remix Pro job intake, Cloudflare R2 private source/stem manifests,
   GPU worker run/lease/recovery, signed downloads and player/stem preview.
   Do not reuse open / unauthorized endpoints or local file paths.

## MoLab installation (standalone; does not replace ACE-Step environment)

The isolated environment is **already created** at
`/marimo/SONARA-REMIX-PRO/.venv`. No need to create a second venv or
reinstall the analysis dependencies.

For the **RTX PRO 6000 Blackwell (SM 12.0)** use the guarded installation
helper and a reviewed CUDA PyTorch 12.8 wheel. It checks the actual device
name, compute capability, available VRAM, Python interpreter path and disk
capacity; it refuses to touch a different torch version rather than
overwriting it. It never edits the running ACE-Step environment.

First inspect without installing:

```sh
/marimo/SONARA-REMIX-PRO/.venv/bin/python \
  /marimo/SONARA-REMIX-PRO/sonara_remix_pro_gpu_setup.py
```

When the isolated GPU and disk checks pass, install Demucs **4.1.0** and
PyTorch **2.9.1 + cu128** in that private venv, then test real GPU inference
on a synthetic 10-second technical signal (no customer audio):

```sh
/marimo/SONARA-REMIX-PRO/.venv/bin/python \
  /marimo/SONARA-REMIX-PRO/sonara_remix_pro_gpu_setup.py \
  --install --smoke
```

The smoke test downloads the official `htdemucs` model weights on the
first run, uses a private model cache and verifies four real WAV stems.
It deletes only the private synthetic test source/output directory.
**Never classify Demucs as GPU-ready** until this particular output says
`DEMUCS_REAL_GPU_INFERENCE_VERIFIED=True`.

If CUDA wheels, driver, VRAM, disk or networking prevent installation, the
script exits with a safe error and leaves working SONARA untouched.
Install dependencies only while the customer-generation GPU is otherwise
idle. Network downloads and disk usage can be substantial.

## Offline verification commands

Supply only audio the owner is authorized to remix. Store WAVs and stem outputs
in your private notebook workspace, not in GitHub or exposed public folders.
Each processing phase runs from explicitly supplied files and produces output
in the specified local path.

```sh
python molab/sonara_remix_pro_toolkit.py preflight
python molab/sonara_remix_pro_toolkit.py analyze /marimo/audio/A.wav --output /marimo/audio/A.analysis.json
python molab/sonara_remix_pro_toolkit.py analyze /marimo/audio/B.wav --output /marimo/audio/B.analysis.json
python molab/sonara_remix_pro_toolkit.py separate /marimo/audio/A.wav --out /marimo/sonara-remix-pro-cache --device cuda
python molab/sonara_remix_pro_toolkit.py separate /marimo/audio/B.wav --out /marimo/sonara-remix-pro-cache --device cuda
# Single command for analyzed, separated and newly ARRANGED offline output:
python molab/sonara_remix_pro_toolkit.py two-song-auto \
  --a /marimo/audio/A.wav --b /marimo/audio/B.wav \
  --cache /marimo/sonara-remix-pro-cache --output /marimo/audio/SONARA-REMIX-PRO.wav \
  --device cuda --bpm-a 120 --bpm-b 120
```

### Optional native ACE-Step regeneration (local loopback only)

Once the two-song stem WAV is already produced and reviewed, the following
performs **one actual inference task** with the currently running ACE-Step API.
It does not send anything to public sites, Cloudflare or another service.

```sh
# Only when the existing notebook API is genuinely configured as auth=none:
python molab/sonara_remix_pro_ace_bridge.py \
  --audio /marimo/audio/SONARA-REMIX-PRO.wav \
  --output /marimo/audio/SONARA-REMIX-PRO-AI.wav \
  --prompt 'Rearrange these two source songs as one coherent new track, preserving the melodic hook and expressive percussion groove' \
  --auth-mode none --strength 0.76 --noise 0.14
```

For authenticated local APIs, omit `--auth-mode none`; the private key file
already used by SONARA must be present. No passwords or tokens are printed.
The bridge polls the **same task ID** and refuses to overwrite existing WAVs.
Do not run concurrently with customer requests if the GPU is resource-limited.
The new file stays private in the notebook until an authorized user imports it.

### Mandatory measured quality review

Run the real, non-destructive comparison and inspect any flagged items before
submitting the final mix commercially or uploading it to the website:

```sh
python molab/sonara_remix_pro_quality.py \
  --original /marimo/audio/A.wav \
  --remix /marimo/audio/SONARA-REMIX-PRO-AI.wav \
  --output /marimo/audio/SONARA-REMIX-PRO-AI.qa.json
```

This records clipping, integrated LUFS, sample/approximated true peaks,
crest factor, stereo correlation, measured tempo/key and uncertainty flags.
It **never** declares source separation, harmony or music perceptually perfect.

Use **measured BPM** where confidence is sufficient, otherwise manually
provide BPM, and do not assume near-key labels guarantee chord compatibility.
`--bass-from b` is rejected if measured keys are explicitly incompatible.
Source-audio authorizations, permissions and storage quotas remain the
operator's responsibility. Output includes a local JSON report with source
hashes, beat strategy and measured loudness.

## Release gates

- Python unit tests must run on synthetic assets; no paid generation, model
  download or R2 upload is required in CI.
- A live MoLab smoke test must validate GPU Demucs, stem quality and memory
  use before reporting **GPU separation ready**.
- Reference-song comparisons must measure tempo drift, arrangement continuity,
  instrument bleed, perceived realism, clipping and loudness. Only then
  consider a guarded, opt-in, per-user website API.
- Always retain original files, keep generated stem cache private and allow
  rollback to the current reliable Remix AI implementation.

## Cautions

Demucs estimates source stems; guitars, piano, strings and synthesizers remain
combined in **other** in the four-stem model. Instrument-specific separation
beyond this requires a different evaluated model or specialized workflow.
Automated key/beat estimates are uncertain for sparse, polymetric or
percussive material. A DJ or generated remix needs listening assessment,
copyright permission and possibly manual musical revision.
