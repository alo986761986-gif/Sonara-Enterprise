import assert from 'node:assert/strict';
import { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';

async function read(body) {
  const request = new Request('https://api.sonaraenterprise.com/api/engine/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  const rewritten = await rewriteGenerationRequest(request);
  return rewritten.json();
}

const common = {
  genreFamily: 'Electronic / Dance',
  genre: 'House',
  mood: 'Dark',
  weirdness: 83,
  styleInfluence: 37,
  vocalMode: 'instrumental'
};

const deep = await read({
  ...common,
  subgenre: 'Deep House',
  prompt: 'Deep House production with warm Rhodes 9th chords, rounded sub bass, soft 909 kick, lightly shuffled hats, soulful late-night atmosphere, long harmonic transitions and restrained arrangement.'
});
const tech = await read({
  ...common,
  subgenre: 'Tech House',
  prompt: 'Tech House production with tight punchy kick, elastic mono bass phrase, pronounced 16th-note shuffle, rolling hats, syncopated percussion, sparse stabs and dry club mix.'
});
const afro = await read({
  ...common,
  subgenre: 'Afro House',
  prompt: 'Afro House production with interlocking African-rooted polyrhythmic percussion, shakers, hand drums, organic mallets, deep modal harmony and warm spiritual groove.'
});

for (const [name, payload] of [['Deep House', deep], ['Tech House', tech], ['Afro House', afro]]) {
  assert.equal(payload.subgenre, name);
  assert.equal(payload.sonaraGenreLock, 'v15-authoritative-full-prompt');
  assert.equal(payload.sonaraProfessionalPromptPreserved, true);
  assert.equal(payload.sonaraCreativeControlsPreserved, true);
  assert.equal(payload.weirdness, 83);
  assert.equal(payload.styleInfluence, 37);
  assert.match(payload.prompt, new RegExp(`SONARA AUTHORITATIVE STYLE LOCK: Electronic / Dance > House > ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.ok(payload.prompt.length > 300, `${name} prompt must retain detailed creator instructions`);
  assert.doesNotMatch(payload.prompt, /caption500/i);
}

assert.match(deep.prompt, /Rhodes 9th chords/i);
assert.match(tech.prompt, /16th-note shuffle/i);
assert.match(afro.prompt, /polyrhythmic percussion/i);
assert.notEqual(deep.prompt, tech.prompt);
assert.notEqual(deep.prompt, afro.prompt);
assert.notEqual(tech.prompt, afro.prompt);

console.log('SONARA v15 authoritative prompt test passed: Deep House, Tech House and Afro House remain distinct with full prompts and exact creative controls.');
