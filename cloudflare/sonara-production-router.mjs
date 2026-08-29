import onboardingRuntime from './sonara-onboarding-router.mjs';
import worldTempoRuntime from './sonara-world-tempo-router.mjs';
export { SonaraJobState } from './sonara-onboarding-router.mjs';

const WORLD_TEMPO_VERSION = 'sonara-world-tempo-v1';
const JOB_RECOVERY_VERSION = 'sonara-job-recovery-v1';
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const JOB_CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/stable-dual-v20/';
const JOB_CACHE_TTL = 3 * 60 * 60;
const JOB_QUERY_TIMEOUT = 10_000;
const JOB_STALL_MS = 75_000;
const JOB_QUERY_FAILURE_LIMIT = 2;
const JOB_MAX_ATTEMPTS = 3;

const WORLD_TEMPO_CLIENT = `<script id="sonara-world-tempo-production-v1">(()=>{
if(window.__sonaraWorldTempoProductionV1)return;window.__sonaraWorldTempoProductionV1=true;
const PROFILE='/api/tempo-profile';
const originalFetch=window.fetch.bind(window);
const prompt=()=>document.getElementById('sonara-prompt');
const section=()=>prompt()?.closest('section')||null;
const bpmInput=()=>section()?.querySelector('input[aria-label="BPM preferiti"]')||null;
const selects=()=>section()?[...section().querySelectorAll('select')]:[];
const mode=()=>{const s=section(),b=bpmInput();return String(b?.dataset?.sonaraBpmMode||s?.dataset?.sonaraBpmMode||'manual').toLowerCase()==='auto'?'auto':'manual'};
const context=()=>{const a=selects();return{family:a[0]?.value||'Electronic / Dance',genre:a[1]?.value||'House',subgenre:a[2]?.value||a[1]?.value||'House',mood:a[3]?.value||'Authentic',prompt:String(prompt()?.value||'')}};
const profileUrl=c=>{const u=new URL(PROFILE,location.origin);Object.entries(c).forEach(([k,v])=>u.searchParams.set(k,String(v||'')));return u.toString()};
const setSilent=(el,value)=>{if(!el)return;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(setter)setter.call(el,String(value));else el.value=String(value)};
const getProfile=async c=>{const r=await originalFetch(profileUrl(c),{cache:'no-store',headers:{'x-sonara-tempo-probe':WORLD_TEMPO_VERSION}});if(!r.ok)throw new Error('tempo-profile-'+r.status);return r.json()};
let timer=0,seq=0;
const sync=async()=>{if(mode()!=='auto')return;const id=++seq,c=context();try{const p=await getProfile(c);if(id!==seq||mode()!=='auto')return;const b=bpmInput();setSilent(b,p.bpm);if(b){b.dataset.sonaraAutoBpm=String(p.bpm);b.dataset.sonaraAutoBpmReason='World taxonomy: '+p.family+' > '+p.genre+' > '+p.subgenre+' · '+p.minBpm+'-'+p.maxBpm+' BPM';b.dataset.sonaraWorldTempo='true'}window.dispatchEvent(new CustomEvent('sonara:world-tempo-profile',{detail:p}))}catch(e){console.warn('[SONARA][World Tempo Auto]',e instanceof Error?e.message:String(e))}};
const schedule=()=>{clearTimeout(timer);timer=setTimeout(sync,220)};
window.fetch=async(input,init)=>{const req=input instanceof Request?input:new Request(input,init);let u;try{u=new URL(req.url,location.origin)}catch{return originalFetch(input,init)}if(req.method.toUpperCase()==='POST'&&(u.pathname==='/api/billing/generate'||u.pathname==='/api/engine/generate')&&String(req.headers.get('content-type')||'').toLowerCase().includes('application/json')){try{const body=await req.clone().json(),c=context(),m=mode(),headers=new Headers(req.headers);body.sonaraBpmMode=m;body.sonaraSelectedFamily=c.family;body.sonaraSelectedGenre=c.genre;body.sonaraSelectedSubgenre=c.subgenre;body.sonaraSelectedMood=c.mood;headers.set('x-sonara-bpm-mode',m);headers.set('x-sonara-world-tempo',WORLD_TEMPO_VERSION);if(m==='auto'){const p=await getProfile(c);body.bpm=p.bpm;body.requestedBpm=p.bpm;body.targetBpm=p.bpm;body.preferredBpm=p.bpm;body.sonaraAutoTempoProfile=p;setSilent(bpmInput(),p.bpm)}headers.delete('content-length');headers.set('content-type','application/json');return originalFetch(new Request(req.url,{method:req.method,headers,body:JSON.stringify(body),credentials:req.credentials,cache:'no-store',redirect:req.redirect}))}catch(e){console.warn('[SONARA][World Tempo Request]',e instanceof Error?e.message:String(e))}}return originalFetch(input,init)};
document.addEventListener('input',e=>{if(e.target===prompt()||e.target instanceof HTMLSelectElement)schedule()},true);
document.addEventListener('change',e=>{if(e.target===prompt()||e.target instanceof HTMLSelectElement||e.target===bpmInput())schedule()},true);
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
[250,700,1400,2400].forEach(ms=>setTimeout(schedule,ms));
})();</script>`;

