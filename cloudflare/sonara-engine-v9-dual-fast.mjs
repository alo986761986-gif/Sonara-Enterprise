import baseEngine from './sonara-engine-v6-final.mjs';

const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const JOB_PATH = /^\/api\/music\/job\/(d9pair_[^/]+)$/;
const JOB_CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/dual-fast-v9/';
const JOB_TTL_SECONDS = 3 * 60 * 60;

// Legacy health/profile identifiers are intentionally preserved because the
// higher v10-v14 taxonomy layers and production health checks depend on them.
const FAST_MODEL = 'acestep-v15-xl-turbo';
const FAST_STEPS = 6;
const BATCH_SIZE = 2;
const READINESS_TIMEOUT_MS = 180_000;
const SUBMIT_TIMEOUT_MS = 120_000;
const QUERY_TIMEOUT_MS = 30_000;
const AUDIO_TIMEOUT_MS = 120_000;
const HEALTH_TIMEOUT_MS = 15_000;
const MAX_QUERY_FAILURES = 4;
const SAFE_FALLBACK_PROFILE = 'dual-safe-independent-v1';
const KAGGLE_PROFILE = 'kaggle-t4x2-independent-v1';
const KAGGLE_MODEL = 'acestep-v15-turbo';
const KAGGLE_STEPS = 8;
const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

// Immediate session defaults. ACESTEP_WORKER_URLS / ACE_STEP_API_URLS can
// replace these without another code change when a future Kaggle session gets
// new Quick Tunnel URLs.
const DEFAULT_KAGGLE_WORKERS = [
  'https://issued-referring-warming-equally.trycloudflare.com',
  'https://appointments-affiliated-unlikely-remember.trycloudflare.com'
];

class SonaraEngineError extends Error {
  constructor(message, status = 502, retryable = false) {
    super(message);
    this.name = 'SonaraEngineError';
    this.status = Number(status) || 502;
    this.retryable = Boolean(retryable);
  }
}

function corsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  const allowed = new Set([
    'https://sonaraenterprise.com',
    'https://www.sonaraenterprise.com',
    PUBLIC_API_ORIGIN
  ]);
  return {
    'Access-Control-Allow-Origin': allowed.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization,Content-Type,Range,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge',
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Performance-Profile,X-Sonara-ACE-Worker',
    Vary: 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-performance-profile': KAGGLE_PROFILE,
      ...corsHeaders(request)
    }
  });
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function splitWorkerUrls(value) {
  return String(value || '')
    .split(/[\s,;]+/)
    .map(normalizeBaseUrl)
    .filter(url => /^https?:\/\//i.test(url));
}

function configuredWorkers(env = {}) {
  const explicit = splitWorkerUrls(
    env.ACESTEP_WORKER_URLS ||
    env.ACE_STEP_API_URLS ||
    env.SONARA_ACE_STEP_WORKERS ||
    ''
  );
  const publicUrls = explicit.length ? explicit : DEFAULT_KAGGLE_WORKERS;
  const workers = publicUrls.slice(0, 8).map((baseUrl, index) => ({
    id: `t4-${index}`,
    baseUrl,
    kind: 'kaggle'
  }));

  // Keep the existing Modal engine as automatic fallback. It is only added when
  // its credentials are actually present, so Kaggle does not require secrets.
  const modalKey = String(env.MODAL_PROXY_KEY || '').trim();
  const modalSecret = String(env.MODAL_PROXY_SECRET || '').trim();
  const modalBaseUrl = normalizeBaseUrl(
    env.ACESTEP_API_URL ||
    env.ACE_STEP_API_URL ||
    'https://alo986761986-gif--sonara-acestep-serve-acestep.modal.run'
  );
  if (modalKey && modalSecret && modalBaseUrl && !workers.some(worker => worker.baseUrl === modalBaseUrl)) {
    workers.push({ id: 'modal-fallback', baseUrl: modalBaseUrl, kind: 'modal' });
  }
  return workers;
}

function workerHeaders(worker, env, extra = {}) {
  const headers = { ...extra };
  if (worker?.kind === 'modal') {
    const key = String(env.MODAL_PROXY_KEY || '').trim();
    const secret = String(env.MODAL_PROXY_SECRET || '').trim();
    if (key) headers['Modal-Key'] = key;
    if (secret) headers['Modal-Secret'] = secret;
  } else {
    const apiKey = String(env.ACE_STEP_API_KEY || env.ACESTEP_API_KEY || '').trim();
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
      headers['X-API-Key'] = apiKey;
    }
  }
  return headers;
}

