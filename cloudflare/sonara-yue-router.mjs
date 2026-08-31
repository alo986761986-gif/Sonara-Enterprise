import molabRuntime, { SonaraJobState } from './sonara-molab-xl-router.mjs';

export { SonaraJobState };

const VERSION = 'sonara-yue-v10.4-dual-fidelity-routing';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/yue-v104/';
const CACHE_TTL = 12 * 60 * 60;
const QUERY_TIMEOUT = 12_000;
const SUBMIT_TIMEOUT = 45_000;

const cleanUrl = value => String(value || '').trim().replace(/\/$/, '');
const yueUrl = env => cleanUrl(env.SONARA_YUE_WORKER_URL || env.YUE_WORKER_URL || '');

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set(['https://sonaraenterprise.com', 'https://www.sonaraenterprise.com', PUBLIC_API_ORIGIN]);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge,X-Sonara-Real-Prompt,X-Sonara-Requested-Bpm',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-YuE-Profile,X-Sonara-YuE-Worker',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-yue-profile': VERSION,
      ...cors(request)
    }
  });
}

function authHeaders(env, extra = {}) {
  const out = { ...extra };
  const key = String(env.SONARA_YUE_API_KEY || '').trim();
  if (key) {
    out.Authorization = `Bearer ${key}`;
    out['X-API-Key'] = key;
  }
  return out;
}

