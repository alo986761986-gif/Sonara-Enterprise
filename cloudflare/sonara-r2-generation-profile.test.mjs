import test from 'node:test';
import assert from 'node:assert/strict';
import { instrumentRealismPlan, INSTRUMENT_REALISM_VERSION } from './sonara-instrument-realism-v2.mjs';
import { applyR2GenerationProfile, r2GenerationMetadata, R2_GENERATION_POLICY } from './sonara-r2-generation-profile.mjs';
import { mixMasterPlan, safePeakTarget, MIX_MASTER_VERSION } from './sonara-mix-master-v1.mjs';

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
    const body = { ...source, generationProfileV3: profile };
    const result = applyR2GenerationProfile(payload, body, source);
    assert.equal(result.inference_steps, steps);
    assert.equal(result.shift, shift);
    assert.equal(result.thinking, thinking);
    assert.equal(result.allow_lm_batch, thinking);
    assert.equal(result.batch_size, profile === 'fast' ? 1 : 2);
    assert.equal(result.sonara_r2_generation_policy, R2_GENERATION_POLICY);
    assert.equal(result.sonara_r2_generation_profile, profile);
    assert.equal(result.sonara_instrument_realism, profile === 'fast' ? null : INSTRUMENT_REALISM_VERSION);
    const metadata = r2GenerationMetadata(body);
    assert.equal(metadata.inferenceSteps, result.inference_steps);
    assert.equal(metadata.shift, result.shift);
    assert.equal(metadata.lmAudioPlanning, result.thinking);
    assert.equal(metadata.samplerMode, result.sampler_mode);
    assert.equal(metadata.candidateCount, result.batch_size);
    assert.equal(metadata.instrumentRealismEnabled, profile !== 'fast');
    assert.equal(metadata.instrumentRealismVersion, profile === 'fast' ? null : INSTRUMENT_REALISM_VERSION);
    assert.equal(metadata.instrumentRealismDepth, profile === 'fast' ? null : profile);
    assert.equal(metadata.mixMasterEnabled, profile !== 'fast');
    assert.equal(metadata.mixMasterVersion, profile === 'fast' ? null : MIX_MASTER_VERSION);
    assert.equal(metadata.automaticSecondBatch, false);
    assert.equal(metadata.automaticCandidateRanking, false);
    assert.equal(metadata.automaticQualityRepair, false);
    assert.equal(result.sonara_real_music_v1, false);
    for (const field of ['model', 'vocal_language', 'bpm', 'key_scale', 'time_signature',
      'audio_duration', 'task_type', 'seed', 'use_random_seed', 'audio_format',
      'enable_normalization', 'normalization_db', 'use_tiled_decode']) {
      assert.deepEqual(result[field], payload[field], field);
    }
    assert.equal(result.lyrics, lyrics);
    assert.equal(JSON.stringify(payload), before);
  });
}

test('instrument realism selects physical performance cues from requested instruments', () => {
  const plan = instrumentRealismPlan({
    selectedInstruments: ['Grand Piano', 'Cello', 'Acoustic Drum Kit', 'Analog Synthesizer']
  }, { depth: 'quality' });
  assert.equal(plan.version, INSTRUMENT_REALISM_VERSION);
  assert.deepEqual(plan.families, ['piano-keys', 'bowed-strings', 'acoustic-drums']);
  assert.match(plan.cue, /velocity-shaped attacks/);
  assert.match(plan.cue, /bow-pressure changes/);
  assert.match(plan.cue, /distinct stick velocities/);
  assert.match(plan.cue, /one coherent depth perspective/);
});

test('instrument realism detects genre instrumentation text when no explicit instrument picker is used', () => {
  const plan = instrumentRealismPlan({
    sonaraWorldStyleInstrumentation: 'Rhodes electric piano, fretless bass guitar, soft acoustic drum kit and tenor saxophone'
  });
  for (const family of ['piano-keys', 'bass', 'acoustic-drums']) assert.ok(plan.families.includes(family));
  assert.equal(plan.explicitInstruments.length, 0);
});

