import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMolabPayload } from './sonara-molab-xl-router.mjs';

const creator = {
  prompt: 'Original melodic techno track with evolving synth arrangement',
  genre: 'Melodic Techno',
  bpm: 124,
  durationSec: 30,
  generationProfileV3: 'ultra',
  vocalMode: 'instrumental',
  sonaraRealMusic: true
};

test('standard ACE-Step XL + LM 4B enables real-music mode without SONARA-specific markers', () => {
  const payload = buildMolabPayload(creator, 1, {
    llmInitialized: true,
    realismApiV1: false,
    loadedModel: 'acestep-v15-xl-turbo'
  });
  assert.equal(payload.model, 'acestep-v15-xl-turbo');
  assert.equal(payload.sonara_real_music_v1, true);
  assert.equal(payload.thinking, true);
});

test('quality profile uses the LM only when it is initialized and fast profile stays fast', () => {
  const quality = buildMolabPayload({ ...creator, generationProfileV3: 'quality' }, 1, {
    llmInitialized: true,
    realismApiV1: false
  });
  assert.equal(quality.sonara_real_music_v1, true);

  const notReady = buildMolabPayload(creator, 1, { llmInitialized: false });
  assert.equal(notReady.sonara_real_music_v1, false);

  const fast = buildMolabPayload({ ...creator, generationProfileV3: 'fast' }, 1, { llmInitialized: true });
  assert.equal(fast.sonara_real_music_v1, false);
});