function authorized(request, env) {
  const required = String(env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  return !required || String(request.headers.get('X-Sonara-Internal-Secret') || '').trim() === required;
}

function clamp(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function text(value, fallback = '') {
  const out = String(value ?? '').trim();
  return out || fallback;
}

function requestedDuration(body = {}) {
  return Math.round(clamp(body.durationSec ?? body.duration, 180, 30, 480));
}

function requestedProfile(body = {}) {
  const raw = text(body.qualityProfile || body.generationProfile || body.yueProfile, 'fast').toLowerCase();
  return raw === 'quality' ? 'quality' : 'fast';
}

function requestedCandidates(body = {}) {
  const profile = requestedProfile(body);
  if (profile === 'quality') return 1;
  return Math.round(clamp(body.candidateCount ?? body.candidate_count, 2, 1, 2));
}

function shouldUseYue(body = {}) {
  if (body.forceAceStep === true || body.provider === 'molab' || body.engineProvider === 'molab') return false;
  if (body.forceYue === true || body.provider === 'yue' || body.engineProvider === 'yue') return true;
  const lyrics = text(body.lyrics);
  const vocalMode = text(body.vocalMode || body.vocal_mode).toLowerCase();
  const instrumental = /instrumental|senza voce|no vocals/.test(vocalMode) && !lyrics;
  return !instrumental && Boolean(lyrics) && requestedDuration(body) >= 60;
}

function creatorPrompt(body = {}) {
  return text(
    body.sonaraCreatorPromptAuthoritative ||
    body.sonaraOriginalCreatorBrief ||
    body.rawPrompt ||
    body.creatorPrompt ||
    body.creator_prompt ||
    body.musicPrompt ||
    body.prompt
  ).slice(0, 2400);
}

function buildYuePayload(body = {}) {
  const profile = requestedProfile(body);
  const quality = profile === 'quality';
  const genre = [
    body.sonaraSelectedFamily || body.genreFamily || body.genre_family,
    body.sonaraSelectedGenre || body.genre,
    body.sonaraSelectedSubgenre || body.subgenre,
    body.sonaraSelectedMood || body.mood || body.atmosphere
  ].filter(Boolean).map(String).join(', ');

  return {
    prompt: creatorPrompt(body),
    creator_prompt: creatorPrompt(body),
    raw_prompt: creatorPrompt(body),
    sonara_creator_prompt: creatorPrompt(body),
    genre: genre || text(body.genre, 'Music'),
    genre_family: text(body.genreFamily || body.genre_family),
    subgenre: text(body.subgenre),
    mood: text(body.mood || body.atmosphere),
    lyrics: text(body.lyrics),
    language: text(body.language || body.vocalLanguage || body.lyricsLanguage || body.lyrics_language, 'auto'),
    vocal_mode: text(body.vocalMode || body.vocal_mode, body.lyrics ? 'vocal' : 'instrumental'),
    bpm: Math.round(clamp(body.bpm ?? body.requestedBpm, 124, 40, 220)),
    key: text(body.key || body.key_scale),
    duration_sec: requestedDuration(body),
    candidate_count: requestedCandidates(body),
    qualityProfile: profile,
    generationProfile: profile,
    yueProfile: profile,
    seed: Math.max(1, Number(body.seed) > 0 ? Math.floor(Number(body.seed)) : Math.floor(Date.now() % 2_000_000_000)),
    weirdness: Math.round(clamp(body.weirdness, 50, 0, 100)),
    style_influence: Math.round(clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100)),
    stage2_batch_size: 16,
    max_new_tokens: Math.round(clamp(body.max_new_tokens, quality ? 3000 : 3200, 1200, 6000)),
    repetition_penalty: Number(clamp(body.repetition_penalty, 1.1, 1.0, 1.3).toFixed(2)),
    sonara_contract: {
      taxonomy: [body.genreFamily || body.genre_family, body.genre, body.subgenre].filter(Boolean).join(' > '),
      exact_bpm: body.sonaraExactRequestedBpm ?? body.requestedBpm ?? body.bpm,
      duration_sec: requestedDuration(body),
      candidate_count: requestedCandidates(body),
      profile,
      creator_prompt: creatorPrompt(body),
      clean_prompt_v4: body.sonaraCleanPromptV4 === true
    }
  };
}

const cacheUrl = jobId => `${CACHE_PREFIX}${encodeURIComponent(jobId)}`;

function stateStub(env, jobId) {
  try { return env?.SONARA_JOB_STATE ? env.SONARA_JOB_STATE.get(env.SONARA_JOB_STATE.idFromName(jobId)) : null; }
  catch { return null; }
}

async function saveState(env, jobId, state) {
  const stub = stateStub(env, jobId);
  if (stub) {
    const response = await stub.fetch('https://sonara.internal/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state)
    });
    if (!response.ok) throw new Error(`SONARA state HTTP ${response.status}`);
  }
  await caches.default.put(
    new Request(cacheUrl(jobId)),
    new Response(JSON.stringify(state), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL}` }
    })
  ).catch(() => undefined);
}

async function loadState(env, jobId) {
  const stub = stateStub(env, jobId);
  if (stub) {
    try {
      const response = await stub.fetch('https://sonara.internal/state');
      if (response.ok) return await response.json();
    } catch {}
  }
  try {
    const response = await caches.default.match(new Request(cacheUrl(jobId)));
    return response ? await response.json() : null;
  } catch { return null; }
}

async function submit(baseUrl, env, payload) {
  const response = await fetch(`${baseUrl}/release_task`, {
    method: 'POST',
    headers: authHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT)
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`YuE: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
    throw new Error(String(data?.error?.message || data?.error || data?.message || `YuE HTTP ${response.status}`));
  }
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error('YuE: task_id mancante.');
  return String(taskId);
}

