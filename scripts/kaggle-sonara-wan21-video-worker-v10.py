import subprocess
import sys
import urllib.request
from pathlib import Path

SOURCE = 'https://raw.githubusercontent.com/alo986761986-gif/Sonara-Enterprise/main/scripts/kaggle-sonara-wan21-video-worker-v6.py'
TARGET = Path('/kaggle/working/wan-v10-runtime.py')

source = urllib.request.urlopen(SOURCE, timeout=30).read().decode('utf-8')

replacements = [
    ("import os\nimport threading\n", "import hashlib\nimport json\nimport os\nimport subprocess\nimport threading\nimport wave\n\nimport numpy as np\n"),
    ("STEPS = int(os.environ.get('SONARA_WAN_STEPS', '6'))", "STEPS = int(os.environ.get('SONARA_WAN_STEPS', '24'))"),
    ("WIDTH = 544", "WIDTH = 672"),
    ("HEIGHT = 304", "HEIGHT = 384"),
    ("OUTPUT_FPS = 6", "OUTPUT_FPS = 16"),
    ("MAX_FRAMES = 49", "MAX_FRAMES = 65"),
    ("FLOW_SHIFT = 2.2", "FLOW_SHIFT = 3.0"),
    ("GUIDANCE_SCALE = 1.0", "GUIDANCE_SCALE = 5.0"),
    ("MAX_SEQUENCE_LENGTH = 192", "MAX_SEQUENCE_LENGTH = 256"),
    ("PROFILE = 'extreme-resident-t4-v6'", "PROFILE = 'realtime-hq-exact-t4-v10'\nSEGMENT_FRAMES = 65\nPLAYBACK_FPS = 24\nAUDIO_SR = 48000\nAUDIO_BITRATE = '320k'\nAUDIO_LUFS = -14\nMOTION_PREFIX = 'real-time motion at normal speed, natural human movement, physically plausible camera motion, stable identity, coherent anatomy, crisp detailed textures, cinematic 480p source quality, '\nCONTINUATION_PREFIX = 'continuation of the same scene, same people, same clothes, same environment, matching lighting and camera direction, continue the action naturally at normal real-time speed, '\nNEGATIVE_PROMPT = 'slow motion, time stretching, frozen motion, static frame, melted anatomy, warped face, warped hands, morphing, plastic skin, wax skin, smeared details, duplicated limbs, deformed body, extra limbs, blurry, low quality, over-smoothed, watermark, text, logo, flicker'"),
    ("app = FastAPI(title='SONARA WAN Extreme Resident V6')", "app = FastAPI(title='SONARA WAN Real-Time HQ Exact V10')"),
    ("global pipe, pipe_loading, pipe_device_mode, placement_error", "global pipe, pipe_loading, pipe_device_mode, placement_error, cache_enabled, cache_error"),
    ("enable_cache(candidate)", "# V10 HQ: disable approximate feature caching to preserve exact denoising quality.\n            cache_enabled = False\n            cache_error = 'disabled-for-hq-exact-denoise'"),
    ("print('[SONARA WAN V6] Loading UMT5 text encoder in 4-bit on T4...', flush=True)", "print('[SONARA WAN V10] Loading UMT5 text encoder in 4-bit on T4...', flush=True)"),
    ("print('[SONARA WAN V6] Loading VAE + WAN transformer...', flush=True)", "print('[SONARA WAN V10] Loading FP32 VAE + WAN transformer...', flush=True)"),
    ("# Critical V6 placement: the iterative denoiser never leaves GPU.", "# V10: exact denoiser and FP32 VAE remain resident on GPU."),
    ("raise RuntimeError('V6 resident GPU placement failed: ' + str(exc))", "raise RuntimeError('V10 resident GPU placement failed: ' + str(exc))"),
    ("print('[SONARA WAN V6] Resident GPU placement active.', gpu_memory_mb(), flush=True)", "print('[SONARA WAN V10] Resident GPU placement active.', gpu_memory_mb(), flush=True)"),
    ("prompt='cinematic natural motion, premium lighting',\n                height=144,", "prompt='real-time normal-speed cinematic motion, stable anatomy, crisp textures, premium lighting',\n                negative_prompt=NEGATIVE_PROMPT,\n                height=144,"),
    ("print('[SONARA WAN V6] Warm-up complete.', gpu_memory_mb(), flush=True)", "print('[SONARA WAN V10] Warm-up complete.', gpu_memory_mb(), flush=True)"),
    ("print(f'[SONARA WAN V6] warm-up failed: {exc}', flush=True)", "print(f'[SONARA WAN V10] warm-up failed: {exc}', flush=True)"),
    ("'cfgPasses': 1,", "'cfgPasses': 2,\n        'nativeFps': OUTPUT_FPS,\n        'playbackFps': PLAYBACK_FPS,\n        'segmentFrames': SEGMENT_FRAMES,\n        'segmentsFor8s': 2,\n        'exactDenoise': True,\n        'videoCodec': 'h264-high-720p-crf14',\n        'audioCodec': 'aac-320k',\n        'audioMode': 'sonara-musical-bed-v4',\n        'audioTargetLufs': AUDIO_LUFS,"),
    ("'maxClipSeconds': round(MAX_FRAMES / OUTPUT_FPS, 2),", "'maxClipSeconds': 8.0,"),
    ("stage='In coda su SONARA WAN V6'", "stage='In coda su SONARA WAN V10 HQ'"),
    ("return FileResponse(path, media_type='video/mp4', filename=path.name)", "return FileResponse(path, media_type='video/mp4', filename=path.name, headers={'Content-Disposition': f'inline; filename=\\\"{path.name}\\\"', 'Cache-Control': 'no-store', 'Accept-Ranges': 'bytes'})"),
    ("SONARA VIDEO AI - WAN EXTREME RESIDENT T4 V6 / GPU1 / ZERO GOOGLE BILLING", "SONARA VIDEO AI - WAN REAL-TIME HQ EXACT V10 / GPU1 / ZERO GOOGLE BILLING"),
    ("'SONARA_WAN_STEPS': '6',", "'SONARA_WAN_STEPS': '24',"),
    ("print(f'WAN V6 PID {proc.pid} on GPU1/7861. Existing Cloudflare tunnel preserved.')", "print(f'WAN V10 PID {proc.pid} on GPU1/7861. Existing Cloudflare tunnel preserved.')"),
    ("print('V6 target: resident transformer + VAE on T4, 4-bit UMT5, CacheDiT, 6 steps, 49 frames @ 6 fps.')", "print('V10 target: true 16fps timing, 672x384 native, 24 exact steps, two ~4s segments for 8s, 720p H264 + AAC 320k.')"),
    ("required = [('bitsandbytes', 'bitsandbytes>=0.46.1'), ('cache_dit', 'cache-dit'), ('diffusers', 'diffusers>=0.35.1'),", "required = [('bitsandbytes', 'bitsandbytes>=0.46.1'), ('diffusers', 'diffusers>=0.35.1'),"),
]

