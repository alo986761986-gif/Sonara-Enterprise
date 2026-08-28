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
from diffusers.utils import export_to_video
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

MODEL = os.environ.get('SONARA_WAN_MODEL', 'Wan-AI/Wan2.1-T2V-1.3B-Diffusers')
OUT = Path('/kaggle/working/sonara-wan21-video/outputs')
OUT.mkdir(parents=True, exist_ok=True)
FAST_MODE = str(os.environ.get('SONARA_WAN_FAST_MODE', 'true')).strip().lower() not in {'0', 'false', 'no', 'off'}
WARMUP = str(os.environ.get('SONARA_WAN_WARMUP', 'true')).strip().lower() not in {'0', 'false', 'no', 'off'}
FAST_STEPS = max(8, min(28, int(os.environ.get('SONARA_WAN_FAST_STEPS', '16'))))
FAST_WIDTH = 768
FAST_HEIGHT = 432
QUALITY_WIDTH = 832
QUALITY_HEIGHT = 480
NUM_FRAMES = 81
OUTPUT_FPS = 10
PROFILE = 'fast-t4-v2' if FAST_MODE else 'quality-t4-v1'

app = FastAPI(title='SONARA WAN Video Worker')
pipe = None
pipe_device_mode = 'not-loaded'
pipe_loading = False
pipe_lock = threading.Lock()
jobs = {}
jobs_lock = threading.Lock()

class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=8, max_length=5000)
    aspectRatio: str = '16:9'
    durationSeconds: int = 8
    seed: int | None = None


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
            candidate.vae.enable_tiling()

            # WAN 1.3B normally fits a 16 GB T4. Keeping the pipeline on CUDA avoids
            # repeated CPU<->GPU transfers and is substantially faster than CPU offload.
            # If this specific Kaggle runtime cannot fit it, fall back safely to offload.
            try:
                candidate.to('cuda')
                pipe_device_mode = 'full-cuda'
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
    try:
        load_pipe()
    except Exception as exc:
        print(f'[SONARA WAN] warmup failed; first request will retry: {exc}', flush=True)


def set_job(job_id, **values):
    with jobs_lock:
        current = dict(jobs.get(job_id, {}))
        current.update(values)
        jobs[job_id] = current


def render(job_id, req):
    try:
        set_job(job_id, status='PROCESSING', progress=5, stage='Caricamento WAN 2.1 FAST')
        p = load_pipe()
        portrait = req.aspectRatio == '9:16'
        if FAST_MODE:
            width, height = (FAST_HEIGHT, FAST_WIDTH) if portrait else (FAST_WIDTH, FAST_HEIGHT)
            steps = FAST_STEPS
        else:
            width, height = (QUALITY_HEIGHT, QUALITY_WIDTH) if portrait else (QUALITY_WIDTH, QUALITY_HEIGHT)
            steps = 28

        seed = req.seed if req.seed is not None else int.from_bytes(os.urandom(4), 'big')
        generator = torch.Generator(device='cuda').manual_seed(seed)
        set_job(
            job_id,
            progress=18,
            stage=f'Generazione WAN 2.1 FAST - {steps} step',
            seed=seed,
            profile=PROFILE,
            steps=steps,
            resolution=f'{width}x{height}',
        )
        with pipe_lock, torch.inference_mode():
            result = p(
                prompt=req.prompt,
                negative_prompt='low quality, blurry, watermark, text, logo, deformed, duplicate, static frame',
                height=height,
                width=width,
                num_frames=NUM_FRAMES,
                guidance_scale=5.0,
                num_inference_steps=steps,
                generator=generator,
            )
        set_job(job_id, progress=90, stage='Codifica MP4 FAST')
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
            steps=steps,
            resolution=f'{width}x{height}',
            fps=OUTPUT_FPS,
            clipSeconds=round(NUM_FRAMES / OUTPUT_FPS, 2),
            videoPath=f'/v1/video/file/{path.name}',
        )
    except Exception as exc:
        set_job(job_id, status='FAILED', progress=0, stage='Errore WAN 2.1', error=str(exc))


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
        'deviceMode': pipe_device_mode,
        'jobs': len(jobs),
        'profile': PROFILE,
        'fastMode': FAST_MODE,
        'steps': FAST_STEPS if FAST_MODE else 28,
        'resolution': f'{width}x{height}',
        'frames': NUM_FRAMES,
        'fps': OUTPUT_FPS,
        'clipSeconds': round(NUM_FRAMES / OUTPUT_FPS, 2),
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
        stage='In coda su SONARA WAN FAST',
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
    if WARMUP:
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
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '--upgrade', *packages], check=True)


def main():
    print('=' * 78)
    print(' SONARA VIDEO AI - WAN 2.1 FAST / KAGGLE GPU1 / ZERO GOOGLE API COST ')
    print('=' * 78)
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
        'SONARA_WAN_FAST_STEPS': '16',
        'SONARA_WAN_WARMUP': 'true',
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
        'TOKENIZERS_PARALLELISM': 'false',
        'HF_HUB_ENABLE_HF_TRANSFER': '1',
    })
    log = open(LOG, 'w', buffering=1)
    proc = subprocess.Popen(
        [sys.executable, '-m', 'uvicorn', 'app:app', '--host', '0.0.0.0', '--port', str(PORT)],
        cwd=str(WORKDIR),
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f'WAN FAST worker PID {proc.pid} on GPU1 port {PORT}')

    import urllib.request
    deadline = time.time() + 180
    while time.time() < deadline:
        if proc.poll() is not None:
            raise RuntimeError(LOG.read_text(errors='ignore')[-8000:])
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/health', timeout=5) as r:
                payload = json.loads(r.read().decode())
                if r.status == 200 and payload.get('status') == 'ok':
                    print(json.dumps(payload, indent=2))
                    print('SONARA WAN Video FAST worker READY. Existing Cloudflare tunnel on GPU1/7861 can be reused.')
                    print('FAST profile: 16 steps, 768x432 landscape / 432x768 portrait, 81 frames @ 10 fps (~8.1 s).')
                    print('Warm-up is running in background so the first generation avoids model-load latency when possible.')
                    return
        except Exception:
            pass
        time.sleep(3)
    raise RuntimeError('WAN FAST worker health timeout. Log tail:\n' + LOG.read_text(errors='ignore')[-8000:])


if __name__ == '__main__':
    main()
