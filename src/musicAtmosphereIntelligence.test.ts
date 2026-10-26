import assert from 'node:assert/strict';
import { WORLD_MUSIC_GENRES } from './data/worldMusicGenres.ts';
import { getAtmospheresForSelection } from './musicStyleIntelligence.ts';
import {
  MUSIC_ATMOSPHERE_DNA_VERSION,
  NON_ATMOSPHERE_LABELS,
  getMusicAtmosphereProfile
} from './musicAtmosphereIntelligence.ts';

assert.equal(MUSIC_ATMOSPHERE_DNA_VERSION, 'sonara-atmosphere-dna-v1');

let pathCount = 0;
let selectionCount = 0;
const uniqueAtmospheres = new Set<string>();

for (const family of WORLD_MUSIC_GENRES) {
  for (const genre of family.genres) {
    for (const subgenre of genre.subgenres) {
      pathCount += 1;
      const options = getAtmospheresForSelection(family.family, genre.name, subgenre);
      assert.ok(options.length >= 8, `insufficient real atmospheres: ${family.family} > ${genre.name} > ${subgenre}`);
      assert.ok(options.length <= 10, `too many atmosphere options: ${family.family} > ${genre.name} > ${subgenre}`);
      assert.equal(new Set(options.map(x => x.toLocaleLowerCase('en-US'))).size, options.length, `duplicate atmospheres: ${family.family} > ${genre.name} > ${subgenre}`);
      const pathFingerprints = new Set<string>();
      for (const atmosphere of options) {
        selectionCount += 1;
        uniqueAtmospheres.add(atmosphere);
        assert.ok(!NON_ATMOSPHERE_LABELS.has(atmosphere.toLocaleLowerCase('en-US')), `technical label leaked as atmosphere: ${atmosphere}`);
        const profile = getMusicAtmosphereProfile(atmosphere, {
          family: family.family,
          genre: genre.name,
          subgenre
        });
        assert.equal(profile.atmosphere, atmosphere);
        for (const axis of ['energy', 'tension', 'brightness', 'density', 'space', 'intimacy', 'rawness', 'motion'] as const) {
          assert.ok(profile[axis] >= 0 && profile[axis] <= 100, `invalid atmosphere axis ${axis}: ${atmosphere}`);
        }
        for (const field of ['identity', 'performance', 'arrangement', 'production', 'guardrail'] as const) {
          assert.ok(profile[field].length >= 120, `weak atmosphere ${field}: ${atmosphere}`);
          assert.ok(profile[field].includes(atmosphere), `atmosphere name missing in ${field}: ${atmosphere}`);
        }
        assert.ok(profile.guardrail.includes(`${family.family} > ${genre.name} > ${subgenre}`), `taxonomy guardrail missing: ${atmosphere}`);
        assert.ok(!pathFingerprints.has(profile.fingerprint), `two atmosphere options collapsed to same DNA: ${family.family} > ${genre.name} > ${subgenre} > ${atmosphere}`);
        pathFingerprints.add(profile.fingerprint);
      }
    }
  }
}

assert.equal(pathCount, 731, 'all 731 selectable subgenre paths must receive atmosphere DNA');
assert.ok(selectionCount >= 731 * 8, 'every subgenre path must expose at least eight real atmospheres');

function compare(family: string, genre: string, subgenre: string, a: string, b: string) {
  const left = getMusicAtmosphereProfile(a, { family, genre, subgenre });
  const right = getMusicAtmosphereProfile(b, { family, genre, subgenre });
  assert.notEqual(left.fingerprint, right.fingerprint, `${a} and ${b} atmosphere DNA must differ`);
  const axes = ['energy', 'tension', 'brightness', 'density', 'space', 'intimacy', 'rawness', 'motion'] as const;
  assert.ok(axes.some(axis => left[axis] !== right[axis]), `${a} and ${b} must change at least one audible control axis`);
}

compare('Electronic / Dance', 'House', 'Deep House', 'Warm', 'Dark');
compare('Electronic / Dance', 'House', 'Tech House', 'Groovy', 'Underground');
compare('Latin America', 'Bossa Nova', 'Bossa Nova', 'Intimate', 'Sunny');
compare('Metal', 'Extreme Metal', 'Black Metal', 'Frostbitten', 'Ritual');
compare('R&B / Soul / Funk', 'R&B', 'Neo Soul', 'Soulful', 'Late-Night');
compare('Cinematic / Media', 'Soundtrack', 'Film Score', 'Epic', 'Mysterious');

console.log(`SONARA Atmosphere DNA passed: ${pathCount} taxonomy paths, ${selectionCount} selectable atmosphere bindings, ${uniqueAtmospheres.size} unique atmosphere labels.`);
