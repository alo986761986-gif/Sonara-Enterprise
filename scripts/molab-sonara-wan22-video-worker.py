#!/usr/bin/env python3
"""One-cell SONARA Video AI worker for MoLab RTX Pro 6000.

The installer creates an isolated Python environment, keeps the official
Wan2.2 TI2V-5B Diffusers pipeline resident on the 96 GB GPU, exposes the API
contract consumed by ``api/video/provider.ts``, and publishes it through a
Cloudflare quick tunnel. Re-running the script is idempotent.
"""

from __future__ import annotations

import argparse
import json
import os
import platform
import re
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import textwrap
import time
import urllib.request
from pathlib import Path


ROOT = Path("/marimo/SONARA-VIDEO-AI-WAN22")
VENV = ROOT / ".venv"
PYTHON = VENV / "bin" / "python"
APP_FILE = ROOT / "sonara_wan22_api.py"
OUTPUTS = ROOT / "outputs"
CACHE = ROOT / "cache"
BIN = ROOT / "bin"
RUN = Path("/tmp/sonara-video-ai-wan22")
API_LOG = RUN / "api.log"
TUNNEL_LOG = RUN / "cloudflare.log"
READY_FILE = ROOT / "SONARA_VIDEO_AI_READY.json"
TOKEN_FILE = ROOT / ".sonara-video-token"
PORT = 7862
MODEL_ID = "Wan-AI/Wan2.2-TI2V-5B-Diffusers"
MODEL_NAME = "wan2.2-ti2v-5b"
PROFILE = "molab-rtx-pro-6000-blackwell-fast-v2"


def banner(message: str) -> None:
    print("\n" + "=" * 92, flush=True)
    print(message, flush=True)
    print("=" * 92, flush=True)


def run(command, *, timeout: int | None = None, env: dict | None = None) -> None:
    command = [str(item) for item in command]
    print("$ " + " ".join(command), flush=True)
    result = subprocess.run(command, check=False, timeout=timeout, env=env)
    if result.returncode != 0:
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(command)}")


def output(command, *, timeout: int = 60) -> str:
    return subprocess.check_output([str(item) for item in command], text=True, timeout=timeout).strip()


def check_resources() -> dict:
    banner("1/7 - VERIFICA MOLAB RTX PRO 6000 BLACKWELL")
    disk = shutil.disk_usage("/marimo")
    free_gb = disk.free / 1024**3
    virtualized_quota = free_gb > 1_000_000
    print("DISK_FREE_GB=VIRTUALIZED" if virtualized_quota else f"DISK_FREE_GB={free_gb:.2f}", flush=True)
    if not virtualized_quota and free_gb < 55:
        raise RuntimeError(f"Servono almeno 55 GB liberi per Wan 2.2; disponibili {free_gb:.2f} GB.")

    probe = textwrap.dedent(
        """
        import json, torch
        assert torch.cuda.is_available(), "CUDA non disponibile"
        p = torch.cuda.get_device_properties(0)
        x = torch.randn((1024, 1024), device="cuda", dtype=torch.bfloat16)
        y = x @ x
        torch.cuda.synchronize()
        print(json.dumps({
            "torch": torch.__version__,
            "cuda": torch.version.cuda,
            "gpu": torch.cuda.get_device_name(0),
            "vram_gb": round(p.total_memory / 1024**3, 2),
            "capability": list(torch.cuda.get_device_capability(0)),
            "bf16": bool(torch.cuda.is_bf16_supported()),
            "compute": float(y[0, 0])
        }))
        """
    )
    raw = output([sys.executable, "-c", probe], timeout=180)
    info = json.loads(raw.splitlines()[-1])
    print(json.dumps(info, indent=2), flush=True)
    if float(info.get("vram_gb") or 0) < 80:
        raise RuntimeError("Il profilo residente ad alte prestazioni richiede almeno 80 GB di VRAM.")
    if not info.get("bf16"):
        raise RuntimeError("La GPU selezionata non supporta BF16.")
    return info


