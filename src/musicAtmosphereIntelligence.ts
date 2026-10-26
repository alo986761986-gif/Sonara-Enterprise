export interface MusicAtmosphereContext {
  family: string;
  genre: string;
  subgenre: string;
}

export interface MusicAtmosphereProfile {
  atmosphere: string;
  energy: number;
  tension: number;
  brightness: number;
  density: number;
  space: number;
  intimacy: number;
  rawness: number;
  motion: number;
  identity: string;
  performance: string;
  arrangement: string;
  production: string;
  guardrail: string;
  fingerprint: string;
}

export const MUSIC_ATMOSPHERE_DNA_VERSION = 'sonara-atmosphere-dna-v1';

export const NON_ATMOSPHERE_LABELS = new Set([
  'authentic', 'professional', 'human', 'focused', 'dynamic', 'cultural', 'historic',
  'traditional', 'modern', 'acoustic', 'electric', 'digital', 'structured', 'rhythmic',
  'melodic', 'breakbeat', 'west-coast', 'slow', 'fast', 'synthetic'
]);

const FAMILY_FALLBACKS: Record<string, string[]> = {
  'Electronic / Dance': ['Hypnotic', 'Energetic', 'Nocturnal', 'Atmospheric', 'Groovy', 'Driving', 'Deep', 'Euphoric'],
  'Hip-Hop / Rap': ['Confident', 'Gritty', 'Urban', 'Defiant', 'Laid-Back', 'Dark', 'Raw', 'Intense'],
  Pop: ['Uplifting', 'Emotional', 'Bright', 'Romantic', 'Playful', 'Energetic', 'Dreamy', 'Confident'],
  Rock: ['Energetic', 'Raw', 'Rebellious', 'Emotional', 'Anthemic', 'Driving', 'Cathartic', 'Gritty'],
  Metal: ['Intense', 'Dark', 'Aggressive', 'Ominous', 'Epic', 'Relentless', 'Desolate', 'Powerful'],
  'R&B / Soul / Funk': ['Soulful', 'Warm', 'Intimate', 'Groovy', 'Romantic', 'Late-Night', 'Smooth', 'Reflective'],
  Jazz: ['Sophisticated', 'Smoky', 'Intimate', 'Playful', 'Reflective', 'Adventurous', 'Elegant', 'Nocturnal'],
  Blues: ['Soulful', 'Raw', 'Melancholic', 'Earthy', 'Intimate', 'Reflective', 'Gritty', 'Heartfelt'],
  'Reggae / Jamaican': ['Laid-Back', 'Deep', 'Uplifting', 'Spiritual', 'Sunny', 'Hypnotic', 'Warm', 'Dubwise'],
  'Latin America': ['Passionate', 'Festive', 'Romantic', 'Energetic', 'Warm', 'Celebratory', 'Intimate', 'Proud'],
  Africa: ['Groovy', 'Communal', 'Proud', 'Hypnotic', 'Soulful', 'Energetic', 'Earthy', 'Spiritual'],
  Caribbean: ['Sunny', 'Festive', 'Joyful', 'Danceable', 'Warm', 'Celebratory', 'Romantic', 'Communal'],
  'Middle East / North Africa': ['Mystical', 'Passionate', 'Spiritual', 'Dramatic', 'Hypnotic', 'Regal', 'Intimate', 'Ecstatic'],
  'South Asia': ['Spiritual', 'Devotional', 'Ecstatic', 'Meditative', 'Majestic', 'Joyful', 'Romantic', 'Intense'],
  'East Asia': ['Elegant', 'Nostalgic', 'Bright', 'Emotional', 'Dreamy', 'Dramatic', 'Intimate', 'Polished'],
  'Southeast Asia': ['Ceremonial', 'Joyful', 'Hypnotic', 'Warm', 'Communal', 'Shimmering', 'Meditative', 'Mystical'],
  'Country / Americana': ['Earthy', 'Nostalgic', 'Heartfelt', 'Warm', 'Hopeful', 'Driving', 'Intimate', 'Joyful'],
  'Folk / Traditional Europe': ['Earthy', 'Nostalgic', 'Intimate', 'Mystical', 'Festive', 'Melancholic', 'Passionate', 'Communal'],
  'Neomelodica Napoletana': ['Passionate', 'Romantic', 'Heartfelt', 'Dramatic', 'Intimate', 'Melancholic', 'Tender', 'Powerful'],
  'Classical / Art Music': ['Elegant', 'Majestic', 'Contemplative', 'Dramatic', 'Lyrical', 'Serene', 'Intense', 'Tender'],
  'Gospel / Spiritual': ['Uplifting', 'Spiritual', 'Powerful', 'Joyful', 'Devotional', 'Communal', 'Ecstatic', 'Hopeful'],
  'Cinematic / Media': ['Cinematic', 'Dramatic', 'Epic', 'Mysterious', 'Emotional', 'Suspenseful', 'Heroic', 'Atmospheric'],
  'Experimental / Avant-Garde': ['Abstract', 'Unsettling', 'Textural', 'Curious', 'Ethereal', 'Intense', 'Immersive', 'Mysterious'],
  'Easy Listening / Lounge': ['Relaxed', 'Elegant', 'Warm', 'Mellow', 'Intimate', 'Sunny', 'Smooth', 'Dreamy'],
  'Children / Novelty / Spoken': ['Playful', 'Joyful', 'Gentle', 'Bright', 'Whimsical', 'Tender', 'Warm', 'Curious']
};

