import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path

WORKDIR = Path('/kaggle/working/sonara-wan21-video')
APP = WORKDIR / 'app.py'
LOG = Path('/kaggle/working/sonara_wan21_gpu1.log')
PORT = 7861
GPU = '1'
MODEL = 'Wan-AI/Wan2.1-T2V-1.3B-Diffusers'

APP_CODE = r'''
import os
import threading
import uuid
from pathlib import Path

import torch
from diffusers import AutoencoderKLWan, WanPipeline
from diffusers.schedulers.scheduling_unipc_multistep import UniPCMultistepScheduler
from diffusers.utils import export_to_video
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

MODEL = os.environ.get('SONARA_WAN_MODEL', 'Wan-AI/Wan2.1-T2V-1.3B-Diffusers')
OUT = Path('/kaggle/working/sonara-wan21-video/outputs')
OUT.mkdir(parents=True, exist_ok=True)
FAST_MODE = str(os.environ.get('SONARA_WAN_FAST_MODE', 'true')).strip().lower() not in {'0', 'false', 'no', 'off'}
WARMUP = str(os.environ.get('SONARA_WAN_WARMUP', 'true')).strip().lower() not in {'0', 'false', 'no', 'off'}
FAST_STEPS = max(6, min(16, int(os.environ.get('SONARA_WAN_FAST_STEPS', '8'))))
FAST_WIDTH = 624
FAST_HEIGHT = 352
QUALITY_WIDTH = 672
QUALITY_HEIGHT = 384
OUTPUT_FPS = 8 if FAST_MODE else 10
MAX_FRAMES = 65 if FAST_MODE else 81
FLOW_SHIFT = 3.0 if FAST_MODE else 5.0
GUIDANCE_SCALE = 4.25 if FAST_MODE else 4.5
MAX_SEQUENCE_LENGTH = 256
PROFILE = 'turbo-hq-t4-v4' if FAST_MODE else 'quality-t4-v2'
NEGATIVE_PROMPT = 'low quality, blurry, watermark, text, logo, deformed, duplicate, static frame, flicker, oversaturated'

torch.set_grad_enabled(False)
torch.backends.cudnn.benchmark = True
try:
    torch.backends.cuda.enable_mem_efficient_sdp(True)
except Exception:
    pass
try:
    torch.backends.cuda.enable_math_sdp(True)
except Exception:
    pass

app = FastAPI(title='SONARA WAN Video Worker')
pipe = None
pipe_device_mode = 'not-loaded'
pipe_loading = False
pipe_warmed = False
pipe_lock = threading.Lock()
jobs = {}
jobs_lock = threading.Lock()


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=8, max_length=5000)
    aspectRatio: str = '16:9'
    durationSeconds: int = 8
    seed: int | None = None


def frames_for_duration(seconds: int) -> int:
    seconds = max(1, min(8, int(seconds or 8)))
    target = min(MAX_FRAMES, max(17, int(round(seconds * OUTPUT_FPS)) + 1))
    return max(17, min(MAX_FRAMES, ((target - 1) // 4) * 4 + 1))


def load_pipe():
    global pipe, pipe_device_mode, pipe_loading
    if pipe is not None:
        return pipe
    with pipe_lock:
        if pipe is not None:
            return pipe
        pipe_loading = True
        try:
            vae = AutoencoderKLWan.from_pretrained(MODEL, subfolder='vae', torch_dtype=torch.float32)
            candidate = WanPipeline.from_pretrained(MODEL, vae=vae, torch_dtype=torch.float16)
            candidate.scheduler = UniPCMultistepScheduler.from_config(
                candidate.scheduler.config,
                flow_shift=FLOW_SHIFT,
            )
            candidate.vae.enable_tiling()
            candidate.transformer.eval()
            candidate.text_encoder.eval()
            candidate.vae.eval()

            try:
                candidate.to('cuda')
                pipe_device_mode = 'full-cuda-turbo'
            except RuntimeError as exc:
                if 'out of memory' not in str(exc).lower():
                    raise
                try:
                    candidate.to('cpu')
                except Exception:
                    pass
                torch.cuda.empty_cache()
                candidate.enable_model_cpu_offload()
                pipe_device_mode = 'cpu-offload-fallback'

            pipe = candidate
            return pipe
        finally:
            pipe_loading = False


def warm_pipe():
    global pipe_warmed
    try:
        p = load_pipe()
        if not WARMUP:
            pipe_warmed = True
            return
        generator = torch.Generator(device='cuda').manual_seed(777)
        with pipe_lock, torch.inference_mode():
            p(
                prompt='cinematic natural motion, premium lighting',
                negative_prompt=NEGATIVE_PROMPT,
                height=144,
                width=256,
                num_frames=17,
                guidance_scale=GUIDANCE_SCALE,
                num_inference_steps=2,
                generator=generator,
                max_sequence_length=128,
            )
        try:
            torch.cuda.synchronize()
        except Exception:
            pass
        pipe_warmed = True
        print('[SONARA WAN TURBO] CUDA warm-up complete.', flush=True)
    except Exception as exc:
        print(f'[SONARA WAN TURBO] warmup failed; first request will retry: {exc}', flush=True)


def set_job(job_id, **values):
    with jobs_lock:
        current = dict(jobs.get(job_id, {}))
        current.update(values)
        jobs[job_id] = current


def render(job_id, req):
    try:
        set_job(job_id, status='PROCESSING', progress=5, stage='WAN 2.1 Turbo HQ: preparazione GPU')
        p = load_pipe()
        portrait = req.aspectRatio == '9:16'
        if FAST_MODE:
            width, height = (FAST_HEIGHT, FAST_WIDTH) if portrait else (FAST_WIDTH, FAST_HEIGHT)
            steps = FAST_STEPS
        else:
            width, height = (QUALITY_HEIGHT, QUALITY_WIDTH) if portrait else (QUALITY_WIDTH, QUALITY_HEIGHT)
            steps = 20
        num_frames = frames_for_duration(req.durationSeconds)

        seed = req.seed if req.seed is not None else int.from_bytes(os.urandom(4), 'big')
        generator = torch.Generator(device='cuda').manual_seed(seed)
        set_job(
            job_id,
            progress=12,
            stage=f'WAN 2.1 Turbo HQ - {steps} step / {num_frames} frame',
            seed=seed,
            profile=PROFILE,
            steps=steps,
            frames=num_frames,
            resolution=f'{width}x{height}',
        )

        def progress_callback(_pipeline, step_index, _timestep, callback_kwargs):
            pct = 16 + int(((step_index + 1) / max(1, steps)) * 70)
            set_job(
                job_id,
                progress=min(86, pct),
                stage=f'WAN 2.1 Turbo HQ - step {step_index + 1}/{steps}',
            )
            return callback_kwargs

        with pipe_lock, torch.inference_mode():
            result = p(
                prompt=req.prompt,
                negative_prompt=NEGATIVE_PROMPT,
                height=height,
                width=width,
                num_frames=num_frames,
                guidance_scale=GUIDANCE_SCALE,
                num_inference_steps=steps,
                generator=generator,
                max_sequence_length=MAX_SEQUENCE_LENGTH,
                callback_on_step_end=progress_callback,
            )
        set_job(job_id, progress=90, stage='Codifica MP4 Turbo HQ')
        path = OUT / f'{job_id}.mp4'
        export_to_video(result.frames[0], str(path), fps=OUTPUT_FPS)
        set_job(
            job_id,
            status='COMPLETED',
            progress=100,
            stage='Video pronto',
            provider='kaggle-wan21',
            model=MODEL,
            profile=PROFILE,
            deviceMode=pipe_device_mode,
            warmed=pipe_warmed,
            steps=steps,
            frames=num_frames,
            resolution=f'{width}x{height}',
            fps=OUTPUT_FPS,
            clipSeconds=round(num_frames / OUTPUT_FPS, 2),
            videoPath=f'/v1/video/file/{path.name}',
        )
    except Exception as exc:
        set_job(job_id, status='FAILED', progress=0, stage='Errore WAN 2.1 Turbo HQ', error=str(exc))


@app.get('/health')
def health():
    width, height = (FAST_WIDTH, FAST_HEIGHT) if FAST_MODE else (QUALITY_WIDTH, QUALITY_HEIGHT)
    return {
        'status': 'ok',
        'provider': 'kaggle-wan21',
        'model': MODEL,
        'gpu': os.environ.get('CUDA_VISIBLE_DEVICES', '1'),
        'loaded': pipe is not None,
        'loading': pipe_loading,
        'warmed': pipe_warmed,
        'ready': pipe is not None and (pipe_warmed or not WARMUP),
        'deviceMode': pipe_device_mode,
        'jobs': len(jobs),
        'profile': PROFILE,
        'fastMode': FAST_MODE,
        'steps': FAST_STEPS if FAST_MODE else 20,
        'resolution': f'{width}x{height}',
        'maxFrames': MAX_FRAMES,
        'fps': OUTPUT_FPS,
        'maxClipSeconds': round(MAX_FRAMES / OUTPUT_FPS, 2),
        'flowShift': FLOW_SHIFT,
        'guidanceScale': GUIDANCE_SCALE,
    }


@app.post('/v1/video/generate', status_code=202)
def generate(req: GenerateRequest):
    if req.durationSeconds > 8:
        raise HTTPException(status_code=400, detail='WAN Kaggle worker supports clips up to 8 seconds per scene.')
    job_id = 'wan_' + uuid.uuid4().hex
    set_job(
        job_id,
        jobId=job_id,
        status='PROCESSING',
        progress=2,
        stage='In coda su SONARA WAN Turbo HQ',
        provider='kaggle-wan21',
        model=MODEL,
        profile=PROFILE,
    )
    thread = threading.Thread(target=render, args=(job_id, req), daemon=True)
    thread.start()
    return jobs[job_id]


@app.get('/v1/video/job/{job_id}')
def job(job_id: str):
    with jobs_lock:
        payload = jobs.get(job_id)
    if not payload:
        raise HTTPException(status_code=404, detail='Job not found')
    return payload


@app.get('/v1/video/file/{name}')
def video_file(name: str):
    safe = Path(name).name
    path = OUT / safe
    if not path.exists() or path.suffix.lower() != '.mp4':
        raise HTTPException(status_code=404, detail='Video not found')
    return FileResponse(path, media_type='video/mp4', filename=path.name)


@app.on_event('startup')
def startup_warmup():
    threading.Thread(target=warm_pipe, daemon=True).start()
'''