def ensure_environment() -> None:
    banner("2/7 - AMBIENTE PYTHON ISOLATO + DIFFUSERS WAN 2.2")
    ROOT.mkdir(parents=True, exist_ok=True)
    OUTPUTS.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    BIN.mkdir(parents=True, exist_ok=True)
    RUN.mkdir(parents=True, exist_ok=True)

    if not PYTHON.exists():
        run([sys.executable, "-m", "venv", "--system-site-packages", VENV], timeout=900)

    run([PYTHON, "-m", "pip", "install", "--upgrade", "pip", "setuptools<82", "wheel<0.49"], timeout=1800)
    run(
        [
            PYTHON,
            "-m",
            "pip",
            "install",
            "--upgrade",
            "git+https://github.com/huggingface/diffusers.git",
            "transformers>=4.51.3,<6",
            "accelerate>=1.8.0",
            "fastapi>=0.115",
            "uvicorn[standard]>=0.34",
            "huggingface_hub[hf_xet]>=0.34",
            "safetensors>=0.5",
            "sentencepiece>=0.2",
            "protobuf>=5,<7",
            "ftfy>=6.3",
            "imageio[ffmpeg]>=2.37",
            "imageio-ffmpeg>=0.6",
            "pillow>=11",
            "numpy>=1.26,<2.5",
        ],
        timeout=7200,
    )

    verify = textwrap.dedent(
        """
        import torch, diffusers, transformers, fastapi, uvicorn
        from diffusers import WanPipeline, AutoencoderKLWan
        assert torch.cuda.is_available()
        assert torch.cuda.is_bf16_supported()
        print("TORCH=" + torch.__version__)
        print("DIFFUSERS=" + diffusers.__version__)
        print("TRANSFORMERS=" + transformers.__version__)
        print("GPU=" + torch.cuda.get_device_name(0))
        print("WAN_PIPELINE_IMPORT=OK")
        """
    )
    run([PYTHON, "-c", verify], timeout=600)


