import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPayload, resolveCreativeControls } from './sonara-engine-v9-dual-fast.mjs';
import sonaraWorker from './sonara-engine-v9-dual-fast.mjs';

test('dual-fast keeps the Studio eight-minute duration', () => {
  const payload = buildPayload({
    prompt: 'Create two distinct professional Studio tracks.',
    durationSec: 480,
    bpm: 124,
  }, {});

  assert.equal(payload.audio_duration, 480);
  assert.equal(payload.batch_size, 2);
});

test('dual-fast never exceeds the supported Studio product limit', () => {
  const payload = buildPayload({ prompt: 'Long-form Studio track.', durationSec: 900 }, {});
  assert.equal(payload.audio_duration, 480);
});

test('long-form dual generation starts two memory-safe independent renders', async () => {
  const cacheEntries = new Map();
  const previousCaches = globalThis.caches;
  const previousFetch = globalThis.fetch;
  const releasedPayloads = [];

  globalThis.caches = {
    default: {
      async put(key, value) { cacheEntries.set(key.url, value.clone()); },
      async match(key) { return cacheEntries.get(key.url)?.clone(); },
    },
  };
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.endsWith('/v1/models')) return Response.json({ data: { models: [{ name: 'acestep-v15-xl-turbo' }] } });
    if (href.endsWith('/release_task')) {
      releasedPayloads.push(JSON.parse(String(init.body || '{}')));
      return Response.json({ data: { task_id: `long-${releasedPayloads.length}` } });
    }
    throw new Error(`Unexpected fetch ${href}`);
  };

  try {
    const response = await sonaraWorker.fetch(new Request('https://api.sonaraenterprise.com/api/engine/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Eight minute studio arrangement.', durationSec: 480, dualFast: true, candidateCount: 2 }),
    }), { MODAL_PROXY_KEY: 'key', MODAL_PROXY_SECRET: 'secret' }, {});
    const started = await response.json();
    assert.equal(response.status, 200);
    assert.equal(started.status, 'PROCESSING');
    assert.equal(started.metadata.performanceProfile, 'dual-safe-independent-v1');
    assert.equal(releasedPayloads.length, 2);
    assert.ok(releasedPayloads.every(payload => payload.audio_duration === 480));
    assert.ok(releasedPayloads.every(payload => payload.batch_size === 1));
  } finally {
    globalThis.caches = previousCaches;
    globalThis.fetch = previousFetch;
  }
});

test('dual-fast applies Weirdness and Style Influence to the native batch', () => {
  const low = resolveCreativeControls({ weirdness: 0, styleInfluence: 0 });
  const high = resolveCreativeControls({ weirdness: 100, styleInfluence: 100 });
  assert.ok(high.lmTemperature > low.lmTemperature);
  assert.ok(high.lmTopP > low.lmTopP);
  assert.ok(high.lmCfgScale > low.lmCfgScale);

  const payload = buildPayload({
    prompt: 'Experimental but style-aware dual generation.',
    weirdness: 90,
    styleInfluence: 85,
  }, {});
  assert.equal(payload.infer_method, 'sde');
  assert.equal(payload.lm_temperature, resolveCreativeControls({ weirdness: 90 }).lmTemperature);
  assert.equal(payload.lm_cfg_scale, resolveCreativeControls({ styleInfluence: 85 }).lmCfgScale);
});

test('recovers a failed native dual batch with two safe independent renders', async () => {
  const cacheEntries = new Map();
  const previousCaches = globalThis.caches;
  const previousFetch = globalThis.fetch;
  let releaseCount = 0;

  globalThis.caches = {
    default: {
      async put(key, value) { cacheEntries.set(key.url, value.clone()); },
      async match(key) { return cacheEntries.get(key.url)?.clone(); },
    },
  };
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    if (href.endsWith('/v1/models')) return Response.json({ data: { models: [{ name: 'acestep-v15-xl-turbo' }] } });
    if (href.endsWith('/release_task')) {
      releaseCount += 1;
      return Response.json({ data: { task_id: releaseCount === 1 ? 'native-dual' : `safe-${releaseCount - 1}` } });
    }
    if (href.endsWith('/query_result')) {
      const request = JSON.parse(String(init.body || '{}'));
      if (request.task_id_list?.[0] === 'native-dual') {
        return Response.json({ data: [{ status: 2, error: 'Native batch rejected.' }] });
      }
      return Response.json({
        data: [
          { status: 1, result: JSON.stringify([{ file: '/tmp/safe-a.wav' }]) },
          { status: 1, result: JSON.stringify([{ file: '/tmp/safe-b.wav' }]) },
        ],
      });
    }
    throw new Error(`Unexpected fetch ${href}`);
  };

  try {
    const start = await sonaraWorker.fetch(new Request('https://api.sonaraenterprise.com/api/engine/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'Create two reliable Deep House tracks.', dualFast: true, candidateCount: 2 }),
    }), { MODAL_PROXY_KEY: 'key', MODAL_PROXY_SECRET: 'secret' }, {});
    const started = await start.json();
    assert.equal(start.status, 202);

    const firstPoll = await sonaraWorker.fetch(new Request(`https://api.sonaraenterprise.com/api/music/job/${started.jobId}`), { MODAL_PROXY_KEY: 'key', MODAL_PROXY_SECRET: 'secret' }, {});
    const recovering = await firstPoll.json();
    assert.equal(recovering.status, 'PROCESSING');
    assert.equal(recovering.metadata.performanceProfile, 'dual-safe-independent-v1');
    assert.equal(releaseCount, 3);

    const secondPoll = await sonaraWorker.fetch(new Request(`https://api.sonaraenterprise.com/api/music/job/${started.jobId}`), { MODAL_PROXY_KEY: 'key', MODAL_PROXY_SECRET: 'secret' }, {});
    const completed = await secondPoll.json();
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.candidates.length, 2);
    assert.match(completed.candidates[0].audioUrl, /safe-a\.wav/);
    assert.match(completed.candidates[1].audioUrl, /safe-b\.wav/);
  } finally {
    globalThis.caches = previousCaches;
    globalThis.fetch = previousFetch;
  }
});
