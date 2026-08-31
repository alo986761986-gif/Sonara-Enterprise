const MAX_AUDIO_BYTES = 6 * 1024 * 1024;
const BPM_MIN = 40;
const BPM_MAX = 220;
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = (value, digits = 2) => Number(Number(value || 0).toFixed(digits));
const db = value => value > 0 ? 20 * Math.log10(value) : -120;
const optionalBpm = value => {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= BPM_MIN && number <= BPM_MAX ? number : null;
};

function readAscii(view, offset, length) {
  let text = '';
  for (let i = 0; i < length && offset + i < view.byteLength; i += 1) {
    text += String.fromCharCode(view.getUint8(offset + i));
  }
  return text;
}

function parseWav(buffer) {
  const view = new DataView(buffer);
  if (view.byteLength < 44 || readAscii(view, 0, 4) !== 'RIFF' || readAscii(view, 8, 4) !== 'WAVE') {
    throw new Error('Audio Quality Engine: il file non e un WAV PCM valido.');
  }

  let offset = 12;
  let format = null;
  let dataOffset = -1;
  let declaredDataSize = 0;

  while (offset + 8 <= view.byteLength) {
    const id = readAscii(view, offset, 4);
    const size = view.getUint32(offset + 4, true);
    const payload = offset + 8;
    if (id === 'fmt ' && payload + Math.min(size, 16) <= view.byteLength) {
      format = {
        audioFormat: view.getUint16(payload, true),
        channels: view.getUint16(payload + 2, true),
        sampleRate: view.getUint32(payload + 4, true),
        byteRate: view.getUint32(payload + 8, true),
        blockAlign: view.getUint16(payload + 12, true),
        bitsPerSample: view.getUint16(payload + 14, true)
      };
    }
    if (id === 'data') {
      dataOffset = payload;
      declaredDataSize = size;
      break;
    }
    offset = payload + size + (size % 2);
  }

  if (!format || dataOffset < 0 || !format.channels || !format.sampleRate || !format.blockAlign) {
    throw new Error('Audio Quality Engine: intestazione WAV incompleta.');
  }
  if (![1, 3].includes(format.audioFormat) || ![16, 24, 32].includes(format.bitsPerSample)) {
    throw new Error(`Audio Quality Engine: formato WAV non supportato (${format.audioFormat}/${format.bitsPerSample}).`);
  }

  const availableBytes = Math.max(0, Math.min(declaredDataSize, view.byteLength - dataOffset));
  const frames = Math.floor(availableBytes / format.blockAlign);
  const declaredFrames = Math.floor(declaredDataSize / format.blockAlign);
  const durationSec = declaredFrames / format.sampleRate;
  return { view, ...format, dataOffset, availableBytes, frames, durationSec };
}

function sampleAt(wav, frame, channel) {
  const bytesPerSample = wav.bitsPerSample / 8;
  const offset = wav.dataOffset + frame * wav.blockAlign + channel * bytesPerSample;
  if (offset + bytesPerSample > wav.view.byteLength) return 0;

  if (wav.audioFormat === 3 && wav.bitsPerSample === 32) {
    return clamp(wav.view.getFloat32(offset, true), -1, 1);
  }
  if (wav.bitsPerSample === 16) return wav.view.getInt16(offset, true) / 32768;
  if (wav.bitsPerSample === 24) {
    let value = wav.view.getUint8(offset) | (wav.view.getUint8(offset + 1) << 8) | (wav.view.getUint8(offset + 2) << 16);
    if (value & 0x800000) value |= 0xff000000;
    return value / 8388608;
  }
  if (wav.bitsPerSample === 32) return wav.view.getInt32(offset, true) / 2147483648;
  return 0;
}

function monoSamples(wav) {
  const out = new Float32Array(wav.frames);
  const channels = Math.max(1, Math.min(wav.channels, 8));
  for (let frame = 0; frame < wav.frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) sum += sampleAt(wav, frame, channel);
    out[frame] = sum / channels;
  }
  return out;
}