function internalGenerationAuthorized(request, env) {
  const required = String(env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  return !required || String(request.headers.get('X-Sonara-Internal-Secret') || '').trim() === required;
}

function engineError(error, fallbackMessage = 'SONARA engine request failed.') {
  if (error instanceof SonaraEngineError) return error;
  const message = error instanceof Error ? error.message : String(error || fallbackMessage);
  const timeout = /timeout|timed out|abort/i.test(message);
  return new SonaraEngineError(timeout ? 'SONARA engine request timed out.' : message || fallbackMessage, timeout ? 504 : 502, true);
}

async function workerJson(worker, env, path, init = {}, timeoutMs = QUERY_TIMEOUT_MS) {
  let response;
  try {
    response = await fetch(`${worker.baseUrl}${path}`, {
      ...init,
      headers: workerHeaders(worker, env, init.headers || {}),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    throw engineError(error, `SONARA worker ${worker.id} network request failed.`);
  }

  const raw = await response.text();
  let payload = {};
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    throw new SonaraEngineError(
      `SONARA worker ${worker.id} returned invalid JSON (HTTP ${response.status}).`,
      response.status || 502,
      RETRYABLE_HTTP_STATUSES.has(response.status)
    );
  }

  if (!response.ok) {
    const message = String(payload?.detail || payload?.error?.message || payload?.error || payload?.message || `SONARA HTTP ${response.status}`);
    throw new SonaraEngineError(message, response.status, RETRYABLE_HTTP_STATUSES.has(response.status));
  }
  if (typeof payload?.code === 'number' && payload.code >= 400) {
    const status = Number(payload.code) || 502;
    throw new SonaraEngineError(String(payload?.error?.message || payload?.error || payload?.message || 'SONARA engine request failed.'), status, RETRYABLE_HTTP_STATUSES.has(status));
  }
  return payload;
}

async function checkWorker(worker, env) {
  try {
    const health = await workerJson(worker, env, '/health', {
      method: 'GET',
      headers: { Accept: 'application/json' }
    }, HEALTH_TIMEOUT_MS);
    const status = String(health?.data?.status || health?.status || '').toLowerCase();
    if (health?.code === 200 || ['ok', 'ready', 'healthy', 'online', 'success'].includes(status)) return true;
  } catch {}

  // Compatibility fallback for older Modal ACE-Step services.
  try {
    await workerJson(worker, env, '/v1/models', {
      method: 'GET',
      headers: { Accept: 'application/json' }
    }, HEALTH_TIMEOUT_MS);
    return true;
  } catch {
    return false;
  }
}

async function healthyWorkers(env) {
  const workers = configuredWorkers(env);
  const checks = await Promise.all(workers.map(async worker => ({ worker, ready: await checkWorker(worker, env) })));
  return checks.filter(item => item.ready).map(item => item.worker);
}

function cacheUrl(jobId) {
  return `${JOB_CACHE_PREFIX}${encodeURIComponent(jobId)}`;
}

async function storeJob(jobId, context) {
  if (typeof caches === 'undefined' || !caches.default) throw new Error('SONARA dual job storage is unavailable.');
  await caches.default.put(
    new Request(cacheUrl(jobId)),
    new Response(JSON.stringify(context), {
      headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': `public, max-age=${JOB_TTL_SECONDS}` }
    })
  );
}

async function readJob(jobId) {
  try {
    if (typeof caches === 'undefined' || !caches.default) return null;
    const response = await caches.default.match(new Request(cacheUrl(jobId)));
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

export function resolveCreativeControls(body = {}) {
  const weirdness = Math.round(clamp(body.weirdness, 50, 0, 100));
  const styleInfluence = Math.round(clamp(body.styleInfluence ?? body.style_influence, 50, 0, 100));
  return {
    weirdness,
    styleInfluence,
    lmTemperature: Math.round((0.55 + weirdness * 0.0054) * 1000) / 1000,
    lmCfgScale: Math.round((1.4 + styleInfluence * 0.02) * 1000) / 1000,
    lmTopP: Math.round((0.84 + weirdness * 0.0016) * 1000) / 1000,
    inferMethod: weirdness >= 75 ? 'sde' : 'ode'
  };
}

function inferTimeSignature(body) {
  const explicit = String(body.timeSignature || body.time_signature || '').trim();
  if (/^(2|3|4|6)(?:\/(?:4|8))?$/.test(explicit)) return explicit.split('/')[0];
  const style = `${body.genre || ''} ${body.subgenre || ''}`.toLowerCase();
  if (/\b(waltz|mazurka|vals|minuet)\b/.test(style)) return '3';
  if (/\b(jig|tarantella|6\/8)\b/.test(style)) return '6';
  if (/\b(polka|2\/4|two[- ]?step)\b/.test(style)) return '2';
  return '4';
}

function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    } catch { return []; }
  }
  return value && typeof value === 'object' ? [value] : [];
}

function audioRefFromItem(item, worker) {
  if (!item || typeof item !== 'object') return null;
  for (const source of [item.file, item.url]) {
    if (typeof source !== 'string' || !source) continue;
    try {
      const parsed = new URL(source, `${worker.baseUrl}/`);
      const audioPath = parsed.searchParams.get('path');
      if (audioPath) return { workerId: worker.id, path: audioPath };
    } catch {}
    // Some ACE-Step builds return the server-local path directly in `file`.
    if (source.startsWith('/') && !source.startsWith('/v1/audio')) {
      return { workerId: worker.id, path: source };
    }
  }
  return null;
}

export function buildPayload(body, env) {
  const durationSec = Math.round(clamp(body.durationSec ?? body.duration, 30, 30, 480));
  const bpm = Math.round(clamp(body.bpm, 124, 40, 220));
  const creativeControls = resolveCreativeControls(body);
  const prompt = String(body.prompt || '').trim();
  if (!prompt) throw new Error('Prompt richiesto.');
  return {
    prompt,
    lyrics: String(body.lyrics || '').trim(),
    vocal_language: String(body.vocalLanguage || body.vocal_language || 'unknown'),
    bpm,
    key_scale: String(body.key || body.key_scale || 'C Major').trim(),
    time_signature: inferTimeSignature(body),
    audio_duration: durationSec,
    use_random_seed: true,
    seed: -1,
    task_type: 'text2music',
    model: String(env.SONARA_FAST_MODEL || FAST_MODEL).trim(),
    inference_steps: FAST_STEPS,
    thinking: false,
    use_format: false,
    use_cot_caption: false,
    use_cot_language: false,
    constrained_decoding: true,
    allow_lm_batch: true,
    lm_temperature: creativeControls.lmTemperature,
    lm_cfg_scale: creativeControls.lmCfgScale,
    lm_top_p: creativeControls.lmTopP,
    lm_repetition_penalty: 1.03,
    batch_size: BATCH_SIZE,
    infer_method: creativeControls.inferMethod,
    audio_format: 'wav',
    mp3_bitrate: '320k',
    mp3_sample_rate: 48000
  };
}

function payloadForWorker(payload, worker, variationIndex) {
  const seedBase = Math.max(1, Math.floor(Date.now() % 2_000_000_000));
  const isKaggle = worker.kind === 'kaggle';
  return {
    ...payload,
    model: isKaggle ? KAGGLE_MODEL : payload.model,
    inference_steps: isKaggle ? KAGGLE_STEPS : payload.inference_steps,
    batch_size: 1,
    // The Kaggle T4 workers were started with the 1.7B 5Hz LM. Enable it so the
    // selected 8-minute-capable configuration is actually used during rendering.
    thinking: isKaggle ? true : payload.thinking,
    use_random_seed: false,
    seed: seedBase + variationIndex * 7919
  };
}

async function submitOnWorker(worker, env, payload) {
  const data = await workerJson(worker, env, '/release_task', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  }, SUBMIT_TIMEOUT_MS);
  const taskId = data?.data?.task_id;
  if (!taskId) throw new SonaraEngineError(`SONARA worker ${worker.id} did not return a generation task.`, 502, true);
  return {
    workerId: worker.id,
    workerKind: worker.kind,
    baseUrl: worker.baseUrl,
    taskId: String(taskId),
    model: String(payload.model || ''),
    status: 0
  };
}

