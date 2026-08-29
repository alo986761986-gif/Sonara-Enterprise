import { useEffect } from 'react';

export default function LyricsApiCompatibilityBridge() {
  useEffect(() => {
    if ((window as any).__sonaraLyricsApiCompatibilityV1) return;
    (window as any).__sonaraLyricsApiCompatibilityV1 = true;

    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      try {
        const request = input instanceof Request ? input : new Request(input, init);
        const url = new URL(request.url, window.location.origin);
        if (request.method.toUpperCase() === 'POST' && url.pathname === '/api/lyrics-context') {
          const target = new URL('/api/lyrics', window.location.origin);
          return nativeFetch(new Request(target.toString(), request));
        }
      } catch (error) {
        console.warn('[SONARA][Lyrics API Compatibility]', error instanceof Error ? error.message : String(error));
      }
      return nativeFetch(input as any, init);
    };

    return () => {
      window.fetch = nativeFetch;
      delete (window as any).__sonaraLyricsApiCompatibilityV1;
    };
  }, []);

  return null;
}