function basicMetrics(samples) {
  if (!samples.length) throw new Error('Audio Quality Engine: WAV senza campioni audio.');
  let peak = 0;
  let sumSq = 0;
  let sum = 0;
  let clipped = 0;
  let silent = 0;
  let zeroCrossings = 0;
  let previous = samples[0] || 0;

  for (let i = 0; i < samples.length; i += 1) {
    const value = samples[i];
    const abs = Math.abs(value);
    peak = Math.max(peak, abs);
    sumSq += value * value;
    sum += value;
    if (abs >= 0.998) clipped += 1;
    if (abs <= 0.0005) silent += 1;
    if ((value >= 0 && previous < 0) || (value < 0 && previous >= 0)) zeroCrossings += 1;
    previous = value;
  }

  const rms = Math.sqrt(sumSq / samples.length);
  const crestDb = db(peak / Math.max(rms, 1e-9));
  return {
    peak,
    peakDb: db(peak),
    rms,
    rmsDb: db(rms),
    crestDb,
    clippingRatio: clipped / samples.length,
    silenceRatio: silent / samples.length,
    dcOffset: sum / samples.length,
    zeroCrossingRate: zeroCrossings / samples.length
  };
}

function onsetEnvelope(samples, sampleRate) {
  const hop = Math.max(64, Math.round(sampleRate * 0.01));
  const window = Math.max(hop * 2, Math.round(sampleRate * 0.025));
  const count = Math.max(0, Math.floor((samples.length - window) / hop));
  if (count < 32) return { flux: new Float32Array(0), rate: sampleRate / hop };

  const energy = new Float32Array(count);
  let sumSq = 0;
  for (let i = 0; i < Math.min(window, samples.length); i += 1) sumSq += samples[i] * samples[i];
  for (let frame = 0; frame < count; frame += 1) {
    const start = frame * hop;
    if (frame > 0) {
      const oldStart = start - hop;
      for (let i = oldStart; i < Math.min(oldStart + hop, samples.length); i += 1) sumSq -= samples[i] * samples[i];
      const addStart = Math.min(samples.length, start + window - hop);
      for (let i = addStart; i < Math.min(addStart + hop, samples.length); i += 1) sumSq += samples[i] * samples[i];
    }
    energy[frame] = Math.sqrt(Math.max(0, sumSq) / window);
  }

  const flux = new Float32Array(Math.max(0, energy.length - 1));
  let mean = 0;
  for (let i = 1; i < energy.length; i += 1) {
    const value = Math.max(0, energy[i] - energy[i - 1]);
    flux[i - 1] = value;
    mean += value;
  }
  mean /= Math.max(1, flux.length);
  for (let i = 0; i < flux.length; i += 1) flux[i] = Math.max(0, flux[i] - mean * 0.45);
  return { flux, rate: sampleRate / hop };
}

