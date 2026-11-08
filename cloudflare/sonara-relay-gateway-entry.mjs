import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-real-music-v3-edge.mjs';
import { withGatewayVerifier } from './sonara-gateway-verifier.mjs';
import { REMIX_PRO_DURATION_EDGE_SCRIPT } from './sonara-remix-pro-duration-edge.mjs';

export { SonaraJobState, SonaraAuthStore };

// The actual Wrangler entry point must inject the duration lock, not just
// an older, unused frontend-edge wrapper. Never rewrite API calls or bodies.
const gateway = withGatewayVerifier(runtime);
export default {
  async fetch(request, env, ctx) {
    const response = await gateway.fetch(request, env, ctx);
    const host = new URL(request.url).hostname;
    if (request.method !== 'GET' ||
        (host !== 'sonaraenterprise.com' && host !== 'www.sonaraenterprise.com') ||
        !response.ok ||
        !String(response.headers.get('content-type') || '').toLowerCase().includes('text/html') ||
        typeof HTMLRewriter === 'undefined') return response;

    const headers = new Headers(response.headers);
    headers.delete('content-length');
    headers.delete('content-encoding');
    headers.set('cache-control', 'no-store');
    headers.set('x-sonara-remix-pro-duration-lock', 'v2');
    const html = new Response(response.body, {
      status: response.status, statusText: response.statusText, headers
    });
    return new HTMLRewriter().on('head', {
      element(element) {
        element.append(REMIX_PRO_DURATION_EDGE_SCRIPT, { html: true });
      }
    }).transform(html);
  }
};