function workerFromTask(task) {
  return {
    id: String(task.workerId || ''),
    kind: String(task.workerKind || 'kaggle'),
    baseUrl: normalizeBaseUrl(task.baseUrl)
  };
}

function completedPayload(jobId, context, audioRefs) {
  const audioUrls = audioRefs.map(ref =>
    `${PUBLIC_API_ORIGIN}/api/modal/audio?sonara_worker=${encodeURIComponent(ref.workerId)}&path=${encodeURIComponent(ref.path)}`
  );
  return {
    context: {
      ...context,
      phase: 'completed',
      audioRefs,
      audioUrls,
      queryFailures: 0,
      updatedAt: Date.now()
    },
    response: {
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl: audioUrls[0] || null,
      audioUrls,
      candidates: audioUrls.map((audioUrl, index) => ({ id: index === 0 ? 'A' : 'B', audioUrl, audioFormat: 'wav' })),
      metadata: {
        engine: 'SONARA ACE-Step 1.5',
        performanceProfile: context.performanceProfile || KAGGLE_PROFILE,
        renderModel: context.renderModel || KAGGLE_MODEL,
        candidateCount: audioUrls.length,
        creativeControls: context.creativeControls,
        workerAssignments: context.tasks?.map(task => ({ candidate: task.candidate, workerId: task.workerId, model: task.model })) || [],
        audioUrls,
        audioFormat: 'wav',
        currentStage: '2 brani pronti — T4 x2'
      }
    }
  };
}

