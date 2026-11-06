import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMolabR2RelayPayload } from './sonara-molab-xl-router.mjs';

const request = {
  prompt: 'Instrumental live Jazz Fusion quartet with acoustic drums, electric bass, Rhodes piano, and guitar.',
  rawPrompt: 'Instrumental live Jazz Fusion quartet with acoustic drums, electric bass, Rhodes piano, and guitar.',
  genre: 'Jazz',
  subgenre: 'Jazz Fusion',
  selectedInstruments: ['Acoustic Drum Kit', 'Electric Bass', 'Rhodes', 'Electric Guitar'],
  generationProfileV3: 'professional',
  bpm: 170,
  duration: 45,
  audio_duration: 45,
  vocalMode: 'instrumental',
  lyrics: '',
  candidateCount: 2,
  seed: 174170,
};

test('real SONARA MoLab/R2 payload router respects professional 8-step audio configuration', async () => {
  const payload = await prepareMolabR2RelayPayload(request);
  assert.equal(payload.sonara_r2_generation_profile, 'quality');
  assert.equal(payload.inference_steps, 8);
  assert.equal(payload.shift, 3);
  assert.equal(payload.thinking, true);
  assert.equal(payload.model, 'acestep-v15-xl-turbo');
  assert.match(payload.prompt, /Jazz Fusion/i);
  assert.match(payload.prompt, /Acoustic Drum Kit/i);
});

test('real SONARA MoLab/R2 payload router keeps explicit quality-first request', async () => {
  const payload = await prepareMolabR2RelayPayload({
    ...request, generationProfileV3: 'instant', sonaraQualityFirst: true,
  });
  assert.equal(payload.sonara_r2_generation_profile, 'quality');
  assert.equal(payload.inference_steps, 8);
  assert.equal(payload.sonara_instant_mode, false);
});

test('real SONARA MoLab/R2 payload router preserves plain instant preview', async () => {
  const payload = await prepareMolabR2RelayPayload({ ...request, generationProfileV3: 'instant' });
  assert.equal(payload.sonara_r2_generation_profile, 'fast');
  assert.equal(payload.inference_steps, 1);
  assert.equal(payload.thinking, false);
});
