const VERCEL_WEB_ORIGIN = 'https://sonara-enterprise-sonaramusicai86-2765s-projects.vercel.app';
const VIDEO_PREFIX = '/api/video/';
const RETRYABLE_STATUSES = new Set([502, 503, 504, 524]);
const RETRY_DELAY_MS = 900;
const MAX_ATTEMPTS = 2;
const EDGE_JOB_PREFIX = 'edge_';
const MARKER = 'cloudflare-video-json-v4-t4-only';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalizeBaseUrl(value) {
  return String(value || '').trim().replace(/\/$/, '');
}

function videoWorkerUrl(env) {
  return normalizeBaseUrl(env?.SONARA_VIDEO_WORKER_URL || env?.WAN_VIDEO_WORKER_URL || '');
}

function isJsonResponse(response) {
  return String(response.headers.get('content-type') || '').toLowerCase().includes('application/json');
}

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      'x-sonara-video-recovery': MARKER,
      'x-sonara-video-provider': 'kaggle-wan21',
      ...extraHeaders
    }
  });
}

function copyResponse(response) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-video-recovery', MARKER);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function jsonFailure(upstreamStatus, message, attempts) {
  return jsonResponse(503, {
    error: { code: 'VIDEO_UPSTREAM_RETRYABLE', message },
    retryable: true,
    upstreamStatus,
    attempts,
    zeroCost: true,
    googleBillingRequired: false,
    geminiEnabled: false
  });
}

function upstreamTarget(request) {
  const incoming = new URL(request.url);
  return new URL(incoming.pathname + incoming.search, VERCEL_WEB_ORIGIN);
}

function upstreamHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.set('x-sonara-video-edge', 't4-only-v4');
  return headers;
}

function makeUpstreamRequest(request, bodyBytes) {
  return new Request(upstreamTarget(request).toString(), {
    method: request.method,
    headers: upstreamHeaders(request),
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : bodyBytes,
    redirect: 'manual'
  });
}

async function responseLooksHtml(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html')) return true;
  if (isJsonResponse(response)) return false;
  try {
    const preview = (await response.clone().text()).trimStart().slice(0, 80).toLowerCase();
    return preview.startsWith('<!doctype html') || preview.startsWith('<html');
  } catch {
    return false;
  }
}

function safeJsonBytes(bytes) {
  if (!bytes) return {};
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return {};
  }
}

