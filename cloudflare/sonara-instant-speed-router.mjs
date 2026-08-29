import studioMaxRuntime from './sonara-studio-max-router.mjs';
import { buildStudioPayload } from './sonara-engine-v16-studio-quality.mjs';
import { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';
export { SonaraJobState } from './sonara-studio-max-router.mjs';

const SPEED_VERSION = 'sonara-instant-dual-v1';
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/stable-dual-v20/';
const CACHE_TTL = 3 * 60 * 60;
const FAST_STEPS = 4;
const DETAIL_STEPS = 5;
const QUERY_TIMEOUT = 6_000;
const SUBMIT_TIMEOUT = 35_000;
const FAST_STALL_MS = 45_000;

const SPEED_CLIENT = `<script id="sonara-instant-dual-v1">(()=>{
if(window.__sonaraInstantDualV1)return;window.__sonaraInstantDualV1=true;
const nativeFetch=window.fetch.bind(window);
const PANEL_ID='sonara-instant-ready-panel';
const ensurePanel=()=>{let p=document.getElementById(PANEL_ID);if(p)return p;const host=document.querySelector('[data-sonara-dual-generator-host]');if(!host)return null;p=document.createElement('div');p.id=PANEL_ID;p.style.cssText='margin-top:12px;border:1px solid rgba(34,211,238,.24);background:rgba(8,47,73,.18);border-radius:14px;padding:12px;display:none';host.appendChild(p);return p};
const showReady=(data)=>{const urls=Array.isArray(data?.audioUrls)?data.audioUrls.filter(Boolean):[];if(!urls.length&&data?.audioUrl)urls.push(data.audioUrl);const p=ensurePanel();if(!p)return;if(!urls.length){if(String(data?.status||'').toUpperCase()==='COMPLETED')p.remove();return}p.style.display='block';p.innerHTML='<div style="font-size:11px;font-weight:900;color:#a5f3fc;margin-bottom:8px">⚡ SONARA INSTANT — PRIMO BRANO GIÀ ASCOLTABILE</div>'+urls.map((url,i)=>'<div style="margin-top:8px"><div style="font-size:10px;color:#94a3b8;margin-bottom:5px">Brano '+(i===0?'A':'B')+' pronto · l’altra versione continua in background</div><audio controls preload="metadata" style="width:100%" src="'+String(url).replace(/\"/g,'&quot;')+'"></audio></div>').join('')};
window.fetch=async(input,init)=>{const response=await nativeFetch(input,init);try{const req=input instanceof Request?input:new Request(input,init);const u=new URL(req.url,location.origin);if(req.method.toUpperCase()==='GET'&&/^\\/api\\/music\\/job\\/d16pair_/.test(u.pathname)){response.clone().json().then(showReady).catch(()=>{})}}catch{}return response};
})();</script>`;

const cleanUrl = value => String(value || '').trim().replace(/\/$/, '');
const workerUrls = env => String(env.ACESTEP_WORKER_URLS || env.ACE_STEP_API_URLS || env.SONARA_ACE_STEP_WORKERS || '')
  .split(/[\s,;]+/).map(cleanUrl).filter(url => /^https?:\/\//i.test(url)).slice(0, 4);
const workers = env => workerUrls(env).map((baseUrl, index) => ({ id: `t4-${index}`, baseUrl, kind: 'kaggle', index }));

function cors(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set(['https://sonaraenterprise.com', 'https://www.sonaraenterprise.com', PUBLIC_API_ORIGIN]);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge,X-Sonara-Real-Prompt',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Speed-Profile,X-Sonara-Job-Recovery',
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
      'x-sonara-speed-profile': SPEED_VERSION,
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

function creativeValues(body = {}) {
  return {
    weirdness: Math.round(clamp(body.weirdness, 50, 0, 100)),
    styleInfluence: Math.round(clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100))
  };
}

function fastPayload(body, slot, seed) {
  const base = buildStudioPayload(body, slot === 0 ? 'structure' : 'detail', seed);
  const controls = creativeValues(body);
  const steps = slot === 0 ? FAST_STEPS : DETAIL_STEPS;
  const candidateContract = String(slot === 0
    ? body.sonaraStudioMaxCandidateA || 'Candidate A: maximize hook, groove and immediate structure with decisive musical choices.'
    : body.sonaraStudioMaxCandidateB || 'Candidate B: preserve all creator locks while using a clearly different melody, voicing, transition language and timbral balance.');
  const locks = [
    body.sonaraStudioMaxHookContract,
    body.sonaraStudioMaxVocalContract,
    body.sonaraStudioMaxContinuityContract,
    body.sonaraStudioMaxArrangementContract,
    body.sonaraStudioMaxProductionContract
  ].filter(Boolean).join(' ');
  const variation = controls.weirdness >= 70
    ? 'Use bold but coherent musical variation.'
    : controls.weirdness <= 30
      ? 'Use conservative, highly coherent musical development.'
      : 'Use balanced creative variation.';
  const adherence = controls.styleInfluence >= 70
    ? 'Follow the selected genre and subgenre fingerprint very strictly.'
    : controls.styleInfluence <= 30
      ? 'Allow broader interpretation while preserving the core genre.'
      : 'Keep balanced style adherence.';

  const prompt = `${String(base.prompt || body.prompt || '')}\n\nSONARA INSTANT DUAL ${slot === 0 ? 'FAST LANE' : 'DETAIL LANE'} ${steps}-STEP TURBO. ${candidateContract} ${locks} ${variation} ${adherence} Weirdness=${controls.weirdness}/100. Style Influence=${controls.styleInfluence}/100. Preserve exact BPM, duration, key, lyrics, genre and subgenre. Do not add analysis text; render audio immediately.`.slice(0, 12000);

  const payload = {
    ...base,
    prompt,
    inference_steps: steps,
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
  for (const key of Object.keys(payload)) if (key.startsWith('lm_')) delete payload[key];
  return payload;
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
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`ACE-Step ${worker.id}: JSON non valido.`); }
  if (!response.ok || Number(data?.code || 200) >= 400) throw new Error(String(data?.error?.message || data?.error || data?.message || `ACE-Step HTTP ${response.status}`));
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error(`ACE-Step ${worker.id}: task_id mancante.`);
  return { workerId: worker.id, baseUrl: worker.baseUrl, taskId: String(taskId), queuePosition: Number(data?.data?.queue_position || 0) };
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
  try { data = raw ? JSON.parse(raw) : {}; } catch { throw new Error(`ACE-Step ${task.workerId}: query JSON non valido.`); }
  if (!response.ok || Number(data?.code || 200) >= 400) throw new Error(String(data?.error?.message || data?.error || data?.message || `ACE-Step query HTTP ${response.status}`));
  return data?.data?.[0] || null;
}

function resultItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? parsed : parsed ? [parsed] : []; } catch { return []; }
  }
  return value && typeof value === 'object' ? [value] : [];
}

