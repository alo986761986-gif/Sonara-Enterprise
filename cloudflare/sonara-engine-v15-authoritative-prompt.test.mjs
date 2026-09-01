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
  bpm: 122,
  key: 'F minor',
  durationSec: 360,
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
  assert.equal(payload.sonaraGenreLock, 'v15-authoritative-ui-taxonomy-v5');
  assert.equal(payload.sonaraPromptIntelligence, 'sonara-prompt-intelligence-v2');
  assert.equal(payload.sonaraCoherenceCritic, 'sonara-musical-coherence-critic-v1');
  assert.equal(payload.sonaraProfessionalPromptPreserved, true);
  assert.equal(payload.sonaraCreativeControlsPreserved, true);
  assert.equal(payload.sonaraHarmonyIntelligence, true);
  assert.equal(payload.sonaraGrooveIntelligence, true);
  assert.equal(payload.sonaraSoundDesignIntelligence, true);
  assert.equal(payload.sonaraArrangementIntelligence, true);
  assert.equal(payload.sonaraNegativePromptIntelligence, true);
  assert.equal(payload.weirdness, 83);
  assert.equal(payload.styleInfluence, 37);
  assert.match(payload.prompt, new RegExp(`STYLE LOCK: Electronic / Dance > House > ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));
  assert.match(payload.prompt, /HARMONY:/i);
  assert.match(payload.prompt, /GROOVE:/i);
  assert.match(payload.prompt, /SOUND:/i);
  assert.match(payload.prompt, /ARRANGEMENT:/i);
  assert.match(payload.prompt, /MIX\/MASTER:/i);
  assert.match(payload.prompt, /CRITIC:/i);
  assert.ok(payload.prompt.length > 500, `${name} prompt must contain full musical direction`);
}

assert.equal(deep.bpm, 122);
assert.equal(deep.sonaraTempoLock, 'v15-authoritative-bpm-v5-ui');
assert.match(deep.prompt, /122 BPM exact/i);
assert.match(deep.prompt, /F minor/i);
assert.match(deep.prompt, /Rhodes\/extended chords/i);
assert.match(deep.prompt, /rounded club kick/i);
assert.match(deep.prompt, /DJ-friendly atmospheric intro/i);
assert.match(deep.prompt, /EDM supersaw drops/i);
assert.match(deep.prompt, /instrumental; no lead vocal/i);
assert.match(deep.prompt, /Rhodes 9th chords/i);

const conflicting = await read({
  ...common,
  subgenre: 'Deep House',
  bpm: 124,
  requestedBpm: 124,
  rawPrompt: 'Create a professional Jungle / Drum & Bass track at 170 BPM with rapid chopped breakbeats, rolling sub bass, dark rave energy and relentless forward motion.',
  prompt: 'Create a professional Jungle / Drum & Bass track at 170 BPM with rapid chopped breakbeats, rolling sub bass, dark rave energy and relentless forward motion.'
});

assert.equal(conflicting.bpm, 124);
assert.equal(conflicting.requestedBpm, 124);
assert.equal(conflicting.bpmLock, true);
assert.equal(conflicting.sonaraTempoLock, 'v15-authoritative-bpm-v5-ui');
assert.equal(conflicting.sonaraCreatorStylePriority, false);
assert.equal(conflicting.sonaraUiTaxonomyAuthoritative, true);
assert.match(conflicting.prompt, /STYLE LOCK: Electronic \/ Dance > House > Deep House/i);
assert.match(conflicting.prompt, /124 BPM exact/i);
assert.match(conflicting.prompt, /UI taxonomy overrides conflicting free text/i);
assert.match(conflicting.prompt, /Jungle \/ Drum & Bass track at 170 BPM/i);
assert.match(conflicting.prompt, /Structured 124 BPM overrides any conflicting tempo/i);
assert.match(conflicting.prompt, /never switch taxonomy/i);
assert.match(conflicting.prompt, /CREATOR BRIEF INSIDE ALL LOCKS/i);

assert.match(tech.prompt, /16th-note shuffle/i);
assert.match(afro.prompt, /polyrhythms/i);
assert.notEqual(deep.prompt, tech.prompt);
assert.notEqual(deep.prompt, afro.prompt);
assert.notEqual(tech.prompt, afro.prompt);

console.log('SONARA Prompt Intelligence v2 test passed: musical DNA, semantic creative controls, BPM/taxonomy authority, arrangement, mix and coherence critic are active.');
