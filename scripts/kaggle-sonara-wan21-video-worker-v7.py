import subprocess
import sys
import urllib.request
from pathlib import Path

SOURCE = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/kaggle-sonara-wan21-video-worker-v6.py'
TARGET = Path('/kaggle/working/wan-v7-runtime.py')

source = urllib.request.urlopen(SOURCE, timeout=30).read().decode('utf-8')

replacements = [
    ("import os\nimport threading\n", "import os\nimport subprocess\nimport threading\n"),
    ("STEPS = int(os.environ.get('SONARA_WAN_STEPS', '6'))", "STEPS = int(os.environ.get('SONARA_WAN_STEPS', '8'))"),
    ("FLOW_SHIFT = 2.2", "FLOW_SHIFT = 2.8"),
    ("GUIDANCE_SCALE = 1.0", "GUIDANCE_SCALE = 3.0"),
    ("PROFILE = 'extreme-resident-t4-v6'", "PROFILE = 'fast-visible-audio-t4-v7'\nNEGATIVE_PROMPT = 'black frame, blank frame, darkness, underexposed, low quality, blurry, watermark, text, logo, deformed, duplicate, static frame, flicker'"),
    ("app = FastAPI(title='SONARA WAN Extreme Resident V6')", "app = FastAPI(title='SONARA WAN Fast Visible Audio V7')"),
    ("residual_diff_threshold=0.16,\n                enable_separate_cfg=False,", "residual_diff_threshold=0.08,\n                enable_separate_cfg=True,"),
    ("print(f'[SONARA WAN V6] CacheDiT unavailable: {exc}', flush=True)", "print(f'[SONARA WAN V7] CacheDiT unavailable: {exc}', flush=True)"),
    ("print('[SONARA WAN V6] Loading UMT5 text encoder in 4-bit on T4...', flush=True)", "print('[SONARA WAN V7] Loading UMT5 text encoder in 4-bit on T4...', flush=True)"),
    ("print('[SONARA WAN V6] Loading VAE + WAN transformer...', flush=True)", "print('[SONARA WAN V7] Loading VAE + WAN transformer...', flush=True)"),
    ("# Critical V6 placement: the iterative denoiser never leaves GPU.", "# V7: iterative denoiser stays resident on GPU."),
    ("raise RuntimeError('V6 resident GPU placement failed: ' + str(exc))", "raise RuntimeError('V7 resident GPU placement failed: ' + str(exc))"),
    ("print('[SONARA WAN V6] Resident GPU placement active.', gpu_memory_mb(), flush=True)", "print('[SONARA WAN V7] Resident GPU placement active.', gpu_memory_mb(), flush=True)"),
    ("prompt='cinematic natural motion, premium lighting',\n                height=144,", "prompt='bright cinematic scene, clearly visible subject, natural motion, premium lighting',\n                negative_prompt=NEGATIVE_PROMPT,\n                height=144,"),
    ("print('[SONARA WAN V6] Warm-up complete.', gpu_memory_mb(), flush=True)", "print('[SONARA WAN V7] Warm-up complete.', gpu_memory_mb(), flush=True)"),
    ("print(f'[SONARA WAN V6] warm-up failed: {exc}', flush=True)", "print(f'[SONARA WAN V7] warm-up failed: {exc}', flush=True)"),
    ("stage='WAN V6: GPU residente'", "stage='WAN V7: GPU residente'"),
    ("stage=f'WAN V6 - {STEPS} step / {num_frames} frame'", "stage=f'WAN V7 - {STEPS} step / {num_frames} frame'"),
    ("stage=f'WAN V6 - step {step_index + 1}/{STEPS}'", "stage=f'WAN V7 - step {step_index + 1}/{STEPS}'"),
    ("prompt=req.prompt,\n                height=height,", "prompt=req.prompt,\n                negative_prompt=NEGATIVE_PROMPT,\n                height=height,"),
    ("set_job(job_id, status='FAILED', progress=0, stage='Errore WAN V6', error=str(exc))", "set_job(job_id, status='FAILED', progress=0, stage='Errore WAN V7', error=str(exc))"),
    ("'cfgPasses': 1,", "'cfgPasses': 2,\n        'videoCodec': 'h264-yuv420p-faststart',\n        'audioCodec': 'aac',\n        'audioMode': 'sonara-cinematic-bed-v1',"),
    ("stage='In coda su SONARA WAN V6'", "stage='In coda su SONARA WAN V7'"),
    ("return FileResponse(path, media_type='video/mp4', filename=path.name)", "return FileResponse(path, media_type='video/mp4', filename=path.name, headers={'Content-Disposition': f'inline; filename=\\\"{path.name}\\\"', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes'})"),
    ("SONARA VIDEO AI - WAN EXTREME RESIDENT T4 V6 / GPU1 / ZERO GOOGLE BILLING", "SONARA VIDEO AI - WAN FAST VISIBLE + AUDIO V7 / GPU1 / ZERO GOOGLE BILLING"),
    ("'SONARA_WAN_STEPS': '6',", "'SONARA_WAN_STEPS': '8',"),
    ("print(f'WAN V6 PID {proc.pid} on GPU1/7861. Existing Cloudflare tunnel preserved.')", "print(f'WAN V7 PID {proc.pid} on GPU1/7861. Existing Cloudflare tunnel preserved.')"),
    ("print('V6 target: resident transformer + VAE on T4, 4-bit UMT5, CacheDiT, 6 steps, 49 frames @ 6 fps.')", "print('V7 target: visible WAN frames + H264/yuv420p faststart + AAC audio, resident GPU, CacheDiT, 8 steps.')"),
]

