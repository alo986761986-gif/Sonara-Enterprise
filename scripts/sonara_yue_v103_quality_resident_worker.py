#!/usr/bin/env python3
from __future__ import annotations

import contextlib
import importlib.util
import json
import math
import os
import sys
import threading
import time
import traceback
from pathlib import Path

BASE_PATH = Path('/marimo/sonara_yue_v10_quality_worker.py')
if not BASE_PATH.exists():
    raise RuntimeError(f'Worker V10 base non trovato: {BASE_PATH}')

spec = importlib.util.spec_from_file_location('sonara_yue_v10_quality_base', BASE_PATH)
if spec is None or spec.loader is None:
    raise RuntimeError('Impossibile caricare worker V10 base')
base = importlib.util.module_from_spec(spec)
spec.loader.exec_module(base)

import numpy as np
import torch
from omegaconf import OmegaConf
from transformers import AutoModelForCausalLM

XCODEC = base.INFERENCE / 'xcodec_mini_infer'
sys.path.insert(0, str(base.INFERENCE))
sys.path.insert(0, str(XCODEC))
sys.path.insert(0, str(XCODEC / 'descriptaudiocodec'))

from models import soundstream_hubert_new as soundstream_module
import vocoder as vocoder_module

RESUME_PATH = XCODEC / 'final_ckpt' / 'ckpt_00360000.pth'
BASIC_CONFIG = XCODEC / 'final_ckpt' / 'config.yaml'
VOCODER_CONFIG = XCODEC / 'decoders' / 'config.yaml'
VOCAL_DECODER = XCODEC / 'decoders' / 'decoder_131000.pth'
INST_DECODER = XCODEC / 'decoders' / 'decoder_151000.pth'

ENGINE_LOCK = threading.Lock()
ENGINE_READY = threading.Event()
ENGINE_ERROR = ''
ENGINE = None

OPTIMIZED_STAGE2 = r'''
def stage2_inference(model, stage1_output_set, stage2_output_dir, batch_size=32):
    """SONARA V10.3: process vocal + instrumental 6s chunks in shared batches."""
    stage2_result = []
    tracks = []
    full_chunks = []
    endings = []

    for track_idx, input_path in enumerate(stage1_output_set):
        output_filename = os.path.join(stage2_output_dir, os.path.basename(input_path))
        if os.path.exists(output_filename):
            stage2_result.append(output_filename)
            tracks.append((track_idx, output_filename, None))
            continue

        prompt = np.load(input_path).astype(np.int32)
        total_frames = int(prompt.shape[-1])
        full_frames = (total_frames // 300) * 300
        for start in range(0, full_frames, 300):
            full_chunks.append((track_idx, prompt[:, start:start + 300]))
        ending = prompt[:, full_frames:] if full_frames < total_frames else None
        endings.append((track_idx, ending))
        tracks.append((track_idx, output_filename, prompt))

    generated = {idx: [] for idx, _, prompt in tracks if prompt is not None}
    batch_size = max(1, int(batch_size))

    for group_start in tqdm(range(0, len(full_chunks), batch_size), desc='Stage2 shared-batch...'):
        group = full_chunks[group_start:group_start + batch_size]
        if not group:
            continue
        combined = np.concatenate([chunk for _, chunk in group], axis=1)
        flat = stage2_generate(model, combined, batch_size=len(group))
        per_chunk = 300 * 8
        expected = per_chunk * len(group)
        if flat.shape[0] != expected:
            raise RuntimeError(f'Stage2 shared batch size mismatch: got={flat.shape[0]} expected={expected}')
        for pos, (track_idx, _) in enumerate(group):
            generated[track_idx].append(flat[pos * per_chunk:(pos + 1) * per_chunk])

    for track_idx, ending in endings:
        if ending is None or ending.shape[-1] == 0:
            continue
        generated[track_idx].append(stage2_generate(model, ending, batch_size=1))

    for track_idx, output_filename, prompt in tracks:
        if prompt is None:
            continue
        pieces = generated.get(track_idx) or []
        if not pieces:
            raise RuntimeError(f'Stage2 produced no chunks for track {track_idx}')
        output = np.concatenate(pieces, axis=0)
        output = codectool_stage2.ids2npy(output)

        # Vectorized equivalent of the upstream invalid-code repair.
        fixed_output = np.array(output, copy=True)
        for row_idx, row in enumerate(output):
            mask = (row < 0) | (row > 1023)
            if not np.any(mask):
                continue
            valid = row[(row >= 0) & (row <= 1023)]
            replacement = 0
            if valid.size:
                counts = np.bincount(valid.astype(np.int64), minlength=1024)
                replacement = int(np.argmax(counts))
            fixed_output[row_idx, mask] = replacement

        np.save(output_filename, fixed_output)
        stage2_result.append(output_filename)

    return stage2_result
'''


