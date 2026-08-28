import engineV16, { buildStudioPayload } from './sonara-engine-v16-studio-quality.mjs';
import { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';

const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const JOB_CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/studio-quality-v16/';
const JOB_TTL_SECONDS = 3 * 60 * 60;
const MODEL = 'acestep-v15-turbo';
const LM_MODEL = 'acestep-5Hz-lm-0.6B';
const PROFILE = 'sonara-lm-composer-v17';
const QUALITY_LOCK = 'v17-5hz-thinking-cot-8step';
const STUDIO_STEPS = 8;
const SUBMIT_TIMEOUT_MS = 180_000;
const HEALTH_TIMEOUT_MS = 20_000;

function clamp(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
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
  return splitWorkerUrls(
    env.ACESTEP_WORKER_URLS ||
    env.ACE_STEP_API_URLS ||
    env.SONARA_ACE_STEP_WORKERS ||
    ''
  ).slice(0, 4).map((baseUrl, index) => ({
    id: `t4-${index}`,
    baseUrl,
    kind: 'kaggle'
  }));
}

function workerHeaders(env, extra = {}) {
  const headers = { ...extra };
  const apiKey = String(env.ACE_STEP_API_KEY || env.ACESTEP_API_KEY || '').trim();
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers['X-API-Key'] = apiKey;
  }
  return headers;
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
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Music-Quality,X-Sonara-ACE-Worker',
    Vary: 'Origin'
  };
}

function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-sonara-music-quality': PROFILE,
      ...corsHeaders(request)
    }
  });
}

function internalGenerationAuthorized(request, env) {
  const required = String(env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  return !required || String(request.headers.get('X-Sonara-Internal-Secret') || '').trim() === required;
}

async function checkWorker(worker, env) {
  try {
    const response = await fetch(`${worker.baseUrl}/health`, {
      headers: workerHeaders(env, { Accept: 'application/json' }),
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS)
    });
    if (!response.ok) return false;
    const payload = await response.json();
    const data = payload?.data || payload;
    const status = String(data?.status || payload?.status || '').toLowerCase();
    return payload?.code === 200 || ['ok', 'ready', 'healthy', 'online', 'success'].includes(status);
  } catch {
    return false;
  }
}

async function healthyWorkers(env) {
  const workers = configuredWorkers(env);
  const checked = await Promise.all(workers.map(async worker => ({ worker, ready: await checkWorker(worker, env) })));
  return checked.filter(entry => entry.ready).map(entry => entry.worker);
}

function lmControls(body, strategy) {
  const weirdness = Math.round(clamp(body?.weirdness, 50, 0, 100));
  const styleInfluence = Math.round(clamp(body?.styleInfluence ?? body?.style_influence, 50, 0, 100));
  const structure = strategy === 'structure';

  const baseTemperature = 0.72 + weirdness * 0.0022;
  const baseCfg = 1.8 + styleInfluence * 0.012;
  const baseTopP = 0.84 + weirdness * 0.0009;

  return {
    lmTemperature: Math.round(clamp(baseTemperature + (structure ? -0.03 : 0.08), 0.68, 0.98) * 1000) / 1000,
    lmCfgScale: Math.round(clamp(baseCfg + (structure ? 0.35 : -0.15), 1.5, 3.5) * 1000) / 1000,
    lmTopP: Math.round(clamp(baseTopP + (structure ? -0.015 : 0.035), 0.82, 0.97) * 1000) / 1000,
    lmRepetitionPenalty: structure ? 1.055 : 1.035
  };
}

export function buildV17Payload(body = {}, strategy = 'structure', seed = 1) {
  const base = buildStudioPayload(body, strategy, seed);
  const lm = lmControls(body, strategy);
  const structure = strategy === 'structure';
  return {
    ...base,
    model: MODEL,
    inference_steps: STUDIO_STEPS,
    // Turbo ignores shift as a creative differentiator. Keep the official/default value.
    shift: 3.0,
    thinking: true,
    use_format: true,
    use_cot_caption: true,
    use_cot_language: true,
    constrained_decoding: true,
    constrained_decoding_debug: false,
    allow_lm_batch: false,
    lm_model_path: LM_MODEL,
    lm_backend: 'pt',
    lm_temperature: lm.lmTemperature,
    lm_cfg_scale: lm.lmCfgScale,
    lm_top_p: lm.lmTopP,
    lm_repetition_penalty: lm.lmRepetitionPenalty,
    lm_negative_prompt: structure
      ? 'incoherent structure, weak hook recall, genre drift, unstable rhythm, malformed sections, abrupt ending, low quality'
      : 'muddy mix, harsh highs, unstable vocals, flat dynamics, repetitive filler, genre drift, malformed ending, low quality'
  };
}

async function submitOnWorker(worker, env, payload) {
  const response = await fetch(`${worker.baseUrl}/release_task`, {
    method: 'POST',
    headers: workerHeaders(env, { 'content-type': 'application/json' }),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS)
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`ACE-Step ${worker.id} returned invalid JSON (HTTP ${response.status}).`); }
  if (!response.ok || (typeof data?.code === 'number' && data.code >= 400)) {
    throw new Error(String(data?.error?.message || data?.error || data?.message || `ACE-Step HTTP ${response.status}`));
  }
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error(`ACE-Step ${worker.id} did not return task_id.`);
  return { workerId: worker.id, workerKind: worker.kind, baseUrl: worker.baseUrl, taskId: String(taskId), model: MODEL };
}

function cacheUrl(jobId) {
  return `${JOB_CACHE_PREFIX}${encodeURIComponent(jobId)}`;
}

