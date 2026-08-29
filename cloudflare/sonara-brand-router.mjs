import webRuntime from './sonara-web-v15-router.mjs';
export { SonaraJobState } from './sonara-web-v15-router.mjs';

const BRAND_ICON = '/sonara-brand-icon.svg?v=20260829-4';
const BRAND_BOOT = '/sonara-brand-boot.svg?v=20260829-4';

function withBrandHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-brand', 'sonic-s-v4');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function brandHtml(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return withBrandHeaders(response);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-brand', 'sonic-s-v4');
  const safe = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter()
    .on('link[rel="icon"]', { element(el) { el.remove(); } })
    .on('link[rel="shortcut icon"]', { element(el) { el.remove(); } })
    .on('link[rel="apple-touch-icon"]', { element(el) { el.remove(); } })
    .on('meta[property="og:image"]', { element(el) { el.remove(); } })
    .on('head', {
      element(el) {
        el.append(
          `<link rel="icon" type="image/svg+xml" sizes="any" href="${BRAND_ICON}">` +
          `<link rel="shortcut icon" type="image/svg+xml" href="${BRAND_ICON}">` +
          `<link rel="apple-touch-icon" href="${BRAND_ICON}">` +
          `<meta property="og:image" content="https://sonaraenterprise.com${BRAND_BOOT}">`,
          { html: true }
        );
      }
    })
    .transform(safe);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const publicHost = url.hostname !== 'api.sonaraenterprise.com';

    if (publicHost && (url.pathname === '/favicon.ico' || url.pathname === '/apple-touch-icon.png')) {
      const iconUrl = new URL(BRAND_ICON, url.origin).toString();
      return Response.redirect(iconUrl, 302);
    }

    const response = await webRuntime.fetch(request, env, ctx);
    if (!publicHost) return response;

    if (request.method === 'GET') return brandHtml(response);
    if (request.method === 'HEAD') return withBrandHeaders(response);
    return response;
  }
};