class ResidentInferEngine:
    def __init__(self):
        if not torch.cuda.is_available():
            raise RuntimeError('CUDA non disponibile per V10.3 QUALITY resident.')
        self.device = torch.device('cuda:0')
        self.gpu_name = torch.cuda.get_device_name(0)
        self.loaded_at = base.now_ms()
        self.model_cache: dict[str, object] = {}
        self._original_from_pretrained = AutoModelForCausalLM.from_pretrained
        self._original_soundstream = soundstream_module.SoundStream
        self._original_build_codec_model = vocoder_module.build_codec_model
        self._original_torch_load = torch.load
        self.codec_model = None
        self.vocal_decoder = None
        self.inst_decoder = None
        self.source = self._prepare_source()

        torch.set_grad_enabled(False)
        if torch.cuda.is_available():
            torch.backends.cudnn.benchmark = True
            torch.backends.cudnn.deterministic = False
            torch.set_float32_matmul_precision('high')

        self._load_resident_assets()
        self._install_cache_hooks()

    def _model_key(self, value) -> str:
        text = str(value)
        path = Path(text)
        try:
            if path.exists():
                return str(path.resolve())
        except Exception:
            pass
        return text

    def _load_hf_model(self, path: Path):
        key = self._model_key(path)
        if key in self.model_cache:
            return self.model_cache[key]
        print(f'[V10.3] Carico residente: {path}', flush=True)
        model = self._original_from_pretrained(
            str(path),
            dtype=torch.bfloat16,
            attn_implementation='flash_attention_2',
            local_files_only=True,
        )
        model.to(self.device)
        model.eval()
        self.model_cache[key] = model
        return model

    def _load_resident_assets(self):
        # CoT Stage1 + Stage2 stay on GPU for the lifetime of the worker.
        self._load_hf_model(base.STAGE1)
        self._load_hf_model(base.STAGE2)

        print('[V10.3] Carico codec persistente...', flush=True)
        cfg = OmegaConf.load(str(BASIC_CONFIG))
        codec = self._original_soundstream(**cfg.generator.config).to(self.device)
        state = self._original_torch_load(str(RESUME_PATH), map_location=self.device, weights_only=False)
        codec.load_state_dict(state['codec_model'])
        codec.eval()
        self.codec_model = codec
        del state

        print('[V10.3] Carico vocoder persistente...', flush=True)
        try:
            vocal, inst = self._original_build_codec_model(
                str(VOCODER_CONFIG), str(VOCAL_DECODER), str(INST_DECODER), self.device
            )
        except TypeError:
            vocal, inst = self._original_build_codec_model(
                str(VOCODER_CONFIG), str(VOCAL_DECODER), str(INST_DECODER)
            )
        if hasattr(vocal, 'to'):
            vocal = vocal.to(self.device)
        if hasattr(inst, 'to'):
            inst = inst.to(self.device)
        if hasattr(vocal, 'eval'):
            vocal.eval()
        if hasattr(inst, 'eval'):
            inst.eval()
        self.vocal_decoder = vocal
        self.inst_decoder = inst

        free, total = torch.cuda.mem_get_info(0)
        print(
            f'[V10.3] RESIDENT READY · {self.gpu_name} · '
            f'VRAM used={(total-free)/(1024**3):.2f}GB free={free/(1024**3):.2f}GB',
            flush=True,
        )

    def _install_cache_hooks(self):
        engine = self

        def cached_from_pretrained(name, *args, **kwargs):
            key = engine._model_key(name)
            if key in engine.model_cache:
                return engine.model_cache[key]
            # ICL is loaded lazily on its first use, then remains resident.
            model = engine._original_from_pretrained(name, *args, **kwargs)
            engine.model_cache[key] = model
            return model

        AutoModelForCausalLM.from_pretrained = staticmethod(cached_from_pretrained)

        # infer.py constructs SoundStream every run. Return the already initialized GPU model.
        soundstream_module.SoundStream = lambda *args, **kwargs: engine.codec_model

        # infer.py loads codec weights after construction. Resident codec is already initialized;
        # avoid reading the checkpoint again and make load_state_dict a harmless no-op.
        engine.codec_model.load_state_dict = lambda *args, **kwargs: None

        def cached_torch_load(f, *args, **kwargs):
            try:
                if Path(str(f)).resolve() == RESUME_PATH.resolve():
                    return {'codec_model': {}}
            except Exception:
                pass
            return engine._original_torch_load(f, *args, **kwargs)

        torch.load = cached_torch_load

        # Reuse the two high-rate decoders instead of rebuilding them after every song.
        vocoder_module.build_codec_model = lambda *args, **kwargs: (
            engine.vocal_decoder,
            engine.inst_decoder,
        )

    def _prepare_source(self) -> str:
        infer_path = base.INFERENCE / 'infer.py'
        source = infer_path.read_text(encoding='utf-8')
        start = source.find('def stage2_inference(')
        call = source.find('stage2_result = stage2_inference', start)
        if start < 0 or call < 0:
            raise RuntimeError('Impossibile individuare stage2_inference nell infer.py ufficiale.')
        source = source[:start] + OPTIMIZED_STAGE2 + '\n' + source[call:]
        return source

    @torch.inference_mode()
    def execute(self, argv: list[str], log_path: Path):
        infer_path = base.INFERENCE / 'infer.py'
        old_argv = list(sys.argv)
        old_cwd = os.getcwd()
        ns = {
            '__name__': '__main__',
            '__file__': str(infer_path),
            '__package__': None,
        }
        log_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            sys.argv = [str(infer_path), *argv]
            os.chdir(str(base.INFERENCE))
            with log_path.open('w', encoding='utf-8', buffering=1) as log:
                with contextlib.redirect_stdout(log), contextlib.redirect_stderr(log):
                    exec(compile(self.source, str(infer_path), 'exec'), ns, ns)
        finally:
            sys.argv = old_argv
            os.chdir(old_cwd)
            # Release per-job tensors; resident model references are held by the cache.
            ns.clear()
            if torch.cuda.is_available():
                torch.cuda.empty_cache()


