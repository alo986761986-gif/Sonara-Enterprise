(() => {
  if (window.__sonaraStudioPitchKeyNetworkFixV2) return;
  window.__sonaraStudioPitchKeyNetworkFixV2 = true;

  const nativeFetch = window.fetch.bind(window);
  const API_ORIGIN = 'https://api.sonaraenterprise.com';
  const SITE_HOSTS = new Set(['sonaraenterprise.com', 'www.sonaraenterprise.com']);
  const DB_NAME = 'sonara-studio-real-assets-v1';
  const STORE_NAME = 'assets';

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

  function isAudioAsset(asset) {
    if (!asset || !(asset.blob instanceof Blob) || !asset.blob.size) return false;
    if (/^audio\//i.test(asset.blob.type || '')) return true;
    return /\.(wav|mp3|flac|ogg|m4a|aac|webm)$/i.test(String(asset.name || ''));
  }

  async function latestLocalAudio() {
    if (!('indexedDB' in window)) return null;
    return new Promise(resolve => {
      let request;
      try { request = indexedDB.open(DB_NAME, 1); } catch { resolve(null); return; }
      request.onerror = () => resolve(null);
      request.onupgradeneeded = () => {
        try {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        } catch {}
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) { db.close(); resolve(null); return; }
        const tx = db.transaction(STORE_NAME, 'readonly');
        const getAll = tx.objectStore(STORE_NAME).getAll();
        getAll.onerror = () => { db.close(); resolve(null); };
        getAll.onsuccess = () => {
          const assets = Array.isArray(getAll.result) ? getAll.result.filter(isAudioAsset) : [];
          assets.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
          const asset = assets[0] || null;
          db.close();
          resolve(asset);
        };
      };
    });
  }

  function buildMultipart(json, asset) {
    const form = new FormData();
    for (const [key, value] of Object.entries(json || {})) {
      if (key === 'sourceAudioUrl' || key === 'srcAudioUrl' || key === 'audioUrl' || key === 'source_audio_url') continue;
      if (value === undefined || value === null) continue;
      form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    }
    const name = String(asset?.name || 'sonara-studio-source.wav');
    form.append('src_audio', asset.blob, name);
    form.append('sourceName', name);
    form.append('sourceAssetId', String(asset?.id || ''));
    form.append('sourceTransport', 'indexeddb-direct-upload');
    return form;
  }

  window.fetch = async function sonaraPitchKeyFetch(input, init) {
    try {
      const raw = input instanceof Request ? input.url : String(input);
      const url = new URL(raw, window.location.href);
      const rewritten = rewriteUrl(raw);
      const target = rewritten || raw;

      if (url.pathname === '/api/studio/pitch-key' && String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase() === 'POST') {
        const contentType = String(init?.headers?.['content-type'] || init?.headers?.['Content-Type'] || '').toLowerCase();
        if (contentType.includes('application/json') && typeof init?.body === 'string') {
          let json = null;
          try { json = JSON.parse(init.body); } catch {}
          if (json) {
            const asset = await latestLocalAudio();
            if (asset) {
              const nextInit = { ...init, body: buildMultipart(json, asset) };
              const headers = new Headers(init.headers || {});
              headers.delete('content-type');
              headers.delete('Content-Type');
              nextInit.headers = headers;
              nextInit.credentials = 'include';
              return nativeFetch(target, nextInit);
            }
          }
        }
      }

      if (!rewritten) return nativeFetch(input, init);
      if (input instanceof Request) return nativeFetch(new Request(rewritten, input), init);
      return nativeFetch(rewritten, init);
    } catch (_) {
      return nativeFetch(input, init);
    }
  };
})();