test('FAST stays compact while QUALITY and ULTRA receive instrument-performance realism', () => {
  const fast = applyR2GenerationProfile(payload, { ...source, generationProfileV3: 'fast' }, source);
  const quality = applyR2GenerationProfile(payload, { ...source, generationProfileV3: 'quality' }, source);
  const ultra = applyR2GenerationProfile(payload, { ...source, generationProfileV3: 'ultra' }, source);
  assert.doesNotMatch(fast.prompt, /Recorded-performance realism/);
  for (const result of [quality, ultra]) {
    assert.match(result.prompt, /Recorded-performance realism/);
    assert.match(result.prompt, /velocity-shaped attacks/);
    assert.match(result.prompt, /bow-pressure changes/);
    assert.ok(result.prompt.includes(source.rawPrompt));
  }
});

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

test('caption carries real user intent, instruments and physical-performance cues', () => {
  const result = applyR2GenerationProfile(payload, { ...source, generationProfileV3: 'quality' }, source);
  assert.ok(result.prompt.includes(source.rawPrompt));
  for (const requested of ['Pop', 'Ballad', 'Romantic', 'Female vocals in Italian', 'Piano', 'Cello']) {
    assert.ok(result.prompt.includes(requested), requested);
  }
  assert.match(result.prompt, /Recorded-performance realism/);
  assert.doesNotMatch(result.prompt, /SONARA MUSIC DIRECTOR|ALWAYS WINS|overrides/);
});

test('preserve a long creator brief and long original lyrics without silent truncation', () => {
  const brief = 'Il pianoforte risponde alla voce. '.repeat(30) + 'Finale con solo violoncello.';
  const longLyrics = '[Verse]\n' + 'Non cambiare queste parole.\n'.repeat(170);
  const body = { ...source, generationProfileV3: 'quality', rawPrompt: brief, lyrics: 'altered', sonaraOriginalLyrics: longLyrics };
  const result = applyR2GenerationProfile(payload, body, body);
  assert.ok(result.prompt.includes(brief.trim()));
  assert.equal(result.lyrics, longLyrics);
});

test('plain API prompt, selected profile aliases, instrumental and single output remain valid', () => {
  const body = { prompt: 'An intimate solo piano nocturne.', qualityProfile: 'master',
    genre: 'Classical', vocalMode: 'instrumental', lyrics: '' };
  const result = applyR2GenerationProfile({ ...payload, batch_size: 1 }, body, body);
  assert.ok(result.prompt.includes(body.prompt));
  assert.ok(result.prompt.includes('Instrumental'));
  assert.match(result.prompt, /velocity-shaped attacks/);
  assert.equal(result.lyrics, '');
  assert.equal(result.batch_size, 1);
  assert.equal(result.thinking, true);
  assert.equal(result.allow_lm_batch, false);
});


test('ULTRA coordinates a live rhythm section instead of humanizing every part blindly', () => {
  const plan = instrumentRealismPlan({
    genre: 'Soul',
    selectedInstruments: ['Acoustic Drum Kit', 'Electric Bass', 'Rhodes', 'Electric Guitar']
  }, { depth: 'ultra' });
  assert.equal(plan.depth, 'ultra');
  assert.ok(plan.families.includes('acoustic-drums'));
  assert.ok(plan.families.includes('bass'));
  assert.ok(plan.ensembleInteractions.some(value => /kick and bass share the pocket/.test(value)));
  assert.match(plan.cue, /push-and-pull/);
  assert.match(plan.cue, /do not quantize every performed part/);
});

test('section tags drive arrangement motion without rewriting lyrics', () => {
  const structuredLyrics = '[Verse 1]\nPiano e voce.\n[Chorus]\nApri il suono.\n[Bridge]\nCambia il colore.\n[Outro]\nResta il piano.';
  const body = {
    ...source,
    generationProfileV3: 'ultra',
    selectedInstruments: ['Piano', 'Cello', 'Acoustic Drum Kit', 'Electric Bass'],
    sonaraOriginalLyrics: structuredLyrics
  };
  const result = applyR2GenerationProfile(payload, body, body);
  const metadata = r2GenerationMetadata(body);
  assert.equal(result.lyrics, structuredLyrics);
  assert.equal(metadata.sectionAwareArrangement, true);
  assert.ok(metadata.ensembleInteractionCount >= 1);
  assert.match(result.prompt, /verses leave space/);
  assert.match(result.prompt, /choruses widen and intensify/);
  assert.match(result.prompt, /bridge changes texture or register/);
  assert.match(result.prompt, /outro releases energy/);
});