function resultInfo(task) {
  const first = resultItems(task?.result)[0] || {};
  const rawProgress = Number(first?.progress ?? task?.progress ?? 0);
  const normalized = Number.isFinite(rawProgress) ? (rawProgress <= 1 ? rawProgress * 100 : rawProgress) : 0;
  return {
    progress: Math.max(0, Math.min(100, normalized)),
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
      if (path) {
        const key = `${taskRef.workerId}:${path}`;
        if (!seen.has(key)) { seen.add(key); refs.push({ workerId: taskRef.workerId, path }); }
      }
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

const cacheUrl = jobId => `${CACHE_PREFIX}${encodeURIComponent(jobId)}`;
function stateStub(env, jobId) {
  try { return env?.SONARA_JOB_STATE ? env.SONARA_JOB_STATE.get(env.SONARA_JOB_STATE.idFromName(jobId)) : null; } catch { return null; }
}
async function saveState(env, jobId, state) {
  const stub = stateStub(env, jobId);
  if (stub) {
    const response = await stub.fetch('https://sonara.internal/state', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state) });
    if (!response.ok) throw new Error(`SONARA state persistence HTTP ${response.status}`);
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

function audioUrl(ref) {
  return `${PUBLIC_API_ORIGIN}/api/modal/audio?sonara_worker=${encodeURIComponent(ref.workerId)}&path=${encodeURIComponent(ref.path)}`;
}

function availableCandidates(state) {
  return (state?.slots || []).map((slot, index) => slot.audioRef ? {
    id: index === 0 ? 'A' : 'B',
    audioUrl: audioUrl(slot.audioRef),
    audioFormat: 'wav',
    strategy: index === 0 ? 'instant-fast-lane' : 'instant-detail-lane',
    inferenceSteps: Number(slot?.payload?.inference_steps || (index === 0 ? FAST_STEPS : DETAIL_STEPS))
  } : null).filter(Boolean);
}

function visibleProgress(state) {
  const slots = Array.isArray(state?.slots) ? state.slots : [];
  const ready = slots.filter(slot => slot.audioRef).length;
  const live = slots.filter(slot => !slot.audioRef).map(slot => Number(slot.lastProgress || 0));
  const avg = live.length ? live.reduce((sum, value) => sum + value, 0) / live.length : 100;
  return ready === 2 ? 100 : Math.max(18, Math.min(96, Math.round(18 + ready * 39 + avg * 0.38)));
}

function processing(request, jobId, state, stage) {
  const candidates = availableCandidates(state);
  const urls = candidates.map(candidate => candidate.audioUrl);
  return json(request, {
    jobId,
    status: 'PROCESSING',
    progress: visibleProgress(state),
    retryable: true,
    audioUrl: urls[0] || null,
    audioUrls: urls,
    candidates,
    metadata: {
      engine: 'SONARA ACE-Step Instant Dual T4',
      speedProfile: SPEED_VERSION,
      progressiveDelivery: true,
      fastLaneSteps: FAST_STEPS,
      detailLaneSteps: DETAIL_STEPS,
      readyCount: candidates.length,
      candidateCount: 2,
      currentStage: stage
    }
  });
}

function completed(request, jobId, state) {
  const candidates = availableCandidates(state);
  return json(request, {
    jobId,
    status: 'COMPLETED',
    progress: 100,
    audioUrl: candidates[0]?.audioUrl || null,
    audioUrls: candidates.map(candidate => candidate.audioUrl),
    candidates,
    metadata: {
      engine: 'SONARA ACE-Step Instant Dual T4',
      speedProfile: SPEED_VERSION,
      progressiveDelivery: true,
      fastLaneSteps: FAST_STEPS,
      detailLaneSteps: DETAIL_STEPS,
      readyCount: candidates.length,
      candidateCount: 2,
      currentStage: '2 brani SONARA Instant pronti'
    }
  });
}

async function startInstant(request, env) {
  if (!authorized(request, env)) return json(request, { error: 'Unauthorized SONARA generation proxy.' }, 401);
  const authoritative = await rewriteGenerationRequest(request);
  let body;
  try { body = await authoritative.clone().json(); } catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }
  if (body?.dualFast !== true || Number(body?.candidateCount || 0) !== 2) return studioMaxRuntime.fetch(authoritative, env);

  const pool = workers(env).slice(0, 2);
  if (pool.length < 2) return json(request, { status: 'FAILED', progress: 0, retryable: true, error: 'Servono due worker T4 SONARA configurati.' }, 503);
  const controls = creativeValues(body);
  const seed = Math.max(1, Number(body?.seed) > 0 ? Number(body.seed) : Math.floor(Date.now() % 2_000_000_000));
  const payloads = [fastPayload(body, 0, seed + 104729), fastPayload(body, 1, seed + 209759)];
  const jobId = `d16pair_${crypto.randomUUID()}`;
  try {
    const settled = await Promise.allSettled([
      submit(pool[0], env, payloads[0]),
      submit(pool[1], env, payloads[1])
    ]);
    if (settled.some(result => result.status === 'rejected')) {
      const reason = settled.find(result => result.status === 'rejected');
      throw reason?.reason || new Error('Avvio T4 non riuscito.');
    }
    const tasks = settled.map(result => result.value);
    const now = Date.now();
    const state = {
      createdAt: now,
      updatedAt: now,
      controls,
      speedProfile: SPEED_VERSION,
      payloads,
      slots: tasks.map((task, index) => ({
        candidate: index === 0 ? 'A' : 'B',
        worker: pool[index],
        payload: payloads[index],
        task,
        audioRef: null,
        attempts: 1,
        queryFailures: 0,
        lastProgress: 0,
        lastProgressAt: now,
        lastStage: 'queued'
      }))
    };
    await saveState(env, jobId, state);
    return processing(request, jobId, state, 'GPU0 Fast Lane 4-step + GPU1 Detail Lane 5-step avviate in parallelo');
  } catch (error) {
    return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: error instanceof Error ? error.message : String(error) }, 502);
  }
}

