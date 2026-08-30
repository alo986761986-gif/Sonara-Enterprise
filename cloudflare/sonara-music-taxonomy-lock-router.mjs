import runtime, { SonaraJobState } from './sonara-molab-xl-router.mjs';

export { SonaraJobState };

const TAXONOMY_LOCK_ID = 'sonara-musical-dna-v1';
const MAX_MASTER_BRIEF_CHARS = 1800;

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

function effectiveStyleInfluence(body = {}) {
  const requested = Math.round(clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100));
  // The control changes how strongly conventions are expressed, never whether the
  // selected genre/subgenre is respected. Map 0..100 to a safe 70..100 fidelity band.
  const effective = 70 + Math.round(requested * 0.30);
  return { requested, effective };
}

function masterTaxonomyBrief(body = {}) {
  const { family, genre, subgenre, atmosphere } = selectedMusicalDna(body);
  return [
    `SONARA MUSICAL DNA LOCK ${TAXONOMY_LOCK_ID}.`,
    `Family: ${family}.`,
    `Genre: ${genre}.`,
    `Subgenre: ${subgenre}.`,
    `Atmosphere: ${atmosphere}.`,
    `${subgenre} is the exact musical identity and must remain unmistakable from the opening bars to the final cadence.`,
    `The hierarchy Family > Genre > Subgenre is authoritative. Never replace ${subgenre} with the parent genre, a neighboring subgenre, generic EDM, generic pop, generic house or another default style.`,
    `Atmosphere is an emotional and production-color modifier INSIDE ${subgenre}; it must never change the genre, groove family, rhythmic grammar, instrumentation identity or cultural style.`,
    'Weirdness may create originality only inside the locked musical DNA. Style Influence controls the amount of authentic stylistic detail, not permission to leave the selected genre.',
    'Any conflicting genre/style wording from personalization, old prompts, defaults or taste preferences is subordinate to this selected musical DNA. Preserve non-conflicting creator instructions for instruments, arrangement, lyrics, vocals, dynamics, transitions and production.',
    'Generate music, not an explanation.'
  ].join(' ').slice(0, MAX_MASTER_BRIEF_CHARS);
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

  const originalCreatorBrief = clean(
    body.rawPrompt || body.creatorPrompt || body.creator_prompt || body.musicPrompt || '',
    ''
  );
  const dna = selectedMusicalDna(body);
  const style = effectiveStyleInfluence(body);
  const locked = {
    ...body,
    genreFamily: dna.family,
    genre_family: dna.family,
    genre: dna.genre,
    subgenre: dna.subgenre,
    mood: dna.atmosphere,
    atmosphere: dna.atmosphere,
    rawPrompt: masterTaxonomyBrief(body),
    creatorPrompt: '',
    creator_prompt: '',
    musicPrompt: '',
    styleInfluence: style.effective,
    style_influence: style.effective,
    sonaraRequestedStyleInfluence: style.requested,
    sonaraEffectiveStyleInfluence: style.effective,
    sonaraTaxonomyLock: TAXONOMY_LOCK_ID,
    sonaraTaxonomyAuthoritative: true,
    sonaraAtmosphereRole: 'emotional-modifier-inside-subgenre',
    sonaraOriginalCreatorBrief: originalCreatorBrief.slice(0, 4600),
    promptGenreAuthoritative: true,
    sonaraRealPrompt: true,
    sonaraRealPromptVersion: TAXONOMY_LOCK_ID
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('x-sonara-musical-dna-lock', TAXONOMY_LOCK_ID);
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
    return new Response(JSON.stringify({
      ...data,
      musicalDnaLock: TAXONOMY_LOCK_ID,
      familyAuthoritative: true,
      genreAuthoritative: true,
      subgenreAuthoritative: true,
      atmosphereScopedToSubgenre: true,
      weirdnessCannotChangeGenre: true,
      styleInfluenceCannotChangeGenre: true,
      styleInfluenceFidelityFloor: 70
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
