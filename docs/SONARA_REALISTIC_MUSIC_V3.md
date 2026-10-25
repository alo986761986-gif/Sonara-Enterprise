# SONARA Realistic Music V3

REALISTIC is now the default music profile because INSTANT at one diffusion step is a speed preview, not the best quality point for ACE-Step XL Turbo.

## REALISTIC
- one master;
- 8 XL Turbo inference steps;
- shift 3.0;
- 5Hz LM thinking/audio planning enabled;
- Instrument Realism V3;
- genre-aware Mix/Master V1;
- DCW double correction, with Think-oriented 0.02 low / 0.06 high values;
- direct VAE decode for tracks up to 240 seconds, tiled decode retained for longer tracks;
- anti-synthetic negative conditioning for robotic quantization, static velocity, cloned bars, plastic acoustic timbre and overcompression.

A single master offsets part of the added compute versus the former two-candidate QUALITY path.

## Instrument Realism V3
V3 adds performance constraints aimed at the common 'fake instrument' failure mode:
- repeated notes do not reuse identical attack/velocity/envelope fingerprints;
- phrases develop across beats and bars instead of isolated MIDI-like triggering;
- arrangements include rests, pickups, releases and density changes;
- acoustic drums keep overlapping shell/cymbal/room decay;
- guitar strums, piano pedal/release, string bows and wind breaths evolve with the phrase;
- acoustic performers remain in a stable shared room perspective;
- no phase-locked acoustic doubles or plastic sample-library sameness.

## Profiles
- INSTANT: 1 step, one track, no LM thinking.
- REALISTIC: 8 steps, one track, LM planning. Recommended.
- ULTRA: 8 steps, up to two tracks, LM planning.

The official ACE-Step 1.5 Turbo guidance is 8 inference steps and shift 3.0. DCW is available on Turbo paths and adds sampler-side correction with negligible compute.
