import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-music-director-v3-ultra-guard.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-studio-transient-poll-guard-1';
const MAX_TRANSIENT_POLLS = 4;
const STATE_PREFIX = 'https://sonaraenterprise.com/__sonara_internal/studio-transient-poll-guard/';
const STUDIO_JOB_RE = /^\/api\/studio\/job\/(studio-[A-Za-z0-9_-]+)$/;

const clean = value => String(value ?? '').trim();

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
    const match = request.method === 'GET' ? url.pathname.match(STUDIO_JOB_RE) : null;
    if (!match) return runtime.fetch(request, env, ctx);

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
