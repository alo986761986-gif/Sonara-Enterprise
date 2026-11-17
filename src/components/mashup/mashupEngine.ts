/**
 * SONARA Mashup Studio: conservative browser-side, non-destructive stereo arranger.
 * Does not claim source separation, pitch-preserving time stretch or GPU AI.
 * Heavy AI stem rendering must be a separate authenticated server integration.
 */
export type MashupMode = 'club' | 'transitions' | 'conversation';
export type MashupTrack = {
  buffer: AudioBuffer;
  bpm: number;
  offset: number;
};
export type MashupSettings = {
  mode: MashupMode;
  targetBpm: number;
  durationSec: number;
  blend: number;
  crossfadeSec: number;
  bassB: number;
  midB: number;
  trebleB: number;
};
export type MashupPlan = {
  durationSec: number;
  targetBpm: number;
  phraseSec: number;
  ratios: [number, number];
  warnings: string[];
};

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Number.isFinite(n) ? n : lo));

export function estimateBpm(buffer: Pick<AudioBuffer, 'sampleRate' | 'length' | 'getChannelData'>): {
  bpm: number | null; confidence: number;
} {
  if (buffer.sampleRate < 8000 || buffer.length < buffer.sampleRate * 8) {
    return {bpm: null, confidence: 0};
  }
  const samples = buffer.getChannelData(0);
  const hop = Math.max(1, Math.round(buffer.sampleRate / 100));
  const frames = Math.min(Math.floor(buffer.length / hop), 9000);
  const envelope = new Float32Array(frames);
  let previous = 0;
  for (let frame = 0; frame < frames; frame++) {
    const from = frame * hop;
    let energy = 0;
    for (let p = 0; p < 16; p++) {
      const index = from + Math.floor((p * hop) / 16);
      if (index < samples.length) energy += Math.abs(samples[index]);
    }
    energy /= 16;
    envelope[frame] = Math.max(0, energy - previous * 0.8);
    previous = energy;
  }
  let bestBpm = 0;
  let best = 0;
  let total = 0;
  const lagScores: number[] = [];
  for (let bpm = 70; bpm <= 180; bpm++) {
    const lag = Math.round((60 * buffer.sampleRate) / (bpm * hop));
    let score = 0;
    for (let i = 0; i + lag < frames; i++) {
      score += envelope[i] * envelope[i + lag];
    }
    lagScores.push(score);
    total += score;
    if (score > best) { best = score; bestBpm = bpm; }
  }
  const average = total / lagScores.length;
  const confidence = best && average > 0 ? clamp((best / average - 1) / 4, 0, 1) : 0;
  if (!bestBpm || confidence < 0.22) return {bpm: null, confidence};
  return {bpm: bestBpm, confidence};
}

export function waveformPeaks(buffer: Pick<AudioBuffer, 'length' | 'getChannelData'>, bars = 72): number[] {
  const samples = buffer.getChannelData(0);
  const width = Math.max(1, Math.floor(buffer.length / bars));
  return Array.from({length: bars}, (_, i) => {
    const start = i * width;
    const end = Math.min(samples.length, start + width);
    let peak = 0;
    const step = Math.max(1, Math.floor(width / 140));
    for (let pos = start; pos < end; pos += step) peak = Math.max(peak, Math.abs(samples[pos]));
    return clamp(peak, 0.07, 1);
  });
}

export function tempoRatio(target: number, detected: number): number {
  if (!(target >= 60 && target <= 200 && detected >= 60 && detected <= 220)) {
    throw new Error('Controlla i BPM dei brani (60-200 per il master).');
  }
  const candidates = [detected / 2, detected, detected * 2];
  const corrected = candidates.reduce((best, candidate) =>
    Math.abs(Math.log(target / candidate)) < Math.abs(Math.log(target / best))
      ? candidate : best, candidates[0]);
  const ratio = target / corrected;
  if (ratio < 0.88 || ratio > 1.12) {
    throw new Error('I BPM non sono compatibili entro il 12%. Verifica manualmente il BPM dei due brani.');
  }
  return ratio;
}

