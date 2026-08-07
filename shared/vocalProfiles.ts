export type VocalMode = 'instrumental' | 'auto' | 'female' | 'male' | 'duet';
export type VocalTimbre =
  | 'natural'
  | 'warm'
  | 'dark'
  | 'bright'
  | 'airy'
  | 'velvety'
  | 'smoky'
  | 'powerful'
  | 'crystalline'
  | 'raw';
export type VocalRegister = 'auto' | 'low' | 'mid' | 'high' | 'wide';
export type VocalDelivery =
  | 'adaptive'
  | 'intimate'
  | 'soulful'
  | 'powerful'
  | 'breathy'
  | 'clean'
  | 'raspy'
  | 'operatic'
  | 'spoken-rap';
export type VocalHarmony =
  | 'natural'
  | 'dry-lead'
  | 'double-tracked'
  | 'thirds-sixths'
  | 'call-response'
  | 'choir'
  | 'duet';

export interface VocalOption<T extends string> {
  value: T;
  label: string;
  description: string;
}

export const VOCAL_MODE_OPTIONS: VocalOption<VocalMode>[] = [
  { value: 'instrumental', label: 'Instrumental', description: 'No lead or backing vocals.' },
  { value: 'auto', label: 'Auto natural', description: 'Chooses a natural original voice from genre and lyrics.' },
  { value: 'female', label: 'Female voice', description: 'Original natural-sounding adult female voice.' },
  { value: 'male', label: 'Male voice', description: 'Original natural-sounding adult male voice.' },
  { value: 'duet', label: 'Female + male duet', description: 'Two distinct complementary original adult voices.' }
];

export const VOCAL_TIMBRE_OPTIONS: VocalOption<VocalTimbre>[] = [
  { value: 'natural', label: 'Natural balanced', description: 'Balanced fundamentals, formants and overtones.' },
  { value: 'warm', label: 'Warm', description: 'Rounded low mids and soft upper harmonics.' },
  { value: 'dark', label: 'Dark', description: 'Lower resonance with restrained brightness.' },
  { value: 'bright', label: 'Bright', description: 'Clear presence and energetic upper harmonics.' },
  { value: 'airy', label: 'Airy', description: 'Light breath texture with controlled sibilance.' },
  { value: 'velvety', label: 'Velvety', description: 'Smooth, rich and low-fatigue tone.' },
  { value: 'smoky', label: 'Smoky', description: 'Textured low-mid color without artificial rasp.' },
  { value: 'powerful', label: 'Powerful', description: 'Dense supported tone and strong projection.' },
  { value: 'crystalline', label: 'Crystalline', description: 'Pure focused tone with clean high detail.' },
  { value: 'raw', label: 'Raw organic', description: 'Human edge, audible effort and honest texture.' }
];

export const VOCAL_REGISTER_OPTIONS: VocalOption<VocalRegister>[] = [
  { value: 'auto', label: 'Adaptive range', description: 'Chooses a safe tessitura from voice and genre.' },
  { value: 'low', label: 'Low register', description: 'Chest-led bass or alto territory without forced notes.' },
  { value: 'mid', label: 'Middle register', description: 'Natural speech-connected tessitura and maximum intelligibility.' },
  { value: 'high', label: 'High register', description: 'Controlled head or upper mix with no shrill strain.' },
  { value: 'wide', label: 'Wide dynamic range', description: 'Natural low-to-high arc with smooth register transitions.' }
];

