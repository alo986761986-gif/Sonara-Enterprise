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

try:
    import cache_dit
    from cache_dit import BasicCacheConfig
except Exception:
    cache_dit = None
    BasicCacheConfig = None

MODEL = os.environ.get('SONARA_WAN_MODEL', 'Wan-AI/Wan2.1-T2V-1.3B-Diffusers')
OUT = Path('/kaggle/working/sonara-wan21-video/outputs')
OUT.mkdir(parents=True, exist_ok=True)
EXTREME_MODE = str(os.environ.get('SONARA_WAN_EXTREME_MODE', 'true')).strip().lower() not in {'0', 'false', 'no', 'off'}
WARMUP = str(os.environ.get('SONARA_WAN_WARMUP', 'true')).strip().lower() not in {'0', 'false', 'no', 'off'}
FAST_STEPS = max(6, min(12, int(os.environ.get('SONARA_WAN_FAST_STEPS', '8'))))
FAST_WIDTH = 576
FAST_HEIGHT = 320
HQ_WIDTH = 624
HQ_HEIGHT = 352
OUTPUT_FPS = 8
MAX_FRAMES = 65
FLOW_SHIFT = 2.5 if EXTREME_MODE else 3.0
GUIDANCE_SCALE = 1.0 if EXTREME_MODE else 4.25
MAX_SEQUENCE_LENGTH = 192 if EXTREME_MODE else 256
PROFILE = 'extreme-cache-t4-v5' if EXTREME_MODE else 'turbo-hq-cache-t4-v5'
NEGATIVE_PROMPT = None if EXTREME_MODE else 'low quality, blurry, watermark, text, logo, deformed, duplicate, static frame, flicker, oversaturated'

# T4 inference profile
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

app = FastAPI(title='SONARA WAN Video Worker V5')
pipe = None
pipe_device_mode = 'not-loaded'
pipe_loading = False
pipe_warmed = False
cache_enabled = False
cache_error = ''
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


def enable_pipeline_cache(candidate):
    global cache_enabled, cache_error
    if cache_dit is None or BasicCacheConfig is None:
        cache_error = 'cache-dit unavailable'
        return
    try:
        cache_dit.enable_cache(
            candidate,
            cache_config=BasicCacheConfig(
                max_warmup_steps=1,
                max_cached_steps=-1,
                Fn_compute_blocks=4,
                Bn_compute_blocks=0,
                residual_diff_threshold=0.12,
                enable_separate_cfg=not EXTREME_MODE,
            ),
        )
        cache_enabled = True
        cache_error = ''
    except Exception as exc:
        cache_enabled = False
        cache_error = str(exc)
        print(f'[SONARA WAN V5] CacheDiT disabled: {exc}', flush=True)


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
            candidate.scheduler = UniPCMultistepScheduler.from_config(candidate.scheduler.config, flow_shift=FLOW_SHIFT)
            candidate.vae.enable_tiling()
            candidate.transformer.eval()
            candidate.text_encoder.eval()
            candidate.vae.eval()
            enable_pipeline_cache(candidate)

            try:
                candidate.to('cuda')
                pipe_device_mode = 'full-cuda-extreme'
            except RuntimeError as exc:
                if 'out of memory' not in str(exc).lower():
                    raise
                try:
                    candidate.to('cpu')
                except Exception:
                    pass
                torch.cuda.empty_cache()
                candidate.enable_model_cpu_offload()
                pipe_device_mode = 'model-offload-fallback'

            pipe = candidate
            return pipe
        finally:
            pipe_loading = False


def warm_pipe():
    global pipe_warmed
    try:
        p = load_pipe()
        if WARMUP:
            generator = torch.Generator(device='cuda').manual_seed(777)
            kwargs = dict(
                prompt='cinematic natural motion, premium lighting',
                height=144,
                width=256,
                num_frames=17,
                guidance_scale=GUIDANCE_SCALE,
                num_inference_steps=2,
                generator=generator,
                max_sequence_length=128,
            )
            if NEGATIVE_PROMPT is not None:
                kwargs['negative_prompt'] = NEGATIVE_PROMPT
            with pipe_lock, torch.inference_mode():
                p(**kwargs)
            try:
                torch.cuda.synchronize()
            except Exception:
                pass
        pipe_warmed = True
        print('[SONARA WAN V5] warm-up complete.', flush=True)
    except Exception as exc:
        print(f'[SONARA WAN V5] warmup failed; first request will retry: {exc}', flush=True)


def set_job(job_id, **values):
    with jobs_lock:
        current = dict(jobs.get(job_id, {}))
        current.update(values)
        jobs[job_id] = current


