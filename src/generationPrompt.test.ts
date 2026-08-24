import assert from 'node:assert/strict';
import { buildGenerationPrompt, buildRandomCreativeBrief } from './generationPrompt.ts';

const techHouse = {
  rawPrompt: 'A dark, driving warehouse track with restrained melodic material.',
  genreFamily: 'Electronic / Dance',
  genre: 'House',
  subgenre: 'Tech House',
  mood: 'Dark',
  bpm: 126,
  key: 'A Minor',
  durationSec: 120,
  lyrics: '',
  title: 'Warehouse Pulse'
};

const first = buildGenerationPrompt(techHouse);
const second = buildGenerationPrompt({ ...techHouse });
assert.equal(first, second, 'the same state must always create the same prompt');
assert.match(first, /Family: Electronic \/ Dance/);
assert.match(first, /Genre: House/);
assert.match(first, /Subgenre: Tech House/);
assert.match(first, /exactly 126 BPM/);
assert.match(first, /exactly A Minor/);
assert.match(first, /approximately 120 seconds/);
assert.match(first, /Strictly instrumental/);
assert.match(first, /four-on-the-floor/);

const lyrics = 'Core mio, torna a cantà\nSotto a sta luna chiara';
const neapolitan = buildGenerationPrompt({
  rawPrompt: 'Traditional, intimate and emotionally direct.',
  genreFamily: 'Folk / Traditional Europe',
  genre: 'Italian Traditional',
  subgenre: 'Neapolitan Song',
  mood: 'Emotional',
  bpm: 90,
  key: 'D Minor',
  durationSec: 180,
  lyrics,
  title: 'Luna Chiara'
});
assert.match(neapolitan, /mandolin/);
assert.match(neapolitan, /exactly 90 BPM/);
assert.ok(neapolitan.includes(lyrics), 'lyrics must remain unchanged');
assert.ok(!neapolitan.includes('Strictly instrumental'));

const bossa = buildGenerationPrompt({ ...techHouse, genreFamily: 'Latin America', genre: 'Brazilian Music', subgenre: 'Bossa Nova' });
assert.notEqual(first, bossa, 'changing subgenre must materially change the prompt');
assert.match(bossa, /nylon-string guitar/);

const brief = buildRandomCreativeBrief({ genreFamily: techHouse.genreFamily, genre: techHouse.genre, subgenre: techHouse.subgenre, mood: techHouse.mood });
assert.match(brief, /Tech House/);
assert.match(brief, /tight electronic drums/);

console.log('generationPrompt: 4 deterministic regression checks passed');