export const VOCAL_DELIVERY_OPTIONS: VocalOption<VocalDelivery>[] = [
  { value: 'adaptive', label: 'Genre adaptive', description: 'Matches the exact genre and lyric emotion.' },
  { value: 'intimate', label: 'Intimate', description: 'Close, nuanced and emotionally detailed.' },
  { value: 'soulful', label: 'Soulful', description: 'Expressive phrasing, tasteful runs and deep dynamics.' },
  { value: 'powerful', label: 'Powerful', description: 'Supported projection and controlled climaxes.' },
  { value: 'breathy', label: 'Breathy', description: 'Soft airflow and closeness without weak pitch.' },
  { value: 'clean', label: 'Clean', description: 'Stable pitch, clear vowels and minimal grain.' },
  { value: 'raspy', label: 'Raspy', description: 'Organic controlled grit without digital distortion.' },
  { value: 'operatic', label: 'Operatic', description: 'Resonant support, sustained phrasing and natural vibrato.' },
  { value: 'spoken-rap', label: 'Spoken / Rap', description: 'Natural speech rhythm, consonant clarity and flow.' }
];

export const VOCAL_HARMONY_OPTIONS: VocalOption<VocalHarmony>[] = [
  { value: 'natural', label: 'Adaptive harmonies', description: 'Adds only genre-correct doubles and harmonies.' },
  { value: 'dry-lead', label: 'Solo dry lead', description: 'One focused lead with minimal backing layers.' },
  { value: 'double-tracked', label: 'Natural doubles', description: 'Human double tracking with small timing differences.' },
  { value: 'thirds-sixths', label: 'Thirds & sixths', description: 'Musical parallel harmony at structural peaks.' },
  { value: 'call-response', label: 'Call & response', description: 'Lead phrases answered by backing voices.' },
  { value: 'choir', label: 'Choir layers', description: 'Sectional ensemble depth with separated vocal parts.' },
  { value: 'duet', label: 'Duet interplay', description: 'Alternating and combined lines for two voices.' }
];

export interface VocalProductionRequest {
  mode?: string;
  timbre?: string;
  register?: string;
  delivery?: string;
  harmony?: string;
  lyricsPresent?: boolean;
  genreVocalDirection?: string;
}

export interface VocalProductionProfile {
  requestedMode: VocalMode;
  effectiveMode: VocalMode;
  timbre: VocalTimbre;
  register: VocalRegister;
  delivery: VocalDelivery;
  harmony: VocalHarmony;
  isInstrumental: boolean;
  requiresLyrics: boolean;
  identity: string;
  timbreDirection: string;
  registerDirection: string;
  deliveryDirection: string;
  harmonyDirection: string;
  genreDirection: string;
  naturalnessDirection: string;
  dictionDirection: string;
  dynamicsDirection: string;
  mixDirection: string;
  artifactRejection: string;
}

const optionValue = <T extends string>(
  value: string | undefined,
  options: VocalOption<T>[],
  fallback: T
): T => options.some(option => option.value === value) ? value as T : fallback;

const identityByMode: Record<VocalMode, string> = {
  instrumental: 'strictly instrumental production with no lead vocal, backing vocal, choir, chant or synthetic vocalization',
  auto: 'one original natural-sounding adult lead voice selected to fit the exact genre, lyrics, emotional intent and safe singable range; never imitate a real artist',
  female: 'one original natural-sounding adult female lead voice with stable human formants, believable breath support and no imitation of any real singer',
  male: 'one original natural-sounding adult male lead voice with stable human formants, believable breath support and no imitation of any real singer',
  duet: 'two clearly distinct original natural-sounding adult voices, one female and one male, with separate formants, complementary ranges and no imitation of real singers'
};

const timbreByType: Record<VocalTimbre, string> = {
  natural: 'balanced fundamental, realistic formants, full midrange body and smooth unexaggerated overtones',
  warm: 'rounded low mids, soft upper harmonics, gentle presence and a close emotionally reassuring color',
  dark: 'deep chest resonance, restrained upper brightness and a rich non-muddy lower color',
  bright: 'clear forward presence, energetic upper harmonics and controlled non-harsh brilliance',
  airy: 'light breath component, delicate upper air and carefully controlled sibilance without losing pitch focus',
  velvety: 'smooth dense midrange, soft consonant edges and rich low-fatigue harmonic texture',
  smoky: 'organic textured low mids and subtle grain without digital rasp, clipping or throat strain',
  powerful: 'dense supported core, strong projection, stable resonance and open non-shouted climaxes',
  crystalline: 'pure focused fundamental, clean high detail, precise vowels and transparent harmonic sheen',
  raw: 'honest human edge, audible effort and organic texture while preserving pitch, diction and vocal health'
};

