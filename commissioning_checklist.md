# Sonara Labs - V12.0 Production Commissioning Checklist

This checklist defines the rigorous 20-point validation protocol required for the official commissioning of the Sonara Neural Music Generation Engine on NVIDIA RTX hardware (RTX 4090).

## I. Infrastructure & Runtime Configuration

### [ ] 1. RunPod Prerequisites Check
- **Objective**: Confirm the host container is running the designated system environment.
- **Criteria**: System image matches `runpod/pytorch:1.0.2-cu1281-torch280-ubuntu2404` running Python 3.10+.

### [ ] 2. GPU Validation
- **Objective**: Check physical presence of graphics processing unit.
- **Criteria**: NVIDIA RTX GPU (specifically RTX 4090 with 24GB VRAM) is exposed and active.

### [ ] 3. CUDA Validation
- **Objective**: Verify drivers, compilers, and CUDA runtime compatibility.
- **Criteria**: CUDA Version matches 12.8; `nvidia-smi` is callable or CUDA libraries load seamlessly.

### [ ] 4. PyTorch Validation
- **Objective**: Check core tensor operation environment.
- **Criteria**: PyTorch version is >= 2.8.0; `torch.cuda.is_available()` returns `True`.

### [ ] 5. AudioCraft Validation
- **Objective**: Verify AudioCraft framework dependencies are met.
- **Criteria**: Meta AudioCraft library loads without syntax, import, or version errors.

---

## II. Model Integrity & Warmup

### [ ] 6. MusicGen Validation
- **Objective**: Confirm the main transformer pipeline can initialize.
- **Criteria**: `MusicGen.get_pretrained` successfully initializes on the active GPU device.

### [ ] 7. EnCodec Validation
- **Objective**: Verify sound auto-encoder configuration is active.
- **Criteria**: The pre-trained EnCodec model handles compression and reconstruction streams cleanly at 32kHz target.

### [ ] 8. Checkpoint Validation
- **Objective**: Assess offline files mapping.
- **Criteria**: Absolute path directory `/workspace/models/musicgen-large/` contains valid `config.json`, weights, and tokenizers.

### [ ] 9. Warmup Validation
- **Objective**: Execute model priming sequence.
- **Criteria**: A 2-second warmup generation is completed under 10 seconds; VRAM registers model weight states.

---

## III. Inference & Production Pipeline

### [ ] 10. Inference Validation
- **Objective**: Run a complete, standard length audio synthesis cycle.
- **Criteria**: Synthesis successfully runs for a 30-second target track without out-of-memory or pipeline failure.

### [ ] 11. audio.wav Validation
- **Objective**: Validate physical waveform audio export.
- **Criteria**: Exported WAV is a 44100Hz Stereo, 16-bit PCM file that is uncorrupted and has a duration of exactly 30 seconds.

### [ ] 12. Music Critic Validation
- **Objective**: Evaluate audio outputs using Sonara Music Critic.
- **Criteria**: Critic suite computes scores for Production, Commercial, Mix, and Mastering metrics successfully.

### [ ] 13. DSP Validation
- **Objective**: Run post-generation acoustic analyzer metrics.
- **Criteria**: Analyzer outputs Peak DB, RMS DB, LUFS, Stereo Width, and Dynamic Range without crashing.

### [ ] 14. Output Validation
- **Objective**: Confirm all generation side-artifacts are mapped correctly.
- **Criteria**: File assets `audio.wav`, `metadata.json`, and `generation.log` are written directly to target locations.

---

## IV. Long-Term Reliability & Stress Testing

### [ ] 15. Performance Validation
- **Objective**: Analyze generation latency and real-time generation factor (RTF).
- **Criteria**: RTF on RTX 4090 is > 1.0 (generation is faster than real-time playback).

### [ ] 16. VRAM Validation
- **Objective**: Monitor graphics memory usage.
- **Criteria**: Peak VRAM remains under 16GB, leaving sufficient safety margin for standard GPU allocations.

### [ ] 17. Memory Leak Validation
- **Objective**: Verify system RAM is fully released after unloading.
- **Criteria**: System memory is recovered back to starting levels after `cleanup()` is called and cache is swept.

### [ ] 18. Stress Validation
- **Objective**: Execute consecutive production generation loads.
- **Criteria**: 10 consecutive tracks are successfully compiled back-to-back without VRAM fragmentation or OOM.

---

## V. Lifecycle Management

### [ ] 19. Shutdown Validation
- **Objective**: Check model unloading and cache evacuation procedures.
- **Criteria**: `cleanup()` purges CUDA cache block mappings and triggers standard garbage collection.

### [ ] 20. Restart Validation
- **Objective**: Verify the system can start fresh after unloading.
- **Criteria**: Re-initializing the MusicGen model after a shutdown succeeds without environment conflicts.