async function fastPoll(request, env, ctx, jobId) {
  const state = await loadState(env, jobId);
  if (!state || !Array.isArray(state.slots)) return studioMaxRuntime.fetch(request, env, ctx);
  if (state.slots.every(slot => slot.audioRef)) return completed(request, jobId, state);

  const now = Date.now();
  const active = state.slots.map((slot, index) => ({ slot, index })).filter(({ slot }) => !slot.audioRef && slot.task);
  const settled = await Promise.allSettled(active.map(({ slot }) => query(slot.task, env)));
  let needsRecovery = false;

  for (let i = 0; i < active.length; i++) {
    const { slot } = active[i];
    const outcome = settled[i];
    if (outcome.status === 'rejected') {
      slot.queryFailures = Number(slot.queryFailures || 0) + 1;
      slot.lastQueryError = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
      if (now - Number(slot.lastProgressAt || state.createdAt || now) >= FAST_STALL_MS) needsRecovery = true;
      continue;
    }

    slot.queryFailures = 0;
    slot.lastQueryError = '';
    const task = outcome.value;
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
      } else {
        needsRecovery = true;
      }
      continue;
    }

    if (status !== 0) {
      needsRecovery = true;
      continue;
    }

    const previous = Number(slot.lastProgress || 0);
    if (info.progress > previous + 0.05) {
      slot.lastProgress = info.progress;
      slot.lastProgressAt = now;
    }
    if (info.stage) slot.lastStage = info.stage;
    if (now - Number(slot.lastProgressAt || state.createdAt || now) >= FAST_STALL_MS) needsRecovery = true;
  }

  state.updatedAt = now;
  await saveState(env, jobId, state);
  if (needsRecovery) return studioMaxRuntime.fetch(request, env, ctx);
  if (state.slots.every(slot => slot.audioRef)) return completed(request, jobId, state);

  const ready = state.slots.filter(slot => slot.audioRef).length;
  const stages = state.slots.filter(slot => !slot.audioRef).map(slot => `${slot.candidate}: ${slot.lastStage || 'rendering'} ${Math.round(Number(slot.lastProgress || 0))}%`);
  const stage = ready > 0 ? `⚡ ${ready} brano pronto da ascoltare · ${stages.join(' | ')}` : stages.join(' | ') || 'rendering parallelo';
  return processing(request, jobId, state, stage);
}

function withSpeedHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-speed-profile', SPEED_VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function injectSpeedClient(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return withSpeedHeaders(response);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-speed-profile', SPEED_VERSION);
  const safe = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter().on('head', { element(el) { el.append(SPEED_CLIENT, { html: true }); } }).transform(safe);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(request) });

    const jobMatch = url.pathname.match(/^\/api\/music\/job\/(d16pair_[^/]+)$/);
    if (request.method === 'GET' && jobMatch) {
      try { return await fastPoll(request, env, ctx, decodeURIComponent(jobMatch[1])); }
      catch { return withSpeedHeaders(await studioMaxRuntime.fetch(request, env, ctx)); }
    }

    if (request.method === 'POST' && url.pathname === '/api/engine/generate') {
      let dualFast = false;
      try {
        const body = await request.clone().json();
        dualFast = body?.dualFast === true && Number(body?.candidateCount || 0) === 2;
      } catch {}
      if (dualFast) return startInstant(request, env);
    }

    const response = await studioMaxRuntime.fetch(request, env, ctx);
    const publicHost = url.hostname === 'sonaraenterprise.com' || url.hostname === 'www.sonaraenterprise.com';
    if (publicHost && request.method === 'GET') return injectSpeedClient(response);
    return withSpeedHeaders(response);
  }
};
