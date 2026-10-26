# SONARA Relay Watchdog + Realistic Fast

## Root cause fixed
A generation stuck around 10% can be a queued R2 job that the MoLab agent never claims. The live heartbeat now exposes that state. The watchdog keeps the relay agent alive without touching ACE-Step.

## Watchdog
molab/sonara_relay_watchdog.py:
- launches only ~/.sonara/sonara_r2_pull_agent.py;
- restarts it after an unexpected exit;
- uses a single-process flock;
- never restarts or reconfigures ACE-Step;
- never places relay credentials in process arguments.

## REALISTIC FAST
Default quality is now:
- one master;
- 4 XL Turbo steps;
- shift 3.0;
- LM thinking off for latency;
- Instrument Realism V3;
- DCW double correction;
- direct VAE decode for normal-length tracks.

ULTRA remains 8 steps + LM planning. INSTANT remains 1 step.
