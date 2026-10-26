import assert from 'node:assert/strict';
import { WORLD_MUSIC_GENRES } from './data/worldMusicGenres.ts';
import {
  MUSIC_SUBGENRE_DNA_VERSION,
  getMusicSubgenreProfile,
  hasMusicSubgenreProfile,
  listMusicSubgenreProfiles
} from './musicSubgenreIntelligence.ts';

assert.equal(MUSIC_SUBGENRE_DNA_VERSION, 'sonara-subgenre-dna-v1');

const expectedCount = WORLD_MUSIC_GENRES.reduce(
  (sum, family) => sum + family.genres.reduce((inner, genre) => inner + genre.subgenres.length, 0),
  0
);
assert.equal(expectedCount, 731, 'canonical taxonomy must expose 731 selectable subgenre paths');

const profiles = listMusicSubgenreProfiles();
assert.equal(profiles.length, 731, 'every selectable subgenre path must have one Subgenre DNA profile');

const fingerprints = new Set<string>();
for (const family of WORLD_MUSIC_GENRES) {
  for (const genre of family.genres) {
    const siblingFingerprints = new Set<string>();
    for (const subgenre of genre.subgenres) {
      assert.equal(hasMusicSubgenreProfile(family.family, genre.name, subgenre), true, `missing Subgenre DNA: ${family.family} > ${genre.name} > ${subgenre}`);
      const profile = getMusicSubgenreProfile(family.family, genre.name, subgenre);
      assert.equal(profile.family, family.family);
      assert.equal(profile.genre, genre.name);
      assert.equal(profile.subgenre, subgenre);
      for (const field of ['identity', 'instrumentation', 'rhythm', 'harmony', 'arrangement', 'production', 'avoid'] as const) {
        assert.ok(profile[field].length >= 140, `weak Subgenre DNA ${field}: ${family.family} > ${genre.name} > ${subgenre}`);
        assert.ok(profile[field].toLocaleLowerCase('en-US').includes(subgenre.toLocaleLowerCase('en-US')), `Subgenre DNA does not name leaf in ${field}: ${family.family} > ${genre.name} > ${subgenre}`);
      }
      for (const sibling of genre.subgenres) {
        if (sibling === subgenre) continue;
        assert.ok(profile.siblingSubgenres.includes(sibling), `anti-drift sibling missing: ${family.family} > ${genre.name} > ${subgenre} vs ${sibling}`);
      }
      const fp = [family.family, genre.name, subgenre, profile.identity, profile.instrumentation, profile.rhythm, profile.harmony, profile.arrangement, profile.production, profile.avoid].join('|');
      assert.ok(!fingerprints.has(fp), `duplicate Subgenre DNA path: ${family.family} > ${genre.name} > ${subgenre}`);
      assert.ok(!siblingFingerprints.has(fp), `sibling Subgenre DNA collapsed: ${family.family} > ${genre.name} > ${subgenre}`);
      fingerprints.add(fp);
      siblingFingerprints.add(fp);
    }
  }
}
assert.equal(fingerprints.size, 731, 'all 731 selectable subgenre paths must have distinct DNA');

for (const [family, genre, a, b] of [
  ['Electronic / Dance', 'House', 'Deep House', 'Tech House'],
  ['Electronic / Dance', 'Drum & Bass', 'Jungle', 'Liquid Drum & Bass'],
  ['Latin America', 'Samba', 'Samba', 'Pagode'],
  ['Africa', 'Amapiano', 'Amapiano', '3-Step'],
  ['South Asia', 'Indian Classical', 'Hindustani Classical', 'Carnatic Classical'],
  ['Cinematic / Media', 'Soundtrack', 'Film Score', 'Trailer Music'],
  ['Neomelodica Napoletana', 'Neomelodica Napoletana Moderna', 'Rap Napoletano', 'Trap Napoletano']
] as const) {
  const left = getMusicSubgenreProfile(family, genre, a);
  const right = getMusicSubgenreProfile(family, genre, b);
  assert.notEqual(left.identity, right.identity, `${a} and ${b} must keep distinct Subgenre DNA`);
  assert.notEqual(left.rhythm, right.rhythm, `${a} and ${b} must keep distinct rhythmic DNA`);
  assert.notEqual(left.avoid, right.avoid, `${a} and ${b} must keep distinct anti-drift DNA`);
}

const globalAfroHouse = getMusicSubgenreProfile('Electronic / Dance', 'House', 'Afro House');
const africanAfroHouse = getMusicSubgenreProfile('Africa', 'Afro House', 'Afro House');
assert.notEqual(globalAfroHouse.identity, africanAfroHouse.identity, 'same-named subgenres in different taxonomy paths must remain distinct');

const trapTrapSoul = getMusicSubgenreProfile('Hip-Hop / Rap', 'Trap', 'Trap Soul');
const rnbTrapSoul = getMusicSubgenreProfile('R&B / Soul / Funk', 'R&B', 'Trap Soul');
assert.notEqual(trapTrapSoul.identity, rnbTrapSoul.identity, 'Trap Soul must remain parent-context specific');

console.log('SONARA Subgenre DNA passed: 731/731 selectable paths have distinct identity, instrumentation, rhythm, harmony, form, production and anti-drift contracts.');
