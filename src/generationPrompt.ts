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

interface StyleProfile {
  instrumentation: string;
  rhythm: string;
  harmony: string;
  arrangement: string;
}

const STYLE_PROFILES: Record<string, StyleProfile> = {
  'tech house': {
    instrumentation: 'tight electronic drums, a short punchy kick, an elastic mono bassline, syncopated percussion, restrained synth stabs and functional club effects',
    rhythm: 'a locked four-on-the-floor groove with disciplined kick-and-bass interaction, shuffled hats, concise fills and controlled forward motion',
    harmony: 'minimal, repetitive harmonic material with small timbral changes that support the groove instead of competing with it',
    arrangement: 'a DJ-friendly intro, gradual groove build, main drop, tension-building breakdown, stronger return and a clean mixable outro'
  },
  'deep house': {
    instrumentation: 'rounded deep bass, warm electric-piano or organ chords, soft but defined house drums, subtle pads, restrained melodic motifs and spacious effects',
    rhythm: 'a steady four-on-the-floor pulse with a warm pocket, lightly syncopated percussion and smooth bass movement',
    harmony: 'soulful extended chords, gentle voice leading and an understated melodic language that remains intimate and hypnotic',
    arrangement: 'a spacious intro, gradual layering, an emotionally focused main section, a restrained breakdown, a warm final lift and a clean outro'
  },
  'boom bap': {
    instrumentation: 'hard kick and snare, dusty chopped drums, a grounded bassline, coherent sample-like musical phrases and sparse supporting textures',
    rhythm: 'a convincing head-nod pocket with human swing, authoritative backbeat, controlled ghost notes and deliberate rhythmic space',
    harmony: 'compact tonal material with a memorable loop identity and tasteful variation that leaves room for the lead or vocal',
    arrangement: 'a short scene-setting intro, clear verse sections, contrasting hooks, purposeful breaks and a decisive ending'
  },
  'bossa nova': {
    instrumentation: 'nylon-string guitar, soft acoustic bass, brushed or understated percussion, light piano and optional restrained woodwind or string color',
    rhythm: 'an authentic bossa nova guitar and percussion pattern with relaxed syncopation, human timing and elegant dynamic control',
    harmony: 'rich jazz-influenced chords, smooth voice leading, lyrical melodic phrasing and gentle harmonic movement',
    arrangement: 'an intimate introduction, clear melodic statement, subtle instrumental development, tasteful contrast and a natural acoustic ending'
  },
  'neapolitan song': {
    instrumentation: 'expressive lead melody supported by mandolin, classical guitar, piano, lyrical strings and restrained traditional acoustic colors',
    rhythm: 'human, song-led phrasing with flexible accents, natural rubato where appropriate and a pulse that supports the vocal or melody',
    harmony: 'romantic tonal harmony, memorable cantabile melody, expressive cadences and authentic Neapolitan emotional language',
    arrangement: 'an intimate opening, narrative verse development, an emotionally stronger refrain, a controlled climax and a resolved acoustic conclusion'
  }
};

const FAMILY_PROFILES: Array<[RegExp, StyleProfile]> = [
  [/metal|rock/i, {
    instrumentation: 'believable live drums, genre-correct electric guitars, bass and performance-driven supporting layers',
    rhythm: 'powerful human drum-and-bass interaction with authentic accents, fills and section-to-section intensity',
    harmony: 'genre-correct riffs, chord movement and melodic language with natural performance dynamics',
    arrangement: 'a focused introduction, developed main sections, a contrasting bridge or breakdown, a strong climax and a performed ending'
  }],
  [/jazz/i, {
    instrumentation: 'believable acoustic ensemble instruments with natural tone, separation and player interaction',
    rhythm: 'human timing, authentic swing or genre-appropriate pulse, expressive accents and conversational interplay',
    harmony: 'sophisticated genre-correct harmony, melodic development and credible improvisational language',
    arrangement: 'a clear statement, developed ensemble conversation, contrasting solo or development space and a resolved ending'
  }],
  [/folk|traditional|country|americana/i, {
    instrumentation: 'regionally appropriate acoustic instruments, natural ensemble balance and believable human performance detail',
    rhythm: 'an organic pulse with genre-correct accents, phrasing and instrumental interaction',
    harmony: 'authentic tonal language, memorable melody and culturally coherent accompaniment',
    arrangement: 'a song-led introduction, clear narrative development, a memorable central section and a complete acoustic ending'
  }],
  [/electronic|dance/i, {
    instrumentation: 'genre-correct electronic drums, bass, synth or sampled textures and purposeful spatial effects',
    rhythm: 'a precise dance-floor groove with disciplined low-end interaction, detailed percussion and controlled movement',
    harmony: 'a focused electronic harmonic and melodic vocabulary that reinforces the selected subgenre',
    arrangement: 'a functional intro, progressive build, main section, breakdown, controlled climax and clean outro'
  }],
  [/hip-hop|rap/i, {
    instrumentation: 'authoritative drums, a convincing bass foundation, coherent sample-like or played musical material and deliberate space',
    rhythm: 'a genre-correct pocket with humanized timing, clear accents and controlled rhythmic variation',
    harmony: 'focused tonal material and memorable motifs that support the lead without stylistic drift',
    arrangement: 'a concise intro, clear verse and hook contrast, purposeful breaks and a decisive ending'
  }],
  [/latin|caribbean|africa/i, {
    instrumentation: 'culturally coherent percussion, bass and melodic instruments appropriate to the selected regional style',
    rhythm: 'authentic interlocking rhythmic language, danceable movement and natural human accents',
    harmony: 'regionally coherent melody and harmony with expressive call-and-response where appropriate',
    arrangement: 'a clear introduction, layered rhythmic development, memorable main section, dynamic contrast and a resolved ending'
  }]
];

