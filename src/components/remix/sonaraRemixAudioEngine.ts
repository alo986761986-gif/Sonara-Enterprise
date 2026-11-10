/**
 * Non-destructive private Remix Pro editor DSP.
 * Only operates in the user's browser. No upload, R2 mutation or GPU job.
 */
export type RemixEditSettings = {
  start: number; end: number;
  fadeIn: number; fadeOut: number;
  bass: number; mid: number; treble: number;
  loop: boolean;
};
export type RemixSelection = RemixEditSettings & {seconds: number};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum));
const ms = (value: number) => Math.round(value * 1000) / 1000;

export function resolveRemixSelection(
  sourceSeconds: number, settings: RemixEditSettings,
): RemixSelection {
  if (!Number.isFinite(sourceSeconds) || sourceSeconds < .25)
    throw new Error('Il file deve contenere almeno 250 millisecondi di audio.');
  const duration = ms(sourceSeconds);
  const start = ms(clamp(settings.start, 0, Math.max(0, duration - .25)));
  const end = ms(clamp(settings.end, start + .25, duration));
  const seconds = ms(end - start);
  const fadeIn = ms(clamp(settings.fadeIn, 0, Math.min(120, seconds)));
  const fadeOut = ms(clamp(settings.fadeOut, 0, Math.min(120, seconds - fadeIn)));
  return {
    start, end, seconds, fadeIn, fadeOut,
    bass: clamp(settings.bass, -12, 12),
    mid: clamp(settings.mid, -12, 12),
    treble: clamp(settings.treble, -12, 12),
    loop: settings.loop === true,
  };
}

/** Three genuine biquad bands and sample-accurate gain ramps (incl. loop seam guard). */
export async function renderRemixSelection(
  source: AudioBuffer, settings: RemixEditSettings,
): Promise<AudioBuffer> {
  const selected = resolveRemixSelection(source.duration, settings);
  if (typeof OfflineAudioContext === 'undefined')
    throw new Error('Questo browser non supporta l’elaborazione audio offline.');
  // 48 kHz ceiling bounds memory for high-sample-rate masters.
  const sampleRate = Math.min(48000, source.sampleRate);
  const frames = Math.max(1, Math.round(selected.seconds * sampleRate));
  const context = new OfflineAudioContext(2, frames, sampleRate);
  const player = context.createBufferSource();
  player.buffer = source;
  const low = context.createBiquadFilter();
  low.type = 'lowshelf'; low.frequency.value = 140; low.gain.value = selected.bass;
  const middle = context.createBiquadFilter();
  middle.type = 'peaking'; middle.frequency.value = 1000;
  middle.Q.value = .85; middle.gain.value = selected.mid;
  const high = context.createBiquadFilter();
  high.type = 'highshelf'; high.frequency.value = Math.min(6500, sampleRate * .38);
  high.gain.value = selected.treble;
  const envelope = context.createGain();
  player.connect(low); low.connect(middle); middle.connect(high);
  high.connect(envelope); envelope.connect(context.destination);

  // The user's fades are honored. A loop with zero fades still receives an
  // 8 ms anti-click edge ramp so repeated WAV regions do not pop.
  const fadeIn = selected.loop ? Math.max(selected.fadeIn, Math.min(.008, selected.seconds / 4)) : selected.fadeIn;
  const fadeOut = selected.loop ? Math.max(selected.fadeOut, Math.min(.008, selected.seconds / 4)) : selected.fadeOut;
  const gain = envelope.gain;
  gain.setValueAtTime(fadeIn ? 0 : 1, 0);
  if (fadeIn) gain.linearRampToValueAtTime(1, fadeIn);
  if (fadeOut) {
    gain.setValueAtTime(1, Math.max(fadeIn, selected.seconds - fadeOut));
    gain.linearRampToValueAtTime(0, selected.seconds);
  }
  player.start(0, selected.start, selected.seconds);
  return context.startRendering();
}

/** PCM 24-bit stereo WAV, with peak-only attenuation above -0.18 dBFS.
 * Does not claim true-peak certified limiting or creative mastering.
 */
export function encodeWav24(
  buffer: Pick<AudioBuffer, 'length' | 'numberOfChannels' | 'sampleRate' | 'getChannelData'>,
): {blob: Blob; peak: number; attenuationDb: number} {
  const channels = buffer.numberOfChannels;
  const rate = buffer.sampleRate;
  const frames = buffer.length;
  if (channels !== 1 && channels !== 2)
    throw new Error('Sono supportati soltanto master mono o stereo.');
  if (!Number.isInteger(rate) || rate < 8000 || rate > 96000 ||
      !Number.isInteger(frames) || frames < 1)
    throw new Error('Parametri WAV non validi.');
  const bytes = frames * channels * 3;
  if (bytes > 256 * 1024 * 1024)
    throw new Error('Il segmento è troppo grande da esportare in questo browser.');
  const streams = Array.from({length: channels}, (_, i) => buffer.getChannelData(i));
  let peak = 0;
  for (let channel = 0; channel < channels; channel++) {
    if (streams[channel].length < frames) throw new Error('Audio PCM incompleto.');
    for (let i = 0; i < frames; i++) {
      const value = streams[channel][i];
      if (!Number.isFinite(value)) throw new Error('Sono presenti campioni audio non validi.');
      peak = Math.max(peak, Math.abs(value));
    }
  }
  const scale = peak > .98 ? .98 / peak : 1;
  const array = new ArrayBuffer(44 + bytes);
  const view = new DataView(array);
  function text(offset: number, value: string) {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  }
  text(0, 'RIFF'); view.setUint32(4, 36 + bytes, true);
  text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, rate, true);
  view.setUint32(28, rate * channels * 3, true);
  view.setUint16(32, channels * 3, true); view.setUint16(34, 24, true);
  text(36, 'data'); view.setUint32(40, bytes, true);
  let position = 44;
  for (let frame = 0; frame < frames; frame++) {
    for (let channel = 0; channel < channels; channel++) {
      const raw = Math.max(-1, Math.min(1, streams[channel][frame] * scale));
      const quantized = Math.max(-8388608, Math.min(8388607,
        Math.round(raw < 0 ? raw * 8388608 : raw * 8388607)));
      view.setUint8(position++, quantized & 255);
      view.setUint8(position++, (quantized >> 8) & 255);
      view.setUint8(position++, (quantized >> 16) & 255);
    }
  }
  return {
    blob: new Blob([array], {type: 'audio/wav'}),
    peak: Math.round(peak * 10000) / 10000,
    attenuationDb: scale < 1 ? Math.round(2000 * Math.log10(scale)) / 100 : 0,
  };
}

/** Accurate full-track selection markers for the canvas and keyboard inputs. */
export function waveformBins(source: AudioBuffer, binCount = 600): Float32Array {
  const count = Math.max(1, Math.min(1200, Math.round(binCount)));
  const out = new Float32Array(count);
  const samples = Array.from({length: source.numberOfChannels}, (_, i) => source.getChannelData(i));
  const stride = Math.max(1, Math.ceil(source.length / (count * 120)));
  for (let bin = 0; bin < count; bin++) {
    const first = Math.floor(bin * source.length / count);
    const last = Math.max(first + 1, Math.floor((bin + 1) * source.length / count));
    let peak = 0;
    for (let i = first; i < last; i += stride) {
      for (const channel of samples) peak = Math.max(peak, Math.abs(channel[i] || 0));
    }
    out[bin] = Math.min(1, peak);
  }
  return out;
}
