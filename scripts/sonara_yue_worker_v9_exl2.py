#!/usr/bin/env python3
from __future__ import annotations

import json
import math
import os
import re
import sys
import threading
import time
import traceback
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(os.environ.get("SONARA_YUE_V9_ROOT", "/marimo/YuE-exllamav2")).resolve()
SRC = ROOT / "src" / "yue"
XCODEC = Path(os.environ.get("SONARA_YUE_V9_XCODEC", str(ROOT / "xcodec_mini_infer"))).resolve()
OUTPUT_ROOT = Path(os.environ.get("SONARA_YUE_V9_OUTPUT", str(ROOT / "sonara_api_output_v9"))).resolve()
STAGE1_MODEL = Path(os.environ.get("SONARA_YUE_V9_STAGE1_MODEL", "/marimo/models/yue-exl2/stage1-8bpw")).resolve()
STAGE2_MODEL = Path(os.environ.get("SONARA_YUE_V9_STAGE2_MODEL", "/marimo/models/yue-exl2/stage2-8bpw")).resolve()
PORT = int(os.environ.get("SONARA_YUE_PORT", "8012"))
API_KEY = os.environ.get("SONARA_YUE_API_KEY", "").strip()
MAX_DURATION = max(60, min(480, int(os.environ.get("SONARA_YUE_MAX_DURATION", "480"))))
REQUESTED_SLOTS = max(1, min(2, int(os.environ.get("SONARA_YUE_V9_SLOTS", "2"))))
STAGE1_CACHE_SIZE = max(8192, int(os.environ.get("SONARA_YUE_V9_STAGE1_CACHE", "16384")))
STAGE2_CACHE_SIZE = max(16384, int(os.environ.get("SONARA_YUE_V9_STAGE2_CACHE", "65536")))
STAGE1_CACHE_MODE = os.environ.get("SONARA_YUE_V9_STAGE1_CACHE_MODE", "FP16").upper()
STAGE2_CACHE_MODE = os.environ.get("SONARA_YUE_V9_STAGE2_CACHE_MODE", "FP16").upper()
USE_GUIDANCE = os.environ.get("SONARA_YUE_V9_GUIDANCE", "0").strip() in {"1", "true", "TRUE", "yes", "YES"}

OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

if not SRC.exists():
    raise RuntimeError(f"YuE-exllamav2 source non trovato: {SRC}")
if not XCODEC.exists():
    raise RuntimeError(f"xcodec_mini_infer non trovato: {XCODEC}")
if not STAGE1_MODEL.exists():
    raise RuntimeError(f"Stage 1 EXL2 non trovato: {STAGE1_MODEL}")
if not STAGE2_MODEL.exists():
    raise RuntimeError(f"Stage 2 EXL2 non trovato: {STAGE2_MODEL}")

sys.path.insert(0, str(SRC))
os.chdir(str(ROOT))

import numpy as np
import soundfile as sf
import torch
from omegaconf import OmegaConf

from infer_stage1 import SampleSettings, Stage1Pipeline_EXL2
from infer_stage2 import Stage2Pipeline_EXL2
from models.soundstream_hubert_new import SoundStream
from vocoder import build_codec_model

# Global inference mode and fast CUDA defaults.
torch.autograd.grad_mode._enter_inference_mode(True)
torch.autograd.set_grad_enabled(False)
if torch.cuda.is_available():
    torch.backends.cuda.matmul.allow_tf32 = True
    torch.backends.cudnn.allow_tf32 = True
    torch.backends.cudnn.benchmark = True
    torch.backends.cudnn.deterministic = False
    torch.set_float32_matmul_precision("high")

JOBS: dict[str, dict] = {}
JOBS_LOCK = threading.Lock()
ENGINE_LOCK = threading.Lock()
ENGINE_READY = threading.Event()
ENGINE_ERROR = ""
ENGINE = None


def now_ms() -> int:
    return int(time.time() * 1000)


def clamp(value, fallback, minimum, maximum):
    try:
        n = float(value)
    except Exception:
        n = fallback
    return max(minimum, min(maximum, n))


def safe_text(value, fallback="") -> str:
    text = str(value or "").strip()
    return text or fallback


def sections_for_duration(duration_sec: int) -> int:
    return max(1, min(16, math.ceil(duration_sec / 30)))