const DEFAULT_PROFILE: StyleProfile = {
  instrumentation: 'instruments, timbres and performance techniques that are specifically authentic to the selected subgenre',
  rhythm: 'a genre-correct rhythmic foundation with believable accents, variation and human musical movement',
  harmony: 'harmonic and melodic language characteristic of the selected subgenre rather than generic substitutes',
  arrangement: 'a focused introduction, progressive development, clear main section, contrasting breakdown or bridge, climax and complete outro'
};

function cleanText(value: unknown, fallback = '', maxLength = 800): string {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return (text || fallback).slice(0, maxLength);
}

function clampInteger(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(min, Math.min(max, number))) : fallback;
}

function styleProfileFor(genreFamily: string, genre: string, subgenre: string): StyleProfile {
  const exact = STYLE_PROFILES[subgenre.toLowerCase()];
  if (exact) return exact;
  const searchable = `${genreFamily} ${genre} ${subgenre}`;
  return FAMILY_PROFILES.find(([pattern]) => pattern.test(searchable))?.[1] || DEFAULT_PROFILE;
}

export function buildRandomCreativeBrief(input: Pick<GenerationPromptInput, 'genreFamily' | 'genre' | 'subgenre' | 'mood'>): string {
  const family = cleanText(input.genreFamily, 'Music', 120);
  const genre = cleanText(input.genre, 'Music', 120);
  const subgenre = cleanText(input.subgenre, genre, 120);
  const mood = cleanText(input.mood, 'Authentic', 80);
  const profile = styleProfileFor(family, genre, subgenre);
  return `Create an authentic ${subgenre} track within ${genre} and the ${family} family, with a ${mood.toLowerCase()} emotional direction. Use ${profile.instrumentation}.`;
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
  const userIntent = cleanText(input.rawPrompt ?? input.prompt, buildRandomCreativeBrief({ genreFamily, genre, subgenre, mood }), 1000);
  const lyrics = String(input.lyrics ?? '').trim().slice(0, 4096);
  const profile = styleProfileFor(genreFamily, genre, subgenre);
  const vocalInstruction = lyrics
    ? `Use the following lyrics exactly as written. Do not translate, replace or invent words:\n${lyrics}`
    : 'Strictly instrumental. No vocals, no spoken words, no chants and no vocal samples.';

  return [
    `USER INTENT:\n${userIntent}`,
    `MUSICAL IDENTITY:\nTitle: ${title}\nFamily: ${genreFamily}\nGenre: ${genre}\nSubgenre: ${subgenre}\nMood: ${mood}`,
    `TECHNICAL PARAMETERS:\nTempo: exactly ${bpm} BPM\nKey: exactly ${key}\nDuration: approximately ${durationSec} seconds, ending on a complete musical bar\nTime signature: use the signature authentic to ${subgenre}; otherwise use 4/4`,
    `INSTRUMENTATION AND RHYTHM:\nUse ${profile.instrumentation}. Build ${profile.rhythm}.`,
    `HARMONY AND MELODY:\nUse ${profile.harmony}. Keep every musical decision unmistakably ${subgenre} within ${genre}.`,
    `ARRANGEMENT:\nCreate ${profile.arrangement}. Scale every section to the requested duration and never cut the ending abruptly.`,
    `VOCALS:\n${vocalInstruction}`,
    'PRODUCTION:\nCreate a professional mix with clear instrument separation, clean transients, controlled low end, stable stereo imaging, musical dynamics, no clipping and a release-ready master.',
    `NEGATIVE CONSTRAINTS:\nNo genre drift. No unrelated instruments. No unrequested tempo changes. No incorrect key. No unwanted vocals. No random lyrics. No unfinished ending. No excessive distortion. No muddy low end. No fake silence added to reach the requested duration. Do not replace ${subgenre} with generic pop, electronic or cinematic music.`
  ].join('\n\n');
}
