import test from 'node:test';
import assert from 'node:assert/strict';
import { preparePreciseRemixPayload, REMIX_PRECISION_VERSION } from './sonara-remix-precision-v1.mjs';

const base = { model: 'acestep-v15-xl-turbo', bpm: 124, key_scale: 'C Major', audio_duration: 30, batch_size: 2, audio_format: 'wav', prompt: 'default demo text' };
const input = { sonaraRemixSourceId: 'sref_00000000-0000-0000-0000-000000000001', rawPrompt: 'Jazz fusion on Rhodes, clear bass and natural jazz kit', durationSec: 18, sonaraRemixPrecisionMode: 'faithful', audio_cover_strength: .86, cover_noise_strength: .08 };

test('cover R2 contract keeps the 18-second excerpt instead of stretching to 30 seconds', () => {
  const result = preparePreciseRemixPayload(base, input);
  assert.equal(result.audio_duration, 18);
  assert.equal(result.task_type, 'cover');
  assert.equal(result.batch_size, 1);
  assert.equal(result.candidateCount, 1);
  assert.equal(result.sonara_remix_precision_version, REMIX_PRECISION_VERSION);
  assert.equal(result.sonaraRemixSourceId, input.sonaraRemixSourceId);
  assert.equal(result.audio_format, 'wav');
  assert.match(result.prompt, /uploaded source audio as the structural and rhythmic reference/);
  assert.match(result.prompt, /Jazz fusion on Rhodes/);
  assert.equal(result.instruction, result.prompt);
});

test('auto mode does not invent BPM 124 or key C major from server defaults', () => {
  const result = preparePreciseRemixPayload(base, input);
  assert.equal(result.bpm, null);
  assert.equal(result.sonara_requested_bpm, null);
  assert.equal(result.key_scale, '');
  assert.match(result.prompt, /TEMPO AUTO/);
  assert.match(result.prompt, /KEY AUTO/);
  assert.doesNotMatch(result.prompt, /124 BPM|C Major/);
});

test('explicit creator tempo/key override server defaults without affecting source identity', () => {
  const result = preparePreciseRemixPayload(base, { ...input, sonaraRemixRequestedBpm: 171, sonaraRemixRequestedKey: 'F# Minor', durationSec: 54 });
  assert.equal(result.bpm, 171);
  assert.equal(result.sonara_requested_bpm, 171);
  assert.equal(result.key_scale, 'F# Minor');
  assert.equal(result.audio_duration, 54);
  assert.match(result.prompt, /171 BPM/);
  assert.match(result.prompt, /F# Minor/);
});

test('faithfulness and noise are constrained; invalid values cannot propagate to ACE-Step', () => {
  const result = preparePreciseRemixPayload(base, { ...input, audio_cover_strength: 999, cover_noise_strength: -3, durationSec: 9999, sonaraRemixPrecisionMode: 'unknown' });
  assert.equal(result.audio_cover_strength, .92);
  assert.equal(result.cover_noise_strength, .04);
  assert.equal(result.audio_duration, 600);
  assert.equal(result.sonara_remix_precision_mode, 'balanced');
  assert.equal(preparePreciseRemixPayload(base, { ...input, durationSec: 4 }).audio_duration, 10);
});

test('source and human instructions are present in all three musical modes', () => {
  for (const mode of ['faithful','balanced','creative']) {
    const result = preparePreciseRemixPayload(base, { ...input, sonaraRemixPrecisionMode: mode });
    assert.equal(result.sonara_remix_precision_mode, mode);
    assert.match(result.prompt, /recognizable hook|core motif/);
    assert.match(result.prompt, /Avoid repeated generic tu-tu-tu/);
    assert.match(result.prompt, /single newly rendered coherent musical reinterpretation/);
  }
});
