import engineV18 from './sonara-engine-v18-fast-hq.mjs';
import { buildStudioPayload } from './sonara-engine-v16-studio-quality.mjs';
import { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';
export { SonaraJobState } from './sonara-job-state-do.mjs';

const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/stable-dual-v20/';
const CACHE_TTL = 3 * 60 * 60;
const STEPS = 4;
const QUERY_TIMEOUT = 12_000;
const SUBMIT_TIMEOUT = 60_000;
const STALL_MS = 180_000;
const MAX_ATTEMPTS = 2;
const PROFILE = 'dual-t4-render-only-v24';

const cleanUrl = value => String(value || '').trim().replace(/\/$/, '');
const workerUrls = env => String(env.ACESTEP_WORKER_URLS || env.ACE_STEP_API_URLS || env.SONARA_ACE_STEP_WORKERS || '')
  .split(/[\s,;]+/).map(cleanUrl).filter(url => /^https?:\/\//i.test(url)).slice(0, 4);
const workers = env => workerUrls(env).map((baseUrl, index) => ({ id: `t4-${index}`, baseUrl, kind: 'kaggle', index }));

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
    'x-sonara-real-prompt': 'render-only-stable-v24',
    ...cors(request)
  }});
}

function authorized(request, env) {
  const required = String(env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  return !required || String(request.headers.get('X-Sonara-Internal-Secret') || '').trim() === required;
}

function clamp(value, fallback, min, max) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function creativeValues(body = {}) {
  return {
    weirdness: Math.round(clamp(body.weirdness, 50, 0, 100)),
    styleInfluence: Math.round(clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100))
  };
}

function stablePayload(body, slot, seed) {
  const base = buildStudioPayload(body, slot === 0 ? 'structure' : 'detail', seed);
  const controls = creativeValues(body);
  const variation = controls.weirdness >= 70
    ? 'Use adventurous melodic variation, unusual transitions and bolder sound-design choices while remaining musically coherent.'
    : controls.weirdness <= 30
      ? 'Use conservative, highly coherent melodic development and familiar production choices.'
      : 'Use balanced creative variation with coherent musical development.';
  const adherence = controls.styleInfluence >= 70
    ? 'Follow the selected genre, subgenre, atmosphere and production fingerprint very strictly.'
    : controls.styleInfluence <= 30
      ? 'Allow broader stylistic interpretation while preserving the selected core genre.'
      : 'Keep a balanced adherence to the selected style fingerprint.';
  const candidate = slot === 0
    ? 'Candidate A: emphasize groove, hook identity and section architecture.'
    : 'Candidate B: keep all technical locks but use a different melodic contour, voicing, transitions and sound-palette balance.';

  const payload = {
    ...base,
    prompt: `${String(base.prompt || body.prompt || '')}\n\nSONARA STABLE T4 RENDER MODE. ${candidate} ${variation} ${adherence} Weirdness=${controls.weirdness}/100. Style Influence=${controls.styleInfluence}/100. Obey BPM, duration, key, lyrics, genre and subgenre exactly.`.slice(0, 12000),
    inference_steps: STEPS,
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
    allow_lm_batch: false
  };

  for (const key of Object.keys(payload)) {
    if (key.startsWith('lm_')) delete payload[key];
  }
  return payload;
}

async function submit(worker, env, payload) {
  const response = await fetch(`${worker.baseUrl}/release_task`, {
    method: 'POST',
    headers: headers(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT)
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`ACE-Step ${worker.id}: JSON non valido.`); }
  if (!response.ok || Number(data?.code || 200) >= 400) throw new Error(String(data?.error?.message || data?.error || data?.message || `ACE-Step HTTP ${response.status}`));
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error(`ACE-Step ${worker.id}: task_id mancante.`);
  return { workerId: worker.id, baseUrl: worker.baseUrl, taskId: String(taskId), queuePosition: Number(data?.data?.queue_position || 0) };
}