const cleanUrl = value => String(value || '').trim().replace(/\/$/, '');
const workerUrls = env => String(env.ACESTEP_WORKER_URLS || env.ACE_STEP_API_URLS || env.SONARA_ACE_STEP_WORKERS || '')
  .split(/[\s,;]+/).map(cleanUrl).filter(url => /^https?:\/\//i.test(url)).slice(0, 4);
const jobWorkers = env => workerUrls(env).map((baseUrl, index) => ({ id: `t4-${index}`, baseUrl, kind: 'kaggle', index }));

function jobAuthHeaders(env, extra = {}) {
  const out = { ...extra };
  const key = String(env.ACE_STEP_API_KEY || env.ACESTEP_API_KEY || '').trim();
  if (key) {
    out.Authorization = `Bearer ${key}`;
    out['X-API-Key'] = key;
  }
  return out;
}

function jobCors(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set(['https://sonaraenterprise.com', 'https://www.sonaraenterprise.com', PUBLIC_API_ORIGIN]);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge,X-Sonara-Real-Prompt',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Job-Recovery,X-Sonara-Tempo-Taxonomy',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function jobJson(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-job-recovery': JOB_RECOVERY_VERSION,
      'x-sonara-tempo-taxonomy': WORLD_TEMPO_VERSION,
      ...jobCors(request)
    }
  });
}

const jobCacheUrl = jobId => `${JOB_CACHE_PREFIX}${encodeURIComponent(jobId)}`;

function jobStateStub(env, jobId) {
  try {
    if (!env?.SONARA_JOB_STATE) return null;
    return env.SONARA_JOB_STATE.get(env.SONARA_JOB_STATE.idFromName(jobId));
  } catch {
    return null;
  }
}

