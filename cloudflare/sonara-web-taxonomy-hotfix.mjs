import sonaraEngine from './sonara-engine-v9-dual-fast.mjs';

const VERCEL_WEB_ORIGIN = 'https://sonara-enterprise-sonaramusicai86-2765s-projects.vercel.app';
const WEB_HOSTS = new Set(['sonaraenterprise.com', 'www.sonaraenterprise.com']);
const ENGINE_PATHS = [
  '/api/music/job/',
  '/api/modal/audio',
  '/api/engine/'
];

function isEngineRequest(url) {
  return ENGINE_PATHS.some(prefix => url.pathname.startsWith(prefix));
}

async function proxyWeb(request) {
  const incoming = new URL(request.url);
  const upstream = new URL(incoming.pathname + incoming.search, VERCEL_WEB_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.set('x-sonara-edge-proxy', 'native-taxonomy-v2');

  const init = {
    method: request.method,
    headers,
    redirect: 'manual'
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;

  const response = await fetch(upstream.toString(), init);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('x-sonara-edge-proxy', 'native-taxonomy-v2');
  responseHeaders.delete('x-sonara-taxonomy-hotfix');

  // The taxonomy is now native in the application bundle. Do not inject scripts,
  // MutationObservers or rewrite JavaScript/HTML: those global DOM observers can
  // overload highly dynamic views such as Social Discovery.
  if (request.method === 'GET' && (response.headers.get('content-type') || '').includes('text/html')) {
    responseHeaders.set('cache-control', 'no-store, max-age=0');
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (WEB_HOSTS.has(url.hostname) && !isEngineRequest(url)) {
      return proxyWeb(request);
    }
    return sonaraEngine.fetch(request, env, ctx);
  }
};
