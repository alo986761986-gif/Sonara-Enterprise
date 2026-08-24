import { getMusicStyleProfile } from './musicStyleIntelligence';

export interface GenerationPromptInput {
  rawPrompt?: string;
  prompt?: string;
  genreFamily: string;
  genre: string;
  subgenre: string;
  mood: string;
  bpm: number;
  key: string;
  durationSec: number;
  lyrics?: string;
  title?: string;
}

export interface RandomCreativeBriefInput extends GenerationPromptInput {
  variant?: number;
}

function cleanText(value: unknown, fallback = '', maxLength = 800): string {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, maxLength);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(min, Math.min(max, number))) : fallback;
}

function sentence(value: string): string {
  const trimmed = value.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

const PROFESSIONAL_VARIANTS = [
  (profile: ReturnType<typeof getMusicStyleProfile>) => `Lead with the defining groove: ${profile.rhythm}`,
  (profile: ReturnType<typeof getMusicStyleProfile>) => `Lead with the authentic sound palette: ${profile.instrumentation}`,
  (profile: ReturnType<typeof getMusicStyleProfile>) => `Lead with musical development: ${profile.harmony} Build ${profile.arrangement}`,
  (profile: ReturnType<typeof getMusicStyleProfile>) => `Lead with a premium performance and mix: ${profile.production}`
];

export function buildRandomCreativeBrief(input: RandomCreativeBriefInput): string {
  const family = cleanText(input.genreFamily, 'Music', 120);
  const genre = cleanText(input.genre, 'Music', 120);
  const subgenre = cleanText(input.subgenre, genre, 120);
  const mood = cleanText(input.mood, 'Authentic', 80);
  const key = cleanText(input.key, 'A Minor', 40);
  const title = cleanText(input.title, `Sonara ${subgenre} Track`, 160);
  const bpm = clampInteger(input.bpm, 124, 40, 220);
  const durationSec = clampInteger(input.durationSec, 30, 30, 240);
  const hasLyrics = Boolean(String(input.lyrics ?? '').trim());
  const profile = getMusicStyleProfile(family, genre, subgenre);
  const variantIndex = Math.abs(clampInteger(input.variant, 0, 0, Number.MAX_SAFE_INTEGER)) % PROFESSIONAL_VARIANTS.length;

  return [
    `Create a professional ${subgenre} production titled “${title}” in the ${family} family, under the ${genre} genre.`,
    `The emotional direction must feel ${mood.toLowerCase()}.`,
    sentence(profile.identity),
    sentence(PROFESSIONAL_VARIANTS[variantIndex](profile)),
    `Lock the result to exactly ${bpm} BPM, ${key}, and approximately ${durationSec} seconds with a complete musical-bar ending.`,
    hasLyrics
      ? 'Use the supplied lyrics exactly as written and shape the arrangement around natural vocal phrasing.'
      : 'Keep it strictly instrumental: no sung, spoken, whispered or sampled words.',
    sentence(profile.avoid),
    'Deliver a release-ready, dynamically controlled mix with clear separation, no clipping and no artificial silence padding.'
  ].join(' ');
}

export function buildGenerationPrompt(input: GenerationPromptInput): string {
  const genreFamily = cleanText(input.genreFamily, 'Music', 120);
  const genre = cleanText(input.genre, 'Music', 120);
  const subgenre = cleanText(input.subgenre, genre, 120);
  const mood = cleanText(input.mood, 'Authentic', 80);
  const key = cleanText(input.key, 'A Minor', 40);
  const title = cleanText(input.title, `Sonara ${subgenre} Track`, 160);
  const bpm = clampInteger(input.bpm, 124, 40, 220);
  const durationSec = clampInteger(input.durationSec, 30, 30, 240);
  const profile = getMusicStyleProfile(genreFamily, genre, subgenre);
  const fallbackBrief = buildRandomCreativeBrief({
    ...input,
    genreFamily,
    genre,
    subgenre,
    mood,
    bpm,
    key,
    durationSec,
    title,
    variant: 0
  });
  const userIntent = cleanText(input.rawPrompt ?? input.prompt, fallbackBrief, 1600);
  const lyrics = String(input.lyrics ?? '').trim().slice(0, 4096);
  const vocalInstruction = lyrics
    ? `Use the following lyrics exactly as written. Do not translate, replace, reorder or invent words:\n${lyrics}`
    : 'Strictly instrumental. No vocals, no spoken words, no chants, no whispers and no vocal samples.';

  return [
    `USER INTENT:\n${userIntent}`,
    `AUTHORITATIVE MUSICAL IDENTITY:\nTitle: ${title}\nFamily: ${genreFamily}\nGenre: ${genre}\nSubgenre: ${subgenre}\nAtmosphere: ${mood}\nPriority rule: the selected subgenre ${subgenre} overrides generic family or genre conventions whenever they conflict.`,
    `SUBGENRE STYLE DNA:\n${profile.identity}`,
    `TECHNICAL PARAMETERS:\nTempo: exactly ${bpm} BPM\nKey: exactly ${key}\nDuration: approximately ${durationSec} seconds, ending on a complete musical bar\nTime signature: use the meter authentic to ${subgenre}; otherwise use 4/4\nDo not change tempo or key unless a very brief expressive deviation is essential to authentic ${subgenre}.`,
    `INSTRUMENTATION:\nUse ${profile.instrumentation}. Every instrument must have a role that belongs to ${subgenre}.`,
    `RHYTHM AND GROOVE:\nBuild ${profile.rhythm}. The rhythmic feel must identify ${subgenre} even before melody or vocals enter.`,
    `HARMONY, MELODY AND PERFORMANCE:\nUse ${profile.harmony}. Preserve idiomatic articulation, phrasing, improvisation and ensemble interaction.`,
    `ARRANGEMENT:\nCreate ${profile.arrangement}. Scale every section to ${durationSec} seconds and never cut or fade the ending prematurely.`,
    `VOCALS AND TEXT:\n${vocalInstruction}`,
    `PRODUCTION:\nUse ${profile.production}. Maintain clear separation, clean transients, controlled low end, stable stereo imaging, musical dynamics, no clipping and a professional release-ready master.`,
    `NEGATIVE CONSTRAINTS:\n${profile.avoid} No genre drift. No unrelated instruments. No generic replacement groove. No incorrect key or BPM. No unwanted vocals. No invented lyrics. No unfinished ending. No excessive distortion unless intrinsic to ${subgenre}. No muddy low end. No fake silence added to reach the requested duration.`
  ].join('\n\n');
}
