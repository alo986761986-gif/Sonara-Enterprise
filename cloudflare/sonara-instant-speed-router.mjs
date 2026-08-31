import studioMaxRuntime from './sonara-studio-max-router.mjs';
export { SonaraJobState } from './sonara-studio-max-router.mjs';

const SPEED_VERSION = 'sonara-yue-dual-fidelity-v3';

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
    // Legacy d16pair/ACE-Step dual routing stays disabled.
    // The active production path is YuE V10.4 Dual Fidelity: one YuE job,
    // two safe candidates, creator-first prompt and exact output duration.
    const response = await studioMaxRuntime.fetch(request, env, ctx);
    return withSpeedHeaders(response);
  }
};
