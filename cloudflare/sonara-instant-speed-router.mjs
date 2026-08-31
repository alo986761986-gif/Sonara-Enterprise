import studioMaxRuntime from './sonara-studio-max-router.mjs';
export { SonaraJobState } from './sonara-studio-max-router.mjs';

const SPEED_VERSION = 'sonara-yue-turbo-single-v2';

function withSpeedHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-speed-profile', SPEED_VERSION);
  headers.set('cache-control', 'private, no-store');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

export default {
  async fetch(request, env, ctx) {
    // Legacy SONARA Instant Dual (d16pair/A+B) is intentionally disabled.
    // All generation requests now flow through the current production chain,
    // where YuE FAST/TURBO is the default single-candidate low-latency profile
    // and YuE QUALITY remains explicit/optional.
    const response = await studioMaxRuntime.fetch(request, env, ctx);
    return withSpeedHeaders(response);
  }
};