async function storeJob(jobId, context) {
  if (typeof caches === 'undefined' || !caches.default) throw new Error('SONARA Studio job cache unavailable.');
  await caches.default.put(
    new Request(cacheUrl(jobId)),
    new Response(JSON.stringify(context), {
      headers: {
        'content-type': 'application/json; charset=UTF-8',
        'cache-control': `public, max-age=${JOB_TTL_SECONDS}`
      }
    })
  );
}

async function startV17(request, env, body) {
  const workers = await healthyWorkers(env);
  if (!workers.length) {
    return json(request, {
      status: 'FAILED',
      progress: 0,
      retryable: true,
      error: 'Nessun worker ACE-Step gratuito è raggiungibile.',
      lmComposer: true,
      paidFallbackUsed: false
    }, 503);
  }

  // Quality-first: if only GPU0 music is available, both masters are queued there.
  // GPU1 Video AI is never used by this engine.
  const selected = workers.length >= 2 ? workers.slice(0, 2) : [workers[0], workers[0]];
  const baseSeed = Math.max(1, Math.floor(Date.now() % 2_000_000_000));
  const payloads = [
    buildV17Payload(body, 'structure', baseSeed + 7919),
    buildV17Payload(body, 'detail', baseSeed + 15838)
  ];
  const jobId = `d16pair_${crypto.randomUUID()}`;
  const context = {
    phase: 'starting',
    title: String(body?.title || 'SONARA Track'),
    genre: String(body?.genre || 'Music'),
    subgenre: String(body?.subgenre || body?.genre || 'Music'),
    durationSec: payloads[0].audio_duration,
    profile: PROFILE,
    qualityLock: QUALITY_LOCK,
    tasks: [],
    queryFailures: 0,
    v17LmComposer: true,
    lmModel: LM_MODEL,
    thinking: true,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await storeJob(jobId, context);

  try {
    const submitted = await Promise.all(selected.map((worker, index) => submitOnWorker(worker, env, payloads[index])));
    const tasks = submitted.map((task, index) => ({
      ...task,
      candidate: index === 0 ? 'A' : 'B',
      strategy: index === 0 ? 'lm-structure-composer' : 'lm-detail-composer',
      inferenceSteps: STUDIO_STEPS,
      thinking: true,
      lmTemperature: payloads[index].lm_temperature,
      lmCfgScale: payloads[index].lm_cfg_scale,
      lmTopP: payloads[index].lm_top_p
    }));
    await storeJob(jobId, { ...context, phase: 'submitted', tasks, updatedAt: Date.now() });

    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 30,
      metadata: {
        engine: 'SONARA ACE-Step 1.5 + 5Hz LM',
        studioQuality: true,
        studioQualityProfile: PROFILE,
        qualityLock: QUALITY_LOCK,
        renderModel: MODEL,
        lmModel: LM_MODEL,
        thinking: true,
        cotCaption: true,
        cotLanguage: true,
        constrainedDecoding: true,
        inferenceSteps: STUDIO_STEPS,
        candidateCount: 2,
        paidFallbackUsed: false,
        candidateStrategies: tasks.map(task => ({
          candidate: task.candidate,
          strategy: task.strategy,
          workerId: task.workerId,
          lmTemperature: task.lmTemperature,
          lmCfgScale: task.lmCfgScale,
          lmTopP: task.lmTopP
        })),
        currentStage: 'SONARA V17: 5Hz LM compone e pianifica i due master'
      }
    }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await storeJob(jobId, { ...context, phase: 'failed', error: message, retryable: true, updatedAt: Date.now() });
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      retryable: true,
      error: message,
      lmComposer: true,
      paidFallbackUsed: false
    }, 502);
  }
}

async function decorateV17Response(request, response) {
  if (!response.ok) return response;
  try {
    const data = await response.clone().json();
    const metadata = data?.metadata && typeof data.metadata === 'object'
      ? {
          ...data.metadata,
          studioQualityProfile: PROFILE,
          qualityLock: QUALITY_LOCK,
          lmComposer: true,
          lmModel: LM_MODEL,
          thinking: true,
          cotCaption: true,
          cotLanguage: true,
          constrainedDecoding: true,
          inferenceSteps: STUDIO_STEPS,
          turboShiftCreativeDifferentiation: false,
          candidateDifferentiation: '5Hz LM sampling + prompt strategy + independent seed'
        }
      : data?.metadata;
    return json(request, {
      ...data,
      sonaraMusicV17: true,
      lmComposer: true,
      studioQualityProfile: PROFILE,
      qualityLock: QUALITY_LOCK,
      metadata
    }, response.status);
  } catch {
    return response;
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/engine/generate' && request.method === 'POST') {
      if (!internalGenerationAuthorized(request, env)) return json(request, { error: 'Unauthorized SONARA generation proxy.' }, 401);
      const authoritative = await rewriteGenerationRequest(request);
      let body;
      try { body = await authoritative.clone().json(); }
      catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }
      if (body?.dualFast === true && Number(body?.candidateCount || 0) === 2) {
        return startV17(request, env, body);
      }
      return engineV16.fetch(authoritative, env, ctx);
    }

    const response = await engineV16.fetch(request, env, ctx);
    if (
      request.method === 'GET' &&
      (url.pathname === '/' || url.pathname === '/api/health' || url.pathname === '/api/engine/ready' || /^\/api\/music\/job\/d16pair_/.test(url.pathname))
    ) {
      return decorateV17Response(request, response);
    }
    return response;
  }
};
