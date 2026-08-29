import instantRuntime from './sonara-instant-speed-router.mjs';
import { buildStudioPayload } from './sonara-engine-v16-studio-quality.mjs';
import { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';
export { SonaraJobState } from './sonara-instant-speed-router.mjs';

const VERSION = 'sonara-blackwell-batch2-v1';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/blackwell-v1/';
const CACHE_TTL = 3 * 60 * 60;
const QUERY_TIMEOUT = 8_000;
const SUBMIT_TIMEOUT = 45_000;

const cleanUrl = value => String(value || '').trim().replace(/\/$/, '');
const blackwellUrl = env => cleanUrl(env.SONARA_BLACKWELL_WORKER_URL || env.ACESTEP_BLACKWELL_URL || '');

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set(['https://sonaraenterprise.com', 'https://www.sonaraenterprise.com', PUBLIC_API_ORIGIN]);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge,X-Sonara-Real-Prompt',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Blackwell-Profile',
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
      'x-sonara-blackwell-profile': VERSION,
      ...cors(request)
    }
  });
}

function authHeaders(env, extra = {}) {
  const out = { ...extra };
  const key = String(env.SONARA_BLACKWELL_API_KEY || env.ACE_STEP_API_KEY || env.ACESTEP_API_KEY || '').trim();
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

function blackwellPayload(body) {
  const seed = Math.max(1, Number(body?.seed) > 0 ? Number(body.seed) : Math.floor(Date.now() % 2_000_000_000));
  const base = buildStudioPayload(body, 'structure', seed + 104729);
  const weirdness = Math.round(clamp(body.weirdness, 50, 0, 100));
  const styleInfluence = Math.round(clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100));
  const locks = [
    body.sonaraStudioMaxHookContract,
    body.sonaraStudioMaxVocalContract,
    body.sonaraStudioMaxContinuityContract,
    body.sonaraStudioMaxArrangementContract,
    body.sonaraStudioMaxProductionContract
  ].filter(Boolean).join(' ');

  const prompt = `${String(base.prompt || body.prompt || '')}\n\nSONARA BLACKWELL INSTANT BATCH-2. Generate two clearly distinct professional candidates in one GPU batch. Preserve exact BPM, duration, key, lyrics, language, genre and subgenre. ${locks} Weirdness=${weirdness}/100. Style Influence=${styleInfluence}/100. Candidate 1 prioritizes hook, groove and immediate structure. Candidate 2 preserves creator locks but uses a clearly different melody, voicing, transition language and timbral balance. Render audio immediately.`.slice(0, 12000);

  const payload = {
    ...base,
    model: 'acestep-v15-xl-turbo',
    prompt,
    inference_steps: 4,
    batch_size: 2,
    thinking: false,
    use_format: false,
    use_cot_metas: false,
    use_cot_caption: false,
    use_cot_language: false,
    constrained_decoding: false,
    constrained_decoding_debug: false,
    allow_lm_batch: false,
    infer_method: 'ode',
    use_random_seed: true
  };
  for (const key of Object.keys(payload)) if (key.startsWith('lm_')) delete payload[key];
  return payload;
}

