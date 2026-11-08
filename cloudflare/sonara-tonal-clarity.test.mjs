import test from 'node:test';
import assert from 'node:assert/strict';
import { mixMasterPlan } from './sonara-mix-master-v1.mjs';
import { applyR2GenerationProfile } from './sonara-r2-generation-profile.mjs';

test('SONARA retains genre context and asks for non-muddy tonal balance', () => {
  for (const genre of ['Jazz', 'House', 'Classical', 'Pop']) {
    const plan = mixMasterPlan({ genre, selectedInstruments: ['Piano', 'Bass'] });
    assert.match(plan.cue, /avoid an excessively dark, veiled or muddy mix/);
    assert.match(plan.cue, /200-500 Hz/);
    assert.match(plan.cue, /do not use a global treble boost/);
    assert.match(plan.cue, /keep musical dynamics inside the performance/);
  }
});

test('quality generation includes tonal clarity without modifying lyrics or time', () => {
  const original = {
    prompt: 'Delicate Italian jazz with natural cymbals',
    lyrics: '[Verse]\nTi sento vicino.',
    genre: 'Jazz',
    generationProfileV3: 'quality',
    selectedInstruments: ['Piano', 'Bass'],
  };
  const engine = {
    prompt: original.prompt,
    lyrics: original.lyrics,
    audio_duration: 42,
    batch_size: 1,
    task_type: 'text2music',
    audio_format: 'wav',
    enable_normalization: true,
    normalization_db: -1.2,
  };
  const next = applyR2GenerationProfile(engine, original, original);
  assert.match(next.prompt, /avoid an excessively dark, veiled or muddy mix/);
  assert.match(next.prompt, /deliberately warm genre/);
  assert.equal(next.lyrics, original.lyrics);
  assert.equal(next.audio_duration, 42);
  assert.equal(next.batch_size, 1);
  assert.equal(next.task_type, 'text2music');
  assert.equal(next.audio_format, 'wav');
  assert.equal(next.normalization_db <= -1.2, true);
});

test('FAST keeps the original text prompt without adding mix-master conditioning', () => {
  const user = { prompt: 'Bright piano, simple ensemble', generationProfileV3: 'fast' };
  const engine = { prompt: user.prompt, audio_duration: 15, batch_size: 1, audio_format: 'wav' };
  const next = applyR2GenerationProfile(engine, user, user);
  assert.doesNotMatch(next.prompt, /tonal clarity:/);
  assert.equal(next.audio_duration, 15);
});
