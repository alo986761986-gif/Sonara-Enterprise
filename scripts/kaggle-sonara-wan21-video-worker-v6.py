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
from transformers import BitsAndBytesConfig, UMT5EncoderModel

try:
    import cache_dit
    from cache_dit import BasicCacheConfig
except Exception:
    cache_dit = None
    BasicCacheConfig = None

MODEL = os.environ.get('SONARA_WAN_MODEL', 'Wan-AI/Wan2.1-T2V-1.3B-Diffusers')
OUT = Path('/kaggle/working/sonara-wan21-video/outputs')
OUT.mkdir(parents=True, exist_ok=True)
STEPS = int(os.environ.get('SONARA_WAN_STEPS', '6'))
WIDTH = 544
HEIGHT = 304
OUTPUT_FPS = 6
MAX_FRAMES = 49
FLOW_SHIFT = 2.2
GUIDANCE_SCALE = 1.0
MAX_SEQUENCE_LENGTH = 192
PROFILE = 'extreme-resident-t4-v6'

torch.set_grad_enabled(False)
torch.backends.cudnn.benchmark = True
try:
    torch.backends.cuda.enable_mem_efficient_sdp(True)
    torch.backends.cuda.enable_math_sdp(True)
except Exception:
    pass

app = FastAPI(title='SONARA WAN Extreme Resident V6')
pipe = None
pipe_loading = False
pipe_warmed = False
pipe_device_mode = 'not-loaded'
cache_enabled = False
cache_error = ''
placement_error = ''
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
    target = min(MAX_FRAMES, max(13, int(round(seconds * OUTPUT_FPS)) + 1))
    return max(13, min(MAX_FRAMES, ((target - 1) // 4) * 4 + 1))


def gpu_memory_mb():
    try:
        free, total = torch.cuda.mem_get_info()
        return {
            'gpuUsedMB': round((total - free) / 1024 / 1024),
            'gpuFreeMB': round(free / 1024 / 1024),
            'gpuTotalMB': round(total / 1024 / 1024),
        }
    except Exception:
        return {}


def enable_cache(candidate):
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
                residual_diff_threshold=0.16,
                enable_separate_cfg=False,
            ),
        )
        cache_enabled = True
        cache_error = ''
    except Exception as exc:
        cache_enabled = False
        cache_error = str(exc)
        print(f'[SONARA WAN V6] CacheDiT unavailable: {exc}', flush=True)


def load_pipe():
    global pipe, pipe_loading, pipe_device_mode, placement_error
    if pipe is not None:
        return pipe
    with pipe_lock:
        if pipe is not None:
            return pipe
        pipe_loading = True
        try:
            print('[SONARA WAN V6] Loading UMT5 text encoder in 4-bit on T4...', flush=True)
            quant = BitsAndBytesConfig(
                load_in_4bit=True,
                bnb_4bit_quant_type='nf4',
                bnb_4bit_use_double_quant=True,
                bnb_4bit_compute_dtype=torch.float16,
            )
            text_encoder = UMT5EncoderModel.from_pretrained(
                MODEL,
                subfolder='text_encoder',
                quantization_config=quant,
                dtype=torch.float16,
                device_map={'': 0},
            )
            print('[SONARA WAN V6] Loading VAE + WAN transformer...', flush=True)
            vae = AutoencoderKLWan.from_pretrained(MODEL, subfolder='vae', dtype=torch.float32)
            candidate = WanPipeline.from_pretrained(
                MODEL,
                text_encoder=text_encoder,
                vae=vae,
                dtype=torch.float16,
            )
            candidate.scheduler = UniPCMultistepScheduler.from_config(candidate.scheduler.config, flow_shift=FLOW_SHIFT)
            candidate.vae.enable_tiling()
            candidate.transformer.eval()
            candidate.text_encoder.eval()
            candidate.vae.eval()
            enable_cache(candidate)

            try:
                # Critical V6 placement: the iterative denoiser never leaves GPU.
                candidate.transformer.to(device='cuda', dtype=torch.float16)
                candidate.vae.to(device='cuda', dtype=torch.float32)
                torch.cuda.empty_cache()
                pipe_device_mode = 'resident-transformer-gpu'
                placement_error = ''
            except Exception as exc:
                placement_error = str(exc)
                raise RuntimeError('V6 resident GPU placement failed: ' + str(exc))

            pipe = candidate
            print('[SONARA WAN V6] Resident GPU placement active.', gpu_memory_mb(), flush=True)
            return pipe
        finally:
            pipe_loading = False


def warm_pipe():
    global pipe_warmed
    try:
        p = load_pipe()
        generator = torch.Generator(device='cuda').manual_seed(777)
        with pipe_lock, torch.inference_mode():
            p(
                prompt='cinematic natural motion, premium lighting',
                height=144,
                width=256,
                num_frames=13,
                guidance_scale=GUIDANCE_SCALE,
                num_inference_steps=2,
                generator=generator,
                max_sequence_length=128,
            )
        torch.cuda.synchronize()
        pipe_warmed = True
        print('[SONARA WAN V6] Warm-up complete.', gpu_memory_mb(), flush=True)
    except Exception as exc:
        print(f'[SONARA WAN V6] warm-up failed: {exc}', flush=True)


def set_job(job_id, **values):
    with jobs_lock:
        current = dict(jobs.get(job_id, {}))
        current.update(values)
        jobs[job_id] = current


def render(job_id, req):
    try:
        set_job(job_id, status='PROCESSING', progress=5, stage='WAN V6: GPU residente')
        p = load_pipe()
        portrait = req.aspectRatio == '9:16'
        width, height = (HEIGHT, WIDTH) if portrait else (WIDTH, HEIGHT)
        num_frames = frames_for_duration(req.durationSeconds)
        seed = req.seed if req.seed is not None else int.from_bytes(os.urandom(4), 'big')
        generator = torch.Generator(device='cuda').manual_seed(seed)
        set_job(job_id, progress=12, stage=f'WAN V6 - {STEPS} step / {num_frames} frame', seed=seed, profile=PROFILE, steps=STEPS, frames=num_frames, resolution=f'{width}x{height}')

        def cb(_pipeline, step_index, _timestep, callback_kwargs):
            set_job(job_id, progress=min(88, 16 + int(((step_index + 1) / max(1, STEPS)) * 72)), stage=f'WAN V6 - step {step_index + 1}/{STEPS}')
            return callback_kwargs

        with pipe_lock, torch.inference_mode():
            result = p(
                prompt=req.prompt,
                height=height,
                width=width,
                num_frames=num_frames,
                guidance_scale=GUIDANCE_SCALE,
                num_inference_steps=STEPS,
                generator=generator,
                max_sequence_length=MAX_SEQUENCE_LENGTH,
                callback_on_step_end=cb,
            )
        set_job(job_id, progress=92, stage='Codifica MP4')
        path = OUT / f'{job_id}.mp4'
        export_to_video(result.frames[0], str(path), fps=OUTPUT_FPS)
        payload = gpu_memory_mb()
        set_job(job_id, status='COMPLETED', progress=100, stage='Video pronto', provider='kaggle-wan21', model=MODEL, profile=PROFILE, deviceMode=pipe_device_mode, cacheEnabled=cache_enabled, steps=STEPS, frames=num_frames, resolution=f'{width}x{height}', fps=OUTPUT_FPS, clipSeconds=round(num_frames / OUTPUT_FPS, 2), guidanceScale=GUIDANCE_SCALE, videoPath=f'/v1/video/file/{path.name}', **payload)
    except Exception as exc:
        set_job(job_id, status='FAILED', progress=0, stage='Errore WAN V6', error=str(exc))


@app.get('/health')
def health():
    data = {
        'status': 'ok',
        'provider': 'kaggle-wan21',
        'model': MODEL,
        'gpu': os.environ.get('CUDA_VISIBLE_DEVICES', '1'),
        'loaded': pipe is not None,
        'loading': pipe_loading,
        'warmed': pipe_warmed,
        'ready': pipe is not None and pipe_warmed,
        'deviceMode': pipe_device_mode,
        'cacheEnabled': cache_enabled,
        'cacheError': cache_error,
        'placementError': placement_error,
        'jobs': len(jobs),
        'profile': PROFILE,
        'steps': STEPS,
        'resolution': f'{WIDTH}x{HEIGHT}',
        'maxFrames': MAX_FRAMES,
        'fps': OUTPUT_FPS,
        'maxClipSeconds': round(MAX_FRAMES / OUTPUT_FPS, 2),
        'flowShift': FLOW_SHIFT,
        'guidanceScale': GUIDANCE_SCALE,
        'cfgPasses': 1,
        'textEncoderQuantization': '4bit-nf4',
        'denoiserResident': pipe_device_mode == 'resident-transformer-gpu',
    }
    data.update(gpu_memory_mb())
    return data


@app.post('/v1/video/generate', status_code=202)
def generate(req: GenerateRequest):
    if req.durationSeconds > 8:
        raise HTTPException(status_code=400, detail='WAN Kaggle worker supports clips up to 8 seconds per scene.')
    job_id = 'wan_' + uuid.uuid4().hex
    set_job(job_id, jobId=job_id, status='PROCESSING', progress=2, stage='In coda su SONARA WAN V6', provider='kaggle-wan21', model=MODEL, profile=PROFILE)
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
    path = OUT / Path(name).name
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
    required = [('bitsandbytes', 'bitsandbytes>=0.46.1'), ('cache_dit', 'cache-dit'), ('diffusers', 'diffusers>=0.35.1'), ('transformers', 'transformers>=4.49.0'), ('accelerate', 'accelerate>=1.2.1'), ('fastapi', 'fastapi>=0.115.0'), ('uvicorn', 'uvicorn[standard]>=0.32.0'), ('imageio_ffmpeg', 'imageio[ffmpeg]>=2.36.0')]
    packages = []
    for module, package in required:
        try:
            __import__(module)
        except Exception:
            packages.append(package)
    if packages:
        subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', *packages], check=True)


def main():
    print('=' * 92)
    print(' SONARA VIDEO AI - WAN EXTREME RESIDENT T4 V6 / GPU1 / ZERO GOOGLE BILLING ')
    print('=' * 92)
    subprocess.run(['nvidia-smi', '-L'], check=True)
    ensure_runtime()
    WORKDIR.mkdir(parents=True, exist_ok=True)
    (WORKDIR / 'outputs').mkdir(parents=True, exist_ok=True)
    APP.write_text(APP_CODE, encoding='utf-8')
    stop_gpu1_worker()

    env = os.environ.copy()
    env.update({
        'CUDA_VISIBLE_DEVICES': GPU,
        'SONARA_WAN_MODEL': MODEL,
        'SONARA_WAN_STEPS': '6',
        'HF_XET_HIGH_PERFORMANCE': '1',
        'PYTORCH_CUDA_ALLOC_CONF': 'expandable_segments:True',
        'CUDA_MODULE_LOADING': 'LAZY',
        'TOKENIZERS_PARALLELISM': 'false',
        'OMP_NUM_THREADS': '4',
        'MKL_NUM_THREADS': '4',
    })
    env.pop('HF_HUB_ENABLE_HF_TRANSFER', None)

    log = open(LOG, 'w', buffering=1)
    proc = subprocess.Popen(
        [sys.executable, '-m', 'uvicorn', 'app:app', '--host', '0.0.0.0', '--port', str(PORT), '--workers', '1'],
        cwd=str(WORKDIR),
        env=env,
        stdout=log,
        stderr=subprocess.STDOUT,
        start_new_session=True,
    )
    print(f'WAN V6 PID {proc.pid} on GPU1/7861. Existing Cloudflare tunnel preserved.')
    print('V6 target: resident transformer + VAE on T4, 4-bit UMT5, CacheDiT, 6 steps, 49 frames @ 6 fps.')


if __name__ == '__main__':
    main()
