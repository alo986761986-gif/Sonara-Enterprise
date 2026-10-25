# SONARA Instrument Reference Relay V1

Instrument reference audio now follows the production outbound-only transport:

1. An authenticated SONARA browser uploads the selected reference to the private R2 binding.
2. The upload is associated with the authenticated SONARA user and receives an opaque sref_ identifier.
3. The normal authenticated billing generation request carries only that identifier.
4. The R2 relay binds the reference to the sr2_ generation job only when owner UIDs match.
5. The MoLab v5 agent downloads the private reference over HTTPS/443, writes a private 0600 temporary file, and passes its absolute path to ACE-Step as reference_audio_path.
6. ACE-Step runs text2music with audio_cover_strength clamped to 0.10-0.35; SONARA defaults to 0.20 for style/timbre guidance instead of cover-level copying.
7. The temporary MoLab reference is deleted after the job, and the R2 reference is deleted when the job completes or fails.

Compatibility: v4 agents keep processing ordinary generation jobs. Jobs carrying an instrument reference are claimable only by the v5 agent, preventing silent generation without the selected reference.

No public reference URL, Cloudflare Quick Tunnel, or inbound MoLab connection is required.
