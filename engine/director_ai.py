"""
Sonara V12 Engine - Autonomous Music Director (DirectorAI)

Production rules:
- Planning never fabricates audio.
- DSP/mastering is executed only when a real generated WAV is supplied.
- Quality scores are derived from measured audio metrics; no score is force-promoted.
- The returned composed_final_prompt is suitable for the downstream neural generator.
"""

import os
import time
from typing import Dict, Any, List, Optional

from engine.genre_lock import GenreFidelityEngine
from engine.arrangement_engine import ArrangementEngine
from engine.pattern_generator import ProfessionalPatternGenerator as PatternGenerator
from engine.dsp_engine import process_wav_file


class DirectorAI:
    """Autonomous planning, mastering and measured quality control for Sonara music generation."""

    QUALITY_THRESHOLD = 8.5

    def __init__(self):
        self.arrangement_engine = ArrangementEngine()
        self.pattern_generator = PatternGenerator()
        self.genre_engine = GenreFidelityEngine()

    def analyze_prompt(self, prompt: str, explicit_genre: Optional[str] = None) -> Dict[str, Any]:
        prompt = str(prompt or "").strip()
        if not prompt:
            raise ValueError("DirectorAI requires a non-empty prompt")

        genre_lock = self.genre_engine.verify_genre_lock(prompt, explicit_genre)
        genre = genre_lock["detected_genre"]
        subgenre = genre_lock["detected_subgenre"]
        bpm = genre_lock["target_bpm"]
        key_sig = genre_lock["target_key"]

        prompt_lower = prompt.lower()
        if any(w in prompt_lower for w in ["aggressive", "heavy", "banger", "peak", "fast", "driving"]):
            energy = "Peak Energy"
            energy_score = 9.5
            mood = "High Energy / Euphoric"
        elif any(w in prompt_lower for w in ["chill", "relax", "deep", "soft", "organic", "ambient"]):
            energy = "Moderate Energy"
            energy_score = 6.5
            mood = "Deep / Atmospheric"
        else:
            energy = "High Energy"
            energy_score = 8.5
            mood = "Dynamic / Soulful"

        arr = self.arrangement_engine.generate_arrangement(subgenre, energy=energy)
        structure_list = [sec["section"] for sec in arr.get("sections", [])]

        subgenre_lower = subgenre.lower()
        if "afro" in subgenre_lower:
            instruments = ["Congas", "Bongos", "Afro Shakers", "Tribal Chant", "Deep Organ Bass", "Four-on-the-Floor Kick"]
            swing_pct = 22.0
            chords = ["Dm9", "Gm7", "Bbmaj7", "A7alt"]
        elif "tech" in subgenre_lower:
            instruments = ["Short Punchy Kick", "Syncopated Bassline", "Percussion Loops", "Minimal Vocal Chop", "Offbeat Hi-Hat"]
            swing_pct = 15.0
            chords = ["Am7", "Fmaj7", "Cmaj7", "Em7"]
        elif "melodic" in subgenre_lower:
            instruments = ["Kick", "Organic Shaker", "Lush Pad Array", "Melodic Synth Lead", "Sub Bass", "Pluck Synth"]
            swing_pct = 8.0
            chords = ["Fm9", "Abmaj9", "Dbmaj9", "Bbm9"]
        elif "deep" in subgenre_lower:
            instruments = ["Four-on-the-Floor Kick", "Offbeat Open Hat", "Analog Rhodes", "Sub Bass", "Clap Layer"]
            swing_pct = 12.0
            chords = ["Fm7", "Dbmaj7", "Abmaj7", "Eb7"]
        else:
            instruments = ["Kick", "Hi-Hat", "Sub Bass", "Synth Lead", "Atmospheric Pad"]
            swing_pct = 10.0
            chords = ["Cm7", "Abmaj7", "Fm7", "Bb7"]

        return {
            "genre": genre,
            "subgenre": subgenre,
            "mood": mood,
            "energy": energy,
            "energy_score": energy_score,
            "bpm": bpm,
            "key_signature": key_sig,
            "structure": structure_list,
            "arrangement_detail": arr,
            "instruments": instruments,
            "swing_pct": swing_pct,
            "chords": chords,
            "recommended_model": "ACE-Step-1.5-XL",
            "director_approval": True,
        }

    def compose_generation_prompt(self, original_prompt: str, analysis: Dict[str, Any]) -> str:
        structure = " -> ".join(analysis.get("structure") or [])
        instruments = ", ".join(analysis.get("instruments") or [])
        chords = " -> ".join(analysis.get("chords") or [])
        return (
            f"{original_prompt.strip()}\n"
            f"SONARA Director blueprint: {analysis['genre']} / {analysis['subgenre']}; "
            f"{analysis['bpm']} BPM; key {analysis['key_signature']}; mood {analysis['mood']}; "
            f"energy {analysis['energy']}; swing {analysis['swing_pct']}%. "
            f"Arrangement: {structure}. Instruments: {instruments}. Harmonic direction: {chords}. "
            "Preserve genre authenticity, strong hook identity, human micro-variation, deliberate transitions, "
            "clean section development and a composed ending. Avoid static looping, generic filler, clipping, "
            "phasey vocals, metallic artifacts and plastic transients."
        )

    def monitor_in_flight(self, stage: str, params: Dict[str, Any]) -> Dict[str, Any]:
        """Report pipeline intent without inventing measured audio scores."""
        return {
            "stage": stage,
            "status": "PLANNED",
            "checks": ["genre-fidelity", "tempo-lock", "structure", "headroom", "artifact-control"],
            "params": params,
        }

    def evaluate_production_quality(self, audio_metrics: Dict[str, Any], prompt_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Score only values produced by the real DSP/audit pass."""
        lufs = float(audio_metrics.get("integrated_lufs", -99.0))
        true_peak = float(audio_metrics.get("true_peak_dbtp", 99.0))
        phase_corr = float(audio_metrics.get("stereo_phase_correlation", -1.0))

        lufs_delta = abs(lufs - (-14.0))
        mastering_score = max(0.0, min(10.0, 10.0 - lufs_delta * 1.8 - max(0.0, true_peak + 1.0) * 4.0))
        stereo_score = max(0.0, min(10.0, 7.0 + max(-1.0, min(1.0, phase_corr)) * 3.0))
        signal_score = 10.0 if true_peak <= -0.9 else max(0.0, 10.0 - (true_peak + 0.9) * 5.0)

        bpm_locked = audio_metrics.get("bpm_locked")
        tempo_score = 10.0 if bpm_locked is not False else 4.0
        clipping = bool(audio_metrics.get("clipping_detected", False))
        clipping_score = 2.0 if clipping else 10.0

        overall_score = round(
            mastering_score * 0.30
            + stereo_score * 0.15
            + signal_score * 0.20
            + tempo_score * 0.15
            + clipping_score * 0.20,
            2,
        )
        approved = overall_score >= self.QUALITY_THRESHOLD and not clipping and true_peak <= -0.9

        scores = {
            "masteringScore": round(mastering_score, 2),
            "stereoScore": round(stereo_score, 2),
            "signalScore": round(signal_score, 2),
            "tempoScore": round(tempo_score, 2),
            "clippingScore": round(clipping_score, 2),
            "overallScore": overall_score,
        }
        return {
            "scores": scores,
            "overall_score": overall_score,
            "quality_threshold": self.QUALITY_THRESHOLD,
            "approved": approved,
            "status": "APPROVED_FOR_RELEASE" if approved else "NEEDS_AUTONOMOUS_RETRY",
            "measured_from_real_audio": True,
        }

    def process_production_request(
        self,
        prompt: str,
        explicit_genre: Optional[str] = None,
        output_file: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Run Director planning and optionally post-process a real generated WAV.

        If output_file is omitted this method is strictly a pre-generation planning pass.
        It never creates placeholder or synthetic audio.
        """
        start_time = time.time()
        pipeline_log: List[str] = []
        analysis = self.analyze_prompt(prompt, explicit_genre)
        final_prompt = self.compose_generation_prompt(prompt, analysis)

        pipeline_log.append("[Phase 1] Prompt/genre/tempo/key analysis complete")
        pipeline_log.append("[Phase 2] Arrangement blueprint complete")
        pipeline_log.append("[Phase 3] Instrument and harmonic direction complete")

        base_result: Dict[str, Any] = {
            "status": "PLANNED" if not output_file else "PROCESSING",
            "director": "Sonara AI Director V12.1",
            "prompt_analysis": analysis,
            "composed_final_prompt": final_prompt,
            "pipeline_log": pipeline_log,
            "audio_file": output_file,
            "dsp_report": None,
            "quality_audit": None,
            "retry_count": 0,
        }

        if not output_file:
            base_result["execution_time_ms"] = int((time.time() - start_time) * 1000)
            base_result["status"] = "PLANNED"
            return base_result

        if not os.path.isfile(output_file) or os.path.getsize(output_file) < 1024:
            raise FileNotFoundError(f"DirectorAI requires a real generated WAV for mastering: {output_file}")

        pipeline_log.append("[Phase 4] Running 14-stage DSP mastering on real generated audio")
        dsp_report = process_wav_file(
            output_file,
            output_file,
            target_lufs=-14.0,
            ceiling_dbtp=-1.0,
            bpm=analysis["bpm"],
        )
        quality = self.evaluate_production_quality(dsp_report, analysis)
        pipeline_log.append(
            f"[Phase 5] Measured quality audit: score={quality['overall_score']} "
            f"approved={quality['approved']}"
        )

        retry_count = 0
        if not quality["approved"]:
            retry_count = 1
            pipeline_log.append("[Phase 6] Measured score below threshold; running one conservative DSP correction pass")
            dsp_report = process_wav_file(
                output_file,
                output_file,
                target_lufs=-14.0,
                ceiling_dbtp=-1.0,
                bpm=analysis["bpm"],
            )
            quality = self.evaluate_production_quality(dsp_report, analysis)
            pipeline_log.append(
                f"[Phase 6] Correction audit: score={quality['overall_score']} "
                f"approved={quality['approved']}"
            )

        base_result.update(
            {
                "status": "SUCCESS" if quality["approved"] else "NEEDS_REGENERATION",
                "execution_time_ms": int((time.time() - start_time) * 1000),
                "dsp_report": dsp_report,
                "quality_audit": quality,
                "retry_count": retry_count,
            }
        )
        return base_result


if __name__ == "__main__":
    import json

    director = DirectorAI()
    result = director.process_production_request(
        "Produce a high energy Afro House track with organic percussion and tribal chant"
    )
    print(json.dumps(result, indent=2))
