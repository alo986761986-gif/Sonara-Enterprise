import engineV6 from './sonara-engine-v6.mjs';

const VERCEL_JOB_BRIDGE_URL = 'https://sonara-enterprise.vercel.app/api/billing/job';
const JOB_PATH = /^\/api\/music\/job\/([^/]+)$/;

async function normalizeJobResponse(response, route) {
  const raw = await response.text();
  let body = raw;

  if (response.status >= 400) {
    let payload = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = {};
    }

    if (!payload.status) {
      const message = typeof payload.error === 'string'
        ? payload.error
        : (payload.error?.message || `SONARA job polling failed with HTTP ${response.status}.`);
      payload = {
        ...payload,
        status: 'FAILED',
        progress: 0,
        error: message
      };
    }
    body = JSON.stringify(payload);
  }

  const headers = new Headers(response.headers);
  headers.set('content-type', 'application/json; charset=UTF-8');
  headers.set('cache-control', 'private, no-store');
  headers.set('x-sonara-job-route', route);
  headers.delete('content-length');

  return new Response(body, {
    status: response.status >= 400 ? 200 : response.status,
    headers
  });
}

async function pollThroughVercel(request, env, jobId) {
  const bridgeUrl = new URL(VERCEL_JOB_BRIDGE_URL);
  bridgeUrl.searchParams.set('jobId', jobId);

  const headers = new Headers({ Accept: 'application/json' });
  const internalSecret = String(env.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  if (internalSecret) headers.set('X-Sonara-Internal-Secret', internalSecret);

  try {
    const response = await fetch(bridgeUrl, {
      method: 'GET',
      headers,
      redirect: 'follow',
      signal: AbortSignal.timeout(30_000)
    });
    return normalizeJobResponse(response, 'regional-vercel-bridge');
  } catch (error) {
    console.error('[SONARA JOB ROUTE]', error instanceof Error ? error.message : String(error));
    const fallback = await engineV6.fetch(request, env, {});
    return normalizeJobResponse(fallback, 'direct-worker-fallback');
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    const jobMatch = path.match(JOB_PATH);
    const bridgeRequest = request.headers.get('X-Sonara-Job-Bridge') === 'vercel';

    // Browser polling can reach a different Cloudflare point of presence from the
    // Vercel function that created the job. Route browser polls back through Vercel
    // so Cloudflare reads the job cache from the same regional path.
    if (jobMatch && request.method === 'GET' && !bridgeRequest) {
      return pollThroughVercel(request, env, decodeURIComponent(jobMatch[1]));
    }

    const response = await engineV6.fetch(request, env, ctx);

    // Vercel bridge requests are already in the correct regional path. Normalize
    // job failures to HTTP 200 so the frontend can read status: FAILED immediately.
    if (jobMatch) {
      return normalizeJobResponse(response, bridgeRequest ? 'regional-worker-cache' : 'direct-worker');
    }

    return response;
  }
};
