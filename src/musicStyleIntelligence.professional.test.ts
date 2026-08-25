import assert from 'node:assert/strict';

import { WORLD_MUSIC_GENRES } from './data/worldMusicGenres.ts';
import {
  getAtmospheresForSelection,
  getMusicStyleProfile,
  getMusicTaxonomyAudit,
  hasCuratedGenreIdentity
} from './musicStyleIntelligence.ts';

const REQUIRED_FIELDS = [
  'identity',
  'instrumentation',
  'rhythm',
  'harmony',
  'arrangement',
  'production',
  'avoid'
] as const;

let familyCount = 0;
let genreCount = 0;
let subgenreCount = 0;
const allFingerprints = new Set<string>();

for (const family of WORLD_MUSIC_GENRES) {
  familyCount += 1;
  assert.ok(family.family.trim().length >= 3, `invalid family label: ${family.family}`);
  assert.ok(family.genres.length > 0, `family without genres: ${family.family}`);

  for (const genre of family.genres) {
    genreCount += 1;
    assert.ok(hasCuratedGenreIdentity(genre.name), `missing professional genre blueprint: ${family.family} / ${genre.name}`);
    assert.ok(genre.subgenres.length > 0, `genre without subgenres: ${family.family} / ${genre.name}`);

    const siblingFingerprints = new Set<string>();
    for (const subgenre of genre.subgenres) {
      subgenreCount += 1;
      const profile = getMusicStyleProfile(family.family, genre.name, subgenre);
      const atmospheres = getAtmospheresForSelection(family.family, genre.name, subgenre);
      const audit = getMusicTaxonomyAudit(family.family, genre.name, subgenre);

      for (const field of REQUIRED_FIELDS) {
        assert.ok(profile[field].length >= 80, `weak ${field}: ${family.family} / ${genre.name} / ${subgenre}`);
      }

      const escapedSubgenre = subgenre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      assert.match(
        profile.identity,
        new RegExp(escapedSubgenre, 'i'),
        `identity does not name subgenre: ${family.family} / ${genre.name} / ${subgenre}`
      );
      assert.ok(atmospheres.length >= 8, `insufficient atmospheres: ${family.family} / ${genre.name} / ${subgenre}`);
      assert.equal(
        new Set(atmospheres.map(value => value.toLocaleLowerCase('en-US'))).size,
        atmospheres.length,
        `duplicate atmospheres: ${family.family} / ${genre.name} / ${subgenre}`
      );
      assert.ok(audit.specificityScore >= 55, `low taxonomy specificity: ${audit.taxonomyPath} (${audit.specificityScore})`);
      assert.ok(!siblingFingerprints.has(audit.fingerprint), `identical sibling fingerprint: ${audit.taxonomyPath}`);
      siblingFingerprints.add(audit.fingerprint);
      allFingerprints.add(audit.fingerprint);
    }
  }
}

assert.equal(familyCount, 25, 'all 25 music families must remain available');
assert.equal(genreCount, 86, 'all 86 genre categories must remain available');
assert.equal(subgenreCount, 720, 'all 720 subgenres must remain available');
assert.equal(allFingerprints.size, subgenreCount, 'every taxonomy path must produce a distinct professional fingerprint');

function assertAtmospherePrefix(family: string, genre: string, subgenre: string, expected: string[]) {
  assert.deepEqual(
    getAtmospheresForSelection(family, genre, subgenre).slice(0, expected.length),
    expected,
    `incorrect atmosphere hierarchy: ${family} / ${genre} / ${subgenre}`
  );
}

assertAtmospherePrefix('Electronic / Dance', 'House', 'Deep House', ['Deep', 'Warm', 'Hypnotic', 'Soulful']);
assertAtmospherePrefix('Electronic / Dance', 'House', 'Tech House', ['Groovy', 'Driving', 'Hypnotic', 'Underground']);
assertAtmospherePrefix('Latin America', 'Brazilian', 'Bossa Nova', ['Intimate', 'Relaxed', 'Elegant', 'Romantic']);
assertAtmospherePrefix('Latin America', 'Brazilian', 'Samba', ['Festive', 'Joyful', 'Communal', 'Energetic']);
assertAtmospherePrefix('South Asia', 'Indian Classical', 'Hindustani Classical', ['Meditative', 'Expansive', 'Devotional', 'Intense']);
assertAtmospherePrefix('South Asia', 'Indian Classical', 'Carnatic Classical', ['Devotional', 'Intricate', 'Ecstatic', 'Energetic']);
assertAtmospherePrefix('Folk / Traditional Europe', 'European Folk', 'Fado', ['Saudade', 'Melancholic', 'Intimate', 'Nostalgic']);
assertAtmospherePrefix('Folk / Traditional Europe', 'European Folk', 'Flamenco', ['Passionate', 'Fiery', 'Raw', 'Dramatic']);
assertAtmospherePrefix('Cinematic / Media', 'Soundtrack', 'Film Score', ['Cinematic', 'Emotional', 'Narrative', 'Atmospheric']);
assertAtmospherePrefix('Cinematic / Media', 'Soundtrack', 'Trailer Music', ['Epic', 'Massive', 'Heroic', 'Tense']);
assertAtmospherePrefix('Africa', 'North African', 'Gnawa', ['Ritual', 'Spiritual', 'Hypnotic', 'Earthy']);
assertAtmospherePrefix('Africa', 'West African', 'Highlife', ['Joyful', 'Elegant', 'Groovy', 'Sunny']);

const globalAfroHouse = getMusicStyleProfile('Electronic / Dance', 'House', 'Afro House');
const southernAfricanAfroHouse = getMusicStyleProfile('Africa', 'Southern African', 'Afro House');
assert.notEqual(globalAfroHouse.identity, southernAfricanAfroHouse.identity, 'duplicate names must be resolved by full taxonomy path');

const trapPrimary = getMusicStyleProfile('Hip-Hop / Rap', 'Trap', 'Trap Soul');
const rnbPrimary = getMusicStyleProfile('R&B / Soul / Funk', 'R&B', 'Trap Soul');
assert.notEqual(trapPrimary.identity, rnbPrimary.identity, 'Trap Soul must honor its parent context');

const jazzFusion = getMusicStyleProfile('Jazz', 'Jazz', 'Jazz Fusion');
assert.match(jazzFusion.instrumentation, /Rhodes or electric piano/);
assert.match(jazzFusion.rhythm, /funk- or rock-informed groove/);
assert.match(jazzFusion.harmony, /extended jazz chords/);
assert.match(jazzFusion.arrangement, /purposeful virtuosic solos/);

const neapolitan = getMusicStyleProfile('Folk / Traditional Europe', 'European Folk', 'Neapolitan Song');
assert.match(neapolitan.identity, /cantabile/);
assert.match(neapolitan.instrumentation, /mandolin/);

console.log(`professional taxonomy passed: ${familyCount} families, ${genreCount} genres, ${subgenreCount} subgenres, ${allFingerprints.size} distinct fingerprints`);
