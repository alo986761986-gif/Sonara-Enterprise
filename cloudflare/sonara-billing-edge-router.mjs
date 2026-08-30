import runtime from './sonara-musical-family-router.mjs';
export { SonaraJobState } from './sonara-musical-family-router.mjs';

const VERSION = 'sonara-billing-edge-v1';
const VERCEL_ORIGIN = 'https://sonara-enterprise.vercel.app';
const BILLING_PATH = /^\/api\/billing(?:\/|$)/;

function json(data, status = 502, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=UTF-8',
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'x-sonara-billing-edge': VERSION,
      ...extraHeaders
    }
  });
}

async function proxyBilling(request) {
  const source = new URL(request.url);
  const target = new URL(`${source.pathname}${source.search}`, VERCEL_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.set('accept', 'application/json');
  headers.set('x-sonara-edge-proxy', VERSION);
  headers.set('x-sonara-original-host', source.host);

  const init = {
    method: request.method,
    headers,
    redirect: 'manual'
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  let upstream;
  try {
    upstream = await fetch(target.toString(), init);
  } catch (error) {
    return json({
      error: {
        code: 'BILLING_UPSTREAM_UNREACHABLE',
        message: error instanceof Error ? error.message : String(error)
      }
    }, 502);
  }

  const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    const raw = await upstream.text().catch(() => '');
    return json({
      error: {
        code: 'BILLING_UPSTREAM_NON_JSON',
        message: `SONARA billing ha ricevuto una risposta non JSON (HTTP ${upstream.status}).`
      },
      upstreamStatus: upstream.status,
      upstreamContentType: contentType || null,
      upstreamPreview: raw.slice(0, 160)
    }, upstream.ok ? 502 : upstream.status || 502);
  }

  const outHeaders = new Headers(upstream.headers);
  outHeaders.delete('content-length');
  outHeaders.set('cache-control', 'private, no-store');
  outHeaders.set('x-content-type-options', 'nosniff');
  outHeaders.set('x-sonara-billing-edge', VERSION);
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (BILLING_PATH.test(url.pathname)) {
      return proxyBilling(request);
    }
    return runtime.fetch(request, env, ctx);
  }
};