async function query(task, env) {
  const response = await fetch(`${task.baseUrl}/query_result`, {
    method: 'POST',
    headers: headers(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({ task_id_list: [task.taskId] }),
    signal: AbortSignal.timeout(QUERY_TIMEOUT)
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

function resultInfo(task) {
  const first = items(task?.result)[0] || {};
  const rawProgress = Number(first?.progress ?? task?.progress ?? 0);
  const normalized = Number.isFinite(rawProgress) ? (rawProgress <= 1 ? rawProgress * 100 : rawProgress) : 0;
  return {
    progress: Math.max(0, Math.min(100, normalized)),
    stage: String(first?.stage || task?.stage || task?.progress_text || '').trim(),
    first
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
      if (path) {
        const k = `${taskRef.workerId}:${path}`;
        if (!seen.has(k)) { seen.add(k); refs.push({ workerId: taskRef.workerId, path }); }
      }
      return;
    }
    if (Array.isArray(value)) return value.forEach(visit);
    if (typeof value === 'object') {
      for (const key of ['file','url','audio_path','audio_file','path','output','outputs','audio','audios','wave']) if (key in value) visit(value[key]);
    }
  };
  items(task?.result).forEach(visit);
  return refs;
}

const cacheUrl = jobId => `${CACHE_PREFIX}${encodeURIComponent(jobId)}`;
function stateStub(env, jobId) {
  try {
    if (!env?.SONARA_JOB_STATE) return null;
    return env.SONARA_JOB_STATE.get(env.SONARA_JOB_STATE.idFromName(jobId));
  } catch { return null; }
}
async function save(env, jobId, state) {
  const stub = stateStub(env, jobId);
  if (stub) {
    const response = await stub.fetch('https://sonara.internal/state', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) });
    if (!response.ok) throw new Error(`SONARA state persistence HTTP ${response.status}`);
  }
  await caches.default.put(new Request(cacheUrl(jobId)), new Response(JSON.stringify(state), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${CACHE_TTL}` } })).catch(() => undefined);
}
async function load(env, jobId) {
  const stub = stateStub(env, jobId);
  if (stub) {
    try { const r = await stub.fetch('https://sonara.internal/state'); if (r.ok) return await r.json(); } catch {}
  }
  try { const r = await caches.default.match(new Request(cacheUrl(jobId))); return r ? await r.json() : null; } catch { return null; }
}

function audioUrl(ref) {
  return `${PUBLIC_API_ORIGIN}/api/modal/audio?sonara_worker=${encodeURIComponent(ref.workerId)}&path=${encodeURIComponent(ref.path)}`;
}

function responseMeta(state, stage) {
  const controls = state.controls || { weirdness: 50, styleInfluence: 50 };
  return {
    engine: 'SONARA ACE-Step 1.5 Turbo Dual T4 Stable Render',
    candidateCount: 2,
    readyCount: state.slots.filter(s => s.audioRef).length,
    inferenceSteps: STEPS,
    speedProfile: PROFILE,
    renderOnly: true,
    lmThinking: false,
    creativeControlsReal: true,
    weirdnessReal: true,
    styleInfluenceReal: true,
    creativeControlEngine: 'prompt-adherence-seed-variation',
    weirdness: controls.weirdness,
    styleInfluence: controls.styleInfluence,
    automaticStallRecovery: true,
    stallTimeoutSeconds: STALL_MS / 1000,
    durableJobState: true,
    currentStage: stage
  };
}

function processing(request, jobId, state, stage) {
  const slots = state.slots;
  const ready = slots.filter(s => s.audioRef).length;
  const live = slots.filter(s => !s.audioRef).map(s => Number(s.lastProgress || 0));
  const avg = live.length ? live.reduce((a,b) => a+b, 0) / live.length : 100;
  const progress = ready === 2 ? 100 : Math.max(30, Math.min(95, Math.round(30 + ready * 30 + avg * 0.32)));
  return json(request, { jobId, status: 'PROCESSING', progress, retryable: true, metadata: responseMeta(state, stage) });
}

function completed(request, jobId, state) {
  const urls = state.slots.map(s => s.audioRef).filter(Boolean).slice(0,2).map(audioUrl);
  return json(request, {
    jobId,
    status: 'COMPLETED',
    progress: 100,
    audioUrl: urls[0] || null,
    audioUrls: urls,
    candidates: urls.map((url, index) => ({ id: index ? 'B' : 'A', audioUrl: url, audioFormat: 'wav', strategy: index ? 'stable-detail' : 'stable-structure', inferenceSteps: STEPS })),
    metadata: responseMeta(state, '2 brani SONARA pronti')
  });
}

async function start(request, env, body) {
  const pool = workers(env).slice(0,2);
  if (pool.length < 2) return json(request, { status: 'FAILED', progress: 0, retryable: true, error: 'Servono due worker T4 SONARA configurati.' }, 503);
  const controls = creativeValues(body);
  const seed = Math.max(1, Number(body?.seed) > 0 ? Number(body.seed) : Math.floor(Date.now() % 2_000_000_000));
  const payloads = [stablePayload(body, 0, seed + 104729), stablePayload(body, 1, seed + 209759)];
  const jobId = `d16pair_${crypto.randomUUID()}`;
  try {
    const tasks = await Promise.all([submit(pool[0], env, payloads[0]), submit(pool[1], env, payloads[1])]);
    const now = Date.now();
    const state = {
      createdAt: now,
      updatedAt: now,
      controls,
      payloads,
      slots: tasks.map((task, index) => ({
        candidate: index ? 'B' : 'A',
        worker: pool[index],
        payload: payloads[index],
        task,
        audioRef: null,
        attempts: 1,
        lastProgress: 0,
        lastProgressAt: now,
        lastStage: 'queued'
      }))
    };
    await save(env, jobId, state);
    return processing(request, jobId, state, 'GPU0/GPU1: render audio stabile in parallelo');
  } catch (error) {
    return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

async function recoverSlot(state, index, env) {
  const slot = state.slots[index];
  if (slot.audioRef || slot.task || slot.attempts >= MAX_ATTEMPTS) return;
  const pool = workers(env).slice(0,2);
  const alternate = pool[(slot.worker?.index === 0 ? 1 : 0)] || pool[index] || slot.worker;
  const task = await submit(alternate, env, slot.payload);
  state.slots[index] = { ...slot, worker: alternate, task, attempts: slot.attempts + 1, lastProgress: 0, lastProgressAt: Date.now(), lastStage: 'recovery-requeued' };
}

async function pollSlots(request, env, jobId, state) {
  const now = Date.now();
  for (let index = 0; index < state.slots.length; index++) {
    const slot = state.slots[index];
    if (slot.audioRef || !slot.task) continue;
    const task = await query(slot.task, env);
    const status = Number(task?.status ?? 0);
    const info = resultInfo(task);

    if (status === 1) {
      const ref = refsFrom(task, slot.task)[0];
      if (ref) {
        slot.audioRef = ref;
        slot.task = null;
        slot.lastProgress = 100;
        slot.lastProgressAt = now;
        slot.lastStage = 'completed';
        continue;
      }
      slot.lastError = 'Task completato ma riferimento audio mancante.';
      slot.task = null;
      continue;
    }

    if (status !== 0) {
      slot.lastError = String(task?.error || task?.message || `Brano ${slot.candidate} non completato.`);
      slot.task = null;
      continue;
    }

    if (info.progress > Number(slot.lastProgress || 0) + 0.05 || info.stage !== slot.lastStage) {
      slot.lastProgress = info.progress;
      slot.lastProgressAt = now;
      slot.lastStage = info.stage || slot.lastStage;
    } else if (now - Number(slot.lastProgressAt || state.createdAt || now) >= STALL_MS) {
      slot.lastError = `Worker ${slot.worker?.id || ''} bloccato senza avanzamento per ${STALL_MS / 1000}s.`;
      slot.task = null;
      slot.lastStage = 'stall-detected';
    }
  }

  if (state.slots.every(s => s.audioRef)) {
    await save(env, jobId, state);
    return completed(request, jobId, state);
  }

  for (let index = 0; index < state.slots.length; index++) await recoverSlot(state, index, env);

  const exhausted = state.slots.find(s => !s.audioRef && !s.task && s.attempts >= MAX_ATTEMPTS);
  if (exhausted) {
    await save(env, jobId, state);
    return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: exhausted.lastError || `Brano ${exhausted.candidate} non completato.` }, 502);
  }

  state.updatedAt = now;
  await save(env, jobId, state);
  const stages = state.slots.filter(s => !s.audioRef).map(s => `${s.candidate}: ${s.lastStage || 'rendering'} ${Math.round(Number(s.lastProgress || 0))}%`);
  return processing(request, jobId, state, stages.join(' | ') || 'rendering');
}

async function poll(request, env, jobId) {
  const state = await load(env, jobId);
  if (!state) return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: 'Job SONARA non trovato. Avvia una nuova generazione.' }, 404);
  try { return await pollSlots(request, env, jobId, state); }
  catch (error) {
    return processing(request, jobId, state, `Riconnessione T4: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function decorateHealth(request, response, env) {
  try {
    const data = await response.clone().json();
    return json(request, {
      ...data,
      stableDual: true,
      stableDualProfile: PROFILE,
      aceStepWorkerCount: workers(env).length,
      aceStepWorkers: workers(env).map(({id,kind}) => ({id,kind})),
      renderOnly: true,
      lmThinking: false,
      automaticStallRecovery: true,
      noFixed68Progress: true,
      weirdnessReal: true,
      styleInfluenceReal: true,
      creativeControlEngine: 'prompt-adherence-seed-variation'
    }, response.status);
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
