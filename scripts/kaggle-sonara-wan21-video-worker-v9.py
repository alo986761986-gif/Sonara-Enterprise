import subprocess
import sys
import urllib.request
from pathlib import Path

SOURCE = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/kaggle-sonara-wan21-video-worker-v6.py'
TARGET = Path('/kaggle/working/wan-v9-runtime.py')

source = urllib.request.urlopen(SOURCE, timeout=30).read().decode('utf-8')

replacements = [
    ("import os\nimport threading\n", "import hashlib\nimport json\nimport os\nimport subprocess\nimport threading\nimport wave\n\nimport numpy as np\n"),
    ("STEPS = int(os.environ.get('SONARA_WAN_STEPS', '6'))", "STEPS = int(os.environ.get('SONARA_WAN_STEPS', '12'))"),
    ("WIDTH = 544", "WIDTH = 624"),
    ("HEIGHT = 304", "HEIGHT = 352"),
    ("OUTPUT_FPS = 6", "OUTPUT_FPS = 8"),
    ("MAX_FRAMES = 49", "MAX_FRAMES = 65"),
    ("FLOW_SHIFT = 2.2", "FLOW_SHIFT = 3.0"),
    ("GUIDANCE_SCALE = 1.0", "GUIDANCE_SCALE = 4.5"),
    ("MAX_SEQUENCE_LENGTH = 192", "MAX_SEQUENCE_LENGTH = 256"),
    ("PROFILE = 'extreme-resident-t4-v6'", "PROFILE = 'native-hq-musical-audio-t4-v9'\nPLAYBACK_FPS = 24\nAUDIO_SR = 48000\nAUDIO_BITRATE = '320k'\nAUDIO_LUFS = -14\nNEGATIVE_PROMPT = 'slow motion, melted anatomy, warped face, warped hands, morphing, plastic skin, smeared details, duplicated limbs, deformed body, black frame, blurry, low quality, watermark, text, logo, flicker, static frame'\nMOTION_PREFIX = 'real-time natural motion, normal speed, coherent anatomy, stable facial identity, physically plausible movement, crisp cinematic detail, '"),
    ("app = FastAPI(title='SONARA WAN Extreme Resident V6')", "app = FastAPI(title='SONARA WAN Native HQ Musical Audio V9')"),
    ("Fn_compute_blocks=4,", "Fn_compute_blocks=12,"),
    ("residual_diff_threshold=0.16,", "residual_diff_threshold=0.03,"),
    ("enable_separate_cfg=False,", "enable_separate_cfg=True,"),
    ("print(f'[SONARA WAN V6] CacheDiT unavailable: {exc}', flush=True)", "print(f'[SONARA WAN V9] CacheDiT unavailable: {exc}', flush=True)"),
    ("print('[SONARA WAN V6] Loading UMT5 text encoder in 4-bit on T4...', flush=True)", "print('[SONARA WAN V9] Loading UMT5 text encoder in 4-bit on T4...', flush=True)"),
    ("print('[SONARA WAN V6] Loading VAE + WAN transformer...', flush=True)", "print('[SONARA WAN V9] Loading VAE + WAN transformer...', flush=True)"),
    ("# Critical V6 placement: the iterative denoiser never leaves GPU.", "# V9 HQ: denoiser and FP32 VAE remain resident on GPU."),
    ("raise RuntimeError('V6 resident GPU placement failed: ' + str(exc))", "raise RuntimeError('V9 resident GPU placement failed: ' + str(exc))"),
    ("print('[SONARA WAN V6] Resident GPU placement active.', gpu_memory_mb(), flush=True)", "print('[SONARA WAN V9] Resident GPU placement active.', gpu_memory_mb(), flush=True)"),
    ("prompt='cinematic natural motion, premium lighting',\n                height=144,", "prompt='coherent real-time cinematic motion, stable anatomy, crisp detail, premium lighting',\n                negative_prompt=NEGATIVE_PROMPT,\n                height=144,"),
    ("print('[SONARA WAN V6] Warm-up complete.', gpu_memory_mb(), flush=True)", "print('[SONARA WAN V9] Warm-up complete.', gpu_memory_mb(), flush=True)"),
    ("print(f'[SONARA WAN V6] warm-up failed: {exc}', flush=True)", "print(f'[SONARA WAN V9] warm-up failed: {exc}', flush=True)"),
    ("stage='WAN V6: GPU residente'", "stage='WAN V9: rendering nativo HQ'"),
    ("stage=f'WAN V6 - {STEPS} step / {num_frames} frame'", "stage=f'WAN V9 HQ - {STEPS} step / {num_frames} frame nativi'"),
    ("stage=f'WAN V6 - step {step_index + 1}/{STEPS}'", "stage=f'WAN V9 HQ - step {step_index + 1}/{STEPS}'"),
    ("prompt=req.prompt,\n                height=height,", "prompt=MOTION_PREFIX + req.prompt,\n                negative_prompt=NEGATIVE_PROMPT,\n                height=height,"),
    ("set_job(job_id, status='FAILED', progress=0, stage='Errore WAN V6', error=str(exc))", "set_job(job_id, status='FAILED', progress=0, stage='Errore WAN V9', error=str(exc))"),
    ("'cfgPasses': 1,", "'cfgPasses': 2,\n        'nativeFps': OUTPUT_FPS,\n        'playbackFps': PLAYBACK_FPS,\n        'videoCodec': 'h264-high-720p-crf15',\n        'audioCodec': 'aac-320k',\n        'audioMode': 'sonara-musical-bed-v3',\n        'audioTargetLufs': AUDIO_LUFS,"),
    ("stage='In coda su SONARA WAN V6'", "stage='In coda su SONARA WAN V9 HQ'"),
    ("return FileResponse(path, media_type='video/mp4', filename=path.name)", "return FileResponse(path, media_type='video/mp4', filename=path.name, headers={'Content-Disposition': f'inline; filename=\\\"{path.name}\\\"', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes'})"),
    ("SONARA VIDEO AI - WAN EXTREME RESIDENT T4 V6 / GPU1 / ZERO GOOGLE BILLING", "SONARA VIDEO AI - WAN NATIVE HQ + MUSICAL AUDIO V9 / GPU1 / ZERO GOOGLE BILLING"),
    ("'SONARA_WAN_STEPS': '6',", "'SONARA_WAN_STEPS': '12',"),
    ("print(f'WAN V6 PID {proc.pid} on GPU1/7861. Existing Cloudflare tunnel preserved.')", "print(f'WAN V9 PID {proc.pid} on GPU1/7861. Existing Cloudflare tunnel preserved.')"),
    ("print('V6 target: resident transformer + VAE on T4, 4-bit UMT5, CacheDiT, 6 steps, 49 frames @ 6 fps.')", "print('V9 target: 624x352 native, 65 frames @ 8fps, 12 steps, 720p output, no optical-flow morphing, AAC 320k musical bed.')"),
]

