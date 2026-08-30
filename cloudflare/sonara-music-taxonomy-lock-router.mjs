import runtime, { SonaraJobState } from './sonara-molab-xl-router.mjs';

export { SonaraJobState };

const TAXONOMY_LOCK_ID = 'sonara-musical-dna-v2-hard-authority';
const PROMPT_VERSION = 'sonara-taxonomy-first-prompt-v2';
const MAX_CREATOR_CHARS = 3200;
const MAX_STYLE_TAIL_CHARS = 5200;
const MAX_CANONICAL_PROMPT_CHARS = 9200;

function clean(value, fallback = '') {
  const text = String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text || fallback;
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function selectedMusicalDna(body = {}) {
  const family = clean(body.genreFamily || body.genre_family, 'Music');
  const genre = clean(body.genre, 'Music');
  const subgenre = clean(body.subgenre, genre);
  const atmosphere = clean(body.mood || body.atmosphere, 'Authentic');
  return { family, genre, subgenre, atmosphere };
}

function originalCreatorBrief(body = {}) {
  return clean(
    body.sonaraOriginalCreatorBrief ||
    body.rawPrompt ||
    body.creatorPrompt ||
    body.creator_prompt ||
    body.musicPrompt ||
    '',
    ''
  ).slice(0, MAX_CREATOR_CHARS);
}

function selectedStyleTail(body = {}) {
  const source = String(body.prompt || '');
  if (!source) return '';

  const marker = 'AUTHORITATIVE MUSICAL IDENTITY:';
  const index = source.indexOf(marker);
  if (index < 0) return '';

  return source
    .slice(index)
    .replace(/CREATOR BRIEF\s+—\s+VERBATIM:[\s\S]*?>>>/gi, '')
    .replace(/Priority rule:[^\n]*/gi, '')
    .replace(/Concrete creator details take precedence over generic defaults[^\n]*/gi, '')
    .trim()
    .slice(0, MAX_STYLE_TAIL_CHARS);
}

function effectiveStyleInfluence(body = {}) {
  const requested = Math.round(clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100));
  // Style Influence changes how intensely the exact selected subgenre is expressed.
  // It never grants permission to leave the selected taxonomy.
  const effective = 88 + Math.round(requested * 0.12);
  return { requested, effective };
}

function technicalLine(body = {}) {
  const bpm = Math.round(clamp(body.bpm ?? body.requestedBpm, 124, 40, 220));
  const key = clean(body.key || body.key_scale, 'A Minor');
  const duration = Math.round(clamp(body.durationSec ?? body.duration, 30, 30, 480));
  const vocalMode = clean(body.vocalMode || body.vocal_mode, body.lyrics ? 'vocal' : 'instrumental');
  return `TECHNICAL LOCK: ${bpm} BPM; key ${key}; duration approximately ${duration} seconds; vocal mode ${vocalMode}. Keep these parameters stable for the whole composition.`;
}

function canonicalTaxonomyPrompt(body = {}) {
  const { family, genre, subgenre, atmosphere } = selectedMusicalDna(body);
  const creator = originalCreatorBrief(body);
  const styleTail = selectedStyleTail(body);

  const sections = [
    `SONARA MUSICAL DNA ${TAXONOMY_LOCK_ID}. THIS TAXONOMY IS THE PRIMARY MUSIC SPECIFICATION.`,
    `PRIMARY IDENTITY: FAMILY = ${family}; GENRE = ${genre}; SUBGENRE = ${subgenre}; ATMOSPHERE = ${atmosphere}.`,
    `HARD STYLE ORDER: ${family} > ${genre} > ${subgenre}. The exact subgenre ${subgenre} is non-negotiable and must be immediately recognizable in groove, drum language, bass behavior, instrumentation, harmony, melody, arrangement, transitions, sound design, mix and mastering character.`,
    `DO NOT substitute ${subgenre} with its parent ${genre}, a neighboring subgenre, generic EDM, generic pop, generic house, generic techno, soundtrack music, cinematic filler or any other default. Do not blend into another genre unless that blend is already part of the selected subgenre's authentic vocabulary.`,
    `ATMOSPHERE LOCK: ${atmosphere} changes emotion, energy, density, brightness/darkness, tension, space and performance character INSIDE ${subgenre}. Atmosphere must never replace or weaken the selected genre/subgenre.`,
    'WEIRDNESS RULE: creativity is allowed only inside the selected musical DNA. STYLE INFLUENCE RULE: the control changes the intensity of authentic subgenre conventions, never the identity of the genre.',
    technicalLine(body),
    creator ? `CREATOR DETAILS — SUBORDINATE TO THE SELECTED MUSICAL DNA: ${creator} Preserve compatible requests for instruments, lyrics, vocals, structure, dynamics and production. If any creator wording conflicts with Family/Genre/Subgenre/Atmosphere, the selected taxonomy above wins.` : '',
    styleTail ? `SONARA CURATED SUBGENRE PROFILE — USE THIS TO REALIZE THE SELECTED STYLE:\n${styleTail}` : '',
    `FINAL CHECK BEFORE RENDERING: the result must sound specifically like ${subgenre}, inside ${genre} and ${family}, with a clearly audible ${atmosphere} atmosphere. If the result could be mistaken for a neighboring genre, revise the musical decisions toward ${subgenre}. Generate finished music audio, not prose.`
  ].filter(Boolean);

  return sections.join('\n\n').slice(0, MAX_CANONICAL_PROMPT_CHARS);
}

