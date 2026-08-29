import engineV17, { buildV17Payload } from './sonara-engine-v17-lm-composer.mjs';
import { rewriteGenerationRequest } from './sonara-engine-v15-authoritative-prompt.mjs';

const PUBLIC_API_ORIGIN = 'https://api.sonaraenterprise.com';
const JOB_PREFIX = 'd18fast_';
const JOB_PATH = /^\/api\/music\/job\/(d18fast_[A-Za-z0-9_-]+)$/;
const PROFILE = 'sonara-fast-hq-v18';
const QUALITY_LOCK = 'v18-fast-hq-5hz-thinking-cot-8step-stateless';
const MODEL = 'acestep-v15-turbo';
const LM_MODEL = 'acestep-5Hz-lm-0.6B';
const INFERENCE_STEPS = 8;
const SUBMIT_TIMEOUT_MS = 120_000;
const QUERY_TIMEOUT_MS = 30_000;
const MAX_JOB_AGE_MS = 6 * 60 * 60 * 1000;

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
    .map((baseUrl, index) => ({ id: `t4-${index}`, baseUrl, kind: 'kaggle', index }));
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
      'x-sonara-speed-profile': 'v18-fast-hq-single-master-stateless',
      ...corsHeaders(request)
    }
  });
}

function internalGenerationAuthorized(request, env) {
  const required = String(env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  return !required || String(request.headers.get('X-Sonara-Internal-Secret') || '').trim() === required;
}

function encodeBase64Url(text) {
  return btoa(text)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function decodeBase64Url(text) {
  const normalized = String(text || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  return atob(padded);
}

function createJobId(workerIndex, taskId, durationSec, queuePosition = 0) {
  const payload = {
    v: 2,
    w: Number(workerIndex),
    t: String(taskId),
    d: Math.max(10, Math.min(600, Math.round(Number(durationSec) || 30))),
    q: Math.max(0, Math.round(Number(queuePosition) || 0)),
    i: Date.now()
  };
  return `${JOB_PREFIX}${encodeBase64Url(JSON.stringify(payload))}`;
}

function decodeJobId(jobId) {
  try {
    if (!String(jobId || '').startsWith(JOB_PREFIX)) return null;
    const encoded = String(jobId).slice(JOB_PREFIX.length);
    if (!encoded || encoded.length > 1024) return null;
    const payload = JSON.parse(decodeBase64Url(encoded));
    const workerIndex = Number(payload?.w);
    const issuedAt = Number(payload?.i);
    const durationSec = Number(payload?.d);
    const queuePosition = Number(payload?.q || 0);
    const taskId = String(payload?.t || '');
    if (Number(payload?.v) !== 2) return null;
    if (!Number.isInteger(workerIndex) || workerIndex < 0 || workerIndex > 3) return null;
    if (!/^[A-Za-z0-9._:-]{8,200}$/.test(taskId)) return null;
    if (!Number.isFinite(issuedAt) || issuedAt <= 0 || Date.now() - issuedAt > MAX_JOB_AGE_MS) return null;
    return {
      workerIndex,
      taskId,
      durationSec: Math.max(10, Math.min(600, Math.round(Number.isFinite(durationSec) ? durationSec : 30))),
      queuePosition: Math.max(0, Math.round(Number.isFinite(queuePosition) ? queuePosition : 0)),
      issuedAt
    };
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

function estimatedProgress(token) {
  const elapsedSec = Math.max(0, (Date.now() - token.issuedAt) / 1000);
  const estimatedRenderSec = Math.max(75, token.durationSec * 3.5);
  const ratio = Math.min(1, elapsedSec / estimatedRenderSec);
  return Math.max(38, Math.min(92, Math.round(38 + ratio * 54)));
}

function progressFromTask(task, token) {
  const item = firstResultItem(task);
  const raw = Number(item?.progress ?? task?.progress ?? NaN);
  if (Number.isFinite(raw) && raw > 0) {
    const normalized = raw <= 1 ? raw * 100 : raw;
    return Math.max(38, Math.min(95, Math.round(35 + normalized * 0.6)));
  }
  return estimatedProgress(token);
}

function stageFromTask(task, token) {
  const item = firstResultItem(task);
  const stage = String(item?.stage || task?.stage || task?.progress_text || '').trim();
  if (stage) return `SONARA V18 Fast HQ: ${stage}`;
  if (token.queuePosition > 1) return `SONARA V18 Fast HQ: T4 in elaborazione (coda iniziale ${token.queuePosition})`;
  return 'SONARA V18 Fast HQ: rendering master HQ sulla T4';
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
  return {
    taskId: String(taskId),
    queuePosition: Math.max(0, Math.round(Number(data?.data?.queue_position) || 0))
  };
}

async function startFastHq(request, env, body) {
  const workers = configuredWorkers(env);
  const worker = workers[0];
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

  try {
    const submitted = await submitSingleMaster(worker, env, payload);
    const durationSec = Number(payload.audio_duration || body?.durationSec || body?.duration || 30);
    const jobId = createJobId(worker.index, submitted.taskId, durationSec, submitted.queuePosition);
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: 36,
      sonaraMusicV18: true,
      lmComposer: true,
      metadata: {
        engine: 'SONARA ACE-Step 1.5 + 5Hz LM',
        studioQuality: true,
        studioQualityProfile: PROFILE,
        qualityLock: QUALITY_LOCK,
        speedProfile: 'fast-hq-single-master-stateless',
        stateTransport: 'job-id-direct-task',
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
        queuePosition: submitted.queuePosition,
        lmTemperature: payload.lm_temperature,
        lmCfgScale: payload.lm_cfg_scale,
        lmTopP: payload.lm_top_p,
        currentStage: submitted.queuePosition > 1
          ? `SONARA V18 Fast HQ: richiesta accodata sulla T4 (posizione ${submitted.queuePosition})`
          : 'SONARA V18 Fast HQ: composizione 5Hz LM e render del master'
      }
    }, 202);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(request, {
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
  const token = decodeJobId(jobId);
  if (!token) {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      retryable: false,
      error: 'Job SONARA V18 non valido o scaduto.',
      sonaraMusicV18: true
    }, 400);
  }

  const worker = configuredWorkers(env)[token.workerIndex];
  if (!worker) {
    return json(request, {
      jobId,
      status: 'FAILED',
      progress: 0,
      retryable: true,
      error: 'Worker SONARA associato al job non disponibile.',
      sonaraMusicV18: true
    }, 503);
  }

  try {
    const response = await fetch(`${worker.baseUrl}/query_result`, {
      method: 'POST',
      headers: workerHeaders(env, { 'content-type': 'application/json', Accept: 'application/json' }),
      body: JSON.stringify({ task_id_list: [token.taskId] }),
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS)
    });
    const raw = await response.text();
    let payload = {};
    try { payload = raw ? JSON.parse(raw) : {}; }
    catch { throw new Error(`ACE-Step query non JSON (HTTP ${response.status}).`); }
    if (!response.ok || (typeof payload?.code === 'number' && payload.code >= 400)) {
      throw new Error(String(payload?.error?.message || payload?.error || payload?.message || `ACE-Step query HTTP ${response.status}`));
    }

    const task = payload?.data?.[0] || null;
    const taskStatus = Number(task?.status ?? 0);

    if (!task || taskStatus === 0) {
      return json(request, {
        jobId,
        status: 'PROCESSING',
        progress: progressFromTask(task, token),
        sonaraMusicV18: true,
        lmComposer: true,
        metadata: {
          studioQuality: true,
          studioQualityProfile: PROFILE,
          qualityLock: QUALITY_LOCK,
          speedProfile: 'fast-hq-single-master-stateless',
          stateTransport: 'job-id-direct-task',
          inferenceSteps: INFERENCE_STEPS,
          candidateCount: 1,
          thinking: true,
          initialQueuePosition: token.queuePosition,
          currentStage: stageFromTask(task, token)
        }
      });
    }

    if (taskStatus !== 1) {
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 0,
        retryable: false,
        error: taskFailure(task),
        sonaraMusicV18: true
      });
    }

    const audioRef = audioRefFromTask(task, worker);
    if (!audioRef) {
      return json(request, {
        jobId,
        status: 'FAILED',
        progress: 0,
        retryable: false,
        error: 'Master completato ma riferimento audio non disponibile.',
        sonaraMusicV18: true
      });
    }

    return completedResponse(request, jobId, publicAudioUrl(audioRef), token, worker);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json(request, {
      jobId,
      status: 'PROCESSING',
      progress: Math.max(40, Math.min(90, estimatedProgress(token))),
      retryable: true,
      sonaraMusicV18: true,
      metadata: {
        studioQuality: true,
        speedProfile: 'fast-hq-single-master-stateless',
        stateTransport: 'job-id-direct-task',
        currentStage: `SONARA V18 Fast HQ: riconnessione automatica T4 — ${message}`
      }
    });
  }
}

function completedResponse(request, jobId, audioUrl, token, worker) {
  return json(request, {
    jobId,
    status: 'COMPLETED',
    progress: 100,
    audioUrl,
    audioUrls: [audioUrl],
    candidates: [{
      id: 'A',
      audioUrl,
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
      speedProfile: 'fast-hq-single-master-stateless',
      stateTransport: 'job-id-direct-task',
      renderModel: MODEL,
      lmModel: LM_MODEL,
      thinking: true,
      cotCaption: true,
      cotLanguage: true,
      constrainedDecoding: true,
      inferenceSteps: INFERENCE_STEPS,
      candidateCount: 1,
      durationSec: token.durationSec,
      workerId: worker.id,
      paidFallbackUsed: false,
      currentStage: 'Master SONARA V18 Fast HQ pronto'
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const jobMatch = url.pathname.match(JOB_PATH);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

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