def api_source() -> str:
    return r'''from __future__ import annotations

import json
import os
import secrets
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import torch
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

ROOT = Path(os.environ.get("SONARA_VIDEO_ROOT", "/marimo/SONARA-VIDEO-AI-WAN22"))
OUTPUTS = ROOT / "outputs"
CACHE = ROOT / "cache"
OUTPUTS.mkdir(parents=True, exist_ok=True)
CACHE.mkdir(parents=True, exist_ok=True)
MODEL_ID = os.environ.get("SONARA_WAN22_MODEL_ID", "Wan-AI/Wan2.2-TI2V-5B-Diffusers")
MODEL_NAME = "wan2.2-ti2v-5b"
PROFILE = "molab-rtx-pro-6000-blackwell-fast-v2"
API_TOKEN = os.environ.get("SONARA_MOLAB_VIDEO_TOKEN", "").strip()
JOB_STATE = ROOT / "jobs"
JOB_STATE.mkdir(parents=True, exist_ok=True)
DEFAULT_NEGATIVE = (
    "overexposed, static shot, frozen motion, blurry, low quality, jpeg artifacts, text, subtitles, "
    "watermark, logo, deformed anatomy, extra limbs, duplicated people, distorted hands, distorted face, "
    "morphing identity, flicker, temporal inconsistency, camera jitter"
)

app = FastAPI(title="SONARA Video AI - Wan 2.2 RTX Pro 6000", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://sonaraenterprise.com", "https://www.sonaraenterprise.com"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "HEAD", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Range", "X-Sonara-Token"],
)

jobs: dict[str, dict] = {}
jobs_lock = threading.Lock()
runtime_lock = threading.Lock()
active_job_id: str | None = None
queued_job_ids: list[str] = []
pipe_lock = threading.Lock()
load_lock = threading.Lock()
executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="sonara-wan22")
pipe = None
loading = False
load_error = ""
loaded_at = 0.0
warmed = False


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=8, max_length=6000)
    negativePrompt: str | None = Field(default=None, max_length=3000)
    aspectRatio: str = "16:9"
    resolution: str = "720p"
    frames: int = 97
    steps: int = 12
    durationSeconds: float = Field(default=8.0, ge=1.0, le=8.0)
    outputFps: int = Field(default=24, ge=12, le=30)
    seed: int | None = None


def require_token(x_sonara_token: str | None, authorization: str | None) -> None:
    supplied = (x_sonara_token or "").strip()
    if not supplied and authorization and authorization.lower().startswith("bearer "):
        supplied = authorization[7:].strip()
    if not API_TOKEN or not supplied or not secrets.compare_digest(API_TOKEN, supplied):
        raise HTTPException(status_code=401, detail="SONARA Video AI token non valido.")


def set_job(job_id: str, **values) -> None:
    with jobs_lock:
        current = dict(jobs.get(job_id, {}))
        current.update(values)
        current["updatedAt"] = time.time()
        jobs[job_id] = current
        target = JOB_STATE / f"{job_id}.json"
        temporary = JOB_STATE / f".{job_id}.json.tmp"
        temporary.write_text(json.dumps(current, ensure_ascii=False), encoding="utf-8")
        temporary.replace(target)


def restore_jobs() -> None:
    restored: dict[str, dict] = {}
    for state_file in JOB_STATE.glob("wan_*.json"):
        try:
            payload = json.loads(state_file.read_text(encoding="utf-8"))
            job_id = str(payload.get("jobId") or state_file.stem)
            if job_id.startswith("wan_"):
                restored[job_id] = payload
        except Exception as exc:
            print(f"SONARA_JOB_STATE_RESTORE_WARNING={state_file.name}:{exc}", flush=True)

    # Older worker versions kept job state only in RAM. Rehydrate every valid
    # MP4 so a website reload can still collect a render completed beforehand.
    for video_file in OUTPUTS.glob("wan_*.mp4"):
        if video_file.name.endswith(".raw.mp4") or video_file.stat().st_size < 10_000:
            continue
        job_id = video_file.stem
        modified = video_file.stat().st_mtime
        restored[job_id] = {
            **restored.get(job_id, {}),
            "jobId": job_id,
            "status": "COMPLETED",
            "progress": 100,
            "stage": "Video Wan 2.2 pronto (recuperato)",
            "filename": video_file.name,
            "model": MODEL_NAME,
            "provider": "molab-wan22",
            "profile": restored.get(job_id, {}).get("profile", "molab-rtx-pro-6000-blackwell-legacy"),
            "createdAt": restored.get(job_id, {}).get("createdAt", modified),
            "updatedAt": max(float(restored.get(job_id, {}).get("updatedAt", 0) or 0), modified),
            "fps": int(restored.get(job_id, {}).get("fps", 24) or 24),
            "clipSeconds": float(restored.get(job_id, {}).get("clipSeconds", 8.0) or 8.0),
            "videoVerified": True,
        }

    with jobs_lock:
        jobs.clear()
        jobs.update(restored)
    for job_id, payload in restored.items():
        target = JOB_STATE / f"{job_id}.json"
        target.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    print(f"SONARA_VIDEO_JOBS_RESTORED={len(restored)}", flush=True)


def gpu_info() -> dict:
    if not torch.cuda.is_available():
        return {"cuda": False}
    free, total = torch.cuda.mem_get_info(0)
    return {
        "cuda": True,
        "gpu": torch.cuda.get_device_name(0),
        "vramTotalGb": round(total / 1024**3, 2),
        "vramFreeGb": round(free / 1024**3, 2),
        "capability": list(torch.cuda.get_device_capability(0)),
        "bf16": bool(torch.cuda.is_bf16_supported()),
    }


def load_pipeline():
    global pipe, loading, load_error, loaded_at
    if pipe is not None:
        return pipe
    with load_lock:
        if pipe is not None:
            return pipe
        loading = True
        load_error = ""
        try:
            from diffusers import AutoencoderKLWan, WanPipeline

            torch.set_float32_matmul_precision("high")
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
            vae = AutoencoderKLWan.from_pretrained(
                MODEL_ID,
                subfolder="vae",
                torch_dtype=torch.float32,
                cache_dir=str(CACHE),
                low_cpu_mem_usage=True,
            )
            candidate = WanPipeline.from_pretrained(
                MODEL_ID,
                vae=vae,
                torch_dtype=torch.bfloat16,
                cache_dir=str(CACHE),
                low_cpu_mem_usage=True,
            )
            candidate.to("cuda")
            if hasattr(candidate, "set_progress_bar_config"):
                candidate.set_progress_bar_config(disable=False)
            pipe = candidate
            loaded_at = time.time()
            return pipe
        except Exception as exc:
            load_error = str(exc)
            raise
        finally:
            loading = False


def background_load() -> None:
    try:
        load_pipeline()
        print("SONARA_WAN22_MODEL_RESIDENT=YES", flush=True)
    except Exception as exc:
        print(f"SONARA_WAN22_MODEL_LOAD_ERROR={exc}", flush=True)


def validate_frames(value: int) -> int:
    value = max(17, min(97, int(value)))
    return max(17, ((value - 1) // 4) * 4 + 1)


def output_dimensions(aspect: str, resolution: str) -> tuple[int, int, int, int]:
    portrait = aspect == "9:16"
    native = (704, 1280) if portrait else (1280, 704)
    tiers = {"720p": (720, 1280), "1080p": (1080, 1920), "4k": (2160, 3840)}
    h, w = tiers.get(str(resolution).lower(), tiers["720p"])
    final = (h, w) if portrait else (w, h)
    return native[0], native[1], final[0], final[1]


def master_video(source: Path, target: Path, width: int, height: int, duration_seconds: float, output_fps: int) -> None:
    import subprocess

    subprocess.run(
        [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(source),
            "-vf", f"fps={output_fps},scale={width}:{height}:flags=lanczos:force_original_aspect_ratio=decrease,pad={width}:{height}:(ow-iw)/2:(oh-ih)/2:black,unsharp=3:3:0.12:3:3:0.0",
            "-t", f"{duration_seconds:.3f}",
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-pix_fmt", "yuv420p",
            "-profile:v", "high", "-movflags", "+faststart", "-an", str(target),
        ],
        check=True,
        timeout=900,
    )


def render(job_id: str, req: GenerateRequest) -> None:
    global active_job_id, warmed
    raw = OUTPUTS / f"{job_id}.raw.mp4"
    final = OUTPUTS / f"{job_id}.mp4"
    try:
        with runtime_lock:
            if job_id in queued_job_ids:
                queued_job_ids.remove(job_id)
            active_job_id = job_id
        set_job(job_id, status="PROCESSING", progress=3, stage="Wan 2.2: caricamento modello residente")
        pipeline = load_pipeline()
        frames = validate_frames(req.frames)
        steps = max(10, min(12, int(req.steps)))
        duration_seconds = max(1.0, min(8.0, float(req.durationSeconds)))
        output_fps = max(12, min(30, int(req.outputFps)))
        source_fps = max(8, min(output_fps, round((frames - 1) / duration_seconds)))
        seed = int(req.seed) if req.seed is not None else int.from_bytes(os.urandom(4), "big")
        native_w, native_h, final_w, final_h = output_dimensions(req.aspectRatio, req.resolution)
        negative = (req.negativePrompt or "").strip() or DEFAULT_NEGATIVE
        generator = torch.Generator(device="cuda").manual_seed(seed)

        def callback(_pipeline, step_index, _timestep, callback_kwargs):
            progress = 10 + round(((int(step_index) + 1) / max(1, steps)) * 72)
            set_job(
                job_id,
                status="PROCESSING",
                progress=min(82, progress),
                stage=f"Wan 2.2 RTX: denoise {int(step_index) + 1}/{steps}",
            )
            return callback_kwargs

        set_job(
            job_id,
            status="PROCESSING",
            progress=8,
            stage="Wan 2.2: inferenza BF16 sulla RTX Pro 6000",
            seed=seed,
            frames=frames,
            steps=steps,
            durationSeconds=duration_seconds,
            sourceFps=source_fps,
            outputFps=output_fps,
            profile=PROFILE,
        )
        with pipe_lock, torch.inference_mode():
            result = pipeline(
                prompt=req.prompt.strip(),
                negative_prompt=negative,
                height=native_h,
                width=native_w,
                num_frames=frames,
                num_inference_steps=steps,
                guidance_scale=5.0,
                generator=generator,
                callback_on_step_end=callback,
            ).frames[0]

        set_job(job_id, progress=86, stage=f"SONARA: encoding rapido MP4 {source_fps} fps")
        from diffusers.utils import export_to_video
        export_to_video(result, str(raw), fps=source_fps)
        del result
        set_job(job_id, progress=92, stage=f"SONARA: master {req.resolution}")
        master_video(raw, final, final_w, final_h, duration_seconds, output_fps)
        raw.unlink(missing_ok=True)
        if not final.exists() or final.stat().st_size < 10000:
            raise RuntimeError("Wan 2.2 non ha prodotto un MP4 valido.")
        warmed = True
        set_job(
            job_id,
            status="COMPLETED",
            progress=100,
            stage="Video Wan 2.2 pronto",
            filename=final.name,
            model=MODEL_NAME,
            profile=PROFILE,
            provider="molab-wan22",
            resolution=f"{final_w}x{final_h}",
            nativeResolution=f"{native_w}x{native_h}",
            fps=output_fps,
            sourceFps=source_fps,
            clipSeconds=round(duration_seconds, 2),
            videoCodec="h264-high-crf18-fast",
            audioCodec=None,
            audioVerified=False,
            videoVerified=True,
            exactDenoise=True,
            **gpu_info(),
        )
    except Exception as exc:
        raw.unlink(missing_ok=True)
        final.unlink(missing_ok=True)
        set_job(job_id, status="FAILED", progress=0, stage="Errore Wan 2.2", error=str(exc))
    finally:
        with runtime_lock:
            if active_job_id == job_id:
                active_job_id = None
        try:
            torch.cuda.empty_cache()
        except Exception:
            pass


def create_job(req: GenerateRequest) -> dict:
    job_id = "wan_" + uuid.uuid4().hex
    with runtime_lock:
        queued_job_ids.append(job_id)
        queue_position = len(queued_job_ids)
    set_job(
        job_id,
        jobId=job_id,
        status="PROCESSING",
        progress=1,
        stage=f"In coda su SONARA Wan 2.2 RTX (posizione {queue_position})",
        createdAt=time.time(),
        queuePosition=queue_position,
        profile=PROFILE,
    )
    executor.submit(render, job_id, req)
    return {"jobId": job_id, "status": "PROCESSING", "progress": 1, "stage": f"In coda su SONARA Wan 2.2 RTX (posizione {queue_position})", "profile": PROFILE}


def job_payload(job_id: str, request: Request, legacy: bool = False) -> dict:
    with jobs_lock:
        payload = dict(jobs.get(job_id, {}))
    if not payload:
        raise HTTPException(status_code=404, detail="Job Video AI non trovato.")
    if payload.get("status") == "COMPLETED" and payload.get("filename"):
        base = str(request.base_url).rstrip("/")
        path = f"/v1/video/file/{payload['filename']}" if legacy else f"/file/{payload['filename']}"
        payload["uri"] = base + path
        payload["videoPath"] = path
    return payload


@app.on_event("startup")
def startup() -> None:
    restore_jobs()
    threading.Thread(target=background_load, name="sonara-wan22-loader", daemon=True).start()


@app.get("/health")
def health() -> dict:
    info = gpu_info()
    with runtime_lock:
        active = active_job_id
        queued = list(queued_job_ids)
    return {
        "status": "ok",
        "service": "SONARA Video AI Wan 2.2",
        "provider": "molab-wan22",
        "model": MODEL_NAME,
        "modelId": MODEL_ID,
        "profile": PROFILE,
        "loaded": pipe is not None,
        "loading": loading,
        "ready": pipe is not None and not load_error,
        "warmed": warmed,
        "loadError": load_error or None,
        "residentGpu": True,
        "nativeFps": 12,
        "outputFps": 24,
        "nativeResolution": "1280x704",
        "defaultFrames": 97,
        "defaultSteps": 12,
        "maxFrames": 97,
        "maxClipSeconds": 8,
        "activeJob": active,
        "queuedJobs": len(queued),
        **info,
    }


@app.post("/generate", status_code=202)
def generate(
    req: GenerateRequest,
    x_sonara_token: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    require_token(x_sonara_token, authorization)
    return create_job(req)


@app.get("/job/{job_id}")
def job(
    job_id: str,
    request: Request,
    x_sonara_token: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    require_token(x_sonara_token, authorization)
    return job_payload(job_id, request)


@app.get("/file/{filename}")
def file(
    filename: str,
    x_sonara_token: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
):
    require_token(x_sonara_token, authorization)
    safe = Path(filename).name
    path = OUTPUTS / safe
    if not path.exists() or path.suffix.lower() != ".mp4":
        raise HTTPException(status_code=404, detail="Video non trovato.")
    return FileResponse(
        path,
        media_type="video/mp4",
        filename=safe,
        headers={"Cache-Control": "private, max-age=300", "Accept-Ranges": "bytes"},
    )


@app.post("/v1/video/generate", status_code=202)
def legacy_generate(
    req: GenerateRequest,
    x_sonara_token: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    require_token(x_sonara_token, authorization)
    return create_job(req)


@app.get("/v1/video/job/{job_id}")
def legacy_job(
    job_id: str,
    request: Request,
    x_sonara_token: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
) -> dict:
    require_token(x_sonara_token, authorization)
    return job_payload(job_id, request, legacy=True)


@app.get("/v1/video/file/{filename}")
def legacy_file(
    filename: str,
    x_sonara_token: str | None = Header(default=None),
    authorization: str | None = Header(default=None),
):
    return file(filename, x_sonara_token, authorization)
'''