for old, new in replacements:
    if old not in source:
        raise RuntimeError(f'V9 patch anchor not found: {old[:100]!r}')
    source = source.replace(old, new, 1)

insert_after = """def set_job(job_id, **values):
    with jobs_lock:
        current = dict(jobs.get(job_id, {}))
        current.update(values)
        jobs[job_id] = current


"""

audio_helpers = r'''def _midi_hz(note):
    return 440.0 * (2.0 ** ((note - 69.0) / 12.0))


def synthesize_musical_audio(prompt, seed, duration, path):
    sr = AUDIO_SR
    n = max(1, int(round(duration * sr)))
    mix_l = np.zeros(n, dtype=np.float64)
    mix_r = np.zeros(n, dtype=np.float64)
    rng_seed = (int(seed) ^ int.from_bytes(hashlib.sha256(prompt.encode('utf-8', errors='ignore')).digest()[:4], 'big')) & 0xFFFFFFFF
    rng = np.random.default_rng(rng_seed)

    bpm = [96, 104, 112, 120][rng_seed % 4]
    beat = 60.0 / bpm
    root_midi = [45, 48, 50, 52, 53][(rng_seed // 7) % 5]
    progression = [0, 5, 3, 7]

    def add_stereo(start_s, signal_l, signal_r=None):
        start = int(start_s * sr)
        if start >= n:
            return
        if signal_r is None:
            signal_r = signal_l
        end = min(n, start + len(signal_l), start + len(signal_r))
        length = max(0, end - start)
        if length:
            mix_l[start:end] += signal_l[:length]
            mix_r[start:end] += signal_r[:length]

    # Warm evolving chord bed: no sustained single-frequency beep.
    segment = max(1.5, beat * 4.0)
    for idx, start in enumerate(np.arange(0.0, duration, segment)):
        seg_len = min(segment + 0.35, duration - start)
        m = max(1, int(seg_len * sr))
        tt = np.arange(m) / sr
        degree = progression[idx % len(progression)]
        chord = [root_midi + degree, root_midi + degree + 3, root_midi + degree + 7, root_midi + degree + 12]
        env = np.sin(np.clip(tt / max(seg_len, 1e-3), 0, 1) * np.pi) ** 1.35
        left = np.zeros(m)
        right = np.zeros(m)
        for j, note in enumerate(chord):
            f = _midi_hz(note)
            phase = rng.uniform(0, 2 * np.pi)
            osc_l = sum((1.0 / h) * np.sin(2 * np.pi * (f * (1 - 0.0015 * j)) * h * tt + phase) for h in range(1, 5))
            osc_r = sum((1.0 / h) * np.sin(2 * np.pi * (f * (1 + 0.0015 * j)) * h * tt + phase + 0.12) for h in range(1, 5))
            left += osc_l * (0.035 / (1 + j * 0.25))
            right += osc_r * (0.035 / (1 + j * 0.25))
        add_stereo(start, left * env, right * env)

    # Bass notes with short envelopes.
    for beat_idx, start in enumerate(np.arange(0.0, duration, beat)):
        note = root_midi - 12 + progression[(beat_idx // 4) % len(progression)]
        f = _midi_hz(note)
        m = max(1, int(min(beat * 0.9, duration - start) * sr))
        tt = np.arange(m) / sr
        env = np.exp(-tt * 4.8)
        sig = (np.sin(2 * np.pi * f * tt) + 0.28 * np.sin(4 * np.pi * f * tt)) * env * 0.16
        add_stereo(start, sig * 0.96, sig)

    # Kick every two beats: downward pitch sweep, transient not a continuous tone.
    for start in np.arange(0.0, duration, beat * 2):
        m = max(1, int(min(0.34, duration - start) * sr))
        tt = np.arange(m) / sr
        phase = 2 * np.pi * (46 * tt + (118 - 46) * (1 - np.exp(-tt * 18)) / 18)
        sig = np.sin(phase) * np.exp(-tt * 13) * 0.72
        add_stereo(start, sig, sig)

    # Snare/clap on beats 2 and 4.
    for bar in np.arange(0.0, duration, beat * 4):
        for off in (beat, beat * 3):
            start = bar + off
            if start >= duration:
                continue
            m = max(1, int(min(0.22, duration - start) * sr))
            noise = rng.standard_normal(m)
            hp = np.concatenate(([noise[0]], np.diff(noise)))
            tt = np.arange(m) / sr
            sig = hp * np.exp(-tt * 18) * 0.115
            add_stereo(start, sig * 0.88, sig)

    # Hats on eighth notes.
    for k, start in enumerate(np.arange(0.0, duration, beat / 2)):
        m = max(1, int(min(0.075, duration - start) * sr))
        noise = rng.standard_normal(m)
        hp = np.concatenate(([noise[0]], np.diff(noise)))
        tt = np.arange(m) / sr
        sig = hp * np.exp(-tt * 42) * (0.038 if k % 2 else 0.052)
        add_stereo(start, sig, sig * 0.82)

    # Subtle wide cinematic texture.
    texture = rng.standard_normal(n)
    smooth = np.convolve(texture, np.ones(48) / 48.0, mode='same')
    air = (texture - smooth) * 0.008
    mix_l += air
    mix_r += np.roll(air, int(0.009 * sr))

    # Short stereo ambience/reverb taps.
    dry_l = mix_l.copy()
    dry_r = mix_r.copy()
    for delay_s, gain in ((0.075, 0.16), (0.145, 0.10), (0.235, 0.055)):
        d = int(delay_s * sr)
        if d < n:
            mix_l[d:] += dry_r[:-d] * gain
            mix_r[d:] += dry_l[:-d] * gain

    # Smooth master saturation and peak normalization.
    mix_l = np.tanh(mix_l * 1.55)
    mix_r = np.tanh(mix_r * 1.55)
    peak = max(float(np.max(np.abs(mix_l))), float(np.max(np.abs(mix_r))), 1e-6)
    gain = min(0.92 / peak, 1.8)
    mix_l *= gain
    mix_r *= gain
    stereo = np.stack([mix_l, mix_r], axis=1)
    pcm = np.clip(stereo * 32767.0, -32768, 32767).astype('<i2')
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sr)
        wav.writeframes(pcm.tobytes())
    rms = float(np.sqrt(np.mean(stereo ** 2)))
    return {'bpm': bpm, 'rms': round(rms, 5), 'sampleRate': sr}


'''

