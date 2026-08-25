import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPayload } from './sonara-engine-v9-dual-fast.mjs';

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
