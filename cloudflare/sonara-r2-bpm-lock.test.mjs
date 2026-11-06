import test from 'node:test';
import assert from 'node:assert/strict';
import { applyR2GenerationProfile, requestedR2Bpm, r2GenerationMetadata } from './sonara-r2-generation-profile.mjs';

const job = {
  model: 'acestep-v15-xl-turbo',
  task_type: 'text2music',
  lyrics: '',
  prompt: 'Test instrumental',
  bpm: 124,
  audio_duration: 30,
  batch_size: 2,
  inference_steps: 8,
  thinking: true,
  audio_format: 'wav'
};

const input = {
  generationProfileV3: 'quality',
  genre: 'Jazz Fusion',
  subgenre: 'Contemporary Jazz Fusion',
  selectedInstruments: ['Live Drums', 'Electric Bass', 'Rhodes'],
  bpmMode: 'manual',
  rawPrompt: 'Expressive original jazz fusion instrumental'
};

test('manual BPM overrides director default 124 BPM for both native candidates', () => {
  const body = { ...input, bpm: 170 };
  const result = applyR2GenerationProfile(job, body, body);
  assert.equal(result.bpm, 170);
  assert.equal(result.sonara_requested_bpm, 170);
  assert.equal(result.batch_size, 2);
  assert.equal(result.model, 'acestep-v15-xl-turbo');
  assert.match(result.prompt, /SONARA EXACT MANUAL TEMPO: 170 BPM/);
  assert.match(result.prompt, /not half-time or double-time/);
  assert.equal(result.thinking, true);
  assert.equal(result.allow_lm_batch, true);
});

test('highest priority exact BPM survives incorrect resolved body and model defaults', () => {
  const original = { ...input, sonaraExactRequestedBpm: 171, bpm: 170 };
  const prepared = { ...input, bpm: 124, requestedBpm: 128 };
  assert.equal(requestedR2Bpm(job, prepared, original), 171);
  assert.equal(applyR2GenerationProfile(job, prepared, original).bpm, 171);
});

test('manual BPM is requested, not fabricated as measured WAV BPM', () => {
  const meta = r2GenerationMetadata({ ...input, bpm: 170 }, 2);
  assert.equal(meta.requestedBpm, 170);
  assert.equal(meta.bpmVerification, 'pending-real-wav-analysis');
  assert.equal(meta.candidateCount, 2);
  assert.equal('measuredBpm' in meta, false);
});

test('missing BPM remains unknown instead of inventing 124 BPM', () => {
  const empty = { ...input };
  const unassigned = { ...job };
  delete unassigned.bpm;
  const result = applyR2GenerationProfile(unassigned, empty, empty);
  assert.equal(result.bpm, undefined);
  assert.equal(result.sonara_requested_bpm, undefined);
  assert.equal(requestedR2Bpm(unassigned, empty, empty), null);
});

test('explicit 85 and 170 BPM are distinct native requests', () => {
  const slow = applyR2GenerationProfile(job, { ...input, bpm: 85 }, { ...input, bpm: 85 });
  const fast = applyR2GenerationProfile(job, { ...input, bpm: 170 }, { ...input, bpm: 170 });
  assert.equal(slow.bpm, 85);
  assert.equal(fast.bpm, 170);
  assert.notEqual(slow.bpm, fast.bpm);
});
