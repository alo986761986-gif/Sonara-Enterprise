import webRuntime from './sonara-web-generator-stability.mjs';
import sonaraProxy from './sonara-web-dj-proxy.mjs';
import engineV19 from './sonara-engine-v19-resilient-dual.mjs';
export { SonaraJobState } from './sonara-engine-v19-resilient-dual.mjs';
import { isVideoApiRequest, recoverVideoApi } from './sonara-video-api-recovery.mjs';
import { injectVideoUiScript, videoUiScriptResponse } from './sonara-video-ui-edge.mjs';

const API_HOST = 'api.sonaraenterprise.com';
const VIDEO_UI_SCRIPT_PATH = '/sonara-video-ui-edge.js';
const BILLING_GENERATE_PATH = '/api/billing/generate';
const BILLING_JOB_PATH = '/api/billing/job';
const MUSIC_JOB_PATH = /^\/api\/music\/job\/(?:d18fast_|d16pair_)[^/]+$/;
const RESILIENT_JOB_ID = /^d16pair_[A-Za-z0-9-]{16,}$/;
const RETRYABLE_GENERATION_STATUSES = new Set([500, 502, 503, 504, 524]);
const BPM_MIN = 40;
const BPM_MAX = 220;
const BPM_DEFAULT = 124;
const BPM_TEXT_PATTERN = /\b(\d{2,3})\s*BPM\b/i;
const API_ALLOWED_ORIGINS = new Set([
  'https://sonaraenterprise.com',
  'https://www.sonaraenterprise.com',
  'https://api.sonaraenterprise.com'
]);
const API_ALLOWED_HEADERS = 'Authorization,Content-Type,Range,Cache-Control,Pragma,X-Sonara-Internal-Secret,X-Sonara-Job-Bridge';

function apiCorsHeaders(request) {
  const origin = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': API_ALLOWED_ORIGINS.has(origin) ? origin : 'https://sonaraenterprise.com',
    'Access-Control-Allow-Methods': 'GET,HEAD,POST,OPTIONS',
    'Access-Control-Allow-Headers': API_ALLOWED_HEADERS,
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Music-Quality,X-Sonara-ACE-Worker,X-Sonara-Speed-Profile,X-Sonara-BPM-Lock',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin'
  };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseBpm(value) {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, numeric)));
  const match = String(value ?? '').match(/\b(\d{2,3})\b/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.round(Math.max(BPM_MIN, Math.min(BPM_MAX, parsed))) : null;
}

function resolveRequestedBpm(payload) {
  const candidates = [
    payload?.bpm,
    payload?.tempo,
    payload?.targetBpm,
    payload?.target_bpm,
    payload?.preferredBpm,
    payload?.preferred_bpm,
    payload?.metadata?.bpm,
    payload?.metas?.bpm,
    payload?.user_metadata?.bpm
  ];
  for (const candidate of candidates) {
    const bpm = parseBpm(candidate);
    if (bpm !== null) return bpm;
  }
  const promptMatch = String(payload?.prompt || '').match(BPM_TEXT_PATTERN);
  const promptBpm = promptMatch ? parseBpm(promptMatch[1]) : null;
  return promptBpm ?? BPM_DEFAULT;
}

function applyExactBpmLock(payload) {
  const bpm = resolveRequestedBpm(payload);
  const original = String(payload?.prompt || '').trim();
  const cleaned = original
    .replace(/(?:\n\s*)?SONARA HARD TEMPO LOCK:[^\n]*/gi, '')
    .trim();
  const tempoLock = `SONARA HARD TEMPO LOCK: exactly ${bpm} BPM. Treat ${bpm} BPM as the real quarter-note pulse and bar-grid tempo for the entire track. Do not reinterpret it as half-time or double-time. Keep drums, bass, comping, rhythmic accents, fills and section transitions anchored to ${bpm} BPM while preserving the selected genre and subgenre.`;
  return {
    ...payload,
    bpm,
    bpmLock: true,
    requestedBpm: bpm,
    prompt: [cleaned, tempoLock].filter(Boolean).join('\n\n').slice(0, 12000)
  };
}