def warm_engine():
    global ENGINE, ENGINE_ERROR
    try:
        base.set_job('__resident__', status=0, progress=1, stage='V10.3 warmup · BF16 resident')
        engine = ResidentInferEngine()
        with ENGINE_LOCK:
            ENGINE = engine
        base.set_job('__resident__', status=1, progress=100, stage='V10.3 BF16 resident pronto')
        print(f'[V10.3] QUALITY RESIDENT ENGINE READY · {engine.gpu_name}', flush=True)
    except Exception as exc:
        ENGINE_ERROR = f'{type(exc).__name__}: {exc}'
        base.set_job('__resident__', status=2, progress=0, stage='V10.3 warmup fallito', error=ENGINE_ERROR)
        traceback.print_exc()
    finally:
        ENGINE_READY.set()


def resident_snapshot():
    with ENGINE_LOCK:
        engine = ENGINE
    try:
        free, total = torch.cuda.mem_get_info(0)
        memory = {
            'free_gb': round(free / (1024 ** 3), 2),
            'total_gb': round(total / (1024 ** 3), 2),
        }
    except Exception:
        memory = None
    return {
        'ready': engine is not None and not ENGINE_ERROR,
        'warming': not ENGINE_READY.is_set(),
        'error': ENGINE_ERROR or None,
        'gpu': engine.gpu_name if engine else None,
        'models_resident': len(engine.model_cache) if engine else 0,
        'memory': memory,
        'stage2_shared_batch': True,
        'stage2_batch_default': 32,
    }