def normalize_lyrics(lyrics: str, minimum_sections: int) -> str:
    raw = safe_text(lyrics)
    if not raw:
        raw = "[verse_1]\nInstrumental texture and musical development."

    # YuE's parser accepts only [\w+]. Normalize labels such as [Verse 1].
    def repl(match):
        label = re.sub(r"[^A-Za-z0-9_]+", "_", match.group(1).strip()).strip("_").lower()
        return f"[{label or 'section'}]"

    raw = re.sub(r"\[([^\]\r\n]+)\]", repl, raw)
    if not re.search(r"\[[A-Za-z0-9_]+\]", raw):
        raw = "[verse_1]\n" + raw

    count = len(re.findall(r"\[[A-Za-z0-9_]+\]", raw))
    while count < minimum_sections:
        count += 1
        raw += (
            f"\n\n[instrumental_bridge_{count}]\n"
            "Continue the arrangement naturally while preserving the established melody and groove."
        )
    return raw


def set_job(task_id: str, **values) -> None:
    with JOBS_LOCK:
        item = JOBS.setdefault(task_id, {})
        item.update(values)
        item["updated_at"] = now_ms()


def get_job(task_id: str) -> dict | None:
    with JOBS_LOCK:
        item = JOBS.get(task_id)
        return dict(item) if item else None


def public_result_path(file_path: Path) -> str:
    resolved = file_path.resolve()
    return "/" + str(resolved.relative_to(OUTPUT_ROOT)).replace(os.sep, "/")


def fast_fix_output(self, output):
    fixed = np.array(output, copy=True)
    for row_idx, row in enumerate(output):
        mask = (row < 0) | (row > 1023)
        if not np.any(mask):
            continue
        valid = row[(row >= 0) & (row <= 1023)]
        replacement = 0
        if valid.size:
            counts = np.bincount(valid.astype(np.int64), minlength=1024)
            replacement = int(np.argmax(counts))
        fixed[row_idx, mask] = replacement
    return fixed


Stage2Pipeline_EXL2.fix_output = fast_fix_output