async function query(baseUrl, env, taskId) {
  const response = await fetch(`${baseUrl}/query_result`, {
    method: 'POST',
    headers: authHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({ task_id_list: [taskId] }),
    signal: AbortSignal.timeout(QUERY_TIMEOUT)
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`YuE query: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
    throw new Error(String(data?.error?.message || data?.error || data?.message || `YuE query HTTP ${response.status}`));
  }
  return data?.data?.[0] || null;
}

function taskStatus(task) {
  const raw = task?.status;
  if (typeof raw === 'number') return raw;
  const status = String(raw ?? '').toLowerCase().trim();
  if (['1', 'success', 'succeeded', 'completed', 'complete', 'done', 'finished'].includes(status)) return 1;
  if (['2', '-1', 'failed', 'error', 'cancelled', 'canceled'].includes(status)) return 2;
  return 0;
}

function resultItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch { return []; }
  }
  return value && typeof value === 'object' ? [value] : [];
}

function refsFrom(task) {
  const refs = [];
  const seen = new Set();
  const visit = value => {
    if (!value) return;
    if (typeof value === 'string') {
      if (value.startsWith('/') && !seen.has(value)) {
        seen.add(value);
        refs.push(value);
      }
      return;
    }
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value === 'object') {
      for (const key of ['file', 'url', 'audio_path', 'audio_file', 'path', 'output', 'outputs', 'audio', 'audios', 'wave']) {
        if (key in value) visit(value[key]);
      }
    }
  };
  resultItems(task?.result).forEach(visit);
  return refs;
}

function publicAudioUrl(path) {
  return `${PUBLIC_API_ORIGIN}/api/yue/audio?path=${encodeURIComponent(path)}`;
}

function candidatesFromRefs(refs) {
  return refs.slice(0, 2).map((path, index) => ({
    id: index === 0 ? 'A' : 'B',
    audioUrl: publicAudioUrl(path),
    audioFormat: 'wav',
    provider: 'yue',
    model: 'YuE-s1-7B + YuE-s2-1B',
    strategy: index === 0 ? 'yue-dual-fidelity-primary' : 'yue-dual-fidelity-variation'
  }));
}

function estimatedProgress(state, task) {
  const reported = Math.round(clamp(task?.progress, 5, 1, 98));
  const createdAt = Number(state?.createdAt || Date.now());
  const elapsedMs = Math.max(0, Date.now() - createdAt);
  const durationSec = Math.max(30, Number(state?.payload?.duration_sec || 180));
  const profile = text(state?.payload?.qualityProfile, 'fast');
  const expectedMs = profile === 'quality'
    ? Math.max(120_000, durationSec * 1100)
    : Math.max(60_000, durationSec * 900);
  const estimated = Math.min(92, 8 + Math.floor((elapsedMs / expectedMs) * 84));
  return Math.max(reported, estimated);
}

async function startYue(request, env) {
  if (!authorized(request, env)) return json(request, { error: 'Unauthorized SONARA generation proxy.' }, 401);
  const baseUrl = yueUrl(env);
  if (!baseUrl) return null;

  let body;
  try { body = await request.clone().json(); }
  catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }

  if (!shouldUseYue(body)) return null;

  const payload = buildYuePayload(body);
  const jobId = `yue_${crypto.randomUUID()}`;
  const taskId = await submit(baseUrl, env, payload);
  const now = Date.now();
  await saveState(env, jobId, { createdAt: now, updatedAt: now, baseUrl, taskId, payload });

  return json(request, {
    jobId,
    status: 'PROCESSING',
    progress: 3,
    retryable: true,
    audioUrl: null,
    audioUrls: [],
    candidates: [],
    metadata: {
      engine: 'SONARA YuE RTX PRO 6000 Full Song',
      provider: 'yue',
      speedProfile: VERSION,
      generationProfile: payload.qualityProfile,
      candidateCount: payload.candidate_count,
      requestedDurationSec: payload.duration_sec,
      promptMode: 'creator-first',
      currentStage: payload.qualityProfile === 'quality' ? 'YuE QUALITY resident job avviato' : 'YuE V10.4 Dual Fidelity avviato'
    }
  });
}

async function pollYue(request, env, ctx, jobId) {
  const state = await loadState(env, jobId);
  if (!state?.taskId || !state?.baseUrl) return molabRuntime.fetch(request, env, ctx);

  try {
    const task = await query(state.baseUrl, env, state.taskId);
    const status = taskStatus(task);
    const expected = Math.max(1, Number(state?.payload?.candidate_count || 1));
    const refs = refsFrom(task).slice(0, expected);
    const candidates = candidatesFromRefs(refs);

    if (status === 1) {
      if (refs.length < expected) {
        throw new Error(`YuE completato con ${refs.length}/${expected} brani finali.`);
      }
      return json(request, {
        jobId,
        status: 'COMPLETED',
        progress: 100,
        audioUrl: candidates[0].audioUrl,
        audioUrls: candidates.map(item => item.audioUrl),
        candidates,
        metadata: {
          engine: 'SONARA YuE RTX PRO 6000 Full Song',
          provider: 'yue',
          speedProfile: VERSION,
          generationProfile: state?.payload?.qualityProfile || 'fast',
          readyCount: candidates.length,
          candidateCount: expected,
          requestedDurationSec: state?.payload?.duration_sec,
          outputDurationSec: task?.output_duration_sec,
          durationRepair: task?.duration_repair,
          elapsedSec: task?.elapsed_sec,
          measuredBpm: task?.measured_bpm,
          qualityScore: task?.quality_score,
          qualityGatePass: task?.quality_gate_pass,
          resident: task?.resident === true,
          fidelityProfile: task?.fidelity_profile,
          currentStage: expected === 2 ? '2 brani YuE V10.4 pronti' : 'Brano YuE pronto'
        }
      });
    }

    if (status === 2) {
      throw new Error(String(task?.error || task?.message || 'Generazione YuE fallita.'));
    }

    const progress = estimatedProgress(state, task);
    const elapsedSec = Math.max(0, Math.floor((Date.now() - Number(state?.createdAt || Date.now())) / 1000));
    const stage = text(task?.stage || task?.progress_text, refs.length ? 'Brano A pronto · YuE sta completando il Brano B' : `YuE sta generando il brano A (${elapsedSec}s)`);
    state.updatedAt = Date.now();
    await saveState(env, jobId, state);
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress,
      retryable: true,
      audioUrl: candidates[0]?.audioUrl || null,
      audioUrls: candidates.map(item => item.audioUrl),
      candidates,
      metadata: {
        engine: 'SONARA YuE RTX PRO 6000 Full Song',
        provider: 'yue',
        speedProfile: VERSION,
        generationProfile: state?.payload?.qualityProfile || 'fast',
        readyCount: candidates.length,
        candidateCount: expected,
        requestedDurationSec: state?.payload?.duration_sec,
        outputDurationSec: task?.output_duration_sec,
        promptMode: 'creator-first',
        currentStage: stage,
        elapsedSec
      }
    });
  } catch (error) {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      retryable: true,
      error: error instanceof Error ? error.message : String(error),
      metadata: { provider: 'yue', fallbackAvailable: true }
    }, 502);
  }
}

async function proxyAudio(request, env) {
  const baseUrl = yueUrl(env);
  if (!baseUrl) return json(request, { error: 'YuE worker non configurato.' }, 503);
  const url = new URL(request.url);
  const path = text(url.searchParams.get('path'));
  if (!path) return json(request, { error: 'Audio path mancante.' }, 400);

  const target = new URL('/v1/audio', `${baseUrl}/`);
  target.searchParams.set('path', path);
  const headers = authHeaders(env);
  const range = request.headers.get('Range');
  if (range) headers.Range = range;
  const upstream = await fetch(target.toString(), {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers
  });
  const out = new Headers(upstream.headers);
  Object.entries(cors(request)).forEach(([key, value]) => out.set(key, value));
  out.set('x-sonara-yue-profile', VERSION);
  out.set('x-sonara-yue-worker', baseUrl);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out
  });
}

function withHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-yue-profile', VERSION);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });

    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/api/yue/audio') {
      return proxyAudio(request, env);
    }

    const jobMatch = url.pathname.match(/^\/api\/music\/job\/(yue_[^/]+)$/);
    if (request.method === 'GET' && jobMatch) {
      return pollYue(request, env, ctx, decodeURIComponent(jobMatch[1]));
    }

    if (request.method === 'POST' && url.pathname === '/api/engine/generate' && yueUrl(env)) {
      try {
        const response = await startYue(request, env);
        if (response) return response;
      } catch {}
    }

    return withHeaders(await molabRuntime.fetch(request, env, ctx));
  }
};
