(() => {
  const nativeFetch = window.fetch.bind(window);
  let generationAuthorization = '';

  function mergedHeaders(input, init) {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    if (init && init.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    return headers;
  }

  window.fetch = function sonaraRegionalFetch(input, init = {}) {
    const requestUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(requestUrl, window.location.origin);
    const headers = mergedHeaders(input, init);

    if (url.origin === window.location.origin && url.pathname === '/api/billing/generate') {
      const authorization = headers.get('Authorization');
      if (authorization) generationAuthorization = authorization;
    }

    const jobMatch = url.origin === window.location.origin
      ? url.pathname.match(/^\/api\/music\/job\/([^/]+)$/)
      : null;

    if (!jobMatch) return nativeFetch(input, init);

    const bridgeUrl = new URL('/api/billing/job', window.location.origin);
    bridgeUrl.searchParams.set('jobId', decodeURIComponent(jobMatch[1]));

    const authorization = headers.get('Authorization') || generationAuthorization;
    if (authorization) headers.set('Authorization', authorization);
    headers.set('Accept', 'application/json');

    const nextInit = {
      ...init,
      method: 'GET',
      headers,
      cache: 'no-store'
    };
    delete nextInit.body;

    return nativeFetch(bridgeUrl.toString(), nextInit);
  };
})();