def write_api() -> None:
    banner("3/7 - CREAZIONE API SONARA VIDEO AI")
    APP_FILE.write_text(api_source(), encoding="utf-8")
    run([PYTHON, "-m", "py_compile", APP_FILE], timeout=120)
    print(f"API_FILE={APP_FILE}", flush=True)


def token() -> str:
    if TOKEN_FILE.exists():
        value = TOKEN_FILE.read_text(encoding="utf-8").strip()
        if len(value) >= 40:
            return value
    value = secrets.token_urlsafe(48)
    TOKEN_FILE.write_text(value + "\n", encoding="utf-8")
    TOKEN_FILE.chmod(0o600)
    return value


def kill_matching(predicate) -> None:
    try:
        rows = output(["ps", "-eo", "pid=,args="], timeout=30)
    except Exception:
        return
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        if pid == os.getpid() or not predicate(parts[1].lower()):
            continue
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
    time.sleep(2)


def request_json(url: str, *, token_value: str = "", timeout: int = 20) -> dict:
    headers = {"Accept": "application/json", "Cache-Control": "no-cache", "User-Agent": "SONARA-Video-AI/1.0"}
    if token_value:
        headers["X-Sonara-Token"] = token_value
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def service_env(token_value: str) -> dict:
    env = os.environ.copy()
    env.update(
        {
            "SONARA_VIDEO_ROOT": str(ROOT),
            "SONARA_WAN22_MODEL_ID": MODEL_ID,
            "SONARA_MOLAB_VIDEO_TOKEN": token_value,
            "HF_HOME": str(CACHE),
            "HF_HUB_CACHE": str(CACHE / "hub"),
            "HF_XET_CACHE": str(CACHE / "xet"),
            "HF_HUB_ENABLE_HF_TRANSFER": "1",
            "HF_HUB_DOWNLOAD_TIMEOUT": "1800",
            "HF_HUB_ETAG_TIMEOUT": "180",
            "TOKENIZERS_PARALLELISM": "false",
            "PYTHONUNBUFFERED": "1",
            "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True",
            "CUDA_DEVICE_ORDER": "PCI_BUS_ID",
            "CUDA_VISIBLE_DEVICES": "0",
        }
    )
    return env


