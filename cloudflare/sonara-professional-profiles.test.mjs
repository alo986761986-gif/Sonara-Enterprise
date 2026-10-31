import test from 'node:test';
import assert from 'node:assert/strict';
import { applyR2GenerationProfile, r2GenerationMetadata } from './sonara-r2-generation-profile.mjs';

const source = {
  genre: 'Jazz', subgenre: 'Jazz Fusion', mood: 'Energetic',
  rawPrompt: 'Live jazz fusion quartet at 170 BPM',
  selectedInstruments: ['Piano', 'Electric Bass', 'Acoustic Drum Kit'],
  lyrics: '',
};
const payload = {
  model: 'acestep-v15-xl-turbo',
  prompt: source.rawPrompt,
  lyrics: '',
  batch_size: 2,
  bpm: 170,
  audio_duration: 120,
  seed: 456,
  enable_normalization: true,
  normalization_db: -1,
};

test('Professional aliases select existing 8-step quality rendering', () => {
  for (const alias of ['professional', 'pro', 'realistic', 'high-quality', 'studio-professional']) {
    const body = { ...source, generationProfileV3: alias };
    const result = applyR2GenerationProfile(payload, body, body);
    assert.equal(result.sonara_r2_generation_profile, 'quality', alias);
    assert.equal(result.inference_steps, 8, alias);
    assert.equal(result.shift, 3, alias);
    assert.equal(result.thinking, true, alias);
    assert.equal(result.model, payload.model);
    assert.equal(result.bpm, payload.bpm);
  }
});

test('Studio Ultra aliases preserve existing ultra profile', () => {
  for (const alias of ['studio ultra', 'studio_ultra', 'studio-max']) {
    const body = { ...source, generationProfileV3: alias };
    const result = applyR2GenerationProfile(payload, body, body);
    assert.equal(result.sonara_r2_generation_profile, 'ultra', alias);
    assert.equal(result.inference_steps, 8, alias);
    assert.equal(result.batch_size, 2, alias);
    assert.equal(r2GenerationMetadata(body).generationProfile, 'ultra', alias);
  }
});

test('Opt-in quality-first upgrades only opted-in instant jobs', () => {
  const before = JSON.stringify(payload);
  const fastBody = { ...source, generationProfileV3: 'instant' };
  const fast = applyR2GenerationProfile(payload, fastBody, fastBody);
  assert.equal(fast.inference_steps, 1);
  assert.equal(fast.thinking, false);
  const body = { ...fastBody, sonaraQualityFirst: true };
  const professional = applyR2GenerationProfile(payload, body, body);
  assert.equal(professional.inference_steps, 8);
  assert.equal(professional.thinking, true);
  assert.equal(professional.sonara_instant_mode, false);
  assert.equal(JSON.stringify(payload), before);
});

test('A/B quality contract preserves two candidates and physical performance instructions', () => {
  const body = { ...source, generationProfileV3: 'professional' };
  const result = applyR2GenerationProfile(payload, body, body);
  assert.equal(result.batch_size, 2);
  assert.match(result.prompt, /SONARA A\/B PERFORMANCE CONTRACT/);
  assert.match(result.prompt, /neither candidate may collapse into placeholder drums/);
  assert.match(result.prompt, /Acoustic Drum Kit/);
});
