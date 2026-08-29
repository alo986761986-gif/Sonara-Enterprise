import engineV18 from './sonara-engine-v18-fast-hq.mjs';
import { buildV17Payload } from './sonara-engine-v17-lm-composer.mjs';
import { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';
export { SonaraJobState } from './sonara-job-state-do.mjs';

const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/resilient-dual-v19/';
const CACHE_TTL = 3 * 60 * 60;
const STEPS = 6;
const HEALTH_TIMEOUT = 4_000;
const SUBMIT_TIMEOUT = 90_000;
const QUERY_TIMEOUT = 12_000;
const MAX_ATTEMPTS = 2;
const PROFILE = 'resilient-dual-fast-v19';

const cleanUrl = value => String(value || '').trim().replace(/\/$/, '');
const workerUrls = env => String(env.ACESTEP_WORKER_URLS || env.ACE_STEP_API_URLS || env.SONARA_ACE_STEP_WORKERS || '')
  .split(/[\s,;]+/).map(cleanUrl).filter(url => /^https?:\/\//i.test(url)).slice(0, 4);
const workers = env => workerUrls(env).map((baseUrl, index) => ({ id: `t4-${index}`, baseUrl, kind: 'kaggle' }));

function headers(env, extra = {}) {
  const out = { ...extra };
  const key = String(env.ACE_STEP_API_KEY || env.ACESTEP_API_KEY || '').trim();
  if (key) { out.Authorization = `Bearer ${key}`; out['X-API-Key'] = key; }
  return out;
}

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set(['https://sonaraenterprise.com', 'https://www.sonaraenterprise.com', PUBLIC_API_ORIGIN]);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Music-Quality,X-Sonara-Speed-Profile',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: {
    'content-type': 'application/json; charset=UTF-8',
    'cache-control': 'private, no-store',
    'x-sonara-music-quality': PROFILE,
    'x-sonara-speed-profile': PROFILE,
    ...cors(request)
  }});
}