async function startDualGeneration(request, env, body) {
  let payload;
  try {
    payload = buildPayload(body, env);
  } catch (error) {
    return json(request, { error: error instanceof Error ? error.message : String(error) }, 400);
  }

  let ready;
  try {
    ready = await healthyWorkers(env);
  } catch (rawError) {
    const error = engineError(rawError);
    return json(request, { status: 'FAILED', retryable: true, error: error.message }, 503);
  }
  if (!ready.length) {
    return json(request, {
      status: 'FAILED',
      progress: 0,
      retryable: true,
      error: 'Nessun worker ACE-Step è raggiungibile. Mantieni attiva la sessione Kaggle oppure riattiva il fallback Modal.'
    }, 503);
  }

  // Prefer two distinct workers (T4 #0 + T4 #1). If only one survives, both
  // independent tasks are queued on it rather than dropping one candidate.
  const selected = ready.length >= 2 ? ready.slice(0, 2) : [ready[0], ready[0]];
  const jobId = `d9pair_${crypto.randomUUID()}`;
  const creativeControls = resolveCreativeControls(body);
  const longForm = Number(payload.audio_duration) >= 240;
  const performanceProfile = selected.every(worker => worker.kind === 'kaggle')
    ? KAGGLE_PROFILE
    : SAFE_FALLBACK_PROFILE;

  const context = {
    phase: 'starting',
    payload,
    tasks: [],
    generationPairId: String(body.generationPairId || jobId),
    title: String(body.title || 'SONARA Track'),
    genre: String(body.genre || ''),
    subgenre: String(body.subgenre || ''),
    durationSec: payload.audio_duration,
    renderModel: selected.every(worker => worker.kind === 'kaggle') ? KAGGLE_MODEL : payload.model,
    performanceProfile,
    creativeControls: {
      weirdness: creativeControls.weirdness,
      styleInfluence: creativeControls.styleInfluence
    },
    queryFailures: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await storeJob(jobId, context);

  try {
    const taskPayloads = selected.map((worker, index) => payloadForWorker(payload, worker, index + 1));
    const submitted = await Promise.all(selected.map((worker, index) => submitOnWorker(worker, env, taskPayloads[index])));
    const tasks = submitted.map((task, index) => ({ ...task, candidate: index === 0 ? 'A' : 'B' }));
    await storeJob(jobId, { ...context, phase: 'submitted', tasks, updatedAt: Date.now() });

    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 30,
      metadata: {
        engine: 'SONARA ACE-Step 1.5',
        performanceProfile,
        renderModel: context.renderModel,
        candidateCount: 2,
        creativeControls: context.creativeControls,
        workerAssignments: tasks.map(task => ({ candidate: task.candidate, workerId: task.workerId, model: task.model })),
        inferenceSteps: selected.every(worker => worker.kind === 'kaggle') ? KAGGLE_STEPS : FAST_STEPS,
        currentStage: selected.length === 2 && selected[0].id !== selected[1].id
          ? 'SONARA: A su T4 #0 + B su T4 #1'
          : 'SONARA: due render indipendenti in coda'
      }
    }, longForm ? 200 : 202);
  } catch (rawError) {
    const error = engineError(rawError);
    const failed = { ...context, phase: 'failed', error: error.message, retryable: error.retryable, updatedAt: Date.now() };
    await storeJob(jobId, failed);
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      retryable: error.retryable,
      error: error.message,
      metadata: { engine: 'SONARA ACE-Step 1.5', performanceProfile, currentStage: 'SONARA: avvio T4 x2 non riuscito' }
    }, error.status >= 400 && error.status < 600 ? error.status : 502);
  }
}

