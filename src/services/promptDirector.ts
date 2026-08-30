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

function vocalInstruction(vocalMode: string): string {
  const mode = compact(vocalMode).toLocaleLowerCase('en-US');
  if (mode === 'male') return 'Male lead vocal; keep vocal character coherent with the selected style and mood.';
  if (mode === 'female') return 'Female lead vocal; keep vocal character coherent with the selected style and mood.';
  if (mode === 'duet') return 'Male and female duet; use intentional call-and-response or complementary parts.';
  return 'Instrumental only; no sung vocals and no lyrics.';
}

function tempoInstruction(context: PromptDirectorContext): string {
  const bpm = Number(context.bpm);
  const hasBpm = Number.isFinite(bpm) && bpm > 0;
  if (context.bpmMode === 'manual' && hasBpm) return `Tempo is manually locked to exactly ${Math.round(bpm)} BPM.`;
  if (hasBpm) return `SONARA Auto BPM currently resolves to ${Math.round(bpm)} BPM; keep the groove coherent with the selected style.`;
  return 'Tempo is automatic; infer the most authentic BPM from the selected style, mood and groove.';
}

function creativityInstruction(context: PromptDirectorContext): string {
  const weirdness = Number(context.weirdness);
  const influence = Number(context.styleInfluence);
  const parts: string[] = [];
  if (Number.isFinite(weirdness)) parts.push(`Weirdness ${Math.round(weirdness)}%`);
  if (Number.isFinite(influence)) parts.push(`Style Influence ${Math.round(influence)}%`);
  return parts.length ? `${parts.join('; ')}. Treat these as creative-strength controls, not as a replacement for the selected musical identity.` : '';
}

function styleDetail(context: PromptDirectorContext, limit: number): string {
  const tags = unique(context.styleTags || []).filter(tag => {
    const lower = tag.toLocaleLowerCase('en-US');
    return lower !== compact(context.subgenre).toLocaleLowerCase('en-US') && lower !== compact(context.mood).toLocaleLowerCase('en-US');
  });
  return tags.slice(0, limit).join(', ');
}

export function buildPromptDirectorBrief(context: PromptDirectorContext, director: PromptDirectorMode): string {
  const idea = normalizeIdea(context);
  const taxonomy = [context.family, context.genre, context.subgenre].map(compact).filter(Boolean).join(' → ');
  const mood = compact(context.mood) || 'Authentic';
  const vocal = vocalInstruction(context.vocalMode);
  const tempo = tempoInstruction(context);
  const creativity = creativityInstruction(context);
  const details = styleDetail(context, director === 'essential' ? 3 : director === 'professional' ? 7 : 9);

  const authority = `LOCKED SONARA SELECTION — ${taxonomy}. Atmosphere: ${mood}. Manual interface selections are authoritative and must override any conflicting wording in the free-text idea.`;

  if (director === 'essential') {
    return unique([
      idea,
      authority,
      tempo,
      vocal,
      details ? `Core style cues: ${details}.` : '',
      creativity
    ]).join('\n\n');
  }

  if (director === 'cinematic') {
    return unique([
      `CREATOR IDEA — preserve the intent:\n${idea}`,
      authority,
      tempo,
      vocal,
      details ? `STYLE DNA — ${details}.` : '',
      `CINEMATIC DIRECTION — build a clear emotional arc with introduction, development, tension, release and a satisfying final resolution. Use contrast, evolving layers, spatial depth, purposeful transitions and memorable focal moments without losing the authentic ${compact(context.subgenre) || compact(context.genre)} identity.`,
      'ARRANGEMENT — make every section feel intentional and progressively developed; avoid static looping, arbitrary genre switching and generic filler.',
      'PRODUCTION — polished, dimensional, dynamic and release-ready, with controlled low end, musical transients, stereo depth and human-feeling movement.',
      creativity
    ]).join('\n\n');
  }

  return unique([
    `CREATOR IDEA — preserve the intent:\n${idea}`,
    authority,
    tempo,
    vocal,
    details ? `STYLE DNA — ${details}.` : '',
    `PROFESSIONAL DIRECTION — translate the idea into an authentic ${compact(context.subgenre) || compact(context.genre)} production. Keep groove, instrumentation, harmony, arrangement and sound design stylistically coherent rather than merely naming the genre.`,
    'ARRANGEMENT — use a complete musical structure with evolving sections, purposeful transitions, tension and release, variation and a clean musical ending.',
    'PRODUCTION — preserve human groove and musical dynamics while reaching a modern release-ready balance; avoid flattened dynamics, random stylistic drift and repetitive copy-paste sections.',
    creativity
  ]).join('\n\n');
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
