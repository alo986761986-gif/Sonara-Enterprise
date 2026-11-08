/**
 * Compact three-band Remix EQ. Uses the same Web Audio filters for audible
 * preview and offline WAV export; no model inference or fake audio.
 */
export type RemixEqBands = { low: number; mid: number; high: number };
export const REMIX_EQ_FLAT: RemixEqBands = { low: 0, mid: 0, high: 0 };
export const REMIX_EQ_CLARITY: RemixEqBands = { low: -1.5, mid: 1.5, high: 1.5 };
export const REMIX_EQ_LIMIT_DB = 6;
export const REMIX_EQ_PREAMP_DB = -2.5;

export function clampEqDb(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(REMIX_EQ_LIMIT_DB, Math.max(-REMIX_EQ_LIMIT_DB, value));
}

export function eqIsFlat(value: RemixEqBands): boolean {
  return Object.values(value).every(gain => clampEqDb(gain) === 0);
}

export function createEqNodes(context: BaseAudioContext, bands: RemixEqBands) {
  const low = context.createBiquadFilter();
  low.type = 'lowshelf';
  low.frequency.value = 180;
  low.gain.value = clampEqDb(bands.low);

  const mid = context.createBiquadFilter();
  mid.type = 'peaking';
  mid.frequency.value = 2200;
  mid.Q.value = 0.85;
  mid.gain.value = clampEqDb(bands.mid);

  const high = context.createBiquadFilter();
  high.type = 'highshelf';
  high.frequency.value = 6500;
  high.gain.value = clampEqDb(bands.high);

  const preamp = context.createGain();
  preamp.gain.value = eqIsFlat(bands) ? 1 : Math.pow(10, REMIX_EQ_PREAMP_DB / 20);
  low.connect(mid);
  mid.connect(high);
  high.connect(preamp);
  return { low, mid, high, preamp };
}

function putAscii(data: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) data.setUint8(offset + i, value.charCodeAt(i));
}

export function writeEqWav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const channelSamples = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
  const frames = buffer.length;
  const bytesPerFrame = channels * 2;
  const view = new DataView(new ArrayBuffer(44 + frames * bytesPerFrame));
  putAscii(view, 0, 'RIFF'); view.setUint32(4, 36 + frames * bytesPerFrame, true);
  putAscii(view, 8, 'WAVE'); putAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, channels, true); view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * bytesPerFrame, true);
  view.setUint16(32, bytesPerFrame, true); view.setUint16(34, 16, true);
  putAscii(view, 36, 'data'); view.setUint32(40, frames * bytesPerFrame, true);

  let peak = 0;
  for (const samples of channelSamples) for (let i = 0; i < frames; i++) {
    peak = Math.max(peak, Math.abs(samples[i] || 0));
  }
  // Ceiling of -1 dBFS, never increase gain or compress.
  const ceiling = Math.pow(10, -1 / 20);
  const scale = peak > ceiling ? ceiling / peak : 1;
  let offset = 44;
  for (let i = 0; i < frames; i++) for (let channel = 0; channel < channels; channel++) {
    const value = Math.max(-1, Math.min(1, (channelSamples[channel][i] || 0) * scale));
    view.setInt16(offset, Math.round(value * (value < 0 ? 32768 : 32767)), true);
    offset += 2;
  }
  return new Blob([view.buffer], { type: 'audio/wav' });
}

export async function renderRemixEqWav(sourceUrl: string, bands: RemixEqBands, enabled = true): Promise<Blob> {
  const response = await fetch(sourceUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('Audio Remix non disponibile: HTTP ' + response.status);
  // Bound browser memory use and prevent huge offline exports.
  const length = Number(response.headers.get('content-length') || 0);
  if (length > 120 * 1024 * 1024) throw new Error('Il WAV supera 120 MB: usa il download originale.');
  const encoded = await response.arrayBuffer();
  if (encoded.byteLength > 120 * 1024 * 1024) throw new Error('Il WAV supera 120 MB: usa il download originale.');
  const decoder = new AudioContext();
  let buffer: AudioBuffer;
  try { buffer = await decoder.decodeAudioData(encoded); }
  finally { await decoder.close().catch(() => undefined); }
  if (buffer.duration > 600) throw new Error('Limite equalizzatore: 10 minuti.');
  const offline = new OfflineAudioContext(
    Math.min(2, Math.max(1, buffer.numberOfChannels)),
    buffer.length, buffer.sampleRate
  );
  const source = offline.createBufferSource();
  source.buffer = buffer;
  const filters = createEqNodes(offline, enabled ? bands : REMIX_EQ_FLAT);
  source.connect(filters.low);
  filters.preamp.connect(offline.destination);
  source.start(0);
  return writeEqWav(await offline.startRendering());
}