def stop_gpu1_worker():
    try:
        rows = subprocess.check_output(['ps', '-eo', 'pid=,args='], text=True)
    except Exception:
        return
    pids = []
    for row in rows.splitlines():
        parts = row.strip().split(maxsplit=1)
        if len(parts) != 2:
            continue
        try:
            pid = int(parts[0])
        except ValueError:
            continue
        cmd = parts[1].lower()
        if pid == os.getpid() or 'cloudflared' in cmd:
            continue
        if '--port 7861' in cmd or ':7861' in cmd or 'sonara-wan21-video/app.py' in cmd:
            pids.append(pid)
    for pid in pids:
        try:
            os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
    time.sleep(2)
    for pid in pids:
        try:
            os.kill(pid, 0)
            os.kill(pid, signal.SIGKILL)
        except Exception:
            pass
    print(f'GPU1/7861 workers stopped: {len(pids)}')


def install_runtime():
    modules = ['diffusers', 'transformers', 'accelerate', 'safetensors', 'fastapi', 'uvicorn', 'imageio_ffmpeg']
    missing = []
    for module in modules:
        try:
            __import__(module)
        except Exception:
            missing.append(module)
    if not missing:
        print('WAN runtime dependencies already available; skipping pip upgrade.')
        return
    packages = [
        'diffusers>=0.35.1',
        'transformers>=4.49.0',
        'accelerate>=1.2.1',
        'safetensors>=0.4.5',
        'sentencepiece>=0.2.0',
        'fastapi>=0.115.0',
        'uvicorn[standard]>=0.32.0',
        'imageio[ffmpeg]>=2.36.0',
        'hf-transfer>=0.1.9',
    ]
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', *packages], check=True)


