import assert from 'node:assert/strict';
import { WORLD_MUSIC_GENRES } from './data/worldMusicGenres.ts';
import {
  MUSIC_FAMILY_DNA_VERSION,
  MUSIC_FAMILY_PROFILES,
  getMusicFamilyProfile,
  hasMusicFamilyProfile
} from './musicFamilyIntelligence.ts';

const taxonomyFamilies = WORLD_MUSIC_GENRES.map(item => item.family).sort();
const profileFamilies = Object.keys(MUSIC_FAMILY_PROFILES).sort();

assert.equal(MUSIC_FAMILY_DNA_VERSION, 'sonara-family-dna-v1');
assert.equal(taxonomyFamilies.length, 25, 'SONARA must expose exactly 25 musical families');
assert.deepEqual(profileFamilies, taxonomyFamilies, 'every taxonomy family must have exactly one family DNA profile');

const fingerprints = new Set<string>();
for (const family of taxonomyFamilies) {
  assert.equal(hasMusicFamilyProfile(family), true, `missing family profile: ${family}`);
  const profile = getMusicFamilyProfile(family);
  for (const field of ['identity', 'instrumentation', 'rhythm', 'harmony', 'arrangement', 'production', 'avoid'] as const) {
    assert.ok(profile[field].length >= 80, `weak family ${field}: ${family}`);
  }
  const fingerprint = [
    profile.identity,
    profile.instrumentation,
    profile.rhythm,
    profile.harmony,
    profile.arrangement,
    profile.production,
    profile.avoid
  ].join('|');
  assert.ok(!fingerprints.has(fingerprint), `duplicate family DNA: ${family}`);
  fingerprints.add(fingerprint);
}

assert.equal(fingerprints.size, 25, 'all 25 families must have distinct DNA');
console.log('SONARA family DNA passed: 25/25 families have distinct identity, instrumentation, rhythm, harmony, arrangement, production and anti-drift rules.');
