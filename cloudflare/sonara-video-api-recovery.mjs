const VERCEL_WEB_ORIGIN = 'https://sonara-enterprise-sonaramusicai86-2765s-projects.vercel.app';
const VIDEO_PREFIX = '/api/video/';
const RETRYABLE_STATUSES = new Set([502, 503, 504, 524]);
const RETRY_DELAY_MS = 900;
const MAX_ATTEMPTS = 2;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isJsonResponse(response) {
  return String(response.headers.get('content-type') || '').toLowerCase().includes('application/json');
}

function jsonFailure(upstreamStatus, message, attempts) {
  return new Response(JSON.stringify({
    error: {
      code: 'VIDEO_UPSTREAM_RETRYABLE',
      message
    },
    retryable: true,
    upstreamStatus,
    attempts
  }), {
    status: 503,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      'x-sonara-video-recovery': 'cloudflare-video-json-v1'
    }
  });
}

function copyResponse(response) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-video-recovery', 'cloudflare-video-json-v1');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
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
  headers.set('x-sonara-video-edge', 'recovery-v1');
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

export function isVideoApiRequest(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith(VIDEO_PREFIX);
}

export async function recoverVideoApi(request, options = {}) {
  const fetcher = options.fetcher || fetch;
  const waiter = options.waiter || sleep;
  const bodyBytes = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.clone().arrayBuffer();
  let lastResponse = null;
  let lastError = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await fetcher(makeUpstreamRequest(request, bodyBytes));
      lastResponse = response;
      const html = await responseLooksHtml(response);
      const retryable = RETRYABLE_STATUSES.has(response.status) || (response.status >= 500 && html);

      if (!retryable) {
        if (isJsonResponse(response)) return copyResponse(response);
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

  const status = lastResponse?.status || 502;
  const detail = lastError instanceof Error ? lastError.message : '';
  return jsonFailure(
    status,
    detail
      ? `Video AI temporaneamente non raggiungibile: ${detail}`
      : `Video AI temporaneamente non raggiungibile (HTTP ${status}).`,
    MAX_ATTEMPTS
  );
}

export default {
  async fetch(request) {
    return recoverVideoApi(request);
  }
};