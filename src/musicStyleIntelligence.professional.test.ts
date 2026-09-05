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

const LEGACY_CONTAINER_GENRES = new Set([
  'Regional Rap', 'Global Rap', 'Asian Pop', 'European Pop', 'Brazilian', 'Caribbean Latin',
  'Mexican / Regional', 'South American', 'West African', 'Southern African',
  'Central / East African', 'North African', 'Horn of Africa', 'Francophone African',
  'Caribbean', 'Arabic Music', 'Indian Popular', 'South Asian Folk',
  'Pakistan / Bangladesh / Sri Lanka', 'Japanese', 'Korean', 'Chinese', 'Mongolian',
  'Southeast Asian Popular', 'Traditional Southeast Asia', 'European Folk',
  'IDM / Experimental Electronic', 'Orchestral / Chamber', 'Spiritual / Devotional',
  'Anime / Media', 'Spoken / Novelty'
]);

const NON_ATMOSPHERE_LABELS = new Set([
  'authentic', 'professional', 'human', 'focused', 'dynamic', 'cultural', 'historic',
  'traditional', 'modern', 'acoustic', 'electric', 'digital', 'structured', 'rhythmic',
  'melodic', 'breakbeat', 'west-coast', 'slow', 'fast', 'synthetic'
]);

let familyCount = 0;
let genreCount = 0;
let subgenreCount = 0;
const allFingerprints = new Set<string>();

for (const family of WORLD_MUSIC_GENRES) {
  familyCount += 1;
  assert.ok(family.family.trim().length >= 3, `invalid family label: ${family.family}`);
  assert.ok(family.genres.length > 0, `family without genres: ${family.family}`);

  const genreNames = family.genres.map(item => item.name.toLocaleLowerCase('en-US'));
  assert.equal(new Set(genreNames).size, genreNames.length, `duplicate genres in family: ${family.family}`);

  for (const genre of family.genres) {
    genreCount += 1;
    assert.ok(!LEGACY_CONTAINER_GENRES.has(genre.name), `legacy container leaked into genre menu: ${family.family} / ${genre.name}`);
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
      assert.match(profile.identity, new RegExp(escapedSubgenre, 'i'), `identity does not name subgenre: ${family.family} / ${genre.name} / ${subgenre}`);
      assert.ok(atmospheres.length >= 8, `insufficient atmospheres: ${family.family} / ${genre.name} / ${subgenre}`);
      assert.equal(new Set(atmospheres.map(value => value.toLocaleLowerCase('en-US'))).size, atmospheres.length, `duplicate atmospheres: ${family.family} / ${genre.name} / ${subgenre}`);
      for (const atmosphere of atmospheres) {
        assert.ok(!NON_ATMOSPHERE_LABELS.has(atmosphere.toLocaleLowerCase('en-US')), `technical/non-atmosphere label leaked into UI: ${family.family} / ${genre.name} / ${subgenre} -> ${atmosphere}`);
      }
      assert.ok(audit.specificityScore >= 55, `low taxonomy specificity: ${audit.taxonomyPath} (${audit.specificityScore})`);
      assert.ok(!siblingFingerprints.has(audit.fingerprint), `identical sibling fingerprint: ${audit.taxonomyPath}`);
      siblingFingerprints.add(audit.fingerprint);
      allFingerprints.add(audit.fingerprint);
    }
  }
}

assert.equal(familyCount, 25, 'all 25 music families must remain available');
assert.ok(genreCount > 140, `professional hierarchy must expose real genres instead of legacy buckets (found ${genreCount})`);
// The legacy catalog contained 720 menu positions, but Jazz Fusion appeared twice:
// once incorrectly under Jazz and once under its real Jazz Fusion parent. Exact-parent
// normalization intentionally deduplicates that single legacy duplicate, leaving 719
// legacy selectable taxonomy paths. Hip-Hop / Rap Freestyle adds 12 authentic
// selectable freestyle paths, for a current canonical total of 731.
assert.equal(subgenreCount, 731, 'all 731 exact selectable musical styles must remain available, including 12 Hip-Hop Rap Freestyle paths');
assert.equal(allFingerprints.size, subgenreCount, 'every taxonomy path must produce a distinct professional fingerprint');

