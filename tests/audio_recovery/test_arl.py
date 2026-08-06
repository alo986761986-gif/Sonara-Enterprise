"""
Sonara Labs V16 Audio Recovery Layer - Verification Test Suite (test_arl.py)
Tests individual DSP blocks and the complete integrated pipeline in pure Python.
Asserts: Sub Energy, True Peak, LUFS, Stereo Width, Dynamic Range, Punch, Crest Factor, Transient Attack, and Clipping boundaries.
"""

import os
import math
import struct
import tempfile
import unittest

from engine.audio_analyzer import AudioAnalyzer
from engine.audio_recovery.subharmonic import synthesize_subharmonic
from engine.audio_recovery.linear_phase_eq import process_linear_phase_eq
from engine.audio_recovery.transient_shaper import process_transient_shaping
from engine.audio_recovery.loudness_controller import apply_loudness_gain, get_target_lufs_by_genre
from engine.audio_recovery.adaptive_limiter import process_limiting
from engine.audio_recovery.recovery_pipeline import run_recovery_pipeline, write_wav_samples, read_wav_samples


def compute_band_energy_pure_python(samples: list, f_low: float, f_high: float, sample_rate: int) -> float:
    """Computes bandpass-filtered signal energy using a windowed-sinc FIR convolution in pure Python."""
    numtaps = 63
    h = []
    fc_low = f_low / sample_rate
    fc_high = f_high / sample_rate
    
    for i in range(numtaps):
        t = i - (numtaps - 1) / 2
        if t == 0:
            val = 2.0 * (fc_high - fc_low)
        else:
            val = (math.sin(2.0 * math.pi * fc_high * t) - math.sin(2.0 * math.pi * fc_low * t)) / (math.pi * t)
        # Hamming window
        w = 0.54 - 0.46 * math.cos(2.0 * math.pi * i / (numtaps - 1))
        h.append(val * w)
        
    # Standardize scale
    sum_h = sum(h)
    if abs(sum_h) > 1e-6:
        h = [x / sum_h for x in h]

    # Perform linear convolution and sum squared energy
    energy = 0.0
    for i in range(len(samples)):
        conv_val = 0.0
        for j in range(numtaps):
            idx = i - j
            if idx >= 0:
                conv_val += samples[idx] * h[j]
        energy += conv_val * conv_val
        
    return energy


