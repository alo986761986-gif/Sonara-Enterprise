import engineV9 from './sonara-engine-v9-dual-fast.mjs';

const LOCK_ID = 'v15-authoritative-ui-taxonomy-v4';
const TEMPO_LOCK_ID = 'v15-authoritative-bpm-v4-ui';
const MAX_PROMPT_CHARS = 1100;
const MAX_CREATOR_BRIEF_CHARS = 680;
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
  // UI/structured controls are authoritative. Free-text tempo is only a fallback
  // when no structured tempo was supplied at all.
  const candidates = [
    body?.bpm,
    body?.requestedBpm,
    body?.requested_bpm,
    body?.targetBpm,
    body?.target_bpm,
    body?.preferredBpm,
    body?.preferred_bpm,
    body?.tempo
  ];
  for (const candidate of candidates) {
    const bpm = parseBpm(candidate);
    if (bpm !== null) return bpm;
  }

  const creatorPrompt = body?.rawPrompt || body?.creatorPrompt || body?.creator_prompt || body?.musicPrompt || '';
  return extractPromptBpm(creatorPrompt) ?? extractPromptBpm(body?.prompt);
}

function tempoProfile(bpm, body = {}) {
  const styleText = clean(`${body?.rawPrompt || ''} ${body?.creatorPrompt || ''} ${body?.prompt || ''} ${body?.genre || ''} ${body?.subgenre || ''}`).toLowerCase();
  const halfTimeExplicit = /\bhalf[- ]?time\b|\btempo dimezzato\b|\bmetà tempo\b/i.test(styleText);
  const fastBassMusic = /\bjungle\b|\bdrum\s*(?:&|and)\s*bass\b|\bdnb\b|\bbreakcore\b|\bhardcore\b/i.test(styleText);

  if (bpm >= 180) return {
    id: 'extreme-fast',
    label: 'extremely-fast',
    instruction: `Full-time ${bpm} BPM motion; dense fast rhythmic activity.${halfTimeExplicit ? ' Half-time accents only as an explicit effect.' : ' Do not reinterpret it as half-time.'}`
  };
  if (bpm >= 160) return {
    id: 'very-fast',
    label: 'very-fast',
    instruction: `${bpm} BPM must feel genuinely full-time.${fastBassMusic ? ' Preserve rapid breakbeat/percussion and rolling bass motion.' : ' Keep drums, bass and phrase pacing at full-time speed.'}`
  };
  if (bpm >= 145) return { id: 'fast', label: 'fast', instruction: `Keep an audibly fast full-time groove at ${bpm} BPM.` };
  if (bpm >= 130) return { id: 'uptempo', label: 'uptempo', instruction: `Keep a clearly energetic full-time pulse at ${bpm} BPM.` };
  if (bpm >= 110) return { id: 'mid-fast', label: 'mid-fast', instruction: `Keep a steady forward-moving groove at ${bpm} BPM.` };
  if (bpm >= 90) return { id: 'medium', label: 'medium', instruction: `Anchor groove and phrasing to ${bpm} BPM.` };
  if (bpm >= 70) return { id: 'relaxed', label: 'relaxed', instruction: `Preserve the slower ${bpm} BPM pulse with genre-authentic subdivision.` };
  return { id: 'slow', label: 'slow', instruction: `The track must genuinely feel slow at ${bpm} BPM.` };
}

function extractCreatorBrief(body = {}) {
  const direct = clean(body?.rawPrompt || body?.creatorPrompt || body?.creator_prompt || body?.musicPrompt, '');
  if (direct) return direct.slice(0, MAX_CREATOR_BRIEF_CHARS);

  const prompt = String(body?.prompt || '').trim();
  const match = prompt.match(/CREATOR BRIEF[^:]*:\s*<<<\s*([\s\S]*?)\s*>>>/i);
  if (match?.[1]) return clean(match[1]).slice(0, MAX_CREATOR_BRIEF_CHARS);
  return clean(prompt).slice(0, MAX_CREATOR_BRIEF_CHARS);
}

