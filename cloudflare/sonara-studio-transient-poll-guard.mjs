import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-music-director-v3-ultra-guard.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-studio-transient-poll-guard-1';
const MAX_TRANSIENT_POLLS = 4;
const STATE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/studio-transient-poll-guard/';
const STUDIO_JOB_RE = /^\/api\/studio\/job\/(studio-[A-Za-z0-9_-]+)$/;
const MOLAB_TURBO_MODEL = 'acestep-v15-xl-turbo';
const MOLAB_BASE_MODEL = 'acestep-v15-xl-base';

const clean = value => String(value ?? '').trim();
const cleanUrl = value => clean(value).replace(/\/$/, '');

function molabBaseUrl(env) {
  return cleanUrl(env?.SONARA_MOLAB_XL_URL || env?.MOLAB_ACESTEP_URL || '');
}

function molabHeaders(env, extra = {}) {
  const headers = { ...extra };
  const key = clean(env?.ACE_STEP_API_KEY || env?.ACESTEP_API_KEY);
  if (key) {
    headers.Authorization = `Bearer ${key}`;
    headers['X-API-Key'] = key;
  }
  return headers;
}

function normalizeModels(value) {
  const models = [];
  const seen = new Set();
  const add = candidate => {
    const model = clean(candidate);
    if (!model || seen.has(model)) return;
    seen.add(model);
    models.push(model);
  };
  const visit = node => {
    if (!node) return;
    if (typeof node === 'string') return add(node);
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== 'object') return;
    for (const key of ['id', 'name', 'model', 'model_id', 'model_name', 'repo_id']) {
      if (typeof node[key] === 'string') add(node[key]);
    }
    for (const key of ['data', 'models', 'items', 'available_models', 'availableModels']) {
      if (node[key] !== undefined) visit(node[key]);
    }
  };
  visit(value);
  return models.filter(model => /ace|step|music/i.test(model)).slice(0, 32);
}

async function readJsonSafe(response) {
  try { return await response.json(); }
  catch { return null; }
}

async function molabCapabilities(request, env) {
  const baseUrl = molabBaseUrl(env);
  const origin = clean(request.headers.get('origin'));
  const headers = {
    'content-type': 'application/json; charset=UTF-8',
    'cache-control': 'private, no-store',
    'x-sonara-molab-capabilities': 'runtime-probe-v1'
  };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
    headers.vary = 'Origin';
  }

  if (!baseUrl) {
    return new Response(JSON.stringify({
      ready: false,
      probeVersion: 'runtime-probe-v1',
      provider: 'molab',
      configured: false,
      currentProductionModel: MOLAB_TURBO_MODEL,
      currentProductionInferenceSteps: 8,
      baseModel: MOLAB_BASE_MODEL,
      baseGenerationAvailable: false,
      modelCatalogReachable: false
    }), { status: 503, headers });
  }

  let healthData = null;
  let modelsData = null;
  let healthStatus = 0;
  let modelsStatus = 0;

  try {
    const response = await fetch(`${baseUrl}/health`, {
      headers: molabHeaders(env, { Accept: 'application/json', 'Cache-Control': 'no-cache' }),
      signal: AbortSignal.timeout(8_000)
    });
    healthStatus = response.status;
    healthData = await readJsonSafe(response);
  } catch {}

  try {
    const response = await fetch(`${baseUrl}/v1/models`, {
      headers: molabHeaders(env, { Accept: 'application/json', 'Cache-Control': 'no-cache' }),
      signal: AbortSignal.timeout(8_000)
    });
    modelsStatus = response.status;
    modelsData = await readJsonSafe(response);
  } catch {}

  const health = healthData?.data || healthData || {};
  const loadedModel = clean(health?.loaded_model || health?.model);
  const availableModels = normalizeModels(modelsData);
  const catalogHasTurbo = availableModels.some(model => model === MOLAB_TURBO_MODEL || model.includes(MOLAB_TURBO_MODEL));
  const catalogHasBase = availableModels.some(model => model === MOLAB_BASE_MODEL || model.includes(MOLAB_BASE_MODEL));
  const statusText = clean(health?.status).toLowerCase();
  const ready = healthStatus >= 200 && healthStatus < 300 && (
    health?.models_initialized === true ||
    ['ok', 'ready', 'healthy', 'online', 'success'].includes(statusText) ||
    Boolean(loadedModel)
  );

  return new Response(JSON.stringify({
    ready,
    probeVersion: 'runtime-probe-v1',
    provider: 'molab',
    configured: true,
    healthStatus,
    modelCatalogStatus: modelsStatus,
    modelCatalogReachable: modelsStatus >= 200 && modelsStatus < 300,
    loadedModel,
    availableModels,
    currentProductionModel: MOLAB_TURBO_MODEL,
    currentProductionInferenceSteps: 8,
    turboAvailable: catalogHasTurbo || loadedModel.includes(MOLAB_TURBO_MODEL),
    baseModel: MOLAB_BASE_MODEL,
    baseGenerationAvailable: catalogHasBase,
    recommendedProfiles: {
      fast: { model: MOLAB_TURBO_MODEL, inferenceSteps: 8 },
      quality: { model: MOLAB_TURBO_MODEL, inferenceSteps: 8 },
      ultra: catalogHasBase
        ? { model: MOLAB_BASE_MODEL, inferenceSteps: 50, eligible: true }
        : { model: MOLAB_TURBO_MODEL, inferenceSteps: 8, eligible: false }
    }
  }), { status: ready ? 200 : 503, headers });
}

