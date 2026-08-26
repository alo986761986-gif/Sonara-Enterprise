export interface RealAudioAsset {
  id: string;
  label: string;
  url: string;
  format: string;
  source: 'master' | 'candidate' | 'stem' | 'local';
}

export function safeAudioFilename(value: string): string {
  return String(value || 'sonara-audio')
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'sonara-audio';
}

export function audioExtensionFromUrl(value: string, fallback = 'wav'): string {
  try {
    const parsed = new URL(value, window.location.origin);
    const pathHint = parsed.searchParams.get('path') || parsed.pathname;
    const match = pathHint.match(/\.([a-z0-9]{2,5})(?:$|[?#])/i);
    if (match?.[1]) return match[1].toLowerCase();
  } catch {
    const match = String(value).match(/\.([a-z0-9]{2,5})(?:$|[?#])/i);
    if (match?.[1]) return match[1].toLowerCase();
  }
  return fallback.toLowerCase();
}

export function audioExtensionFromMime(mime: string, fallback = 'wav'): string {
  const normalized = String(mime || '').toLowerCase();
  if (normalized.includes('wav') || normalized.includes('wave')) return 'wav';
  if (normalized.includes('mpeg') || normalized.includes('mp3')) return 'mp3';
  if (normalized.includes('flac')) return 'flac';
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('aac')) return 'aac';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  return fallback.toLowerCase();
}

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channelCount = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const sampleCount = buffer.length;
  const bytesPerSample = 2;
  const blockAlign = channelCount * bytesPerSample;
  const output = new ArrayBuffer(44 + sampleCount * blockAlign);
  const view = new DataView(output);

  const writeText = (offset: number, value: string) => {
    for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + sampleCount * blockAlign, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, sampleCount * blockAlign, true);

  const channels = Array.from({ length: channelCount }, (_, index) => buffer.getChannelData(index));
  let offset = 44;
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
      const sample = Math.max(-1, Math.min(1, channels[channelIndex][sampleIndex]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += bytesPerSample;
    }
  }

  return new Blob([output], { type: 'audio/wav' });
}

export async function decodeAudioFromUrl(url: string): Promise<AudioBuffer> {
  if (!url) throw new Error('Nessun file audio disponibile.');
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Impossibile leggere l'audio (HTTP ${response.status}).`);
  const bytes = await response.arrayBuffer();
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) throw new Error('Web Audio non supportato da questo browser.');
  const context: AudioContext = new AudioContextClass();
  try {
    return await context.decodeAudioData(bytes.slice(0));
  } finally {
    await context.close().catch(() => undefined);
  }
}

export async function downloadRealAudio(url: string, baseName: string, formatHint = 'wav'): Promise<string> {
  if (!url) throw new Error('Nessun file audio da esportare.');
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Download audio non riuscito (HTTP ${response.status}).`);
  const blob = await response.blob();
  const format = audioExtensionFromMime(blob.type, audioExtensionFromUrl(url, formatHint));
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `${safeAudioFilename(baseName)}.${format}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
  return format;
}

export function downloadBlob(blob: Blob, baseName: string, extension = 'wav'): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = `${safeAudioFilename(baseName)}.${extension}`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 3000);
}

function isAudioUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  if (!url) return false;
  return /^(https?:|blob:|\/)/i.test(url);
}

export function collectStemAssets(metadata: Record<string, any> | null | undefined): RealAudioAsset[] {
  const results: RealAudioAsset[] = [];
  const seen = new Set<string>();

  const add = (url: string, label: string) => {
    if (!isAudioUrl(url) || seen.has(url)) return;
    seen.add(url);
    results.push({
      id: `stem-${results.length + 1}`,
      label: label || `Stem ${results.length + 1}`,
      url,
      format: audioExtensionFromUrl(url, 'wav'),
      source: 'stem'
    });
  };

  const visit = (node: unknown, path: string[], depth: number) => {
    if (depth > 7 || node == null) return;
    const inStemContext = path.some(part => /stem|vocal|drum|bass|instrument|other/i.test(part));

    if (typeof node === 'string') {
      if (inStemContext && isAudioUrl(node)) add(node, path[path.length - 1] || 'Stem');
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, [...path, String(index + 1)], depth + 1));
      return;
    }

    if (typeof node !== 'object') return;
    const record = node as Record<string, any>;
    const directUrl = record.audioUrl || record.url || record.downloadUrl || record.fileUrl;
    const directLabel = String(record.name || record.label || record.type || record.instrument || path[path.length - 1] || 'Stem');
    if (inStemContext && isAudioUrl(directUrl)) add(directUrl, directLabel);

    Object.entries(record).forEach(([key, value]) => {
      if (isAudioUrl(value) && /stem|vocal|drum|bass|instrument|other/i.test(key)) add(value, key);
      else visit(value, [...path, key], depth + 1);
    });
  };

  visit(metadata || {}, [], 0);
  return results;
}

export function collectMasterAssets(
  audioUrl: string,
  audioFormat: string,
  metadata: Record<string, any> | null | undefined
): RealAudioAsset[] {
  const results: RealAudioAsset[] = [];
  const seen = new Set<string>();

  const add = (url: unknown, label: string, source: 'master' | 'candidate' = 'candidate', formatHint = 'wav') => {
    if (!isAudioUrl(url) || seen.has(url)) return;
    seen.add(url);
    results.push({
      id: `${source}-${results.length + 1}`,
      label,
      url,
      format: audioExtensionFromUrl(url, formatHint),
      source
    });
  };

  if (audioUrl) add(audioUrl, 'Master corrente', 'master', audioFormat || 'wav');

  const visit = (node: unknown, path: string[], depth: number) => {
    if (depth > 6 || node == null) return;
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, [...path, String(index + 1)], depth + 1));
      return;
    }
    if (typeof node !== 'object') return;
    const record = node as Record<string, any>;

    if (Array.isArray(record.audioUrls)) {
      record.audioUrls.forEach((url: unknown, index: number) => add(url, `Candidate ${String.fromCharCode(65 + index)}`, 'candidate'));
    }
    if (Array.isArray(record.candidates)) {
      record.candidates.forEach((candidate: any, index: number) => {
        add(candidate?.audioUrl || candidate?.url, candidate?.id ? `Candidate ${candidate.id}` : `Candidate ${String.fromCharCode(65 + index)}`, 'candidate', candidate?.audioFormat || 'wav');
      });
    }

    Object.entries(record).forEach(([key, value]) => {
      if (/stems?/i.test(key)) return;
      if (key === 'audioUrl' && isAudioUrl(value)) add(value, path.length ? 'Audio render' : 'Master', 'candidate');
      else visit(value, [...path, key], depth + 1);
    });
  };

  visit(metadata || {}, [], 0);
  return results;
}
