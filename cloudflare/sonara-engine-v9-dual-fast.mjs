import baseEngine from './sonara-engine-v6-final.mjs';

const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const JOB_PATH = /^\/api\/music\/job\/(d9pair_[^/]+)$/;
const JOB_CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/dual-fast-v9/';
const JOB_TTL_SECONDS = 3 * 60 * 60;

// Legacy health/profile identifiers are intentionally preserved because the
// higher v10-v14 taxonomy layers and production health checks depend on them.
const FAST_MODEL = 'acestep-v15-xl-turbo';
const FAST_STEPS = 8;
const BATCH_SIZE = 2;
const READINESS_TIMEOUT_MS = 180_000;
const SUBMIT_TIMEOUT_MS = 120_000;
const QUERY_TIMEOUT_MS = 30_000;
const AUDIO_TIMEOUT_MS = 120_000;
const HEALTH_TIMEOUT_MS = 15_000;
const MAX_QUERY_FAILURES = 4;
const SAFE_FALLBACK_PROFILE = 'dual-safe-independent-v1';
const KAGGLE_PROFILE = 'kaggle-t4x2-tempo-lock-v3';
const KAGGLE_MODEL = 'acestep-v15-turbo';
const KAGGLE_STEPS = 8;
const KAGGLE_GUIDANCE_SCALE = 1.0;
const KAGGLE_SHIFT = 3.0;
const RETRYABLE_HTTP_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

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

function tempoLockText(bpm) {
  if (bpm >= 150) return `Hard tempo lock: exactly ${bpm} BPM, full-speed perceived pulse, never half-time or ${Math.round(bpm / 2)} BPM feel. Drums, bass, subdivisions and melodic rhythm must audibly communicate ${bpm} BPM.`;
  if (bpm >= 130) return `Hard tempo lock: exactly ${bpm} BPM with an energetic perceived pulse. Do not reinterpret as half-time.`;
  if (bpm <= 75) return `Hard tempo lock: exactly ${bpm} BPM. Do not reinterpret as double-time.`;
  return `Hard tempo lock: exactly ${bpm} BPM with no tempo drift.`;
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
    if (source.startsWith('/') && !source.startsWith('/v1/audio')) {
      return { workerId: worker.id, path: source };
    }
  }
  return null;
}

export function buildPayload(body, env) {
  const durationSec = Math.round(clamp(body.durationSec ?? body.duration, 30, 30, 480));
  const bpm = Math.round(clamp(body.bpm, 124, 30, 300));
  const creativeControls = resolveCreativeControls(body);
  const prompt = String(body.prompt || '').trim();
  if (!prompt) throw new Error('Prompt richiesto.');
  const lockedPrompt = `${tempoLockText(bpm)}\n\n${prompt}`;
  return {
    prompt: lockedPrompt,
    global_caption: tempoLockText(bpm),
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
    constrained_decoding: false,
    allow_lm_batch: false,
    lm_temperature: creativeControls.lmTemperature,
    lm_cfg_scale: creativeControls.lmCfgScale,
    lm_top_p: creativeControls.lmTopP,
    lm_repetition_penalty: 1.03,
    batch_size: BATCH_SIZE,
    infer_method: 'ode',
    shift: 3.0,
    audio_format: 'wav',
    mp3_bitrate: '320k',
    mp3_sample_rate: 48000
  };
}

function payloadForWorker(payload, worker, variationIndex) {
  const seedBase = Math.max(1, Math.floor(Date.now() % 2_000_000_000));
  const isKaggle = worker.kind === 'kaggle';
  const shortTrack = Number(payload.audio_duration || 0) <= 90;
  return {
    ...payload,
    model: isKaggle ? KAGGLE_MODEL : payload.model,
    inference_steps: isKaggle ? KAGGLE_STEPS : payload.inference_steps,
    guidance_scale: isKaggle ? KAGGLE_GUIDANCE_SCALE : payload.guidance_scale,
    shift: isKaggle ? KAGGLE_SHIFT : payload.shift,
    batch_size: 1,
    thinking: isKaggle ? false : payload.thinking,
    use_format: false,
    use_cot_caption: false,
    use_cot_language: false,
    constrained_decoding: false,
    allow_lm_batch: false,
    infer_method: isKaggle ? 'ode' : payload.infer_method,
    use_tiled_decode: isKaggle ? !shortTrack : true,
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
      audioUrl: audioUrls[0] || '',
      audioUrls,
      candidates: audioUrls.slice(0, 2).map((audioUrl, index) => ({ id: index === 0 ? 'A' : 'B', audioUrl, audioFormat: 'wav' })),
      metadata: {
        ...(context.metadata || {}),
        audioUrls,
        currentStage: 'SONARA T4x2 tempo-locked generation complete',
        performanceProfile: KAGGLE_PROFILE
      }
    }
  };
}

