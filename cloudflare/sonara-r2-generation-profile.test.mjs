import test from 'node:test';
import assert from 'node:assert/strict';
import { applyR2GenerationProfile, r2GenerationMetadata, R2_GENERATION_POLICY } from './sonara-r2-generation-profile.mjs';

const lyrics = '[Strofa 1 — Lei]\r\nTi aspetto qui, perché tornerai.\r\n\r\n[Ritornello]\r\nTi tengo vicino.';
const source = {
  rawPrompt: 'Una ballata italiana intima con pianoforte e violoncello, ritornello aperto e finale delicato.',
  prompt: 'SONARA MUSIC DIRECTOR. UI taxonomy overrides free text. FREE TEXT ALWAYS WINS.',
  genre: 'Pop', subgenre: 'Ballad', mood: 'Romantic', vocalMode: 'female',
  selectedInstruments: ['Piano', 'Cello'], lyrics, vocalLanguage: 'it'
};
const payload = {
  model: 'acestep-v15-xl-turbo', prompt: source.prompt,
  lyrics: '[Verse 1]\n' + lyrics, vocal_language: 'it',
  bpm: 76, key_scale: 'D Minor', time_signature: '4', audio_duration: 180,
  task_type: 'text2music', batch_size: 2, seed: 123456, use_random_seed: false,
  audio_format: 'wav', enable_normalization: true, normalization_db: -1,
  use_tiled_decode: true, sonara_real_music_v1: false,
  inference_steps: 2, shift: 1, thinking: false,
  lm_batch_chunk_size: 8, use_cot_metas: false, use_constrained_decoding: false
};

for (const [profile, steps, shift, thinking] of [
  ['fast', 1, 1, false], ['quality', 8, 3, false], ['ultra', 8, 3, true]
]) {
  test(`${profile} selects native XL parameters and preserves the creator's job`, () => {
    const before = JSON.stringify(payload);
    const result = applyR2GenerationProfile(payload, { ...source, generationProfileV3: profile }, source);
    assert.equal(result.inference_steps, steps);
    assert.equal(result.shift, shift);
    assert.equal(result.thinking, thinking);
    assert.equal(result.allow_lm_batch, thinking);
    assert.equal(result.sonara_r2_generation_policy, R2_GENERATION_POLICY);
    assert.equal(result.sonara_r2_generation_profile, profile);
    const metadata = r2GenerationMetadata({ generationProfileV3: profile });
    assert.equal(metadata.inferenceSteps, result.inference_steps);
    assert.equal(metadata.shift, result.shift);
    assert.equal(metadata.lmAudioPlanning, result.thinking);
    assert.equal(metadata.samplerMode, result.sampler_mode);
    assert.equal(metadata.candidateCount, result.batch_size);
    assert.equal(metadata.automaticSecondBatch, false);
    assert.equal(metadata.automaticCandidateRanking, false);
    assert.equal(metadata.automaticQualityRepair, false);
    assert.equal(result.sonara_real_music_v1, false, 'native planning must not pretend the custom realism API exists');
    for (const field of ['model', 'vocal_language', 'bpm', 'key_scale', 'time_signature',
      'audio_duration', 'task_type', 'batch_size', 'seed', 'use_random_seed', 'audio_format',
      'enable_normalization', 'normalization_db', 'use_tiled_decode']) {
      assert.deepEqual(result[field], payload[field], field);
    }
    assert.equal(result.lyrics, lyrics, 'preserve spelling, order, headings and line endings exactly');
    assert.equal(JSON.stringify(payload), before, 'do not mutate the payload already in flight');
  });
}

test('ULTRA uses supported native planning controls, without caption/lyrics rewrites', () => {
  const result = applyR2GenerationProfile(payload, { ...source, renderProfile: 'ultra' }, source);
  assert.equal(result.constrained_decoding, true);
  assert.equal(result.guidance_scale, 1);
  assert.equal(result.infer_method, 'ode');
  assert.equal(result.sampler_mode, 'euler');
  assert.equal(result.use_adg, false);
  assert.equal(result.sample_mode, false);
  assert.equal(result.use_format, false);
  assert.equal(result.use_cot_caption, false);
  assert.equal(result.use_cot_language, false);
  assert.equal(result.lm_temperature, 0.85);
  assert.equal(result.lm_cfg_scale, 2.5);
  assert.equal(result.lm_top_p, 0.9);
  assert.equal(result.lm_negative_prompt, 'NO USER INPUT');
  assert.equal(result.sonara_generation_profile, 'auto');
  for (const field of ['lm_batch_chunk_size', 'use_cot_metas', 'use_constrained_decoding']) {
    assert.equal(field in result, false, `${field} is not a stock REST control`);
  }
});

