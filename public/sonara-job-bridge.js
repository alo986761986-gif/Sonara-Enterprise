(() => {
  const nativeFetch = window.fetch.bind(window);
  const POLL_CACHE_MS = 1500;
  const jobPollCache = new Map();
  let generationAuthorization = '';

  function mergedHeaders(input, init) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init && init.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    return headers;
  }

  function responseFromSnapshot(snapshot) {
    return new Response(snapshot.body, {
      status: snapshot.status,
      statusText: snapshot.statusText,
      headers: snapshot.headers
    });
  }

  async function snapshotResponse(response) {
    return {
      body: await response.text(),
      status: response.status,
      statusText: response.statusText,
      headers: Array.from(response.headers.entries()),
      cachedAt: Date.now()
    };
  }

  function pollJob(jobId, bridgeUrl, nextInit) {
    const existing = jobPollCache.get(jobId);
    const now = Date.now();
    if (existing?.snapshot && now - existing.snapshot.cachedAt < POLL_CACHE_MS) {
      return Promise.resolve(responseFromSnapshot(existing.snapshot));
    }
    if (existing?.inflight) return existing.inflight.then(responseFromSnapshot);

    const inflight = nativeFetch(bridgeUrl.toString(), nextInit)
      .then(snapshotResponse)
      .then(snapshot => {
        jobPollCache.set(jobId, { snapshot });
        return snapshot;
      })
      .catch(error => {
        jobPollCache.delete(jobId);
        throw error;
      });

    jobPollCache.set(jobId, { snapshot: existing?.snapshot, inflight });
    return inflight.then(responseFromSnapshot);
  }

  window.fetch = function sonaraRegionalFetch(input, init = {}) {
    const requestUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(requestUrl, window.location.origin);
    const headers = mergedHeaders(input, init);

    if (url.origin === window.location.origin && url.pathname === '/api/billing/generate') {
      const authorization = headers.get('Authorization');
      if (authorization) generationAuthorization = authorization;
      jobPollCache.clear();
    }

    const jobMatch = url.origin === window.location.origin
      ? url.pathname.match(/^\/api\/music\/job\/([^/]+)$/)
      : null;
    if (!jobMatch) return nativeFetch(input, init);

    const jobId = decodeURIComponent(jobMatch[1]);

    // These jobs live directly on the Cloudflare generation edge. Keeping them
    // on /api/music/job avoids the legacy /api/billing/job bridge returning an
    // HTML page for a job family it does not know about.
    if (
      jobId.startsWith('d18fast_') ||
      jobId.startsWith('d16pair_') ||
      jobId.startsWith('yue_')
    ) {
      return nativeFetch(input, { ...init, cache: 'no-store' });
    }

    const bridgeUrl = new URL('/api/billing/job', window.location.origin);
    bridgeUrl.searchParams.set('jobId', jobId);

    const authorization = headers.get('Authorization') || generationAuthorization;
    if (authorization) headers.set('Authorization', authorization);
    headers.set('Accept', 'application/json');

    const nextInit = { ...init, method: 'GET', headers, cache: 'no-store' };
    delete nextInit.body;
    return pollJob(jobId, bridgeUrl, nextInit);
  };
})();