function family(name: string) {
  const result = WORLD_MUSIC_GENRES.find(group => group.family === name);
  assert.ok(result, `missing family: ${name}`);
  return result;
}

function genre(familyName: string, genreName: string) {
  const result = family(familyName).genres.find(item => item.name === genreName);
  assert.ok(result, `missing genre: ${familyName} / ${genreName}`);
  return result;
}

function assertChildren(familyName: string, genreName: string, expected: string[]) {
  const children = genre(familyName, genreName).subgenres;
  for (const child of expected) assert.ok(children.includes(child), `wrong parent: ${familyName} / ${genreName} must contain ${child}`);
}

assertChildren('Hip-Hop / Rap', 'West Coast Rap', ['West Coast Rap', 'G-Funk', 'Bay Area Hyphy']);
assertChildren('Hip-Hop / Rap', 'Southern Rap', ['Dirty South', 'Memphis Rap', 'Houston Chopped & Screwed']);
assertChildren('Hip-Hop / Rap', 'French Rap', ['French Rap']);
assertChildren('Pop', 'Mandopop', ['Mandopop']);
assertChildren('Jazz', 'Jazz Fusion', ['Jazz Fusion']);
assert.ok(!genre('Jazz', 'Jazz').subgenres.includes('Jazz Fusion'), 'Jazz Fusion must not remain duplicated under the generic Jazz parent');
assertChildren('Latin America', 'Samba', ['Samba', 'Pagode']);
assertChildren('Latin America', 'MPB', ['MPB']);
assertChildren('Latin America', 'Tropicália', ['Tropicália']);
assertChildren('Latin America', 'Mariachi', ['Mariachi']);
assertChildren('Latin America', 'Ranchera', ['Ranchera']);
assertChildren('Africa', 'Amapiano', ['Amapiano', '3-Step']);
assertChildren('Africa', 'Afrobeat', ['Afrobeat']);
assertChildren('Africa', 'Afrobeats', ['Afrobeats']);
assertChildren('Africa', 'Highlife', ['Highlife']);
assertChildren('Africa', 'Hiplife', ['Hiplife']);
assertChildren('Caribbean', 'Calypso', ['Calypso']);
assertChildren('Caribbean', 'Soca', ['Soca']);
assertChildren('Middle East / North Africa', 'Tarab', ['Tarab']);
assertChildren('Middle East / North Africa', 'Maqam', ['Maqam']);
assertChildren('South Asia', 'Qawwali', ['Qawwali']);
assertChildren('South Asia', 'Ghazal', ['Ghazal']);
assertChildren('East Asia', 'J-Pop', ['J-Pop']);
assertChildren('East Asia', 'City Pop', ['City Pop']);
assertChildren('East Asia', 'K-R&B', ['K-R&B']);
assertChildren('East Asia', 'K-Hip-Hop', ['K-Hip-Hop']);
assertChildren('Southeast Asia', 'Gamelan', ['Gamelan']);
assertChildren('Folk / Traditional Europe', 'Celtic Folk', ['Celtic Folk']);
assertChildren('Folk / Traditional Europe', 'Irish Traditional', ['Irish Traditional']);
assertChildren('Folk / Traditional Europe', 'Fado', ['Fado']);
assertChildren('Folk / Traditional Europe', 'Neapolitan Song', ['Neapolitan Song']);
assertChildren('Classical / Art Music', 'Chamber Music', ['Chamber Music', 'String Quartet']);
assertChildren('Gospel / Spiritual', 'Worship', ['Worship']);
assertChildren('Cinematic / Media', 'Anime Music', ['Anime Opening', 'Anime Ending', 'Anime Score']);
assertChildren('Children / Novelty / Spoken', 'Spoken Word', ['Spoken Word']);

const neapolitanFamily = family('Neomelodica Napoletana');
const neapolitanModern = neapolitanFamily.genres.find(item => item.name === 'Neomelodica Napoletana Moderna');
assert.ok(neapolitanModern, 'Neomelodica Napoletana Moderna genre must remain available');
for (const requiredSubgenre of ['Rap Napoletano', 'Hip-Hop Napoletano', 'Trap Napoletano']) {
  assert.ok(neapolitanModern.subgenres.includes(requiredSubgenre), `${requiredSubgenre} must remain selectable in the Neapolitan subgenre menu`);
}

