import siteRuntime from './sonara-instant-speed-router.mjs';
import { buildStudioPayload } from './sonara-engine-v16-studio-quality.mjs';
import { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';
export { SonaraJobState } from './sonara-instant-speed-router.mjs';

const VERSION = 'sonara-molab-xl-only-v1';
const MODEL = 'acestep-v15-xl-turbo';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/molab-xl-only-v1/';
const CACHE_TTL = 3 * 60 * 60;
const QUERY_TIMEOUT = 8_000;
const SUBMIT_TIMEOUT = 45_000;
const AUDIO_TIMEOUT = 120_000;
const INFERENCE_STEPS = 4;

const cleanUrl = value => String(value || '').trim().replace(/\/$/, '');
const molabUrl = env => cleanUrl(env.SONARA_MOLAB_XL_URL || env.MOLAB_ACESTEP_URL || '');

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set(['https://sonaraenterprise.com', 'https://www.sonaraenterprise.com', PUBLIC_API_ORIGIN]);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge,X-Sonara-Real-Prompt',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-MoLab-Profile,X-Sonara-ACE-Worker',
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
      'x-sonara-molab-profile': VERSION,
      ...cors(request)
    }
  });
}

function authHeaders(env, extra = {}) {
  const out = { ...extra };
  const key = String(env.ACE_STEP_API_KEY || env.ACESTEP_API_KEY || '').trim();
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

function candidateCount(body = {}) {
  if (body?.dualFast === true) return 2;
  return Math.round(clamp(body?.candidateCount, 2, 1, 2));
}

function molabPayload(body, count) {
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

  const prompt = `${String(base.prompt || body.prompt || '')}\n\nSONARA MOLAB XL-TURBO ONLY. Render ${count} professional candidate${count === 2 ? 's' : ''} in one RTX Pro 6000 batch. Preserve exact BPM, duration, key, lyrics, vocal language, genre and subgenre. ${locks} Weirdness=${weirdness}/100. Style Influence=${styleInfluence}/100. ${count === 2 ? 'Candidate 1 prioritizes hook, groove and immediate structure. Candidate 2 preserves all creator locks but uses a clearly different melody, voicing, transition language and timbral balance.' : 'Prioritize hook, groove, coherent structure and professional production.'} Do not return analysis text; render audio immediately.`.slice(0, 12000);

  const payload = {
    ...base,
    model: MODEL,
    prompt,
    inference_steps: INFERENCE_STEPS,
    batch_size: count,
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
  catch { throw new Error(`MoLab XL: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
    throw new Error(String(data?.error?.message || data?.error || data?.message || `MoLab XL HTTP ${response.status}`));
  }
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error('MoLab XL: task_id mancante.');
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
  catch { throw new Error(`MoLab XL query: risposta non JSON (HTTP ${response.status}).`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
    throw new Error(String(data?.error?.message || data?.error || data?.message || `MoLab XL query HTTP ${response.status}`));
  }
  return data?.data?.[0] || null;
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

function resultInfo(task) {
  const first = resultItems(task?.result)[0] || {};
  const raw = Number(first?.progress ?? task?.progress ?? 0);
  const progress = Number.isFinite(raw) ? (raw <= 1 ? raw * 100 : raw) : 0;
  return {
    progress: Math.max(0, Math.min(100, progress)),
    stage: String(first?.stage || task?.stage || task?.progress_text || '').trim()
  };
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
      if (path && !seen.has(path)) {
        seen.add(path);
        refs.push(path);
      }
      return;
    }
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value === 'object') {
      for (const key of ['file','url','audio_path','audio_file','path','output','outputs','audio','audios','wave']) {
        if (key in value) visit(value[key]);
      }
    }
  };
  resultItems(task?.result).forEach(visit);
  return refs;
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

function publicAudioUrl(path) {
  return `${PUBLIC_API_ORIGIN}/api/molab/audio?path=${encodeURIComponent(path)}`;
}

function candidatesFrom(refs) {
  return refs.map((path, index) => ({
    id: index === 0 ? 'A' : 'B',
    audioUrl: publicAudioUrl(path),
    audioFormat: 'wav',
    provider: 'molab',
    model: MODEL,
    inferenceSteps: INFERENCE_STEPS,
    strategy: index === 0 ? 'molab-xl-batch-hook' : 'molab-xl-batch-variation'
  }));
}

async function startMolab(request, env) {
  if (!authorized(request, env)) return json(request, { error: 'Unauthorized SONARA generation proxy.' }, 401);
  const baseUrl = molabUrl(env);
  if (!baseUrl) {
    return json(request, {
      status: 'FAILED',
      progress: 0,
      retryable: true,
      error: 'MoLab XL-Turbo non configurato. Kaggle è disabilitato per Music AI.'
    }, 503);
  }

  const authoritative = await rewriteGenerationRequest(request);
  let body;
  try { body = await authoritative.clone().json(); }
  catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }

  const count = candidateCount(body);
  const payload = molabPayload(body, count);
  const jobId = `mxl_${crypto.randomUUID()}`;
  try {
    const taskId = await submit(baseUrl, env, payload);
    const now = Date.now();
    await saveState(env, jobId, {
      createdAt: now,
      updatedAt: now,
      baseUrl,
      taskId,
      expectedCount: count,
      payload
    });
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 18,
      retryable: true,
      audioUrl: null,
      audioUrls: [],
      candidates: [],
      metadata: {
        engine: 'SONARA MoLab RTX Pro 6000 XL-Turbo',
        provider: 'molab',
        model: MODEL,
        speedProfile: VERSION,
        inferenceSteps: INFERENCE_STEPS,
        batchSize: count,
        candidateCount: count,
        kaggleEnabled: false,
        currentStage: count === 2 ? 'MoLab XL-Turbo: batch di 2 brani avviato' : 'MoLab XL-Turbo: generazione avviata'
      }
    }, 202);
  } catch (error) {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      retryable: true,
      error: error instanceof Error ? error.message : String(error),
      metadata: { provider: 'molab', kaggleEnabled: false }
    }, 502);
  }
}

async function pollMolab(request, env, jobId) {
  const state = await loadState(env, jobId);
  if (!state?.taskId || !state?.baseUrl) {
    return json(request, { jobId, status: 'FAILED', progress: 0, retryable: false, error: 'Sessione MoLab SONARA non trovata.' }, 404);
  }

  try {
    const task = await query(state.baseUrl, env, state.taskId);
    const status = Number(task?.status ?? 0);
    const info = resultInfo(task);

    if (status === 1) {
      const expectedCount = Math.max(1, Math.min(2, Number(state.expectedCount || 2)));
      const refs = refsFrom(task, state.baseUrl).slice(0, expectedCount);
      if (refs.length < expectedCount) {
        return json(request, {
          jobId,
          status: 'FAILED',
          progress: 0,
          retryable: true,
          error: `MoLab XL-Turbo completato ma ha restituito ${refs.length}/${expectedCount} audio.`
        }, 502);
      }
      const candidates = candidatesFrom(refs);
      return json(request, {
        jobId,
        status: 'COMPLETED',
        progress: 100,
        audioUrl: candidates[0]?.audioUrl || null,
        audioUrls: candidates.map(candidate => candidate.audioUrl),
        candidates,
        metadata: {
          engine: 'SONARA MoLab RTX Pro 6000 XL-Turbo',
          provider: 'molab',
          model: MODEL,
          speedProfile: VERSION,
          inferenceSteps: INFERENCE_STEPS,
          batchSize: expectedCount,
          candidateCount: candidates.length,
          kaggleEnabled: false,
          currentStage: candidates.length === 2 ? '2 brani MoLab XL-Turbo pronti' : 'Brano MoLab XL-Turbo pronto'
        }
      });
    }

    if (status !== 0) {
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 0,
        retryable: true,
        error: String(task?.error || task?.message || 'Generazione MoLab XL-Turbo fallita.'),
        metadata: { provider: 'molab', kaggleEnabled: false }
      }, 502);
    }

    state.updatedAt = Date.now();
    await saveState(env, jobId, state);
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: Math.max(24, Math.min(94, Math.round(info.progress || 55))),
      retryable: true,
      audioUrl: null,
      audioUrls: [],
      candidates: [],
      metadata: {
        engine: 'SONARA MoLab RTX Pro 6000 XL-Turbo',
        provider: 'molab',
        model: MODEL,
        speedProfile: VERSION,
        inferenceSteps: INFERENCE_STEPS,
        batchSize: Number(state.expectedCount || 2),
        candidateCount: Number(state.expectedCount || 2),
        kaggleEnabled: false,
        currentStage: info.stage || 'MoLab XL-Turbo sta generando'
      }
    });
  } catch (error) {
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 55,
      retryable: true,
      error: error instanceof Error ? error.message : String(error),
      metadata: {
        provider: 'molab',
        kaggleEnabled: false,
        currentStage: 'Riconnessione a MoLab XL-Turbo'
      }
    });
  }
}

async function proxyAudio(request, env) {
  const baseUrl = molabUrl(env);
  if (!baseUrl) return json(request, { error: 'MoLab XL-Turbo non configurato.' }, 503);
  const url = new URL(request.url);
  const path = String(url.searchParams.get('path') || '').trim();
  if (!path) return json(request, { error: 'Audio path mancante.' }, 400);

  const target = new URL('/v1/audio', `${baseUrl}/`);
  target.searchParams.set('path', path);
  const headers = authHeaders(env);
  const range = request.headers.get('Range');
  if (range) headers.Range = range;

  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      signal: AbortSignal.timeout(AUDIO_TIMEOUT)
    });
  } catch {
    return json(request, { error: 'Audio MoLab non raggiungibile.', retryable: true }, 502);
  }

  const out = new Headers(upstream.headers);
  Object.entries(cors(request)).forEach(([key, value]) => out.set(key, value));
  out.set('cache-control', 'private, no-store');
  out.set('x-sonara-molab-profile', VERSION);
  out.set('x-sonara-ace-worker', 'molab-xl');
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out
  });
}

async function readiness(request, env) {
  const baseUrl = molabUrl(env);
  if (!baseUrl) {
    return json(request, {
      ready: false,
      profile: VERSION,
      engine: 'SONARA MoLab RTX Pro 6000 XL-Turbo',
      provider: 'molab',
      model: MODEL,
      kaggleEnabled: false,
      reason: 'SONARA_MOLAB_XL_URL non configurato.'
    }, 503);
  }

  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: authHeaders(env, { Accept: 'application/json', 'Cache-Control': 'no-cache' }),
      signal: AbortSignal.timeout(10_000)
    });
    const data = response.ok ? await response.json() : {};
    const health = data?.data || data;
    const loadedModel = String(health?.loaded_model || health?.model || '');
    const status = String(health?.status || '').toLowerCase();
    const ready = response.ok && health?.models_initialized === true && (!loadedModel || loadedModel.includes(MODEL)) && (Number(data?.code || 200) === 200 || ['ok','ready','healthy','online','success'].includes(status));
    return json(request, {
      ready,
      profile: VERSION,
      engine: 'SONARA MoLab RTX Pro 6000 XL-Turbo',
      provider: 'molab',
      model: MODEL,
      loadedModel,
      inferenceSteps: INFERENCE_STEPS,
      maxBatchSize: 2,
      kaggleEnabled: false
    }, ready ? 200 : 503);
  } catch (error) {
    return json(request, {
      ready: false,
      profile: VERSION,
      engine: 'SONARA MoLab RTX Pro 6000 XL-Turbo',
      provider: 'molab',
      model: MODEL,
      kaggleEnabled: false,
      error: error instanceof Error ? error.message : String(error)
    }, 503);
  }
}

function withHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-molab-profile', VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });

    if ((url.pathname === '/api/molab/ready' || url.pathname === '/api/engine/ready') && request.method === 'GET') {
      return readiness(request, env);
    }

    if (url.pathname === '/api/molab/audio' && (request.method === 'GET' || request.method === 'HEAD')) {
      return proxyAudio(request, env);
    }

    const jobMatch = url.pathname.match(/^\/api\/music\/job\/(mxl_[^/]+)$/);
    if (request.method === 'GET' && jobMatch) {
      return pollMolab(request, env, decodeURIComponent(jobMatch[1]));
    }

    if (request.method === 'GET' && /^\/api\/music\/job\/(?:d16pair_|bw2_|mkpair_)/.test(url.pathname)) {
      return json(request, {
        status: 'FAILED',
        progress: 0,
        retryable: false,
        error: 'Job del vecchio motore disabilitato. Music AI ora usa esclusivamente MoLab XL-Turbo.'
      }, 410);
    }

    if (request.method === 'POST' && url.pathname === '/api/engine/generate') {
      return startMolab(request, env);
    }

    return withHeaders(await siteRuntime.fetch(request, env, ctx));
  }
};
