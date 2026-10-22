import test from 'node:test';
import assert from 'node:assert/strict';
import { buildMolabPayload, authorized, publicAudioUrl, verifySignedAudioUrl } from './sonara-molab-xl-router.mjs';
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

test('Dedicated GPU XL Turbo uses a loaded standard LM 4B even without custom realism flags', () => {
  const result = buildMolabPayload(brief, 1, {
    llmInitialized: true,
    realismApiV1: false,
    loadedModel: 'acestep-v15-xl-turbo'
  });
  assert.equal(result.model, 'acestep-v15-xl-turbo');
  assert.equal(result.sonara_real_music_v1, true);
  assert.equal(result.thinking, true);
});

test('Dedicated GPU real-music stays off if LM is not initialized', () => {
  const result = buildMolabPayload(brief, 1, { llmInitialized: false });
  assert.equal(result.sonara_real_music_v1, false);
});

test('fast profile preserves short inference mode', () => {
  const result = buildMolabPayload({ ...brief, generationProfileV3: 'fast' }, 1, { llmInitialized: true });
  assert.equal(result.sonara_real_music_v1, false);
  assert.equal(result.inference_steps, 1);
});

test('Dedicated GPU only suppresses YuE even if caller forces it', () => {
  const input = { forceYue: true, lyrics: 'Long form vocals', durationSec: 180 };
  assert.equal(shouldUseYue(input, { SONARA_DEDICATED_GPU_ONLY: 'true' }), false);
});

test('YuE remains available only when Dedicated-only lock is not set', () => {
  const input = { forceYue: true, lyrics: 'Long form vocals', durationSec: 180 };
  assert.equal(shouldUseYue(input, {}), true);
});

test('SONARA generation proxy denies all requests if the internal secret is absent', () => {
  const request = new Request('https://api.sonaraenterprise.com/api/engine/generate', {
    method: 'POST',
    headers: { 'X-Sonara-Internal-Secret': 'internal-key' }
  });
  assert.equal(authorized(request, {}), false);
  assert.equal(authorized(request, { SONARA_INTERNAL_PROXY_SECRET: 'different-key' }), false);
  assert.equal(authorized(request, { SONARA_INTERNAL_PROXY_SECRET: 'internal-key' }), true);
});

test('audio URLs have a valid private HMAC and reject tampering and expiration', async () => {
  const env = { ACE_STEP_API_KEY: 'unit-test-long-secret-not-a-production-key' };
  const now = Date.parse('2026-10-22T12:00:00Z');
  const url = new URL(await publicAudioUrl('/tmp/sonara-test.wav', env, now));
  assert.equal(await verifySignedAudioUrl(url, env, now), true);

  const tampered = new URL(url);
  tampered.searchParams.set('path', '/etc/passwd');
  assert.equal(await verifySignedAudioUrl(tampered, env, now), false);

  const unsigned = new URL(url);
  unsigned.searchParams.delete('sig');
  assert.equal(await verifySignedAudioUrl(unsigned, env, now), false);

  assert.equal(await verifySignedAudioUrl(url, env, now + 25 * 60 * 60 * 1000), false);
  assert.equal(await verifySignedAudioUrl(url, { ACE_STEP_API_KEY: 'another-secret' }, now), false);
});

test('signed links use the dedicated GPU audio endpoint', async () => {
  const env = { ACE_STEP_API_KEY: 'unit-test-not-a-production-secret' };
  const url = new URL(await publicAudioUrl('/tmp/example.wav', env));
  assert.equal(url.pathname, '/api/gpu/audio');
});