async function loadJobState(env, jobId) {
  const stub = jobStateStub(env, jobId);
  if (stub) {
    try {
      const response = await stub.fetch('https://sonara.internal/state');
      if (response.ok) return await response.json();
    } catch {}
  }
  try {
    const response = await caches.default.match(new Request(jobCacheUrl(jobId)));
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

async function saveJobState(env, jobId, state) {
  const stub = jobStateStub(env, jobId);
  if (stub) {
    const response = await stub.fetch('https://sonara.internal/state', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state)
    });
    if (!response.ok) throw new Error(`SONARA state persistence HTTP ${response.status}`);
  }
  await caches.default.put(
    new Request(jobCacheUrl(jobId)),
    new Response(JSON.stringify(state), {
      headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${JOB_CACHE_TTL}` }
    })
  ).catch(() => undefined);
}

async function queryWorkerTask(task, env) {
  const response = await fetch(`${task.baseUrl}/query_result`, {
    method: 'POST',
    headers: jobAuthHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify({ task_id_list: [task.taskId] }),
    signal: AbortSignal.timeout(JOB_QUERY_TIMEOUT)
  });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`ACE-Step ${task.workerId}: query JSON non valido.`);
  }
  if (!response.ok || Number(data?.code || 200) >= 400) {
    throw new Error(String(data?.error?.message || data?.error || data?.message || `ACE-Step query HTTP ${response.status}`));
  }
  return data?.data?.[0] || null;
}

async function submitWorkerTask(worker, env, payload) {
  const response = await fetch(`${worker.baseUrl}/release_task`, {
    method: 'POST',
    headers: jobAuthHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(45_000)
  });
  const raw = await response.text();
  let data = {};
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(`ACE-Step ${worker.id}: JSON non valido durante il failover.`);
  }
  if (!response.ok || Number(data?.code || 200) >= 400) {
    throw new Error(String(data?.error?.message || data?.error || data?.message || `ACE-Step HTTP ${response.status}`));
  }
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error(`ACE-Step ${worker.id}: task_id mancante durante il failover.`);
  return {
    workerId: worker.id,
    baseUrl: worker.baseUrl,
    taskId: String(taskId),
    queuePosition: Number(data?.data?.queue_position || 0)
  };
}

function resultItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
    } catch {
      return [];
    }
  }
  return value && typeof value === 'object' ? [value] : [];
}

function taskResultInfo(task) {
  const first = resultItems(task?.result)[0] || {};
  const rawProgress = Number(first?.progress ?? task?.progress ?? 0);
  const normalized = Number.isFinite(rawProgress) ? (rawProgress <= 1 ? rawProgress * 100 : rawProgress) : 0;
  return {
    progress: Math.max(0, Math.min(100, normalized)),
    stage: String(first?.stage || task?.stage || task?.progress_text || '').trim()
  };
}

function audioRefsFrom(task, taskRef) {
  const refs = [];
  const seen = new Set();
  const visit = value => {
    if (!value) return;
    if (typeof value === 'string') {
      let path = '';
      try {
        path = new URL(value, `${taskRef.baseUrl}/`).searchParams.get('path') || '';
      } catch {}
      if (!path && value.startsWith('/') && !value.startsWith('/v1/audio')) path = value;
      if (path) {
        const key = `${taskRef.workerId}:${path}`;
        if (!seen.has(key)) {
          seen.add(key);
          refs.push({ workerId: taskRef.workerId, path });
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      for (const key of ['file', 'url', 'audio_path', 'audio_file', 'path', 'output', 'outputs', 'audio', 'audios', 'wave']) {
        if (key in value) visit(value[key]);
      }
    }
  };
  resultItems(task?.result).forEach(visit);
  return refs;
}

function publicAudioUrl(ref) {
  return `${PUBLIC_API_ORIGIN}/api/modal/audio?sonara_worker=${encodeURIComponent(ref.workerId)}&path=${encodeURIComponent(ref.path)}`;
}

function computeVisibleProgress(state) {
  const slots = Array.isArray(state?.slots) ? state.slots : [];
  const ready = slots.filter(slot => slot.audioRef).length;
  const live = slots.filter(slot => !slot.audioRef).map(slot => Number(slot.lastProgress || 0));
  const avg = live.length ? live.reduce((sum, value) => sum + value, 0) / live.length : 100;
  const computed = ready === 2 ? 100 : Math.max(30, Math.min(94, Math.round(30 + ready * 30 + avg * 0.32)));
  return Math.max(computed, Math.min(94, Number(state.displayProgress || 0)));
}

function jobMetadata(state, stage) {
  const slots = Array.isArray(state?.slots) ? state.slots : [];
  return {
    engine: 'SONARA ACE-Step Dual T4 Stable Render',
    candidateCount: 2,
    readyCount: slots.filter(slot => slot.audioRef).length,
    currentStage: stage,
    automaticStallRecovery: true,
    recoveryVersion: JOB_RECOVERY_VERSION,
    stallTimeoutSeconds: JOB_STALL_MS / 1000,
    queryFailureLimit: JOB_QUERY_FAILURE_LIMIT,
    maxAttemptsPerCandidate: JOB_MAX_ATTEMPTS,
    recoveryCount: slots.reduce((sum, slot) => sum + Math.max(0, Number(slot.attempts || 1) - 1), 0),
    durableJobState: true
  };
}

function processingJobResponse(request, jobId, state, stage) {
  const progress = computeVisibleProgress(state);
  return jobJson(request, {
    jobId,
    status: 'PROCESSING',
    progress,
    retryable: true,
    metadata: jobMetadata(state, stage)
  });
}

function completedJobResponse(request, jobId, state, partial = false) {
  const urls = state.slots.map(slot => slot.audioRef).filter(Boolean).slice(0, 2).map(publicAudioUrl);
  return jobJson(request, {
    jobId,
    status: 'COMPLETED',
    progress: 100,
    audioUrl: urls[0] || null,
    audioUrls: urls,
    candidates: urls.map((url, index) => ({
      id: index ? 'B' : 'A',
      audioUrl: url,
      audioFormat: 'wav',
      strategy: index ? 'stable-detail' : 'stable-structure'
    })),
    metadata: {
      ...jobMetadata(state, partial ? 'Brano SONARA recuperato; seconda variante non disponibile' : '2 brani SONARA pronti'),
      degradedDual: partial
    }
  });
}

async function recoverJobSlot(state, index, env) {
  const slot = state.slots[index];
  if (!slot || slot.audioRef || slot.task || Number(slot.attempts || 1) >= JOB_MAX_ATTEMPTS) return;
  const pool = jobWorkers(env).slice(0, 2);
  if (!pool.length) throw new Error('Nessun worker T4 disponibile per il failover.');
  const currentIndex = Number(slot.worker?.index ?? index);
  const alternate = pool[currentIndex === 0 ? 1 : 0] || pool[index] || pool[0];
  const payload = slot.payload || state.payloads?.[index];
  if (!payload) throw new Error(`Payload del brano ${slot.candidate || index + 1} non disponibile per il failover.`);
  const previousProgress = Number(slot.lastProgress || 0);
  const task = await submitWorkerTask(alternate, env, payload);
  state.slots[index] = {
    ...slot,
    worker: alternate,
    task,
    attempts: Number(slot.attempts || 1) + 1,
    progressFloor: Math.max(Number(slot.progressFloor || 0), previousProgress),
    lastProgress: 0,
    lastProgressAt: Date.now(),
    lastStage: 'automatic-failover-requeued',
    queryFailures: 0,
    lastQueryError: ''
  };
  state.displayProgress = Math.min(94, Math.max(computeVisibleProgress(state), Number(state.displayProgress || 0) + 2));
}

async function robustJobPoll(request, env, jobId) {
  const state = await loadJobState(env, jobId);
  if (!state || !Array.isArray(state.slots)) {
    return jobJson(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      retryable: true,
      error: 'Job SONARA non trovato. Avvia una nuova generazione.'
    }, 404);
  }

  const now = Date.now();
  state.displayProgress = Math.max(Number(state.displayProgress || 0), computeVisibleProgress(state));

  for (let index = 0; index < state.slots.length; index++) {
    const slot = state.slots[index];
    if (slot.audioRef || !slot.task) continue;

    let task;
    try {
      task = await queryWorkerTask(slot.task, env);
      slot.queryFailures = 0;
      slot.lastQueryError = '';
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      slot.queryFailures = Number(slot.queryFailures || 0) + 1;
      slot.lastQueryError = message;
      slot.lastQueryErrorAt = now;
      slot.lastStage = `poll-retry-${slot.queryFailures}`;
      const staleFor = now - Number(slot.lastProgressAt || state.createdAt || now);
      if (slot.queryFailures >= JOB_QUERY_FAILURE_LIMIT || staleFor >= JOB_STALL_MS) {
        slot.lastError = `Worker ${slot.worker?.id || slot.task?.workerId || ''}: ${message}`;
        slot.task = null;
        slot.lastStage = 'automatic-query-failover';
      }
      continue;
    }

    const status = Number(task?.status ?? 0);
    const info = taskResultInfo(task);

    if (status === 1) {
      const ref = audioRefsFrom(task, slot.task)[0];
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
      slot.lastStage = 'completed-without-audio';
      continue;
    }

    if (status !== 0) {
      slot.lastError = String(task?.error || task?.message || `Brano ${slot.candidate || index + 1} non completato.`);
      slot.task = null;
      slot.lastStage = 'worker-failed';
      continue;
    }

    if (info.progress > Number(slot.lastProgress || 0) + 0.05 || info.stage !== slot.lastStage) {
      slot.lastProgress = info.progress;
      slot.lastProgressAt = now;
      slot.lastStage = info.stage || slot.lastStage || 'rendering';
    } else if (now - Number(slot.lastProgressAt || state.createdAt || now) >= JOB_STALL_MS) {
      slot.lastError = `Worker ${slot.worker?.id || slot.task?.workerId || ''} senza avanzamento per ${JOB_STALL_MS / 1000}s.`;
      slot.task = null;
      slot.lastStage = 'automatic-stall-failover';
    }
  }

  if (state.slots.every(slot => slot.audioRef)) {
    state.displayProgress = 100;
    state.updatedAt = now;
    await saveJobState(env, jobId, state);
    return completedJobResponse(request, jobId, state, false);
  }

  for (let index = 0; index < state.slots.length; index++) {
    const slot = state.slots[index];
    if (slot.audioRef || slot.task || Number(slot.attempts || 1) >= JOB_MAX_ATTEMPTS) continue;
    try {
      await recoverJobSlot(state, index, env);
    } catch (error) {
      slot.attempts = Number(slot.attempts || 1) + 1;
      slot.lastError = error instanceof Error ? error.message : String(error);
      slot.lastStage = 'failover-submit-error';
    }
  }

  const readyCount = state.slots.filter(slot => slot.audioRef).length;
  const exhausted = state.slots.filter(slot => !slot.audioRef && !slot.task && Number(slot.attempts || 1) >= JOB_MAX_ATTEMPTS);
  if (exhausted.length) {
    state.updatedAt = now;
    await saveJobState(env, jobId, state);
    if (readyCount > 0) return completedJobResponse(request, jobId, state, true);
    return jobJson(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      retryable: true,
      error: exhausted[0].lastError || 'I worker SONARA non hanno completato il render dopo il failover automatico.',
      metadata: jobMetadata(state, 'Failover esaurito')
    }, 502);
  }

  state.updatedAt = now;
  state.displayProgress = Math.max(Number(state.displayProgress || 0), computeVisibleProgress(state));
  await saveJobState(env, jobId, state);
  const stages = state.slots
    .filter(slot => !slot.audioRef)
    .map(slot => `${slot.candidate || '?'}: ${slot.lastStage || 'rendering'} ${Math.round(Number(slot.lastProgress || 0))}%`);
  return processingJobResponse(request, jobId, state, stages.join(' | ') || 'rendering');
}

function withTempoHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-tempo-taxonomy', WORLD_TEMPO_VERSION);
  headers.set('x-sonara-production-router', 'world-tempo-v1');
  headers.set('x-sonara-job-recovery', JOB_RECOVERY_VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function injectTempoClient(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return withTempoHeaders(response);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-tempo-taxonomy', WORLD_TEMPO_VERSION);
  headers.set('x-sonara-production-router', 'world-tempo-v1');
  headers.set('x-sonara-job-recovery', JOB_RECOVERY_VERSION);
  const safe = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter().on('head', { element(el) { el.append(WORLD_TEMPO_CLIENT, { html: true }); } }).transform(safe);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: jobCors(request) });

    const jobMatch = url.pathname.match(/^\/api\/music\/job\/(d16pair_[^/]+)$/);
    if (request.method === 'GET' && jobMatch) {
      try {
        return await robustJobPoll(request, env, decodeURIComponent(jobMatch[1]));
      } catch (error) {
        return jobJson(request, {
          jobId: decodeURIComponent(jobMatch[1]),
          status: 'PROCESSING',
          progress: 32,
          retryable: true,
          metadata: {
            currentStage: `Recovery bridge: ${error instanceof Error ? error.message : String(error)}`,
            recoveryVersion: JOB_RECOVERY_VERSION
          }
        });
      }
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/api/tempo-profile') {
      return withTempoHeaders(await worldTempoRuntime.fetch(request, env, ctx));
    }
    if (request.method === 'POST' && GENERATE_PATHS.has(url.pathname)) {
      return withTempoHeaders(await worldTempoRuntime.fetch(request, env, ctx));
    }
    const response = await onboardingRuntime.fetch(request, env, ctx);
    const publicHost = url.hostname === 'sonaraenterprise.com' || url.hostname === 'www.sonaraenterprise.com';
    if (publicHost && request.method === 'GET') return injectTempoClient(response);
    return withTempoHeaders(response);
  }
};