async function forceResilientDualGeneration(request) {
  try {
    const contentType = String(request.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) return request;
    const payload = await request.clone().json();
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return request;
    const bpmLockedPayload = applyExactBpmLock(payload);
    const headers = new Headers(request.headers);
    headers.set('content-type', 'application/json');
    headers.set('x-sonara-music-route', 'v19-resilient-dual');
    headers.set('x-sonara-bpm-lock', `exact-${bpmLockedPayload.bpm}`);
    return new Request(request.url, {
      method: request.method,
      headers,
      body: JSON.stringify({ ...bpmLockedPayload, dualFast: true, candidateCount: 2, sonaraMusicV17: true, sonaraMusicV18: false, sonaraFastHq: false, speedProfile: 'resilient-dual-fast-v19' }),
      redirect: request.redirect
    });
  } catch { return request; }
}

function decorateGenerationResponse(response) {
  const headers = new Headers(response.headers);
  headers.set('cache-control', 'no-store');
  headers.set('x-sonara-music-route', 'v19-resilient-dual');
  headers.set('x-sonara-generator-recovery', 'resilient-dual-v19');
  headers.set('x-sonara-bpm-lock', 'hard-user-bpm-v1');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function resilientDualGeneration(request, env, ctx) {
  const dualRequest = await forceResilientDualGeneration(request);
  let response = await sonaraProxy.fetch(dualRequest.clone(), env, ctx);
  if (RETRYABLE_GENERATION_STATUSES.has(response.status)) {
    await wait(900);
    response = await sonaraProxy.fetch(dualRequest.clone(), env, ctx);
  }
  return decorateGenerationResponse(response);
}

function resilientJobFromLegacyBillingBridge(request, url, env, ctx) {
  if (request.method !== 'GET' || url.pathname !== BILLING_JOB_PATH) return null;
  const jobId = String(url.searchParams.get('jobId') || '').trim();
  if (!RESILIENT_JOB_ID.test(jobId)) return null;
  const target = new URL(`/api/music/job/${encodeURIComponent(jobId)}`, url.origin);
  const headers = new Headers(request.headers);
  headers.set('x-sonara-job-bridge', 'cloudflare-durable-v19');
  return engineV19.fetch(new Request(target.toString(), { method: 'GET', headers, redirect: 'manual' }), env, ctx);
}

function disableCrossOriginV18Poll(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-v18-browser-poll', 'same-origin-edge-v2');
  const safe = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter().on('head', {
    element(element) { element.prepend('<script>window.__sonaraV18DirectPollV1=true;</script>', { html: true }); }
  }).transform(safe);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname === API_HOST && request.method === 'OPTIONS') return new Response(null, { status: 204, headers: apiCorsHeaders(request) });
    if (url.hostname !== API_HOST && url.pathname === VIDEO_UI_SCRIPT_PATH) return videoUiScriptResponse();
    if (url.hostname !== API_HOST && isVideoApiRequest(request)) return recoverVideoApi(request, { env, ctx });
    if (url.hostname !== API_HOST && request.method === 'POST' && url.pathname === BILLING_GENERATE_PATH) return resilientDualGeneration(request, env, ctx);
    if (url.hostname !== API_HOST) {
      const directJob = resilientJobFromLegacyBillingBridge(request, url, env, ctx);
      if (directJob) return directJob;
    }
    if (request.method === 'GET' && MUSIC_JOB_PATH.test(url.pathname)) return engineV19.fetch(request, env, ctx);
    if (url.hostname === API_HOST) return engineV19.fetch(request, env, ctx);
    const response = await webRuntime.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname !== '/api' && !url.pathname.startsWith('/api/')) return injectVideoUiScript(disableCrossOriginV18Poll(response));
    return response;
  }
};