def start_api(token_value: str) -> subprocess.Popen:
    banner("4/7 - AVVIO WORKER RESIDENTE WAN 2.2")
    kill_matching(lambda command: "sonara_wan22_api:app" in command or ("uvicorn" in command and str(PORT) in command))
    API_LOG.write_text("", encoding="utf-8")
    log = API_LOG.open("a", encoding="utf-8", buffering=1)
    proc = subprocess.Popen(
        [PYTHON, "-m", "uvicorn", "sonara_wan22_api:app", "--app-dir", ROOT, "--host", "0.0.0.0", "--port", str(PORT), "--workers", "1", "--no-access-log"],
        cwd=str(ROOT),
        env=service_env(token_value),
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f"VIDEO_API_PID={proc.pid}", flush=True)
    deadline = time.time() + 180
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = API_LOG.read_text(errors="replace")[-16000:]
            raise RuntimeError(f"API terminata con exit={proc.returncode}:\n{tail}")
        try:
            health = request_json(f"http://127.0.0.1:{PORT}/health", timeout=8)
            if health.get("status") == "ok":
                print("LOCAL_VIDEO_HEALTH=OK", flush=True)
                return proc
        except Exception:
            pass
        time.sleep(2)
    raise RuntimeError("Timeout avvio API Video AI locale.")


