import engineV17, { buildV17Payload } from './sonara-engine-v17-lm-composer.mjs';
import { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';

const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const JOB_PREFIX = 'd18fast_';
const JOB_PATH = /^\/api\/music\/job\/(d18fast_[^/]+)$/;
const JOB_CACHE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/fast-hq-v18/';
const JOB_TTL_SECONDS = 3 * 60 * 60;
const PROFILE = 'sonara-fast-hq-v18';
const QUALITY_LOCK = 'v18-fast-hq-5hz-thinking-cot-8step';
const MODEL = 'acestep-v15-turbo';
const LM_MODEL = 'acestep-5Hz-lm-0.6B';
const INFERENCE_STEPS = 8;
const SUBMIT_TIMEOUT_MS = 120_000;
const QUERY_TIMEOUT_MS = 30_000;
const MAX_QUERY_FAILURES = 8;

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function configuredWorkers(env = {}) {
  return String(
    env.ACESTEP_WORKER_URLS ||
    env.ACE_STEP_API_URLS ||
    env.SONARA_ACE_STEP_WORKERS ||
    ''
  )
    .split(/[\s,;]+/)
    .map(normalizeBaseUrl)
    .filter(url => /^https?:\/\//i.test(url))
    .slice(0, 4)
    .map((baseUrl, index) => ({ id: `t4-${index}`, baseUrl, kind: 'kaggle' }));
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
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Music-Quality,X-Sonara-ACE-Worker,X-Sonara-Speed-Profile',
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
      'x-sonara-speed-profile': 'v18-fast-hq-single-master',
      ...corsHeaders(request)
    }
  });
}

function internalGenerationAuthorized(request, env) {
  const required = String(env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  return !required || String(request.headers.get('X-Sonara-Internal-Secret') || '').trim() === required;
}

function cacheUrl(jobId) {
  return `${JOB_CACHE_PREFIX}${encodeURIComponent(jobId)}`;
}

async function storeJob(jobId, context) {
  if (typeof caches === 'undefined' || !caches.default) throw new Error('SONARA Fast HQ job cache unavailable.');
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

async function readJob(jobId) {
  try {
    if (typeof caches === 'undefined' || !caches.default) return null;
    const response = await caches.default.match(new Request(cacheUrl(jobId)));
    return response ? await response.json() : null;
  } catch {
    return null;
  }
}

function parseItems(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : (parsed ? [parsed] : []);
    } catch {
      return [];
    }
  }
  return value && typeof value === 'object' ? [value] : [];
}

function firstResultItem(task) {
  return parseItems(task?.result).find(item => item && typeof item === 'object') || {};
}

function taskFailure(task) {
  const item = firstResultItem(task);
  return String(
    item?.error ||
    item?.message ||
    task?.error ||
    task?.message ||
    task?.progress_text ||
    'Generazione SONARA Fast HQ non completata.'
  ).trim();
}

function progressFromTask(task) {
  const item = firstResultItem(task);
  const raw = Number(item?.progress ?? task?.progress ?? 0);
  if (!Number.isFinite(raw) || raw <= 0) return 42;
  const normalized = raw <= 1 ? raw * 100 : raw;
  return Math.max(35, Math.min(95, Math.round(35 + normalized * 0.6)));
}

function stageFromTask(task) {
  const item = firstResultItem(task);
  const stage = String(item?.stage || task?.stage || task?.progress_text || '').trim();
  return stage ? `SONARA V18 Fast HQ: ${stage}` : 'SONARA V18 Fast HQ: rendering master HQ';
}

function audioRefFromTask(task, worker) {
  for (const item of parseItems(task?.result)) {
    if (!item || typeof item !== 'object') continue;
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
  }
  return null;
}

function publicAudioUrl(ref) {
  return `${PUBLIC_API_ORIGIN}/api/modal/audio?sonara_worker=${encodeURIComponent(ref.workerId)}&path=${encodeURIComponent(ref.path)}`;
}

async function submitSingleMaster(worker, env, payload) {
  const response = await fetch(`${worker.baseUrl}/release_task`, {
    method: 'POST',
    headers: workerHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS)
  });
  const raw = await response.text();
  let data = {};
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`ACE-Step ${worker.id} ha restituito JSON non valido (HTTP ${response.status}).`); }
  if (!response.ok || (typeof data?.code === 'number' && data.code >= 400)) {
    throw new Error(String(data?.error?.message || data?.error || data?.message || `ACE-Step HTTP ${response.status}`));
  }
  const taskId = data?.data?.task_id;
  if (!taskId) throw new Error(`ACE-Step ${worker.id} non ha restituito task_id.`);
  return String(taskId);
}

