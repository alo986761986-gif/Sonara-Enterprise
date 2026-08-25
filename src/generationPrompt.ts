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
  weirdness?: number;
  styleInfluence?: number;
  vocalMode: VocalMode;
  lyrics?: string;
  title?: string;
}

export interface RandomCreativeBriefInput extends GenerationPromptInput {
  variant?: number;
}

export interface CreatorBriefAnalysis {
  normalized: string;
  exclusions: string[];
  detailed: boolean;
  detailScore: number;
}

const FINAL_PROMPT_MAX_CHARS = 11800;
const MAX_USER_INTENT_WITHOUT_LYRICS = 4600;
const MIN_USER_INTENT_BUDGET = 1600;
const MAX_EXPLICIT_EXCLUSIONS = 8;

function cleanText(value: unknown, fallback = '', maxLength = 800): string {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, maxLength);
}

function cleanMultilineText(value: unknown, fallback = '', maxLength = 4600): string {
  const source = String(value ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ');
  const lines = source
    .split('\n')
    .map(line => line.replace(/[\t ]+/g, ' ').trim())
    .filter(Boolean);
  const normalized = lines.join('\n').trim();
  return (normalized || fallback).slice(0, maxLength);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(min, Math.min(max, number))) : fallback;
}

function creativeControlDirection(weirdness: number, styleInfluence: number, subgenre: string): string {
  const weirdnessDirection = weirdness <= 25
    ? 'Favor familiar, stable and conventionally musical choices with minimal surprise.'
    : weirdness <= 60
      ? 'Balance coherent songwriting with noticeable original details and controlled surprises.'
      : weirdness <= 85
        ? 'Use adventurous structure, timbre, transitions and melodic decisions while remaining musically intentional.'
        : 'Push into highly unconventional but still deliberate musical ideas; avoid random noise, incoherence or technical failure.';
  const styleDirection = styleInfluence <= 25
    ? `Treat ${subgenre} as a loose stylistic reference while preserving the exact technical locks and creator instructions.`
    : styleInfluence <= 60
      ? `Keep a balanced ${subgenre} identity while allowing cross-style interpretation where it supports the creator brief.`
      : styleInfluence <= 85
        ? `Follow ${subgenre} conventions strongly in groove, instrumentation, harmony, arrangement and production.`
        : `Apply maximum ${subgenre} fidelity: every major musical and production decision must reinforce the selected style.`;

  return `Weirdness: ${weirdness}/100. ${weirdnessDirection}\nStyle Influence: ${styleInfluence}/100. ${styleDirection}`;
}

