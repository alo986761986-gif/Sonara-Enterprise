import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMolabPayload } from './sonara-molab-xl-router.mjs';
import { shouldUseYue } from './sonara-yue-router.mjs';

const brief = {
  prompt: 'Original melodic techno with evolving analogue synthesizer phrases',
  genre: 'Melodic Techno',
  bpm: 124,
  durationSec: 30,
  generationProfileV3: 'ultra',
  vocalMode: 'instrumental',
  sonaraRealMusic: true
};

test('MoLab XL Turbo uses a loaded standard LM 4B even without custom realism flags', () => {
  const result = buildMolabPayload(brief, 1, {
    llmInitialized: true,
    realismApiV1: false,
    loadedModel: 'acestep-v15-xl-turbo'
  });
  assert.equal(result.model, 'acestep-v15-xl-turbo');
  assert.equal(result.sonara_real_music_v1, true);
  assert.equal(result.thinking, true);
});

test('MoLab real-music stays off if LM is not initialized', () => {
  const result = buildMolabPayload(brief, 1, { llmInitialized: false });
  assert.equal(result.sonara_real_music_v1, false);
});

test('fast profile preserves short inference mode', () => {
  const result = buildMolabPayload({ ...brief, generationProfileV3: 'fast' }, 1, { llmInitialized: true });
  assert.equal(result.sonara_real_music_v1, false);
  assert.equal(result.inference_steps, 1);
});

test('MoLab only suppresses YuE even if caller forces it', () => {
  const input = { forceYue: true, lyrics: 'Long form vocals', durationSec: 180 };
  assert.equal(shouldUseYue(input, { SONARA_MOLAB_ONLY: 'true' }), false);
});

test('YuE remains available only when MoLab-only lock is not set', () => {
  const input = { forceYue: true, lyrics: 'Long form vocals', durationSec: 180 };
  assert.equal(shouldUseYue(input, {}), true);
});
