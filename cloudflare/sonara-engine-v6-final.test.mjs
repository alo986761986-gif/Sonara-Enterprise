import assert from 'node:assert/strict';
import test from 'node:test';

import {
  analyzePromptFidelity,
  buildAdaptivePayload
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

test('detailed creator prompts keep Turbo speed but enable prompt reasoning', () => {
  const fidelity = analyzePromptFidelity({ prompt: detailedPrompt });
  assert.equal(fidelity.detailed, true);
  assert.equal(fidelity.inferenceSteps, 12);
  assert.equal(fidelity.thinking, true);
  assert.deepEqual(fidelity.exclusions, ['Senza synth', 'senza cori']);

  const payload = buildAdaptivePayload({
    prompt: detailedPrompt,
    lm_negative_prompt: 'genre drift, incorrect tempo'
  }, 'acestep-v15-xl-turbo', false, fidelity);

  assert.equal(payload.model, 'acestep-v15-xl-turbo');
  assert.equal(payload.inference_steps, 12);
  assert.equal(payload.thinking, true);
  assert.equal(payload.use_cot_caption, true);
  assert.equal(payload.use_cot_language, true);
  assert.equal(payload.batch_size, 1);
  assert.match(payload.lm_negative_prompt, /Senza synth/);
  assert.match(payload.lm_negative_prompt, /senza cori/);
});

test('simple prompts remain on the eight-step fast path', () => {
  const prompt = 'USER INTENT:\nWarm piano piece.\n\nTECHNICAL PARAMETERS:\nTempo: exactly 90 BPM';
  const fidelity = analyzePromptFidelity({ prompt });
  const payload = buildAdaptivePayload({ prompt }, 'acestep-v15-xl-turbo', false, fidelity);

  assert.equal(fidelity.detailed, false);
  assert.equal(payload.inference_steps, 8);
  assert.equal(payload.thinking, false);
  assert.equal(payload.batch_size, 1);
});

test('quality fallback remains available after a rejected fast render', () => {
  const fidelity = analyzePromptFidelity({ prompt: detailedPrompt });
  const payload = buildAdaptivePayload({ prompt: detailedPrompt }, 'acestep-v15-xl-sft', true, fidelity);

  assert.equal(payload.model, 'acestep-v15-xl-sft');
  assert.equal(payload.inference_steps, 28);
  assert.equal(payload.thinking, true);
  assert.equal(payload.guidance_scale, 6.5);
  assert.equal(payload.use_adg, true);
  assert.equal(payload.batch_size, 1);
});