export async function lockMusicTaxonomyRequest(request) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || url.pathname !== '/api/engine/generate') return request;

  let body;
  try {
    body = await request.clone().json();
  } catch {
    return request;
  }

  const dna = selectedMusicalDna(body);
  const style = effectiveStyleInfluence(body);
  const creator = originalCreatorBrief(body);
  const canonicalPrompt = canonicalTaxonomyPrompt(body);

  const locked = {
    ...body,
    genreFamily: dna.family,
    genre_family: dna.family,
    genre: dna.genre,
    subgenre: dna.subgenre,
    mood: dna.atmosphere,
    atmosphere: dna.atmosphere,

    // Critical fix: MoLab/ACE-Step consumes body.prompt. The taxonomy-first prompt
    // must therefore replace the actual model prompt, not only rawPrompt metadata.
    prompt: canonicalPrompt,
    rawPrompt: canonicalPrompt,
    creatorPrompt: '',
    creator_prompt: '',
    musicPrompt: '',

    styleInfluence: style.effective,
    style_influence: style.effective,
    sonaraRequestedStyleInfluence: style.requested,
    sonaraEffectiveStyleInfluence: style.effective,
    sonaraTaxonomyLock: TAXONOMY_LOCK_ID,
    sonaraTaxonomyAuthoritative: true,
    sonaraPromptTaxonomyFirst: true,
    sonaraPromptVersion: PROMPT_VERSION,
    sonaraAtmosphereRole: 'emotional-modifier-inside-subgenre',
    sonaraOriginalCreatorBrief: creator,
    sonaraCreatorStylePriority: false,
    promptGenreAuthoritative: true,
    sonaraRealPrompt: true,
    sonaraRealPromptVersion: PROMPT_VERSION
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('x-sonara-musical-dna-lock', TAXONOMY_LOCK_ID);
  headers.set('x-sonara-prompt-version', PROMPT_VERSION);
  headers.set('x-sonara-family', dna.family);
  headers.set('x-sonara-genre', dna.genre);
  headers.set('x-sonara-subgenre', dna.subgenre);
  headers.set('x-sonara-atmosphere', dna.atmosphere);

  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(locked),
    redirect: request.redirect
  });
}

async function decorateHealth(request, response) {
  const url = new URL(request.url);
  if (!response.ok || !['/api/health', '/api/engine/ready', '/api/molab/ready'].includes(url.pathname)) return response;
  try {
    const data = await response.clone().json();
    const headers = new Headers(response.headers);
    headers.set('content-type', 'application/json; charset=UTF-8');
    headers.set('x-sonara-musical-dna-lock', TAXONOMY_LOCK_ID);
    headers.set('x-sonara-prompt-version', PROMPT_VERSION);
    return new Response(JSON.stringify({
      ...data,
      musicalDnaLock: TAXONOMY_LOCK_ID,
      promptVersion: PROMPT_VERSION,
      actualModelPromptTaxonomyFirst: true,
      creatorPromptCannotOverrideTaxonomy: true,
      familyAuthoritative: true,
      genreAuthoritative: true,
      subgenreAuthoritative: true,
      atmosphereScopedToSubgenre: true,
      weirdnessCannotChangeGenre: true,
      styleInfluenceCannotChangeGenre: true,
      styleInfluenceFidelityFloor: 88
    }), { status: response.status, statusText: response.statusText, headers });
  } catch {
    return response;
  }
}

export default {
  async fetch(request, env, ctx) {
    const lockedRequest = await lockMusicTaxonomyRequest(request);
    const response = await runtime.fetch(lockedRequest, env, ctx);
    return decorateHealth(request, response);
  }
};