const registerByType: Record<VocalRegister, string> = {
  auto: 'choose a naturally comfortable tessitura for the selected voice and genre; favor musical phrasing over extreme notes',
  low: 'use a chest-dominant lower tessitura with clear fundamentals and intelligible consonants; never pitch-shift a normal voice downward',
  mid: 'use a speech-connected middle tessitura with maximum lyrical intelligibility and relaxed resonance',
  high: 'use a supported upper mix or head register with smooth vowels and no shrillness, chipmunk formants or forced strain',
  wide: 'develop a believable low-to-high arc using smooth chest, mix and head-register transitions with no abrupt formant jumps'
};

const deliveryByType: Record<VocalDelivery, string> = {
  adaptive: 'follow the exact genre and lyric emotion with natural phrase shaping, rests, emphasis and stylistically authentic ornament',
  intimate: 'close-mic nuance, restrained projection, detailed breath timing and small emotionally meaningful dynamics',
  soulful: 'deep pocket, expressive vowel length, tasteful melisma, controlled vibrato and emotionally responsive dynamics',
  powerful: 'supported projection, confident attacks, controlled belts or climaxes and recovery breaths placed at phrase boundaries',
  breathy: 'soft onset and audible airflow used expressively while maintaining stable pitch, diction and tonal core',
  clean: 'precise pitch centers, connected legato, clear consonants and minimal rasp or ornamental excess',
  raspy: 'controlled organic grain on selected attacks and peaks without constant distortion or loss of pitch definition',
  operatic: 'classically supported resonance, long breath phrases, clear vowels, natural vibrato and dynamic projection',
  'spoken-rap': 'speech-natural cadence, intentional accents, crisp consonants, rhythmic flow and no forced sung vibrato'
};

const harmonyByType: Record<VocalHarmony, string> = {
  natural: 'use only harmonies, doubles and responses that are structurally and historically authentic to the selected genre',
  'dry-lead': 'keep one focused lead voice with minimal doubling and only essential support at major transitions',
  'double-tracked': 'add human double tracking with subtle timing, pitch and intensity differences; never phase-copy the same take',
  'thirds-sixths': 'introduce tuned thirds and sixths at choruses or cadences while preserving independent natural phrasing',
  'call-response': 'build clear lead and backing-vocal call-and-response with different performances and believable ensemble timing',
  choir: 'use separated soprano, alto, tenor and bass functions as appropriate, with blended vowels and real sectional depth',
  duet: 'alternate lines between two distinct voices, reserve unison or harmony for structural peaks and maintain individual identity'
};