function authorized(request, env) {
  const required = String(env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  return !required || String(request.headers.get('X-Sonara-Internal-Secret') || '').trim() === required;
}

async function healthy(env) {
  const checked = await Promise.all(workers(env).map(async worker => {
    try {
      const response = await fetch(`${worker.baseUrl}/health`, { headers: headers(env, { Accept: 'application/json' }), signal: AbortSignal.timeout(HEALTH_TIMEOUT) });
      if (!response.ok) return null;
      const payload = await response.json();
      const data = payload?.data || payload;
      const status = String(data?.status || payload?.status || '').toLowerCase();
      return payload?.code === 200 || ['ok','ready','healthy','online','success'].includes(status) ? worker : null;
    } catch { return null; }
  }));
  return checked.filter(Boolean);
}

async function submit(worker, env, payload) {
  const response = await fetch(`${worker.baseUrl}/release_task`, {
    method: 'POST', headers: headers(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify(payload), signal: AbortSignal.timeout(SUBMIT_TIMEOUT)
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`ACE-Step ${worker.id}: JSON non valido.`); }
  if (!response.ok || Number(data?.code || 200) >= 400) throw new Error(String(data?.error?.message || data?.error || data?.message || `ACE-Step HTTP ${response.status}`));
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error(`ACE-Step ${worker.id}: task_id mancante.`);
  return { workerId: worker.id, baseUrl: worker.baseUrl, taskId: String(taskId) };
}

async function query(task, env) {
  const response = await fetch(`${task.baseUrl}/query_result`, {
    method: 'POST', headers: headers(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({ task_id_list: [task.taskId] }), signal: AbortSignal.timeout(QUERY_TIMEOUT)
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`ACE-Step ${task.workerId}: query JSON non valido.`); }
  if (!response.ok || Number(data?.code || 200) >= 400) throw new Error(String(data?.error?.message || data?.error || data?.message || `ACE-Step query HTTP ${response.status}`));
  return data?.data?.[0] || null;
}

function items(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') { try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : parsed ? [parsed] : []; } catch { return []; } }
  return value && typeof value === 'object' ? [value] : [];
}

function refsFrom(task, taskRef) {
  const seen = new Set();
  const refs = [];
  for (const item of items(task?.result)) {
    for (const source of [item?.file, item?.url]) {
      if (typeof source !== 'string' || !source) continue;
      let path = '';
      try { path = new URL(source, `${taskRef.baseUrl}/`).searchParams.get('path') || ''; } catch {}
      if (!path && source.startsWith('/') && !source.startsWith('/v1/audio')) path = source;
      if (!path) continue;
      const key = `${taskRef.workerId}:${path}`;
      if (!seen.has(key)) { seen.add(key); refs.push({ workerId: taskRef.workerId, path }); }
      break;
    }
  }
  return refs;
}

const cacheUrl = jobId => `${CACHE_PREFIX}${encodeURIComponent(jobId)}`;
function stateStub(env, jobId) {
  try {
    if (!env?.SONARA_JOB_STATE) return null;
    const id = env.SONARA_JOB_STATE.idFromName(jobId);
    return env.SONARA_JOB_STATE.get(id);
  } catch { return null; }
}
async function save(env, jobId, state) {
  const stub = stateStub(env, jobId);
  if (stub) {
    const response = await stub.fetch('https://sonara.internal/state', {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state)
    });
    if (!response.ok) throw new Error(`SONARA state persistence HTTP ${response.status}`);
  }
  await caches.default.put(new Request(cacheUrl(jobId)), new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL}` } })).catch(() => undefined);
}
async function load(env, jobId) {
  const stub = stateStub(env, jobId);
  if (stub) {
    try {
      const response = await stub.fetch('https://sonara.internal/state', { method: 'GET' });
      if (response.ok) return await response.json();
    } catch {}
  }
  try {
    const response = await caches.default.match(new Request(cacheUrl(jobId)));
    return response ? await response.json() : null;
  } catch { return null; }
}

function fastPayload(payload, slot, attempt = 0) {
  const seed = Math.max(1, Number(payload?.seed) > 0 ? Number(payload.seed) : Math.floor(Date.now() % 2_000_000_000));
  return { ...payload, inference_steps: STEPS, batch_size: 1, use_random_seed: false, seed: seed + (slot + 1) * 104729 + attempt * 7919,
    thinking: false, use_format: false, use_cot_caption: false, use_cot_language: false, constrained_decoding: false, allow_lm_batch: false };
}

function batchPayload(payload) {
  return { ...fastPayload(payload, 0, 0), batch_size: 2, use_random_seed: true, seed: -1,
    prompt: `${String(payload.prompt || '')}\n\nSONARA FAST PAIR: genera due alternative professionali realmente differenti mantenendo genere, BPM, testo e identita sonora.`.slice(0, 12000) };
}

function audioUrl(ref) { return `${PUBLIC_API_ORIGIN}/api/modal/audio?sonara_worker=${encodeURIComponent(ref.workerId)}&path=${encodeURIComponent(ref.path)}`; }
function completed(request, jobId, state) {
  const refs = state.slots.map(slot => slot.audioRef).filter(Boolean).slice(0, 2);
  const urls = refs.map(audioUrl);
  return json(request, { jobId, status: 'COMPLETED', progress: 100, audioUrl: urls[0] || null, audioUrls: urls,
    candidates: urls.map((url, index) => ({ id: index ? 'B' : 'A', audioUrl: url, audioFormat: 'wav', strategy: index ? 'detail-master' : 'structure-master', inferenceSteps: STEPS })),
    metadata: { engine: 'SONARA ACE-Step 1.5', candidateCount: urls.length, inferenceSteps: STEPS, speedProfile: PROFILE, automaticMissingTrackRecovery: true, durableJobState: true, currentStage: '2 brani SONARA pronti' } });
}
function processing(request, jobId, state, progress, stage) {
  return json(request, { jobId, status: 'PROCESSING', progress, retryable: true,
    metadata: { engine: 'SONARA ACE-Step 1.5', candidateCount: 2, readyCount: state.slots.filter(slot => slot.audioRef).length, inferenceSteps: STEPS, speedProfile: PROFILE, automaticMissingTrackRecovery: true, durableJobState: true, currentStage: stage } });
}

async function start(request, env, body) {
  const pool = await healthy(env);
  if (!pool.length) return json(request, { status: 'FAILED', progress: 0, retryable: true, error: 'Nessuna T4 SONARA raggiungibile.' }, 503);
  const seed = Math.max(1, Math.floor(Date.now() % 2_000_000_000));
  const payloads = [buildV17Payload(body, 'structure', seed + 7919), buildV17Payload(body, 'detail', seed + 15838)];
  const jobId = `d16pair_${crypto.randomUUID()}`;
  const base = { createdAt: Date.now(), updatedAt: Date.now(), payloads, failures: 0, speedProfile: PROFILE };
  try {
    if (pool.length >= 2) {
      const tasks = await Promise.all([submit(pool[0], env, fastPayload(payloads[0], 0)), submit(pool[1], env, fastPayload(payloads[1], 1))]);
      const state = { ...base, mode: 'slots', slots: tasks.map((task, i) => ({ candidate: i ? 'B' : 'A', worker: pool[i], payload: payloads[i], task, audioRef: null, attempts: 1 })) };
      await save(env, jobId, state);
      return processing(request, jobId, state, 38, 'SONARA Fast: 2 brani in parallelo su 2 T4');
    }
    const task = await submit(pool[0], env, batchPayload(payloads[0]));
    const state = { ...base, mode: 'batch', batchTask: task, worker: pool[0], slots: [0,1].map(i => ({ candidate: i ? 'B' : 'A', worker: pool[0], payload: payloads[i], task: null, audioRef: null, attempts: 0 })) };
    await save(env, jobId, state);
    return processing(request, jobId, state, 42, 'SONARA Fast: batch nativo di 2 brani sulla T4');
  } catch (error) {
    return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

async function launchMissing(state, env) {
  state.slots = await Promise.all(state.slots.map(async (slot, index) => {
    if (slot.audioRef || slot.task || slot.attempts >= MAX_ATTEMPTS) return slot;
    const task = await submit(slot.worker, env, fastPayload(slot.payload, index, slot.attempts + 1));
    return { ...slot, task, attempts: slot.attempts + 1 };
  }));
  state.updatedAt = Date.now();
  return state;
}

async function pollSlots(request, env, jobId, state) {
  const results = await Promise.all(state.slots.map(async (slot, index) => slot.audioRef || !slot.task ? { index, task: null } : { index, task: await query(slot.task, env) }));
  let pending = false;
  for (const { index, task } of results) {
    const slot = state.slots[index];
    if (slot.audioRef || !slot.task) continue;
    if (!task || Number(task.status) === 0) { pending = true; continue; }
    if (Number(task.status) === 1) {
      const ref = refsFrom(task, slot.task)[0];
      if (ref) { slot.audioRef = ref; slot.task = null; continue; }
    }
    slot.lastError = String(task?.error || task?.message || `Brano ${slot.candidate} non completato.`);
    slot.task = null;
  }
  if (state.slots.every(slot => slot.audioRef)) { await save(env, jobId, state); return completed(request, jobId, state); }
  const exhausted = state.slots.find(slot => !slot.audioRef && !slot.task && slot.attempts >= MAX_ATTEMPTS);
  if (exhausted) return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: exhausted.lastError || `Brano ${exhausted.candidate} non completato dopo il recupero automatico.` });
  if (!pending || state.slots.some(slot => !slot.audioRef && !slot.task)) state = await launchMissing(state, env);
  await save(env, jobId, state);
  const ready = state.slots.filter(slot => slot.audioRef).length;
  return processing(request, jobId, state, ready ? 92 : 82, ready ? 'SONARA Fast: primo brano pronto, completamento automatico del secondo' : 'SONARA Fast: rendering accelerato dei due brani');
}

async function poll(request, env, jobId) {
  let state = await load(env, jobId);
  if (!state) return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: 'Job SONARA non trovato. Avvia una nuova generazione.' }, 404);
  try {
    if (state.mode === 'batch') {
      const task = await query(state.batchTask, env);
      if (!task || Number(task.status) === 0) return processing(request, jobId, state, 76, 'SONARA Fast: rendering batch di 2 brani');
      if (Number(task.status) === 1) {
        const refs = refsFrom(task, state.batchTask).slice(0, 2);
        refs.forEach((ref, i) => { if (state.slots[i]) state.slots[i].audioRef = ref; });
        if (state.slots.every(slot => slot.audioRef)) { await save(env, jobId, state); return completed(request, jobId, state); }
      }
      state.mode = 'slots';
      state = await launchMissing(state, env);
      await save(env, jobId, state);
      return processing(request, jobId, state, state.slots.some(slot => slot.audioRef) ? 89 : 78,
        state.slots.some(slot => slot.audioRef) ? 'SONARA Fast: batch parziale, rigenerazione automatica del solo brano mancante' : 'SONARA Fast: recupero automatico dei 2 brani');
    }
    return pollSlots(request, env, jobId, state);
  } catch (error) {
    state.failures = Number(state.failures || 0) + 1;
    await save(env, jobId, state).catch(() => undefined);
    if (state.failures >= 6) return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: error instanceof Error ? error.message : String(error) });
    return processing(request, jobId, state, 84, `SONARA Fast: riconnessione T4 (${state.failures}/6)`);
  }
}

async function decorateHealth(request, response, env) {
  try {
    const data = await response.clone().json();
    return json(request, { ...data, resilientDual: true, resilientDualProfile: PROFILE, resilientDualInferenceSteps: STEPS, resilientDualAutomaticMissingTrackRecovery: true, resilientDualDurableState: Boolean(env?.SONARA_JOB_STATE) }, response.status);
  } catch { return response; }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });
    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/music\/job\/(d16pair_[^/]+)$/);
    if (request.method === 'GET' && match) return poll(request, env, decodeURIComponent(match[1]));
    if (url.pathname === '/api/engine/generate' && request.method === 'POST') {
      if (!authorized(request, env)) return json(request, { error: 'Unauthorized SONARA generation proxy.' }, 401);
      const authoritative = await rewriteGenerationRequest(request);
      let body;
      try { body = await authoritative.clone().json(); } catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }
      if (body?.dualFast === true && Number(body?.candidateCount || 0) === 2) return start(request, env, body);
      return engineV18.fetch(authoritative, env, ctx);
    }
    const response = await engineV18.fetch(request, env, ctx);
    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/api/health' || url.pathname === '/api/engine/ready')) return decorateHealth(request, response, env);
    return response;
  }
};