async function startFastHq(request, env, body) {
  const worker = configuredWorkers(env)[0];
  if (!worker) {
    return json(request, {
      status: 'FAILED',
      progress: 0,
      retryable: true,
      error: 'Nessun worker gratuito ACE-Step configurato.',
      sonaraMusicV18: true,
      paidFallbackUsed: false
    }, 503);
  }

  const seed = Math.max(1, Math.floor(Date.now() % 2_000_000_000));
  const payload = buildV17Payload(body, 'structure', seed + 7919);
  const jobId = `${JOB_PREFIX}${crypto.randomUUID()}`;
  const baseContext = {
    phase: 'starting',
    title: String(body?.title || 'SONARA Track'),
    genre: String(body?.genre || 'Music'),
    subgenre: String(body?.subgenre || body?.genre || 'Music'),
    durationSec: Number(payload.audio_duration || body?.durationSec || body?.duration || 30),
    workerId: worker.id,
    baseUrl: worker.baseUrl,
    profile: PROFILE,
    qualityLock: QUALITY_LOCK,
    queryFailures: 0,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  await storeJob(jobId, baseContext);

  try {
    const taskId = await submitSingleMaster(worker, env, payload);
    const context = {
      ...baseContext,
      phase: 'submitted',
      taskId,
      lmTemperature: payload.lm_temperature,
      lmCfgScale: payload.lm_cfg_scale,
      lmTopP: payload.lm_top_p,
      updatedAt: Date.now()
    };
    await storeJob(jobId, context);
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 34,
      sonaraMusicV18: true,
      lmComposer: true,
      metadata: {
        engine: 'SONARA ACE-Step 1.5 + 5Hz LM',
        studioQuality: true,
        studioQualityProfile: PROFILE,
        qualityLock: QUALITY_LOCK,
        speedProfile: 'fast-hq-single-master',
        renderModel: MODEL,
        lmModel: LM_MODEL,
        thinking: true,
        cotCaption: true,
        cotLanguage: true,
        constrainedDecoding: true,
        inferenceSteps: INFERENCE_STEPS,
        candidateCount: 1,
        paidFallbackUsed: false,
        workerId: worker.id,
        lmTemperature: payload.lm_temperature,
        lmCfgScale: payload.lm_cfg_scale,
        lmTopP: payload.lm_top_p,
        currentStage: 'SONARA V18 Fast HQ: composizione 5Hz LM e render del master'
      }
    }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await storeJob(jobId, { ...baseContext, phase: 'failed', error: message, retryable: true, updatedAt: Date.now() });
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      retryable: true,
      error: message,
      sonaraMusicV18: true,
      paidFallbackUsed: false
    }, 502);
  }
}

