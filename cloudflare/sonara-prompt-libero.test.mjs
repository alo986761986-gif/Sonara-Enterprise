import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFreeMolabR2Payload } from './sonara-direct-prompt-r2.mjs';
import { readFileSync } from 'node:fs';

test('Prompt Libero preserves the creator brief, without default Deep House taxonomy or tempo', async () => {
  const brief = 'Live jazz fusion band, fingerstyle bass, warm Rhodes piano, expressive drum kit.';
  const source = {
    sonaraPromptMode: 'free',
    rawPrompt: brief,
    prompt: 'UNWANTED: force Deep House, automated director tags',
    genre: 'House', genreFamily: 'Electronic / Dance', subgenre: 'Deep House',
    mood: 'Hypnotic', key: 'A Minor', bpm: 124, requestedBpm: 124,
    styleInfluence: 100, weirdness: 100, durationSec: 180, candidateCount: 2
  };
  const job = buildFreeMolabR2Payload(source);
  assert.equal(job.prompt, brief);
  assert.equal(job.model, 'acestep-v15-xl-turbo');
  assert.equal(job.batch_size, 1);
  assert.equal(job.audio_duration, 180);
  assert.equal(job.sonaraPromptMode, 'free');
  assert.equal(job.sonara_r2_generation_policy, 'sonara-prompt-direct-v1');
  for (const forbidden of ['bpm', 'key_scale', 'genre', 'genreFamily', 'subgenre',
    'mood', 'styleInfluence', 'sonara_requested_bpm', 'sonaraNaturalInstrumentABInstruction']) {
    assert.equal(Object.hasOwn(job, forbidden), false, forbidden);
  }
  for (const forbidden of ['Deep House', 'SONARA MUSIC DIRECTOR', 'STYLE LOCK', 'robotic quantization']) {
    assert.ok(!job.prompt.includes(forbidden), forbidden);
  }
});

test('Prompt Libero only binds BPM when the creator actually writes one', () => {
  const a = buildFreeMolabR2Payload({
    sonaraPromptMode: 'free', rawPrompt: 'Jazz Fusion a 150 BPM, virtuoso guitar and drums',
    bpm: 124, durationSec: 240, generationProfileV3: 'quality'
  });
  assert.equal(a.bpm, 150);
  assert.equal(a.sonara_requested_bpm, 150);
  assert.equal(a.inference_steps, 8);
  assert.equal(a.prompt, 'Jazz Fusion a 150 BPM, virtuoso guitar and drums');

  const b = buildFreeMolabR2Payload({ rawPrompt: 'Ambient piano instrumental', durationSec: 140 });
  assert.equal(b.bpm, undefined);
  assert.equal(b.sonara_requested_bpm, undefined);
  assert.equal(b.prompt, 'Ambient piano instrumental');
});

test('Prompt Libero routes real XL SFT only for explicit available opt-in', () => {
  const job = buildFreeMolabR2Payload({
    rawPrompt: 'Funky live band, bass and Rhodes', sonaraAceVariant: 'xl-sft',
    sonaraSftQualityPro: true, generationProfileV3: 'quality', duration: 240
  });
  assert.equal(job.model, 'acestep-v15-xl-sft');
  assert.equal(job.inference_steps, 50);
  assert.equal(job.guidance_scale, 7);
  assert.equal(job.sonaraSftQualityPro, true);
  assert.equal(job.batch_size, 1);
  const another = buildFreeMolabR2Payload({
    rawPrompt: 'live funk', sonaraAceVariant: 'xl-sft', sonaraSftQualityPro: false
  });
  assert.equal(another.model, 'acestep-v15-xl-turbo');
});

test('Prompt Libero does not override other advanced flows by accident', () => {
  const job = buildFreeMolabR2Payload({
    rawPrompt: 'Original audio prompt', sonaraAceVariant: 'xl-sft',
    sonaraSftQualityPro: true, sonaraRemixPro: true
  });
  assert.equal(job.sonaraSftQualityPro, undefined);
  assert.equal(job.model, 'acestep-v15-xl-turbo');
  assert.throws(() => buildFreeMolabR2Payload({ rawPrompt: '  ' }), /requires a prompt/);
});
test('R2 integration branches to direct prompt before invoking the old genre editor', () => {
  const router = readFileSync(new URL('./sonara-molab-xl-router.mjs', import.meta.url), 'utf8');
  const start = router.indexOf("if (body?.sonaraPromptMode === 'free'");
  const later = router.indexOf("await rewriteGenerationRequest(request)", start);
  assert.ok(start > 0 && later > start);
  assert.match(router.slice(start, later), /buildFreeMolabR2Payload\(body\)/);
});
