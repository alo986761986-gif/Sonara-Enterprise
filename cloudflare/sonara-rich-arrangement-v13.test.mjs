import assert from 'node:assert/strict';
import { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';

async function rewrite(body) {
  const request = new Request('https://api.sonaraenterprise.com/api/engine/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  return (await rewriteGenerationRequest(request)).json();
}

const common = {
  mood: 'Professional',
  weirdness: 45,
  styleInfluence: 85,
  durationSec: 240,
  vocalMode: 'instrumental'
};

const cases = [
  {
    name: 'Deep House',
    body: { ...common, genreFamily: 'Electronic / Dance', genre: 'House', subgenre: 'Deep House', bpm: 122 },
    expect: [/layered club drums/i, /Rhodes/i, /filter sweeps/i, /9-14/i]
  },
  {
    name: 'Techno',
    body: { ...common, genreFamily: 'Electronic / Dance', genre: 'Techno', subgenre: 'Hardgroove', bpm: 140 },
    expect: [/rumble\/sub/i, /metallic impacts/i, /static loop/i, /9-14/i]
  },
  {
    name: 'Rock',
    body: { ...common, genreFamily: 'Rock', genre: 'Alternative Rock', subgenre: 'Indie Rock', bpm: 118 },
    expect: [/realistic drum kit/i, /rhythm guitar layers/i, /room and amp tails/i, /human/i]
  },
  {
    name: 'Jazz',
    body: { ...common, genreFamily: 'Jazz / Blues', genre: 'Jazz', subgenre: 'Bebop', bpm: 152 },
    expect: [/ride\/brush detail/i, /upright\/electric bass/i, /ensemble interaction/i, /7-11/i]
  },
  {
    name: 'Reggae',
    body: { ...common, genreFamily: 'Reggae / Caribbean', genre: 'Reggae', subgenre: 'Dub', bpm: 78 },
    expect: [/one-drop\/steppers/i, /dub delay throws/i, /spring\/plate reverb/i, /bass\/drum pocket/i]
  },
  {
    name: 'Cinematic',
    body: { ...common, genreFamily: 'Classical / Cinematic', genre: 'Cinematic', subgenre: 'Orchestral Score', bpm: 92 },
    expect: [/strings by register/i, /woodwinds/i, /natural hall\/room/i, /evolving orchestration/i]
  }
];

for (const test of cases) {
  const payload = await rewrite(test.body);
  assert.equal(payload.sonaraRichArrangement, 'sonara-rich-arrangement-v13', `${test.name}: marker`);
  assert.equal(payload.sonaraFullInstrumentation, true, `${test.name}: full instrumentation`);
  assert.equal(payload.sonaraSectionDensityIntelligence, true, `${test.name}: section density`);
  assert.equal(payload.sonaraSoundEffectsIntelligence, true, `${test.name}: FX intelligence`);
  assert.equal(payload.sonaraHumanPerformanceIntelligence, true, `${test.name}: human performance`);
  assert.match(payload.prompt, /INSTRUMENTATION:/i, `${test.name}: instrumentation prompt`);
  assert.match(payload.prompt, /DENSITY:/i, `${test.name}: density prompt`);
  assert.match(payload.prompt, /FX\/SOUND DESIGN:/i, `${test.name}: FX prompt`);
  assert.match(payload.prompt, /PERFORMANCE:/i, `${test.name}: performance prompt`);
  assert.match(payload.prompt, /demo-like sparsity/i, `${test.name}: sparsity critic`);
  for (const pattern of test.expect) assert.match(payload.prompt, pattern, `${test.name}: ${pattern}`);
}

console.log('SONARA Rich Arrangement V13 tests passed: multi-genre instrumentation, section density, FX and human performance are active.');