def main():
    print('=' * 88)
    print(' SONARA VIDEO AI - WAN 2.1 TURBO HQ T4 / GPU1 / ZERO GOOGLE BILLING ')
    print('=' * 88)
    subprocess.run(['nvidia-smi', '-L'], check=True)
    WORKDIR.mkdir(parents=True, exist_ok=True)
    (WORKDIR / 'outputs').mkdir(parents=True, exist_ok=True)
    install_runtime()
    APP.write_text(APP_CODE, encoding='utf-8')
    stop_gpu1_worker()

    env = os.environ.copy()
    env.update({
        'CUDA_VISIBLE_DEVICES': GPU,
        'SONARA_WAN_MODEL': MODEL,
        'SONARA_WAN_FAST_MODE': 'true',
        'SONARA_WAN_FAST_STEPS': '8',
        'SONARA_WAN_WARMUP': 'true',
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
        'CUDA_MODULE_LOADING': 'LAZY',
        'OMP_NUM_THREADS': '4',
        'MKL_NUM_THREADS': '4',
        'NUMEXPR_NUM_THREADS': '4',
        'MALLOC_ARENA_MAX': '2',
        'TOKENIZERS_PARALLELISM': 'false',
        'HF_HUB_ENABLE_HF_TRANSFER': '1',
    })
    log = open(LOG, 'w', buffering=1)
    proc = subprocess.Popen(
        [sys.executable, '-m', 'uvicorn', 'app:app', '--host', '0.0.0.0', '--port', str(PORT), '--workers', '1'],
        cwd=str(WORKDIR),
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f'WAN Turbo HQ worker PID {proc.pid} on GPU1 port {PORT}')

    import urllib.request
    deadline = time.time() + 900
    last_payload = None
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(LOG.read_text(errors='ignore')[-12000:])
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/health', timeout=5) as r:
                payload = json.loads(r.read().decode())
                last_payload = payload
                if r.status == 200 and payload.get('status') == 'ok' and payload.get('ready') is True:
                    print(json.dumps(payload, indent=2))
                    print('SONARA WAN Video TURBO HQ READY. Existing Cloudflare tunnel on GPU1/7861 is reused.')
                    print('Turbo HQ profile: 8 steps, 624x352 landscape / 352x624 portrait, up to 65 frames @ 8 fps.')
                    return
        except Exception:
            pass
        time.sleep(3)
    tail = LOG.read_text(errors='ignore')[-12000:] if LOG.exists() else ''
    raise RuntimeError(f'WAN Turbo HQ readiness timeout. Last health: {last_payload}\nLog tail:\n{tail}')


if __name__ == '__main__':
    main()