function isTransientQueryFailure(data, status) {
  const message = clean(data?.error || data?.message || data?.detail).toLowerCase();
  if (!message) return false;
  const gateway = status === 502 || status === 503 || status === 504 || /http\s+(502|503|504)/.test(message);
  const queryTransport = /molab studio query/.test(message) && (/non json/.test(message) || /timeout/.test(message) || /fetch/.test(message));
  return gateway && queryTransport;
}

function stateStub(env, jobId) {
  try {
    const ns = env?.SONARA_JOB_STATE;
    if (!ns?.idFromName || !ns?.get) return null;
    return ns.get(ns.idFromName(`studio-transient-poll:${jobId}`));
  } catch { return null; }
}

function cacheKey(jobId) {
  return new Request(`${STATE_PREFIX}${encodeURIComponent(jobId)}`);
}

async function loadRetryState(env, jobId) {
  const stub = stateStub(env, jobId);
  if (stub) {
    try {
      const response = await stub.fetch('https://sonara.internal/state');
      if (response.ok) return await response.json();
    } catch {}
  }
  try {
    const response = await caches.default.match(cacheKey(jobId));
    return response ? await response.json() : null;
  } catch { return null; }
}

async function saveRetryState(env, jobId, state) {
  const next = { ...state, updatedAt: Date.now() };
  const stub = stateStub(env, jobId);
  if (stub) {
    try {
      const response = await stub.fetch('https://sonara.internal/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next)
      });
      if (response.ok) return;
    } catch {}
  }
  try {
    await caches.default.put(cacheKey(jobId), new Response(JSON.stringify(next), {
      headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=900' }
    }));
  } catch {}
}

async function clearRetryState(env, jobId) {
  const stub = stateStub(env, jobId);
  if (stub) {
    try {
      await stub.fetch('https://sonara.internal/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transientPolls: 0, clearedAt: Date.now() })
      });
    } catch {}
  }
  try { await caches.default.delete(cacheKey(jobId)); } catch {}
}

async function jsonData(response) {
  try { return await response.clone().json(); }
  catch { return null; }
}

async function stripLegacyDirectorProfileUi(response) {
  const type = clean(response.headers.get('content-type')).toLowerCase();
  if (!response.ok || !type.includes('text/html')) return response;

  const html = await response.text();
  if (!html.includes('sonara-director-v3-script') && !html.includes('sonara-director-v3-style')) return response;

  const next = html
    .replace(/<style id="sonara-director-v3-style">[\s\S]*?<\/style>/gi, '')
    .replace(/<script id="sonara-director-v3-script">[\s\S]*?<\/script>/gi, '');
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store');
  headers.set('x-sonara-generation-profile-ui', 'react-native-v1');
  return new Response(next, { status: response.status, statusText: response.statusText, headers });
}

function retryResponse(request, original, data, attempt) {
  const headers = new Headers(original.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json; charset=UTF-8');
  headers.set('cache-control', 'private, no-store');
  headers.set('x-sonara-studio-transient-poll-guard', VERSION);
  headers.set('retry-after', '4');
  const origin = clean(request.headers.get('origin'));
  if (origin) headers.set('access-control-allow-origin', origin);

  return new Response(JSON.stringify({
    ...data,
    status: 'PROCESSING',
    progress: Number.isFinite(Number(data?.progress)) ? Number(data.progress) : 23.3,
    error: undefined,
    transientPollRecovery: {
      active: true,
      version: VERSION,
      attempt,
      maxAttempts: MAX_TRANSIENT_POLLS,
      reason: clean(data?.error || data?.message || 'Transient MoLab query failure')
    }
  }), { status: 200, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS' && url.pathname === '/api/molab/capabilities') {
      const origin = clean(request.headers.get('origin'));
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': origin || 'https://sonaraenterprise.com',
          'access-control-allow-methods': 'GET,OPTIONS',
          'access-control-allow-headers': 'Content-Type,Cache-Control,Pragma',
          vary: 'Origin'
        }
      });
    }

    if (request.method === 'GET' && url.pathname === '/api/molab/capabilities') {
      return molabCapabilities(request, env);
    }

    const match = request.method === 'GET' ? url.pathname.match(STUDIO_JOB_RE) : null;
    if (!match) {
      const response = await runtime.fetch(request, env, ctx);
      return stripLegacyDirectorProfileUi(response);
    }

    const jobId = match[1];
    const response = await runtime.fetch(request, env, ctx);
    const data = await jsonData(response);
    if (!data) return response;

    if (!isTransientQueryFailure(data, response.status)) {
      if (clean(data?.status).toUpperCase() !== 'PROCESSING') await clearRetryState(env, jobId);
      return response;
    }

    const state = await loadRetryState(env, jobId) || { transientPolls: 0 };
    const attempt = Number(state.transientPolls || 0) + 1;
    if (attempt > MAX_TRANSIENT_POLLS) {
      await saveRetryState(env, jobId, { transientPolls: attempt, exhausted: true });
      return response;
    }

    await saveRetryState(env, jobId, {
      transientPolls: attempt,
      exhausted: false,
      lastStatus: response.status,
      lastError: clean(data?.error || data?.message)
    });
    return retryResponse(request, response, data, attempt);
  }
};
