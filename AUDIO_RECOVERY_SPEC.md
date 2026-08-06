# Sonara Labs - V15.2 Audio Recovery Layer Specification (AUDIO_RECOVERY_SPEC.md)

## 1. Architectural Overview
The **Audio Recovery Layer (ARL)** is an inline DSP processing module designed to operate post-synthesis (after the EnCodec decoder stage) and pre-evaluation (before the Music Critic stage). Under the strict software freeze of the neural weights, the ARL acts as an adaptive audio post-processor. It targets the physical limitations of the autoregressive codebooks and neural downsampling (32kHz EnCodec limitations), restoring sub-bass weight, sharpening smeared transients, and aligning the final stereo mix against elite reference masters.

---

## 2. Core Functional Requirements

### A. Non-Destructive Real-time Analysis
The module analyzes the raw exported floating-point audio array to extract five key acoustic vectors:
1. **Sub Energy Ratio**: The percentage of total spectral energy residing in the $20\text{Hz} - 80\text{Hz}$ region.
2. **Crest Factor**: The difference between the peak amplitude and RMS levels (expressed in dB).
3. **Kick ADSR Attack Curve**: The micro-temporal envelope slope of high-energy transients under 120Hz.
4. **Integrated Loudness**: Measured in LUFS according to ITU-R BS.1770-4 standards.
5. **True Peak**: Maximum inter-sample peak level to guarantee absolute digital safety (True Peak $< -0.1\text{dBFS}$).

### B. Adaptive DSP Pipeline
If analyzed metrics fall below targeted reference tolerances, the ARL dynamically activates four precise DSP stages:
- **Sub-Harmonic Synthesizer**: Generates sub-harmonics below 45Hz to reconstruct lost low-end weight.
- **Linear Phase EQ**: Targets specific critical frequency zones without introducing group delay or phase misalignment.
- **Transient Shaper**: Expands the attack envelope of high-impact low-frequency transients.
- **Dynamic Exciter**: Enhances high-frequency sibilance ($>12\text{kHz}$) using controlled odd-harmonic generation.

### C. Feedback Loop & Score-Driven Gate
- **Acceptance Rule**: After applying the DSP chain, the audio is analyzed by the **Music Critic**. 
- **Branch Logic**: If the new score is strictly greater than the baseline score ($Score_{DSP} > Score_{Base}$), the processed file is saved as the final output. If the score does not improve or decreases, the DSP processing is rejected, and the raw EnCodec output is retained.

---

## 3. Subsystem Specifications

### Sub-Harmonic Recovery System
- **Filter Type**: 12th-order Linear Phase High-Pass Filter with a cutoff at 20Hz.
- **Generation Method**: Parallel sub-octave generator that tracks fundamental frequencies in the $70\text{Hz} - 100\text{Hz}$ range and synthesizes a phase-locked sub-harmonic in the $35\text{Hz} - 50\text{Hz}$ range.
- **Mix Wet/Dry**: Automatically scaled based on the Sub Energy Ratio deviation.

### Micro-Transient Shaper
- **Trigger**: Detrended absolute amplitude threshold tracking fast rising edges.
- **Envelope Modification**:
  - **Attack Time**: Fixed at 1.0ms.
  - **Attack Gain**: Scalable between $+0.5\text{dB}$ and $+3.0\text{dB}$ to achieve target Crest Factor.
  - **Sustain/Release**: Unmodified to avoid altering the decay of the tail or reverb fields.