function detectBpm(samples, sampleRate, requestedBpm = null) {
  const { flux, rate } = onsetEnvelope(samples, sampleRate);
  if (flux.length < 32) return { detectedBpm: null, rawDetectedBpm: null, confidence: 0, tempoOctaveCorrected: false };

  let energy = 0;
  for (const value of flux) energy += value * value;
  if (energy <= 1e-12) return { detectedBpm: null, rawDetectedBpm: null, confidence: 0, tempoOctaveCorrected: false };

  const candidates = [];
  let maxScore = 0;
  for (let bpm = BPM_MIN; bpm <= BPM_MAX; bpm += 0.5) {
    const lag = rate * 60 / bpm;
    const lower = Math.max(1, Math.floor(lag));
    const frac = lag - lower;
    let score = 0;
    let normA = 0;
    let normB = 0;
    for (let i = lower + 1; i < flux.length; i += 1) {
      const shifted = flux[i - lower] * (1 - frac) + (flux[Math.max(0, i - lower - 1)] || 0) * frac;
      score += flux[i] * shifted;
      normA += flux[i] * flux[i];
      normB += shifted * shifted;
    }
    const normalized = score / Math.sqrt(Math.max(1e-12, normA * normB));
    maxScore = Math.max(maxScore, normalized);
    candidates.push({ bpm, normalized });
  }

  candidates.sort((a, b) => b.normalized - a.normalized);
  const raw = candidates[0] || { bpm: null, normalized: 0 };
  let chosen = raw;
  const requested = optionalBpm(requestedBpm);
  if (Number.isFinite(requested) && requested >= BPM_MIN && requested <= BPM_MAX) {
    const viable = candidates
      .filter(item => item.normalized >= raw.normalized * 0.86)
      .slice(0, 20)
      .sort((a, b) => {
        const aDistance = Math.min(Math.abs(a.bpm - requested), Math.abs(a.bpm * 2 - requested), Math.abs(a.bpm / 2 - requested));
        const bDistance = Math.min(Math.abs(b.bpm - requested), Math.abs(b.bpm * 2 - requested), Math.abs(b.bpm / 2 - requested));
        return aDistance - bDistance || b.normalized - a.normalized;
      });
    if (viable.length) chosen = viable[0];
  }

  let detected = chosen.bpm;
  let tempoOctaveCorrected = false;
  if (chosen.bpm && Number.isFinite(requested) && requested >= BPM_MIN && requested <= BPM_MAX) {
    const equivalentTempos = [chosen.bpm, chosen.bpm * 2, chosen.bpm / 2]
      .filter(value => value >= BPM_MIN && value <= BPM_MAX)
      .sort((a, b) => Math.abs(a - requested) - Math.abs(b - requested));
    if (equivalentTempos.length) {
      detected = equivalentTempos[0];
      tempoOctaveCorrected = Math.abs(detected - chosen.bpm) >= 0.25;
    }
  }

  return {
    detectedBpm: detected ? round(detected, 1) : null,
    rawDetectedBpm: raw.bpm ? round(raw.bpm, 1) : null,
    selectedAutocorrelationBpm: chosen.bpm ? round(chosen.bpm, 1) : null,
    tempoOctaveCorrected,
    confidence: round(clamp(chosen.normalized, 0, 1), 3),
    autocorrelationStrength: round(maxScore, 3)
  };
}

function goertzel(samples, sampleRate, start, length, frequency) {
  const omega = 2 * Math.PI * frequency / sampleRate;
  const coeff = 2 * Math.cos(omega);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  const end = Math.min(samples.length, start + length);
  for (let i = start; i < end; i += 1) {
    const windowPosition = (i - start) / Math.max(1, length - 1);
    const hann = 0.5 - 0.5 * Math.cos(2 * Math.PI * windowPosition);
    s0 = samples[i] * hann + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2);
}

function detectKey(samples, sampleRate) {
  if (samples.length < 4096) return { detectedKey: null, confidence: 0, method: 'approximate-chroma' };
  const chroma = new Float64Array(12);
  const windowLength = Math.min(8192, samples.length);
  const windows = Math.min(6, Math.max(1, Math.floor(samples.length / windowLength)));
  const spacing = Math.max(1, Math.floor((samples.length - windowLength) / Math.max(1, windows - 1)));

  for (let w = 0; w < windows; w += 1) {
    const start = Math.min(samples.length - windowLength, w * spacing);
    for (let pc = 0; pc < 12; pc += 1) {
      let power = 0;
      for (let octave = 3; octave <= 6; octave += 1) {
        const midi = 12 * (octave + 1) + pc;
        const frequency = 440 * Math.pow(2, (midi - 69) / 12);
        if (frequency < sampleRate * 0.45) power += goertzel(samples, sampleRate, start, windowLength, frequency);
      }
      chroma[pc] += Math.log1p(power);
    }
  }

  const total = Array.from(chroma).reduce((sum, value) => sum + value, 0);
  if (total <= 0) return { detectedKey: null, confidence: 0, method: 'approximate-chroma' };
  for (let i = 0; i < 12; i += 1) chroma[i] /= total;

  const scores = [];
  for (let root = 0; root < 12; root += 1) {
    for (const [mode, profile] of [['Major', MAJOR_PROFILE], ['Minor', MINOR_PROFILE]]) {
      let score = 0;
      let normC = 0;
      let normP = 0;
      for (let degree = 0; degree < 12; degree += 1) {
        const c = chroma[(root + degree) % 12];
        const p = profile[degree];
        score += c * p;
        normC += c * c;
        normP += p * p;
      }
      score /= Math.sqrt(Math.max(1e-12, normC * normP));
      scores.push({ root, mode, score });
    }
  }
  scores.sort((a, b) => b.score - a.score);
  const best = scores[0];
  const second = scores[1] || best;
  return {
    detectedKey: best ? `${NOTE_NAMES[best.root]} ${best.mode}` : null,
    confidence: best ? round(clamp((best.score - second.score) * 8 + 0.15, 0, 1), 3) : 0,
    correlation: best ? round(best.score, 3) : 0,
    method: 'approximate-chroma'
  };
}

