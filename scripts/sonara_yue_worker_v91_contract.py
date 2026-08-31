#!/usr/bin/env python3
from __future__ import annotations

import math
import random

import torch
import torch.nn.functional as F
from exllamav2.generator import ExLlamaV2Sampler

import sonara_yue_worker_v9_exl2 as base

CONTRACT_VERSION = "9.1-strict-duration-style-contract"
STAGE1_CODEBOOK_BEGIN = 45334
STAGE1_CODEBOOK_END = 46358
TOKENS_PER_AUDIO_SECOND = 100
SAMPLE_RATE = 44100


def _clamp(value, fallback, minimum, maximum):
    return base.clamp(value, fallback, minimum, maximum)


def _strict_stage1_generate(
    self,
    use_dual_tracks_prompt: bool,
    vocal_track_prompt_path: str,
    instrumental_track_prompt_path: str,
    use_audio_prompt: bool,
    audio_prompt_path: str,
    genres: str,
    lyrics: str,
    run_n_segments: int,
    max_new_tokens: int,
    prompt_start_time: int,
    prompt_end_time: int,
    sample_settings,
):
    if sample_settings.guidance_scale_seg0 is None:
        bsz = 1
        cfg = False
        position_offsets = None
        input_mask = None
    else:
        bsz = 2
        cfg = True
        position_offsets = None
        input_mask = None

    lyrics, prompt_texts = self.get_prompt_texts(genres, lyrics)
    run_n_segments = min(run_n_segments, len(lyrics))

    cache = self.cache_mode(self.model, batch_size=bsz, max_seq_len=self.cache_size)
    seq = torch.empty((bsz, 0), dtype=torch.long)

    common_settings = dict(
        top_k=0,
        top_p=sample_settings.top_p,
        token_repetition_penalty=sample_settings.repetition_penalty,
        temperature=sample_settings.temperature,
    )
    settings_open = ExLlamaV2Sampler.Settings(**common_settings)
    settings_open.allow_tokens(
        self.tokenizer,
        [self.mmtokenizer.eoa] + list(range(STAGE1_CODEBOOK_BEGIN, STAGE1_CODEBOOK_END)),
    )
    settings_locked = ExLlamaV2Sampler.Settings(**common_settings)
    settings_locked.allow_tokens(
        self.tokenizer,
        list(range(STAGE1_CODEBOOK_BEGIN, STAGE1_CODEBOOK_END)),
    )

    seed = int(getattr(self, "sonara_seed", 1))
    min_codec_tokens = int(getattr(self, "sonara_min_codec_tokens", max_new_tokens - 1))
    min_codec_tokens = max(100, min(min_codec_tokens, max_new_tokens - 1))
    rng = random.Random(seed)

    for segment_index in range(run_n_segments):
        if segment_index == 0:
            prompt_ids = self.get_first_segment_prompt(
                prompt_texts[1],
                prompt_texts[0],
                use_dual_tracks_prompt,
                vocal_track_prompt_path,
                instrumental_track_prompt_path,
                use_audio_prompt,
                audio_prompt_path,
                prompt_start_time,
                prompt_end_time,
            )
        else:
            prompt_ids = self.get_segment_prompt(prompt_texts[segment_index + 1])

        prompt_ids = torch.tensor([prompt_ids] * bsz, dtype=torch.long)
        seq = torch.cat((seq, prompt_ids), dim=-1)

        max_context = self.cache_size - max_new_tokens - 1
        if seq.shape[-1] > max_context:
            print(
                f"[V9.1] Section {segment_index}: context {seq.shape[-1]} > {max_context}; smart truncation.",
                flush=True,
            )
            cache.current_seq_len = 0
            full_ids = self.shorten_input(seq, max_context)
            incremental_ids = full_ids
        else:
            full_ids = seq
            incremental_ids = prompt_ids

        if cfg:
            mask_len = full_ids.shape[-1] - 1
            full_mask = torch.zeros((2, cache.max_seq_len), dtype=torch.half, device=self.device)
            full_mask[1, :mask_len] = -65504.0
            position_offsets = torch.tensor([[0], [-mask_len]], dtype=torch.int)
            input_mask = full_mask[:, : full_ids.shape[-1]]

        logits = self.model.forward(
            incremental_ids[:, :],
            cache=cache,
            input_mask=input_mask,
            position_offsets=position_offsets,
            last_id_only=True,
        )

        generated_codec_tokens = 0
        for _ in range(max_new_tokens):
            if cfg:
                cfg_scale = sample_settings.guidance_scale_seg0 if segment_index == 0 else sample_settings.guidance_scale
                logits = logits.float()
                logits = F.log_softmax(logits, dim=-1)
                logits = cfg_scale * logits[0] + (1 - cfg_scale) * logits[1]
                logits = logits.unsqueeze(0)

            logits = logits.float().cpu()
            sampler_settings = settings_locked if generated_codec_tokens < min_codec_tokens else settings_open
            sample, _, _, _, _ = ExLlamaV2Sampler.sample(
                logits,
                sampler_settings,
                full_ids[:1],
                rng.random(),
                self.tokenizer,
            )

            if cfg:
                sample = torch.cat((sample, sample), dim=0)

            full_ids = torch.cat((full_ids, sample), dim=-1)
            seq = torch.cat((seq, sample), dim=-1)

            if cfg:
                input_mask = full_mask[:, : full_ids.shape[-1]]
            logits = self.model.forward(
                sample,
                cache=cache,
                input_mask=input_mask,
                position_offsets=position_offsets,
            )

            if sample[0].item() == self.mmtokenizer.eoa:
                break
            generated_codec_tokens += 1
        else:
            sample = torch.tensor([[self.mmtokenizer.eoa]] * bsz, dtype=torch.long)
            seq = torch.cat((seq, sample), dim=-1)
            self.model.forward(sample, cache=cache)

        print(
            f"[V9.1] segment={segment_index + 1}/{run_n_segments} codec_tokens={generated_codec_tokens} "
            f"min={min_codec_tokens} seed={seed}",
            flush=True,
        )

    return seq[:1, :]


