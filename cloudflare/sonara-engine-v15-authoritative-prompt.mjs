import engineV9 from './sonara-engine-v9-dual-fast.mjs';

const LOCK_ID = 'v15-authoritative-full-prompt';
const TEMPO_LOCK_ID = 'v15-authoritative-bpm-v2';
const MAX_PROMPT_CHARS = 12000;
const BPM_MIN = 40;
const BPM_MAX = 220;

function clean(value, fallback = '') {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function parseBpm(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, numeric)));
  const match = String(value ?? '').match(/\b(\d{2,3})\s*(?:bpm)?\b/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, parsed))) : null;
}

function extractPromptBpm(value) {
  const prompt = String(value ?? '').trim();
  if (!prompt) return null;
  const explicit = prompt.match(/\b(?:at|a|@|tempo[:\s]*)?\s*(\d{2,3})\s*bpm\b/i)
    || prompt.match(/\bbpm\s*[:=]?\s*(\d{2,3})\b/i);
  return explicit ? parseBpm(explicit[1]) : null;
}

function resolveBpm(body = {}) {
  const creatorPrompt = body?.rawPrompt || body?.creatorPrompt || body?.creator_prompt || '';
  const creatorBpm = extractPromptBpm(creatorPrompt);
  if (creatorBpm !== null) return creatorBpm;

  const promptBpm = extractPromptBpm(body?.prompt);
  if (body?.promptBpmAuthoritative === true && promptBpm !== null) return promptBpm;

  const candidates = [
    body?.requestedBpm,
    body?.requested_bpm,
    body?.bpm,
    body?.tempo,
    body?.targetBpm,
    body?.target_bpm,
    body?.preferredBpm,
    body?.preferred_bpm
  ];
  for (const candidate of candidates) {
    const bpm = parseBpm(candidate);
    if (bpm !== null) return bpm;
  }

  return promptBpm;
}

function authoritativePrompt(body) {
  const family = clean(body?.genreFamily || body?.genre_family, 'Music');
  const genre = clean(body?.genre, 'Music');
  const subgenre = clean(body?.subgenre, genre);
  const mood = clean(body?.mood, 'Authentic');
  const original = String(body?.prompt || '').trim();
  const creatorPrompt = clean(body?.rawPrompt || body?.creatorPrompt || body?.creator_prompt, '');
  const creatorStylePriority = Boolean(
    creatorPrompt
    || body?.promptGenreAuthoritative === true
    || body?.sonaraRealPrompt === true
    || String(body?.sonaraRealPromptVersion || '').includes('prompt-genre')
  );
  const bpm = resolveBpm(body);

  const styleLock = creatorStylePriority
    ? [
        `SONARA AUTHORITATIVE STYLE LOCK: creator free-text genre/style has priority; UI fallback taxonomy is ${family} > ${genre} > ${subgenre}.`,
        `If the creator explicitly names a genre, subgenre or musical style in the prompt, that wording is authoritative and overrides conflicting UI defaults, parent genres, neighboring subgenres, Melodic House, generic EDM or any other fallback style.`,
        `Use ${family} > ${genre} > ${subgenre} only for details the creator did not specify.`,
        `Preserve the creator's complete instrumentation, rhythm, groove, harmony, melody, arrangement, production and vocal instructions.`,
        `Atmosphere: ${mood}.`
      ]
    : [
        `SONARA AUTHORITATIVE STYLE LOCK: ${family} > ${genre} > ${subgenre}.`,
        `${subgenre} is the exact selected style and is authoritative.`,
        `Do not replace it with ${genre}, a parent genre, a neighboring subgenre, Melodic House, generic EDM or any other default style.`,
        `Preserve the creator's complete instrumentation, rhythm, groove, harmony, melody, arrangement, production and vocal instructions.`,
        `Atmosphere: ${mood}.`
      ];

  const tempoLock = bpm === null
    ? []
    : [
        `SONARA AUTHORITATIVE TEMPO LOCK: exactly ${bpm} BPM.`,
        `Treat ${bpm} BPM as the real master clock, quarter-note pulse and bar-grid tempo for the complete rendered audio.`,
        `Do not halve, double, normalize, reinterpret or replace ${bpm} BPM with a default tempo or a stylistic average.`,
        `The kick, drums, bass, percussion, comping, rhythmic accents, fills, phrase pacing and section transitions must audibly move at ${bpm} BPM from start to finish.`,
        `For fast requests such as 170 BPM, preserve the requested fast musical motion rather than producing an 85 BPM half-time feel unless the creator explicitly asks for half-time.`
      ];

  const lock = [...styleLock, ...tempoLock].join(' ');
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
  const bpm = resolveBpm(body);

  const locked = {
    ...body,
    genreFamily,
    genre,
    subgenre,
    ...(bpm === null ? {} : { bpm, requestedBpm: bpm, bpmLock: true }),
    prompt: authoritativePrompt({ ...body, genreFamily, genre, subgenre, ...(bpm === null ? {} : { bpm, requestedBpm: bpm }) }),
    weirdness,
    styleInfluence,
    sonaraGenreLock: LOCK_ID,
    sonaraTempoLock: bpm === null ? undefined : TEMPO_LOCK_ID,
    sonaraCreatorStylePriority: Boolean(body?.rawPrompt || body?.promptGenreAuthoritative === true || body?.sonaraRealPrompt === true),
    sonaraProfessionalPromptPreserved: true,
    sonaraCreativeControlsPreserved: true
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('x-sonara-genre-lock', LOCK_ID);
  headers.set('x-sonara-professional-prompt', 'preserved');
  if (bpm !== null) headers.set('x-sonara-bpm-lock', `exact-${bpm}`);

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
      authoritativeTempoLock: TEMPO_LOCK_ID,
      bpmRange: `${BPM_MIN}-${BPM_MAX}`,
      promptGenrePriority: true,
      promptBpmPriority: true,
      universalTaxonomyFamilies: 25,
      universalTaxonomyGenres: 86,
      universalTaxonomySubgenres: 720,
      universalAtmosphereAware: true,
      universalIntroIdentitySeconds: 8,
      professionalPromptPreserved: true,
      creativeControlsPreserved: true,
      selectedSubgenreAuthoritative: true,
      creatorPromptStyleAuthoritative: true,
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
