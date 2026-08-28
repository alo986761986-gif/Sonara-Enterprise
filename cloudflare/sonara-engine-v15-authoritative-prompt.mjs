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

function tempoContract(value) {
  const bpm = Math.round(clamp(value, 124, 30, 300));
  if (bpm >= 150) {
    return `SONARA TEMPO LOCK — HARD REQUIREMENT: perform at exactly ${bpm} BPM with an unmistakably fast perceived pulse. Do NOT reinterpret ${bpm} BPM as half-time, do NOT make the groove feel like ${Math.round(bpm / 2)} BPM, and do NOT slow the arrangement with sparse half-time drums. The drum cadence, bass phrasing, rhythmic subdivisions, melodic movement, transitions and overall energy must audibly communicate the full ${bpm} BPM pulse from the opening bars through the ending. Preserve genre authenticity while keeping the requested high-speed tempo clearly perceptible.`;
  }
  if (bpm >= 130) {
    return `SONARA TEMPO LOCK — HARD REQUIREMENT: perform at exactly ${bpm} BPM. Keep the perceived pulse energetic and clearly aligned to ${bpm} BPM; do not use a half-time reinterpretation that makes the track sound substantially slower. Drums, bass and rhythmic movement must reinforce the selected BPM throughout the arrangement.`;
  }
  if (bpm <= 75) {
    return `SONARA TEMPO LOCK — HARD REQUIREMENT: perform at exactly ${bpm} BPM. Do not disguise the requested slow pulse with a double-time reinterpretation. Rhythmic phrasing must preserve the selected ${bpm} BPM feel.`;
  }
  return `SONARA TEMPO LOCK — HARD REQUIREMENT: perform at exactly ${bpm} BPM. The perceived musical pulse must match the selected BPM and must not drift, halve or double during generation.`;
}

function authoritativePrompt(body) {
  const family = clean(body?.genreFamily || body?.genre_family, 'Music');
  const genre = clean(body?.genre, 'Music');
  const subgenre = clean(body?.subgenre, genre);
  const mood = clean(body?.mood, 'Authentic');
  const bpm = Math.round(clamp(body?.bpm, 124, 30, 300));
  const original = String(body?.prompt || '').trim();
  const lock = [
    `SONARA AUTHORITATIVE STYLE LOCK: ${family} > ${genre} > ${subgenre}.`,
    `${subgenre} is the exact selected style and is authoritative.`,
    `Do not replace it with ${genre}, a parent genre, a neighboring subgenre, Melodic House, generic EDM or any other default style.`,
    tempoContract(bpm),
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
  const bpm = Math.round(clamp(body?.bpm, 124, 30, 300));
  const weirdness = Math.round(clamp(body?.weirdness, 50, 0, 100));
  const styleInfluence = Math.round(clamp(body?.styleInfluence ?? body?.style_influence, 50, 0, 100));

  const locked = {
    ...body,
    genreFamily,
    genre,
    subgenre,
    bpm,
    prompt: authoritativePrompt({ ...body, genreFamily, genre, subgenre, bpm }),
    weirdness,
    styleInfluence,
    sonaraGenreLock: LOCK_ID,
    sonaraTempoLock: `exact-${bpm}-bpm-no-half-time`,
    sonaraProfessionalPromptPreserved: true,
    sonaraCreativeControlsPreserved: true
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('x-sonara-genre-lock', LOCK_ID);
  headers.set('x-sonara-tempo-lock', `exact-${bpm}-bpm`);
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
      authoritativeTempoLock: true,
      bpmRange: [30, 300],
      antiHalfTimeTempoLock: true,
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
