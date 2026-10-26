# SONARA LIVE 1

Snapshot name: SONARA LIVE 1
Snapshot branch: sonara-live-1
Source branch: main
Source commit: 6a5005a57d10e308c6675c309d524920ce9fe411
Created: 2026-10-26

## Runtime target
- MoLab notebook with NVIDIA RTX PRO 6000
- ACE-Step 1.5
- DiT model: acestep-v15-xl-turbo
- LM model: acestep-5Hz-lm-4B
- Local ACE-Step REST API: http://127.0.0.1:8001
- Relay revision: sonara-https-agent-guard-v5
- Relay path: R2 indexed queue over outbound HTTPS/443
- Public app: sonaraenterprise.com

## Included recovery/runtime files
- molab/sonara_r2_pull_agent.py
- molab/sonara_relay_watchdog.py
- molab/sonara_acestep_full_recovery.py

## Current generation profile
- Default: REALISTIC FAST
- XL Turbo: 4 steps
- 1 master
- Instrument Realism V3
- DCW enabled
- ULTRA retains 8 steps + LM planning

## Credential policy
Private relay tokens and local credentials are NOT stored in this snapshot.
Only non-secret fingerprints/configuration are versioned.

## Legacy preservation
The previous historical sonara-live-1 branch state from 2026-08-31 was preserved as:
sonara-live-1-legacy-2026-08-31
