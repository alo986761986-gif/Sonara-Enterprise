import engineV6 from './sonara-engine-v6.mjs';

export default {
  async fetch(request, env, ctx) {
    const response = await engineV6.fetch(request, env, ctx);
    const path = new URL(request.url).pathname;

    // The Sonara frontend reads job state from JSON only when HTTP is successful.
    // Normalize job-state failures to HTTP 200 so status: FAILED is always visible
    // immediately instead of being skipped by the polling loop.
    if (/^\/api\/music\/job\//.test(path) && response.status >= 400) {
      const body = await response.arrayBuffer();
      const headers = new Headers(response.headers);
      headers.set('cache-control', 'no-store');
      return new Response(body, { status: 200, headers });
    }

    return response;
  }
};
