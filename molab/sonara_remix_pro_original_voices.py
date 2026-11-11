"""Preserve the real recorded voices of A and B in ONE generated Remix Pro song.

ACE-Step composes the accompaniment. Its synthesized vocal stem is excluded;
real Demucs vocal stems from the two authorized inputs take turns instead.
The original phonemes, language, pitch and playback speed are not regenerated.
No speech recognition, translation, cloning or word-level claims are made.
"""
from __future__ import annotations

from pathlib import Path
import math

import numpy as np
import soundfile as sf
from scipy.signal import resample_poly


class OriginalVoicesError(RuntimeError):
    pass


def _inspect(path):
    path = Path(path).expanduser().resolve(strict=True)
    if path.suffix.lower() != '.wav' or not path.is_file():
        raise OriginalVoicesError('A verified WAV stem is required')
    with sf.SoundFile(str(path)) as audio:
        if audio.channels not in (1, 2) or not 22050 <= audio.samplerate <= 96000:
            raise OriginalVoicesError('Unsupported authentic vocal stem')
        if audio.frames < audio.samplerate:
            raise OriginalVoicesError('Vocal stem must contain at least one second')
    return path


def _energy_profile(path):
    """Energy is only an activity proxy, NOT a lyric or singer detector."""
    values = []
    with sf.SoundFile(str(path)) as audio:
        block = max(1, round(audio.samplerate * .25))
        for _ in range(math.ceil(audio.frames / block)):
            data = audio.read(block, dtype='float32', always_2d=True)
            if not len(data) or not np.isfinite(data).all():
                if not len(data):
                    break
                raise OriginalVoicesError('Non-finite samples in authentic vocal stem')
            values.append(float(np.sqrt(np.mean(np.square(data.astype(np.float64))))))
    energy = np.asarray(values, dtype=np.float32)
    peak = float(energy.max()) if len(energy) else 0.0
    threshold = max(.0028, peak * .14)
    audible = bool(peak > .004 and np.count_nonzero(energy >= threshold) >= 8)
    return {'energy': energy, 'peak': peak, 'threshold': threshold,
            'audible': audible}


def _pick_start(profile, excerpt_seconds, occurrence):
    """Choose loud phrases with quiet ends; avoid slicing through syllables."""
    values = profile['energy']
    length = min(len(values), max(1, math.ceil(excerpt_seconds / .25)))
    limit = max(0, len(values) - length)
    if not limit:
        return 0.0
    target = (occurrence * length) % max(1, limit + 1)
    best = (-float('inf'), 0)
    for start in range(0, limit + 1, 2):
        part = values[start:start + length]
        activity = float(np.mean(part >= profile['threshold']))
        if activity < .12:
            continue
        edge = float(np.mean(np.r_[part[:min(2, len(part))],
                                       part[max(0, len(part) - 2):]]))
        edge /= max(profile['peak'], 1e-8)
        mean = float(np.mean(part)) / max(profile['peak'], 1e-8)
        distance = min(abs(start - target),
                       abs(start - target + limit + 1),
                       abs(start - target - limit - 1)) / max(1, limit + 1)
        score = 1.8 * activity + .35 * mean - .7 * edge - .20 * distance
        if score > best[0]:
            best = (score, start)
    return best[1] * .25


def _excerpt(voice_file, start_seconds, frames, sr):
    """Read actual recorded PCM, with only necessary sample-rate conversion."""
    with sf.SoundFile(str(voice_file)) as audio:
        input_sr = audio.samplerate
        audio.seek(min(audio.frames, round(start_seconds * input_sr)))
        wanted = math.ceil(frames * input_sr / sr) + 2
        segment = audio.read(wanted, dtype='float32', always_2d=True)
    if segment.shape[1] == 1:
        segment = np.repeat(segment, 2, axis=1)
    if input_sr != sr and len(segment):
        divisor = math.gcd(input_sr, sr)
        segment = resample_poly(segment, sr // divisor, input_sr // divisor,
                                axis=0).astype(np.float32)
    output = np.zeros((frames, 2), dtype=np.float32)
    count = min(frames, len(segment))
    output[:count] = segment[:count]
    return output


