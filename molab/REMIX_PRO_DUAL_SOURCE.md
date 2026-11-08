# Remix Pro: preserving both uploaded songs

The former pipeline used A vocals/harmony and B drums, then replaced that mix
entirely with an ACE-Step cover. A completed generation did not establish that
both uploaded melodies remained in the delivered file.

The revised agent enables `dual_source=True`. It alternates the two tonal beds
(vocals, other instruments, and each recording's own bass) on a common beat
grid, with the opposite recording's drums underneath. Percussion crossfades
at transitions; tonal beds briefly fade through zero so incompatible tonal
material is not layered. Both tonal contributions must have measurable energy.
Identical source files, missing contributions and insufficient aligned material
fail before generation. The mix ends at the shorter source's aligned length.

ACE-Step still runs one real cover. Demucs separates that generated output,
and only its drums are beat-aligned and added to the preserved source mix,
at no more than -18 dB relative RMS. Generated vocals and melodies cannot replace
the originals. A failed cover, silent generated percussion or unverified tempo
fails the job rather than returning a falsely successful output.

Limitations: this is beat-grid editing, not detected musical phrases, chord
transcription, automatic harmonic reharmonization or a guarantee of subjective
musical quality. Arbitrary section boundaries may cut lyrics. Tempo changes
remain limited to the existing 0.8–1.25 stretch range. Tonal sections from both
recordings must occur in the selected beginning of the clips. The extra Demucs
pass increases GPU work. Listening with real source songs is required before
release; synthetic regression fixtures verify signal retention only.

## Rollout

Deploy the agent, toolkit and local QA runner together in the existing isolated
`/marimo/SONARA-REMIX-PRO` environment. Drain the current Remix Pro job before
restarting its dedicated agent; do not restart ACE-Step or the main relay.
Deploy the UI description only with that backend update. The existing gateway
protocol is unchanged. The old toolkit mode remains available to legacy CLI
callers. The bass selector is removed from the Pro UI because each tonal section
now retains its own bass.

The existing notebook URL returned "Page not found" during this change. No live
notebook installation, GPU inference or production audio validation has been
performed. Run `sonara_remix_pro_live_qa.py` on the current notebook with two
authorized, different songs, inspect the report, and listen to its final WAV.
Then verify the authenticated site upload/job/download flow using the same pair.
