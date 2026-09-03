import billingRuntime, { SonaraJobState } from './sonara-billing-edge-router.mjs';
import yueRuntime from './sonara-yue-router.mjs';

export { SonaraJobState };

const VERSION = 'sonara-eleven-music-v2-primary';
const BILLING_GENERATE_PATH = '/api/billing/generate';
const ENGINE_GENERATE_PATH = '/api/engine/generate';
const YUE_JOB_PATH = /^\/api\/music\/job\/yue_[^/]+$/;
const ELEVEN_JOB_PATH = /^\/api\/music\/job\/(eleven_[^/]+)$/;
const ELEVEN_COVER_PATH = '/api/eleven-music/cover';
const YUE_AUDIO_PATH = '/api/yue/audio';
const VERCEL_ORIGIN = 'https://sonara-enterprise.vercel.app';

function decorate(response, provider = 'eleven-music-v2') {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-music-primary', VERSION);
  headers.set('x-sonara-music-provider', provider);
  headers.set('cache-control', 'private, no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function proxyElevenJob(request, jobId) {
  const target = `${VERCEL_ORIGIN}/api/eleven-music/job/${encodeURIComponent(jobId)}`;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.set('accept', 'application/json');
  headers.set('cache-control', 'no-cache');
  headers.set('x-sonara-edge-proxy', VERSION);

  const response = await fetch(target, {
    method: 'GET',
    headers,
    redirect: 'manual'
  });
  return decorate(response);
}

async function proxyElevenCover(request) {
  const target = `${VERCEL_ORIGIN}${ELEVEN_COVER_PATH}`;
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.set('accept', 'application/json');
  headers.set('cache-control', 'no-cache');
  headers.set('x-sonara-edge-proxy', VERSION);

  const response = await fetch(target, {
    method: request.method,
    headers,
    body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
    redirect: 'manual'
  });
  return decorate(response, 'cover-art');
}

async function visibleYueJobResponse(request, env, ctx) {
  const response = await yueRuntime.fetch(request, env, ctx);
  if (response.ok) return decorate(response, 'yue-fallback');

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
      provider: 'yue-fallback',
      currentStage: `Errore YuE fallback: ${message}`,
      originalHttpStatus: response.status
    }
  }), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store'
    }
  }), 'yue-fallback');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Main public generation path: billing/auth/quotas -> Eleven Music v2 on Vercel.
    // Do not mutate the creator prompt and do not force YuE here.
    if (request.method === 'POST' && url.pathname === BILLING_GENERATE_PATH) {
      return decorate(await billingRuntime.fetch(request, env, ctx));
    }

    const elevenMatch = url.pathname.match(ELEVEN_JOB_PATH);
    if (request.method === 'GET' && elevenMatch) {
      return proxyElevenJob(request, decodeURIComponent(elevenMatch[1]));
    }

    if ((request.method === 'GET' || request.method === 'POST') && url.pathname === ELEVEN_COVER_PATH) {
      return proxyElevenCover(request);
    }

    // Direct engine requests remain a private fallback route for existing integrations.
    if (request.method === 'POST' && url.pathname === ENGINE_GENERATE_PATH) {
      return decorate(await yueRuntime.fetch(request, env, ctx), 'yue-fallback');
    }

    if (request.method === 'GET' && YUE_JOB_PATH.test(url.pathname)) {
      return visibleYueJobResponse(request, env, ctx);
    }

    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === YUE_AUDIO_PATH) {
      return decorate(await yueRuntime.fetch(request, env, ctx), 'yue-fallback');
    }

    return decorate(await billingRuntime.fetch(request, env, ctx));
  }
};
