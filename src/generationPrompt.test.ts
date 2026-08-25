import assert from 'node:assert/strict';

import { WORLD_MUSIC_GENRES } from './data/worldMusicGenres.ts';
import { buildGenerationPrompt, buildRandomCreativeBrief } from './generationPrompt.ts';
import {
  getAtmospheresForSelection,
  getMusicStyleProfile,
  hasCuratedGenreIdentity
} from './musicStyleIntelligence.ts';

const techHouse = {
  rawPrompt: 'A dark, driving warehouse track with restrained melodic material.',
  genreFamily: 'Electronic / Dance',
  genre: 'House',
  subgenre: 'Tech House',
  mood: 'Dark',
  bpm: 126,
  key: 'A Minor',
  durationSec: 120,
  vocalMode: 'instrumental' as const,
  lyrics: '',
  title: 'Warehouse Pulse'
};

const first = buildGenerationPrompt(techHouse);
const second = buildGenerationPrompt({ ...techHouse });
assert.equal(first, second, 'the same state must always create the same final prompt');
assert.match(first, /Family: Electronic \/ Dance/);
assert.match(first, /Genre: House/);
assert.match(first, /Subgenre: Tech House/);
assert.match(first, /Atmosphere: Dark/);
assert.match(first, /exactly 126 BPM/);
assert.match(first, /exactly A Minor/);
assert.match(first, /approximately 120 seconds/);
assert.match(first, /Strictly instrumental/);
assert.match(first, /four-on-the-floor/);
assert.match(first, /subgenre Tech House overrides generic family or genre conventions/);

const studioEightMinutePrompt = buildGenerationPrompt({ ...techHouse, durationSec: 480 });
const studioEightMinuteBrief = buildRandomCreativeBrief({ ...techHouse, durationSec: 480, variant: 2 });
assert.match(studioEightMinutePrompt, /approximately 480 seconds/);
assert.match(studioEightMinuteBrief, /approximately 480 seconds/);

const lyrics = 'Core mio, torna a cantà\nSotto a sta luna chiara';
const neapolitan = buildGenerationPrompt({
  rawPrompt: 'Traditional, intimate and emotionally direct.',
  genreFamily: 'Folk / Traditional Europe',
  genre: 'European Folk',
  subgenre: 'Neapolitan Song',
  mood: 'Heartfelt',
  bpm: 90,
  key: 'D Minor',
  durationSec: 180,
  vocalMode: 'female',
  lyrics,
  title: 'Luna Chiara'
});
assert.match(neapolitan, /mandolin/);
assert.match(neapolitan, /cantabile/);
assert.match(neapolitan, /female lead vocalist/);
assert.match(neapolitan, /exactly 90 BPM/);
assert.ok(neapolitan.includes(lyrics), 'lyrics must remain unchanged');
assert.ok(!neapolitan.includes('Strictly instrumental'));

const jazzFusionInput = {
  rawPrompt: 'An adventurous electric ensemble performance with strong interaction.',
  genreFamily: 'Jazz',
  genre: 'Jazz',
  subgenre: 'Jazz Fusion',
  mood: 'Electric',
  bpm: 118,
  key: 'E Minor',
  durationSec: 150,
  vocalMode: 'instrumental' as const,
  lyrics: '',
  title: 'Electric Conversation'
};
const jazzFusion = buildGenerationPrompt(jazzFusionInput);
assert.match(jazzFusion, /Genre: Jazz/);
assert.match(jazzFusion, /Subgenre: Jazz Fusion/);
assert.match(jazzFusion, /Rhodes or electric piano/);
assert.match(jazzFusion, /articulate electric bass/);
assert.match(jazzFusion, /funk- or rock-informed groove/);
assert.match(jazzFusion, /extended jazz chords/);
assert.match(jazzFusion, /purposeful virtuosic solos/);
assert.deepEqual(
  getAtmospheresForSelection('Jazz', 'Jazz', 'Jazz Fusion').slice(0, 4),
  ['Electric', 'Virtuosic', 'Dynamic', 'Groovy'],
  'Jazz Fusion must expose relevant atmospheres first'
);

