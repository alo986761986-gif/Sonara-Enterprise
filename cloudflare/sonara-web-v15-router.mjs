import webRuntime from './sonara-web-generator-stability.mjs';
import engineV18 from './sonara-engine-v18-fast-hq.mjs';
import { isVideoApiRequest, recoverVideoApi } from './sonara-video-api-recovery.mjs';
import { injectVideoUiScript, videoUiScriptResponse } from './sonara-video-ui-edge.mjs';

const API_HOST = 'api.sonaraenterprise.com';
const VIDEO_UI_SCRIPT_PATH = '/sonara-video-ui-edge.js';
const V18_JOB_PATH = /^\/api\/music\/job\/d18fast_[^/]+$/;
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
    'Access-Control-Expose-Headers': 'Content-Length,Content-Range,Accept-Ranges,X-Sonara-Music-Quality,X-Sonara-ACE-Worker,X-Sonara-Speed-Profile',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin'
  };
}

function disableCrossOriginV18Poll(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html')) return response;

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-v18-browser-poll', 'same-origin-edge-v2');

  const safe = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });

  return new HTMLRewriter().on('head', {
    element(element) {
      // sonara-web-generator-stability still contains an old browser hotfix that
      // rewrites V18 polling to api.sonaraenterprise.com. Disable it before it
      // executes so all polling stays same-origin on sonaraenterprise.com.
      element.prepend('<script>window.__sonaraV18DirectPollV1=true;</script>', { html: true });
    }
  }).transform(safe);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname === API_HOST && request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: apiCorsHeaders(request)
      });
    }

    if (url.hostname !== API_HOST && url.pathname === VIDEO_UI_SCRIPT_PATH) {
      return videoUiScriptResponse();
    }

    if (url.hostname !== API_HOST && isVideoApiRequest(request)) {
      return recoverVideoApi(request, { env, ctx });
    }

    // V18 polling is served directly at the Cloudflare edge for BOTH the public
    // web origin and API origin. The browser no longer needs a cross-origin hop.
    if (request.method === 'GET' && V18_JOB_PATH.test(url.pathname)) {
      return engineV18.fetch(request, env, ctx);
    }

    if (url.hostname === API_HOST) {
      return engineV18.fetch(request, env, ctx);
    }

    const response = await webRuntime.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
      return injectVideoUiScript(disableCrossOriginV18Poll(response));
    }
    return response;
  }
};