async function pollDualJob(request, env, jobId) {
  let context = await readJob(jobId);
  if (!context) return json(request, { jobId, status: 'FAILED', progress: 0, error: 'SONARA dual generation session expired.' }, 410);

  if (context.phase === 'completed' && Array.isArray(context.audioUrls)) {
    return json(request, {
      jobId,
      status: 'COMPLETED',
      progress: 100,
      audioUrl: context.audioUrls[0] || null,
      audioUrls: context.audioUrls,
      candidates: context.audioUrls.map((audioUrl, index) => ({ id: index === 0 ? 'A' : 'B', audioUrl, audioFormat: 'wav' })),
      metadata: {
        engine: 'SONARA ACE-Step 1.5',
        performanceProfile: context.performanceProfile || KAGGLE_PROFILE,
        renderModel: context.renderModel || KAGGLE_MODEL,
        candidateCount: context.audioUrls.length,
        creativeControls: context.creativeControls,
        workerAssignments: context.tasks?.map(task => ({ candidate: task.candidate, workerId: task.workerId, model: task.model })) || [],
        audioUrls: context.audioUrls,
        audioFormat: 'wav',
        currentStage: '2 brani pronti — T4 x2'
      }
    });
  }

  if (context.phase === 'failed') {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      retryable: Boolean(context.retryable),
      error: context.error || 'SONARA dual generation failed.'
    });
  }

  const tasks = Array.isArray(context.tasks) ? context.tasks.slice(0, 2) : [];
  if (tasks.length !== 2) {
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 15,
      metadata: { engine: 'SONARA ACE-Step 1.5', performanceProfile: context.performanceProfile || KAGGLE_PROFILE, currentStage: 'SONARA: assegnazione T4 x2' }
    });
  }

  try {
    const queried = await Promise.all(tasks.map(async taskRef => {
      const worker = workerFromTask(taskRef);
      const data = await workerJson(worker, env, '/query_result', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task_id_list: [taskRef.taskId] })
      }, QUERY_TIMEOUT_MS);
      return { taskRef, worker, task: data?.data?.[0] || null };
    }));

    if (queried.some(entry => !entry.task || Number(entry.task.status) === 0)) {
      if (Number(context.queryFailures || 0) !== 0) {
        context = { ...context, queryFailures: 0, updatedAt: Date.now() };
        await storeJob(jobId, context);
      }
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: 78,
        metadata: {
          engine: 'SONARA ACE-Step 1.5',
          performanceProfile: context.performanceProfile || KAGGLE_PROFILE,
          renderModel: context.renderModel || KAGGLE_MODEL,
          candidateCount: 2,
          workerAssignments: tasks.map(task => ({ candidate: task.candidate, workerId: task.workerId, model: task.model })),
          currentStage: 'SONARA: T4 #0 + T4 #1 stanno renderizzando'
        }
      });
    }

    const failed = queried.find(entry => Number(entry.task.status) !== 1);
    if (failed) {
      const reason = String(failed.task?.error || failed.task?.message || `ACE-Step ${failed.taskRef.workerId} non ha completato il render.`);
      const next = { ...context, phase: 'failed', error: reason, retryable: false, updatedAt: Date.now() };
      await storeJob(jobId, next);
      return json(request, { jobId, status: 'FAILED', progress: 0, retryable: false, error: reason });
    }

    const audioRefs = queried.map(entry => {
      const items = parseItems(entry.task.result);
      return items.map(item => audioRefFromItem(item, entry.worker)).find(Boolean) || null;
    });
    if (audioRefs.some(ref => !ref)) {
      const reason = 'SONARA ha completato i render T4 x2 ma non ha ricevuto entrambi i riferimenti audio.';
      const next = { ...context, phase: 'failed', error: reason, retryable: false, updatedAt: Date.now() };
      await storeJob(jobId, next);
      return json(request, { jobId, status: 'FAILED', progress: 0, retryable: false, error: reason });
    }

    const completed = completedPayload(jobId, context, audioRefs);
    await storeJob(jobId, completed.context);
    return json(request, completed.response);
  } catch (rawError) {
    const error = engineError(rawError);
    const failures = Number(context.queryFailures || 0) + 1;
    const shouldFail = !error.retryable || failures >= MAX_QUERY_FAILURES;
    context = {
      ...context,
      phase: shouldFail ? 'failed' : context.phase,
      queryFailures: failures,
      error: shouldFail ? error.message : context.error,
      retryable: error.retryable,
      updatedAt: Date.now()
    };
    await storeJob(jobId, context);

    if (shouldFail) {
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 0,
        retryable: error.retryable,
        error: error.message,
        metadata: { engine: 'SONARA ACE-Step 1.5', performanceProfile: context.performanceProfile || KAGGLE_PROFILE, currentStage: 'SONARA: impossibile leggere il risultato T4 x2' }
      });
    }
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 82,
      retryable: true,
      metadata: { engine: 'SONARA ACE-Step 1.5', performanceProfile: context.performanceProfile || KAGGLE_PROFILE, currentStage: `SONARA: riconnessione T4 x2 (${failures}/${MAX_QUERY_FAILURES})` }
    });
  }
}