for old, new in replacements:
    if old not in source:
        raise RuntimeError(f'V10 patch anchor not found: {old[:110]!r}')
    source = source.replace(old, new, 1)

helpers_anchor = """def set_job(job_id, **values):
    with jobs_lock:
        current = dict(jobs.get(job_id, {}))
        current.update(values)
        jobs[job_id] = current


"""

helpers = r'''def _midi_hz(note):
    return 440.0 * (2.0 ** ((note - 69.0) / 12.0))


def synthesize_musical_audio(prompt, seed, duration, path):
    sr = AUDIO_SR
    n = max(1, int(round(duration * sr)))
    left = np.zeros(n, dtype=np.float64)
    right = np.zeros(n, dtype=np.float64)
    digest = hashlib.sha256((prompt + str(seed)).encode('utf-8', errors='ignore')).digest()
    rng_seed = int.from_bytes(digest[:4], 'big')
    rng = np.random.default_rng(rng_seed)
    bpm = [100, 108, 116, 122][rng_seed % 4]
    beat = 60.0 / bpm
    root = [45, 48, 50, 52, 53][(rng_seed // 5) % 5]
    progression = [0, 5, 3, 7]

    def add(start_s, sig_l, sig_r=None):
        if sig_r is None:
            sig_r = sig_l
        start = int(start_s * sr)
        if start >= n:
            return
        length = min(len(sig_l), len(sig_r), n - start)
        if length > 0:
            left[start:start + length] += sig_l[:length]
            right[start:start + length] += sig_r[:length]

    # Short enveloped harmonic pads; no continuous sine-tone beep.
    chord_len = beat * 4
    for ci, start in enumerate(np.arange(0.0, duration, chord_len)):
        seg_len = min(chord_len + 0.25, duration - start)
        m = max(1, int(seg_len * sr))
        t = np.arange(m) / sr
        env = np.sin(np.clip(t / max(seg_len, 1e-6), 0, 1) * np.pi) ** 1.4
        degree = progression[ci % len(progression)]
        l = np.zeros(m)
        r = np.zeros(m)
        for j, note in enumerate((root + degree, root + degree + 3, root + degree + 7, root + degree + 12)):
            f = _midi_hz(note)
            phase = rng.uniform(0, 2 * np.pi)
            # Rich harmonics and stereo detune remove the pure-tone character.
            for h, amp in ((1, 1.0), (2, 0.31), (3, 0.16), (4, 0.08)):
                l += np.sin(2 * np.pi * f * h * 0.9985 * t + phase) * amp * 0.020
                r += np.sin(2 * np.pi * f * h * 1.0015 * t + phase + 0.10) * amp * 0.020
        add(start, l * env, r * env)

    # Bass pulses.
    for bi, start in enumerate(np.arange(0.0, duration, beat)):
        f = _midi_hz(root - 12 + progression[(bi // 4) % len(progression)])
        m = max(1, int(min(beat * 0.82, duration - start) * sr))
        t = np.arange(m) / sr
        env = np.exp(-t * 5.6)
        sig = (np.sin(2 * np.pi * f * t) + 0.22 * np.sin(4 * np.pi * f * t)) * env * 0.13
        add(start, sig * 0.94, sig)

    # Percussive transients.
    for start in np.arange(0.0, duration, beat * 2):
        m = max(1, int(min(0.30, duration - start) * sr))
        t = np.arange(m) / sr
        phase = 2 * np.pi * (48 * t + 58 * (1 - np.exp(-t * 18)) / 18)
        kick = np.sin(phase) * np.exp(-t * 14) * 0.58
        add(start, kick, kick)

    for bar in np.arange(0.0, duration, beat * 4):
        for off in (beat, beat * 3):
            start = bar + off
            if start >= duration:
                continue
            m = max(1, int(min(0.18, duration - start) * sr))
            noise = rng.standard_normal(m)
            hp = np.concatenate(([noise[0]], np.diff(noise)))
            t = np.arange(m) / sr
            clap = hp * np.exp(-t * 20) * 0.09
            add(start, clap * 0.86, clap)

    for hi, start in enumerate(np.arange(0.0, duration, beat / 2)):
        m = max(1, int(min(0.055, duration - start) * sr))
        noise = rng.standard_normal(m)
        hp = np.concatenate(([noise[0]], np.diff(noise)))
        t = np.arange(m) / sr
        hat = hp * np.exp(-t * 52) * (0.028 if hi % 2 else 0.038)
        add(start, hat, hat * 0.78)

    # Wide air texture and short ambience taps.
    noise = rng.standard_normal(n)
    smooth = np.convolve(noise, np.ones(64) / 64.0, mode='same')
    air = (noise - smooth) * 0.005
    left += air
    right += np.roll(air, int(0.011 * sr))
    dry_l, dry_r = left.copy(), right.copy()
    for delay_s, gain in ((0.085, 0.13), (0.170, 0.075)):
        d = int(delay_s * sr)
        if d < n:
            left[d:] += dry_r[:-d] * gain
            right[d:] += dry_l[:-d] * gain

    left = np.tanh(left * 1.65)
    right = np.tanh(right * 1.65)
    peak = max(float(np.max(np.abs(left))), float(np.max(np.abs(right))), 1e-7)
    gain = min(0.91 / peak, 2.0)
    left *= gain
    right *= gain
    stereo = np.stack([left, right], axis=1)
    pcm = np.clip(stereo * 32767.0, -32768, 32767).astype('<i2')
    with wave.open(str(path), 'wb') as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(sr)
        wav.writeframes(pcm.tobytes())
    rms = float(np.sqrt(np.mean(stereo ** 2)))
    return {'bpm': bpm, 'rms': round(rms, 5), 'sampleRate': sr}


def render_one_segment(p, prompt, width, height, frames, seed, job_id, segment_index, segment_count, progress_start, progress_end):
    generator = torch.Generator(device='cuda').manual_seed(seed)

    def cb(_pipeline, step_index, _timestep, callback_kwargs):
        fraction = (step_index + 1) / max(1, STEPS)
        progress = progress_start + int((progress_end - progress_start) * fraction)
        set_job(job_id, progress=min(progress_end, progress), stage=f'WAN V10 HQ - scena {segment_index}/{segment_count} - step {step_index + 1}/{STEPS}')
        return callback_kwargs

    with pipe_lock, torch.inference_mode():
        return p(
            prompt=prompt,
            negative_prompt=NEGATIVE_PROMPT,
            height=height,
            width=width,
            num_frames=frames,
            guidance_scale=GUIDANCE_SCALE,
            num_inference_steps=STEPS,
            generator=generator,
            max_sequence_length=MAX_SEQUENCE_LENGTH,
            callback_on_step_end=cb,
        ).frames[0]


'''