test('electronic music keeps designed timing instead of fake acoustic looseness', () => {
  const plan = instrumentRealismPlan({
    genre: 'House',
    selectedInstruments: ['Drum Machine', 'Bass Synth', 'Wavetable Synthesizer']
  }, { depth: 'ultra' });
  assert.ok(plan.families.includes('electronic'));
  assert.match(plan.cue, /keep the clock stable/);
  assert.match(plan.cue, /do not fake acoustic looseness/);
});

test('Italian instrument names activate the same physical families', () => {
  const plan = instrumentRealismPlan({
    selectedInstruments: ['Pianoforte', 'Violoncello', 'Batteria acustica', 'Basso elettrico', 'Tromba', 'Flauto']
  }, { depth: 'ultra' });
  for (const family of ['piano-keys','bowed-strings','acoustic-drums','bass','brass','woodwinds'])
    assert.ok(plan.families.includes(family), family);
});


test('mix/master plans use native peak headroom without pretending peak normalization is LUFS mastering', () => {
  const pop = mixMasterPlan({ genre: 'Pop', selectedInstruments: ['Acoustic Drum Kit', 'Electric Bass', 'Piano'] }, { depth: 'quality' });
  const classical = mixMasterPlan({ genre: 'Classical', selectedInstruments: ['Piano', 'Cello', 'Violin'] }, { depth: 'ultra' });
  const acoustic = mixMasterPlan({ genre: 'Acoustic', selectedInstruments: ['Acoustic Guitar', 'Piano'] }, { depth: 'quality' });
  assert.equal(pop.targetPeakDb, -1.0);
  assert.equal(classical.targetPeakDb, -2.0);
  assert.equal(acoustic.targetPeakDb, -1.5);
  assert.match(pop.cue, /kick and bass stay distinguishable/);
  assert.match(classical.cue, /preserve macro-dynamics/);
  assert.doesNotMatch(pop.cue, /LUFS/i);
});

test('QUALITY and ULTRA apply conservative native peak normalization while FAST stays untouched', () => {
  const fast = applyR2GenerationProfile({ ...payload, normalization_db: -0.1 }, { ...source, generationProfileV3: 'fast' }, source);
  const quality = applyR2GenerationProfile({ ...payload, normalization_db: -0.1 }, { ...source, generationProfileV3: 'quality' }, source);
  const ultra = applyR2GenerationProfile({ ...payload, normalization_db: -0.1 }, { ...source, generationProfileV3: 'ultra' }, source);
  assert.equal(fast.normalization_db, -0.1);
  assert.equal(quality.normalization_db, -1.0);
  assert.equal(ultra.normalization_db, -1.0);
  assert.equal(quality.sonara_mix_master_version, MIX_MASTER_VERSION);
  assert.match(ultra.prompt, /master motion/);
});

test('a user-requested more conservative peak is preserved', () => {
  const result = applyR2GenerationProfile({ ...payload, normalization_db: -3.0 }, { ...source, genre: 'Pop', generationProfileV3: 'quality' }, source);
  assert.equal(result.normalization_db, -3.0);
  assert.equal(safePeakTarget(-3.0, -1.0), -3.0);
  assert.equal(safePeakTarget(-0.1, -1.0), -1.0);
});

test('normalization opt-out remains respected', () => {
  const result = applyR2GenerationProfile({ ...payload, enable_normalization: false, normalization_db: -0.1 }, { ...source, generationProfileV3: 'ultra' }, source);
  assert.equal(result.enable_normalization, false);
  assert.equal(result.normalization_db, -0.1);
});


test('missing profile defaults to INSTANT single-track execution', () => {
  const body = { ...source };
  delete body.generationProfileV3;
  const result = applyR2GenerationProfile(payload, body, body);
  const metadata = r2GenerationMetadata(body);
  assert.equal(result.sonara_r2_generation_profile, 'fast');
  assert.equal(result.inference_steps, 1);
  assert.equal(result.thinking, false);
  assert.equal(result.batch_size, 1);
  assert.equal(result.sonara_instant_mode, true);
  assert.equal(metadata.candidateCount, 1);
  assert.equal(metadata.executionProfile, 'xl-turbo-instant-single-track');
});
