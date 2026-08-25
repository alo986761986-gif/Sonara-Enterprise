import assert from 'node:assert/strict';
import test from 'node:test';

import { buildPayload, resolveCreativeControls } from './sonara-engine-v9-dual-fast.mjs';

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