test('caption carries real user intent and voice, not contradictory generated contracts', () => {
  const result = applyR2GenerationProfile(payload, source, source);
  assert.ok(result.prompt.includes(source.rawPrompt));
  for (const requested of ['Pop', 'Ballad', 'Romantic', 'Female vocals in Italian', 'Piano', 'Cello']) {
    assert.ok(result.prompt.includes(requested), requested);
  }
  assert.ok(result.prompt.length < 512, 'ordinary briefs should fit the recommended caption budget');
  assert.doesNotMatch(result.prompt, /SONARA MUSIC DIRECTOR|ALWAYS WINS|overrides/);
});

test('preserve a long creator brief and long original lyrics without silent truncation', () => {
  const brief = 'Il pianoforte risponde alla voce. '.repeat(30) + 'Finale con solo violoncello.';
  const longLyrics = '[Verse]\n' + 'Non cambiare queste parole.\n'.repeat(170);
  const body = { ...source, rawPrompt: brief, lyrics: 'altered', sonaraOriginalLyrics: longLyrics };
  const result = applyR2GenerationProfile(payload, body, body);
  assert.ok(result.prompt.includes(brief.trim()));
  assert.equal(result.lyrics, longLyrics);
});

test('ULTRA uses the original brief retained by the UI, not overwritten wrapper prompts', () => {
  const body = { ...source, generationProfileV3: 'ultra',
    sonaraOriginalCreatorBrief: source.rawPrompt,
    sonaraCreatorPromptAuthoritative: source.rawPrompt,
    rawPrompt: 'SONARA ULTRA DIVERSITY. ' + source.prompt,
    creatorPrompt: 'SONARA ULTRA DIVERSITY. ' + source.prompt };
  const result = applyR2GenerationProfile(payload, body, body);
  assert.ok(result.prompt.includes(source.rawPrompt));
  assert.doesNotMatch(result.prompt, /SONARA|DIRECTOR|ALWAYS WINS|overrides/);
});

test('explicit creative controls retain meaningful descriptive influence without changing the genre', () => {
  const conservative = applyR2GenerationProfile(payload, { ...source, weirdness: 0, styleInfluence: 100 }, source);
  const adventurous = applyR2GenerationProfile(payload, { ...source, weirdness: 100, styleInfluence: 0 }, source);
  const balanced = applyR2GenerationProfile(payload, { ...source, weirdness: 50, styleInfluence: 60 }, source);
  assert.match(conservative.prompt, /Conventional, coherent phrasing/);
  assert.match(conservative.prompt, /Strict genre identity/);
  assert.match(adventurous.prompt, /Adventurous melodic and rhythmic variations within the style/);
  assert.match(adventurous.prompt, /Flexible interpretation within the selected genre/);
  assert.match(balanced.prompt, /Balanced melodic variation/);
  assert.match(balanced.prompt, /Recognizable genre identity/);
  for (const result of [conservative, adventurous, balanced]) {
    assert.ok(result.prompt.includes('Pop, Ballad'));
    assert.ok(result.prompt.includes(source.rawPrompt));
    assert.ok(result.prompt.length < 512);
  }
});

test('plain API prompt, selected profile aliases, instrumental and single output remain valid', () => {
  const body = { prompt: 'An intimate solo piano nocturne.', qualityProfile: 'master',
    genre: 'Classical', vocalMode: 'instrumental', lyrics: '' };
  const result = applyR2GenerationProfile({ ...payload, batch_size: 1 }, body, body);
  assert.ok(result.prompt.includes(body.prompt));
  assert.ok(result.prompt.includes('Instrumental'));
  assert.equal(result.lyrics, '');
  assert.equal(result.batch_size, 1);
  assert.equal(result.thinking, true);
  assert.equal(result.allow_lm_batch, false);
});
