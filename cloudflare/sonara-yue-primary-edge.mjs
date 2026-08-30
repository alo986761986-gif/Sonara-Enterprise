import runtime, { SonaraJobState } from './sonara-billing-edge-router.mjs';

export { SonaraJobState };

const VERSION = 'sonara-yue-primary-edge-v2-fast-single';
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);

async function forceYue(request) {
  const url = new URL(request.url);
  if (request.method !== 'POST' || !GENERATE_PATHS.has(url.pathname)) return request;
  if (!String(request.headers.get('content-type') || '').toLowerCase().includes('application/json')) return request;

  let body;
  try {
    body = await request.clone().json();
  } catch {
    return request;
  }

  // FAST production profile: YuE currently generates candidates sequentially
  // under one GPU lock. Forcing two candidates doubles the wall-clock time and
  // makes long full-song jobs appear stalled. Generate one candidate per job;
  // a second variation can be requested as a separate generation.
  const nextBody = {
    ...body,
    forceYue: true,
    provider: 'yue',
    engineProvider: 'yue',
    dualFast: false,
    candidateCount: 1,
    candidate_count: 1
  };

  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', 'application/json');
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
    const nextRequest = await forceYue(request);
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
