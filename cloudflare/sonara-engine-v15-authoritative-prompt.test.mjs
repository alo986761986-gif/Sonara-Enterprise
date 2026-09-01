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
  assert.equal(payload.sonaraGenreLock, 'v15-authoritative-ui-taxonomy-v4');
  assert.equal(payload.sonaraProfessionalPromptPreserved, true);
  assert.equal(payload.sonaraCreativeControlsPreserved, true);
  assert.equal(payload.weirdness, 83);
  assert.equal(payload.styleInfluence, 37);
  assert.match(payload.prompt, new RegExp(`STYLE LOCK: Electronic / Dance > House > ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.ok(payload.prompt.length > 300, `${name} prompt must retain detailed creator instructions`);
  assert.doesNotMatch(payload.prompt, /caption500/i);
}

const fastPrompt = await read({
  ...common,
  subgenre: 'Deep House',
  bpm: 124,
  requestedBpm: 124,
  rawPrompt: 'Create a professional Jungle / Drum & Bass track at 170 BPM with rapid chopped breakbeats, rolling sub bass, dark rave energy and relentless forward motion.',
  prompt: 'Create a professional Jungle / Drum & Bass track at 170 BPM with rapid chopped breakbeats, rolling sub bass, dark rave energy and relentless forward motion.',
  promptGenreAuthoritative: true,
  promptBpmAuthoritative: true,
  sonaraRealPrompt: true,
  sonaraRealPromptVersion: 'v2-prompt-genre-bpm-authoritative'
});

assert.equal(fastPrompt.bpm, 124);
assert.equal(fastPrompt.requestedBpm, 124);
assert.equal(fastPrompt.bpmLock, true);
assert.equal(fastPrompt.sonaraTempoLock, 'v15-authoritative-bpm-v4-ui');
assert.equal(fastPrompt.sonaraCreatorStylePriority, false);
assert.equal(fastPrompt.sonaraUiTaxonomyAuthoritative, true);
assert.match(fastPrompt.prompt, /STYLE LOCK: Electronic \/ Dance > House > Deep House/i);
assert.match(fastPrompt.prompt, /124 BPM exact/i);
assert.match(fastPrompt.prompt, /UI-selected family, genre, subgenre and atmosphere are mandatory/i);
assert.match(fastPrompt.prompt, /Jungle \/ Drum & Bass track at 170 BPM/i);
assert.match(fastPrompt.prompt, /CREATOR BRIEF INSIDE THESE LOCKS/i);

assert.match(deep.prompt, /Rhodes 9th chords/i);
assert.match(tech.prompt, /16th-note shuffle/i);
assert.match(afro.prompt, /polyrhythmic percussion/i);
assert.notEqual(deep.prompt, tech.prompt);
assert.notEqual(deep.prompt, afro.prompt);
assert.notEqual(tech.prompt, afro.prompt);

console.log('SONARA v15 authoritative prompt test passed: UI taxonomy and structured BPM remain authoritative while the creator brief is preserved inside those locks.');