class PersistentEngine:
    def __init__(self):
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA non disponibile per SONARA YuE V9.")

        self.device = torch.device("cuda:0")
        self.slots: list[dict] = []
        self.vocoder_lock = threading.Lock()
        self.codec_model = None
        self.vocal_decoder = None
        self.inst_decoder = None
        self.loaded_at = now_ms()
        self.gpu_name = torch.cuda.get_device_name(0)

        self.basic_model_config = str(XCODEC / "final_ckpt" / "config.yaml")
        self.resume_path = str(XCODEC / "final_ckpt" / "ckpt_00360000.pth")
        self.decoder_config = str(XCODEC / "decoders" / "config.yaml")
        self.vocal_decoder_path = str(XCODEC / "decoders" / "decoder_131000.pth")
        self.inst_decoder_path = str(XCODEC / "decoders" / "decoder_151000.pth")

        for required in [
            self.basic_model_config,
            self.resume_path,
            self.decoder_config,
            self.vocal_decoder_path,
            self.inst_decoder_path,
        ]:
            if not Path(required).exists():
                raise RuntimeError(f"Asset YuE mancante: {required}")

        self._load_audio_models()
        self._load_generation_slots()

    def _load_audio_models(self):
        print("[V9] Carico codec e vocoder persistenti...", flush=True)
        model_config = OmegaConf.load(self.basic_model_config)
        if model_config.generator.name != "SoundStream":
            raise RuntimeError(f"Codec inatteso: {model_config.generator.name}")

        codec = SoundStream(**model_config.generator.config).to(self.device)
        parameter_dict = torch.load(self.resume_path, map_location=self.device, weights_only=False)
        codec.load_state_dict(parameter_dict["codec_model"])
        codec.eval()
        self.codec_model = codec

        vocal_decoder, inst_decoder = build_codec_model(
            self.decoder_config,
            self.vocal_decoder_path,
            self.inst_decoder_path,
            self.device,
        )
        self.vocal_decoder = vocal_decoder.to(self.device).eval()
        self.inst_decoder = inst_decoder.to(self.device).eval()
        print("[V9] Codec e vocoder residenti in GPU.", flush=True)

    def _build_slot(self, index: int) -> dict:
        print(f"[V9] Carico slot GPU {index + 1}: Stage1 EXL2...", flush=True)
        stage1 = Stage1Pipeline_EXL2(
            model_path=str(STAGE1_MODEL),
            device=self.device,
            basic_model_config=self.basic_model_config,
            resume_path=self.resume_path,
            cache_size=STAGE1_CACHE_SIZE,
            cache_mode=STAGE1_CACHE_MODE,
        )
        # Avoid a second codec copy if an audio prompt is ever enabled.
        stage1.codec_model = self.codec_model

        print(f"[V9] Carico slot GPU {index + 1}: Stage2 EXL2...", flush=True)
        stage2 = Stage2Pipeline_EXL2(
            model_path=str(STAGE2_MODEL),
            device=self.device,
            cache_size=STAGE2_CACHE_SIZE,
            cache_mode=STAGE2_CACHE_MODE,
        )
        return {"stage1": stage1, "stage2": stage2, "index": index}

    def _load_generation_slots(self):
        for index in range(REQUESTED_SLOTS):
            try:
                self.slots.append(self._build_slot(index))
                print(f"[V9] Slot {index + 1} pronto.", flush=True)
            except Exception as exc:
                if index == 0:
                    raise
                print(f"[V9] Slot {index + 1} non caricato, continuo con {len(self.slots)} slot: {exc}", flush=True)
                torch.cuda.empty_cache()
                break
        if not self.slots:
            raise RuntimeError("Nessuno slot ExLlamaV2 disponibile.")

    def _sample_settings(self, body: dict) -> SampleSettings:
        settings = SampleSettings(use_guidance=USE_GUIDANCE, repetition_penalty=1.0)
        # Top-p=1 avoids nucleus sorting; temperature retains candidate variation.
        settings.top_p = 1.0
        weirdness = clamp(body.get("weirdness"), 50, 0, 100)
        settings.temperature = 0.85 + (weirdness / 100.0) * 0.30
        return settings

    @torch.inference_mode()
    def _decode_track(self, npy_path: Path, decoder) -> torch.Tensor:
        compressed_np = np.load(npy_path, allow_pickle=True).astype(np.int16)
        compressed = torch.as_tensor(compressed_np, dtype=torch.long, device=self.device).unsqueeze(1)
        embedded = self.codec_model.get_embed(compressed)
        if torch.is_tensor(embedded):
            embedded = embedded.to(self.device)
        else:
            embedded = torch.as_tensor(embedded, device=self.device)
        out = decoder(embedded)
        return out.detach().cpu().float()

    def _direct_vocoder(self, candidate_dir: Path) -> Path:
        stage2_dir = candidate_dir / "stage2"
        v_path = stage2_dir / "vtrack.npy"
        i_path = stage2_dir / "itrack.npy"
        if not v_path.exists() or not i_path.exists():
            raise RuntimeError("Stage2 completato senza entrambi gli stem NPY.")

        # Shared persistent codec/decoders are serialized only for this short final phase.
        with self.vocoder_lock:
            instrumental = self._decode_track(i_path, self.inst_decoder)
            vocal = self._decode_track(v_path, self.vocal_decoder)

        length = min(instrumental.shape[-1], vocal.shape[-1])
        if length <= 0:
            raise RuntimeError("Vocoder ha prodotto audio vuoto.")
        mix = instrumental[..., :length] + vocal[..., :length]
        peak = float(mix.abs().max().item()) if mix.numel() else 0.0
        if peak > 0.98:
            mix = mix * (0.98 / peak)
        mix = mix.clamp(-0.99, 0.99)
        arr = mix.numpy()
        if arr.ndim == 2:
            arr = arr.T
        final_path = candidate_dir / "sonara_final.wav"
        sf.write(str(final_path), arr, 44100, subtype="PCM_16")
        return final_path

    def generate_candidate(self, task_id: str, body: dict, candidate_index: int, slot: dict) -> Path:
        duration = int(clamp(body.get("duration_sec"), 180, 30, MAX_DURATION))
        segments = sections_for_duration(duration)
        candidate_dir = OUTPUT_ROOT / task_id / f"candidate_{candidate_index + 1}"
        candidate_dir.mkdir(parents=True, exist_ok=True)

        genre_parts = [
            safe_text(body.get("genre"), "Music"),
            safe_text(body.get("subgenre")),
            safe_text(body.get("mood")),
            safe_text(body.get("prompt")),
            f"{int(clamp(body.get('bpm'), 124, 40, 220))} BPM",
            safe_text(body.get("key")),
            safe_text(body.get("vocal_mode"), "vocal"),
            safe_text(body.get("language"), "auto"),
        ]
        genres = ", ".join(item for item in genre_parts if item)
        lyrics = normalize_lyrics(safe_text(body.get("lyrics")), segments)
        max_new_tokens = int(clamp(body.get("max_new_tokens"), 3000, 1000, 6000))

        set_job(
            task_id,
            status=0,
            progress=max(8, int(get_job(task_id).get("progress", 8) if get_job(task_id) else 8)),
            stage=f"V9 EXL2 Stage 1 · candidato {candidate_index + 1}",
            candidate=candidate_index + 1,
            candidate_count=int(clamp(body.get("candidate_count"), 1, 1, 2)),
            engine="exllamav2",
        )

        settings = self._sample_settings(body)
        raw_output = slot["stage1"].generate(
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
            prompt_end_time=30,
            sample_settings=settings,
        )
        slot["stage1"].save(raw_output, str(candidate_dir), False, False)

        set_job(
            task_id,
            status=0,
            progress=58,
            stage=f"V9 EXL2 Stage 2 · candidato {candidate_index + 1}",
            candidate=candidate_index + 1,
        )
        outputs = slot["stage2"].generate(str(candidate_dir))
        slot["stage2"].save(str(candidate_dir), outputs)

        set_job(
            task_id,
            status=0,
            progress=92,
            stage=f"V9 vocoder diretto · candidato {candidate_index + 1}",
            candidate=candidate_index + 1,
        )
        final = self._direct_vocoder(candidate_dir)
        return final

    def generate_job(self, task_id: str, body: dict):
        requested = int(clamp(body.get("candidate_count"), 1, 1, 2))
        count = min(requested, max(1, len(self.slots))) if len(self.slots) == 1 else requested
        if requested == 2 and len(self.slots) == 1:
            # One resident slot still produces both candidates, sequentially, without reloading models.
            count = 2

        results: list[dict | None] = [None] * count
        started = time.time()

        if count == 2 and len(self.slots) >= 2:
            set_job(task_id, status=0, progress=6, stage="V9 · 2 candidati EXL2 in parallelo", parallel=True)
            with ThreadPoolExecutor(max_workers=2) as pool:
                futures = {
                    pool.submit(self.generate_candidate, task_id, body, index, self.slots[index]): index
                    for index in range(2)
                }
                for future in as_completed(futures):
                    index = futures[future]
                    final = future.result()
                    path = public_result_path(final)
                    results[index] = {"path": path, "file": path}
                    ready = sum(1 for item in results if item)
                    set_job(task_id, status=0, progress=96 + ready, stage=f"V9 · brano {ready}/2 pronto", ready_count=ready)
        else:
            for index in range(count):
                slot = self.slots[index % len(self.slots)]
                final = self.generate_candidate(task_id, body, index, slot)
                path = public_result_path(final)
                results[index] = {"path": path, "file": path}
                set_job(task_id, status=0, progress=98, stage=f"V9 · brano {index + 1}/{count} pronto")

        set_job(
            task_id,
            status=1,
            progress=100,
            stage="Completato",
            result=[item for item in results if item],
            elapsed_sec=int(time.time() - started),
            parallel=count == 2 and len(self.slots) >= 2,
        )