if helpers_anchor not in source:
    raise RuntimeError('V10 helper insertion anchor not found')
source = source.replace(helpers_anchor, helpers_anchor + helpers, 1)

old_render_start = source.index('def render(job_id, req):\n')
old_render_end = source.index('\n\n@app.get(\'/health\')', old_render_start)
old_render = source[old_render_start:old_render_end]

new_render = r'''def render(job_id, req):
    temp_files = []
    try:
        set_job(job_id, status='PROCESSING', progress=5, stage='WAN V10: preparazione HQ real-time')
        p = load_pipe()
        portrait = req.aspectRatio == '9:16'
        width, height = (HEIGHT, WIDTH) if portrait else (WIDTH, HEIGHT)
        requested_duration = float(max(1, min(8, int(req.durationSeconds or 8))))
        seed = req.seed if req.seed is not None else int.from_bytes(os.urandom(4), 'big')

        # Wan2.1 is temporally calibrated around 16fps. Never stretch 8fps material to 8 seconds.
        # For clips above ~4s, render two independent 65-frame chunks sequentially to keep T4 memory bounded.
        if requested_duration <= 4.05:
            segment_frames = [frames_for_duration(int(round(requested_duration)))]
        else:
            segment_frames = [SEGMENT_FRAMES, SEGMENT_FRAMES]
        segment_count = len(segment_frames)

        set_job(job_id, progress=10, stage=f'WAN V10 HQ: {segment_count} scena/e a 16 fps reali', seed=seed, profile=PROFILE, steps=STEPS, nativeFps=OUTPUT_FPS, segments=segment_count, nativeResolution=f'{width}x{height}')

        raw_segments = []
        for idx, frames in enumerate(segment_frames):
            seg_index = idx + 1
            prompt = MOTION_PREFIX + req.prompt if idx == 0 else MOTION_PREFIX + CONTINUATION_PREFIX + req.prompt
            seg_seed = (int(seed) + idx * 104729) & 0xFFFFFFFF
            p0 = 12 + int(idx * 66 / segment_count)
            p1 = 12 + int((idx + 1) * 66 / segment_count)
            frames_out = render_one_segment(p, prompt, width, height, frames, seg_seed, job_id, seg_index, segment_count, p0, p1)
            raw = OUT / f'{job_id}.segment{seg_index}.mp4'
            export_to_video(frames_out, str(raw), fps=OUTPUT_FPS)
            raw_segments.append(raw)
            temp_files.append(raw)
            del frames_out
            torch.cuda.empty_cache()

        concat_list = OUT / f'{job_id}.concat.txt'
        concat_list.write_text('\n'.join(f"file '{p.as_posix()}'" for p in raw_segments) + '\n', encoding='utf-8')
        temp_files.append(concat_list)
        joined = OUT / f'{job_id}.joined.mp4'
        subprocess.run([
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-f', 'concat', '-safe', '0', '-i', str(concat_list),
            '-c', 'copy', str(joined)
        ], check=True, timeout=120)
        temp_files.append(joined)

        set_job(job_id, progress=82, stage='SONARA V10: colonna sonora musicale')
        audio_path = OUT / f'{job_id}.wav'
        audio_meta = synthesize_musical_audio(req.prompt, seed, requested_duration, audio_path)
        temp_files.append(audio_path)

        set_job(job_id, progress=90, stage='SONARA V10: master 720p / 24fps senza slow-motion')
        out_w, out_h = (720, 1280) if portrait else (1280, 720)
        path = OUT / f'{job_id}.mp4'
        # 16fps -> 24fps conversion only duplicates cadence; timestamps/duration stay real-time.
        video_filter = (
            f'fps={PLAYBACK_FPS}:round=near,'
            f'scale={out_w}:{out_h}:flags=lanczos:force_original_aspect_ratio=decrease,'
            f'pad={out_w}:{out_h}:(ow-iw)/2:(oh-ih)/2:black,'
            'unsharp=3:3:0.16:3:3:0.0,eq=contrast=1.015:saturation=1.02'
        )
        subprocess.run([
            'ffmpeg', '-y', '-hide_banner', '-loglevel', 'error',
            '-i', str(joined), '-i', str(audio_path),
            '-vf', video_filter,
            '-af', f'loudnorm=I={AUDIO_LUFS}:LRA=8:TP=-1.0,alimiter=limit=0.95',
            '-t', f'{requested_duration:.3f}',
            '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p',
            '-profile:v', 'high', '-level', '4.1', '-tune', 'film', '-movflags', '+faststart',
            '-c:a', 'aac', '-b:a', AUDIO_BITRATE, '-ar', str(AUDIO_SR), '-ac', '2', '-shortest', str(path)
        ], check=True, timeout=420)

        set_job(job_id, progress=97, stage='Verifica temporale, video e audio')
        probe = subprocess.check_output([
            'ffprobe', '-v', 'error', '-show_entries',
            'stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels:format=duration,size',
            '-of', 'json', str(path)
        ], text=True, timeout=30)
        probe_data = json.loads(probe)
        streams = probe_data.get('streams') or []
        video_stream = next((s for s in streams if s.get('codec_type') == 'video'), None)
        audio_stream = next((s for s in streams if s.get('codec_type') == 'audio'), None)
        final_duration = float((probe_data.get('format') or {}).get('duration') or 0.0)
        if not video_stream:
            raise RuntimeError('V10: MP4 finale privo di stream video.')
        if not audio_stream or str(audio_stream.get('codec_name') or '').lower() != 'aac':
            raise RuntimeError('V10: MP4 finale privo di audio AAC valido.')
        if final_duration < requested_duration - 0.35 or final_duration > requested_duration + 0.35:
            raise RuntimeError(f'V10: durata finale anomala {final_duration:.2f}s, richiesta {requested_duration:.2f}s.')
        if audio_meta.get('rms', 0) < 0.015:
            raise RuntimeError('V10: audio generato troppo basso.')

        payload = gpu_memory_mb()
        set_job(
            job_id,
            status='COMPLETED', progress=100,
            stage='Video real-time HQ + audio pronti',
            provider='kaggle-wan21', model=MODEL, profile=PROFILE,
            deviceMode=pipe_device_mode, cacheEnabled=False, exactDenoise=True,
            steps=STEPS, segments=segment_count,
            frames=sum(segment_frames), nativeResolution=f'{width}x{height}', resolution=f'{out_w}x{out_h}',
            nativeFps=OUTPUT_FPS, fps=PLAYBACK_FPS, clipSeconds=round(final_duration, 2),
            guidanceScale=GUIDANCE_SCALE, flowShift=FLOW_SHIFT,
            videoCodec='h264-high-720p-crf14', audioCodec='aac-320k',
            audioMode='sonara-musical-bed-v4', audioTargetLufs=AUDIO_LUFS,
            audioVerified=True, videoVerified=True, timingVerified=True,
            audioBpm=audio_meta.get('bpm'), audioRms=audio_meta.get('rms'),
            videoPath=f'/v1/video/file/{path.name}', **payload
        )
    except Exception as exc:
        set_job(job_id, status='FAILED', progress=0, stage='Errore WAN V10', error=str(exc))
    finally:
        for tmp in temp_files:
            try:
                tmp.unlink(missing_ok=True)
            except Exception:
                pass
        try:
            torch.cuda.empty_cache()
        except Exception:
            pass
'''

source = source[:old_render_start] + new_render + source[old_render_end:]

for executable in ('ffmpeg', 'ffprobe'):
    if subprocess.run(['bash', '-lc', f'command -v {executable} >/dev/null 2>&1']).returncode != 0:
        raise RuntimeError(f'{executable} non disponibile nel runtime Kaggle.')

TARGET.write_text(source, encoding='utf-8')
subprocess.run([sys.executable, '-m', 'py_compile', str(TARGET)], check=True)
print('SONARA WAN V10 pronta: real 16fps timing + exact denoise + 672x384 native + 720p master.')
subprocess.run([sys.executable, str(TARGET)], check=True)