const GLOBAL_FALLBACKS = [
  'Warm', 'Dark', 'Intimate', 'Energetic', 'Dreamy', 'Uplifting', 'Reflective', 'Dramatic',
  'Hypnotic', 'Joyful', 'Melancholic', 'Atmospheric'
];

interface AxisDelta {
  energy?: number;
  tension?: number;
  brightness?: number;
  density?: number;
  space?: number;
  intimacy?: number;
  rawness?: number;
  motion?: number;
  identity: string;
}

const RULES: Array<{ pattern: RegExp; delta: AxisDelta }> = [
  { pattern: /warm|soulful|cozy|heartfelt|tender/i, delta: { brightness: 12, tension: -15, intimacy: 18, rawness: -4, identity: 'warm, human and emotionally close, with rounded tone and gentle expressive detail' } },
  { pattern: /dark|ominous|menacing|desolate|subterranean|cold|frostbitten/i, delta: { brightness: -28, tension: 24, intimacy: -4, density: 8, identity: 'dark and shadowed, using lower tonal gravity, restrained brightness and controlled unease' } },
  { pattern: /intimate|close|personal/i, delta: { intimacy: 34, space: -15, density: -14, energy: -8, identity: 'intimate and close-up, with exposed detail, restrained scale and emotionally direct performance' } },
  { pattern: /spacious|atmospheric|ambient|ethereal|immersive|expansive/i, delta: { space: 32, density: -8, motion: -6, identity: 'spacious and enveloping, with audible depth, long perspective and room for decay and texture' } },
  { pattern: /energetic|driving|relentless|peak-time|powerful|intense|aggressive|fiery/i, delta: { energy: 30, motion: 24, density: 14, tension: 12, identity: 'high-energy and forward-moving, with stronger accents, decisive momentum and controlled physical impact' } },
  { pattern: /laid-back|relaxed|mellow|serene|gentle|soft/i, delta: { energy: -24, tension: -22, motion: -18, density: -10, identity: 'relaxed and unforced, with softer attacks, more breathing room and an easy sense of time' } },
  { pattern: /hypnotic|meditative|ritual|trance|transcendent/i, delta: { motion: 8, density: -4, tension: -4, space: 16, identity: 'hypnotic and absorbing, using controlled repetition, gradual micro-variation and sustained focus' } },
  { pattern: /groovy|funky|danceable|swinging|cruising/i, delta: { motion: 24, energy: 12, tension: -8, identity: 'groove-led and bodily, with clear pocket, elastic timing and rhythmic interaction rather than rigid quantization' } },
  { pattern: /joyful|festive|celebratory|sunny|bright|playful|uplifting|euphoric|radiant/i, delta: { brightness: 30, energy: 18, tension: -18, motion: 10, identity: 'bright and positive, with open tonal color, buoyant phrasing and an audible sense of lift' } },
  { pattern: /melancholic|nostalgic|longing|saudade|reflective|introspective|rainy/i, delta: { brightness: -12, energy: -14, tension: 4, intimacy: 18, space: 10, identity: 'reflective and emotionally shaded, with patient phrasing, lingering resonance and bittersweet tonal color' } },
  { pattern: /romantic|sensual|passionate/i, delta: { intimacy: 24, tension: 10, energy: 8, brightness: 8, identity: 'romantic and emotionally charged, with expressive phrasing, controlled tension and warm lyrical movement' } },
  { pattern: /epic|majestic|heroic|regal|monolithic|massive/i, delta: { density: 30, space: 24, energy: 22, intimacy: -20, identity: 'large-scale and commanding, with broad dynamics, expanded register and clearly earned climactic weight' } },
  { pattern: /raw|gritty|ruff|street|underground|rebellious|defiant/i, delta: { rawness: 34, brightness: -10, density: 8, tension: 10, identity: 'raw and direct, preserving edge, texture and performance friction without technical sloppiness' } },
  { pattern: /polished|elegant|sophisticated|smooth/i, delta: { rawness: -26, brightness: 10, density: -4, tension: -8, identity: 'refined and controlled, with clean articulation, balanced detail and deliberate restraint' } },
  { pattern: /nocturnal|late-night|smoky/i, delta: { brightness: -16, energy: -8, intimacy: 12, space: 10, identity: 'nocturnal and after-hours, with softened brightness, deeper space and restrained expressive intensity' } },
  { pattern: /dreamy|cosmic|psychedelic|mystical|shimmering/i, delta: { space: 24, brightness: 10, motion: -4, tension: 2, identity: 'dreamlike and otherworldly, using fluid depth, evolving color and softened perceptual edges' } },
  { pattern: /tense|suspenseful|unsettling|dramatic/i, delta: { tension: 32, energy: 8, brightness: -8, density: 10, identity: 'tense and dramatically charged, with delayed resolution, sharper contrast and controlled expectation' } },
  { pattern: /minimal|understated/i, delta: { density: -32, energy: -8, space: 12, identity: 'minimal and deliberate, with fewer simultaneous elements, meaningful negative space and micro-variation' } },
  { pattern: /wall-of-sound|noisy|dense/i, delta: { density: 34, rawness: 16, space: 8, identity: 'dense and immersive, layering energy and texture while preserving separation and the underlying subgenre grammar' } },
  { pattern: /organic|earthy/i, delta: { rawness: 10, intimacy: 12, brightness: -2, identity: 'organic and grounded, with believable performer interaction, natural transient variation and tactile timbre' } },
  { pattern: /futuristic|machine-soul|digital/i, delta: { rawness: -8, brightness: 8, motion: 10, identity: 'futuristic and precision-shaped, using deliberate synthetic detail while retaining musical expression and human-scale phrasing' } },
  { pattern: /spiritual|devotional|conscious|ceremonial/i, delta: { tension: -4, space: 18, intimacy: 10, density: 4, identity: 'spiritually focused and purposeful, with reverent pacing, communal or contemplative weight and meaningful repetition' } },
  { pattern: /communal|proud|political/i, delta: { energy: 12, density: 10, intimacy: -2, identity: 'collective and outward-facing, with clear ensemble response, confident statement and shared rhythmic purpose' } },
  { pattern: /virtuosic|adventurous|cerebral|curious/i, delta: { energy: 10, tension: 8, motion: 16, density: 8, identity: 'adventurous and detail-rich, allowing technical or structural complexity while keeping the musical argument coherent' } },
  { pattern: /dubwise/i, delta: { space: 30, density: -12, brightness: -10, motion: -4, identity: 'dubwise and spatial, with bass weight, echo, decay, filtering and negative space functioning as musical structure' } },
  { pattern: /flowing|liquid/i, delta: { motion: 14, tension: -14, density: -8, space: 8, identity: 'fluid and continuous, with smooth transitions, connected phrasing and controlled movement rather than abrupt edges' } },
  { pattern: /cathartic/i, delta: { energy: 18, tension: 18, density: 12, space: 8, identity: 'cathartic, building genuine accumulated tension toward an emotionally earned release rather than constant maximum intensity' } }
];

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalize(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLocaleLowerCase('en-US');
}