async function maybeSubmitPair(request, env) {
  if (request.method !== 'POST') return null;
  const url = new URL(request.url);
  if (url.pathname !== '/api/engine/generate') return null;
  if (!internalGenerationAuthorized(request, env)) return json(request, { error: 'Unauthorized SONARA generation request.' }, 401);

  const body = await request.clone().json();
  if (!body?.dualFast) return null;
  const payload = buildPayload(body, env);
  const workers = await healthyWorkers(env);
  if (!workers.length) return json(request, { error: 'SONARA sta riattivando il motore di generazione. Riprova automaticamente senza perdere la sessione.' }, 503);

  const selected = workers.slice(0, 2);
  const submissions = await Promise.all(selected.map((worker, index) => submitOnWorker(worker, env, payloadForWorker(payload, worker, index))));
  const jobId = `d9pair_${crypto.randomUUID()}`;
  const context = {
    phase: 'processing',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tasks: submissions,
    metadata: {
      currentStage: selected.length >= 2 ? 'SONARA T4x2 tempo-locked rendering A + B' : 'SONARA tempo-locked rendering',
      performanceProfile: KAGGLE_PROFILE,
      bpm: payload.bpm,
      tempoLock: tempoLockText(payload.bpm)
    },
    queryFailures: 0
  };
  await storeJob(jobId, context);
  return json(request, { jobId, status: 'PROCESSING', progress: 12, metadata: context.metadata }, 202);
}

async function pollPair(request, env) {
  if (request.method !== 'GET') return null;
  const url = new URL(request.url);
  const match = url.pathname.match(JOB_PATH);
  if (!match) return null;
  const jobId = match[1];
  const context = await readJob(jobId);
  if (!context) return null;

  try {
    const refs = [];
    let completed = 0;
    for (const task of context.tasks || []) {
      const worker = workerFromTask(task);
      const result = await workerJson(worker, env, '/query_result', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task_id_list: [task.taskId] })
      }, QUERY_TIMEOUT_MS);
      const items = parseItems(result?.data);
      const item = items[0] || {};
      const status = Number(item?.status ?? item?.state ?? 0);
      if (status === 2 || status === 3 || item?.error) {
        throw new SonaraEngineError(String(item?.error || item?.message || `SONARA worker ${worker.id} generation failed.`), 502, false);
      }
      const ref = audioRefFromItem(item, worker);
      if (ref) {
        refs.push(ref);
        completed += 1;
      }
    }

    if (completed >= (context.tasks || []).length && refs.length) {
      const done = completedPayload(jobId, context, refs);
      await storeJob(jobId, done.context);
      return json(request, done.response, 200);
    }

    const progress = 20 + Math.round((completed / Math.max(1, (context.tasks || []).length)) * 70);
    const next = {
      ...context,
      queryFailures: 0,
      updatedAt: Date.now(),
      metadata: { ...(context.metadata || {}), currentStage: `SONARA: rendering tempo-locked ${completed}/${(context.tasks || []).length}` }
    };
    await storeJob(jobId, next);
    return json(request, { jobId, status: 'PROCESSING', progress, metadata: next.metadata }, 200);
  } catch (error) {
    const normalized = engineError(error);
    const failures = Number(context.queryFailures || 0) + 1;
    if (normalized.retryable && failures <= MAX_QUERY_FAILURES) {
      const next = {
        ...context,
        queryFailures: failures,
        updatedAt: Date.now(),
        metadata: { ...(context.metadata || {}), currentStage: `SONARA: riconnessione motore (${failures}/${MAX_QUERY_FAILURES})` }
      };
      await storeJob(jobId, next);
      return json(request, { jobId, status: 'PROCESSING', progress: 18, metadata: next.metadata }, 200);
    }
    return json(request, { jobId, status: 'FAILED', progress: 0, error: normalized.message }, normalized.status || 502);
  }
}

export default {
  async fetch(request, env, ctx) {
    const pair = await maybeSubmitPair(request, env);
    if (pair) return pair;
    const poll = await pollPair(request, env);
    if (poll) return poll;
    return baseEngine.fetch(request, env, ctx);
  }
};
