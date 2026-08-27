import engineV9 from './sonara-engine-v9-dual-fast.mjs';

const LOCK_ID = 'v15-authoritative-full-prompt';
const MAX_PROMPT_CHARS = 12000;

function clean(value, fallback = '') {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function authoritativePrompt(body) {
  const family = clean(body?.genreFamily || body?.genre_family, 'Music');
  const genre = clean(body?.genre, 'Music');
  const subgenre = clean(body?.subgenre, genre);
  const mood = clean(body?.mood, 'Authentic');
  const original = String(body?.prompt || '').trim();
  const lock = [
    `SONARA AUTHORITATIVE STYLE LOCK: ${family} > ${genre} > ${subgenre}.`,
    `${subgenre} is the exact selected style and is authoritative.`,
    `Do not replace it with ${genre}, a parent genre, a neighboring subgenre, Melodic House, generic EDM or any other default style.`,
    `Preserve the creator's complete instrumentation, rhythm, groove, harmony, melody, arrangement, production and vocal instructions.`,
    `Atmosphere: ${mood}.`
  ].join(' ');

  if (!original) return lock.slice(0, MAX_PROMPT_CHARS);
  return `${lock}\n\n${original}`.slice(0, MAX_PROMPT_CHARS);
}

export async function rewriteGenerationRequest(request) {
  let body;
  try {
    body = await request.clone().json();
  } catch {
    return request;
  }

  const genre = clean(body?.genre, 'Music');
  const subgenre = clean(body?.subgenre, genre);
  const genreFamily = clean(body?.genreFamily || body?.genre_family, 'Music');
  const weirdness = Math.round(clamp(body?.weirdness, 50, 0, 100));
  const styleInfluence = Math.round(clamp(body?.styleInfluence ?? body?.style_influence, 50, 0, 100));

  const locked = {
    ...body,
    genreFamily,
    genre,
    subgenre,
    prompt: authoritativePrompt({ ...body, genreFamily, genre, subgenre }),
    weirdness,
    styleInfluence,
    sonaraGenreLock: LOCK_ID,
    sonaraProfessionalPromptPreserved: true,
    sonaraCreativeControlsPreserved: true
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('x-sonara-genre-lock', LOCK_ID);
  headers.set('x-sonara-professional-prompt', 'preserved');

  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(locked),
    redirect: request.redirect
  });
}

async function decorateHealth(request, response) {
  const url = new URL(request.url);
  if (!(url.pathname === '/' || url.pathname === '/api/health' || url.pathname === '/api/engine/ready')) return response;
  if (!response.ok) return response;

  try {
    const data = await response.clone().json();
    return new Response(JSON.stringify({
      ...data,
      universalGenreLock: 'v15-authoritative-full-prompt',
      authoritativePromptLock: LOCK_ID,
      universalTaxonomyFamilies: 25,
      universalTaxonomyGenres: 86,
      universalTaxonomySubgenres: 720,
      universalAtmosphereAware: true,
      universalIntroIdentitySeconds: 8,
      professionalPromptPreserved: true,
      creativeControlsPreserved: true,
      selectedSubgenreAuthoritative: true,
      legacyCaption500Bypassed: true,
      houseGenreLock: 'v15-authoritative-full-prompt',
      technoGenreLock: 'v15-authoritative-full-prompt',
      electronicGenreLock: 'v15-authoritative-full-prompt',
      electronicTaxonomyLock: 'v15-authoritative-full-prompt',
      existingElectronicLocksPreserved: false
    }), { status: response.status, headers: response.headers });
  } catch {
    return response;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const lockedRequest = url.pathname === '/api/engine/generate' && request.method === 'POST'
      ? await rewriteGenerationRequest(request)
      : request;
    const response = await engineV9.fetch(lockedRequest, env, ctx);
    return decorateHealth(request, response);
  }
};
