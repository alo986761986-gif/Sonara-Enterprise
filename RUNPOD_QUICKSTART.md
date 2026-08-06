# RunPod Quickstart Guide - Sonara Labs

Get up and running with Sonara's AI music generation suite on an RTX 4090 system in under 5 minutes.

---

## The 3-Step Execution Sequence

### Step 1: Boot and Install Dependencies
Launch your RunPod container and run:
```bash
bash bootstrap_runpod.sh
```

### Step 2: Download the 3.3B MusicGen Large Model Weights
Fetch and map model checkpoints directly to the local storage mount:
```bash
python3 download_models.py
```

### Step 3: Run the Verification and Integration Test
Confirm everything is operational:
```bash
PYTHONPATH=. python3 verify_install.py
```

---

## Generating Music Tracks

To produce a high-fidelity 30-second music sample of Melodic Techno with deep festival kick drums and analog lead synthesizers:

```bash
PYTHONPATH=. python3 generate_demo.py
```

### Generated Outputs:
Once completed, files will be written to:
- **Audio File**: `output/demo/audio.wav` (PCM Stereo @ 44.1kHz)
- **Metadata**: `output/demo/metadata.json`
- **Execution Log**: `output/demo/generation.log`

---

## Measuring Performance & Benchmarking

To measure and log token throughput, VRAM consumption, CPU allocation, and elapsed generation latency:

```bash
PYTHONPATH=. python3 benchmark_runtime.py
```
*Results will be stored cleanly in `logs/benchmark_report.json`.*

---

## Production Stability Sweeps

To execute 10 consecutive model cycles checking for memory leaks, VRAM fragmentation, and clean release loops:

```bash
PYTHONPATH=. python3 musicgen_healthcheck.py
```