function sentence(value: string): string {
  const trimmed = value.trim();
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function compactProfileText(value: string, maxLength = 720): string {
  return cleanText(value, '', maxLength);
}

function splitCreatorClauses(value: string): string[] {
  return value
    .split(/\n+|(?<=[.!?;])\s+/)
    .map(item => item.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter(item => item.length >= 3);
}

function expandNegativeClause(value: string): string[] {
  return value
    .split(/\s+(?:e|ed|and|&)\s+(?=(?:senza|no|non\s+(?:usare|voglio|inserire|mettere|aggiungere)|without|avoid|do\s+not\s+use|don't\s+use|exclude)\b)/i)
    .map(item => item.trim())
    .filter(Boolean);
}

const NEGATIVE_CUE = /(?:^|\b)(?:no|senza|evita(?:re)?|non\s+(?:usare|voglio|inserire|mettere|aggiungere)|escludi(?:re)?|without|avoid|do\s+not\s+use|don't\s+use|exclude)\b/i;
const STRUCTURE_CUE = /\b(?:intro|introduzione|verse|strofa|chorus|ritornello|pre[- ]?chorus|drop|bridge|ponte|breakdown|break|solo|outro|finale|build|crescendo|climax|refrain)\b/i;
const INSTRUMENT_CUE = /\b(?:drums?|batteria|kick|snare|rullante|bass|basso|808|guitar|chitarra|piano|keys?|tastiere|synth|sintetizzatore|strings?|archi|violin|violino|cello|violoncello|brass|fiati|trumpet|tromba|sax|flute|flauto|percussion|percussioni|choir|coro|voice|voce|vocal|vocali|mandolin|mandolino|organ|organo|rhodes)\b/i;
const PRODUCTION_CUE = /\b(?:analog|analogico|live|dal vivo|acoustic|acustic[ao]|organic|organico|human|umano|real|reale|natural|naturale|vintage|modern|moderno|lo[- ]?fi|hi[- ]?fi|cinematic|cinematografico|wide|stereo|mono|dry|riverbero|reverb|delay|distortion|distorsione|saturated|saturo)\b/i;

export function analyzeCreatorBrief(value: unknown, fallback = ''): CreatorBriefAnalysis {
  const normalized = cleanMultilineText(value, fallback, MAX_USER_INTENT_WITHOUT_LYRICS);
  const clauses = splitCreatorClauses(normalized);
  const exclusions = clauses
    .filter(clause => NEGATIVE_CUE.test(clause))
    .flatMap(expandNegativeClause)
    .filter(clause => NEGATIVE_CUE.test(clause))
    .filter((clause, index, all) => all.findIndex(item => item.toLocaleLowerCase('en-US') === clause.toLocaleLowerCase('en-US')) === index)
    .slice(0, MAX_EXPLICIT_EXCLUSIONS);
  const signalCount = [STRUCTURE_CUE, INSTRUMENT_CUE, PRODUCTION_CUE, NEGATIVE_CUE]
    .reduce((count, pattern) => count + (pattern.test(normalized) ? 1 : 0), 0);
  const detailScore = Math.min(100, Math.round(normalized.length / 14) + Math.min(24, clauses.length * 3) + signalCount * 10);
  return {
    normalized,
    exclusions,
    detailed: normalized.length >= 90 || clauses.length >= 3 || signalCount >= 2,
    detailScore
  };
}

function userIntentBudget(lyricsLength: number): number {
  return Math.max(
    MIN_USER_INTENT_BUDGET,
    MAX_USER_INTENT_WITHOUT_LYRICS - Math.min(3000, Math.max(0, lyricsLength))
  );
}

function arrangementBlueprint(durationSec: number): string {
  if (durationSec <= 45) {
    return 'Establish the identity in the first one or two bars, develop one main musical statement, introduce one meaningful contrast and finish with a composed cadence rather than a fade or abrupt cut.';
  }
  if (durationSec <= 90) {
    return 'Use a concise but complete form: immediate identity, developed A section, variation or lift, contrasting passage, return or climax and a resolved final cadence.';
  }
  if (durationSec <= 150) {
    return 'Use a full short-form arrangement: purposeful intro, exposition, development, contrasting section, main return or climax and a performed ending, with audible evolution at every phrase boundary.';
  }
  return 'Use a complete long-form arrangement: authored intro, thematic exposition, progressive development, contrast or breakdown, controlled rebuild, final climax, release and fully resolved ending. Do not repeat an unchanged loop to fill time.';
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
  const durationSec = clampInteger(input.durationSec, 30, 30, 480);
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
    'Perform the music rather than repeating a static loop. Use believable articulation, human musical phrasing, evolving sections, release-ready separation, no clipping and no artificial silence padding.'
  ].filter(Boolean).join(' ');
}

function finalPromptWithinBudget(sections: string[], userIntent: string): string {
  let currentIntent = userIntent;
  let prompt = sections.join('\n\n');
  if (prompt.length <= FINAL_PROMPT_MAX_CHARS) return prompt;

  const overflow = prompt.length - FINAL_PROMPT_MAX_CHARS;
  currentIntent = currentIntent.slice(0, Math.max(900, currentIntent.length - overflow - 120)).trim();
  const adjusted = sections.map(section => section.startsWith('CREATOR BRIEF — VERBATIM:')
    ? `CREATOR BRIEF — VERBATIM:\n<<<\n${currentIntent}\n>>>`
    : section);
  prompt = adjusted.join('\n\n');
  return prompt.length <= FINAL_PROMPT_MAX_CHARS
    ? prompt
    : prompt.slice(0, FINAL_PROMPT_MAX_CHARS - 120).trimEnd() + '\n\nFINAL RULE: preserve the creator brief, exact technical locks and complete musical ending.';
}

export function buildGenerationPrompt(input: GenerationPromptInput): string {
  const genreFamily = cleanText(input.genreFamily, 'Music', 120);
  const genre = cleanText(input.genre, 'Music', 120);
  const subgenre = cleanText(input.subgenre, genre, 120);
  const mood = cleanText(input.mood, 'Authentic', 80);
  const key = cleanText(input.key, 'A Minor', 40);
  const title = cleanText(input.title, `Sonara ${subgenre} Track`, 160);
  const bpm = clampInteger(input.bpm, 124, 40, 220);
  const durationSec = clampInteger(input.durationSec, 30, 30, 480);
  const weirdness = clampInteger(input.weirdness, 50, 0, 100);
  const styleInfluence = clampInteger(input.styleInfluence, 50, 0, 100);
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
  const lyrics = String(input.lyrics ?? '').trim().slice(0, 4096);
  const intentBudget = userIntentBudget(lyrics.length);
  const creatorAnalysis = analyzeCreatorBrief(input.rawPrompt ?? input.prompt, fallbackBrief);
  const userIntent = cleanMultilineText(creatorAnalysis.normalized, fallbackBrief, intentBudget);
  const vocalMode = input.vocalMode;
  const vocalInstruction = vocalDirection(vocalMode, lyrics);
  const vocalNegative = vocalMode === 'instrumental'
    ? 'No unwanted vocals.'
    : vocalMode === 'male'
      ? 'No female lead, no duet and no voice-gender ambiguity.'
      : vocalMode === 'female'
        ? 'No male lead, no duet and no voice-gender ambiguity.'
        : 'Do not collapse the duet into one singer, two identical timbres or a permanently unison performance.';
  const explicitExclusions = creatorAnalysis.exclusions.length
    ? creatorAnalysis.exclusions.map(value => `- ${value}`).join('\n')
    : '- No additional exclusions were stated by the creator.';

  const sections = [
    `EXECUTION PRIORITY — NON-NEGOTIABLE:\n1. The creator brief is the primary artistic source of truth for instruments, sections, energy, texture, era, performance behavior, transitions and exclusions.\n2. The interface controls remain exact locks for Family, Genre, Subgenre, Atmosphere, BPM, key, duration and vocal mode.\n3. Curated style DNA may fill only details the creator did not specify. It must never replace a specific creator instruction with a generic genre default.\n4. Interpret the creator's language directly. Italian or any other non-English wording is semantically binding, not decorative.\n5. Produce an original composition and performance; do not imitate or reproduce any identifiable existing recording.`,
    `CREATOR BRIEF — VERBATIM:\n<<<\n${userIntent}\n>>>`,
    `CREATOR DIRECTIVE CONTRACT:\nPreserve every explicit instrument, sound source, musical action, section, dynamic change, emotional contrast, production treatment and exclusion stated above. Concrete creator details take precedence over generic defaults. Do not silently omit, weaken, rename or substitute them. Where the brief leaves a detail unspecified, complete it using authentic ${subgenre} practice.`,
    `EXPLICIT CREATOR EXCLUSIONS:\n${explicitExclusions}`,
    `AUTHORITATIVE MUSICAL IDENTITY:\nTitle: ${title}\nFamily: ${genreFamily}\nGenre: ${genre}\nSubgenre: ${subgenre}\nAtmosphere: ${mood}\nPriority rule: the selected subgenre ${subgenre} overrides generic family or genre conventions whenever they conflict, while the creator brief overrides generic style-fill details.`,
    `CREATIVE CONTROLS:\n${creativeControlDirection(weirdness, styleInfluence, subgenre)}`,
    `SUBGENRE STYLE DNA — FILL UNSPECIFIED DETAILS ONLY:\n${compactProfileText(profile.identity, 720)}`,
    `TECHNICAL PARAMETERS:\nTempo: exactly ${bpm} BPM\nKey: exactly ${key}\nDuration: approximately ${durationSec} seconds, ending on a complete musical bar\nTime signature: use the meter authentic to ${subgenre}; otherwise use 4/4\nDo not drift from tempo or key. Any expressive timing must occur inside the pulse, not by changing the requested BPM.`,
    `INSTRUMENTATION AND ORCHESTRATION:\nCreator-specified instruments are mandatory and must remain clearly audible in their requested roles. Use ${compactProfileText(profile.instrumentation, 680)} only to complete missing ensemble roles. Give each part a physically credible register, articulation, note length, velocity, breath, bowing, picking, striking, sustain or synthesis behavior appropriate to the real instrument or sound source.`,
    `RHYTHM AND GROOVE:\nBuild ${compactProfileText(profile.rhythm, 680)}. Preserve human microtiming and phrase-level variation without losing the exact ${bpm} BPM pulse. The groove must evolve through fills, accents, orchestration and interaction rather than copy-pasting one unchanged loop.`,
    `HARMONY, MELODY AND PERFORMANCE:\nUse ${compactProfileText(profile.harmony, 680)}. Develop memorable motifs with musical cause and effect. Perform phrases with credible articulation, dynamics, breathing space, tension, release, call-and-response and ensemble interaction. Avoid impossible instrumental ranges, mechanical note repetition and random decorative notes.`,
    `ARRANGEMENT AND MUSICAL NARRATIVE:\nCreator-specified sections and order are mandatory. Otherwise, create ${compactProfileText(profile.arrangement, 680)}. ${arrangementBlueprint(durationSec)} Make every transition musically prepared; use risers, impacts, fills or silence only when authentic to ${subgenre} and requested energy.`,
    `VOCALS AND TEXT:\nMode: ${vocalMode}\n${vocalInstruction}`,
    `REALISM AND RECORDING CONTRACT:\nThe result must sound like a deliberately composed and performed record, not an AI demo, preset audition, stock loop collage or unfinished sketch. Preserve realistic attack, decay, resonance, room response, amplifier or signal-chain behavior, player interaction and controlled imperfections. Acoustic sources must feel physically recorded; electronic sources must feel intentionally programmed and mixed, not randomly layered.`,
    `PRODUCTION, MIX AND MASTER:\nUse ${compactProfileText(profile.production, 680)}. Build a credible mix before mastering: clear frequency ownership, audible separation, controlled low end, clean transients, stable but natural stereo imaging, sensible depth, musical headroom and dynamics. Deliver a real WAV-ready master with no clipping, no crushed loudness, no phase collapse, no fake stereo widening and no artificial silence padding.`,
    `NEGATIVE CONSTRAINTS:\n${compactProfileText(profile.avoid, 720)} No genre drift. No unrelated instruments. No generic replacement groove. No omission of creator-specified details. No incorrect key or BPM. ${vocalNegative} No invented lyrics. No unfinished ending. No abrupt truncation. No excessive distortion unless intrinsic to ${subgenre} or explicitly requested. No muddy low end. No repeated unchanged block used merely to fill duration.`
  ];

  return finalPromptWithinBudget(sections, userIntent);
}
