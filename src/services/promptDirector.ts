export type PromptStudioMode = 'simple' | 'pro';
export type PromptDirectorMode = 'essential' | 'professional' | 'cinematic';

export type PromptDirectorContext = {
  idea: string;
  family: string;
  genre: string;
  subgenre: string;
  mood: string;
  vocalMode: string;
  bpmMode?: 'manual' | 'auto';
  bpm?: number | null;
  weirdness?: number | null;
  styleInfluence?: number | null;
  styleTags?: string[];
};

export type PromptContextChip = {
  key: string;
  label: string;
  kind: 'lock' | 'creative' | 'mode';
};

function compact(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = compact(raw);
    if (!value) continue;
    const key = value.toLocaleLowerCase('en-US');
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

export function stripVocalLanguageForInstrumental(value: string): string {
  return compact(value)
    .replace(/\b(?:female|male|woman|man|girl|boy)\s+(?:lead\s+)?(?:vocal|vocals|voice|singer|singing)\b/gi, ' ')
    .replace(/\b(?:expressive|gentle|intimate|powerful|airy|raspy|warm|deep)\s+(?:lead\s+)?(?:vocal|vocals|voice|singing)\b/gi, ' ')
    .replace(/\b(?:lead\s+)?(?:vocal|vocals|singer|singing|sung lyrics|lyrics)\b/gi, ' ')
    .replace(/\b(?:duet|male and female duet|vocal duet)\b/gi, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/[,;]\s*[,;]/g, ', ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*[,.;:]+|[,.;:]+\s*$/g, '')
    .trim();
}

function normalizeIdea(context: PromptDirectorContext): string {
  const fallback = `Create an original ${context.subgenre || context.genre || context.family} track.`;
  const idea = compact(context.idea) || fallback;
  return context.vocalMode === 'instrumental' ? (stripVocalLanguageForInstrumental(idea) || fallback) : idea;
}

function styleDetail(context: PromptDirectorContext, limit: number): string {
  const tags = unique(context.styleTags || []).filter(tag => {
    const lower = tag.toLocaleLowerCase('en-US');
    return lower !== compact(context.subgenre).toLocaleLowerCase('en-US') && lower !== compact(context.mood).toLocaleLowerCase('en-US');
  });
  return tags.slice(0, limit).join(', ');
}

function extractOriginalIdea(value: string): string {
  const normalized = compact(value);
  const modern = normalized.match(/\bSONG\s*=\s*"([^"]+)"/i)?.[1];
  if (modern) return compact(modern);
  const legacy = normalized.match(/CREATOR IDEA\s*[—-]\s*preserve the intent:\s*(.*?)(?=\s+LOCKED SONARA SELECTION|$)/i)?.[1];
  return compact(legacy || normalized);
}

function conciseIdea(context: PromptDirectorContext): string {
  const fallback = `Create an original ${context.subgenre || context.genre || context.family} track.`;
  let idea = extractOriginalIdea(normalizeIdea(context)) || fallback;
  idea = idea.replace(/^["'`]+|["'`]+$/g, '');
  if (idea.length > 260) idea = `${idea.slice(0, 257).replace(/\s+\S*$/, '')}...`;
  return idea;
}

function tempoInstruction(context: PromptDirectorContext): string {
  const bpm = Number(context.bpm);
  if (context.bpmMode === 'manual' && Number.isFinite(bpm) && bpm > 0) {
    return `Tempo is manually locked to exactly ${Math.round(bpm)} BPM; do not reinterpret, normalize, double-time, half-time, drift, or override it.`;
  }
  if (Number.isFinite(bpm) && bpm > 0) return `AUTO ${Math.round(bpm)} BPM`;
  return 'AUTO AUTHENTIC BPM';
}

let masterPromptSequence = 0;

function nextMasterVariationSeed(): { seed: number; sequence: number } {
  masterPromptSequence = (masterPromptSequence + 1) >>> 0;
  if (masterPromptSequence === 0) masterPromptSequence = 1;
  const entropy = Math.floor(Math.random() * 0xffffffff) >>> 0;
  const time = Date.now() >>> 0;
  const seed = (entropy ^ time ^ Math.imul(masterPromptSequence, 0x9e3779b1)) >>> 0;
  return { seed: seed || 1, sequence: masterPromptSequence };
}

function mixSeed(seed: number, salt: number): number {
  let value = (seed ^ Math.imul(salt, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 16)) >>> 0;
}

function pickVariation<T>(values: readonly T[], seed: number, salt: number, sequence: number): T {
  const mixed = (mixSeed(seed, salt) + Math.imul(sequence, salt + 17)) >>> 0;
  return values[mixed % values.length];
}

const ESSENTIAL_FORMS = [
  'hook opening > main section > contrast > hook return > musical ending',
  'short intro > hook > evolving main section > final hook > ending',
  'main groove > hook > contrast > developed hook return > ending',
  'intro motif > main groove > compact hook > contrast > final hook > ending',
  'cold open > main section > hook > stripped contrast > final return',
  'signature motif > groove > hook > short break > evolved hook > ending'
] as const;

const PROFESSIONAL_FORMS = [
  'intro > groove/verse > hook > contrast > developed return > clean ending',
  'cold-open hook > verse > lift > chorus > breakdown > final hook > ending',
  'short intro > verse > pre-hook > hook > instrumental contrast > final hook > outro',
  'atmospheric intro > main section > hook > stripped break > rebuilt climax > resolve',
  'signature intro > verse > hook > post-hook > break > evolved final hook > ending',
  'groove intro > verse > hook > second verse variation > bridge > final hook > outro',
  'motif intro > main groove > chorus > instrumental turn > bigger chorus > clean end',
  'immediate groove > hook tease > verse > full hook > tension break > final release'
] as const;

const CINEMATIC_FORMS = [
  'atmospheric opening > escalation > first peak > intimate reset > larger final peak > resolve',
  'motif reveal > steady build > false resolution > renewed tension > final release',
  'sparse opening > expanding middle > emotional pivot > full climax > decompression > final image',
  'theme statement > development > tension break > transformed theme > final resolution',
  'textural opening > rhythmic arrival > emotional lift > suspended break > final expansion',
  'quiet motif > layered ascent > dramatic contrast > rebuilt theme > decisive ending',
  'immediate theme > widening development > deep reset > transformed climax > long resolve'
] as const;

const HOOK_VARIATIONS = [
  'motif-first hook with an evolving answer phrase',
  'rhythmic hook with a contrasting melodic response',
  'short lead phrase that develops on every return',
  'call-and-response hook with changing phrase endings',
  'hook revealed gradually, fully stated only at the peak',
  'two-part hook: statement then contrasting answer',
  'small interval motif expanded across later sections',
  'rhythm-led hook whose melody opens at the climax',
  'hook built from a memorable pickup into a longer answer',
  'restrained first hook followed by a wider developed return'
] as const;

const GROOVE_VARIATIONS = [
  'deep pocket with subtle syncopation and human accents',
  'forward pulse with controlled push-pull detail',
  'tight core beat with off-grid percussion detail',
  'minimal groove growing through ghost notes and fills',
  'layered bass-drum interaction that evolves by section',
  'steady pulse with delayed accents and restrained swing',
  'clean main pulse with contrasting pickup patterns',
  'bass-led pocket with percussion answering phrase endings',
  'locked kick foundation with changing secondary percussion',
  'simple groove whose microtiming becomes richer toward the peak'
] as const;

const HARMONY_VARIATIONS = [
  'stable tonal center with moving inversions',
  'slow harmonic rhythm with expressive turnaround chords',
  'hook-led harmony with a contrasting middle section',
  'bass-driven chord movement with restrained tension-release',
  'clear tonal anchor with selective borrowed-color movement',
  'pedal-tone tension opening into wider hook voicings',
  'compact verse harmony expanding in the hook',
  'voice-led chord motion using smooth common-tone movement',
  'minimal harmonic loop transformed through inversion and bass changes',
  'simple core progression with one distinctive emotional pivot'
] as const;

const TEXTURE_VARIATIONS = [
  'start sparse; reveal one meaningful layer per section',
  'alternate intimate dry sections with wider peaks',
  'evolve timbre and automation instead of stacking filler',
  'keep the hook foregrounded over restrained supporting texture',
  'expand stereo width and depth gradually toward the climax',
  'hold signature layers back until the hook arrives',
  'use subtractive breaks so returns feel newly performed',
  'rotate supporting textures while the core identity stays fixed',
  'contrast close foreground detail with deep atmospheric layers',
  'change register and density between sections, not the song identity'
] as const;

const DEVELOPMENT_VARIATIONS = [
  'change fills and phrase endings on each return',
  'increase energy through articulation before adding layers',
  'let the second half answer rather than copy the first',
  're-perform repeated sections with new accents and automation',
  'build tension through subtraction before the final return',
  'develop the hook rhythm while preserving its identity',
  'use short transitional motifs to connect sections naturally',
  'make the final return feel earned through gradual dynamic growth',
  'vary bass phrasing and percussion without losing the pocket',
  'preserve the central motif but alter surrounding voicings and detail'
] as const;

function formPool(director: PromptDirectorMode) {
  if (director === 'cinematic') return CINEMATIC_FORMS;
  if (director === 'essential') return ESSENTIAL_FORMS;
  return PROFESSIONAL_FORMS;
}

export function buildPromptDirectorBrief(context: PromptDirectorContext, director: PromptDirectorMode): string {
  const idea = conciseIdea(context);
  const style = compact(context.subgenre || context.genre || context.family) || 'Original';
  const taxonomy = unique([context.family, context.genre, context.subgenre].map(compact)).join(' → ');
  const mood = compact(context.mood) || 'Authentic';
  const tempo = tempoInstruction(context);

  const vocalMode = compact(context.vocalMode).toLocaleLowerCase('en-US');
  const vocal = vocalMode === 'male'
    ? 'Male lead vocal'
    : vocalMode === 'female'
      ? 'Female lead vocal'
      : vocalMode === 'duet'
        ? 'Male and female duet'
        : 'Instrumental only';

  const dna = styleDetail(context, director === 'essential' ? 3 : 5);
  const weirdness = Number(context.weirdness);
  const influence = Number(context.styleInfluence);
  const controls = [
    Number.isFinite(weirdness) ? `Weirdness ${Math.round(weirdness)}%` : '',
    Number.isFinite(influence) ? `Style Influence ${Math.round(influence)}%` : ''
  ].filter(Boolean).join('; ');

  const { seed, sequence } = nextMasterVariationSeed();
  const form = pickVariation(formPool(director), seed, 11, sequence);
  const hook = pickVariation(HOOK_VARIATIONS, seed, 23, sequence);
  const groove = pickVariation(GROOVE_VARIATIONS, seed, 37, sequence);
  const harmony = pickVariation(HARMONY_VARIATIONS, seed, 53, sequence);
  const texture = pickVariation(TEXTURE_VARIATIONS, seed, 71, sequence);
  const development = pickVariation(DEVELOPMENT_VARIATIONS, seed, 89, sequence);
  const take = `${sequence.toString(36)}-${seed.toString(36)}`.toUpperCase();

  const line1 = `SONARA MASTER — EXECUTE THIS SONG EXACTLY; DO NOT REINTERPRET. SONG="${idea}"`;
  const line2 = `LOCK: ${taxonomy || style} | MOOD=${mood} | ${tempo} | VOCAL=${vocal}${controls ? ` | ${controls}` : ''}`;
  const direction = director === 'cinematic' ? `CINEMATIC DIRECTION=${form}` : `FORM=${form}`;
  const line3 = `TAKE=${take} | ${direction} | HOOK=${hook} | GROOVE=${groove}`;
  const line4 = `HARMONY=${harmony} | TEXTURE=${texture} | EVOLVE=${development}`;
  const line5 = [
    dna ? `DNA=${dna}` : '',
    'REALISM=human groove, micro-dynamics, natural articulation, evolving performance, re-performed repeats',
    `STYLE RULE=stay unmistakably ${style}`,
    'AVOID=genre drift, generic filler, cloned loops, artificial phrasing'
  ].filter(Boolean).join(' | ');

  return [line1, line2, line3, line4, line5].join('\n');
}

export function buildPromptContextChips(context: PromptDirectorContext, director: PromptDirectorMode): PromptContextChip[] {
  const chips: PromptContextChip[] = [];
  const style = compact(context.subgenre || context.genre || context.family);
  if (style) chips.push({ key: 'style', label: style, kind: 'lock' });
  if (compact(context.mood)) chips.push({ key: 'mood', label: compact(context.mood), kind: 'lock' });

  const bpm = Number(context.bpm);
  if (context.bpmMode === 'manual' && Number.isFinite(bpm) && bpm > 0) {
    chips.push({ key: 'bpm', label: `${Math.round(bpm)} BPM`, kind: 'lock' });
  } else if (Number.isFinite(bpm) && bpm > 0) {
    chips.push({ key: 'bpm', label: `AUTO ${Math.round(bpm)} BPM`, kind: 'lock' });
  } else {
    chips.push({ key: 'bpm', label: 'BPM AUTO', kind: 'lock' });
  }

  const vocal = compact(context.vocalMode).toLocaleLowerCase('en-US');
  chips.push({
    key: 'vocal',
    label: vocal === 'male' ? 'MALE VOCAL' : vocal === 'female' ? 'FEMALE VOCAL' : vocal === 'duet' ? 'DUET' : 'INSTRUMENTAL',
    kind: 'lock'
  });

  const weirdness = Number(context.weirdness);
  if (Number.isFinite(weirdness)) chips.push({ key: 'weirdness', label: `WEIRD ${Math.round(weirdness)}%`, kind: 'creative' });
  const influence = Number(context.styleInfluence);
  if (Number.isFinite(influence)) chips.push({ key: 'influence', label: `STYLE ${Math.round(influence)}%`, kind: 'creative' });

  chips.push({
    key: 'director',
    label: director === 'essential' ? 'ESSENZIALE' : director === 'cinematic' ? 'CINEMATICO' : 'PROFESSIONALE',
    kind: 'mode'
  });
  return chips;
}

export function buildContextualVariation(context: PromptDirectorContext, director: PromptDirectorMode, seed = Math.random()): string {
  const idea = normalizeIdea(context);
  const tags = unique(context.styleTags || []).filter(tag => {
    const lower = tag.toLocaleLowerCase('en-US');
    return !idea.toLocaleLowerCase('en-US').includes(lower) && !/vocal|voice|singer|lyrics/i.test(tag);
  });
  const fallback = ['dynamic arrangement', 'human groove', 'memorable hook', 'evolving texture', 'purposeful transitions'];
  const source = tags.length ? tags : fallback;
  const index = Math.abs(Math.floor(seed * 1000003)) % source.length;
  const second = source[(index + Math.max(1, Math.floor(source.length / 2))) % source.length];
  const variation = unique([source[index], second]).join(', ');
  const suffix = director === 'cinematic'
    ? 'with a stronger cinematic arc and evolving tension/release'
    : director === 'professional'
      ? 'with a polished professional arrangement and release-ready production'
      : 'with a fresh but stylistically coherent variation';
  return compact(`${idea}${idea ? '. ' : ''}${variation}; ${suffix}.`);
}