export function resolveVocalProductionProfile(
  request: VocalProductionRequest = {}
): VocalProductionProfile {
  const lyricsPresent = Boolean(request.lyricsPresent);
  const requestedMode = optionValue(
    request.mode,
    VOCAL_MODE_OPTIONS,
    lyricsPresent ? 'auto' : 'instrumental'
  );
  const effectiveMode: VocalMode = requestedMode === 'auto' && !lyricsPresent
    ? 'instrumental'
    : requestedMode;
  const timbre = optionValue(request.timbre, VOCAL_TIMBRE_OPTIONS, 'natural');
  const register = optionValue(request.register, VOCAL_REGISTER_OPTIONS, 'auto');
  const delivery = optionValue(request.delivery, VOCAL_DELIVERY_OPTIONS, 'adaptive');
  const harmony = optionValue(request.harmony, VOCAL_HARMONY_OPTIONS, 'natural');
  const isInstrumental = effectiveMode === 'instrumental';

  return {
    requestedMode,
    effectiveMode,
    timbre,
    register,
    delivery,
    harmony,
    isInstrumental,
    requiresLyrics: !isInstrumental,
    identity: identityByMode[effectiveMode],
    timbreDirection: isInstrumental
      ? 'not applicable to instrumental production'
      : timbreByType[timbre],
    registerDirection: isInstrumental
      ? 'not applicable to instrumental production'
      : registerByType[register],
    deliveryDirection: isInstrumental
      ? 'not applicable to instrumental production'
      : deliveryByType[delivery],
    harmonyDirection: isInstrumental
      ? 'no vocal harmonies or hidden choir layers'
      : harmonyByType[harmony],
    genreDirection: isInstrumental
      ? 'preserve the selected genre without introducing vocal samples'
      : String(request.genreVocalDirection || 'match phrasing, ornament, language and vocal production to the exact selected genre'),
    naturalnessDirection: isInstrumental
      ? 'no voice-like synthesis'
      : 'human breath cycles, phrase-level microdynamics, subtle pitch variation, stable formants, connected vowels, realistic consonant transitions and natural vibrato only where expressive',
    dictionDirection: isInstrumental
      ? 'not applicable'
      : 'preserve the supplied words exactly, stress meaningful syllables, keep vowels singable and consonants clear without rushed or garbled delivery',
    dynamicsDirection: isInstrumental
      ? 'not applicable'
      : 'use verse-to-chorus contrast, controlled crescendos, natural decays and emotionally motivated intensity instead of constant loudness',
    mixDirection: isInstrumental
      ? 'leave the vocal range available to the lead instruments'
      : 'center the lead naturally, high-pass only unnecessary rumble, control sibilance without dulling, retain chest warmth and air, use short early reflections plus genre-correct depth and preserve backing-vocal separation',
    artifactRejection: isInstrumental
      ? 'reject accidental singing, speech, chants and voice-like artifacts'
      : 'reject robotic cadence, flat monotone delivery, metallic or phasey formants, chipmunk pitch shifting, synthetic choir smear, garbled words, pumping breaths, harsh sibilance, clipping and constant hard autotune'
  };
}

export function vocalProductionPromptKeywords(
  profile: VocalProductionProfile
): string[] {
  if (profile.isInstrumental) {
    return [
      `VOCAL_MODE: INSTRUMENTAL; ${profile.identity}`,
      `VOCAL_ARTIFACT_REJECTION: ${profile.artifactRejection}`
    ];
  }

  return [
    `VOCAL_MODE: ${profile.effectiveMode.toUpperCase()}`,
    `VOICE_IDENTITY: ${profile.identity}`,
    `NATURAL_TIMBRE: ${profile.timbreDirection}`,
    `REGISTER_AND_RANGE: ${profile.registerDirection}`,
    `PERFORMANCE_STYLE: ${profile.deliveryDirection}`,
    `VOCAL_DYNAMICS: ${profile.dynamicsDirection}`,
    `HARMONY_ARCHITECTURE: ${profile.harmonyDirection}`,
    `GENRE_VOCAL_FIT: ${profile.genreDirection}`,
    `LYRIC_DICTION: ${profile.dictionDirection}`,
    `HUMAN_NATURALISM: ${profile.naturalnessDirection}`,
    `VOCAL_MIX: ${profile.mixDirection}`,
    `ARTIFACT_REJECTION: ${profile.artifactRejection}`
  ];
}

export function prepareLyricsForAceStep(
  lyrics: string,
  profile: VocalProductionProfile
): string {
  if (profile.isInstrumental) return '[instrumental]';

  const normalized = String(lyrics || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, 12_000);

  if (!normalized) return '';
  if (/^\s*\[(?:verse|chorus|bridge|intro|outro|pre-chorus|hook|instrumental|inst)\]/im.test(normalized)) {
    return normalized;
  }

  return `[verse]\n${normalized}`;
}

export function isSupportedVocalMode(value: unknown): value is VocalMode {
  return VOCAL_MODE_OPTIONS.some(option => option.value === value);
}