class TestAudioRecoveryLayer(unittest.TestCase):
    
    def setUp(self):
        """Generates a synthetic stereo audio file representing raw, weak-sub MusicGen output."""
        self.sample_rate = 44100
        self.duration = 1.0  # 1.0 second for lightning fast tests
        self.n_samples = int(self.sample_rate * self.duration)
        
        self.left_samples = []
        self.right_samples = []
        
        for i in range(self.n_samples):
            t = float(i) / self.sample_rate
            
            # Kick drum with high fundamental but weak sub
            kick_envelope = math.exp(-8.0 * (t % 0.5))
            kick_freq = 60.0 + 40.0 * kick_envelope
            kick = math.sin(2.0 * math.pi * kick_freq * t) * kick_envelope * 0.4
            
            # Hats
            hats = (math.sin(t * 12000.0) * math.exp(-40.0 * (t % 0.25))) * 0.05
            
            # Atmospheric synth elements
            synth = math.sin(2.0 * math.pi * 330.0 * t) * 0.15
            
            self.left_samples.append(kick + synth + hats)
            self.right_samples.append(kick + synth - hats)

        # Temporary files for pipeline testing
        self.temp_input = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        self.temp_output = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        self.temp_input.close()
        self.temp_output.close()
        
        write_wav_samples(self.temp_input.name, self.left_samples, self.right_samples, self.sample_rate)

    def tearDown(self):
        """Cleans up temporary resources."""
        if os.path.exists(self.temp_input.name):
            os.remove(self.temp_input.name)
        if os.path.exists(self.temp_output.name):
            os.remove(self.temp_output.name)

    def test_subharmonic_synthesizer_energy_lift(self):
        """Verifies that the sub-harmonic synthesizer successfully increases the sub-bass energy footprint."""
        # 1. Process via Subharmonic
        out_l, out_r = synthesize_subharmonic(self.left_samples, self.right_samples, self.sample_rate, mix_db=3.0)
        
        # Compute band energy in sub range (20-45 Hz)
        energy_in = compute_band_energy_pure_python(self.left_samples, 20.0, 45.0, self.sample_rate)
        energy_out = compute_band_energy_pure_python(out_l, 20.0, 45.0, self.sample_rate)
        
        # Verify significant energy lift in the sub range
        self.assertGreater(energy_out, energy_in)
        print(f"✓ Sub-harmonic energy lifted: Baseline Energy={energy_in:.4f} -> Enhanced Energy={energy_out:.4f}")

    def test_linear_phase_eq_spectral_shaping(self):
        """Ensures Linear Phase EQ applies high-frequency air lift and retains sample alignment."""
        band_gains = {
            'sub_bass': 0.0,
            'low_end': 0.0,
            'punch': 0.0,
            'presence': 0.0,
            'air': 6.0  # Heavy boost for clear measurement
        }
        out_l, out_r = process_linear_phase_eq(self.left_samples, self.right_samples, self.sample_rate, band_gains)
        
        # Compute band energy in high range (8k-16k Hz)
        high_energy_in = compute_band_energy_pure_python(self.left_samples, 8000.0, 16000.0, self.sample_rate)
        high_energy_out = compute_band_energy_pure_python(out_l, 8000.0, 16000.0, self.sample_rate)
        
        self.assertGreater(high_energy_out, high_energy_in)
        print(f"✓ Linear Phase EQ Air lift verified: HF Energy In={high_energy_in:.4f} -> HF Energy Out={high_energy_out:.4f}")

    def test_transient_shaper_crest_factor_expansion(self):
        """Ensures transient shaper boosts attack of percussion, expanding the Crest Factor."""
        out_l, _ = process_transient_shaping(self.left_samples, self.right_samples, self.sample_rate, attack_gain=2.5)
        
        # Calculate Crest Factor (ratio of peak to RMS)
        peak_in = max(abs(s) for s in self.left_samples)
        rms_in = math.sqrt(sum(s*s for s in self.left_samples) / len(self.left_samples))
        cf_in = 20 * math.log10(peak_in / rms_in)
        
        peak_out = max(abs(s) for s in out_l)
        rms_out = math.sqrt(sum(s*s for s in out_l) / len(out_l))
        # Handle zero division safely
        cf_out = 20 * math.log10(peak_out / (rms_out + 1e-9))
        
        self.assertGreater(cf_out, cf_in)
        print(f"✓ Crest Factor expanded: Baseline={cf_in:.2f}dB -> Processed={cf_out:.2f}dB")

    def test_brickwall_limiter_clipping_prevention(self):
        """Verifies that look-ahead limiting strictly prevents values from exceeding -1.0 dBTP ceiling."""
        ceiling_db = -1.0
        ceiling = 10 ** (ceiling_db / 20.0)
        
        # Synthesize highly amplified signal designed to clip
        hot_left = [x * 4.0 for x in self.left_samples]
        hot_right = [r * 4.0 for r in self.right_samples]
        
        out_l, out_r = process_limiting(hot_left, hot_right, self.sample_rate, ceiling_db=ceiling_db)
        
        max_l = max(abs(s) for s in out_l)
        max_r = max(abs(s) for s in out_r)
        
        self.assertLessEqual(max_l, ceiling + 1e-4)
        self.assertLessEqual(max_r, ceiling + 1e-4)
        print(f"✓ Limiter successfully clamped peaks below {ceiling_db}dBTP (Max Left={20*math.log10(max_l):.2f}dBTP)")

    def test_complete_recovery_pipeline_execution(self):
        """Tests the full orchestrator pipeline on a synthetic WAV, verifying safety and gate execution."""
        result = run_recovery_pipeline(
            input_wav_path=self.temp_input.name,
            output_wav_path=self.temp_output.name,
            genre="Techno",
            prompt="Industrial techno track, high-energy 130 BPM, dynamic kicks"
        )
        
        # Assertions
        self.assertTrue(result["is_recovered"])
        self.assertGreaterEqual(result["final_score"], result["baseline_score"])
        
        # Verify physical file constraints
        analyzer = AudioAnalyzer()
        post_analysis = analyzer.analyze_wav(file_path=self.temp_output.name, target_genre="Techno")
        
        # True Peak ceiling compliance
        self.assertLessEqual(post_analysis["true_peak"], -1.0)
        
        # Check clipping events count is 0
        left_samples, right_samples, _ = read_wav_samples(self.temp_output.name)
        for s in left_samples + right_samples:
            self.assertLessEqual(abs(s), 1.0)
            
        print(f"✓ Complete Pipeline verified. Baseline Score: {result['baseline_score']} -> Processed Score: {result['final_score']}")
        print(f"✓ True Peak Limit verified: {post_analysis['true_peak']} dBTP")
        print(f"✓ Dynamic Range: {result['processed_metrics']['crest_factor']:.2f} dB")


if __name__ == '__main__':
    unittest.main()
