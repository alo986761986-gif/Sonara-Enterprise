import assert from 'node:assert/strict';

import { analyzeCreatorBrief, buildGenerationPrompt } from './generationPrompt.ts';

const creatorInput = {
  rawPrompt: [
    'Voglio una batteria acustica suonata davvero, basso fretless e chitarra pulita.',
    'Intro intima, poi crescendo progressivo e finale esplosivo ma musicale.',
    'Senza synth e senza cori.'
  ].join('\n'),
  genreFamily: 'Rock',
  genre: 'Alternative Rock',
  subgenre: 'Post-Rock',
  mood: 'Emotional',
  bpm: 96,
  key: 'D Minor',
  durationSec: 120,
  vocalMode: 'instrumental' as const,
  lyrics: '',
  title: 'Real Performance'
};

const creatorPrompt = buildGenerationPrompt(creatorInput);
const creatorAnalysis = analyzeCreatorBrief(creatorInput.rawPrompt);

assert.ok(creatorPrompt.includes(creatorInput.rawPrompt), 'the creator brief must remain verbatim and multiline');
assert.match(creatorPrompt, /primary artistic source of truth/i);
assert.match(creatorPrompt, /specific creator instruction with a generic genre default/i);
assert.match(creatorPrompt, /Italian or any other non-English wording is semantically binding/i);
assert.match(creatorPrompt, /Creator-specified instruments are mandatory/i);
assert.match(creatorPrompt, /deliberately composed and performed record/i);
assert.match(creatorPrompt, /not an AI demo, preset audition, stock loop collage/i);
assert.match(creatorPrompt, /realistic attack, decay, resonance, room response/i);
assert.match(creatorPrompt, /Senza synth/i);
assert.match(creatorPrompt, /senza cori/i);
assert.match(creatorPrompt, /exactly 96 BPM/);
assert.match(creatorPrompt, /exactly D Minor/);
assert.match(creatorPrompt, /approximately 120 seconds/);
assert.match(creatorPrompt, /Strictly instrumental/);
assert.ok(creatorPrompt.length <= 11800, `creator prompt exceeded engine budget: ${creatorPrompt.length}`);
assert.equal(creatorAnalysis.detailed, true);
assert.deepEqual(
  creatorAnalysis.exclusions.map(value => value.toLocaleLowerCase('en-US')),
  ['senza synth', 'senza cori.'],
  'multiple creator exclusions in one sentence must remain independently enforceable'
);

const longCreatorPrompt = buildGenerationPrompt({
  ...creatorInput,
  rawPrompt: 'Chitarra reale, batteria umana, basso profondo, dinamica naturale e variazioni di frase. '.repeat(300)
});
assert.ok(longCreatorPrompt.length <= 11800, `long creator prompt exceeded engine budget: ${longCreatorPrompt.length}`);
assert.match(longCreatorPrompt, /FINAL RULE|NEGATIVE CONSTRAINTS/);

const exactLyrics = 'Core mio, resta ccà\nNun me lassà stanotte';
const vocalPrompt = buildGenerationPrompt({
  ...creatorInput,
  rawPrompt: 'Voce femminile intima, piano reale e archi naturali. Senza synth aggressivi.',
  vocalMode: 'female',
  lyrics: exactLyrics,
  title: 'Resta Ccà'
});
assert.ok(vocalPrompt.includes(exactLyrics), 'lyrics must remain byte-for-byte unchanged');
assert.match(vocalPrompt, /female lead vocalist/i);
assert.match(vocalPrompt, /piano reale/i);
assert.match(vocalPrompt, /archi naturali/i);
assert.match(vocalPrompt, /Senza synth aggressivi/i);
assert.ok(vocalPrompt.length <= 11800, `vocal prompt exceeded engine budget: ${vocalPrompt.length}`);

console.log(`generationPrompt creator-intent contract passed at ${creatorPrompt.length} characters`);