def render(job_id, req):
    try:
        set_job(job_id, status='PROCESSING', progress=5, stage='WAN 2.1 Extreme: preparazione GPU')
        p = load_pipe()
        portrait = req.aspectRatio == '9:16'
        width, height = ((FAST_HEIGHT, FAST_WIDTH) if portrait else (FAST_WIDTH, FAST_HEIGHT)) if EXTREME_MODE else ((HQ_HEIGHT, HQ_WIDTH) if portrait else (HQ_WIDTH, HQ_HEIGHT))
        steps = FAST_STEPS
        num_frames = frames_for_duration(req.durationSeconds)
        seed = req.seed if req.seed is not None else int.from_bytes(os.urandom(4), 'big')
        generator = torch.Generator(device='cuda').manual_seed(seed)

        set_job(job_id, progress=12, stage=f'WAN Extreme - {steps} step / {num_frames} frame', seed=seed, profile=PROFILE, steps=steps, frames=num_frames, resolution=f'{width}x{height}')

        def progress_callback(_pipeline, step_index, _timestep, callback_kwargs):
            pct = 16 + int(((step_index + 1) / max(1, steps)) * 70)
            set_job(job_id, progress=min(86, pct), stage=f'WAN Extreme - step {step_index + 1}/{steps}')
            return callback_kwargs

        kwargs = dict(
            prompt=req.prompt,
            height=height,
            width=width,
            num_frames=num_frames,
            guidance_scale=GUIDANCE_SCALE,
            num_inference_steps=steps,
            generator=generator,
            max_sequence_length=MAX_SEQUENCE_LENGTH,
            callback_on_step_end=progress_callback,
        )
        if NEGATIVE_PROMPT is not None:
            kwargs['negative_prompt'] = NEGATIVE_PROMPT

        with pipe_lock, torch.inference_mode():
            result = p(**kwargs)

        set_job(job_id, progress=90, stage='Codifica MP4 Extreme')
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
            cacheEnabled=cache_enabled,
            cacheError=cache_error,
            warmed=pipe_warmed,
            steps=steps,
            frames=num_frames,
            resolution=f'{width}x{height}',
            fps=OUTPUT_FPS,
            clipSeconds=round(num_frames / OUTPUT_FPS, 2),
            guidanceScale=GUIDANCE_SCALE,
            videoPath=f'/v1/video/file/{path.name}',
        )
    except Exception as exc:
        set_job(job_id, status='FAILED', progress=0, stage='Errore WAN Extreme', error=str(exc))


@app.get('/health')
def health():
    width, height = (FAST_WIDTH, FAST_HEIGHT) if EXTREME_MODE else (HQ_WIDTH, HQ_HEIGHT)
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
        'cacheEnabled': cache_enabled,
        'cacheError': cache_error,
        'jobs': len(jobs),
        'profile': PROFILE,
        'extremeMode': EXTREME_MODE,
        'steps': FAST_STEPS,
        'resolution': f'{width}x{height}',
        'maxFrames': MAX_FRAMES,
        'fps': OUTPUT_FPS,
        'maxClipSeconds': round(MAX_FRAMES / OUTPUT_FPS, 2),
        'flowShift': FLOW_SHIFT,
        'guidanceScale': GUIDANCE_SCALE,
        'cfgPasses': 1 if EXTREME_MODE else 2,
    }


@app.post('/v1/video/generate', status_code=202)
def generate(req: GenerateRequest):
    if req.durationSeconds > 8:
        raise HTTPException(status_code=400, detail='WAN Kaggle worker supports clips up to 8 seconds per scene.')
    job_id = 'wan_' + uuid.uuid4().hex
    set_job(job_id, jobId=job_id, status='PROCESSING', progress=2, stage='In coda su SONARA WAN Extreme', provider='kaggle-wan21', model=MODEL, profile=PROFILE)
    threading.Thread(target=render, args=(job_id, req), daemon=True).start()
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


def ensure_runtime():
    packages = []
    try:
        import cache_dit  # noqa: F401
    except Exception:
        packages.append('cache-dit')
    for module, package in [('diffusers', 'diffusers>=0.35.1'), ('transformers', 'transformers>=4.49.0'), ('accelerate', 'accelerate>=1.2.1'), ('fastapi', 'fastapi>=0.115.0'), ('uvicorn', 'uvicorn[standard]>=0.32.0'), ('imageio_ffmpeg', 'imageio[ffmpeg]>=2.36.0')]:
        try:
            __import__(module)
        except Exception:
            packages.append(package)
    if packages:
        print('Installing missing WAN V5 runtime:', ', '.join(packages), flush=True)
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', *packages], check=True)
    else:
        print('WAN V5 runtime already available.', flush=True)


def main():
    print('=' * 92)
    print(' SONARA VIDEO AI - WAN 2.1 EXTREME CACHE T4 V5 / GPU1 / ZERO GOOGLE BILLING ')
    print('=' * 92)
    subprocess.run(['nvidia-smi', '-L'], check=True)
    WORKDIR.mkdir(parents=True, exist_ok=True)
    (WORKDIR / 'outputs').mkdir(parents=True, exist_ok=True)
    ensure_runtime()
    APP.write_text(APP_CODE, encoding='utf-8')
    stop_gpu1_worker()

    env = os.environ.copy()
    env.update({
        'CUDA_VISIBLE_DEVICES': GPU,
        'SONARA_WAN_MODEL': MODEL,
        'SONARA_WAN_EXTREME_MODE': 'true',
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
    print(f'WAN Extreme Cache V5 worker PID {proc.pid} on GPU1 port {PORT}')
    print('Worker loading/warmup continues in background. Existing Cloudflare tunnel on 7861 is preserved.')


if __name__ == '__main__':
    main()
