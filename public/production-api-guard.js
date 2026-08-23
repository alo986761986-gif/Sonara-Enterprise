(() => {
  const host = window.location.hostname.toLowerCase();
  const isProductionSite =
    host === 'sonaraenterprise.com' || host === 'www.sonaraenterprise.com';

  if (!isProductionSite || typeof window.fetch !== 'function') return;

  const API_ORIGIN = 'https://api.sonaraenterprise.com';
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    let requestInput = input;

    try {
      const rawUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input && typeof input.url === 'string'
              ? input.url
              : '';

      if (rawUrl) {
        const url = new URL(rawUrl, window.location.origin);
        const isSameOriginApi =
          url.origin === window.location.origin && url.pathname.startsWith('/api/');

        if (isSameOriginApi) {
          const target = `${API_ORIGIN}${url.pathname}${url.search}${url.hash}`;

          if (typeof input === 'string' || input instanceof URL) {
            requestInput = target;
          } else if (input instanceof Request) {
            requestInput = new Request(target, input);
          }
        }
      }
    } catch (rewriteError) {
      console.error('[SONARA_API_ROUTE_REWRITE]', rewriteError);
    }

    const response = await nativeFetch(requestInput, init);

    try {
      const responseUrl = new URL(response.url || '', window.location.origin);
      const isSonaraApi =
        responseUrl.hostname === 'api.sonaraenterprise.com' ||
        responseUrl.pathname.startsWith('/api/');

      if (!isSonaraApi) return response;

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) return response;

      const text = await response.clone().text();
      const preview = text.trim().replace(/\s+/g, ' ').slice(0, 240);
      const status = response.ok ? 502 : response.status || 502;

      const headers = new Headers(response.headers);
      headers.set('content-type', 'application/json; charset=UTF-8');
      headers.set('cache-control', 'no-store');

      return new Response(
        JSON.stringify({
          error: `Sonara production API returned a non-JSON response (HTTP ${status}).`,
          message: preview || 'The production API returned an empty response.',
          status
        }),
        {
          status,
          statusText: response.statusText,
          headers
        }
      );
    } catch (guardError) {
      console.error('[SONARA_PRODUCTION_API_GUARD]', guardError);
      return response;
    }
  };
})();