def warm_engine():
    global ENGINE, ENGINE_ERROR
    try:
        set_job("__engine__", status=0, progress=1, stage="V9 warmup · caricamento modelli EXL2")
        engine = PersistentEngine()
        with ENGINE_LOCK:
            ENGINE = engine
        set_job("__engine__", status=1, progress=100, stage=f"V9 pronto · {len(engine.slots)} slot GPU")
        print(f"[V9] ENGINE READY · {engine.gpu_name} · slots={len(engine.slots)}", flush=True)
    except Exception as exc:
        ENGINE_ERROR = f"{type(exc).__name__}: {exc}"
        set_job("__engine__", status=2, progress=0, stage="V9 warmup fallito", error=ENGINE_ERROR)
        traceback.print_exc()
    finally:
        ENGINE_READY.set()


def run_job(task_id: str, body: dict):
    try:
        set_job(task_id, status=0, progress=2, stage="V9 · attendo motore GPU persistente", result=[])
        ENGINE_READY.wait()
        if ENGINE_ERROR:
            raise RuntimeError(f"V9 engine non disponibile: {ENGINE_ERROR}")
        with ENGINE_LOCK:
            engine = ENGINE
        if engine is None:
            raise RuntimeError("V9 engine non inizializzato.")
        engine.generate_job(task_id, body)
    except Exception as exc:
        traceback.print_exc()
        set_job(task_id, status=2, progress=0, stage="Errore", error=str(exc), message=str(exc))


