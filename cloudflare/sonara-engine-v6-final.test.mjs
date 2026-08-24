import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROFESSIONAL_CANDIDATE_COUNT,
  PROFESSIONAL_GUIDANCE_SCALE,
  PROFESSIONAL_INFERENCE_STEPS,
  PROFESSIONAL_MODEL,
  PROFESSIONAL_PROFILE,
  buildDirectProfessionalPayload,
  selectRequiredProfessionalModel
} from './sonara-engine-v6-final.mjs';

const detailedPrompt = [
  'EXECUTION PRIORITY — NON-NEGOTIABLE:',
  'The creator brief is authoritative.',
  '',
  'CREATOR BRIEF — VERBATIM:',
  '<<<',
  'Voglio batteria acustica, basso fretless e chitarra pulita.',
  'Intro intima, crescendo progressivo e finale esplosivo.',
  'Senza synth e senza cori.',
  '>>>',
  '',
  'EXPLICIT CREATOR EXCLUSIONS:',
  '- Senza synth',
  '- senza cori',
  '',
  'AUTHORITATIVE MUSICAL IDENTITY:',
  'Subgenre: Post-Rock'
].join('\n');

test('every Sonara generation uses the exact ACE-Step XL-SFT professional model', () => {
  const payload = buildDirectProfessionalPayload({
    prompt: detailedPrompt,
    model: 'acestep-v15-xl-turbo',
    inference_steps: 8,
    batch_size: 1,
    lm_negative_prompt: 'genre drift, incorrect tempo'
  });

  assert.equal(payload.model, PROFESSIONAL_MODEL);
  assert.equal(payload.model, 'acestep-v15-xl-sft');
  assert.equal(payload.inference_steps, PROFESSIONAL_INFERENCE_STEPS);
  assert.equal(payload.inference_steps, 50);
  assert.equal(payload.thinking, true);
  assert.equal(payload.use_cot_caption, true);
  assert.equal(payload.use_cot_language, true);
  assert.equal(payload.constrained_decoding, true);
  assert.equal(payload.allow_lm_batch, true);
  assert.equal(payload.batch_size, PROFESSIONAL_CANDIDATE_COUNT);
  assert.equal(payload.batch_size, 2);
  assert.equal(payload.audio_format, 'wav');
  assert.equal(payload.infer_method, 'ode');
  assert.equal(payload.guidance_scale, PROFESSIONAL_GUIDANCE_SCALE);
  assert.equal(payload.guidance_scale, 7);
  assert.equal(payload.shift, 1);
  assert.equal(payload.use_adg, true);
  assert.match(payload.lm_negative_prompt, /Senza synth/);
  assert.match(payload.lm_negative_prompt, /senza cori/);
  assert.doesNotMatch(payload.model, /turbo/i);
});

test('short prompts do not fall back to Turbo or reduce professional quality', () => {
  const payload = buildDirectProfessionalPayload({
    prompt: 'Warm real piano performance at exactly 90 BPM.'
  });

  assert.equal(payload.model, 'acestep-v15-xl-sft');
  assert.equal(payload.inference_steps, 50);
  assert.equal(payload.thinking, true);
  assert.equal(payload.batch_size, 2);
  assert.equal(payload.guidance_scale, 7);
  assert.equal(payload.audio_format, 'wav');
});

test('the Modal catalog must contain XL-SFT and cannot silently use Turbo', () => {
  assert.equal(
    selectRequiredProfessionalModel([
      'acestep-v15-turbo',
      'acestep-v15-xl-turbo',
      'acestep-v15-xl-sft'
    ]),
    'acestep-v15-xl-sft'
  );

  assert.throws(
    () => selectRequiredProfessionalModel([
      'acestep-v15-turbo',
      'acestep-v15-xl-turbo',
      'acestep-v15-sft'
    ]),
    /will not silently fall back to a Turbo or smaller ACE-Step model/i
  );
});

test('the public performance profile clearly identifies the professional engine', () => {
  assert.equal(PROFESSIONAL_PROFILE, 'ace-step-v15-xl-sft-50step-professional-v1');
  assert.equal(PROFESSIONAL_MODEL, 'acestep-v15-xl-sft');
  assert.equal(PROFESSIONAL_INFERENCE_STEPS, 50);
  assert.equal(PROFESSIONAL_CANDIDATE_COUNT, 2);
});
