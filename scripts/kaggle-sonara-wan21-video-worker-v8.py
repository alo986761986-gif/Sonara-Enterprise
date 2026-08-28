import subprocess
import sys
import urllib.request
from pathlib import Path

SOURCE = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/kaggle-sonara-wan21-video-worker-v6.py'
TARGET = Path('/kaggle/working/wan-v8-runtime.py')

source = urllib.request.urlopen(SOURCE, timeout=30).read().decode('utf-8')

replacements = [
    ("import os\nimport threading\n", "import json\nimport os\nimport subprocess\nimport threading\n"),
    ("STEPS = int(os.environ.get('SONARA_WAN_STEPS', '6'))", "STEPS = int(os.environ.get('SONARA_WAN_STEPS', '8'))"),
    ("FLOW_SHIFT = 2.2", "FLOW_SHIFT = 2.8"),
    ("GUIDANCE_SCALE = 1.0", "GUIDANCE_SCALE = 3.2"),
    ("PROFILE = 'extreme-resident-t4-v6'", "PROFILE = 'smooth-hq-audio-t4-v8'\nOUTPUT_PLAYBACK_FPS = 24\nAUDIO_BITRATE = '256k'\nAUDIO_LOUDNESS_LUFS = -16\nMOTION_PREFIX = 'real-time natural motion at normal speed, fluid continuous movement, realistic temporal motion, no slow motion, no frozen motion, '\nNEGATIVE_PROMPT = 'slow motion, frozen motion, static frame, repeated frame, black frame, blank frame, darkness, underexposed, low quality, blurry, watermark, text, logo, deformed, duplicate, flicker'"),
    ("app = FastAPI(title='SONARA WAN Extreme Resident V6')", "app = FastAPI(title='SONARA WAN Smooth HQ Audio V8')"),
    ("residual_diff_threshold=0.16,\n                enable_separate_cfg=False,", "residual_diff_threshold=0.07,\n                enable_separate_cfg=True,"),
    ("print(f'[SONARA WAN V6] CacheDiT unavailable: {exc}', flush=True)", "print(f'[SONARA WAN V8] CacheDiT unavailable: {exc}', flush=True)"),
    ("print('[SONARA WAN V6] Loading UMT5 text encoder in 4-bit on T4...', flush=True)", "print('[SONARA WAN V8] Loading UMT5 text encoder in 4-bit on T4...', flush=True)"),
    ("print('[SONARA WAN V6] Loading VAE + WAN transformer...', flush=True)", "print('[SONARA WAN V8] Loading VAE + WAN transformer...', flush=True)"),
    ("# Critical V6 placement: the iterative denoiser never leaves GPU.", "# V8: iterative denoiser remains resident on the T4."),
    ("raise RuntimeError('V6 resident GPU placement failed: ' + str(exc))", "raise RuntimeError('V8 resident GPU placement failed: ' + str(exc))"),
    ("print('[SONARA WAN V6] Resident GPU placement active.', gpu_memory_mb(), flush=True)", "print('[SONARA WAN V8] Resident GPU placement active.', gpu_memory_mb(), flush=True)"),
    ("prompt='cinematic natural motion, premium lighting',\n                height=144,", "prompt='real-time normal-speed cinematic movement, clearly visible subject, fluid motion, premium lighting',\n                negative_prompt=NEGATIVE_PROMPT,\n                height=144,"),
    ("print('[SONARA WAN V6] Warm-up complete.', gpu_memory_mb(), flush=True)", "print('[SONARA WAN V8] Warm-up complete.', gpu_memory_mb(), flush=True)"),
    ("print(f'[SONARA WAN V6] warm-up failed: {exc}', flush=True)", "print(f'[SONARA WAN V8] warm-up failed: {exc}', flush=True)"),
    ("stage='WAN V6: GPU residente'", "stage='WAN V8: GPU residente + motion HQ'"),
    ("stage=f'WAN V6 - {STEPS} step / {num_frames} frame'", "stage=f'WAN V8 - {STEPS} step / {num_frames} frame nativi'"),
    ("stage=f'WAN V6 - step {step_index + 1}/{STEPS}'", "stage=f'WAN V8 - step {step_index + 1}/{STEPS}'"),
    ("prompt=req.prompt,\n                height=height,", "prompt=MOTION_PREFIX + req.prompt,\n                negative_prompt=NEGATIVE_PROMPT,\n                height=height,"),
    ("set_job(job_id, status='FAILED', progress=0, stage='Errore WAN V6', error=str(exc))", "set_job(job_id, status='FAILED', progress=0, stage='Errore WAN V8', error=str(exc))"),
    ("'cfgPasses': 1,", "'cfgPasses': 2,\n        'nativeFps': OUTPUT_FPS,\n        'playbackFps': OUTPUT_PLAYBACK_FPS,\n        'videoCodec': 'h264-high-yuv420p-faststart',\n        'audioCodec': 'aac-256k',\n        'audioMode': 'sonara-cinematic-audible-v2',\n        'audioTargetLufs': AUDIO_LOUDNESS_LUFS,"),
    ("stage='In coda su SONARA WAN V6'", "stage='In coda su SONARA WAN V8'"),
    ("return FileResponse(path, media_type='video/mp4', filename=path.name)", "return FileResponse(path, media_type='video/mp4', filename=path.name, headers={'Content-Disposition': f'inline; filename=\\\"{path.name}\\\"', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes'})"),
    ("SONARA VIDEO AI - WAN EXTREME RESIDENT T4 V6 / GPU1 / ZERO GOOGLE BILLING", "SONARA VIDEO AI - WAN SMOOTH HQ + AUDIBLE AUDIO V8 / GPU1 / ZERO GOOGLE BILLING"),
    ("'SONARA_WAN_STEPS': '6',", "'SONARA_WAN_STEPS': '8',"),
    ("print(f'WAN V6 PID {proc.pid} on GPU1/7861. Existing Cloudflare tunnel preserved.')", "print(f'WAN V8 PID {proc.pid} on GPU1/7861. Existing Cloudflare tunnel preserved.')"),
    ("print('V6 target: resident transformer + VAE on T4, 4-bit UMT5, CacheDiT, 6 steps, 49 frames @ 6 fps.')", "print('V8 target: real-time motion, 24fps interpolated playback, 960x540/540x960 HQ output, AAC 256k loudness-normalized audio.')"),
]