def engine_snapshot() -> dict:
    warm = get_job("__engine__") or {}
    with ENGINE_LOCK:
        engine = ENGINE
    gpu = None
    slots = 0
    if engine is not None:
        gpu = engine.gpu_name
        slots = len(engine.slots)
    try:
        free, total = torch.cuda.mem_get_info(0)
        memory = {"free_gb": round(free / (1024 ** 3), 2), "total_gb": round(total / (1024 ** 3), 2)}
    except Exception:
        memory = None
    return {
        "ready": engine is not None and not ENGINE_ERROR,
        "warming": not ENGINE_READY.is_set(),
        "error": ENGINE_ERROR or None,
        "warmup": warm,
        "gpu": gpu,
        "slots": slots,
        "memory": memory,
        "stage1_model": str(STAGE1_MODEL),
        "stage2_model": str(STAGE2_MODEL),
        "stage1_cache": STAGE1_CACHE_SIZE,
        "stage2_cache": STAGE2_CACHE_SIZE,
        "guidance": USE_GUIDANCE,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = "SONARA-YuE/9.0-EXL2-PERSISTENT"

    def log_message(self, fmt, *args):
        print("[YuE V9 API]", fmt % args, flush=True)

    def authorized(self) -> bool:
        if not API_KEY:
            return True
        bearer = self.headers.get("Authorization", "").removeprefix("Bearer ").strip()
        xkey = self.headers.get("X-API-Key", "").strip()
        return bearer == API_KEY or xkey == API_KEY

    def cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET,HEAD,POST,OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization,Content-Type,Range,X-API-Key")
        self.send_header("Access-Control-Expose-Headers", "Content-Length,Content-Range,Accept-Ranges")

    def json_response(self, payload, status=200):
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.cors()
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def read_json(self):
        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        return json.loads(raw.decode("utf-8"))

    def resolve_audio(self, requested: str) -> Path | None:
        requested = str(requested or "").strip()
        if not requested:
            return None
        target = (OUTPUT_ROOT / requested.lstrip("/")).resolve()
        try:
            target.relative_to(OUTPUT_ROOT.resolve())
        except Exception:
            return None
        return target if target.is_file() else None

    def send_audio(self, target: Path):
        size = target.stat().st_size
        range_header = self.headers.get("Range", "")
        start = 0
        end = size - 1
        partial = False
        if range_header.startswith("bytes="):
            match = re.match(r"bytes=(\d*)-(\d*)", range_header)
            if match:
                if match.group(1):
                    start = int(match.group(1))
                if match.group(2):
                    end = min(end, int(match.group(2)))
                if not match.group(1) and match.group(2):
                    suffix = int(match.group(2))
                    start = max(0, size - suffix)
                    end = size - 1
                if start > end or start >= size:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{size}")
                    self.cors()
                    self.end_headers()
                    return
                partial = True
        length = end - start + 1
        self.send_response(206 if partial else 200)
        self.send_header("Content-Type", "audio/wav")
        self.send_header("Accept-Ranges", "bytes")
        self.send_header("Content-Length", str(length))
        if partial:
            self.send_header("Content-Range", f"bytes {start}-{end}/{size}")
        self.send_header("Cache-Control", "private, max-age=3600")
        self.cors()
        self.end_headers()
        if self.command == "HEAD":
            return
        with target.open("rb") as fh:
            fh.seek(start)
            remaining = length
            while remaining > 0:
                chunk = fh.read(min(1024 * 1024, remaining))
                if not chunk:
                    break
                self.wfile.write(chunk)
                remaining -= len(chunk)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path in ("/", "/health"):
            with JOBS_LOCK:
                active = sum(1 for key, item in JOBS.items() if key != "__engine__" and int(item.get("status", 0)) == 0)
                total_jobs = sum(1 for key in JOBS if key != "__engine__")
                latest = None
                keys = [key for key in JOBS if key != "__engine__"]
                if keys:
                    latest_id = keys[-1]
                    latest = {"task_id": latest_id, **dict(JOBS[latest_id])}
            return self.json_response({
                "ok": not bool(ENGINE_ERROR),
                "service": "SONARA YuE RTX PRO 6000 V9 ExLlamaV2",
                "version": "9.0-exl2-persistent-dual",
                "engine": engine_snapshot(),
                "active_jobs": active,
                "jobs": total_jobs,
                "latest_job": latest,
            })

        if parsed.path == "/v1/audio":
            if not self.authorized():
                return self.json_response({"code": 401, "error": "Unauthorized"}, 401)
            query = parse_qs(parsed.query)
            target = self.resolve_audio((query.get("path") or [""])[0])
            if target is None:
                return self.json_response({"code": 404, "error": "Audio not found"}, 404)
            return self.send_audio(target)

        return self.json_response({"code": 404, "error": "Not found"}, 404)

    def do_HEAD(self):
        parsed = urlparse(self.path)
        if parsed.path == "/v1/audio":
            if not self.authorized():
                return self.json_response({"code": 401, "error": "Unauthorized"}, 401)
            query = parse_qs(parsed.query)
            target = self.resolve_audio((query.get("path") or [""])[0])
            if target is None:
                return self.json_response({"code": 404, "error": "Audio not found"}, 404)
            return self.send_audio(target)
        return self.do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if not self.authorized():
            return self.json_response({"code": 401, "error": "Unauthorized"}, 401)

        try:
            body = self.read_json()
        except Exception as exc:
            return self.json_response({"code": 400, "error": f"Invalid JSON: {exc}"}, 400)

        if parsed.path == "/release_task":
            task_id = "v9_" + uuid.uuid4().hex
            candidate_count = int(clamp(body.get("candidate_count"), 1, 1, 2))
            body["candidate_count"] = candidate_count
            set_job(
                task_id,
                status=0,
                progress=1,
                stage="V9 job ricevuto",
                result=[],
                created_at=now_ms(),
                candidate_count=candidate_count,
            )
            threading.Thread(target=run_job, args=(task_id, body), daemon=True).start()
            return self.json_response({"code": 200, "data": {"task_id": task_id}})

        if parsed.path == "/query_result":
            ids = body.get("task_id_list") or []
            data = []
            for task_id in ids:
                item = get_job(str(task_id))
                if item is None:
                    data.append({"task_id": str(task_id), "status": 2, "progress": 0, "error": "Task not found"})
                else:
                    data.append({"task_id": str(task_id), **item})
            return self.json_response({"code": 200, "data": data})

        return self.json_response({"code": 404, "error": "Not found"}, 404)


def main():
    print("=" * 80, flush=True)
    print("SONARA YUE V9 - EXLLAMAV2 PERSISTENT RTX ENGINE", flush=True)
    print(f"ROOT={ROOT}", flush=True)
    print(f"PORT={PORT}", flush=True)
    print(f"STAGE1={STAGE1_MODEL}", flush=True)
    print(f"STAGE2={STAGE2_MODEL}", flush=True)
    print(f"REQUESTED_SLOTS={REQUESTED_SLOTS}", flush=True)
    print(f"STAGE1_CACHE={STAGE1_CACHE_SIZE} {STAGE1_CACHE_MODE}", flush=True)
    print(f"STAGE2_CACHE={STAGE2_CACHE_SIZE} {STAGE2_CACHE_MODE}", flush=True)
    print(f"GUIDANCE={'ON' if USE_GUIDANCE else 'OFF MAX SPEED'}", flush=True)
    print("=" * 80, flush=True)

    threading.Thread(target=warm_engine, daemon=True).start()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print(f"[V9] API online su 0.0.0.0:{PORT}; warmup modelli in corso...", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