function unique(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const text = String(value || '').trim();
    const key = normalize(text);
    if (!text || seen.has(key) || NON_ATMOSPHERE_LABELS.has(key)) continue;
    seen.add(key);
    result.push(text);
  }
  return result;
}

export function sanitizeAtmosphereOptions(values: string[], family?: string, minimum = 8, maximum = 10): string[] {
  const familyFallbacks = FAMILY_FALLBACKS[String(family || '')] || [];
  const cleaned = unique([...values, ...familyFallbacks, ...GLOBAL_FALLBACKS]);
  return cleaned.slice(0, Math.max(minimum, maximum));
}

function fingerprint(parts: Array<string | number>): string {
  let hash = 2166136261;
  const value = parts.join('|');
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function getMusicAtmosphereProfile(
  atmosphere: unknown,
  context: MusicAtmosphereContext
): MusicAtmosphereProfile {
  const label = String(atmosphere || 'Expressive').trim() || 'Expressive';
  const matched = RULES.filter(rule => rule.pattern.test(label));
  let energy = 50;
  let tension = 50;
  let brightness = 50;
  let density = 50;
  let space = 50;
  let intimacy = 50;
  let rawness = 50;
  let motion = 50;

  for (const rule of matched) {
    energy += rule.delta.energy || 0;
    tension += rule.delta.tension || 0;
    brightness += rule.delta.brightness || 0;
    density += rule.delta.density || 0;
    space += rule.delta.space || 0;
    intimacy += rule.delta.intimacy || 0;
    rawness += rule.delta.rawness || 0;
    motion += rule.delta.motion || 0;
  }

  energy = clamp(energy);
  tension = clamp(tension);
  brightness = clamp(brightness);
  density = clamp(density);
  space = clamp(space);
  intimacy = clamp(intimacy);
  rawness = clamp(rawness);
  motion = clamp(motion);

  const semantic = matched.length
    ? matched.map(rule => rule.delta.identity).join('; ')
    : `express the literal emotional meaning of “${label}” through performance, dynamics, timbre and space without changing the musical style`;

  const identity = `ATMOSPHERE “${label}” must be clearly audible inside ${context.family} > ${context.genre} > ${context.subgenre}: ${semantic}.`;
  const performance = `Performance for “${label}”: energy ${energy}/100, tension ${tension}/100, intimacy ${intimacy}/100 and motion ${motion}/100. Translate these into attack strength, note length, articulation, microtiming, breath, phrasing and expressive dynamics while keeping the exact ${context.subgenre} technique.`;
  const arrangement = `Arrangement for “${label}”: density ${density}/100 and spatial openness ${space}/100. Shape section contrast, layering, rests, buildup and release to communicate ${label} without changing the canonical Family > Genre > Subgenre structure.`;
  const production = `Production for “${label}”: brightness ${brightness}/100, rawness ${rawness}/100, space ${space}/100 and density ${density}/100. Express the atmosphere through tone, saturation, transient shape, ambience, depth and stereo perspective while preserving ${context.subgenre} production grammar.`;
  const guardrail = `ATMOSPHERE GUARDRAIL: “${label}” is only an emotional and production modifier. It must never introduce another family, genre, sibling subgenre, incompatible rhythm, foreign instrumentation or alternate cultural lineage. The immutable style path is ${context.family} > ${context.genre} > ${context.subgenre}.`;

  return {
    atmosphere: label,
    energy,
    tension,
    brightness,
    density,
    space,
    intimacy,
    rawness,
    motion,
    identity,
    performance,
    arrangement,
    production,
    guardrail,
    fingerprint: fingerprint([
      context.family, context.genre, context.subgenre, label,
      energy, tension, brightness, density, space, intimacy, rawness, motion, semantic
    ])
  };
}

export default {
  MUSIC_ATMOSPHERE_DNA_VERSION,
  NON_ATMOSPHERE_LABELS,
  sanitizeAtmosphereOptions,
  getMusicAtmosphereProfile
};
