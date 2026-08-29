import fallbackRuntime from './sonara-instant-speed-router.mjs';
import { buildStudioPayload } from './sonara-engine-v16-studio-quality.mjs';
import { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';
export { SonaraJobState } from './sonara-instant-speed-router.mjs';

const VERSION = 'sonara-molab-kaggle-xl-v1';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/molab-kaggle-xl-v1/';
const CACHE_TTL = 3 * 60 * 60;
const QUERY_TIMEOUT = 8_000;
const SUBMIT_TIMEOUT = 45_000;
const AUDIO_TIMEOUT = 120_000;

const cleanUrl = value => String(value || '').trim().replace(/\/$/, '');
const splitUrls = value => String(value || '')
  .split(/[\s,;]+/)
  .map(cleanUrl)
  .filter(url => /^https?:\/\//i.test(url));

const molabUrl = env => cleanUrl(env.SONARA_MOLAB_XL_URL || env.MOLAB_ACESTEP_URL || '');
const kaggleUrls = env => splitUrls(env.ACESTEP_WORKER_URLS || env.ACE_STEP_API_URLS || env.SONARA_ACE_STEP_WORKERS || '').slice(0, 4);

function hybridWorkers(env) {
  const molab = molabUrl(env);
  const kaggle = kaggleUrls(env).find(url => url !== molab) || '';
  if (!molab || !kaggle) return [];
  return [
    {
      id: 'molab-xl',
      kind: 'molab',
      baseUrl: molab,
      model: 'acestep-v15-xl-turbo',
      steps: 4,
      label: 'MoLab XL-Turbo'
    },
    {
      id: 'kaggle-t4',
      kind: 'kaggle',
      baseUrl: kaggle,
      model: 'acestep-v15-turbo',
      steps: 5,
      label: 'Kaggle T4 Turbo'
    }
  ];
}

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set(['https://sonaraenterprise.com', 'https://www.sonaraenterprise.com', PUBLIC_API_ORIGIN]);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge,X-Sonara-Real-Prompt',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Hybrid-Profile,X-Sonara-ACE-Worker',
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
      'x-sonara-hybrid-profile': VERSION,
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

function hybridPayload(body, worker, slot, seed) {
  const base = buildStudioPayload(body, slot === 0 ? 'structure' : 'detail', seed);
  const lane = slot === 0
    ? 'MOLAB XL LANE: prioritize hook, structure, low-end authority and immediate musical identity.'
    : 'KAGGLE DETAIL LANE: preserve all creator locks while using a distinct melody, voicing, transitions and timbral balance.';
  return {
    ...base,
    model: worker.model,
    inference_steps: worker.steps,
    batch_size: 1,
    use_random_seed: false,
    seed,
    thinking: false,
    use_format: false,
    use_cot_metas: false,
    use_cot_caption: false,
    use_cot_language: false,
    constrained_decoding: false,
    constrained_decoding_debug: false,
    allow_lm_batch: false,
    prompt: `${String(base.prompt || body.prompt || '')}\n\nSONARA HYBRID ${worker.label}. ${lane} Preserve exact BPM, duration, key, lyrics, language, genre, subgenre, Weirdness and Style Influence. Render audio immediately.`.slice(0, 12000)
  };
}

async function submit(worker, env, payload) {
  const response = await fetch(`${worker.baseUrl}/release_task`, {
    method: 'POST',
    headers: authHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT)
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`${worker.label}: risposta non JSON.`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
    throw new Error(String(data?.error?.message || data?.error || data?.message || `${worker.label} HTTP ${response.status}`));
  }
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error(`${worker.label}: task_id mancante.`);
  return { workerId: worker.id, baseUrl: worker.baseUrl, taskId: String(taskId) };
}

async function query(task, env) {
  const response = await fetch(`${task.baseUrl}/query_result`, {
    method: 'POST',
    headers: authHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({ task_id_list: [task.taskId] }),
    signal: AbortSignal.timeout(QUERY_TIMEOUT)
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`Query ${task.workerId}: risposta non JSON.`); }
  if (!response.ok || Number(data?.code || 200) >= 400) {
    throw new Error(String(data?.error?.message || data?.error || data?.message || `Query ${task.workerId} HTTP ${response.status}`));
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

function refsFrom(task, taskRef) {
  const refs = [];
  const seen = new Set();
  const visit = value => {
    if (!value) return;
    if (typeof value === 'string') {
      let path = '';
      try { path = new URL(value, `${taskRef.baseUrl}/`).searchParams.get('path') || ''; } catch {}
      if (!path && value.startsWith('/') && !value.startsWith('/v1/audio')) path = value;
      if (path && !seen.has(path)) {
        seen.add(path);
        refs.push({ workerId: taskRef.workerId, path });
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

function publicAudioUrl(ref) {
  return `${PUBLIC_API_ORIGIN}/api/hybrid/audio?sonara_worker=${encodeURIComponent(ref.workerId)}&path=${encodeURIComponent(ref.path)}`;
}

function candidatesFrom(state) {
  return (state?.slots || []).map((slot, index) => slot.audioRef ? {
    id: index === 0 ? 'A' : 'B',
    audioUrl: publicAudioUrl(slot.audioRef),
    audioFormat: 'wav',
    provider: slot.worker?.kind || (index === 0 ? 'molab' : 'kaggle'),
    model: slot.worker?.model || (index === 0 ? 'acestep-v15-xl-turbo' : 'acestep-v15-turbo'),
    inferenceSteps: Number(slot.worker?.steps || (index === 0 ? 4 : 5)),
    strategy: index === 0 ? 'molab-xl-structure' : 'kaggle-t4-detail'
  } : null).filter(Boolean);
}

function processing(request, jobId, state, stage) {
  const candidates = candidatesFrom(state);
  return json(request, {
    jobId,
    status: 'PROCESSING',
    progress: candidates.length ? 68 : 24,
    retryable: true,
    audioUrl: candidates[0]?.audioUrl || null,
    audioUrls: candidates.map(candidate => candidate.audioUrl),
    candidates,
    metadata: {
      engine: 'SONARA MoLab XL + Kaggle T4',
      speedProfile: VERSION,
      progressiveDelivery: true,
      candidateCount: 2,
      readyCount: candidates.length,
      providers: ['molab-xl', 'kaggle-t4'],
      currentStage: stage
    }
  });
}

function completed(request, jobId, state) {
  const candidates = candidatesFrom(state);
  return json(request, {
    jobId,
    status: 'COMPLETED',
    progress: 100,
    audioUrl: candidates[0]?.audioUrl || null,
    audioUrls: candidates.map(candidate => candidate.audioUrl),
    candidates,
    metadata: {
      engine: 'SONARA MoLab XL + Kaggle T4',
      speedProfile: VERSION,
      progressiveDelivery: true,
      candidateCount: 2,
      readyCount: candidates.length,
      providers: candidates.map(candidate => candidate.provider),
      currentStage: '2 brani pronti: MoLab XL + Kaggle T4'
    }
  });
}

async function startHybrid(request, env) {
  if (!authorized(request, env)) return json(request, { error: 'Unauthorized SONARA generation proxy.' }, 401);
  const workers = hybridWorkers(env);
  if (workers.length !== 2) return fallbackRuntime.fetch(request, env);

  const authoritative = await rewriteGenerationRequest(request);
  let body;
  try { body = await authoritative.clone().json(); }
  catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }
  if (body?.dualFast !== true || Number(body?.candidateCount || 0) !== 2) return fallbackRuntime.fetch(authoritative, env);

  const seed = Math.max(1, Number(body?.seed) > 0 ? Number(body.seed) : Math.floor(Date.now() % 2_000_000_000));
  const payloads = [
    hybridPayload(body, workers[0], 0, seed + 104729),
    hybridPayload(body, workers[1], 1, seed + 209759)
  ];
  const jobId = `mkpair_${crypto.randomUUID()}`;

  try {
    const submitted = await Promise.all([
      submit(workers[0], env, payloads[0]),
      submit(workers[1], env, payloads[1])
    ]);
    const now = Date.now();
    const state = {
      createdAt: now,
      updatedAt: now,
      speedProfile: VERSION,
      slots: submitted.map((task, index) => ({
        candidate: index === 0 ? 'A' : 'B',
        worker: workers[index],
        payload: payloads[index],
        task,
        audioRef: null,
        lastProgress: 0,
        lastStage: 'queued'
      }))
    };
    await saveState(env, jobId, state);
    return processing(request, jobId, state, 'MoLab XL-Turbo + Kaggle T4 avviati in parallelo');
  } catch {
    return fallbackRuntime.fetch(authoritative, env);
  }
}

async function pollHybrid(request, env, jobId) {
  const state = await loadState(env, jobId);
  if (!state || !Array.isArray(state.slots)) {
    return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: 'Sessione ibrida SONARA non trovata.' }, 404);
  }
  if (state.slots.every(slot => slot.audioRef)) return completed(request, jobId, state);

  const active = state.slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => !slot.audioRef && slot.task);
  const settled = await Promise.allSettled(active.map(({ slot }) => query(slot.task, env)));

  for (let index = 0; index < active.length; index++) {
    const { slot } = active[index];
    const outcome = settled[index];
    if (outcome.status === 'rejected') {
      slot.lastStage = 'reconnecting';
      continue;
    }
    const task = outcome.value;
    const status = Number(task?.status ?? 0);
    const info = resultInfo(task);
    slot.lastProgress = info.progress;
    if (info.stage) slot.lastStage = info.stage;

    if (status === 1) {
      const ref = refsFrom(task, slot.task)[0];
      if (ref) {
        slot.audioRef = ref;
        slot.task = null;
        slot.lastProgress = 100;
        slot.lastStage = 'completed';
      }
    } else if (status !== 0) {
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 0,
        retryable: true,
        error: `${slot.worker?.label || slot.candidate} ha terminato la generazione con errore.`
      }, 502);
    }
  }

  state.updatedAt = Date.now();
  await saveState(env, jobId, state);
  if (state.slots.every(slot => slot.audioRef)) return completed(request, jobId, state);
  const stage = state.slots
    .filter(slot => !slot.audioRef)
    .map(slot => `${slot.worker?.label || slot.candidate}: ${slot.lastStage || 'rendering'} ${Math.round(Number(slot.lastProgress || 0))}%`)
    .join(' | ');
  return processing(request, jobId, state, stage || 'Rendering ibrido in corso');
}

async function proxyAudio(request, env, url) {
  const workerId = String(url.searchParams.get('sonara_worker') || '').trim();
  const path = String(url.searchParams.get('path') || '').trim();
  if (!workerId || !path) return json(request, { error: 'Worker o path audio mancante.' }, 400);
  const worker = hybridWorkers(env).find(candidate => candidate.id === workerId);
  if (!worker) return json(request, { error: `Worker ${workerId} non configurato.` }, 404);

  const target = new URL('/v1/audio', `${worker.baseUrl}/`);
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
    return json(request, { error: `${worker.label}: audio non raggiungibile.`, retryable: true }, 502);
  }

  const out = new Headers(upstream.headers);
  Object.entries(cors(request)).forEach(([key, value]) => out.set(key, value));
  out.set('cache-control', 'private, no-store');
  out.set('x-sonara-hybrid-profile', VERSION);
  out.set('x-sonara-ace-worker', worker.id);
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out
  });
}