async function pollFastHq(request, env, jobId) {
  let context = await readJob(jobId);
  if (!context) {
    return json(request, { jobId, status: 'FAILED', progress: 0, error: 'Sessione SONARA Fast HQ scaduta.', sonaraMusicV18: true }, 410);
  }
  if (context.phase === 'failed') {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      retryable: Boolean(context.retryable),
      error: context.error || 'Generazione SONARA Fast HQ fallita.',
      sonaraMusicV18: true
    });
  }
  if (context.phase === 'completed' && context.audioUrl) {
    return completedResponse(request, jobId, context);
  }
  if (!context.taskId || !context.baseUrl) {
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 20,
      sonaraMusicV18: true,
      metadata: { speedProfile: 'fast-hq-single-master', currentStage: 'SONARA V18 Fast HQ: preparazione master' }
    });
  }

  const worker = { id: context.workerId || 't4-0', baseUrl: context.baseUrl, kind: 'kaggle' };
  try {
    const response = await fetch(`${worker.baseUrl}/query_result`, {
      method: 'POST',
      headers: workerHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify({ task_id_list: [context.taskId] }),
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS)
    });
    if (!response.ok) throw new Error(`ACE-Step query HTTP ${response.status}`);
    const payload = await response.json();
    const task = payload?.data?.[0] || null;

    if (!task || Number(task.status) === 0) {
      if (context.queryFailures) {
        context = { ...context, queryFailures: 0, updatedAt: Date.now() };
        await storeJob(jobId, context);
      }
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: progressFromTask(task),
        sonaraMusicV18: true,
        lmComposer: true,
        metadata: {
          studioQuality: true,
          studioQualityProfile: PROFILE,
          qualityLock: QUALITY_LOCK,
          speedProfile: 'fast-hq-single-master',
          inferenceSteps: INFERENCE_STEPS,
          candidateCount: 1,
          thinking: true,
          currentStage: stageFromTask(task)
        }
      });
    }

    if (Number(task.status) !== 1) {
      const reason = taskFailure(task);
      await storeJob(jobId, { ...context, phase: 'failed', error: reason, retryable: false, updatedAt: Date.now() });
      return json(request, { jobId, status: 'FAILED', progress: 0, retryable: false, error: reason, sonaraMusicV18: true });
    }

    const audioRef = audioRefFromTask(task, worker);
    if (!audioRef) {
      const reason = 'Master completato ma riferimento audio non disponibile.';
      await storeJob(jobId, { ...context, phase: 'failed', error: reason, retryable: false, updatedAt: Date.now() });
      return json(request, { jobId, status: 'FAILED', progress: 0, retryable: false, error: reason, sonaraMusicV18: true });
    }

    context = {
      ...context,
      phase: 'completed',
      audioRef,
      audioUrl: publicAudioUrl(audioRef),
      queryFailures: 0,
      updatedAt: Date.now()
    };
    await storeJob(jobId, context);
    return completedResponse(request, jobId, context);
  } catch (error) {
    const failures = Number(context.queryFailures || 0) + 1;
    const shouldFail = failures >= MAX_QUERY_FAILURES;
    const message = error instanceof Error ? error.message : String(error);
    context = {
      ...context,
      phase: shouldFail ? 'failed' : context.phase,
      queryFailures: failures,
      error: shouldFail ? message : context.error,
      retryable: true,
      updatedAt: Date.now()
    };
    await storeJob(jobId, context);
    if (shouldFail) {
      return json(request, { jobId, status: 'FAILED', progress: 0, retryable: true, error: message, sonaraMusicV18: true });
    }
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: Math.min(90, 50 + failures * 4),
      retryable: true,
      sonaraMusicV18: true,
      metadata: {
        speedProfile: 'fast-hq-single-master',
        currentStage: `SONARA V18 Fast HQ: riconnessione T4 (${failures}/${MAX_QUERY_FAILURES})`
      }
    });
  }
}

function completedResponse(request, jobId, context) {
  return json(request, {
    jobId,
    status: 'COMPLETED',
    progress: 100,
    audioUrl: context.audioUrl,
    audioUrls: [context.audioUrl],
    candidates: [{
      id: 'A',
      audioUrl: context.audioUrl,
      audioFormat: 'wav',
      strategy: 'lm-structure-composer-fast-hq',
      inferenceSteps: INFERENCE_STEPS
    }],
    sonaraMusicV18: true,
    lmComposer: true,
    metadata: {
      engine: 'SONARA ACE-Step 1.5 + 5Hz LM',
      studioQuality: true,
      studioQualityProfile: PROFILE,
      qualityLock: QUALITY_LOCK,
      speedProfile: 'fast-hq-single-master',
      renderModel: MODEL,
      lmModel: LM_MODEL,
      thinking: true,
      cotCaption: true,
      cotLanguage: true,
      constrainedDecoding: true,
      inferenceSteps: INFERENCE_STEPS,
      candidateCount: 1,
      paidFallbackUsed: false,
      currentStage: 'Master SONARA V18 Fast HQ pronto'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const jobMatch = url.pathname.match(JOB_PATH);

    if (request.method === 'GET' && jobMatch) {
      return pollFastHq(request, env, decodeURIComponent(jobMatch[1]));
    }

    if (url.pathname === '/api/engine/generate' && request.method === 'POST') {
      if (!internalGenerationAuthorized(request, env)) return json(request, { error: 'Unauthorized SONARA generation proxy.' }, 401);
      const authoritative = await rewriteGenerationRequest(request);
      let body;
      try { body = await authoritative.clone().json(); }
      catch { return json(request, { error: 'Invalid JSON request body.' }, 400); }

      if (body?.sonaraFastHq === true || body?.speedProfile === 'fast-hq-single-master' || Number(body?.candidateCount || 0) === 1) {
        return startFastHq(request, env, body);
      }
      return engineV17.fetch(authoritative, env, ctx);
    }

    return engineV17.fetch(request, env, ctx);
  }
};
