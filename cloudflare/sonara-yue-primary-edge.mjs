import billingRuntime, { SonaraJobState } from './sonara-billing-edge-router.mjs';
import yueRuntime from './sonara-yue-router.mjs';

export { SonaraJobState };

const VERSION = 'sonara-yue-direct-dual-v5-visible-failures';
const BILLING_GENERATE_PATH = '/api/billing/generate';
const ENGINE_GENERATE_PATH = '/api/engine/generate';
const YUE_JOB_PATH = /^\/api\/music\/job\/yue_[^/]+$/;
const YUE_AUDIO_PATH = '/api/yue/audio';

async function forceYueRequest(request) {
  const contentType = String(request.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) return request;

  let body;
  try {
    body = await request.clone().json();
  } catch {
    return request;
  }

  const nextBody = {
    ...body,
    forceYue: true,
    forceAceStep: false,
    provider: 'yue',
    engineProvider: 'yue',
    dualFast: true,
    candidateCount: 2,
    candidate_count: 2,
    stage2_batch_size: 16
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('x-sonara-generation-profile', 'yue-direct-dual-v5');
  headers.set('x-sonara-yue-primary', VERSION);

  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(nextBody),
    redirect: request.redirect
  });
}

function decorate(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-yue-primary', VERSION);
  headers.set('cache-control', 'private, no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function visibleJobResponse(request, env, ctx) {
  const response = await yueRuntime.fetch(request, env, ctx);
  if (response.ok) return decorate(response);

  let payload = {};
  try {
    payload = await response.clone().json();
  } catch {
    payload = { error: `YuE polling HTTP ${response.status}` };
  }

  const errorValue = payload?.error;
  const message = typeof errorValue === 'string'
    ? errorValue
    : String(errorValue?.message || payload?.message || `YuE polling HTTP ${response.status}`);

  return decorate(new Response(JSON.stringify({
    ...payload,
    status: 'FAILED',
    progress: Number(payload?.progress || 0),
    retryable: true,
    error: message,
    metadata: {
      ...(payload?.metadata || {}),
      provider: 'yue',
      currentStage: `Errore YuE: ${message}`,
      originalHttpStatus: response.status
    }
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store'
    }
  }));
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === BILLING_GENERATE_PATH) {
      const nextRequest = await forceYueRequest(request);
      return decorate(await billingRuntime.fetch(nextRequest, env, ctx));
    }

    if (request.method === 'POST' && url.pathname === ENGINE_GENERATE_PATH) {
      const nextRequest = await forceYueRequest(request);
      return decorate(await yueRuntime.fetch(nextRequest, env, ctx));
    }

    if (request.method === 'GET' && YUE_JOB_PATH.test(url.pathname)) {
      return visibleJobResponse(request, env, ctx);
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === YUE_AUDIO_PATH) {
      return decorate(await yueRuntime.fetch(request, env, ctx));
    }

    return decorate(await billingRuntime.fetch(request, env, ctx));
  }
};
