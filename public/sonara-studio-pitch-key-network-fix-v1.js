(() => {
  if (window.__sonaraStudioPitchKeyNetworkFixV1) return;
  window.__sonaraStudioPitchKeyNetworkFixV1 = true;

  const nativeFetch = window.fetch.bind(window);
  const API_ORIGIN = 'https://api.sonaraenterprise.com';
  const SITE_HOSTS = new Set(['sonaraenterprise.com', 'www.sonaraenterprise.com']);

  function rewriteUrl(raw) {
    if (!SITE_HOSTS.has(window.location.hostname)) return '';
    let url;
    try { url = new URL(raw, window.location.href); } catch { return ''; }
    if (url.origin !== API_ORIGIN) return '';
    const isPitchKey = url.pathname === '/api/studio/pitch-key' || url.pathname === '/api/studio/pitch-key/capabilities';
    const isStudioJob = url.pathname.startsWith('/api/studio/job/');
    if (!isPitchKey && !isStudioJob) return '';
    return window.location.origin + url.pathname + url.search + url.hash;
  }

  window.fetch = function sonaraPitchKeyFetch(input, init) {
    try {
      const raw = input instanceof Request ? input.url : String(input);
      const rewritten = rewriteUrl(raw);
      if (!rewritten) return nativeFetch(input, init);
      if (input instanceof Request) {
        return nativeFetch(new Request(rewritten, input), init);
      }
      return nativeFetch(rewritten, init);
    } catch (_) {
      return nativeFetch(input, init);
    }
  };
})();
