# SONARA Remix Pro V10 — guarded musical-evidence pilot

## Scope

This is a **conservative extension** of the existing V9 Music Director,
not a replacement of ACE-Step or a new neural music model.

- Existing real-source Demucs stem splitting, V7 rhythm lock, V8 song form,
  original A+B lead vocal arrangement and V9 director remain unchanged.
- When a V9 job is selected and the new module is installed, the worker measures
  a coarse 12-bin pitch-class spectrum from each real song, compares their
  spectra and prepends a bounded harmonic-arrangement suggestion to the generator
  prompt. Source A remains the rhythmic/harmonic reference.
- After V9 rendering, report RMS change at the musical form boundaries.
  Results are **advisory** and do not bypass the existing quality gate.
- The worker heartbeat exposes `v10MusicEvidenceReady` for diagnostics.
- Without the optional V10 module, the existing V9 path is unchanged.

## Explicit limitations

This module **does not** transcribe lyrics or chords, identify song sections or
melodies, measure perceptual originality, verify artist likeness or guarantee
the quality of an A+B fusion. Audio still requires a listening test with
authorized reference material. Existing ACE-Step long-form segmented rendering
remains a potential source of discontinuities.

## CPU unit tests

From `molab/`, with NumPy and SoundFile installed:

```sh
python -m unittest -v test_sonara_remix_pro_v10_music_profile.py
```

Tests cover same/different tonal material, silence and an audible
change at a known section boundary. They do not run on actual GPU output.

## MoLab private activation

The installer `molab/sonara_remix_pro_v10_private_install.py` is **dry-run by
default**. It verifies that the existing V9 private worker has not been
modified unexpectedly and will only activate when run with
`--activate --confirm-maintenance`. It checks two fresh idle heartbeats,
refuses active jobs, fetches two SHA-pinned modules, verifies compiled source,
restarts the private worker, and has guarded rollback if the new process fails.

Run only on the already-paired private MoLab RTX PRO 6000 notebook; do not
publish installation scripts on the end-user website. Do not run installers
against unknown worker versions.

After activation inspect the worker's fresh heartbeat for
`v9MusicDirectorReady=true` and `v10MusicEvidenceReady=true`, then perform
one authorized A+B test using the V9 setting. Verify its master duration,
presence of source A and B, transition diagnostics and actual listening.
Rollback to V9 if the measured or listening result regresses.

**No live GPU activation, production release or listening tests are implied by
merging this source change.** Frontend badges and the actual site job path need
independent verification.
