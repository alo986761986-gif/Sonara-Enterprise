const VERCEL_WEB_ORIGIN = 'https://sonara-enterprise-sonaramusicai86-2765s-projects.vercel.app';
const VIDEO_PREFIX = '/api/video/';
const RETRYABLE_STATUSES = new Set([502, 503, 504, 524]);
const RETRY_DELAY_MS = 900;
const MAX_ATTEMPTS = 2;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_EDGE_MODEL = 'veo-3.1-fast-generate-preview';
const EDGE_COOKIE = 'sonara_video_edge';
const EDGE_JOB_PREFIX = 'edge_';
const EDGE_MEDIA_TTL_MS = 60 * 60 * 1000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isJsonResponse(response) {
  return String(response.headers.get('content-type') || '').toLowerCase().includes('application/json');
}

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-content-type-options': 'nosniff',
      'x-sonara-video-recovery': 'cloudflare-video-json-v2',
      ...extraHeaders
    }
  });
}

function jsonFailure(upstreamStatus, message, attempts) {
  return jsonResponse(503, {
    error: {
      code: 'VIDEO_UPSTREAM_RETRYABLE',
      message
    },
    retryable: true,
    upstreamStatus,
    attempts
  });
}

function copyResponse(response) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-video-recovery', 'cloudflare-video-json-v2');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function upstreamTarget(request, pathnameOverride = '') {
  const incoming = new URL(request.url);
  return new URL((pathnameOverride || incoming.pathname) + incoming.search, VERCEL_WEB_ORIGIN);
}

function upstreamHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.set('x-sonara-video-edge', 'recovery-v2');
  return headers;
}

function makeUpstreamRequest(request, bodyBytes, pathnameOverride = '') {
  return new Request(upstreamTarget(request, pathnameOverride).toString(), {
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

function safeJsonBytes(bytes) {
  if (!bytes) return {};
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return {};
  }
}

function base64UrlEncodeBytes(bytes) {
  let binary = '';
  for (const value of bytes) binary += String.fromCharCode(value);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecodeBytes(value) {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

async function hmacKey(env) {
  const secret = String(env?.GEMINI_API_KEY || '').trim();
  if (!secret) return null;
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`sonara-video-edge-v1:${secret}`),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signedToken(payload, env) {
  const key = await hmacKey(env);
  if (!key) throw new Error('Gemini edge key non configurata.');
  const encoded = base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(payload)));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(encoded)));
  return `${encoded}.${base64UrlEncodeBytes(signature)}`;
}

async function verifiedToken(value, env) {
  try {
    const [encoded, signature] = String(value || '').split('.');
    if (!encoded || !signature) return null;
    const key = await hmacKey(env);
    if (!key) return null;
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      base64UrlDecodeBytes(signature),
      new TextEncoder().encode(encoded)
    );
    if (!valid) return null;
    return JSON.parse(new TextDecoder().decode(base64UrlDecodeBytes(encoded)));
  } catch {
    return null;
  }
}

function cookieValue(request, name) {
  const raw = String(request.headers.get('cookie') || '');
  for (const part of raw.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim();
  }
  return '';
}

function edgeCookie(value, maxAge = 3600) {
  return `${EDGE_COOKIE}=${value}; Path=/api/video; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

function eligibleForEmergencyEdge(body) {
  const duration = Math.max(8, Number(body?.durationSeconds || 8));
  const refs = Array.isArray(body?.mediaReferences) ? body.mediaReferences : [];
  return duration <= 8 && refs.length === 0 && String(body?.prompt || '').trim().length >= 8;
}

async function providerJson(response, label) {
  const text = (await response.text()).trim();
  if (!text) throw new Error(`${label} risposta vuota (HTTP ${response.status}).`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} risposta non JSON (HTTP ${response.status}).`);
  }
}

async function startGeminiEdge(body, env, fetcher = fetch) {
  const key = String(env?.GEMINI_API_KEY || '').trim();
  if (!key) throw new Error('GEMINI_API_KEY non configurata sul Worker.');
  const aspectRatio = body?.aspectRatio === '9:16' ? '9:16' : '16:9';
  const resolution = ['720p', '1080p', '4K'].includes(body?.resolution) ? body.resolution : '720p';
  const response = await fetcher(`${GEMINI_BASE_URL}/models/${GEMINI_EDGE_MODEL}:predictLongRunning`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      instances: [{ prompt: String(body.prompt || '').trim() }],
      parameters: {
        numberOfVideos: 1,
        aspectRatio,
        resolution,
        durationSeconds: '8'
      }
    })
  });
  const payload = await providerJson(response, 'Gemini Video API');
  if (!response.ok || !payload?.name) throw new Error(String(payload?.error?.message || `Gemini Video API HTTP ${response.status}`));
  return String(payload.name);
}