function normalizeKey(value) {
  const text = String(value || '').trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  const match = text.match(/^([A-Ga-g])([#b]?)[\s_-]*(major|minor|maj|min)?/i);
  if (!match) return '';
  const root = match[1].toUpperCase() + (match[2] || '');
  const modeRaw = String(match[3] || '').toLowerCase();
  const mode = modeRaw === 'minor' || modeRaw === 'min' ? 'Minor' : 'Major';
  return `${root} ${mode}`;
}

function qualityScore(metrics, bpmReport, keyReport, requested = {}) {
  const requestedBpm = optionalBpm(requested.bpm);
  const hasRequestedBpm = requestedBpm !== null;
  const bpmError = hasRequestedBpm && bpmReport.detectedBpm
    ? Math.abs(bpmReport.detectedBpm - requestedBpm)
    : null;
  const bpmTolerance = hasRequestedBpm ? Math.max(2, requestedBpm * 0.015) : null;
  const bpmPassed = !hasRequestedBpm ? null : (bpmError !== null && bpmError <= bpmTolerance);

  let bpmPoints = !hasRequestedBpm ? 35 : bpmError === null ? 8 : clamp(35 - bpmError * 3.5, 0, 35);
  if (bpmPassed === true) bpmPoints = Math.max(bpmPoints, 32);

  const clippingPoints = metrics.clippingRatio <= 0.0001 ? 20 : clamp(20 - metrics.clippingRatio * 18000, 0, 20);
  const silencePoints = metrics.silenceRatio <= 0.04 ? 10 : clamp(10 - (metrics.silenceRatio - 0.04) * 40, 0, 10);
  const crestDistance = metrics.crestDb < 6 ? 6 - metrics.crestDb : metrics.crestDb > 20 ? metrics.crestDb - 20 : 0;
  const dynamicsPoints = clamp(15 - crestDistance * 1.5, 0, 15);
  const rmsPoints = metrics.rmsDb >= -30 && metrics.rmsDb <= -6 ? 8 : clamp(8 - Math.min(Math.abs(metrics.rmsDb + 30), Math.abs(metrics.rmsDb + 6)) * 0.5, 0, 8);
  const dcPoints = clamp(5 - Math.abs(metrics.dcOffset) * 250, 0, 5);
  const peakPoints = metrics.peak >= 0.25 && metrics.peak <= 1.001 ? 4 : clamp(metrics.peak * 12, 0, 4);

  const requestedKey = normalizeKey(requested.key);
  const detectedKey = normalizeKey(keyReport.detectedKey);
  const keyComparable = Boolean(requestedKey && detectedKey && keyReport.confidence >= 0.18);
  const keyPassed = !keyComparable || requestedKey === detectedKey;
  const keyPoints = !keyComparable ? 1.5 : keyPassed ? 3 : 0;

  const total = round(clamp(bpmPoints + clippingPoints + silencePoints + dynamicsPoints + rmsPoints + dcPoints + peakPoints + keyPoints, 0, 100), 1);
  const hardGate = bpmPassed !== false && metrics.clippingRatio < 0.001 && metrics.silenceRatio < 0.18 && metrics.peak > 0.15 && metrics.rms > 0.01;
  return {
    score: total,
    passed: hardGate && total >= 70,
    bpmPassed,
    bpmError: bpmError === null ? null : round(bpmError, 1),
    bpmTolerance: bpmTolerance === null ? null : round(bpmTolerance, 1),
    requestedKey: requestedKey || null,
    keyPassed,
    keyComparable
  };
}

export async function analyzeAudioCandidate(audioUrl, requested = {}, fetchImpl = fetch) {
  const startedAt = Date.now();
  if (!audioUrl) throw new Error('Audio Quality Engine: audio URL mancante.');
  const response = await fetchImpl(audioUrl, {
    method: 'GET',
    headers: { Range: `bytes=0-${MAX_AUDIO_BYTES - 1}`, Accept: 'audio/wav,audio/*;q=0.9,*/*;q=0.1' },
    signal: AbortSignal.timeout(90_000)
  });
  if (!response.ok && response.status !== 206) throw new Error(`Audio Quality Engine: HTTP ${response.status} durante analisi WAV.`);
  const buffer = await response.arrayBuffer();
  if (!buffer.byteLength) throw new Error('Audio Quality Engine: WAV vuoto.');

  const wav = parseWav(buffer);
  const mono = monoSamples(wav);
  const metrics = basicMetrics(mono);
  const bpmReport = detectBpm(mono, wav.sampleRate, requested.bpm);
  const keyReport = detectKey(mono, wav.sampleRate);
  const verdict = qualityScore(metrics, bpmReport, keyReport, requested);

  return {
    analyzer: 'sonara-audio-quality-engine-v1',
    measuredFromRealWav: true,
    analyzedBytes: buffer.byteLength,
    analyzedSeconds: round(mono.length / wav.sampleRate, 2),
    declaredDurationSec: round(wav.durationSec, 2),
    sampleRate: wav.sampleRate,
    channels: wav.channels,
    bitDepth: wav.bitsPerSample,
    peakDb: round(metrics.peakDb, 2),
    rmsDb: round(metrics.rmsDb, 2),
    crestDb: round(metrics.crestDb, 2),
    clippingRatio: round(metrics.clippingRatio, 6),
    silenceRatio: round(metrics.silenceRatio, 4),
    dcOffset: round(metrics.dcOffset, 5),
    zeroCrossingRate: round(metrics.zeroCrossingRate, 4),
    requestedBpm: optionalBpm(requested.bpm),
    detectedBpm: bpmReport.detectedBpm,
    rawDetectedBpm: bpmReport.rawDetectedBpm,
    selectedAutocorrelationBpm: bpmReport.selectedAutocorrelationBpm ?? null,
    tempoOctaveCorrected: bpmReport.tempoOctaveCorrected === true,
    bpmConfidence: bpmReport.confidence,
    bpmError: verdict.bpmError,
    bpmTolerance: verdict.bpmTolerance,
    bpmPassed: verdict.bpmPassed,
    requestedKey: verdict.requestedKey,
    detectedKey: keyReport.detectedKey,
    keyConfidence: keyReport.confidence,
    keyVerification: keyReport.method,
    keyComparable: verdict.keyComparable,
    keyPassed: verdict.keyPassed,
    qualityScore: verdict.score,
    qualityGatePassed: verdict.passed,
    analyzedInMs: Date.now() - startedAt
  };
}

export function rankQualityReports(reports = []) {
  return [...reports].sort((a, b) => {
    if (Boolean(a.qualityGatePassed) !== Boolean(b.qualityGatePassed)) return a.qualityGatePassed ? -1 : 1;
    if (Boolean(a.bpmPassed) !== Boolean(b.bpmPassed)) return a.bpmPassed ? -1 : 1;
    return Number(b.qualityScore || 0) - Number(a.qualityScore || 0);
  });
}
