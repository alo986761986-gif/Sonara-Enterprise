import { getMusicStyleProfile } from './musicStyleIntelligence';

export type VocalMode = 'instrumental' | 'male' | 'female' | 'duet';

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
  vocalMode: VocalMode;
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

function vocalDirection(vocalMode: VocalMode, lyrics: string): string {
  if (vocalMode === 'instrumental') {
    return 'Strictly instrumental. No vocals, no spoken words, no chants, no whispers and no vocal samples.';
  }

  const singerDirection = vocalMode === 'male'
    ? 'Use one clearly male lead vocalist with a natural, expressive and genre-appropriate register. Do not use a female lead or duet.'
    : vocalMode === 'female'
      ? 'Use one clearly female lead vocalist with a natural, expressive and genre-appropriate register. Do not use a male lead or duet.'
      : 'Use two clearly distinct lead vocalists: one male and one female. Alternate solo lines or sections naturally, then use intentional two-part harmony in refrains or climactic moments. Do not render both roles as the same doubled voice.';

  if (!lyrics) {
    return `${singerDirection} Lyrics are required for this vocal mode before generation can start.`;
  }

  return `${singerDirection}\nUse the following lyrics exactly as written. Do not translate, replace, reorder or invent words:\n${lyrics}`;
}

const PROFESSIONAL_VARIANTS = [
  'Creative emphasis: make the defining groove immediately recognizable from the opening bars.',
  'Creative emphasis: foreground the authentic instrumental palette and performance character.',
  'Creative emphasis: develop harmony, melody and arrangement with strong musical storytelling.',
  'Creative emphasis: deliver maximum performance realism, sonic detail and release-ready impact.'
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
  const lyrics = String(input.lyrics ?? '').trim();
  const vocalMode = input.vocalMode;
  const profile = getMusicStyleProfile(family, genre, subgenre);
  const variantIndex = Math.abs(clampInteger(input.variant, 0, 0, Number.MAX_SAFE_INTEGER)) % PROFESSIONAL_VARIANTS.length;

  return [
    `Create a professional ${subgenre} production titled “${title}” in the ${family} family, under the ${genre} genre.`,
    `The emotional direction must feel ${mood.toLowerCase()}.`,
    sentence(profile.identity),
    `Instrumentation: ${sentence(profile.instrumentation)}`,
    `Rhythm and groove: ${sentence(profile.rhythm)}`,
    `Harmony and melody: ${sentence(profile.harmony)}`,
    `Arrangement: ${sentence(profile.arrangement)}`,
    `Production: ${sentence(profile.production)}`,
    PROFESSIONAL_VARIANTS[variantIndex],
    `Lock the result to exactly ${bpm} BPM, ${key}, and approximately ${durationSec} seconds with a complete musical-bar ending.`,
    vocalMode === 'instrumental'
      ? 'Keep it strictly instrumental: no sung, spoken, whispered or sampled words.'
      : vocalMode === 'male'
        ? 'Use one expressive male lead vocalist and preserve the supplied lyrics exactly.'
        : vocalMode === 'female'
          ? 'Use one expressive female lead vocalist and preserve the supplied lyrics exactly.'
          : 'Use a genuine male-and-female duet with distinct voices, natural alternation and intentional harmony; preserve the supplied lyrics exactly.',
    vocalMode !== 'instrumental' && !lyrics ? 'Lyrics must be supplied before vocal generation can start.' : '',
    sentence(profile.avoid),
    'Deliver a release-ready, dynamically controlled mix with clear separation, no clipping and no artificial silence padding.'
  ].filter(Boolean).join(' ');
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
  const vocalMode = input.vocalMode;
  const vocalInstruction = vocalDirection(vocalMode, lyrics);
  const vocalNegative = vocalMode === 'instrumental'
    ? 'No unwanted vocals.'
    : vocalMode === 'male'
      ? 'No female lead, no duet and no voice-gender ambiguity.'
      : vocalMode === 'female'
        ? 'No male lead, no duet and no voice-gender ambiguity.'
        : 'Do not collapse the duet into one singer, two identical timbres or a permanently unison performance.';

  return [
    `USER INTENT:\n${userIntent}`,
    `AUTHORITATIVE MUSICAL IDENTITY:\nTitle: ${title}\nFamily: ${genreFamily}\nGenre: ${genre}\nSubgenre: ${subgenre}\nAtmosphere: ${mood}\nPriority rule: the selected subgenre ${subgenre} overrides generic family or genre conventions whenever they conflict.`,
    `SUBGENRE STYLE DNA:\n${profile.identity}`,
    `TECHNICAL PARAMETERS:\nTempo: exactly ${bpm} BPM\nKey: exactly ${key}\nDuration: approximately ${durationSec} seconds, ending on a complete musical bar\nTime signature: use the meter authentic to ${subgenre}; otherwise use 4/4\nDo not change tempo or key unless a very brief expressive deviation is essential to authentic ${subgenre}.`,
    `INSTRUMENTATION:\nUse ${profile.instrumentation}. Every instrument must have a role that belongs to ${subgenre}.`,
    `RHYTHM AND GROOVE:\nBuild ${profile.rhythm}. The rhythmic feel must identify ${subgenre} even before melody or vocals enter.`,
    `HARMONY, MELODY AND PERFORMANCE:\nUse ${profile.harmony}. Preserve idiomatic articulation, phrasing, improvisation and ensemble interaction.`,
    `ARRANGEMENT:\nCreate ${profile.arrangement}. Scale every section to ${durationSec} seconds and never cut or fade the ending prematurely.`,
    `VOCALS AND TEXT:\nMode: ${vocalMode}\n${vocalInstruction}`,
    `PRODUCTION:\nUse ${profile.production}. Maintain clear separation, clean transients, controlled low end, stable stereo imaging, musical dynamics, no clipping and a professional release-ready master.`,
    `NEGATIVE CONSTRAINTS:\n${profile.avoid} No genre drift. No unrelated instruments. No generic replacement groove. No incorrect key or BPM. ${vocalNegative} No invented lyrics. No unfinished ending. No excessive distortion unless intrinsic to ${subgenre}. No muddy low end. No fake silence added to reach the requested duration.`
  ].join('\n\n');
}