function videoUriFromOperation(operation) {
  const response = operation?.response || {};
  const nested = response?.generateVideoResponse || {};
  const candidates = [
    nested?.generatedSamples?.[0]?.video?.uri,
    response?.generatedVideos?.[0]?.video?.uri,
    response?.videos?.[0]?.uri,
    response?.generatedSamples?.[0]?.video?.uri
  ];
  return candidates.find(value => typeof value === 'string' && value.trim())?.trim() || '';
}

async function pollGeminiEdge(operationName, env, fetcher = fetch) {
  const key = String(env?.GEMINI_API_KEY || '').trim();
  const response = await fetcher(`${GEMINI_BASE_URL}/${operationName}`, {
    headers: { 'x-goog-api-key': key, 'cache-control': 'no-store' }
  });
  const payload = await providerJson(response, 'Gemini Video operation');
  if (!response.ok) throw new Error(String(payload?.error?.message || `Gemini Video operation HTTP ${response.status}`));
  if (!payload?.done) return { done: false };
  if (payload?.error) return { done: true, error: String(payload.error?.message || 'Generazione video interrotta da Gemini.') };
  const uri = videoUriFromOperation(payload);
  if (!uri) return { done: true, error: 'Gemini ha completato il job senza restituire il file video.' };
  return { done: true, uri };
}

async function edgeHealth(env, fetcher = fetch) {
  const key = String(env?.GEMINI_API_KEY || '').trim();
  if (!key) return jsonResponse(503, { configured: false, valid: false, provider: 'gemini-edge', model: GEMINI_EDGE_MODEL });
  try {
    const response = await fetcher(`${GEMINI_BASE_URL}/models/${GEMINI_EDGE_MODEL}`, {
      headers: { 'x-goog-api-key': key, 'cache-control': 'no-store' }
    });
    return jsonResponse(response.ok ? 200 : 503, {
      configured: true,
      valid: response.ok,
      provider: 'gemini-edge',
      model: GEMINI_EDGE_MODEL,
      upstreamStatus: response.status
    });
  } catch (cause) {
    return jsonResponse(503, {
      configured: true,
      valid: false,
      provider: 'gemini-edge',
      model: GEMINI_EDGE_MODEL,
      error: cause instanceof Error ? cause.message : String(cause)
    });
  }
}

async function edgeMedia(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  const token = await verifiedToken(url.searchParams.get('token'), env);
  if (!token || token?.v !== 1 || typeof token?.u !== 'string' || Number(token?.exp || 0) < Date.now()) {
    return jsonResponse(403, { error: { code: 'VIDEO_EDGE_MEDIA_FORBIDDEN', message: 'Link video non valido o scaduto.' } });
  }
  const headers = new Headers({ 'x-goog-api-key': String(env.GEMINI_API_KEY || '') });
  const range = request.headers.get('range');
  if (range) headers.set('range', range);
  const response = await fetcher(token.u, { headers, redirect: 'follow' });
  if (!response.ok && response.status !== 206) {
    return jsonResponse(502, { error: { code: 'VIDEO_EDGE_MEDIA_DOWNLOAD_FAILED', message: `Download video Gemini HTTP ${response.status}.` } });
  }
  const outgoing = new Headers();
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = response.headers.get(name);
    if (value) outgoing.set(name, value);
  }
  outgoing.set('cache-control', 'private, max-age=300');
  outgoing.set('x-sonara-video-provider', 'gemini-edge');
  return new Response(response.body, { status: response.status, headers: outgoing });
}

