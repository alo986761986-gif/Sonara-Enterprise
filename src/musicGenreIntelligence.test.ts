import assert from 'node:assert/strict';
import { WORLD_MUSIC_GENRES } from './data/worldMusicGenres.ts';
import {
  MUSIC_GENRE_DNA_VERSION,
  getMusicGenreProfile,
  hasMusicGenreProfile,
  listMusicGenreProfiles
} from './musicGenreIntelligence.ts';

assert.equal(MUSIC_GENRE_DNA_VERSION, 'sonara-genre-dna-v1');

const expectedCount = WORLD_MUSIC_GENRES.reduce((sum, family) => sum + family.genres.length, 0);
const profiles = listMusicGenreProfiles();
assert.equal(expectedCount, 356, 'canonical taxonomy must expose 356 real genres');
assert.equal(profiles.length, expectedCount, 'every real genre must have one Genre DNA profile');

const fingerprints = new Set<string>();
for (const family of WORLD_MUSIC_GENRES) {
  const siblingGenres = new Set(family.genres.map(item => item.name));
  for (const genre of family.genres) {
    assert.equal(hasMusicGenreProfile(family.family, genre.name), true, `missing Genre DNA: ${family.family} > ${genre.name}`);
    const profile = getMusicGenreProfile(family.family, genre.name);
    assert.equal(profile.family, family.family);
    assert.equal(profile.genre, genre.name);
    assert.deepEqual(profile.subgenres, genre.subgenres);
    for (const field of ['identity', 'instrumentation', 'rhythm', 'harmony', 'arrangement', 'production', 'avoid'] as const) {
      assert.ok(profile[field].length >= 120, `weak Genre DNA ${field}: ${family.family} > ${genre.name}`);
      assert.match(profile[field], new RegExp(genre.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
    }
    for (const child of genre.subgenres) {
      assert.ok(profile.subgenres.includes(child), `genre lost subgenre child: ${family.family} > ${genre.name} > ${child}`);
    }
    const fp = [profile.family, profile.genre, profile.identity, profile.instrumentation, profile.rhythm, profile.harmony, profile.arrangement, profile.production, profile.avoid].join('|');
    assert.ok(!fingerprints.has(fp), `duplicate Genre DNA: ${family.family} > ${genre.name}`);
    fingerprints.add(fp);

    for (const sibling of siblingGenres) {
      if (sibling === genre.name) continue;
      assert.notEqual(
        getMusicGenreProfile(family.family, sibling).identity,
        profile.identity,
        `sibling genres collapsed: ${family.family} > ${genre.name} / ${sibling}`
      );
    }
  }
}

assert.equal(fingerprints.size, 356, 'all 356 real genres must have distinct Genre DNA');

for (const [family, a, b] of [
  ['Electronic / Dance', 'House', 'Techno'],
  ['Latin America', 'Salsa', 'Reggaeton'],
  ['Jazz', 'Jazz', 'Jazz Fusion'],
  ['Rock', 'Rock', 'Alternative Rock'],
  ['Hip-Hop / Rap', 'Trap', 'Drill'],
  ['Africa', 'Afrobeat', 'Afrobeats'],
  ['South Asia', 'Indian Classical', 'Bollywood'],
  ['Classical / Art Music', 'Opera', 'Chamber Music']
] as const) {
  const left = getMusicGenreProfile(family, a);
  const right = getMusicGenreProfile(family, b);
  assert.notEqual(left.identity, right.identity, `${a} and ${b} must remain distinct`);
  assert.notEqual(left.rhythm, right.rhythm, `${a} and ${b} must keep distinct rhythm DNA`);
  assert.notEqual(left.avoid, right.avoid, `${a} and ${b} must keep distinct anti-drift DNA`);
}

console.log('SONARA Genre DNA passed: 356/356 real genres have distinct identity, instrumentation, rhythm, harmony, form, production and anti-drift contracts.');