if insert_after not in source:
    raise RuntimeError('V9 audio helper insertion anchor not found')
source = source.replace(insert_after, insert_after + audio_helpers, 1)

old_encode = """        set_job(job_id, progress=92, stage='Codifica MP4')
        path = OUT / f'{job_id}.mp4'
        export_to_video(result.frames[0], str(path), fps=OUTPUT_FPS)
        payload = gpu_memory_mb()
        set_job(job_id, status='COMPLETED', progress=100, stage='Video pronto', provider='kaggle-wan21', model=MODEL, profile=PROFILE, deviceMode=pipe_device_mode, cacheEnabled=cache_enabled, steps=STEPS, frames=num_frames, resolution=f'{width}x{height}', fps=OUTPUT_FPS, clipSeconds=round(num_frames / OUTPUT_FPS, 2), guidanceScale=GUIDANCE_SCALE, videoPath=f'/v1/video/file/{path.name}', **payload)
"""

new_encode = """        set_job(job_id, progress=86, stage='Creo master nativo HQ')
        duration = num_frames / OUTPUT_FPS
        raw_path = OUT / f'{job_id}.raw.mp4'
        audio_path = OUT / f'{job_id}.wav'
        path = OUT / f'{job_id}.mp4'
        export_to_video(result.frames[0], str(raw_path), fps=OUTPUT_FPS)

        set_job(job_id, progress=90, stage='Creo colonna sonora musicale SONARA')
        audio_meta = synthesize_musical_audio(req.prompt, seed, duration, audio_path)

        set_job(job_id, progress=94, stage='Master 720p + 24 fps senza morphing')
        out_w, out_h = (720, 1280) if portrait else (1280, 720)
        # Deliberately no minterpolate/motion-compensation: it was causing melted/plastic geometry.
        video_filter = (
            f'fps={PLAYBACK_FPS}:round=near,'
            f'scale={out_w}:{out_h}:flags=lanczos:force_original_aspect_ratio=decrease,'
            f'pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2:black,'
            'unsharp=5:5:0.42:5:5:0.0,eq=contrast=1.025:saturation=1.035:brightness=0.002'
        )
        subprocess.run([
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-i', str(raw_path), '-i', str(audio_path),
            '-vf', video_filter,
            '-af', f'loudnorm=I={AUDIO_LUFS}:LRA=8:TP=-1.0,alimiter=limit=0.95',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p',
            '-profile:v', 'high', '-level', '4.1', '-tune', 'film', '-movflags', '+faststart',
            '-c:a', 'aac', '-b:a', AUDIO_BITRATE, '-ar', str(AUDIO_SR), '-ac', '2', '-shortest', str(path)
        ], check=True, timeout=360)

        set_job(job_id, progress=98, stage='Verifico master video e audio')
        probe = subprocess.check_output([
            'ffprobe', '-v', 'error', '-show_entries',
            'stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:format=duration,size',
            '-of', 'json', str(path)
        ], text=True, timeout=30)
        probe_data = json.loads(probe)
        streams = probe_data.get('streams') or []
        video_stream = next((s for s in streams if s.get('codec_type') == 'video'), None)
        audio_stream = next((s for s in streams if s.get('codec_type') == 'audio'), None)
        if not video_stream:
            raise RuntimeError('MP4 finale privo di video.')
        if not audio_stream or str(audio_stream.get('codec_name') or '').lower() != 'aac':
            raise RuntimeError('MP4 finale privo di audio AAC valido.')
        if audio_meta.get('rms', 0) < 0.015:
            raise RuntimeError('Audio generato troppo basso: verifica master fallita.')

        for tmp in (raw_path, audio_path):
            try:
                tmp.unlink(missing_ok=True)
            except Exception:
                pass

        payload = gpu_memory_mb()
        set_job(job_id, status='COMPLETED', progress=100, stage='Video HQ 720p + audio musicale pronti', provider='kaggle-wan21', model=MODEL, profile=PROFILE, deviceMode=pipe_device_mode, cacheEnabled=cache_enabled, steps=STEPS, frames=num_frames, nativeResolution=f'{width}x{height}', resolution=f'{out_w}x{out_h}', nativeFps=OUTPUT_FPS, fps=PLAYBACK_FPS, clipSeconds=round(duration, 2), guidanceScale=GUIDANCE_SCALE, videoCodec='h264-high-720p-crf15', audioCodec='aac-320k', audioMode='sonara-musical-bed-v3', audioTargetLufs=AUDIO_LUFS, audioVerified=True, videoVerified=True, audioBpm=audio_meta.get('bpm'), audioRms=audio_meta.get('rms'), videoPath=f'/v1/video/file/{path.name}', **payload)
"""

if old_encode not in source:
    raise RuntimeError('V9 encode patch anchor not found')
source = source.replace(old_encode, new_encode, 1)

for executable in ('ffmpeg', 'ffprobe'):
    if subprocess.run(['bash', '-lc', f'command -v {executable} >/dev/null 2>&1']).returncode != 0:
        raise RuntimeError(f'{executable} non disponibile nel runtime Kaggle.')

TARGET.write_text(source, encoding='utf-8')
subprocess.run([sys.executable, '-m', 'py_compile', str(TARGET)], check=True)
print('SONARA WAN V9 pronta: native HQ + no optical-flow melting + musical stereo audio.')
subprocess.run([sys.executable, str(TARGET)], check=True)
