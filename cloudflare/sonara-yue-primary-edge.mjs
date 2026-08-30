import billingRuntime, { SonaraJobState } from './sonara-billing-edge-router.mjs';
import yueRuntime from './sonara-yue-router.mjs';

export { SonaraJobState };

const VERSION = 'sonara-yue-direct-bypass-v3';
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
    dualFast: false,
    candidateCount: 1,
    candidate_count: 1
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('x-sonara-generation-profile', 'yue-direct-single');
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

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Billing remains on the billing bridge so credits/auth still work,
    // but the payload is pinned to the only configured production engine: YuE.
    if (request.method === 'POST' && url.pathname === BILLING_GENERATE_PATH) {
      const nextRequest = await forceYueRequest(request);
      return decorate(await billingRuntime.fetch(nextRequest, env, ctx));
    }

    // CRITICAL: bypass every legacy dual-T4 router on the real engine endpoint.
    if (request.method === 'POST' && url.pathname === ENGINE_GENERATE_PATH) {
      const nextRequest = await forceYueRequest(request);
      return decorate(await yueRuntime.fetch(nextRequest, env, ctx));
    }

    // Keep YuE job polling and audio on the same direct route.
    if (request.method === 'GET' && YUE_JOB_PATH.test(url.pathname)) {
      return decorate(await yueRuntime.fetch(request, env, ctx));
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === YUE_AUDIO_PATH) {
      return decorate(await yueRuntime.fetch(request, env, ctx));
    }

    return decorate(await billingRuntime.fetch(request, env, ctx));
  }
};