def run_quality_job(task_id: str, body: dict):
    try:
        ENGINE_READY.wait()
        if ENGINE_ERROR:
            raise RuntimeError(f'V10.3 resident engine non disponibile: {ENGINE_ERROR}')
        with ENGINE_LOCK:
            engine = ENGINE
        if engine is None:
            raise RuntimeError('V10.3 resident engine non inizializzato.')

        with base.GEN_LOCK:
            started = time.time()
            requested_duration = int(base.clamp(body.get('duration_sec'), 180, 30, base.MAX_DURATION))
            lyrics_raw = base.safe_text(body.get('lyrics'))
            segments = base.segment_count(requested_duration, lyrics_raw)
            lyrics = base.normalize_lyrics(lyrics_raw, segments)
            tags = base.tag_prompt(body)
            seed = int(base.clamp(body.get('seed'), 42, 1, 2_147_483_647))
            repetition = float(base.clamp(body.get('repetition_penalty'), 1.1, 1.0, 1.3))
            stage2_batch = max(16, int(base.clamp(body.get('stage2_batch_size'), 32, 1, 64)))
            max_tokens = int(base.clamp(body.get('max_new_tokens'), 3000, 1200, 5000))
            use_reference = bool(body.get('reference_audio_path'))
            stage1_model = base.STAGE1_ICL if use_reference else base.STAGE1

            job_dir = base.OUTPUT_ROOT / task_id
            job_dir.mkdir(parents=True, exist_ok=True)
            genre_txt = job_dir / 'genre.txt'
            lyrics_txt = job_dir / 'lyrics.txt'
            genre_txt.write_text(tags + '\n', encoding='utf-8')
            lyrics_txt.write_text(lyrics + '\n', encoding='utf-8')

            base.set_job(
                task_id,
                status=0,
                progress=8,
                stage='V10.3 RESIDENT · prompt tagging',
                profile='quality-bf16-resident',
                tags=tags,
                segments=segments,
                stage2_batch_size=stage2_batch,
                requested_duration_sec=requested_duration,
                requested_bpm=int(base.clamp(body.get('bpm'), 124, 40, 220)),
            )

            argv = [
                '--cuda_idx', '0',
                '--stage1_model', str(stage1_model),
                '--stage2_model', str(base.STAGE2),
                '--genre_txt', str(genre_txt),
                '--lyrics_txt', str(lyrics_txt),
                '--run_n_segments', str(segments),
                '--stage2_batch_size', str(stage2_batch),
                '--output_dir', str(job_dir / 'native'),
                '--max_new_tokens', str(max_tokens),
                '--repetition_penalty', str(repetition),
                '--seed', str(seed),
                '--rescale',
                '--disable_offload_model',
            ]

            ref = base.safe_text(body.get('reference_audio_path'))
            if ref:
                ref_path = Path(ref).resolve()
                if ref_path.is_file():
                    argv.extend([
                        '--use_audio_prompt',
                        '--audio_prompt_path', str(ref_path),
                        '--prompt_start_time', '0',
                        '--prompt_end_time', '30',
                    ])

            log_path = job_dir / 'quality_resident.log'
            base.set_job(task_id, status=0, progress=12, stage='V10.3 RESIDENT · Stage 1 BF16')
            engine.execute(argv, log_path)

            source = base.find_mix(job_dir / 'native')
            if source is None:
                tail = '\n'.join(log_path.read_text(encoding='utf-8', errors='ignore').splitlines()[-100:])
                raise RuntimeError('V10.3 completato senza mix audio.\n' + tail)

            final = base.copy_final(source, job_dir)
            actual_duration = base.duration_sec(final)
            path = base.public_path(final)
            elapsed = round(time.time() - started, 2)

            # Audio becomes available immediately. BPM analysis runs after completion so
            # the user never waits on CPU analysis before pressing play.
            base.set_job(
                task_id,
                status=1,
                progress=100,
                stage='Completato',
                result=[{'path': path, 'file': path}],
                profile='quality-bf16-resident',
                tags=tags,
                requested_duration_sec=requested_duration,
                output_duration_sec=round(actual_duration, 3),
                requested_bpm=int(base.clamp(body.get('bpm'), 124, 40, 220)),
                measured_bpm=None,
                quality_score=None,
                quality_gate_pass=None,
                elapsed_sec=elapsed,
                resident=True,
                stage2_shared_batch=True,
                stage2_batch_size=stage2_batch,
            )

            def analyze_later():
                try:
                    bpm = base.estimate_bpm(final)
                    target = int(base.clamp(body.get('bpm'), 124, 40, 220))
                    error = None if bpm is None else abs(bpm - target)
                    score = 100
                    duration_error = abs(actual_duration - requested_duration)
                    if duration_error > 30:
                        score -= 20
                    elif duration_error > 12:
                        score -= 10
                    if error is not None:
                        if error > 18:
                            score -= 25
                        elif error > 10:
                            score -= 15
                        elif error > 5:
                            score -= 7
                    score = max(0, score)
                    base.set_job(
                        task_id,
                        measured_bpm=bpm,
                        bpm_error=error,
                        quality_score=score,
                        quality_gate_pass=score >= 80,
                    )
                except Exception:
                    pass

            threading.Thread(target=analyze_later, daemon=True).start()

    except Exception as exc:
        traceback.print_exc()
        base.set_job(task_id, status=2, progress=0, stage='Errore', error=str(exc), message=str(exc))