base.Stage1Pipeline_EXL2.generate = _strict_stage1_generate


class ContractEngine(base.PersistentEngine):
    def _sample_settings(self, body: dict):
        repetition = float(_clamp(body.get("repetition_penalty"), 1.1, 1.0, 1.35))
        settings = base.SampleSettings(use_guidance=base.USE_GUIDANCE, repetition_penalty=repetition)

        weirdness = float(_clamp(body.get("weirdness"), 50, 0, 100)) / 100.0
        style = float(_clamp(body.get("style_influence"), 50, 0, 100)) / 100.0

        settings.temperature = float(_clamp(1.00 + 0.30 * (weirdness - 0.5) - 0.24 * (style - 0.5), 1.0, 0.72, 1.28))
        settings.top_p = float(_clamp(0.98 - 0.12 * style + 0.04 * weirdness, 0.93, 0.82, 1.0))
        return settings

    def _contract_prompt(self, body: dict, duration: int) -> str:
        genre = base.safe_text(body.get("genre"), "Music")
        subgenre = base.safe_text(body.get("subgenre"))
        mood = base.safe_text(body.get("mood"))
        prompt = base.safe_text(body.get("prompt"))
        key = base.safe_text(body.get("key"))
        language = base.safe_text(body.get("language"), "auto")
        vocal_mode = base.safe_text(body.get("vocal_mode"), "vocal")
        bpm = int(_clamp(body.get("bpm"), 124, 40, 220))
        style = int(_clamp(body.get("style_influence"), 50, 0, 100))

        parts = [
            f"Primary genre: {genre}",
            f"Subgenre: {subgenre}" if subgenre else "",
            f"Mood and atmosphere: {mood}" if mood else "",
            f"Exact tempo target: {bpm} BPM",
            f"Key center: {key}" if key else "",
            f"Vocal mode: {vocal_mode}",
            f"Lyrics language: {language}",
            f"Target full-song duration: {duration} seconds",
            f"Style adherence: {style}/100",
            f"Production brief: {prompt}" if prompt else "",
            "Keep the same genre identity, tempo feel, harmonic center, groove and production character for the entire song.",
        ]
        return "; ".join(part for part in parts if part)

    def _direct_vocoder(self, candidate_dir: base.Path, target_duration_sec: int | None = None) -> base.Path:
        stage2_dir = candidate_dir / "stage2"
        v_path = stage2_dir / "vtrack.npy"
        i_path = stage2_dir / "itrack.npy"
        if not v_path.exists() or not i_path.exists():
            raise RuntimeError("Stage2 completato senza entrambi gli stem NPY.")

        with self.vocoder_lock:
            instrumental = self._decode_track(i_path, self.inst_decoder)
            vocal = self._decode_track(v_path, self.vocal_decoder)

        length = min(instrumental.shape[-1], vocal.shape[-1])
        if length <= 0:
            raise RuntimeError("Vocoder ha prodotto audio vuoto.")

        mix = instrumental[..., :length] + vocal[..., :length]

        if target_duration_sec is not None:
            target_samples = int(target_duration_sec * SAMPLE_RATE)
            if mix.shape[-1] < target_samples:
                shortfall = target_samples - mix.shape[-1]
                shortfall_sec = shortfall / SAMPLE_RATE
                if shortfall_sec > 1.0:
                    raise RuntimeError(
                        f"V9.1 strict duration underrun: audio={mix.shape[-1] / SAMPLE_RATE:.2f}s "
                        f"target={target_duration_sec}s shortfall={shortfall_sec:.2f}s"
                    )
                mix = F.pad(mix, (0, shortfall))
            else:
                mix = mix[..., :target_samples]

            fade_samples = min(int(SAMPLE_RATE * 0.05), mix.shape[-1])
            if fade_samples > 1:
                fade = torch.linspace(1.0, 0.0, fade_samples, dtype=mix.dtype)
                mix[..., -fade_samples:] *= fade

        peak = float(mix.abs().max().item()) if mix.numel() else 0.0
        if peak > 0.98:
            mix = mix * (0.98 / peak)
        mix = mix.clamp(-0.99, 0.99)

        arr = mix.numpy()
        if arr.ndim == 2:
            arr = arr.T

        final_path = candidate_dir / "sonara_final.wav"
        base.sf.write(str(final_path), arr, SAMPLE_RATE, subtype="PCM_16")
        return final_path

    def generate_candidate(self, task_id: str, body: dict, candidate_index: int, slot: dict) -> base.Path:
        duration = int(_clamp(body.get("duration_sec"), 180, 30, base.MAX_DURATION))
        segments = base.sections_for_duration(duration)
        segment_target_sec = max(1, math.ceil(duration / segments))
        min_codec_tokens = max(100, segment_target_sec * TOKENS_PER_AUDIO_SECOND)
        max_new_tokens = min(6000, min_codec_tokens + 48)

        candidate_dir = base.OUTPUT_ROOT / task_id / f"candidate_{candidate_index + 1}"
        candidate_dir.mkdir(parents=True, exist_ok=True)

        seed_base = int(_clamp(body.get("seed"), 1, 1, 2_147_483_647))
        candidate_seed = (seed_base + candidate_index * 1_000_003) % 2_147_483_647
        if candidate_seed <= 0:
            candidate_seed = candidate_index + 1

        stage1 = slot["stage1"]
        stage1.sonara_seed = candidate_seed
        stage1.sonara_min_codec_tokens = min_codec_tokens

        genres = self._contract_prompt(body, duration)
        lyrics = base.normalize_lyrics(base.safe_text(body.get("lyrics")), segments)
        settings = self._sample_settings(body)

        bpm = int(_clamp(body.get("bpm"), 124, 40, 220))
        style = int(_clamp(body.get("style_influence"), 50, 0, 100))
        weirdness = int(_clamp(body.get("weirdness"), 50, 0, 100))

        print(
            f"[V9.1 CONTRACT] task={task_id} candidate={candidate_index + 1} duration={duration}s "
            f"segments={segments} segment_target={segment_target_sec}s min_tokens={min_codec_tokens} "
            f"bpm={bpm} style={style} weirdness={weirdness} seed={candidate_seed} "
            f"temp={settings.temperature:.3f} top_p={settings.top_p:.3f} rep={settings.repetition_penalty:.3f}",
            flush=True,
        )
        print(f"[V9.1 CONTRACT] prompt={genres}", flush=True)

        base.set_job(
            task_id,
            status=0,
            progress=max(8, int(base.get_job(task_id).get("progress", 8) if base.get_job(task_id) else 8)),
            stage=f"V9.1 strict Stage 1 - candidato {candidate_index + 1} - target {duration}s",
            candidate=candidate_index + 1,
            candidate_count=int(_clamp(body.get("candidate_count"), 1, 1, 2)),
            engine="exllamav2-v9.1-contract",
            requested_duration_sec=duration,
            bpm=bpm,
            style_influence=style,
            weirdness=weirdness,
            seed=candidate_seed,
        )

        raw_output = stage1.generate(
            use_dual_tracks_prompt=False,
            vocal_track_prompt_path="",
            instrumental_track_prompt_path="",
            use_audio_prompt=False,
            audio_prompt_path="",
            genres=genres,
            lyrics=lyrics,
            run_n_segments=segments,
            max_new_tokens=max_new_tokens,
            prompt_start_time=0,
            prompt_end_time=segment_target_sec,
            sample_settings=settings,
        )
        stage1.save(raw_output, str(candidate_dir), False, False)

        base.set_job(
            task_id,
            status=0,
            progress=58,
            stage=f"V9.1 strict Stage 2 - candidato {candidate_index + 1}",
            candidate=candidate_index + 1,
        )
        outputs = slot["stage2"].generate(str(candidate_dir))
        slot["stage2"].save(str(candidate_dir), outputs)

        base.set_job(
            task_id,
            status=0,
            progress=92,
            stage=f"V9.1 exact-duration vocoder - candidato {candidate_index + 1}",
            candidate=candidate_index + 1,
        )
        final = self._direct_vocoder(candidate_dir, target_duration_sec=duration)

        info = base.sf.info(str(final))
        actual_duration = float(info.frames) / float(info.samplerate)
        if abs(actual_duration - duration) > (1.0 / SAMPLE_RATE):
            raise RuntimeError(
                f"V9.1 duration verification failed: actual={actual_duration:.6f}s target={duration}s"
            )

        base.set_job(
            task_id,
            status=0,
            progress=95,
            stage=f"V9.1 durata verificata: {actual_duration:.2f}s",
            output_duration_sec=round(actual_duration, 6),
        )
        print(
            f"[V9.1 CONTRACT] duration verified candidate={candidate_index + 1}: {actual_duration:.6f}s",
            flush=True,
        )
        return final


base.PersistentEngine = ContractEngine
base.Handler.server_version = "SONARA-YuE/9.1-STRICT-CONTRACT"

_base_engine_snapshot = base.engine_snapshot


def _engine_snapshot_v91():
    data = _base_engine_snapshot()
    data["contract_version"] = CONTRACT_VERSION
    data["strict_duration"] = True
    data["stage1_codebook_range"] = [STAGE1_CODEBOOK_BEGIN, STAGE1_CODEBOOK_END - 1]
    data["tokens_per_audio_second"] = TOKENS_PER_AUDIO_SECOND
    return data


base.engine_snapshot = _engine_snapshot_v91


if __name__ == "__main__":
    print("=" * 80, flush=True)
    print("SONARA YUE V9.1 - STRICT MUSIC CONTRACT", flush=True)
    print("EXACT DURATION + SEED + STYLE INFLUENCE + STRICT STAGE1 CODEBOOK", flush=True)
    print("=" * 80, flush=True)
    base.main()