async function proxyWorkerAudio(request, env, url) {
  const workerId = String(url.searchParams.get('sonara_worker') || '').trim();
  const path = String(url.searchParams.get('path') || '').trim();
  if (!workerId || !path) return null;

  const worker = configuredWorkers(env).find(candidate => candidate.id === workerId);
  if (!worker) return json(request, { error: `Worker audio ${workerId} non disponibile.` }, 404);

  const target = new URL('/v1/audio', `${worker.baseUrl}/`);
  target.searchParams.set('path', path);
  const headers = workerHeaders(worker, env, {});
  const range = request.headers.get('Range');
  if (range) headers.Range = range;

  let upstream;
  try {
    upstream = await fetch(target.toString(), {
      method: 'GET',
      headers,
      signal: AbortSignal.timeout(AUDIO_TIMEOUT_MS)
    });
  } catch (rawError) {
    const error = engineError(rawError);
    return json(request, { error: error.message, retryable: true }, 502);
  }
  if (!upstream.ok && upstream.status !== 206) {
    const raw = await upstream.text().catch(() => '');
    return json(request, { error: raw || `ACE-Step audio HTTP ${upstream.status}` }, upstream.status || 502);
  }

  const responseHeaders = new Headers(corsHeaders(request));
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'content-disposition', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) responseHeaders.set(name, value);
  }
  responseHeaders.set('cache-control', 'private, no-store');
  responseHeaders.set('x-sonara-ace-worker', worker.id);
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders
  });
}

