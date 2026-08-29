import webRuntime from './sonara-web-v15-router.mjs';
export { SonaraJobState } from './sonara-web-v15-router.mjs';

const BRAND_ICON = '/sonara-brand-icon.svg?v=20260829-3';
const BRAND_BOOT = '/sonara-brand-boot.svg?v=20260829-3';

function brandHtml(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return response;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-brand', 'sonic-s-v3');
  const safe = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter()
    .on('link[rel="icon"]', { element(el) { el.remove(); } })
    .on('link[rel="shortcut icon"]', { element(el) { el.remove(); } })
    .on('link[rel="apple-touch-icon"]', { element(el) { el.remove(); } })
    .on('head', {
      element(el) {
        el.append(
          `<link rel="icon" type="image/svg+xml" href="${BRAND_ICON}">` +
          `<link rel="shortcut icon" href="${BRAND_ICON}">` +
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
    if (url.hostname !== 'api.sonaraenterprise.com' && (url.pathname === '/favicon.ico' || url.pathname === '/apple-touch-icon.png')) {
      return Response.redirect(new URL(BRAND_ICON, url.origin).toString(), 302);
    }
    const response = await webRuntime.fetch(request, env, ctx);
    return request.method === 'GET' ? brandHtml(response) : response;
  }
};
