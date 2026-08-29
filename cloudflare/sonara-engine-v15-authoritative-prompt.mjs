import engineV9 from './sonara-engine-v9-dual-fast.mjs';

const LOCK_ID = 'v15-authoritative-full-prompt';
const TEMPO_LOCK_ID = 'v15-authoritative-bpm-v3-perceptual';
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
  const creatorPrompt = body?.rawPrompt || body?.creatorPrompt || body?.creator_prompt || body?.musicPrompt || '';
  const creatorBpm = extractPromptBpm(creatorPrompt);
  if (creatorBpm !== null) return creatorBpm;

  const promptBpm = extractPromptBpm(body?.prompt);
  if (body?.promptBpmAuthoritative === true && promptBpm !== null) return promptBpm;

  const candidates = [
    body?.requestedBpm,
    body?.requested_bpm,
    body?.targetBpm,
    body?.target_bpm,
    body?.preferredBpm,
    body?.preferred_bpm,
    body?.bpm,
    body?.tempo
  ];
  for (const candidate of candidates) {
    const bpm = parseBpm(candidate);
    if (bpm !== null) return bpm;
  }

  return promptBpm;
}

function tempoProfile(bpm, body = {}) {
  const styleText = clean(`${body?.rawPrompt || ''} ${body?.creatorPrompt || ''} ${body?.prompt || ''} ${body?.genre || ''} ${body?.subgenre || ''}`).toLowerCase();
  const halfTimeExplicit = /\bhalf[- ]?time\b|\btempo dimezzato\b|\bmetà tempo\b/i.test(styleText);
  const fastBassMusic = /\bjungle\b|\bdrum\s*(?:&|and)\s*bass\b|\bdnb\b|\bbreakcore\b|\bhardcore\b/i.test(styleText);

  if (bpm >= 180) return {
    id: 'extreme-fast',
    label: 'extremely-fast',
    instruction: `EXTREME FULL-TIME MOTION: ${bpm} BPM must sound genuinely extremely fast. Use dense eighth/sixteenth-note rhythmic activity, rapid percussion articulation, frequent phrase movement and energetic transitions. ${halfTimeExplicit ? 'Half-time feel is allowed because the creator explicitly requested it.' : 'Do not fall into half-time perception.'}`
  };
  if (bpm >= 160) return {
    id: 'very-fast',
    label: 'very-fast',
    instruction: `VERY FAST FULL-TIME MOTION: ${bpm} BPM must be perceived at the full requested speed. ${fastBassMusic ? 'For Jungle/Drum & Bass, keep fast breakbeat subdivision, rolling bass motion, rapid hats/percussion and phrase pacing consistent with full-time DnB/Jungle energy.' : 'Keep drums, bass, percussion and phrase pacing moving at the full-time pulse.'} ${halfTimeExplicit ? 'Half-time accents may be used only as a deliberate requested effect.' : `Never reinterpret ${bpm} BPM as ${Math.round(bpm / 2)} BPM.`}`
  };
  if (bpm >= 145) return {
    id: 'fast',
    label: 'fast',
    instruction: `FAST MOTION: preserve an audibly fast groove at ${bpm} BPM with active percussion, bass movement and section pacing. Do not slow the perceived motion through half-time treatment unless explicitly requested.`
  };
  if (bpm >= 130) return {
    id: 'uptempo',
    label: 'uptempo',
    instruction: `UPTEMPO MOTION: keep a clearly energetic full-time pulse at ${bpm} BPM. Rhythmic density and transitions must support the requested speed.`
  };
  if (bpm >= 110) return {
    id: 'mid-fast',
    label: 'mid-fast',
    instruction: `MEDIUM-FAST MOTION: maintain a steady forward-moving groove at ${bpm} BPM without dragging the phrase pacing.`
  };
  if (bpm >= 90) return {
    id: 'medium',
    label: 'medium',
    instruction: `MEDIUM TEMPO MOTION: keep the audible groove, rhythmic phrasing and section pacing anchored to ${bpm} BPM.`
  };
  if (bpm >= 70) return {
    id: 'relaxed',
    label: 'relaxed',
    instruction: `RELAXED TEMPO MOTION: preserve the slower ${bpm} BPM pulse with spacious phrasing and genre-authentic subdivision.`
  };
  return {
    id: 'slow',
    label: 'slow',
    instruction: `SLOW TEMPO MOTION: the track must genuinely feel slow at ${bpm} BPM with long phrase breathing and no artificial double-time acceleration unless requested.`
  };
}

function authoritativePrompt(body) {
  const family = clean(body?.genreFamily || body?.genre_family, 'Music');
  const genre = clean(body?.genre, 'Music');
  const subgenre = clean(body?.subgenre, genre);
  const mood = clean(body?.mood, 'Authentic');
  const original = String(body?.prompt || '').trim();
  const creatorPrompt = clean(body?.rawPrompt || body?.creatorPrompt || body?.creator_prompt || body?.musicPrompt, '');
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

  const profile = bpm === null ? null : tempoProfile(bpm, body);
  const tempoLock = bpm === null
    ? []
    : [
        `SONARA AUTHORITATIVE TEMPO LOCK: exactly ${bpm} BPM.`,
        `Treat ${bpm} BPM as the real master clock, quarter-note pulse and bar-grid tempo for the complete rendered audio.`,
        `Tempo class: ${profile.label}.`,
        profile.instruction,
        `Do not normalize ${bpm} BPM toward a genre average and do not replace it with a nearby conventional tempo.`,
        `The kick, drums, bass, percussion, comping, rhythmic accents, fills, phrase pacing and section transitions must audibly reflect ${bpm} BPM from start to finish.`
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
  const profile = bpm === null ? null : tempoProfile(bpm, body);

  const locked = {
    ...body,
    genreFamily,
    genre,
    subgenre,
    ...(bpm === null ? {} : {
      bpm,
      requestedBpm: bpm,
      targetBpm: bpm,
      preferredBpm: bpm,
      bpmLock: true,
      promptBpmAuthoritative: true,
      sonaraTempoClass: profile.label,
      sonaraPerceptualTempoLock: true
    }),
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
  if (bpm !== null) {
    headers.set('x-sonara-bpm-lock', `exact-${bpm}`);
    headers.set('x-sonara-tempo-class', profile.label);
  }

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
      universalGenreLock: LOCK_ID,
      authoritativePromptLock: LOCK_ID,
      authoritativeTempoLock: TEMPO_LOCK_ID,
      bpmRange: `${BPM_MIN}-${BPM_MAX}`,
      promptGenrePriority: true,
      promptBpmPriority: true,
      perceptualTempoProfile: true,
      noAutomaticHalfTime: true,
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
      houseGenreLock: LOCK_ID,
      technoGenreLock: LOCK_ID,
      electronicGenreLock: LOCK_ID,
      electronicTaxonomyLock: LOCK_ID,
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