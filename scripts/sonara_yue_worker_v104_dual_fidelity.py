#!/usr/bin/env python3
from __future__ import annotations

import math
import time

import sonara_yue_worker_v9_exl2 as base

VERSION = "10.4-dual-fidelity-fast"
SAMPLE_RATE = 44100


def _clamp(value, fallback, minimum, maximum):
    return base.clamp(value, fallback, minimum, maximum)


def _creator_prompt(body: dict) -> str:
    value = base.safe_text(
        body.get("prompt")
        or body.get("creator_prompt")
        or body.get("raw_prompt")
        or body.get("sonara_creator_prompt")
    )
    return value[:1800]


def _cross_append(current, chunk, fade_frames: int):
    if current.shape[0] == 0:
        return chunk.copy()
    if chunk.shape[0] == 0:
        return current
    fade = min(fade_frames, current.shape[0], chunk.shape[0])
    if fade <= 1:
        return base.np.concatenate([current, chunk], axis=0)
    ramp = base.np.linspace(0.0, 1.0, fade, dtype=base.np.float32)[:, None]
    blended = current[-fade:] * (1.0 - ramp) + chunk[:fade] * ramp
    return base.np.concatenate([current[:-fade], blended, chunk[fade:]], axis=0)


def _enforce_duration(path: base.Path, duration_sec: int, bpm: int) -> tuple[base.Path, float, str]:
    data, sample_rate = base.sf.read(str(path), dtype="float32", always_2d=True)
    target_frames = max(1, int(round(duration_sec * sample_rate)))
    repair = "none"

    if data.shape[0] < target_frames:
        repair = "musical-tail-fill"
        bar_frames = max(1, int(round((240.0 / max(40, min(220, bpm))) * sample_rate)))
        phrase_frames = min(data.shape[0], max(bar_frames * 2, int(sample_rate * 2.0)))
        tail = data[-phrase_frames:].copy() if phrase_frames > 0 else data.copy()
        if tail.shape[0] == 0:
            raise RuntimeError("YuE ha prodotto audio vuoto durante il controllo durata.")
        fade_frames = max(16, int(sample_rate * 0.035))
        repaired = data
        while repaired.shape[0] < target_frames:
            repaired = _cross_append(repaired, tail, fade_frames)
        data = repaired

    if data.shape[0] > target_frames:
        repair = "trim-to-target" if repair == "none" else repair + "+trim"
        data = data[:target_frames]

    fade_out = min(data.shape[0], max(32, int(sample_rate * 0.08)))
    if fade_out > 1:
        ramp = base.np.linspace(1.0, 0.0, fade_out, dtype=base.np.float32)[:, None]
        data[-fade_out:] *= ramp

    peak = float(base.np.max(base.np.abs(data))) if data.size else 0.0
    if peak > 0.99:
        data *= 0.99 / peak

    base.sf.write(str(path), data, sample_rate, subtype="PCM_16")
    actual = float(data.shape[0]) / float(sample_rate)
    return path, actual, repair


class FidelityFastEngine(base.PersistentEngine):
    def _sample_settings(self, body: dict):
        settings = base.SampleSettings(use_guidance=base.USE_GUIDANCE, repetition_penalty=1.1)
        settings.top_p = 0.93
        settings.temperature = 1.0
        return settings

    def generate_candidate(self, task_id: str, body: dict, candidate_index: int, slot: dict) -> base.Path:
        duration = int(_clamp(body.get("duration_sec"), 180, 30, base.MAX_DURATION))
        bpm = int(_clamp(body.get("bpm"), 124, 40, 220))
        next_body = dict(body)
        next_body["prompt"] = _creator_prompt(body)
        next_body["max_new_tokens"] = max(
            int(_clamp(body.get("max_new_tokens"), 3000, 1200, 6000)),
            3200,
        )

        base.set_job(
            task_id,
            status=0,
            progress=max(6, int((base.get_job(task_id) or {}).get("progress", 6))),
            stage=f"YuE V10.4 · candidato {candidate_index + 1} · prompt originale + durata {duration}s",
            requested_duration_sec=duration,
            candidate=candidate_index + 1,
            candidate_count=int(_clamp(body.get("candidate_count"), 2, 1, 2)),
            fidelity_profile=VERSION,
        )

        final = super().generate_candidate(task_id, next_body, candidate_index, slot)
        final, actual_duration, repair = _enforce_duration(final, duration, bpm)
        base.set_job(
            task_id,
            status=0,
            progress=96,
            stage=f"YuE V10.4 · candidato {candidate_index + 1} pronto · {actual_duration:.2f}s",
            output_duration_sec=round(actual_duration, 3),
            duration_repair=repair,
            native_top_p=0.93,
            native_temperature=1.0,
            native_guidance=bool(base.USE_GUIDANCE),
        )
        return final

    def generate_job(self, task_id: str, body: dict):
        requested = int(_clamp(body.get("candidate_count"), 2, 1, 2))
        count = requested
        results: list[dict] = []
        started = time.time()

        # Keep a single resident EXL2 slot for stability. Candidate B starts as soon as A is done,
        # without reloading the models. This avoids the Stage2 corruption seen with two concurrent slots.
        for index in range(count):
            slot = self.slots[index % len(self.slots)]
            base.set_job(
                task_id,
                status=0,
                progress=5 if index == 0 else 52,
                stage=f"YuE V10.4 · generazione brano {'A' if index == 0 else 'B'}",
                ready_count=len(results),
                result=list(results),
                candidate_count=count,
                fidelity_profile=VERSION,
            )
            final = self.generate_candidate(task_id, body, index, slot)
            path = base.public_result_path(final)
            results.append({"path": path, "file": path})
            base.set_job(
                task_id,
                status=0 if len(results) < count else 1,
                progress=50 if len(results) == 1 and count == 2 else 100,
                stage=("Brano A pronto · generazione B in corso" if len(results) == 1 and count == 2 else "2 brani YuE V10.4 pronti"),
                result=list(results),
                ready_count=len(results),
                candidate_count=count,
                elapsed_sec=int(time.time() - started),
                fidelity_profile=VERSION,
            )

        base.set_job(
            task_id,
            status=1,
            progress=100,
            stage="Completato · 2 brani YuE",
            result=list(results),
            ready_count=len(results),
            candidate_count=count,
            elapsed_sec=int(time.time() - started),
            parallel=False,
            fidelity_profile=VERSION,
        )


base.PersistentEngine = FidelityFastEngine
base.Handler.server_version = "SONARA-YuE/10.4-DUAL-FIDELITY-FAST"

_original_snapshot = base.engine_snapshot


def _snapshot():
    data = _original_snapshot()
    data["fidelity_profile"] = VERSION
    data["dual_candidates"] = True
    data["progressive_delivery"] = True
    data["exact_duration_output"] = True
    data["prompt_mode"] = "creator-first"
    data["native_top_p"] = 0.93
    data["native_temperature"] = 1.0
    return data


base.engine_snapshot = _snapshot


if __name__ == "__main__":
    print("=" * 80, flush=True)
    print("SONARA YUE V10.4 - DUAL FIDELITY FAST", flush=True)
    print("2 CANDIDATES + CREATOR-FIRST PROMPT + EXACT OUTPUT DURATION", flush=True)
    print("=" * 80, flush=True)
    base.main()