function authoritativePrompt(body) {
  const family = clean(body?.genreFamily || body?.genre_family, 'Music');
  const genre = clean(body?.genre, 'Music');
  const subgenre = clean(body?.subgenre, genre);
  const mood = clean(body?.mood, 'Authentic');
  const key = clean(body?.key || body?.key_scale, 'as selected');
  const duration = Math.round(clamp(body?.durationSec ?? body?.duration, 30, 30, 480));
  const weirdness = Math.round(clamp(body?.weirdness, 50, 0, 100));
  const styleInfluence = Math.round(clamp(body?.styleInfluence ?? body?.style_influence, 50, 0, 100));
  const bpm = resolveBpm(body);
  const creatorBrief = extractCreatorBrief(body);
  const tempo = bpm === null ? '' : `${bpm} BPM exact; ${tempoProfile(bpm, body).instruction}`;

  const compact = [
    `STYLE LOCK: ${family} > ${genre} > ${subgenre}.`,
    `ATMOSPHERE LOCK: ${mood}.`,
    `The UI-selected family, genre, subgenre and atmosphere are mandatory and override any conflicting genre/style labels in free text. Stay unmistakably ${subgenre}; no neighboring-genre drift.`,
    tempo,
    `Key ${key}; duration about ${duration}s.`,
    `Style fidelity ${styleInfluence}/100; weirdness ${weirdness}/100 may change details only INSIDE ${subgenre}.`,
    creatorBrief ? `CREATOR BRIEF INSIDE THESE LOCKS: ${creatorBrief}` : ''
  ].filter(Boolean).join(' ');

  return compact.slice(0, MAX_PROMPT_CHARS);
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
  const mood = clean(body?.mood, 'Authentic');
  const weirdness = Math.round(clamp(body?.weirdness, 50, 0, 100));
  const styleInfluence = Math.round(clamp(body?.styleInfluence ?? body?.style_influence, 50, 0, 100));
  const bpm = resolveBpm(body);
  const profile = bpm === null ? null : tempoProfile(bpm, body);

  const locked = {
    ...body,
    genreFamily,
    genre,
    subgenre,
    mood,
    ...(bpm === null ? {} : {
      bpm,
      requestedBpm: bpm,
      targetBpm: bpm,
      preferredBpm: bpm,
      bpmLock: true,
      promptBpmAuthoritative: false,
      sonaraTempoClass: profile.label,
      sonaraPerceptualTempoLock: true
    }),
    prompt: authoritativePrompt({ ...body, genreFamily, genre, subgenre, mood, ...(bpm === null ? {} : { bpm, requestedBpm: bpm }) }),
    weirdness,
    styleInfluence,
    sonaraGenreLock: LOCK_ID,
    sonaraTempoLock: bpm === null ? undefined : TEMPO_LOCK_ID,
    sonaraCreatorStylePriority: false,
    sonaraUiTaxonomyAuthoritative: true,
    sonaraAtmosphereAuthoritative: true,
    sonaraProfessionalPromptPreserved: true,
    sonaraCreativeControlsPreserved: true,
    sonaraDitCaptionOptimized: true
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('x-sonara-genre-lock', LOCK_ID);
  headers.set('x-sonara-ui-taxonomy', 'authoritative');
  headers.set('x-sonara-atmosphere-lock', mood);
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
      promptGenrePriority: false,
      promptBpmPriority: false,
      uiTaxonomyAuthoritative: true,
      selectedFamilyAuthoritative: true,
      selectedGenreAuthoritative: true,
      selectedSubgenreAuthoritative: true,
      selectedAtmosphereAuthoritative: true,
      ditCaptionOptimizedFor256Tokens: true,
      perceptualTempoProfile: true,
      noAutomaticHalfTime: true,
      universalTaxonomyFamilies: 25,
      universalTaxonomyGenres: 86,
      universalTaxonomySubgenres: 720,
      universalAtmosphereAware: true,
      professionalPromptPreserved: true,
      creativeControlsPreserved: true,
      creatorPromptStyleAuthoritative: false,
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