import test from 'node:test';
import assert from 'node:assert/strict';
import { remixInstrumentDefinitionPlan, REMIX_INSTRUMENT_DEFINITION_VERSION } from './sonara-remix-instrument-definition-v2.mjs';
import { preparePreciseRemixPayload } from './sonara-remix-precision-v1.mjs';

const input = {
  sonaraRemixSourceId: 'sref_00000000-0000-0000-0000-000000000001',
  sonaraRemixPrecisionMode: 'balanced',
  sonaraRemixInstrumentFocus: 'rhythm',
  sonaraRemixInstrumentClarity: 80,
  sonaraRemixInstrumentList: 'Piano, Bass Guitar, Drum Kit',
  durationSec: 22,
  rawPrompt: 'Jazz fusion with natural instrumentation'
};
const configured = { prompt: 'default', task_type: 'text2music', audio_duration: 30, batch_size: 2, key_scale: 'C Major', bpm: 124, audio_format: 'wav' };

test('instruments are defined by creator or source, not fake separation', () => {
  const plan = remixInstrumentDefinitionPlan(input);
  assert.equal(plan.version, REMIX_INSTRUMENT_DEFINITION_VERSION);
  assert.equal(plan.focus, 'rhythm');
  assert.equal(plan.clarity, 80);
  assert.deepEqual(plan.creatorInstruments, ['Piano', 'Bass Guitar', 'Drum Kit']);
  assert.match(plan.cue, /CREATOR-IDENTIFIED INSTRUMENTS/);
  assert.match(plan.cue, /kick attack plus bass pitch/);
  assert.match(plan.cue, /RHYTHM FOCUS/);
  assert.doesNotMatch(plan.cue, /individual stems generated|stems extracted/);
});

test('instrument roles go into the real ACE-Step cover prompt', () => {
  const generated = preparePreciseRemixPayload(configured, input);
  assert.equal(generated.task_type, 'cover');
  assert.equal(generated.batch_size, 1);
  assert.equal(generated.audio_duration, 22);
  assert.equal(generated.sonara_remix_instrument_definition_version, REMIX_INSTRUMENT_DEFINITION_VERSION);
  assert.equal(generated.sonara_remix_instrument_focus, 'rhythm');
  assert.equal(generated.sonara_remix_instrument_clarity, 80);
  assert.match(generated.prompt, /SONARA REMIX INSTRUMENT DEFINITION V2/);
  assert.match(generated.prompt, /Piano, Bass Guitar, Drum Kit/);
  assert.equal(generated.instruction, generated.prompt);
  assert.equal(generated.bpm, null);
  assert.equal(generated.key_scale, '');
});

test('validated focused roles and control limits cannot be hijacked', () => {
  const plan = remixInstrumentDefinitionPlan({
    sonaraRemixInstrumentFocus: 'delete all instruments',
    sonaraRemixInstrumentClarity: 999,
    sonaraRemixInstrumentList: '<script> hi </script>, Piano; Bass Guitar',
  });
  assert.equal(plan.focus, 'balanced');
  assert.equal(plan.clarity, 90);
  assert.equal(plan.creatorInstruments.length <= 6, true);
  assert.equal(plan.creatorInstruments.some(x => x.includes('<')), false);
  assert.match(plan.cue, /No individual instruments were identified|CREATOR-IDENTIFIED INSTRUMENTS/);
});

test('instrumental Remix never requests voice focus', () => {
  const plan = remixInstrumentDefinitionPlan({ vocalMode: 'instrumental', sonaraRemixInstrumentFocus: 'vocals' });
  assert.equal(plan.focus, 'balanced');
  const generated = preparePreciseRemixPayload(configured, {
    ...input, vocalMode: 'instrumental', sonaraRemixInstrumentFocus: 'vocals', lyrics: ''
  });
  assert.equal(generated.sonara_remix_instrument_focus, 'balanced');
  assert.match(generated.prompt, /do not.*invent vocals for an instrumental track/i);
});

test('all focus modes are allowed but no new stems or unrelated instruments are promised', () => {
  for (const focus of ['balanced', 'rhythm', 'bass', 'harmony', 'lead', 'vocals']) {
    const plan = remixInstrumentDefinitionPlan({ sonaraRemixInstrumentFocus: focus, sonaraRemixInstrumentClarity: 65 });
    assert.equal(plan.focus, focus);
    assert.match(plan.cue, /Apply these rules only to sounds actually present or requested/);
    assert.match(plan.cue, /clearly distinguish the audible instruments/);
  }
});