for old, new in replacements:
    if old not in source:
        raise RuntimeError(f'V7 patch anchor not found: {old[:90]!r}')
    source = source.replace(old, new, 1)

old_encode = """        set_job(job_id, progress=92, stage='Codifica MP4')
        path = OUT / f'{job_id}.mp4'
        export_to_video(result.frames[0], str(path), fps=OUTPUT_FPS)
        payload = gpu_memory_mb()
        set_job(job_id, status='COMPLETED', progress=100, stage='Video pronto', provider='kaggle-wan21', model=MODEL, profile=PROFILE, deviceMode=pipe_device_mode, cacheEnabled=cache_enabled, steps=STEPS, frames=num_frames, resolution=f'{width}x{height}', fps=OUTPUT_FPS, clipSeconds=round(num_frames / OUTPUT_FPS, 2), guidanceScale=GUIDANCE_SCALE, videoPath=f'/v1/video/file/{path.name}', **payload)
"""

new_encode = """        set_job(job_id, progress=88, stage='Codifica video compatibile browser')
        duration = num_frames / OUTPUT_FPS
        raw_path = OUT / f'{job_id}.raw.mp4'
        path = OUT / f'{job_id}.mp4'
        export_to_video(result.frames[0], str(raw_path), fps=OUTPUT_FPS)

        set_job(job_id, progress=94, stage='Aggiungo audio AAC e fast-start')
        roots = [55.0, 65.41, 73.42, 82.41, 98.0]
        root = roots[seed % len(roots)]
        third = root * (1.1892 if seed % 2 else 1.2599)
        fifth = root * 1.4983
        fade_out = max(0.0, duration - 0.7)
        audio_filter = (
            f'[1:a]volume=0.14,afade=t=in:st=0:d=0.4,afade=t=out:st={fade_out}:d=0.7[a1];'
            f'[2:a]volume=0.07,afade=t=in:st=0:d=0.6,afade=t=out:st={fade_out}:d=0.7[a2];'
            f'[3:a]volume=0.05,afade=t=in:st=0:d=0.8,afade=t=out:st={fade_out}:d=0.7[a3];'
            '[a1][a2][a3]amix=inputs=3:duration=shortest:normalize=0[aout]'
        )
        subprocess.run([
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-i', str(raw_path),
            '-f', 'lavfi', '-i', f'sine=frequency={root}:sample_rate=48000:duration={duration}',
            '-f', 'lavfi', '-i', f'sine=frequency={third}:sample_rate=48000:duration={duration}',
            '-f', 'lavfi', '-i', f'sine=frequency={fifth}:sample_rate=48000:duration={duration}',
            '-filter_complex', audio_filter,
            '-map', '0:v:0', '-map', '[aout]',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
            '-profile:v', 'high', '-level', '4.0', '-movflags', '+faststart',
            '-c:a', 'aac', '-b:a', '128k', '-ar', '48000', '-ac', '2', '-shortest', str(path)
        ], check=True, timeout=180)
        try:
            raw_path.unlink(missing_ok=True)
        except Exception:
            pass

        payload = gpu_memory_mb()
        set_job(job_id, status='COMPLETED', progress=100, stage='Video + audio pronti', provider='kaggle-wan21', model=MODEL, profile=PROFILE, deviceMode=pipe_device_mode, cacheEnabled=cache_enabled, steps=STEPS, frames=num_frames, resolution=f'{width}x{height}', fps=OUTPUT_FPS, clipSeconds=round(duration, 2), guidanceScale=GUIDANCE_SCALE, videoCodec='h264-yuv420p-faststart', audioCodec='aac', audioMode='sonara-cinematic-bed-v1', videoPath=f'/v1/video/file/{path.name}', **payload)
"""

if old_encode not in source:
    raise RuntimeError('V7 encode patch anchor not found')
source = source.replace(old_encode, new_encode, 1)

if subprocess.run(['bash', '-lc', 'command -v ffmpeg >/dev/null 2>&1']).returncode != 0:
    raise RuntimeError('ffmpeg non disponibile nel runtime Kaggle.')

TARGET.write_text(source, encoding='utf-8')
subprocess.run([sys.executable, '-m', 'py_compile', str(TARGET)], check=True)
print('SONARA WAN V7 patch pronta: visible output + browser-safe MP4 + AAC audio.')
subprocess.run([sys.executable, str(TARGET)], check=True)