for old, new in replacements:
    if old not in source:
        raise RuntimeError(f'V8 patch anchor not found: {old[:100]!r}')
    source = source.replace(old, new, 1)

old_encode = """        set_job(job_id, progress=92, stage='Codifica MP4')
        path = OUT / f'{job_id}.mp4'
        export_to_video(result.frames[0], str(path), fps=OUTPUT_FPS)
        payload = gpu_memory_mb()
        set_job(job_id, status='COMPLETED', progress=100, stage='Video pronto', provider='kaggle-wan21', model=MODEL, profile=PROFILE, deviceMode=pipe_device_mode, cacheEnabled=cache_enabled, steps=STEPS, frames=num_frames, resolution=f'{width}x{height}', fps=OUTPUT_FPS, clipSeconds=round(num_frames / OUTPUT_FPS, 2), guidanceScale=GUIDANCE_SCALE, videoPath=f'/v1/video/file/{path.name}', **payload)
"""

new_encode = """        set_job(job_id, progress=86, stage='Creo master video nativo')
        duration = num_frames / OUTPUT_FPS
        raw_path = OUT / f'{job_id}.raw.mp4'
        path = OUT / f'{job_id}.mp4'
        export_to_video(result.frames[0], str(raw_path), fps=OUTPUT_FPS)

        set_job(job_id, progress=91, stage='Fluidifico il movimento a 24 fps')
        out_w, out_h = (540, 960) if portrait else (960, 540)
        video_filter = (
            f'minterpolate=fps={OUTPUT_PLAYBACK_FPS}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1,'
            f'scale={out_w}:{out_h}:flags=lanczos:force_original_aspect_ratio=decrease,'
            f'pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2:black,'
            'eq=contrast=1.035:saturation=1.06:brightness=0.005'
        )

        set_job(job_id, progress=94, stage='Creo audio stereo udibile e normalizzato')
        roots = [220.00, 246.94, 261.63, 293.66, 329.63]
        root = roots[seed % len(roots)]
        third = root * (1.189207 if seed % 2 else 1.259921)
        fifth = root * 1.498307
        fade_out = max(0.0, duration - 0.65)
        audio_filter = (
            f'[1:a]volume=0.48,tremolo=f=2.0:d=0.35,afade=t=in:st=0:d=0.25,afade=t=out:st={fade_out}:d=0.65[a1];'
            f'[2:a]volume=0.30,tremolo=f=1.0:d=0.22,afade=t=in:st=0:d=0.35,afade=t=out:st={fade_out}:d=0.65[a2];'
            f'[3:a]volume=0.22,tremolo=f=0.5:d=0.18,afade=t=in:st=0:d=0.45,afade=t=out:st={fade_out}:d=0.65[a3];'
            '[4:a]highpass=f=120,lowpass=f=6500,volume=0.10[a4];'
            '[a1][a2][a3][a4]amix=inputs=4:duration=shortest:normalize=0,'
            'acompressor=threshold=-18dB:ratio=2.5:attack=15:release=160:makeup=3dB,'
            f'loudnorm=I={AUDIO_LOUDNESS_LUFS}:LRA=7:TP=-1.2[aout]'
        )

        subprocess.run([
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-i', str(raw_path),
            '-f', 'lavfi', '-i', f'sine=frequency={root}:sample_rate=48000:duration={duration}',
            '-f', 'lavfi', '-i', f'sine=frequency={third}:sample_rate=48000:duration={duration}',
            '-f', 'lavfi', '-i', f'sine=frequency={fifth}:sample_rate=48000:duration={duration}',
            '-f', 'lavfi', '-i', f'anoisesrc=color=pink:amplitude=0.15:sample_rate=48000:duration={duration}',
            '-filter_complex', f'[0:v]{video_filter}[vout];{audio_filter}',
            '-map', '[vout]', '-map', '[aout]',
            '-r', str(OUTPUT_PLAYBACK_FPS),
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
            '-profile:v', 'high', '-level', '4.1', '-movflags', '+faststart',
            '-c:a', 'aac', '-b:a', AUDIO_BITRATE, '-ar', '48000', '-ac', '2', '-shortest', str(path)
        ], check=True, timeout=300)

        set_job(job_id, progress=98, stage='Verifico video e audio finali')
        probe = subprocess.check_output([
            'ffprobe', '-v', 'error', '-show_entries',
            'stream=index,codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:format=duration,size',
            '-of', 'json', str(path)
        ], text=True, timeout=30)
        probe_data = json.loads(probe)
        streams = probe_data.get('streams') or []
        video_stream = next((s for s in streams if s.get('codec_type') == 'video'), None)
        audio_stream = next((s for s in streams if s.get('codec_type') == 'audio'), None)
        if not video_stream:
            raise RuntimeError('MP4 finale privo di stream video.')
        if not audio_stream:
            raise RuntimeError('MP4 finale privo di stream audio AAC.')
        if str(audio_stream.get('codec_name') or '').lower() != 'aac':
            raise RuntimeError(f'Codec audio finale non valido: {audio_stream.get("codec_name")}')

        try:
            raw_path.unlink(missing_ok=True)
        except Exception:
            pass

        payload = gpu_memory_mb()
        set_job(job_id, status='COMPLETED', progress=100, stage='Video HQ 24fps + audio AAC pronti', provider='kaggle-wan21', model=MODEL, profile=PROFILE, deviceMode=pipe_device_mode, cacheEnabled=cache_enabled, steps=STEPS, frames=num_frames, nativeResolution=f'{width}x{height}', resolution=f'{out_w}x{out_h}', nativeFps=OUTPUT_FPS, fps=OUTPUT_PLAYBACK_FPS, clipSeconds=round(duration, 2), guidanceScale=GUIDANCE_SCALE, videoCodec='h264-high-yuv420p-faststart', audioCodec='aac-256k', audioMode='sonara-cinematic-audible-v2', audioTargetLufs=AUDIO_LOUDNESS_LUFS, audioVerified=True, videoVerified=True, videoPath=f'/v1/video/file/{path.name}', **payload)
"""

if old_encode not in source:
    raise RuntimeError('V8 encode patch anchor not found')
source = source.replace(old_encode, new_encode, 1)

for executable in ('ffmpeg', 'ffprobe'):
    if subprocess.run(['bash', '-lc', f'command -v {executable} >/dev/null 2>&1']).returncode != 0:
        raise RuntimeError(f'{executable} non disponibile nel runtime Kaggle.')

TARGET.write_text(source, encoding='utf-8')
subprocess.run([sys.executable, '-m', 'py_compile', str(TARGET)], check=True)
print('SONARA WAN V8 pronta: 24fps fluidi + HQ 960x540 + AAC 256k normalizzato + verifica ffprobe.')
subprocess.run([sys.executable, str(TARGET)], check=True)
