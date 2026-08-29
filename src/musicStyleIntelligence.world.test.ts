import assert from 'node:assert/strict';
import { WORLD_MUSIC_GENRES } from './data/worldMusicGenres';
import { getMusicStyleProfile, getMusicTaxonomyAudit } from './musicStyleIntelligence';
import { resolveProfessionalTempoProfile } from './musicTempoIntelligence';

const REQUIRED_PROFILE_FIELDS = [
  'identity',
  'instrumentation',
  'rhythm',
  'harmony',
  'arrangement',
  'production',
  'avoid'
] as const;

const fingerprints = new Set<string>();
const familyCoverage = new Map<string, number>();
let leafCount = 0;

for (const family of WORLD_MUSIC_GENRES) {
  for (const genre of family.genres) {
    for (const subgenre of genre.subgenres) {
      leafCount += 1;
      familyCoverage.set(family.family, (familyCoverage.get(family.family) || 0) + 1);

      const profile = getMusicStyleProfile(family.family, genre.name, subgenre);
      const audit = getMusicTaxonomyAudit(family.family, genre.name, subgenre);
      const tempo = resolveProfessionalTempoProfile({
        family: family.family,
        genre: genre.name,
        subgenre
      });

      for (const field of REQUIRED_PROFILE_FIELDS) {
        const value = String(profile[field] || '').trim();
        assert.ok(
          value.length >= 40,
          `${family.family} > ${genre.name} > ${subgenre}: missing or weak ${field} style DNA`
        );
      }

      assert.ok(
        profile.identity.includes(subgenre),
        `${family.family} > ${genre.name} > ${subgenre}: identity does not explicitly preserve the subgenre`
      );
      assert.ok(
        profile.rhythm.includes(subgenre),
        `${family.family} > ${genre.name} > ${subgenre}: groove contract does not explicitly preserve the subgenre`
      );
      assert.ok(
        profile.instrumentation.includes(subgenre),
        `${family.family} > ${genre.name} > ${subgenre}: instrumentation contract does not explicitly preserve the subgenre`
      );
      assert.ok(
        profile.avoid.includes(subgenre),
        `${family.family} > ${genre.name} > ${subgenre}: anti-drift contract does not explicitly preserve the subgenre`
      );
      assert.ok(profile.moods.length >= 4, `${subgenre}: insufficient atmosphere/style signature`);
      assert.equal(audit.taxonomyPath, `${family.family} > ${genre.name} > ${subgenre}`);
      assert.ok(audit.fingerprint.length >= 8, `${subgenre}: missing style fingerprint`);
      assert.ok(!fingerprints.has(audit.fingerprint), `${subgenre}: duplicate style fingerprint ${audit.fingerprint}`);
      fingerprints.add(audit.fingerprint);

      assert.ok(tempo.minBpm >= 40 && tempo.minBpm <= 220, `${subgenre}: invalid min BPM`);
      assert.ok(tempo.maxBpm >= 40 && tempo.maxBpm <= 220, `${subgenre}: invalid max BPM`);
      assert.ok(tempo.idealBpm >= tempo.minBpm && tempo.idealBpm <= tempo.maxBpm, `${subgenre}: ideal BPM outside native range`);
    }
  }
}

assert.ok(WORLD_MUSIC_GENRES.length >= 20, 'World taxonomy unexpectedly lost musical families');
assert.ok(leafCount >= 200, `World taxonomy unexpectedly small: only ${leafCount} subgenre leaves`);
assert.equal(fingerprints.size, leafCount, 'Every taxonomy leaf must have a unique style fingerprint');

function style(family: string, genre: string, subgenre: string) {
  return getMusicStyleProfile(family, genre, subgenre);
}

const deepHouse = style('Electronic / Dance', 'House', 'Deep House');
const techHouse = style('Electronic / Dance', 'House', 'Tech House');
assert.notEqual(deepHouse.rhythm, techHouse.rhythm, 'Deep House and Tech House must not share the same groove DNA');
assert.notEqual(deepHouse.instrumentation, techHouse.instrumentation, 'Deep House and Tech House must not share the same instrumentation DNA');

const jungle = style('Electronic / Dance', 'Drum & Bass', 'Jungle');
const liquidDnb = style('Electronic / Dance', 'Drum & Bass', 'Liquid Drum & Bass');
assert.notEqual(jungle.rhythm, liquidDnb.rhythm, 'Jungle and Liquid DnB must not collapse into generic Drum & Bass');

const samba = style('Latin America', 'Brazilian', 'Samba');
const bossa = style('Latin America', 'Brazilian', 'Bossa Nova');
assert.notEqual(samba.rhythm, bossa.rhythm, 'Samba and Bossa Nova must keep distinct Brazilian rhythmic identities');

const amapiano = style('Africa', 'Southern African', 'Amapiano');
const gqom = style('Africa', 'Southern African', 'Gqom');
assert.notEqual(amapiano.identity, gqom.identity, 'Amapiano and Gqom must remain distinct South African styles');

const blackMetal = style('Metal', 'Extreme Metal', 'Black Metal');
const doomMetal = style('Metal', 'Extreme Metal', 'Doom Metal');
assert.notEqual(blackMetal.rhythm, doomMetal.rhythm, 'Black Metal and Doom Metal must not share the same performance grammar');

console.log(JSON.stringify({
  ok: true,
  families: WORLD_MUSIC_GENRES.length,
  subgenreLeaves: leafCount,
  uniqueStyleFingerprints: fingerprints.size,
  familyCoverage: Object.fromEntries(familyCoverage)
}, null, 2));