async function engineReadiness(request, env) {
  const ready = await healthyWorkers(env);
  if (!ready.length) {
    return json(request, {
      ready: false,
      engine: 'ACE-Step',
      model: KAGGLE_MODEL,
      workerCount: 0,
      retryable: true,
      error: 'Nessun worker ACE-Step raggiungibile.'
    }, 503);
  }
  return json(request, {
    ready: true,
    engine: 'ACE-Step',
    model: ready.every(worker => worker.kind === 'kaggle') ? KAGGLE_MODEL : FAST_MODEL,
    profile: ready.length >= 2 ? KAGGLE_PROFILE : SAFE_FALLBACK_PROFILE,
    workerCount: ready.length,
    workers: ready.slice(0, 3).map(worker => ({ id: worker.id, kind: worker.kind })),
    coldStartAllowanceMs: READINESS_TIMEOUT_MS
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(request) });
    const url = new URL(request.url);
    const jobMatch = url.pathname.match(JOB_PATH);

    if (jobMatch && request.method === 'GET') {
      return pollDualJob(request, env, decodeURIComponent(jobMatch[1]));
    }

    if (url.pathname === '/api/modal/audio' && (request.method === 'GET' || request.method === 'HEAD') && url.searchParams.has('sonara_worker')) {
      const proxied = await proxyWorkerAudio(request, env, url);
      if (proxied) return proxied;
    }

    if (url.pathname === '/api/engine/ready' && request.method === 'GET') {
      return engineReadiness(request, env);
    }

    if (url.pathname === '/api/engine/generate' && request.method === 'POST') {
      if (!internalGenerationAuthorized(request, env)) return json(request, { error: 'Unauthorized SONARA generation proxy.' }, 401);
      let body;
      try { body = await request.clone().json(); }
      catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }
      if (body?.dualFast === true && Number(body?.candidateCount || 0) === 2) {
        return startDualGeneration(request, env, body);
      }
    }

    if (url.pathname === '/api/health' && request.method === 'GET') {
      const ready = await healthyWorkers(env);
      if (ready.length) {
        return json(request, {
          status: 'ok',
          engine: 'SONARA ACE-Step 1.5',
          dualFast: true,
          dualFastProfile: 'single-job-native-batch-v9',
          dualFastModel: FAST_MODEL,
          dualFastInferenceSteps: FAST_STEPS,
          dualFastCandidateCount: BATCH_SIZE,
          dualFastAutoRegeneration: false,
          dualFastReadinessTimeoutMs: READINESS_TIMEOUT_MS,
          dualFastSubmitTimeoutMs: SUBMIT_TIMEOUT_MS,
          dualFastQueryTimeoutMs: QUERY_TIMEOUT_MS,
          kaggleT4x2: ready.filter(worker => worker.kind === 'kaggle').length >= 2,
          kaggleProfile: KAGGLE_PROFILE,
          kaggleModel: KAGGLE_MODEL,
          kaggleInferenceSteps: KAGGLE_STEPS,
          aceStepWorkerCount: ready.length,
          aceStepWorkers: ready.slice(0, 3).map(worker => ({ id: worker.id, kind: worker.kind }))
        });
      }
    }

    const response = await baseEngine.fetch(request, env, ctx);
    if ((url.pathname === '/' || url.pathname === '/api/health') && response.ok) {
      try {
        const data = await response.clone().json();
        return json(request, {
          ...data,
          dualFast: true,
          dualFastProfile: 'single-job-native-batch-v9',
          dualFastModel: FAST_MODEL,
          dualFastInferenceSteps: FAST_STEPS,
          dualFastCandidateCount: BATCH_SIZE,
          dualFastAutoRegeneration: false,
          dualFastReadinessTimeoutMs: READINESS_TIMEOUT_MS,
          dualFastSubmitTimeoutMs: SUBMIT_TIMEOUT_MS,
          dualFastQueryTimeoutMs: QUERY_TIMEOUT_MS,
          kaggleT4x2: false,
          kaggleProfile: KAGGLE_PROFILE,
          kaggleModel: KAGGLE_MODEL,
          kaggleInferenceSteps: KAGGLE_STEPS
        }, response.status);
      } catch {}
    }
    return response;
  }
};
