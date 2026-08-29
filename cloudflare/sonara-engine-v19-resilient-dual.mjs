import engineV18 from './sonara-engine-v18-fast-hq.mjs';
import { buildV17Payload } from './sonara-engine-v17-lm-composer.mjs';
import { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';
export { SonaraJobState } from './sonara-job-state-do.mjs';

const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/resilient-dual-v21-max-speed/';
const CACHE_TTL = 3 * 60 * 60;
const STEPS = 4;
const HEALTH_TIMEOUT = 2_500;
const SUBMIT_TIMEOUT = 120_000;
const QUERY_TIMEOUT = 8_000;
const MAX_ATTEMPTS = 2;
const PROFILE = 'dual-t4-max-speed-v21';

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
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge,X-Sonara-Real-Prompt',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Music-Quality,X-Sonara-Speed-Profile,X-Sonara-Real-Prompt',
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
    'x-sonara-real-prompt': 'authoritative-max-speed-v21',
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
  const visit = value => {
    if (!value) return;
    if (typeof value === 'string') {
      let path = '';
      try { path = new URL(value, `${taskRef.baseUrl}/`).searchParams.get('path') || ''; } catch {}
      if (!path && value.startsWith('/') && !value.startsWith('/v1/audio')) path = value;
      if (path) {
        const key = `${taskRef.workerId}:${path}`;
        if (!seen.has(key)) { seen.add(key); refs.push({ workerId: taskRef.workerId, path }); }
      }
      return;
    }
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (typeof value === 'object') {
      for (const key of ['file','url','audio_path','audio_file','path','output','outputs','audio','audios']) {
        if (key in value) visit(value[key]);
      }
    }
  };
  items(task?.result).forEach(visit);
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

function realPayload(payload, slot, attempt = 0) {
  const seed = Math.max(1, Number(payload?.seed) > 0 ? Number(payload.seed) : Math.floor(Date.now() % 2_000_000_000));
  const candidateDirection = slot === 0
    ? 'CANDIDATE A: prioritize composition, groove architecture, hook identity and section development while obeying the full creator brief.'
    : 'CANDIDATE B: preserve every technical/style lock but create a materially different melodic contour, voicing, performance detail, transitions and sound-palette balance.';
  return {
    ...payload,
    prompt: `${String(payload.prompt || '')}\n\nSONARA MAX-SPEED V21 REAL CREATIVE CONTROLS. ${candidateDirection} Weirdness is an active 5Hz LM sampling control through temperature and top-p. Style Influence is an active 5Hz LM guidance control through LM CFG. Obey BPM, duration, genre, mood, key and lyrics exactly.`.slice(0, 12000),
    inference_steps: STEPS,
    batch_size: 1,
    use_random_seed: false,
    seed: seed + (slot + 1) * 104729 + attempt * 7919,
    thinking: true,
    use_format: true,
    use_cot_metas: false,
    use_cot_caption: true,
    use_cot_language: true,
    constrained_decoding: true,
    allow_lm_batch: false
  };
}

function creativeControlAudit(state) {
  const payloads = Array.isArray(state?.payloads) ? state.payloads.slice(0, 2) : [];
  return payloads.map((payload, index) => ({
    candidate: index === 0 ? 'A' : 'B',
    lmTemperature: Number(payload?.lm_temperature),
    lmCfgScale: Number(payload?.lm_cfg_scale),
    lmTopP: Number(payload?.lm_top_p),
    lmRepetitionPenalty: Number(payload?.lm_repetition_penalty),
    thinking: true
  }));
}

function audioUrl(ref) { return `${PUBLIC_API_ORIGIN}/api/modal/audio?sonara_worker=${encodeURIComponent(ref.workerId)}&path=${encodeURIComponent(ref.path)}`; }
function completed(request, jobId, state) {
  const refs = state.slots.map(slot => slot.audioRef).filter(Boolean).slice(0, 2);
  const urls = refs.map(audioUrl);
  return json(request, { jobId, status: 'COMPLETED', progress: 100, audioUrl: urls[0] || null, audioUrls: urls,
    candidates: urls.map((url, index) => ({ id: index ? 'B' : 'A', audioUrl: url, audioFormat: 'wav', strategy: index ? 'max-speed-detail' : 'max-speed-structure', inferenceSteps: STEPS })),
    metadata: { engine: 'SONARA ACE-Step 1.5 Turbo Dual T4 + 5Hz LM', candidateCount: urls.length, inferenceSteps: STEPS, speedProfile: PROFILE, maxSpeed: true, realPrompt: true, lmThinking: true, cotCaption: true, constrainedDecoding: true, creativeControlsReal: true, weirdnessReal: true, styleInfluenceReal: true, creativeControlEngine: '5Hz-LM-sampling-and-CFG', candidateCreativeControls: creativeControlAudit(state), automaticMissingTrackRecovery: true, durableJobState: true, currentStage: '2 brani SONARA REAL CONTROLS pronti' } });
}
function processing(request, jobId, state, progress, stage) {
  return json(request, { jobId, status: 'PROCESSING', progress, retryable: true,
    metadata: { engine: 'SONARA ACE-Step 1.5 Turbo Dual T4 + 5Hz LM', candidateCount: 2, readyCount: state.slots.filter(slot => slot.audioRef).length, inferenceSteps: STEPS, speedProfile: PROFILE, maxSpeed: true, realPrompt: true, lmThinking: true, creativeControlsReal: true, weirdnessReal: true, styleInfluenceReal: true, creativeControlEngine: '5Hz-LM-sampling-and-CFG', candidateCreativeControls: creativeControlAudit(state), automaticMissingTrackRecovery: true, durableJobState: true, currentStage: stage } });
}

async function start(request, env, body) {
  const configured = workers(env);
  const pool = configured.length >= 2 ? configured.slice(0, 2) : await healthy(env);
  if (!pool.length) return json(request, { status: 'FAILED', progress: 0, retryable: true, error: 'Nessuna T4 SONARA raggiungibile.' }, 503);
  const seed = Math.max(1, Math.floor(Date.now() % 2_000_000_000));
  const payloads = [buildV17Payload(body, 'structure', seed + 7919), buildV17Payload(body, 'detail', seed + 15838)];
  const jobId = `d16pair_${crypto.randomUUID()}`;
  const base = { createdAt: Date.now(), updatedAt: Date.now(), payloads, failures: 0, speedProfile: PROFILE, maxSpeed: true, realPrompt: true, lmThinking: true, creativeControlsReal: true };
  try {
    if (pool.length >= 2) {
      const tasks = await Promise.all([submit(pool[0], env, realPayload(payloads[0], 0)), submit(pool[1], env, realPayload(payloads[1], 1))]);
      const state = { ...base, mode: 'slots', slots: tasks.map((task, i) => ({ candidate: i ? 'B' : 'A', worker: pool[i], payload: payloads[i], task, audioRef: null, attempts: 1 })) };
      await save(env, jobId, state);
      return processing(request, jobId, state, 42, 'SONARA REAL CONTROLS: 5Hz LM + GPU0/GPU1 stanno generando i 2 brani in parallelo');
    }

    const firstTask = await submit(pool[0], env, realPayload(payloads[0], 0));
    const state = {
      ...base,
      mode: 'slots',
      sequentialSingleWorker: true,
      slots: [
        { candidate: 'A', worker: pool[0], payload: payloads[0], task: firstTask, audioRef: null, attempts: 1 },
        { candidate: 'B', worker: pool[0], payload: payloads[1], task: null, audioRef: null, attempts: 0 }
      ]
    };
    await save(env, jobId, state);
    return processing(request, jobId, state, 30, 'SONARA REAL CONTROLS: rendering sulla T4 disponibile con 5Hz LM attivo');
  } catch (error) {
    return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

async function launchMissing(state, env) {
  if (state.slots.some(slot => slot.task && !slot.audioRef)) return state;
  const index = state.slots.findIndex(slot => !slot.audioRef && !slot.task && slot.attempts < MAX_ATTEMPTS);
  if (index < 0) return state;
  const slot = state.slots[index];
  const task = await submit(slot.worker, env, realPayload(slot.payload, index, slot.attempts + 1));
  state.slots[index] = { ...slot, task, attempts: slot.attempts + 1 };
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
  if (exhausted) return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: exhausted.lastError || `Brano ${exhausted.candidate} non completato dopo il recupero automatico.` }, 502);
  if (!pending || state.slots.some(slot => !slot.audioRef && !slot.task)) state = await launchMissing(state, env);
  await save(env, jobId, state);
  const ready = state.slots.filter(slot => slot.audioRef).length;
  return processing(request, jobId, state, ready ? 84 + ready * 8 : 68, ready ? 'SONARA REAL CONTROLS: primo brano pronto, seconda T4 ancora in rendering' : 'SONARA REAL CONTROLS: 5Hz LM + rendering parallelo su entrambe le T4');
}

async function poll(request, env, jobId) {
  let state = await load(env, jobId);
  if (!state) return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: 'Job SONARA non trovato. Avvia una nuova generazione.' }, 404);
  try {
    return pollSlots(request, env, jobId, state);
  } catch (error) {
    state.failures = Number(state.failures || 0) + 1;
    await save(env, jobId, state).catch(() => undefined);
    if (state.failures >= 6) return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: error instanceof Error ? error.message : String(error) }, 502);
    return processing(request, jobId, state, 70, `SONARA REAL CONTROLS: riconnessione T4 (${state.failures}/6)`);
  }
}

async function decorateHealth(request, response, env) {
  try {
    const data = await response.clone().json();
    return json(request, { ...data, resilientDual: true, resilientDualProfile: PROFILE, resilientDualInferenceSteps: STEPS, resilientDualAutomaticMissingTrackRecovery: true, resilientDualDurableState: Boolean(env?.SONARA_JOB_STATE), maxSpeed: true, realPromptEngine: true, realPromptVersion: 'v21-dual-t4-max-speed', realPromptLmThinking: true, realPromptCotCaption: true, realPromptConstrainedDecoding: true, realCreativeControls: true, weirdnessReal: true, styleInfluenceReal: true, creativeControlEngine: '5Hz-LM-sampling-and-CFG' }, response.status);
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