def cloudflared_binary() -> Path:
    existing = shutil.which("cloudflared")
    if existing:
        return Path(existing)
    target = BIN / "cloudflared"
    if target.exists() and os.access(target, os.X_OK):
        return target
    machine = platform.machine().lower()
    arch = "arm64" if machine in {"aarch64", "arm64"} else "amd64"
    url = f"https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{arch}"
    print(f"Scarico cloudflared: {url}", flush=True)
    urllib.request.urlretrieve(url, target)
    target.chmod(0o755)
    return target


def start_tunnel() -> tuple[subprocess.Popen, str]:
    banner("5/7 - TUNNEL PUBBLICO CLOUDFLARE")
    kill_matching(lambda command: "cloudflared" in command and str(PORT) in command)
    binary = cloudflared_binary()
    pattern = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com", re.I)
    for protocol in ("http2", "quic"):
        TUNNEL_LOG.write_text("", encoding="utf-8")
        log = TUNNEL_LOG.open("a", encoding="utf-8", buffering=1)
        proc = subprocess.Popen(
            [binary, "tunnel", "--url", f"http://127.0.0.1:{PORT}", "--no-autoupdate", "--protocol", protocol, "--loglevel", "info"],
            stdout=log,
            stderr=subprocess.STDOUT,
            start_new_session=True,
        )
        deadline = time.time() + 90
        while time.time() < deadline:
            if proc.poll() is not None:
                break
            content = TUNNEL_LOG.read_text(errors="replace")
            match = pattern.search(content)
            if match:
                return proc, match.group(0).rstrip("/")
            time.sleep(0.5)
        if proc.poll() is None:
            try:
                os.killpg(proc.pid, signal.SIGTERM)
            except Exception:
                proc.terminate()
    raise RuntimeError("Cloudflare Quick Tunnel non ha restituito un URL pubblico.")


