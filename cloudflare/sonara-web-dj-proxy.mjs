import sonaraWebLive from './sonara-web-live-ui.mjs';

const DJ_ROUTE = '/dj-pro';
const DJ_RUNTIME_PREFIX = '/dj-pro-runtime';
const DJ_PREVIEW_ORIGIN = 'https://sonara-enterprise-eejyho4nr-sonaramusicai86-2765s-projects.vercel.app';
const DJ_PREVIEW_SHARE = 'DBC4lMe93fqaflFgK5xJblb17i9TBiQm';
const DJ_BRIDGE_URL = 'ws://127.0.0.1:49686';

function copyRequestHeaders(request) {
  const headers = new Headers();
  for (const name of ['accept', 'accept-language', 'range', 'if-none-match', 'if-modified-since']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function previewUrl(pathname, search = '') {
  const target = new URL(pathname + search, DJ_PREVIEW_ORIGIN);
  target.searchParams.set('_vercel_share', DJ_PREVIEW_SHARE);
  return target;
}

function firstCookie(setCookie) {
  if (!setCookie) return '';
  return setCookie.split(';', 1)[0] || '';
}

async function fetchPreview(request, pathname, search = '') {
  const headers = copyRequestHeaders(request);
  let response = await fetch(previewUrl(pathname, search), {
    method: request.method === 'HEAD' ? 'HEAD' : 'GET',
    headers,
    redirect: 'manual'
  });

  for (let attempt = 0; attempt < 2 && response.status >= 300 && response.status < 400; attempt += 1) {
    const location = response.headers.get('location');
    if (!location) break;
    const cookie = firstCookie(response.headers.get('set-cookie'));
    if (cookie) headers.set('cookie', cookie);
    const next = new URL(location, DJ_PREVIEW_ORIGIN);
    if (next.origin !== DJ_PREVIEW_ORIGIN) break;
    response = await fetch(next, {
      method: request.method === 'HEAD' ? 'HEAD' : 'GET',
      headers,
      redirect: 'manual'
    });
  }

  return response;
}

function proxiedHeaders(response, { html = false, transformed = false } = {}) {
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  if (transformed) headers.delete('content-encoding');
  headers.delete('set-cookie');
  headers.delete('content-security-policy');
  headers.delete('content-security-policy-report-only');
  headers.set('x-sonara-dj-proxy', 'cloudflare-preview-bridge-v2');
  if (html) headers.set('cache-control', 'no-store, max-age=0');
  return headers;
}

function rewriteRuntimePaths(text) {
  return text
    .replaceAll('"/assets/', `"${DJ_RUNTIME_PREFIX}/assets/`)
    .replaceAll("'/assets/", `'${DJ_RUNTIME_PREFIX}/assets/`)
    .replaceAll('url(/assets/', `url(${DJ_RUNTIME_PREFIX}/assets/`)
    .replaceAll('url("/assets/', `url("${DJ_RUNTIME_PREFIX}/assets/`)
    .replaceAll("url('/assets/", `url('${DJ_RUNTIME_PREFIX}/assets/`);
}

function bootstrapScript() {
  return `<script>(function(){try{localStorage.setItem('sonara.dj.bridge-url','${DJ_BRIDGE_URL}');}catch(e){};window.__SONARA_DJ_PROXIED__=true;})();</script>`;
}

async function serveDjApp(request) {
  const upstream = await fetchPreview(request, '/', '');
  if (!upstream.ok) return upstream;
  const type = upstream.headers.get('content-type') || '';
  if (!type.includes('text/html')) return upstream;
  let html = await upstream.text();
  html = rewriteRuntimePaths(html);
  const bootstrap = bootstrapScript();
  html = html.includes('<head>') ? html.replace('<head>', `<head>${bootstrap}`) : `${bootstrap}${html}`;
  return new Response(html, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: proxiedHeaders(upstream, { html: true, transformed: true })
  });
}

async function serveDjRuntime(request, url) {
  const relative = url.pathname.slice(DJ_RUNTIME_PREFIX.length) || '/';
  const upstream = await fetchPreview(request, relative, url.search);
  const type = upstream.headers.get('content-type') || '';
  const shouldTransform = type.includes('javascript') || type.includes('text/css') || type.includes('application/json');
  if (!shouldTransform || request.method === 'HEAD') {
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: proxiedHeaders(upstream)
    });
  }
  const text = rewriteRuntimePaths(await upstream.text());
  return new Response(text, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: proxiedHeaders(upstream, { transformed: true })
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === DJ_ROUTE || url.pathname === `${DJ_ROUTE}/`) {
      return serveDjApp(request);
    }
    if (url.pathname.startsWith(`${DJ_RUNTIME_PREFIX}/`)) {
      return serveDjRuntime(request, url);
    }
    return sonaraWebLive.fetch(request, env, ctx);
  }
};