# Current Handler resolves this global function at request time.
base.run_quality_job = run_quality_job
base.Handler.server_version = 'SONARA-YuE/10.3-QUALITY-BF16-RESIDENT'

_original_get = base.Handler.do_GET

def resident_get(self):
    from urllib.parse import urlparse
    parsed = urlparse(self.path)
    if parsed.path in ('/', '/health'):
        with base.JOBS_LOCK:
            keys = [k for k in base.JOBS.keys() if not k.startswith('__')]
            latest = {'task_id': keys[-1], **base.JOBS[keys[-1]]} if keys else None
            active = sum(1 for k, item in base.JOBS.items() if not k.startswith('__') and int(item.get('status', 0)) == 0)
        snapshot = resident_snapshot()
        return self.json_response({
            'ok': not bool(ENGINE_ERROR),
            'service': 'SONARA YuE V10.3 QUALITY BF16 RESIDENT',
            'version': '10.3-quality-bf16-resident',
            'profile': 'quality',
            'model_precision': 'bf16',
            'resident_engine': snapshot,
            'active_jobs': active,
            'latest_job': latest,
        }, 200 if not ENGINE_ERROR else 503)
    return _original_get(self)

base.Handler.do_GET = resident_get


def main():
    global ENGINE_ERROR
    print('=' * 80)
    print('SONARA YUE V10.3 QUALITY BF16 RESIDENT')
    print('STAGE1 + STAGE2 + CODEC + VOCODER RESIDENTI IN VRAM')
    print('STAGE2 VOCAL/INSTRUMENTAL SHARED BATCH')
    print(f'PORT={base.PORT}')
    print('=' * 80)

    required = [
        base.INFERENCE / 'infer.py',
        base.TOP_TAGS,
        base.STAGE1 / 'config.json',
        base.STAGE2 / 'config.json',
        BASIC_CONFIG,
        RESUME_PATH,
        VOCODER_CONFIG,
        VOCAL_DECODER,
        INST_DECODER,
    ]
    missing = [str(p) for p in required if not p.exists()]
    if missing:
        raise RuntimeError('V10.3 asset mancanti:\n' + '\n'.join(missing))

    threading.Thread(target=warm_engine, daemon=True).start()
    from http.server import ThreadingHTTPServer
    ThreadingHTTPServer(('0.0.0.0', base.PORT), base.Handler).serve_forever()


if __name__ == '__main__':
    main()