def wait_public(public_url: str) -> dict:
    banner("6/7 - VERIFICA API PUBBLICA")
    deadline = time.time() + 180
    last = None
    while time.time() < deadline:
        try:
            last = request_json(public_url + "/health", timeout=20)
            if last.get("status") == "ok":
                print("PUBLIC_VIDEO_HEALTH=OK", flush=True)
                return last
        except Exception as exc:
            last = {"error": repr(exc)}
        time.sleep(2)
    raise RuntimeError(f"Health pubblico Video AI non pronto: {last!r}")


def save_ready(public_url: str, token_value: str, gpu: dict, health: dict) -> None:
    payload = {
        "ready": True,
        "service": "SONARA Video AI",
        "provider": "molab-wan22",
        "model": MODEL_NAME,
        "modelId": MODEL_ID,
        "profile": PROFILE,
        "url": public_url,
        "tokenFile": str(TOKEN_FILE),
        "port": PORT,
        "gpu": gpu,
        "health": health,
        "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    READY_FILE.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"READY_FILE={READY_FILE}", flush=True)
    print(f"SONARA_MOLAB_VIDEO_URL={public_url}", flush=True)
    print(f"SONARA_MOLAB_VIDEO_TOKEN={token_value}", flush=True)
    print(f"SONARA_MOLAB_VIDEO_MODEL={MODEL_NAME}", flush=True)
    print("SONARA_MOLAB_VIDEO_FRAMES=97", flush=True)
    print("SONARA_MOLAB_VIDEO_STEPS=12", flush=True)


def supervise(api_proc: subprocess.Popen, tunnel_proc: subprocess.Popen, public_url: str) -> None:
    banner("7/7 - SONARA VIDEO AI ONLINE")
    print("NON FERMARE QUESTA CELLA: mantiene worker e tunnel attivi.", flush=True)
    while True:
        if api_proc.poll() is not None:
            tail = API_LOG.read_text(errors="replace")[-16000:]
            raise RuntimeError(f"API Video AI terminata:\n{tail}")
        if tunnel_proc.poll() is not None:
            tail = TUNNEL_LOG.read_text(errors="replace")[-12000:]
            raise RuntimeError(f"Tunnel Video AI terminato:\n{tail}")
        try:
            health = request_json(f"http://127.0.0.1:{PORT}/health", timeout=8)
            state = "READY" if health.get("ready") else "LOADING"
            error = health.get("loadError")
        except Exception as exc:
            state, error = "DOWN", str(exc)
        print(
            f"[{time.strftime('%H:%M:%S')}] VIDEO_AI={state} | API=UP | TUNNEL=UP | {public_url}"
            + (f" | ERROR={error}" if error else ""),
            flush=True,
        )
        time.sleep(60)


def main() -> None:
    gpu = check_resources()
    ensure_environment()
    write_api()
    token_value = token()
    api_proc = start_api(token_value)
    tunnel_proc, public_url = start_tunnel()
    health = wait_public(public_url)
    save_ready(public_url, token_value, gpu, health)
    supervise(api_proc, tunnel_proc, public_url)


def hot_reload_api() -> None:
    """Replace only the live API process, preserving tunnel, token and outputs."""
    banner("SONARA VIDEO AI - HOT RELOAD PROFILO RAPIDO")
    if not PYTHON.exists() or not TOKEN_FILE.exists():
        raise RuntimeError("Worker SONARA non installato: esegui prima l'installazione completa.")
    OUTPUTS.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    RUN.mkdir(parents=True, exist_ok=True)
    write_api()
    token_value = token()
    proc = start_api(token_value)
    deadline = time.time() + 900
    last = None
    while time.time() < deadline:
        if proc.poll() is not None:
            tail = API_LOG.read_text(errors="replace")[-16000:]
            raise RuntimeError(f"API Video AI terminata durante il reload:\n{tail}")
        try:
            last = request_json(f"http://127.0.0.1:{PORT}/health", timeout=8)
            if last.get("ready") and last.get("profile") == PROFILE:
                print("SONARA_VIDEO_AI_HOT_RELOAD=READY", flush=True)
                print(json.dumps(last, indent=2), flush=True)
                return
        except Exception as exc:
            last = {"error": str(exc)}
        time.sleep(3)
    raise RuntimeError(f"Timeout hot reload Video AI: {last!r}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--hot-reload-api", action="store_true", help="Aggiorna solo l'API residente senza cambiare tunnel o token.")
    arguments = parser.parse_args()
    if arguments.hot_reload_api:
        hot_reload_api()
    else:
        main()
