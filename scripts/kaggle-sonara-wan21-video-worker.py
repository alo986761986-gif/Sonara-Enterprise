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

app = FastAPI(title='SONARA WAN Video Worker')
pipe = None

class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=8, max_length=5000)
    aspectRatio: str = '16:9'
    durationSeconds: int = 8
    seed: int | None = None


def load_pipe():
    global pipe
    if pipe is not None:
        return pipe
    dtype = torch.float16
    vae = AutoencoderKLWan.from_pretrained(MODEL, subfolder='vae', torch_dtype=torch.float32)
    pipe = WanPipeline.from_pretrained(MODEL, vae=vae, torch_dtype=dtype)
    pipe.enable_model_cpu_offload()
    pipe.vae.enable_tiling()
    return pipe

@app.get('/health')
def health():
    return {
        'status': 'ok',
        'provider': 'kaggle-wan21',
        'model': MODEL,
        'gpu': os.environ.get('CUDA_VISIBLE_DEVICES', '1'),
        'loaded': pipe is not None,
    }

@app.post('/v1/video/generate')
def generate(req: GenerateRequest):
    if req.durationSeconds > 8:
        raise HTTPException(status_code=400, detail='WAN Kaggle worker supports clips up to 8 seconds per scene.')
    p = load_pipe()
    portrait = req.aspectRatio == '9:16'
    width, height = (480, 832) if portrait else (832, 480)
    fps = 16
    num_frames = 81
    seed = req.seed if req.seed is not None else int.from_bytes(os.urandom(4), 'big')
    generator = torch.Generator(device='cuda').manual_seed(seed)
    result = p(
        prompt=req.prompt,
        negative_prompt='low quality, blurry, watermark, text, logo, deformed, duplicate, static frame',
        height=height,
        width=width,
        num_frames=num_frames,
        guidance_scale=5.0,
        num_inference_steps=28,
        generator=generator,
    )
    path = OUT / f'{uuid.uuid4().hex}.mp4'
    export_to_video(result.frames[0], str(path), fps=fps)
    return {
        'status': 'COMPLETED',
        'provider': 'kaggle-wan21',
        'model': MODEL,
        'seed': seed,
        'videoPath': f'/v1/video/file/{path.name}',
    }

@app.get('/v1/video/file/{name}')
def video_file(name: str):
    safe = Path(name).name
    path = OUT / safe
    if not path.exists() or path.suffix.lower() != '.mp4':
        raise HTTPException(status_code=404, detail='Video not found')
    return FileResponse(path, media_type='video/mp4', filename=path.name)
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
    ]
    subprocess.run([sys.executable, '-m', 'pip', 'install', '-q', '--upgrade', *packages], check=True)


def main():
    print('=' * 72)
    print(' SONARA VIDEO AI - WAN 2.1 1.3B / KAGGLE GPU1 / ZERO GOOGLE API COST ')
    print('=' * 72)
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
    print(f'WAN worker PID {proc.pid} on GPU1 port {PORT}')

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
                    print('SONARA WAN Video worker READY. Existing Cloudflare tunnel on GPU1/7861 can be reused.')
                    return
        except Exception:
            pass
        time.sleep(3)
    raise RuntimeError('WAN worker health timeout. Log tail:\n' + LOG.read_text(errors='ignore')[-8000:])


if __name__ == '__main__':
    main()