def restore_original_voices(*, generated, vocals_a, vocals_b, destination,
                            scratch, expected_seconds, lease_check=None,
                            device='cuda', target_lufs=-14.0):
    """Make a single instrumental AI fusion with authentic A and B vocal turns.

    Fail closed: never publish a raw A+B overlay or an unseparated AI vocal.
    The caller must re-run the authoritative technical release gate afterward.
    """
    if type(expected_seconds) is not int or expected_seconds not in range(30, 481, 30):
        raise OriginalVoicesError('Output duration must be exactly 30-480 seconds')
    if device != 'cuda':
        raise OriginalVoicesError('Verified CUDA separation is required')
    generated = _inspect(generated)
    vocals_a = _inspect(vocals_a)
    vocals_b = _inspect(vocals_b)
    destination = Path(destination).expanduser().resolve()
    scratch = Path(scratch).expanduser().resolve()
    if destination.exists() or destination in (generated, vocals_a, vocals_b):
        raise OriginalVoicesError('Refusing to overwrite any existing audio')
    if scratch.is_symlink():
        raise OriginalVoicesError('Unsafe private scratch path')
    scratch.mkdir(parents=True, exist_ok=True, mode=0o700)
    if not destination.parent.is_dir():
        raise OriginalVoicesError('Private output folder is missing')
    with sf.SoundFile(str(generated)) as audio:
        if abs(audio.frames / audio.samplerate - expected_seconds) > .12:
            raise OriginalVoicesError('Generated remix has a different duration')
    from sonara_remix_pro_toolkit import separate_stems, transparent_master
    if lease_check:
        lease_check('vocal_separation')
    manifest = separate_stems(generated, scratch, device=device)
    source_root = scratch / manifest['sourceSha256'][:20]
    parts = [_inspect(source_root / (stem + '.wav')) for stem in ('drums', 'bass', 'other')]
    a_profile, b_profile = _energy_profile(vocals_a), _energy_profile(vocals_b)
    # A Demucs stem is an activity proxy only. Do not claim transcript evidence.
    profiles = {'a': a_profile, 'b': b_profile}
    voices = {'a': vocals_a, 'b': vocals_b}
    sr = 44100  # Real Demucs htdemucs four-stem output rate.
    count = expected_seconds * sr
    for part in parts:
        with sf.SoundFile(str(part)) as source:
            if source.samplerate != sr or abs(source.frames - count) > sr // 5:
                raise OriginalVoicesError('AI accompaniment stem has wrong duration/rate')
    temp = destination.with_name(destination.stem + '-unmastered-voices.wav')
    if temp.exists():
        raise OriginalVoicesError('Temporary private output already exists')
    occurrences = {'a': 0, 'b': 0}
    used = {'a': False, 'b': False}
    slot_frames = int((15 if expected_seconds == 30 else 30) * sr)
    try:
        with sf.SoundFile(str(parts[0])) as drums, \
             sf.SoundFile(str(parts[1])) as bass, \
             sf.SoundFile(str(parts[2])) as other, \
             sf.SoundFile(str(temp), mode='x', samplerate=sr, channels=2,
                          subtype='FLOAT', format='WAV') as result:
            for index, start in enumerate(range(0, count, slot_frames)):
                if lease_check:
                    lease_check('vocal_arrangement')
                frames = min(slot_frames, count - start)
                layers = [src.read(frames, dtype='float32', always_2d=True)
                          for src in (drums, bass, other)]
                if any(len(layer) != frames or not np.isfinite(layer).all()
                       for layer in layers):
                    raise OriginalVoicesError('AI accompaniment stem was truncated')
                backing = np.zeros((frames, 2), dtype=np.float32)
                for layer in layers:
                    if layer.shape[1] == 1:
                        layer = np.repeat(layer, 2, axis=1)
                    backing += layer[:, :2] * .82
                role = 'a' if index % 2 == 0 else 'b'
                profile = profiles[role]
                if profile['audible']:
                    margin = min(round(.7 * sr), frames // 8)
                    vocal_frames = frames - margin * 2
                    if vocal_frames > sr:
                        position = _pick_start(profile, vocal_frames / sr,
                                               occurrences[role])
                        excerpt = _excerpt(voices[role], position, vocal_frames, sr)
                        rms = float(np.sqrt(np.mean(np.square(excerpt.astype(np.float64)))))
                        if rms >= .002:
                            envelope = np.ones(vocal_frames, dtype=np.float32)
                            fade = min(round(.28 * sr), vocal_frames // 4)
                            if fade:
                                slope = np.sin(np.linspace(0, np.pi / 2, fade,
                                                           dtype=np.float32)) ** 2
                                envelope[:fade] = slope
                                envelope[-fade:] = slope[::-1]
                            blend = np.zeros(frames, dtype=np.float32)
                            blend[margin:margin + vocal_frames] = envelope
                            backing *= (1.0 - .48 * blend[:, None])
                            gain = min(2.0, max(.65, .075 / rms))
                            backing[margin:margin + vocal_frames] += (
                                excerpt * (gain * envelope[:, None])
                            )
                            used[role] = True
                occurrences[role] += 1
                if not np.isfinite(backing).all():
                    raise OriginalVoicesError('Voice-preserving mix is non-finite')
                result.write(backing)
        if not any(used.values()) and any(p['audible'] for p in profiles.values()):
            raise OriginalVoicesError('Detected vocals were not preserved')
        if lease_check:
            lease_check('vocal_mastering')
        with sf.SoundFile(str(temp)) as raw:
            if raw.frames != count:
                raise OriginalVoicesError('Vocal remix duration mismatch')
            full = raw.read(dtype='float32', always_2d=True)
        final, metrics = transparent_master(full, sr=sr, lufs=target_lufs,
                                            peak_ceiling=-1.2)
        del full
        sf.write(str(destination), final, sr, subtype='PCM_24')
        del final
        with sf.SoundFile(str(destination)) as output:
            if output.frames != count or output.channels != 2:
                raise OriginalVoicesError('Vocal remix export could not be verified')
        return {'originalVoiceAUsed': used['a'],
                'originalVoiceBUsed': used['b'],
                'vocalSource': 'original-authorized-demucs-stems',
                'modelGeneratedLeadVocalsRetained': False,
                'transcriptionOrTranslationPerformed': False,
                'vocalTimeStretchPerformed': False,
                'originalPerformanceWasRecreated': False,
                'humanListeningRequired': True,
                'mastering': metrics}
    except BaseException:
        destination.unlink(missing_ok=True)
        raise
    finally:
        temp.unlink(missing_ok=True)
