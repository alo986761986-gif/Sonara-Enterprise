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

export function buildPromptDirectorBrief(context: PromptDirectorContext, director: PromptDirectorMode): string {
  const idea = conciseIdea(context);
  const style = compact(context.subgenre || context.genre || context.family) || 'Original';
  const taxonomy = unique([context.family, context.genre, context.subgenre].map(compact)).join(' → ');
  const mood = compact(context.mood) || 'Authentic';
  const bpm = Number(context.bpm);
  const tempo = context.bpmMode === 'manual' && Number.isFinite(bpm) && bpm > 0
    ? `exactly ${Math.round(bpm)} BPM`
    : Number.isFinite(bpm) && bpm > 0
      ? `AUTO ${Math.round(bpm)} BPM`
      : 'AUTO AUTHENTIC BPM';

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

  const form = director === 'cinematic'
    ? 'intro > build > tension > peak > release > final resolution'
    : director === 'essential'
      ? 'clear hook > evolving sections > musical ending'
      : 'intro > main groove/verse > hook/chorus > contrast > developed return > clean ending';

  const line1 = `SONARA MASTER — EXECUTE THIS SONG EXACTLY; DO NOT REINTERPRET. SONG="${idea}"`;
  const line2 = `LOCK: ${taxonomy || style} | MOOD=${mood} | TEMPO=${tempo} | VOCAL=${vocal}${controls ? ` | ${controls}` : ''}`;
  const direction = director === 'cinematic' ? `CINEMATIC DIRECTION=${form}` : `FORM=${form}`;
  const line3 = [
    dna ? `DNA=${dna}` : '',
    direction,
    'REALISM=human groove, micro-dynamics, natural articulation, evolving performance, re-performed repeats',
    `STYLE RULE=stay unmistakably ${style}`,
    'AVOID=genre drift, generic filler, cloned loops, artificial phrasing'
  ].filter(Boolean).join(' | ');

  return [line1, line2, line3].join('\n');
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
