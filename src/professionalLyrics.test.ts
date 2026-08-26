import assert from 'node:assert/strict';
import { buildProfessionalLyricsFallback, professionalLyricsArchetype } from './professionalLyrics';

type Case = {
  family: string;
  genre: string;
  subgenre: string;
  mood: string;
  bpm: number;
  expectedArchetype: string;
  expectedTag: RegExp;
};

const cases: Case[] = [
  { family: 'Hip-Hop / Rap', genre: 'Hip-Hop', subgenre: 'Boom Bap', mood: 'Gritty', bpm: 92, expectedArchetype: 'rap', expectedTag: /\[Verse 1 - 16 bars\]/ },
  { family: 'Hip-Hop / Rap', genre: 'Drill', subgenre: 'UK Drill', mood: 'Cold', bpm: 142, expectedArchetype: 'trap-drill', expectedTag: /\[Hook\]/ },
  { family: 'Pop', genre: 'Pop', subgenre: 'Contemporary Pop', mood: 'Romantic', bpm: 112, expectedArchetype: 'pop', expectedTag: /\[Pre-Chorus\]/ },
  { family: 'Rock', genre: 'Rock', subgenre: 'Classic Rock', mood: 'Confident', bpm: 126, expectedArchetype: 'rock', expectedTag: /\[Instrumental \/ Guitar Break - 8 bars\]/ },
  { family: 'Metal', genre: 'Extreme Metal', subgenre: 'Doom Metal', mood: 'Ominous', bpm: 72, expectedArchetype: 'metal', expectedTag: /\[Breakdown\]/ },
  { family: 'Jazz', genre: 'Jazz', subgenre: 'Bebop', mood: 'Adventurous', bpm: 168, expectedArchetype: 'jazz', expectedTag: /\[Instrumental Solo - 16 bars\]/ },
  { family: 'Blues', genre: 'Blues', subgenre: 'Chicago Blues', mood: 'Raw', bpm: 96, expectedArchetype: 'blues', expectedTag: /\[Verse 1 - AAB\]/ },
  { family: 'Gospel / Spiritual', genre: 'Gospel', subgenre: 'Contemporary Gospel', mood: 'Spiritual', bpm: 104, expectedArchetype: 'gospel', expectedTag: /\[Final Chorus \/ Choir Lift\]/ },
  { family: 'Electronic / Dance', genre: 'House', subgenre: 'Deep House', mood: 'Deep', bpm: 122, expectedArchetype: 'club-minimal', expectedTag: /\[Instrumental Groove - 8 bars\]/ },
  { family: 'Electronic / Dance', genre: 'Trance', subgenre: 'Uplifting Trance', mood: 'Euphoric', bpm: 136, expectedArchetype: 'club-anthem', expectedTag: /\[Instrumental Drop - 8 bars\]/ }
];

for (const item of cases) {
  assert.equal(professionalLyricsArchetype({ genreFamily: item.family, genre: item.genre, subgenre: item.subgenre }), item.expectedArchetype);
  const input = {
    language: 'it',
    languageName: 'Italiano',
    genreFamily: item.family,
    genre: item.genre,
    subgenre: item.subgenre,
    mood: item.mood,
    vocalMode: 'male' as const,
    durationSec: 300,
    bpm: item.bpm,
    title: 'Quality Test'
  };
  const first = buildProfessionalLyricsFallback({ ...input, variant: 101 });
  const second = buildProfessionalLyricsFallback({ ...input, variant: 102 });
  assert.ok(first.length >= 900, `lyrics too short for ${item.subgenre}: ${first.length}`);
  assert.ok(first.length <= 4100, `lyrics exceed engine budget for ${item.subgenre}: ${first.length}`);
  assert.match(first, item.expectedTag, `missing genre structure for ${item.subgenre}`);
  assert.notEqual(first, second, `variants must differ for ${item.subgenre}`);
  const lines = first.split('\n').map(line => line.trim()).filter(Boolean).filter(line => !/^\[.+\]$/.test(line));
  assert.ok(lines.length >= 24, `insufficient lyric density for ${item.subgenre}: ${lines.length}`);
  const uniqueRatio = new Set(lines.map(line => line.toLocaleLowerCase('it-IT'))).size / lines.length;
  assert.ok(uniqueRatio >= 0.65, `excessive repetition for ${item.subgenre}: ${uniqueRatio}`);
  assert.ok(!first.toLocaleLowerCase('it-IT').includes(`lascia parlare ${item.subgenre.toLocaleLowerCase('it-IT')}`), `legacy generic lyric leaked into ${item.subgenre}`);
}

const shortPop = buildProfessionalLyricsFallback({
  language: 'en', languageName: 'English', genreFamily: 'Pop', genre: 'Pop', subgenre: 'Contemporary Pop', mood: 'Uplifting', vocalMode: 'female', variant: 9, durationSec: 60, bpm: 118
});
const longPop = buildProfessionalLyricsFallback({
  language: 'en', languageName: 'English', genreFamily: 'Pop', genre: 'Pop', subgenre: 'Contemporary Pop', mood: 'Uplifting', vocalMode: 'female', variant: 9, durationSec: 360, bpm: 118
});
assert.ok(longPop.length > shortPop.length * 1.5, 'long-form lyrics must be materially longer than short-form lyrics');

const duet = buildProfessionalLyricsFallback({
  language: 'it', languageName: 'Italiano', genreFamily: 'R&B / Soul / Funk', genre: 'R&B', subgenre: 'Contemporary R&B', mood: 'Romantic', vocalMode: 'duet', variant: 77, durationSec: 240, bpm: 92
});
assert.match(duet, /- Male\]/);
assert.match(duet, /- Female\]/);
assert.match(duet, /- Male \+ Female\]/);

console.log(`professional lyrics v2 passed: ${cases.length} genre structures, long-form scaling, duet routing and variation quality`);
