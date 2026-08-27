import engineV13 from './sonara-engine-v13-electronic-taxonomy-lock.mjs';

function normalize(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' ')
    .replace(/\//g, ' ')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function isElectronicFamily(body) {
  return normalize(body?.genreFamily || body?.genre_family || '') === 'electronic dance';
}

function vocalTag(body) {
  const mode = normalize(body?.vocalMode || body?.vocal_mode || '');
  const language = String(body?.vocalLanguage || body?.vocal_language || '').trim();
  if (mode === 'instrumental') return 'Strictly instrumental, no sung, spoken, whispered or sampled words.';
  if (mode === 'male') return `Natural male lead vocal${language ? ` in ${language}` : ''}, with phrasing authentic to the selected subgenre.`;
  if (mode === 'female') return `Natural female lead vocal${language ? ` in ${language}` : ''}, with phrasing authentic to the selected subgenre.`;
  if (mode === 'duet') return `Distinct male and female duet${language ? ` in ${language}` : ''}, with phrasing authentic to the selected subgenre.`;
  return '';
}

export function universalCaption(body) {
  const family = String(body?.genreFamily || body?.genre_family || 'Music').trim();
  const genre = String(body?.genre || 'Music').trim();
  const subgenre = String(body?.subgenre || genre).trim();
  const mood = String(body?.mood || 'Authentic').trim();
  const professionalPrompt = String(body?.prompt || '').replace(/\s+/g, ' ').trim();
  const supplied = String(body?.styleCaption || '').replace(/\s+/g, ' ').trim();
  const fallbackIdentity = `${family} > ${genre} > ${subgenre}. Authentic ${subgenre} identity. Atmosphere: ${mood}.`;
  const detailedIdentity = professionalPrompt || supplied || fallbackIdentity;
  const authority = `AUTHORITATIVE STYLE LOCK: ${family} > ${genre} > ${subgenre}. The selected subgenre ${subgenre} is mandatory and must never be replaced by ${genre}, House, Melodic House, generic pop, cinematic underscore or any neighboring style.`;
  const voice = vocalTag(body);
  const opening = `Begin immediately with an unmistakable ${subgenre} instrument, rhythm, motif, vocal phrase or defining texture in bar 1; ${subgenre} identity must be audible by 8 seconds; no empty or generic extended intro.`;
  const fidelity = `Preserve the supplied ${subgenre} instrumentation, rhythm, harmony, phrasing, arrangement, cultural context and production instructions. Every major musical decision must remain recognizably ${subgenre}.`;
  const caption = `${authority} ${detailedIdentity} ${supplied && supplied !== detailedIdentity ? supplied : ''} ${voice} ${opening} ${fidelity}`
    .replace(/\s+/g, ' ')
    .trim();
  return caption.slice(0, 7000);
}

function universalStructureLyrics(body) {
  const lyrics = String(body?.lyrics || '').trim();
  const mode = normalize(body?.vocalMode || body?.vocal_mode || '');
  if (lyrics || mode !== 'instrumental') return lyrics;
  return '[Intro - 2 bars]\n[Main Section - defining style identity]\n[Development]\n[Contrast or Breakdown]\n[Final Main Section]\n[Outro]';
}

export function buildUniversalLockedBody(body = {}) {
  if (isElectronicFamily(body)) return body;
  if (!String(body?.genre || '').trim() || !String(body?.subgenre || '').trim()) return body;

  const requestedStyleInfluence = clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100);
  const requestedWeirdness = clamp(body.weirdness, 50, 0, 100);
  return {
    ...body,
    prompt: universalCaption(body),
    lyrics: universalStructureLyrics(body),
    styleInfluence: requestedStyleInfluence,
    weirdness: requestedWeirdness,
    sonaraGenreLock: 'universal-v14-taxonomy720-authoritative-prompt'
  };
}

async function withUniversalLock(request) {
  let body;
  try { body = await request.clone().json(); } catch { return request; }

  // Preserve all previously validated House/Techno/Electronic locks exactly as they are.
  if (isElectronicFamily(body)) return request;
  const locked = buildUniversalLockedBody(body);
  if (locked === body) return request;

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('x-sonara-genre-lock', 'universal-v14-taxonomy720-authoritative-prompt');
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
      universalGenreLock: 'v14-taxonomy720-authoritative-prompt',
      universalTaxonomyFamilies: 25,
      universalTaxonomyGenres: 86,
      universalTaxonomySubgenres: 720,
      universalAtmosphereAware: true,
      universalIntroIdentitySeconds: 8,
      universalProfessionalPromptPreserved: true,
      universalCreativeControlsPreserved: true,
      universalStyleInfluenceFloor: 0,
      universalWeirdnessCeiling: 100,
      existingElectronicLocksPreserved: true
    }), { status: response.status, headers: response.headers });
  } catch {
    return response;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const lockedRequest = url.pathname === '/api/engine/generate' && request.method === 'POST'
      ? await withUniversalLock(request)
      : request;
    const response = await engineV13.fetch(lockedRequest, env, ctx);
    return decorateHealth(request, response);
  }
};
