"""Sonara V11.3 - Production-Grade Inference Engine.

Implements real local music generation using facebook/musicgen-large via AudioCraft/PyTorch/CUDA,
with a robust local FM synthesis fallback and OOM safety measures.
"""

import os
import gc
import sys
import time
import uuid
import json
import logging

# Ensure project root and engine directory are in sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
if SCRIPT_DIR not in sys.path:
    sys.path.insert(0, SCRIPT_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if os.getcwd() not in sys.path:
    sys.path.insert(0, os.getcwd())

logger = logging.getLogger("SonaraInference")
logger.setLevel(logging.INFO)

# Setup a clean standard console handler if not present
if not logger.handlers:
    handler = logging.StreamHandler(sys.stdout)
    formatter = logging.Formatter("[%(asctime)s] [%(levelname)s] %(message)s")
    handler.setFormatter(formatter)
    logger.addHandler(handler)


class MusicGenSingleton:
    """Singleton pattern ensuring facebook/musicgen-large is loaded only once in memory."""

    _model = None

    @classmethod
    def get_model(cls):
        if cls._model is None:
            import torch
            from audiocraft.models import MusicGen

            device = "cuda" if torch.cuda.is_available() else "cpu"
            logger.info(f"Loading MusicGen singleton on device: {device}")
            
            # Pretrained MusicGen-Large model loading
            cls._model = MusicGen.get_pretrained("/workspace/models/musicgen-large", device=device)
        return cls._model

    @classmethod
    def unload(cls):
        """Unloads model weight tensors and clears CUDA/RAM memory."""
        if cls._model is not None:
            cls._model = None
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass
            logger.info("MusicGen model successfully unloaded.")


def legacy_fm_fallback(audio_path: str, duration: int, bpm: float = 128.0) -> None:
    """Legacy FM synthesizer audio generator. Kept isolated for reference/manual testing only.
    NOT automatically called by the neural generation pipeline.
    """
    import wave
    import struct
    import math

    num_channels = 2
    sampwidth = 2  # 16-bit PCM
    sample_rate = 44100
    num_frames = sample_rate * int(duration)

    # Compute sample-exact beat and tick grid constants
    samples_per_beat = (sample_rate * 60.0) / float(bpm)
    samples_per_tick = samples_per_beat / 4.0
    samples_per_bar = samples_per_beat * 4.0

    kick_phase = 0.0
    bass_phase = 0.0
    lead_phase = 0.0

    with wave.open(audio_path, 'wb') as wav_file:
        wav_file.setnchannels(num_channels)
        wav_file.setsampwidth(sampwidth)
        wav_file.setframerate(sample_rate)

        data = []
        for i in range(num_frames):
            # Integer sample-exact grid quantization positions
            tick_index = int(i / samples_per_tick)
            tick_sample_offset = i % samples_per_tick
            tick_phase = tick_sample_offset / samples_per_tick

            beat_index = int(i / samples_per_beat)
            beat_sample_offset = i % samples_per_beat
            beat_phase = beat_sample_offset / samples_per_beat

            bar_index = int(i / samples_per_bar)

            # Kick drum synthesis (Sample-locked to beats 0, 1, 2, 3)
            kick_env = math.exp(-15.0 * beat_phase)
            kick_freq = 45.0 + 75.0 * kick_env
            kick_phase += (2.0 * math.pi * kick_freq) / sample_rate
            kick = math.sin(kick_phase) * kick_env * 0.45

            # Snare drum synthesis (Sample-locked on beats 2 & 4)
            is_snare = (beat_index % 2) == 1
            snare_env = math.exp(-18.0 * beat_phase) if is_snare else 0.0
            snare_noise = (math.sin(i * 0.1) * 0.5 + math.sin(2.0 * math.pi * 220.0 * (beat_sample_offset / sample_rate)) * 0.5)
            snare = snare_noise * snare_env * 0.30

            # Hi-Hat synthesis (Sample-locked on 16th tick grid)
            is_offbeat_16th = (tick_index % 2) == 1
            hihat_env = math.exp(-35.0 * tick_phase)
            hihat_noise = math.sin(i * 0.77)
            hihat = hihat_noise * hihat_env * (0.24 if is_offbeat_16th else 0.14)

            # Bassline synthesis (Sample-locked to 16th tick & 4-bar chord progression)
            chord_idx = bar_index % 4
            bass_freqs = [130.81, 98.00, 110.00, 87.31] # C3, G2, A2, F2
            current_bass_freq = bass_freqs[chord_idx]
            bass_phase += (2.0 * math.pi * current_bass_freq) / sample_rate
            bass_env = math.exp(-7.0 * tick_phase)
            bass = (math.sin(bass_phase) + 0.3 * math.sin(bass_phase * 2.0)) * bass_env * 0.35

            # Lead Arpeggio synthesis (16th note arpeggio synchronized with beat and tick)
            arp_notes = [current_bass_freq * 2.0, current_bass_freq * 2.5, current_bass_freq * 3.0, current_bass_freq * 4.0]
            current_lead_freq = arp_notes[tick_index % 4]
            lead_phase += (2.0 * math.pi * current_lead_freq) / sample_rate
            lead_env = math.exp(-12.0 * tick_phase)
            lead = math.sin(lead_phase) * lead_env * 0.25

            # Stereo mix with peak clamping (-1.0 dBTP)
            left_mix = kick + snare + (hihat * 0.8) + bass + (lead * 1.15)
            right_mix = kick + snare + (hihat * 1.2) + bass + (lead * 0.85)

            ceiling = 0.891
            left_val = int(max(-ceiling, min(ceiling, left_mix)) * 32767.0)
            right_val = int(max(-ceiling, min(ceiling, right_mix)) * 32767.0)

            data.append(struct.pack('<hh', left_val, right_val))

        wav_file.writeframes(b''.join(data))


def cleanup():
    """Performs full memory cleanup and unloads the loaded singleton instance."""
    MusicGenSingleton.unload()


def generate_song(prompt: str, lyrics: str | None, duration: int, seed: int = 42, bpm: float = 128.0) -> dict:
    """Generates an electronic/instrumental song based on a prompt, duration, and target BPM grid.

    Saves the audio as WAV, metadata as JSON, and logs as text inside a unique execution directory.
    """
    # 1. Prompt and Duration Validation
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError("Invalid prompt: Prompt must be a non-empty string.")

    if not isinstance(duration, (int, float)) or duration <= 0:
        raise ValueError("Invalid duration: Duration must be a positive integer.")

    duration = int(duration)
    bpm = max(60.0, min(240.0, float(bpm)))

    # 2. Execution Directory Creation
    run_uuid = str(uuid.uuid4())
    run_dir = os.path.join("output", run_uuid)
    os.makedirs(run_dir, exist_ok=True)

    audio_path = os.path.join(run_dir, "audio.wav")
    metadata_path = os.path.join(run_dir, "metadata.json")
    log_path = os.path.join(run_dir, "generation.log")

    def log_progress(msg: str):
        timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
        log_line = f"[{timestamp}] {msg}\n"
        logger.info(msg)
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(log_line)

    log_progress("Starting local song generation pipeline...")

    # 3. Deterministic Seed Support
    import random
    random.seed(seed)
    try:
        import numpy as np
        np.random.seed(seed)
    except ImportError:
        pass

    # 4. Neural / Local Synthesis Pipeline execution
    try:
        import torch
        import torchaudio
        from audiocraft.models import MusicGen

        # Set PyTorch random seed
        torch.manual_seed(seed)
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(seed)

        log_progress("Loading model...")
        model = MusicGenSingleton.get_model()
        device = "cuda" if torch.cuda.is_available() else "cpu"

        log_progress("Generating...")
        # Configure model parameters
        model.set_generation_params(
            duration=duration,
            use_sampling=True,
            temp=1.0,
            top_k=250
        )

        # Autocasting and evaluation mode
        with torch.no_grad():
            if device == "cuda":
                from torch.cuda.amp import autocast
                with autocast():
                    wav = model.generate([prompt], progress=True)
            else:
                wav = model.generate([prompt], progress=True)

        log_progress("Decoding...")
        if wav.dim() == 3:
            wav_tensor = wav[0]
        else:
            wav_tensor = wav

        # Convert mono output to stereo
        if wav_tensor.shape[0] == 1:
            wav_tensor = wav_tensor.repeat(2, 1)

        # Resample from model sample rate (usually 32kHz) to 44.1kHz Stereo PCM
        model_sr = model.sample_rate if hasattr(model, "sample_rate") else 32000
        if model_sr != 44100:
            resampler = torchaudio.transforms.Resample(orig_freq=model_sr, new_freq=44100)
            wav_tensor = resampler(wav_tensor.cpu())

        log_progress("Saving...")
        torchaudio.save(
            audio_path,
            wav_tensor.cpu(),
            sample_rate=44100,
            encoding="PCM_S",
            bits_per_sample=16
        )

    except Exception as e:
        log_progress(f"AI engine unavailable or generation failed: {str(e)}")
        # Dynamic CUDA memory recovery if OOM is caught
        if "out of memory" in str(e).lower():
            log_progress("CUDA Out of Memory caught. Evacuating device VRAM caches...")
            gc.collect()
            try:
                import torch
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()
            except ImportError:
                pass
            raise RuntimeError(f"ENGINE_NOT_AVAILABLE: CUDA Out Of Memory during local MusicGen inference ({e})")
        
        # Strictly DO NOT generate audio via FM fallback. Return error state.
        raise RuntimeError(f"ENGINE_NOT_AVAILABLE: AI engine is unavailable or failed to generate audio ({e})")

    # 4.5. Audio Recovery Layer (ARL V15.3) Enhancement
    try:
        log_progress("Applying Audio Recovery Layer (ARL) post-processing...")
        # Detect genre from prompt
        detected_genre = "Deep House"
        prompt_lower = prompt.lower()
        for g in ["melodic techno", "techno", "progressive house", "tech house", "trance", "future rave", "edm festival", "cinematic electronic", "ambient", "deep house"]:
            if g in prompt_lower:
                detected_genre = g.title()
                break

        from engine.audio_recovery.recovery_pipeline import run_recovery_pipeline
        recovery_result = run_recovery_pipeline(
            input_wav_path=audio_path,
            output_wav_path=audio_path,
            genre=detected_genre,
            prompt=prompt
        )
        log_progress(f"ARL Completed: Gate Approved = {recovery_result['is_recovered']}, Baseline Score = {recovery_result['baseline_score']}, Final Score = {recovery_result['final_score']}")

        # Professional Mix & Master Engine Stage
        log_progress("Applying 14-Stage Professional Mixing & Mastering Engine...")
        from engine.dsp_engine import process_wav_file
        master_report = process_wav_file(audio_path, audio_path, target_lufs=-14.0, ceiling_dbtp=-1.0, bpm=bpm)
        log_progress(f"Mix & Master Complete: LUFS={master_report['integrated_lufs']}, TruePeak={master_report['true_peak_dbtp']}dB, PhaseCorr={master_report['stereo_phase_correlation']}")
    except Exception as e:
        log_progress(f"Warning: Audio Recovery Layer encountered an error, falling back to original output: {str(e)}")

    # 5. Metadata logging
    metadata = {
        "prompt": prompt,
        "lyrics": lyrics,
        "duration": duration,
        "seed": seed,
        "sample_rate": 44100,
        "channels": 2,
        "model": "facebook/musicgen-large",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S")
    }

    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    log_progress("Completed.")

    # 6. Conforming return DTO structure
    return {
        "path": os.path.abspath(audio_path),
        "duration": duration,
        "sample_rate": 44100,
        "channels": 2
    }


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Sonara Inference Engine CLI")
    parser.add_argument("--prompt", type=str, default="Electronic track", help="Generation prompt")
    parser.add_argument("--genre", type=str, default="House", help="Target genre")
    parser.add_argument("--mood", type=str, default="Energetic", help="Target mood")
    parser.add_argument("--lyrics", type=str, default="", help="Optional lyrics")
    parser.add_argument("--title", type=str, default="Sonara Track", help="Track title")
    parser.add_argument("--duration", type=int, default=15, help="Duration in seconds")
    parser.add_argument("--bpm", type=float, default=128.0, help="Target BPM tempo")

    args, _ = parser.parse_known_args()

    try:
        final_prompt = f"{args.genre} track, {args.mood} mood. {args.prompt}"
        director_res = {}
        try:
            from engine.director_ai import DirectorAI
            director = DirectorAI()
            director_res = director.process_production_request(
                prompt=args.prompt,
                explicit_genre=args.genre
            )
            final_prompt = director_res.get("composed_final_prompt", final_prompt)
        except Exception as d_err:
            sys.stderr.write(f"DirectorAI notice: {d_err}\n")

        song_info = generate_song(
            prompt=final_prompt,
            lyrics=args.lyrics,
            duration=args.duration,
            seed=42,
            bpm=args.bpm
        )

        res = {
            "status": "SUCCESS",
            "audio_path": song_info.get("path"),
            "duration": song_info.get("duration", args.duration),
            "sample_rate": song_info.get("sample_rate", 44100),
            "channels": song_info.get("channels", 2),
            "director_meta": director_res,
            "song_meta": song_info
        }
        print("JSON_START" + json.dumps(res) + "JSON_END")
    except Exception as err:
        sys.stderr.write(f"Inference process error: {err}\n")
        print("JSON_START" + json.dumps({"status": "ENGINE_NOT_AVAILABLE", "error": str(err)}) + "JSON_END")

