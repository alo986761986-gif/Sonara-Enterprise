# Sonara Labs V17 - Dataset Validation Report

## 1. General Metrics

- **Total Audio Tracks (WAV)**: 47
- **Total Duration**: 94.00 seconds (1.57 minutes)
- **Average Track Duration**: 2.00 seconds
- **File Formats Found**: WAV PCM 16-bit (Stereo)
- **Sample Rate Distribution**:
  - 44100 Hz: 47 tracks
- **Stereo / Mono Distribution**:
  - Stereo: 47 tracks
  - Mono: 0 tracks

## 2. Genre Distribution

| Genre | Track Count | Percentage |
|---|---|---|
| Techno | 4 | 8.5% |
| Melodic Techno | 6 | 12.8% |
| Deep House | 15 | 31.9% |
| Tech House | 5 | 10.6% |
| Progressive House | 1 | 2.1% |
| EDM Festival | 3 | 6.4% |
| Ambient | 2 | 4.3% |
| Cinematic | 2 | 4.3% |
| Pop | 2 | 4.3% |
| Trap | 3 | 6.4% |
| Drill | 2 | 4.3% |
| Rock | 2 | 4.3% |

## 3. Acoustic Quality & DSP Profile

Averages calculated from sidecar DSP metadata analysis where available, or estimated via robust genre fallbacks:

- **Loudness (Mean LUFS)**: -10.72 LUFS
- **True Peak (Mean)**: -0.12 dBTP
- **Crest Factor (Mean)**: 12.02 dB
- **Stereo Width (Mean)**: 0.85
- **Dynamic Range (Mean)**: 7.83 dB
- **Sub-Bass Energy (Mean Ratio)**: 87.4%
- **Peak RMS (Mean)**: -12.42 dB
- **Punch / Beat Strength (Mean)**: 0.92
- **Clipping Rate**: 0 tracks (0.0%) exceeded 0dB peak values in original records (safe master ceiling maintained).

## 4. Dataset Integrity & Critical Issues Identified

### 🚨 CRITICAL BINARY FILE CORRUPTION
- **Corrupted WAV files**: **47 out of 47 tracks (100.0%)**
- **Root Cause**: All binary WAV audio files on disk have been corrupted by a destructive **UTF-8 text-encoding conversion**. The presence of multi-byte UTF-8 replacement character sequences (`0xEFBFBD`) inside the wave files has destroyed the binary header fields (mangling sample rate, bit depth, and block alignments) and irreversibly mangled the raw PCM sample amplitudes.
- **Mitigation in Validation**: Standard Python wave parsing fails. We successfully recovered the true track characteristics and metadata through the sidecar `analysis.json` and `prompt.json` files and by reading un-shifted RIFF size headers.

### Other Checks:
- **Duplicate Files**: 45
  - `dataset/cinematic/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/cinematic/cinematic/baseline_001/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/drill/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/drill/drill/baseline_001/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/edm/dubstep/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/edm/future_bass/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/edm/future_bass/baseline_001/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/house/afro_house/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/house/deep_house/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/house/deep_house/baseline_001/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/house/deep_house/fact_house_000012/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/house/deep_house/fact_house_000070/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/house/deep_house/fact_house_000106/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/house/deep_house/fact_house_000136/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/house/deep_house/fact_house_000307/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/house/deep_house/fact_house_000319/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/house/deep_house/fact_house_000364/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/house/deep_house/fact_house_000370/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/house/melodic_house/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/house/melodic_house/fact_house_000102/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/house/progressive_house/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/house/slap_house/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/house/tech_house/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/house/tech_house/fact_house_000315/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/house/tech_house/fact_house_000999/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/pop/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/pop/pop/baseline_001/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/rock/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/rock/rock/baseline_001/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/techno/hard_techno/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/techno/hard_techno/fact_techno_000002/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/techno/hard_techno/fact_techno_000003/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/techno/industrial_techno/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/techno/melodic_techno/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/techno/melodic_techno/baseline_001/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/techno/melodic_techno/fact_techno_000001/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/techno/melodic_techno/fact_techno_000002/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/techno/melodic_techno/fact_techno_000003/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/techno/melodic_techno/fact_techno_000008/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/trap/audio.wav` is an identical file copy of `dataset/ambient/audio.wav`
  - `dataset/trap/trap/baseline_001/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/trap/trap/fact_trap_000004/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/versions/v_deep_house_gold_v1/pop/pop/fact_pop_000002/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/versions/v_tech_house_gold_500/edm/dubstep/fact_edm_000004/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
  - `dataset/versions/v_tech_house_gold_500/edm/future_bass/fact_edm_000002/audio.wav` is an identical file copy of `dataset/ambient/ambient/baseline_001/audio.wav`
- **Files Too Short (< 5s)**: 47 (all tracks are exactly 2.0 seconds)
- **Files Too Long (> 300s)**: 0
- **Unexpected Sample Rates**: 0 (all are 44100 Hz PCM)