const cacheUrl = jobId => `${CACHE_PREFIX}${encodeURIComponent(jobId)}`;
function stateStub(env, jobId) {
  try { return env?.SONARA_JOB_STATE ? env.SONARA_JOB_STATE.get(env.SONARA_JOB_STATE.idFromName(jobId)) : null; } catch { return null; }
}
async function saveState(env, jobId, state) {
  const stub = stateStub(env, jobId);
  if (stub) {
    const r = await stub.fetch('https://sonara.internal/state', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) });
    if (!r.ok) throw new Error(`SONARA state HTTP ${r.status}`);
  }
  await caches.default.put(new Request(cacheUrl(jobId)), new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL}` } })).catch(() => undefined);
}
async function loadState(env, jobId) {
  const stub = stateStub(env, jobId);
  if (stub) {
    try { const r = await stub.fetch('https://sonara.internal/state'); if (r.ok) return await r.json(); } catch {}
  }
  try { const r = await caches.default.match(new Request(cacheUrl(jobId))); return r ? await r.json() : null; } catch { return null; }
}

function resultItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : parsed ? [parsed] : []; } catch { return []; }
  }
  return value && typeof value === 'object' ? [value] : [];
}

function refsFrom(task, baseUrl) {
  const refs = [];
  const seen = new Set();
  const visit = value => {
    if (!value) return;
    if (typeof value === 'string') {
      let path = '';
      try { path = new URL(value, `${baseUrl}/`).searchParams.get('path') || ''; } catch {}
      if (!path && value.startsWith('/') && !value.startsWith('/v1/audio')) path = value;
      if (path && !seen.has(path)) { seen.add(path); refs.push(path); }
      return;
    }
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value === 'object') {
      for (const key of ['file','url','audio_path','audio_file','path','output','outputs','audio','audios','wave']) if (key in value) visit(value[key]);
    }
  };
  resultItems(task?.result).forEach(visit);
  return refs;
}

function publicAudioUrl(path) {
  return `${PUBLIC_API_ORIGIN}/api/blackwell/audio?path=${encodeURIComponent(path)}`;
}

async function submit(baseUrl, env, payload) {
  const r = await fetch(`${baseUrl}/release_task`, {
    method: 'POST',
    headers: authHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT)
  });
  const raw = await r.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error('Blackwell: JSON non valido.'); }
  if (!r.ok || Number(data?.code || 200) >= 400) throw new Error(String(data?.error?.message || data?.error || data?.message || `Blackwell HTTP ${r.status}`));
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error('Blackwell: task_id mancante.');
  return String(taskId);
}

async function query(baseUrl, env, taskId) {
  const r = await fetch(`${baseUrl}/query_result`, {
    method: 'POST',
    headers: authHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({ task_id_list: [taskId] }),
    signal: AbortSignal.timeout(QUERY_TIMEOUT)
  });
  const raw = await r.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error('Blackwell query: JSON non valido.'); }
  if (!r.ok || Number(data?.code || 200) >= 400) throw new Error(String(data?.error?.message || data?.error || data?.message || `Blackwell query HTTP ${r.status}`));
  return data?.data?.[0] || null;
}

async function startBlackwell(request, env) {
  if (!authorized(request, env)) return json(request, { error: 'Unauthorized SONARA generation proxy.' }, 401);
  const baseUrl = blackwellUrl(env);
  if (!baseUrl) return instantRuntime.fetch(request, env);

  const authoritative = await rewriteGenerationRequest(request);
  let body;
  try { body = await authoritative.clone().json(); } catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }
  if (body?.dualFast !== true || Number(body?.candidateCount || 0) !== 2) return instantRuntime.fetch(authoritative, env);

  const payload = blackwellPayload(body);
  const jobId = `bw2_${crypto.randomUUID()}`;
  try {
    const taskId = await submit(baseUrl, env, payload);
    const now = Date.now();
    await saveState(env, jobId, { createdAt: now, updatedAt: now, baseUrl, taskId, payload });
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 18,
      retryable: true,
      audioUrl: null,
      audioUrls: [],
      candidates: [],
      metadata: {
        engine: 'SONARA ACE-Step RTX PRO 6000 Blackwell',
        speedProfile: VERSION,
        progressiveDelivery: false,
        inferenceSteps: 4,
        batchSize: 2,
        candidateCount: 2,
        currentStage: 'Blackwell XL-Turbo batch-2 avviato'
      }
    });
  } catch (error) {
    return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

async function pollBlackwell(request, env, ctx, jobId) {
  const state = await loadState(env, jobId);
  if (!state?.taskId || !state?.baseUrl) return instantRuntime.fetch(request, env, ctx);
  try {
    const task = await query(state.baseUrl, env, state.taskId);
    const status = Number(task?.status ?? 0);
    if (status === 1) {
      const refs = refsFrom(task, state.baseUrl).slice(0, 2);
      if (refs.length < 2) throw new Error(`Blackwell completato ma ha restituito ${refs.length} audio.`);
      const candidates = refs.map((path, index) => ({
        id: index === 0 ? 'A' : 'B',
        audioUrl: publicAudioUrl(path),
        audioFormat: 'wav',
        strategy: index === 0 ? 'blackwell-batch2-hook' : 'blackwell-batch2-variation',
        inferenceSteps: 4
      }));
      return json(request, {
        jobId,
        status: 'COMPLETED',
        progress: 100,
        audioUrl: candidates[0].audioUrl,
        audioUrls: candidates.map(c => c.audioUrl),
        candidates,
        metadata: {
          engine: 'SONARA ACE-Step RTX PRO 6000 Blackwell',
          speedProfile: VERSION,
          inferenceSteps: 4,
          batchSize: 2,
          readyCount: 2,
          candidateCount: 2,
          currentStage: '2 brani SONARA Blackwell pronti'
        }
      });
    }
    if (status === 2) return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: 'Generazione Blackwell fallita.' }, 502);

    state.updatedAt = Date.now();
    await saveState(env, jobId, state);
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 55,
      retryable: true,
      audioUrl: null,
      audioUrls: [],
      candidates: [],
      metadata: {
        engine: 'SONARA ACE-Step RTX PRO 6000 Blackwell',
        speedProfile: VERSION,
        inferenceSteps: 4,
        batchSize: 2,
        candidateCount: 2,
        currentStage: 'Blackwell XL-Turbo sta generando i 2 brani'
      }
    });
  } catch {
    return instantRuntime.fetch(request, env, ctx);
  }
}

async function proxyAudio(request, env) {
  const baseUrl = blackwellUrl(env);
  if (!baseUrl) return json(request, { error: 'Blackwell worker non configurato.' }, 503);
  const url = new URL(request.url);
  const path = String(url.searchParams.get('path') || '').trim();
  if (!path) return json(request, { error: 'Audio path mancante.' }, 400);

  const target = new URL('/v1/audio', `${baseUrl}/`);
  target.searchParams.set('path', path);
  const headers = authHeaders(env);
  const range = request.headers.get('Range');
  if (range) headers.Range = range;
  const upstream = await fetch(target.toString(), { method: request.method === 'HEAD' ? 'HEAD' : 'GET', headers });
  const out = new Headers(upstream.headers);
  Object.entries(cors(request)).forEach(([k, v]) => out.set(k, v));
  out.set('x-sonara-blackwell-profile', VERSION);
  return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: out });
}

function withHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-blackwell-profile', VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });

    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/api/blackwell/audio') {
      return proxyAudio(request, env);
    }

    const jobMatch = url.pathname.match(/^\/api\/music\/job\/(bw2_[^/]+)$/);
    if (request.method === 'GET' && jobMatch) return pollBlackwell(request, env, ctx, decodeURIComponent(jobMatch[1]));

    if (request.method === 'POST' && url.pathname === '/api/engine/generate' && blackwellUrl(env)) {
      try {
        const body = await request.clone().json();
        if (body?.dualFast === true && Number(body?.candidateCount || 0) === 2) return startBlackwell(request, env);
      } catch {}
    }

    return withHeaders(await instantRuntime.fetch(request, env, ctx));
  }
};
