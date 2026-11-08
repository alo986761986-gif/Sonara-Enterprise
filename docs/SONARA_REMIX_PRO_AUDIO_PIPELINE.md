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
   after inspecting it.
4. **Mastering and QA**: measured integrated loudness, restrained global gain
   and a 4x oversampled approximate intersample-peak check/attenuation. This is
   **not** a professional brickwall limiter, spectral repair tool or certified
   true-peak meter; no claim of SUNO-level audio parity.
5. **Future site integration**: requires a separate reviewed phase: authenticated
   per-user Remix Pro job intake, Cloudflare R2 private source/stem manifests,
   GPU worker run/lease/recovery, signed downloads and player/stem preview.
   Do not reuse open / unauthorized endpoints or local file paths.

## MoLab installation (standalone; does not replace ACE-Step environment)

Create a **separate venv** from the ACE-Step Python env; this prevents unintended
torch/torchaudio upgrades or engine downtime. Perform only on the chosen MoLab
notebook while it is idle. Check the installed CUDA, torch, torchaudio versions
before installing Demucs: a compatible GPU stack is required for device=cuda.

```sh
python3 -m venv /marimo/sonara-remix-pro-venv
/marimo/sonara-remix-pro-venv/bin/python -m pip install -r molab/requirements-remix-pro.txt
/marimo/sonara-remix-pro-venv/bin/python molab/sonara_remix_pro_toolkit.py preflight
# Optional, in this isolated environment only, after checking torch stack:
# /marimo/sonara-remix-pro-venv/bin/python -m pip install 'demucs==4.0.1'
```

If MoLab does not allow a separate venv or the package conflicts with the GPU,
**stop**; do not alter the working ACE-Step environment.

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