async function checkWorker(worker, env) {
  try {
    const response = await fetch(`${worker.baseUrl}/health`, {
      headers: authHeaders(env, { Accept: 'application/json' }),
      signal: AbortSignal.timeout(10_000)
    });
    const data = response.ok ? await response.json() : {};
    const model = String(data?.data?.loaded_model || data?.loaded_model || '').trim();
    const status = String(data?.data?.status || data?.status || '').toLowerCase();
    return {
      id: worker.id,
      kind: worker.kind,
      label: worker.label,
      ok: response.ok && (Number(data?.code || 200) === 200 || ['ok', 'ready', 'healthy', 'online', 'success'].includes(status)),
      model,
      expectedModel: worker.model
    };
  } catch {
    return { id: worker.id, kind: worker.kind, label: worker.label, ok: false, model: '', expectedModel: worker.model };
  }
}

async function readiness(request, env) {
  const workers = hybridWorkers(env);
  if (workers.length !== 2) {
    return json(request, {
      ready: false,
      profile: VERSION,
      reason: 'SONARA_MOLAB_XL_URL non configurato oppure Kaggle non disponibile.',
      fallback: 'dual-kaggle'
    }, 503);
  }
  const health = await Promise.all(workers.map(worker => checkWorker(worker, env)));
  return json(request, {
    ready: health.every(item => item.ok),
    profile: VERSION,
    engine: 'SONARA MoLab XL + Kaggle T4',
    workers: health,
    fallback: 'dual-kaggle'
  }, health.every(item => item.ok) ? 200 : 503);
}

function withHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-hybrid-profile', VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });

    if (url.pathname === '/api/hybrid/ready' && request.method === 'GET') {
      return readiness(request, env);
    }

    if (url.pathname === '/api/hybrid/audio' && (request.method === 'GET' || request.method === 'HEAD')) {
      return proxyAudio(request, env, url);
    }

    const jobMatch = url.pathname.match(/^\/api\/music\/job\/(mkpair_[^/]+)$/);
    if (request.method === 'GET' && jobMatch) {
      return pollHybrid(request, env, decodeURIComponent(jobMatch[1]));
    }

    if (request.method === 'POST' && url.pathname === '/api/engine/generate' && hybridWorkers(env).length === 2) {
      try {
        const body = await request.clone().json();
        if (body?.dualFast === true && Number(body?.candidateCount || 0) === 2) {
          return startHybrid(request, env);
        }
      } catch {}
    }

    return withHeaders(await fallbackRuntime.fetch(request, env, ctx));
  }
};