export function buildMashupPlan(a: MashupTrack, b: MashupTrack, settings: MashupSettings): MashupPlan {
  const durationSec = Math.round(clamp(settings.durationSec, 20, 300));
  const targetBpm = clamp(settings.targetBpm, 60, 200);
  if (!a.buffer || !b.buffer || a.buffer.duration < 10 || b.buffer.duration < 10) {
    throw new Error('Carica due brani audio leggibili di almeno 10 secondi.');
  }
  const ratioA = tempoRatio(targetBpm, a.bpm);
  const ratioB = tempoRatio(targetBpm, b.bpm);
  const warnings: string[] = [];
  if (Math.abs(ratioA - 1) > 0.035 || Math.abs(ratioB - 1) > 0.035) {
    warnings.push('Il beatmatching cambia la velocità e anche l’intonazione: per il time-stretch senza variazione di pitch serve il motore GPU.');
  }
  if (Math.max(0, a.buffer.duration - a.offset) / ratioA < durationSec ||
      Math.max(0, b.buffer.duration - b.offset) / ratioB < durationSec) {
    warnings.push('Almeno una sorgente è più corta del mashup: verrà ripetuta in loop.');
  }
  warnings.push('Le sorgenti stereo NON sono separate in voci e strumenti: il blend non può isolare una voce.');
  return {
    durationSec, targetBpm,
    phraseSec: 4 * 8 * 60 / targetBpm,
    ratios: [ratioA, ratioB],
    warnings
  };
}

function levels(mode: MashupMode, index: number, blend: number): [number, number] {
  const b = clamp(blend, 0, 100) / 100;
  if (mode === 'club') {
    // A is the stable foundation; B receives high-pass below to keep one bass/kick.
    const pattern = [0.02, 0.45, 0.76, 0.52, 0.85, 0.56, 0.25, 0.02];
    return [0.82, pattern[index % pattern.length] * b * 0.64];
  }
  if (mode === 'conversation') {
    return index % 2 === 0 ? [0.84, 0.03] : [0.09, 0.84 * b];
  }
  return index % 2 === 0 ? [0.88, 0.02] : [0.02, 0.88 * b];
}

function automateMix(context: OfflineAudioContext, gainA: GainNode, gainB: GainNode,
  plan: MashupPlan, settings: MashupSettings) {
  const timePerPhrase = plan.phraseSec;
  const fade = clamp(settings.crossfadeSec, 0.25, Math.min(8, timePerPhrase / 3));
  const [initialA, initialB] = levels(settings.mode, 0, settings.blend);
  gainA.gain.setValueAtTime(initialA, 0);
  gainB.gain.setValueAtTime(initialB, 0);
  for (let phrase = 1; phrase * timePerPhrase < plan.durationSec; phrase++) {
    const boundary = phrase * timePerPhrase;
    const start = Math.max(0, boundary - fade / 2);
    const end = Math.min(plan.durationSec, boundary + fade / 2);
    const old = levels(settings.mode, phrase - 1, settings.blend);
    const next = levels(settings.mode, phrase, settings.blend);
    gainA.gain.setValueAtTime(old[0], start);
    gainB.gain.setValueAtTime(old[1], start);
    gainA.gain.linearRampToValueAtTime(next[0], end);
    gainB.gain.linearRampToValueAtTime(next[1], end);
  }
  const tail = Math.min(1.2, plan.durationSec / 8);
  gainA.gain.setTargetAtTime(0, Math.max(0, plan.durationSec - tail), tail / 3);
  gainB.gain.setTargetAtTime(0, Math.max(0, plan.durationSec - tail), tail / 3);
  void context;
}

/** A real offline browser render: two decoded stereo recordings, beatmatched,
 * with envelope automation, B frequency control, dynamic guard, and 16-bit WAV. */