const randomA = buildRandomCreativeBrief({ ...jazzFusionInput, variant: 0 });
const randomB = buildRandomCreativeBrief({ ...jazzFusionInput, variant: 1 });
const jazzFusionProfile = getMusicStyleProfile('Jazz', 'Jazz', 'Jazz Fusion');
assert.notEqual(randomA, randomB, 'professional RANDOM variants must provide controlled variety');
for (const required of ['Jazz Fusion', 'Jazz', 'Electric', '118 BPM', 'E Minor', '150 seconds', 'strictly instrumental']) {
  assert.ok(randomA.toLowerCase().includes(required.toLowerCase()), `RANDOM brief must include ${required}`);
}
assert.match(randomA, /Rhodes|electric|fusion/i);
for (const value of [
  jazzFusionProfile.identity,
  jazzFusionProfile.instrumentation,
  jazzFusionProfile.rhythm,
  jazzFusionProfile.harmony,
  jazzFusionProfile.arrangement,
  jazzFusionProfile.production
]) {
  assert.ok(randomA.includes(value), 'every RANDOM variant must contain the complete selected style profile');
}

const vocalLyrics = 'Hold the light through the night\nWe will find our way';
const vocalBase = {
  ...jazzFusionInput,
  lyrics: vocalLyrics,
  title: 'Two Voices'
};
const maleVocal = buildGenerationPrompt({ ...vocalBase, vocalMode: 'male' });
const femaleVocal = buildGenerationPrompt({ ...vocalBase, vocalMode: 'female' });
const duetVocal = buildGenerationPrompt({ ...vocalBase, vocalMode: 'duet' });
assert.match(maleVocal, /one clearly male lead vocalist/i);
assert.match(femaleVocal, /one clearly female lead vocalist/i);
assert.match(duetVocal, /two clearly distinct lead vocalists/i);
assert.match(duetVocal, /one male and one female/i);
assert.match(duetVocal, /two-part harmony/i);
assert.ok(maleVocal.includes(vocalLyrics));
assert.ok(femaleVocal.includes(vocalLyrics));
assert.ok(duetVocal.includes(vocalLyrics));
assert.notEqual(maleVocal, femaleVocal);
assert.notEqual(femaleVocal, duetVocal);

let genreCount = 0;
let subgenreCount = 0;
for (const family of WORLD_MUSIC_GENRES) {
  for (const genre of family.genres) {
    genreCount += 1;
    assert.ok(hasCuratedGenreIdentity(genre.name), `missing curated genre identity: ${family.family} / ${genre.name}`);
    for (const subgenre of genre.subgenres) {
      subgenreCount += 1;
      const moods = getAtmospheresForSelection(family.family, genre.name, subgenre);
      const profile = getMusicStyleProfile(family.family, genre.name, subgenre);
      assert.ok(moods.length >= 8, `insufficient atmospheres: ${family.family} / ${genre.name} / ${subgenre}`);
      assert.equal(new Set(moods).size, moods.length, `duplicate atmospheres: ${family.family} / ${genre.name} / ${subgenre}`);
      assert.ok(profile.identity.length >= 80, `weak identity: ${family.family} / ${genre.name} / ${subgenre}`);
      assert.ok(profile.instrumentation.length >= 40, `weak instrumentation: ${family.family} / ${genre.name} / ${subgenre}`);
      assert.ok(profile.rhythm.length >= 40, `weak rhythm: ${family.family} / ${genre.name} / ${subgenre}`);
      assert.ok(profile.harmony.length >= 40, `weak harmony: ${family.family} / ${genre.name} / ${subgenre}`);
      assert.ok(profile.arrangement.length >= 40, `weak arrangement: ${family.family} / ${genre.name} / ${subgenre}`);
      const randomBrief = buildRandomCreativeBrief({
        genreFamily: family.family,
        genre: genre.name,
        subgenre,
        mood: moods[0],
        bpm: 121,
        key: 'F# Minor',
        durationSec: 90,
        vocalMode: 'instrumental',
        lyrics: '',
        title: `Sonara ${subgenre} Track`,
        variant: 3
      });
      for (const required of [family.family, genre.name, subgenre, moods[0], '121 BPM', 'F# Minor', '90 seconds']) {
        assert.ok(randomBrief.toLowerCase().includes(required.toLowerCase()), `RANDOM lost ${required}: ${family.family} / ${genre.name} / ${subgenre}`);
      }
      for (const detail of [profile.identity, profile.instrumentation, profile.rhythm, profile.harmony, profile.arrangement, profile.production]) {
        assert.ok(randomBrief.includes(detail), `RANDOM lost style detail: ${family.family} / ${genre.name} / ${subgenre}`);
      }
    }
  }
}

assert.equal(genreCount, 83, 'all 83 genre categories must be covered');
assert.equal(subgenreCount, 693, 'all catalog subgenres, including Jazz / Jazz Fusion, must be covered');

console.log(`generationPrompt: complete coverage passed for ${WORLD_MUSIC_GENRES.length} families, ${genreCount} genres and ${subgenreCount} subgenres`);