function assertAtmospherePrefix(familyName: string, genreName: string, subgenre: string, expected: string[]) {
  assert.deepEqual(getAtmospheresForSelection(familyName, genreName, subgenre).slice(0, expected.length), expected, `incorrect atmosphere hierarchy: ${familyName} / ${genreName} / ${subgenre}`);
}

assertAtmospherePrefix('Electronic / Dance', 'House', 'Deep House', ['Deep', 'Warm', 'Hypnotic', 'Soulful']);
assertAtmospherePrefix('Electronic / Dance', 'House', 'Tech House', ['Groovy', 'Driving', 'Hypnotic', 'Underground']);
assertAtmospherePrefix('Latin America', 'Bossa Nova', 'Bossa Nova', ['Intimate', 'Relaxed', 'Elegant', 'Romantic']);
assertAtmospherePrefix('Latin America', 'Samba', 'Samba', ['Festive', 'Joyful', 'Communal', 'Energetic']);
assertAtmospherePrefix('South Asia', 'Indian Classical', 'Hindustani Classical', ['Meditative', 'Expansive', 'Devotional', 'Intense']);
assertAtmospherePrefix('South Asia', 'Indian Classical', 'Carnatic Classical', ['Devotional', 'Intricate', 'Ecstatic', 'Energetic']);
assertAtmospherePrefix('Folk / Traditional Europe', 'Fado', 'Fado', ['Saudade', 'Melancholic', 'Intimate', 'Nostalgic']);
assertAtmospherePrefix('Folk / Traditional Europe', 'Flamenco', 'Flamenco', ['Passionate', 'Fiery', 'Raw', 'Dramatic']);
assertAtmospherePrefix('Cinematic / Media', 'Soundtrack', 'Film Score', ['Cinematic', 'Emotional', 'Narrative', 'Atmospheric']);
assertAtmospherePrefix('Cinematic / Media', 'Soundtrack', 'Trailer Music', ['Epic', 'Massive', 'Heroic', 'Tense']);
assertAtmospherePrefix('Africa', 'Gnawa', 'Gnawa', ['Ritual', 'Spiritual', 'Hypnotic', 'Earthy']);
assertAtmospherePrefix('Africa', 'Highlife', 'Highlife', ['Joyful', 'Elegant', 'Groovy', 'Sunny']);

const globalAfroHouse = getMusicStyleProfile('Electronic / Dance', 'House', 'Afro House');
const africanAfroHouse = getMusicStyleProfile('Africa', 'Afro House', 'Afro House');
assert.notEqual(globalAfroHouse.identity, africanAfroHouse.identity, 'duplicate names must be resolved by full taxonomy path');

const trapPrimary = getMusicStyleProfile('Hip-Hop / Rap', 'Trap', 'Trap Soul');
const rnbPrimary = getMusicStyleProfile('R&B / Soul / Funk', 'R&B', 'Trap Soul');
assert.notEqual(trapPrimary.identity, rnbPrimary.identity, 'Trap Soul must honor its parent context');

const jazzFusion = getMusicStyleProfile('Jazz', 'Jazz Fusion', 'Jazz Fusion');
assert.match(jazzFusion.instrumentation, /Rhodes or electric piano/);
assert.match(jazzFusion.rhythm, /funk- or rock-informed groove/);
assert.match(jazzFusion.harmony, /extended jazz chords/);
assert.match(jazzFusion.arrangement, /purposeful virtuosic solos/);

const neapolitan = getMusicStyleProfile('Folk / Traditional Europe', 'Neapolitan Song', 'Neapolitan Song');
assert.match(neapolitan.identity, /cantabile/);
assert.match(neapolitan.instrumentation, /mandolin/);

console.log(`professional taxonomy exact-subgenre-parent passed: ${familyCount} families, ${genreCount} real genres, ${subgenreCount} selectable styles, ${allFingerprints.size} distinct fingerprints`);
