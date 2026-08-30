import runtime, { SonaraJobState } from './sonara-billing-edge-router.mjs';

export { SonaraJobState };

const VERSION = 'sonara-hybrid-fast-primary-v1';
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);

function wantsExplicitYue(body = {}) {
  return body.forceYue === true || body.provider === 'yue' || body.engineProvider === 'yue' || body.qualityMode === 'yue-hq';
}

async function routeGeneration(request) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || !GENERATE_PATHS.has(url.pathname)) return request;
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return request;

  let body;
  try {
    body = await request.clone().json();
  } catch {
    return request;
  }

  const explicitYue = wantsExplicitYue(body);

  const nextBody = explicitYue
    ? {
        ...body,
        forceYue: true,
        provider: 'yue',
        engineProvider: 'yue',
        dualFast: false,
        candidateCount: 1,
        candidate_count: 1
      }
    : {
        ...body,
        forceYue: false,
        forceAceStep: true,
        provider: 'molab',
        engineProvider: 'molab',
        dualFast: false,
        candidateCount: 1,
        candidate_count: 1
      };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
  headers.set('x-sonara-generation-profile', explicitYue ? 'yue-hq' : 'fast-primary');
  headers.set('x-sonara-yue-primary', VERSION);

  return new Request(request.url, {
    method: request.method,
    headers,
    body: JSON.stringify(nextBody),
    redirect: request.redirect
  });
}

export default {
  async fetch(request, env, ctx) {
    const nextRequest = await routeGeneration(request);
    const response = await runtime.fetch(nextRequest, env, ctx);
    const headers = new Headers(response.headers);
    headers.set('x-sonara-yue-primary', VERSION);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