export async function renderMashup(
  a: MashupTrack, b: MashupTrack, settings: MashupSettings,
  onStage?: (stage: string) => void
): Promise<Blob> {
  const plan = buildMashupPlan(a, b, settings);
  if (typeof OfflineAudioContext === 'undefined') {
    throw new Error('Il browser non supporta il rendering audio offline.');
  }
  onStage?.('Preparazione arrangiamento e sincronizzazione');
  const rate = 44100;
  const context = new OfflineAudioContext(2, Math.ceil(plan.durationSec * rate), rate);
  const master = context.createDynamicsCompressor();
  master.threshold.value = -14;
  master.knee.value = 7;
  master.ratio.value = 2.8;
  master.attack.value = 0.004;
  master.release.value = 0.18;
  const output = context.createGain();
  output.gain.value = 0.94;
  master.connect(output);
  output.connect(context.destination);
  const sources = [a, b];
  const gains = sources.map(() => context.createGain());
  sources.forEach((track, index) => {
    const source = context.createBufferSource();
    source.buffer = track.buffer;
    source.playbackRate.value = plan.ratios[index];
    const offset = clamp(track.offset, 0, Math.max(0, track.buffer.duration - 0.25));
    source.loop = true;
    source.loopStart = offset;
    source.loopEnd = track.buffer.duration;
    if (index === 1) {
      const bass = context.createBiquadFilter();
      bass.type = 'lowshelf'; bass.frequency.value = 150;
      bass.gain.value = clamp(settings.bassB, -12, 12);
      const middle = context.createBiquadFilter();
      middle.type = 'peaking'; middle.frequency.value = 1000;
      middle.Q.value = 0.8; middle.gain.value = clamp(settings.midB, -12, 12);
      const treble = context.createBiquadFilter();
      treble.type = 'highshelf'; treble.frequency.value = 5000;
      treble.gain.value = clamp(settings.trebleB, -12, 12);
      source.connect(bass); bass.connect(middle); middle.connect(treble);
      if (settings.mode === 'club') {
        const filter = context.createBiquadFilter();
        filter.type = 'highpass'; filter.frequency.value = 175; filter.Q.value = 0.65;
        treble.connect(filter); filter.connect(gains[index]);
      } else {
        treble.connect(gains[index]);
      }
    } else source.connect(gains[index]);
    gains[index].connect(master);
    source.start(0, offset);
    source.stop(plan.durationSec);
  });
  automateMix(context, gains[0], gains[1], plan, settings);
  onStage?.('Rendering WAV stereo offline');
  const result = await context.startRendering();
  onStage?.('Analisi picchi ed esportazione WAV');
  return encodeWav16(result);
}

export function encodeWav16(buffer: Pick<AudioBuffer, 'length' | 'numberOfChannels' | 'sampleRate' | 'getChannelData'>): Blob {
  if (buffer.numberOfChannels !== 2 || buffer.sampleRate < 8000 || buffer.sampleRate > 96000) {
    throw new Error('Il master deve essere stereo PCM con sample rate valido.');
  }
  const bytes = buffer.length * 4;
  if (bytes > 64 * 1024 * 1024) throw new Error('Master troppo grande per questo browser.');
  const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
  if (left.length < buffer.length || right.length < buffer.length) throw new Error('PCM incompleto.');
  let peak = 0;
  for (let i = 0; i < buffer.length; i++) {
    if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) throw new Error('PCM non valido.');
    peak = Math.max(peak, Math.abs(left[i]), Math.abs(right[i]));
  }
  const attenuate = peak > 0.98 ? 0.98 / peak : 1;
  const array = new ArrayBuffer(44 + bytes);
  const view = new DataView(array);
  const tag = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
  };
  tag(0, 'RIFF'); view.setUint32(4, bytes + 36, true); tag(8, 'WAVE');
  tag(12, 'fmt '); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 2, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * 4, true);
  view.setUint16(32, 4, true); view.setUint16(34, 16, true);
  tag(36, 'data'); view.setUint32(40, bytes, true);
  let p = 44;
  for (let i = 0; i < buffer.length; i++) {
    const l = clamp(left[i] * attenuate, -1, 1);
    const r = clamp(right[i] * attenuate, -1, 1);
    view.setInt16(p, Math.round(l < 0 ? l * 32768 : l * 32767), true); p += 2;
    view.setInt16(p, Math.round(r < 0 ? r * 32768 : r * 32767), true); p += 2;
  }
  return new Blob([array], {type: 'audio/wav'});
}