async function providerJson(response, label) {
  const text = (await response.text()).trim();
  if (!text) throw new Error(`${label} risposta vuota (HTTP ${response.status}).`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} risposta non JSON (HTTP ${response.status}).`);
  }
}

function validateGenerateBody(body) {
  const prompt = String(body?.prompt || '').trim();
  const durationSeconds = Math.max(1, Number(body?.durationSeconds || 8));
  const mediaReferences = Array.isArray(body?.mediaReferences) ? body.mediaReferences : [];
  if (prompt.length < 8) {
    return 'Inserisci un prompt Video AI di almeno 8 caratteri.';
  }
  if (durationSeconds > 8) {
    return 'Il motore gratuito Kaggle T4 genera attualmente clip WAN da massimo 8 secondi per scena.';
  }
  if (mediaReferences.length > 0) {
    return 'Il motore gratuito Kaggle T4 attualmente accetta prompt testuali senza media caricati.';
  }
  return '';
}

async function wanHealth(env, fetcher = fetch) {
  const base = videoWorkerUrl(env);
  if (!base) {
    return {
      configured: false,
      valid: false,
      ready: false,
      provider: 'kaggle-wan21',
      model: 'Wan2.1-T2V-1.3B'
    };
  }
  try {
    const response = await fetcher(`${base}/health`, {
      headers: { 'cache-control': 'no-store' },
      signal: AbortSignal.timeout(10_000)
    });
    const payload = await providerJson(response, 'WAN health');
    const loaded = Boolean(payload?.loaded);
    const ready = Boolean(payload?.ready);
    const warmed = Boolean(payload?.warmed);
    const valid = response.ok &&
      String(payload?.status || '').toLowerCase() === 'ok' &&
      String(payload?.provider || '').toLowerCase().includes('wan');
    return {
      configured: true,
      valid,
      ready,
      warmed,
      provider: 'kaggle-wan21',
      model: String(payload?.model || 'Wan2.1-T2V-1.3B'),
      profile: String(payload?.profile || ''),
      worker: base,
      upstreamStatus: response.status,
      loaded,
      loading: Boolean(payload?.loading),
      cacheEnabled: Boolean(payload?.cacheEnabled),
      deviceMode: String(payload?.deviceMode || '')
    };
  } catch (cause) {
    return {
      configured: true,
      valid: false,
      ready: false,
      provider: 'kaggle-wan21',
      model: 'Wan2.1-T2V-1.3B',
      worker: base,
      error: cause instanceof Error ? cause.message : String(cause)
    };
  }
}

async function startWan(body, env, fetcher = fetch) {
  const base = videoWorkerUrl(env);
  if (!base) throw new Error('SONARA_VIDEO_WORKER_URL non configurato.');
  const response = await fetcher(`${base}/v1/video/generate`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    },
    body: JSON.stringify({
      prompt: String(body?.prompt || '').trim(),
      aspectRatio: body?.aspectRatio === '9:16' ? '9:16' : '16:9',
      durationSeconds: 8,
      ...(Number.isFinite(Number(body?.seed)) ? { seed: Number(body.seed) } : {})
    }),
    signal: AbortSignal.timeout(20_000)
  });
  const payload = await providerJson(response, 'SONARA WAN Video');
  if (!response.ok || !payload?.jobId) {
    throw new Error(String(payload?.detail || payload?.error || payload?.message || `WAN worker HTTP ${response.status}`));
  }
  return {
    jobId: String(payload.jobId),
    progress: Math.max(2, Number(payload?.progress || 2)),
    stage: String(payload?.stage || 'In coda su SONARA WAN')
  };
}

async function pollWan(workerJobId, env, fetcher = fetch) {
  const base = videoWorkerUrl(env);
  if (!base) throw new Error('SONARA_VIDEO_WORKER_URL non configurato.');
  const response = await fetcher(`${base}/v1/video/job/${encodeURIComponent(workerJobId)}`, {
    headers: { 'cache-control': 'no-store' },
    signal: AbortSignal.timeout(15_000)
  });
  const payload = await providerJson(response, 'SONARA WAN Video job');
  if (!response.ok) {
    throw new Error(String(payload?.detail || payload?.error || `WAN worker HTTP ${response.status}`));
  }
  const status = String(payload?.status || '').toUpperCase();
  if (status === 'FAILED') {
    return {
      done: true,
      error: String(payload?.error || 'Generazione WAN fallita.')
    };
  }
  if (status !== 'COMPLETED') {
    return {
      done: false,
      progress: Math.max(5, Math.min(95, Number(payload?.progress || 35))),
      stage: String(payload?.stage || 'SONARA WAN sta generando il video')
    };
  }
  const videoPath = String(payload?.videoPath || '').trim();
  if (!videoPath || !videoPath.startsWith('/v1/video/file/')) {
    return {
      done: true,
      error: 'WAN ha completato il job senza un file video valido.'
    };
  }
  return {
    done: true,
    videoPath,
    metadata: {
      model: payload?.model,
      profile: payload?.profile,
      deviceMode: payload?.deviceMode,
      steps: payload?.steps,
      resolution: payload?.resolution,
      fps: payload?.fps,
      clipSeconds: payload?.clipSeconds,
      videoCodec: payload?.videoCodec,
      audioCodec: payload?.audioCodec,
      audioVerified: payload?.audioVerified,
      videoVerified: payload?.videoVerified
    }
  };
}

function workerJobIdFromEdge(edgeJobId) {
  const value = String(edgeJobId || '');
  if (!value.startsWith(EDGE_JOB_PREFIX)) return '';
  const workerJobId = value.slice(EDGE_JOB_PREFIX.length);
  return /^wan_[A-Za-z0-9_-]+$/.test(workerJobId) ? workerJobId : '';
}

async function startDirectT4Job(request, bodyBytes, env, fetcher) {
  const body = safeJsonBytes(bodyBytes);
  const validationError = validateGenerateBody(body);
  if (validationError) {
    return jsonResponse(503, {
      error: {
        code: 'ZERO_COST_VIDEO_LIMIT',
        message: validationError
      },
      retryable: false,
      zeroCost: true,
      creditsReserved: false,
      provider: 'kaggle-wan21',
      googleBillingRequired: false,
      geminiEnabled: false
    });
  }

  const health = await wanHealth(env, fetcher);
  if (!health.valid) {
    return jsonResponse(503, {
      error: {
        code: 'ZERO_COST_VIDEO_WORKER_UNAVAILABLE',
        message: 'Il worker gratuito SONARA WAN su Kaggle T4 non è raggiungibile. Nessuna richiesta è stata inviata a Google.'
      },
      retryable: true,
      zeroCost: true,
      creditsReserved: false,
      provider: 'kaggle-wan21',
      googleBillingRequired: false,
      geminiEnabled: false,
      worker: health.worker,
      ready: Boolean(health.ready),
      loaded: Boolean(health.loaded),
      loading: Boolean(health.loading),
      profile: health.profile || '',
      detail: health.error || null
    });
  }

  try {
    const started = await startWan(body, env, fetcher);
    const waitingForModel = !health.ready;
    return jsonResponse(202, {
      jobId: `${EDGE_JOB_PREFIX}${started.jobId}`,
      status: 'PROCESSING',
      progress: started.progress,
      stage: waitingForModel
        ? 'SONARA Video AI: V10 in caricamento, job accodato automaticamente'
        : 'SONARA Video AI: WAN 2.1 avviato direttamente su Kaggle T4',
      provider: 'kaggle-wan21',
      workerReady: Boolean(health.ready),
      autoQueued: waitingForModel,
      zeroCost: true,
      creditsReserved: false,
      googleBillingRequired: false,
      geminiEnabled: false
    });
  } catch (cause) {
    return jsonResponse(503, {
      error: {
        code: 'ZERO_COST_VIDEO_START_FAILED',
        message: cause instanceof Error ? cause.message : String(cause)
      },
      retryable: true,
      zeroCost: true,
      creditsReserved: false,
      provider: 'kaggle-wan21',
      googleBillingRequired: false,
      geminiEnabled: false
    });
  }
}

async function edgeJobPoll(request, env, fetcher) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/video\/job\/(edge_[A-Za-z0-9_-]+)$/);
  if (!match) return null;
  const edgeJobId = match[1];
  const workerJobId = workerJobIdFromEdge(edgeJobId);
  if (!workerJobId) {
    return jsonResponse(400, {
      jobId: edgeJobId,
      status: 'FAILED',
      progress: 0,
      stage: 'Job Video AI non valido',
      error: 'Identificativo WAN non valido.',
      provider: 'kaggle-wan21'
    });
  }
  try {
    const result = await pollWan(workerJobId, env, fetcher);
    if (!result.done) {
      return jsonResponse(200, {
        jobId: edgeJobId,
        status: 'PROCESSING',
        progress: result.progress,
        stage: result.stage,
        provider: 'kaggle-wan21',
        zeroCost: true,
        googleBillingRequired: false,
        geminiEnabled: false
      });
    }
    if (result.error) {
      return jsonResponse(200, {
        jobId: edgeJobId,
        status: 'FAILED',
        progress: 0,
        stage: 'Errore WAN Video AI',
        error: result.error,
        provider: 'kaggle-wan21',
        zeroCost: true,
        googleBillingRequired: false,
        geminiEnabled: false
      });
    }
    const videoUrl = `${url.origin}/api/video/edge-media?job=${encodeURIComponent(workerJobId)}`;
    return jsonResponse(200, {
      jobId: edgeJobId,
      status: 'COMPLETED',
      progress: 100,
      stage: 'Video pronto',
      videoUrl,
      provider: 'kaggle-wan21',
      zeroCost: true,
      googleBillingRequired: false,
      geminiEnabled: false,
      metadata: result.metadata
    });
  } catch (cause) {
    return jsonResponse(200, {
      jobId: edgeJobId,
      status: 'FAILED',
      progress: 0,
      stage: 'Errore WAN Video AI',
      error: cause instanceof Error ? cause.message : String(cause),
      provider: 'kaggle-wan21',
      zeroCost: true,
      googleBillingRequired: false,
      geminiEnabled: false
    });
  }
}

async function edgeMedia(request, env, fetcher) {
  const url = new URL(request.url);
  const workerJobId = String(url.searchParams.get('job') || '').trim();
  if (!/^wan_[A-Za-z0-9_-]+$/.test(workerJobId)) {
    return jsonResponse(403, {
      error: {
        code: 'VIDEO_EDGE_MEDIA_FORBIDDEN',
        message: 'Riferimento video non valido.'
      }
    });
  }

  const result = await pollWan(workerJobId, env, fetcher);
  if (!result.done || result.error || !result.videoPath) {
    return jsonResponse(409, {
      error: {
        code: 'VIDEO_EDGE_MEDIA_NOT_READY',
        message: result.error || 'Il video WAN non è ancora pronto.'
      }
    });
  }

  const base = videoWorkerUrl(env);
  const headers = new Headers();
  const range = request.headers.get('range');
  if (range) headers.set('range', range);
  const response = await fetcher(`${base}${result.videoPath}`, {
    headers,
    redirect: 'follow',
    signal: AbortSignal.timeout(120_000)
  });
  if (!response.ok && response.status !== 206) {
    return jsonResponse(502, {
      error: {
        code: 'VIDEO_EDGE_MEDIA_DOWNLOAD_FAILED',
        message: `Download video WAN HTTP ${response.status}.`
      }
    });
  }

  const outgoing = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = response.headers.get(name);
    if (value) outgoing.set(name, value);
  }
  outgoing.set('cache-control', 'private, max-age=300');
  outgoing.set('x-sonara-video-provider', 'kaggle-wan21');
  outgoing.set('x-sonara-video-recovery', MARKER);
  return new Response(response.body, {
    status: response.status,
    headers: outgoing
  });
}

async function edgeHealth(env, fetcher) {
  const health = await wanHealth(env, fetcher);
  return jsonResponse(health.valid ? 200 : 503, {
    ...health,
    zeroCost: true,
    googleBillingRequired: false,
    geminiEnabled: false,
    vertexEnabled: false,
    routeMode: 'kaggle-t4-only'
  });
}

async function proxyNonGenerationVideoApi(request, bodyBytes, fetcher, waiter) {
  let lastResponse = null;
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetcher(makeUpstreamRequest(request, bodyBytes));
      lastResponse = response;
      const html = await responseLooksHtml(response);
      const retryable = RETRYABLE_STATUSES.has(response.status) || (response.status >= 500 && html);
      if (!retryable) {
        if (html) {
          return jsonFailure(
            response.status || 502,
            `Il server Video AI ha restituito HTML invece di JSON (HTTP ${response.status || 502}).`,
            attempt
          );
        }
        return copyResponse(response);
      }
      if (attempt < MAX_ATTEMPTS) await waiter(RETRY_DELAY_MS);
    } catch (cause) {
      lastError = cause;
      if (attempt < MAX_ATTEMPTS) await waiter(RETRY_DELAY_MS);
    }
  }
  return jsonFailure(
    lastResponse?.status || 502,
    lastError instanceof Error
      ? `Server Video AI temporaneamente non raggiungibile: ${lastError.message}`
      : `Server Video AI temporaneamente non raggiungibile (HTTP ${lastResponse?.status || 502}).`,
    MAX_ATTEMPTS
  );
}

export function isVideoApiRequest(request) {
  return new URL(request.url).pathname.startsWith(VIDEO_PREFIX);
}

export async function recoverVideoApi(request, options = {}) {
  const fetcher = options.fetcher || fetch;
  const waiter = options.waiter || sleep;
  const env = options.env || {};
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/api/video/edge-health') {
    return edgeHealth(env, fetcher);
  }
  if (request.method === 'GET' && url.pathname === '/api/video/edge-media') {
    return edgeMedia(request, env, fetcher);
  }
  if (request.method === 'GET' && url.pathname.startsWith('/api/video/job/edge_')) {
    return edgeJobPoll(request, env, fetcher);
  }

  const bodyBytes = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.clone().arrayBuffer();

  if (request.method === 'POST' && url.pathname === '/api/video/generate') {
    return startDirectT4Job(request, bodyBytes, env, fetcher);
  }

  return proxyNonGenerationVideoApi(request, bodyBytes, fetcher, waiter);
}

export default {
  async fetch(request, env, ctx) {
    return recoverVideoApi(request, { env, ctx });
  }
};