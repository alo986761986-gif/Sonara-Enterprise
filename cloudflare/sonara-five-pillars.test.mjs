import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeAudioCandidate } from './sonara-audio-quality-engine.mjs';
import { applyR2GenerationProfile } from './sonara-r2-generation-profile.mjs';

function clickWav(bpm, seconds = 18, sampleRate = 12000) {
  const samples = seconds * sampleRate;
  const bytes = 44 + samples * 2;
  const array = new ArrayBuffer(bytes);
  const view = new DataView(array);
  const ascii = (offset, string) => { for (let i = 0; i < string.length; i++) view.setUint8(offset + i, string.charCodeAt(i)); };
  ascii(0, 'RIFF'); view.setUint32(4, bytes - 8, true);
  ascii(8, 'WAVE'); ascii(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, 'data'); view.setUint32(40, samples * 2, true);
  const beat = sampleRate * 60 / bpm;
  for (let i = 0; i < samples; i++) {
    const phase = i % beat;
    const audio = phase < 360 ? 26000 * Math.exp(-phase / 40) : 0;
    view.setInt16(44 + i * 2, Math.round(audio), true);
  }
  return array;
}
const fetchAudio = wav => async () => ({ ok: true, status: 200, arrayBuffer: async () => wav });

test('Studio never certifies 85 BPM half-time as 170 BPM exact', async () => {
  const report = await analyzeAudioCandidate('https://sonara.test/fixture.wav', { bpm: 170 }, fetchAudio(clickWav(85)));
  assert.notEqual(report.bpmPassed, true);
  assert.notEqual(report.bpmStatus, 'verified');
  assert.equal(report.requestedBpm, 170);
});

test('Studio does not invent a manual tempo without a BPM request', async () => {
  const report = await analyzeAudioCandidate('https://sonara.test/fixture.wav', {}, fetchAudio(clickWav(120)));
  assert.equal(report.bpmPassed, null);
  assert.equal(report.bpmStatus, 'not-requested');
});

test('two-track quality profile uses native batch two, 8 steps and LM4B planning', () => {
  const payload = { model: 'acestep-v15-xl-turbo', bpm: 170, audio_duration: 30, batch_size: 2, prompt: 'Jazz fusion', lyrics: '[Instrumental]', task_type: 'text2music' };
  const body = { bpm: 170, generationProfileV3: 'quality', genre: 'Jazz Fusion', sonaraForcePairQuality: true };
  const final = applyR2GenerationProfile(payload, body, body);
  assert.equal(final.batch_size, 2);
  assert.equal(final.thinking, true);
  assert.equal(final.inference_steps, 8);
  assert.equal(final.bpm, 170);
  assert.equal(final.sonara_natural_instrument_ab_required, true);
});

test('Instant cannot silently masquerade as a quality two-track request at R2 layer', () => {
  const payload = { model: 'acestep-v15-xl-turbo', bpm: 170, audio_duration: 30, batch_size: 2, prompt: 'Jazz fusion' };
  const body = { generationProfileV3: 'fast', bpm: 170 };
  const final = applyR2GenerationProfile(payload, body, body);
  assert.equal(final.batch_size, 1);
  assert.equal(final.thinking, false);
});