async function edgeJobPoll(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/video\/job\/(edge_[A-Za-z0-9_-]+)$/);
  if (!match) return null;
  const edgeJobId = match[1];
  const state = await verifiedToken(cookieValue(request, EDGE_COOKIE), env);
  if (!state || state?.v !== 1 || state?.e !== edgeJobId || typeof state?.o !== 'string') {
    return jsonResponse(409, {
      jobId: edgeJobId,
      status: 'FAILED',
      progress: 0,
      stage: 'Sessione Video AI scaduta',
      error: 'La sessione temporanea Gemini è scaduta. Avvia nuovamente il video.'
    });
  }
  try {
    const result = await pollGeminiEdge(state.o, env, fetcher);
    if (!result.done) {
      return jsonResponse(200, {
        jobId: edgeJobId,
        status: 'PROCESSING',
        progress: 52,
        stage: 'SONARA Video AI: Gemini sta generando il video',
        provider: 'gemini'
      });
    }
    if (result.error) {
      return jsonResponse(200, {
        jobId: edgeJobId,
        status: 'FAILED',
        progress: 0,
        stage: 'Errore Gemini',
        error: result.error,
        provider: 'gemini'
      }, { 'set-cookie': edgeCookie('', 0) });
    }
    const mediaToken = await signedToken({ v: 1, u: result.uri, exp: Date.now() + EDGE_MEDIA_TTL_MS }, env);
    const videoUrl = `${url.origin}/api/video/edge-media?token=${encodeURIComponent(mediaToken)}`;
    return jsonResponse(200, {
      jobId: edgeJobId,
      status: 'COMPLETED',
      progress: 100,
      stage: 'Video pronto',
      videoUrl,
      provider: 'gemini'
    }, { 'set-cookie': edgeCookie('', 0) });
  } catch (cause) {
    return jsonResponse(200, {
      jobId: edgeJobId,
      status: 'FAILED',
      progress: 0,
      stage: 'Errore Gemini',
      error: cause instanceof Error ? cause.message : String(cause),
      provider: 'gemini'
    }, { 'set-cookie': edgeCookie('', 0) });
  }
}

async function maybeStartEdgeJob(request, bodyBytes, response, env, fetcher) {
  if (request.method !== 'POST' || new URL(request.url).pathname !== '/api/video/generate') return null;
  if (!isJsonResponse(response) || response.status !== 202 || !String(env?.GEMINI_API_KEY || '').trim()) return null;
  const body = safeJsonBytes(bodyBytes);
  if (!eligibleForEmergencyEdge(body)) return null;
  let upstreamPayload;
  try {
    upstreamPayload = await response.clone().json();
  } catch {
    return null;
  }
  if (!upstreamPayload?.jobId) return null;
  try {
    const operationName = await startGeminiEdge(body, env, fetcher);
    const edgeJobId = `${EDGE_JOB_PREFIX}${String(upstreamPayload.jobId).replace(/[^A-Za-z0-9_-]/g, '')}`;
    const cookie = await signedToken({
      v: 1,
      e: edgeJobId,
      u: String(upstreamPayload.jobId),
      o: operationName,
      ts: Date.now()
    }, env);
    return jsonResponse(202, {
      ...upstreamPayload,
      jobId: edgeJobId,
      status: 'PROCESSING',
      progress: 8,
      stage: 'SONARA Video AI: Gemini avviato su Cloudflare',
      provider: 'gemini'
    }, {
      'set-cookie': edgeCookie(cookie),
      'x-sonara-video-provider': 'gemini-edge'
    });
  } catch (cause) {
    console.warn('[SONARA VIDEO EDGE] Gemini fallback startup failed', {
      error: cause instanceof Error ? cause.message : String(cause)
    });
    return null;
  }
}

export function isVideoApiRequest(request) {
  const url = new URL(request.url);
  return url.pathname.startsWith(VIDEO_PREFIX);
}

export async function recoverVideoApi(request, options = {}) {
  const fetcher = options.fetcher || fetch;
  const waiter = options.waiter || sleep;
  const env = options.env || {};
  const url = new URL(request.url);

  if (request.method === 'GET' && url.pathname === '/api/video/edge-health') {
    return edgeHealth(env, fetcher);
  }
  if (request.method === 'GET' && url.pathname === '/api/video/edge-media') {
    return edgeMedia(request, env, fetcher);
  }
  if (request.method === 'GET' && url.pathname.startsWith('/api/video/job/edge_')) {
    return edgeJobPoll(request, env, fetcher);
  }

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
        if (isJsonResponse(response)) {
          const edge = await maybeStartEdgeJob(request, bodyBytes, response, env, fetcher);
          if (edge) return edge;
          return copyResponse(response);
        }
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
  async fetch(request, env, ctx) {
    return recoverVideoApi(request, { env, ctx });
  }
};
