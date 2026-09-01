(() => {
  if (window.__sonaraStudioPitchKeyLocalSourceV1) return;
  window.__sonaraStudioPitchKeyLocalSourceV1 = true;

  const DB_NAME = 'sonara-studio-real-assets-v1';
  const STORE_NAME = 'assets';
  const SOURCE_NAME_KEY = 'sonara.studio.pitchKeyLocalSourceName';
  const AUDIO_RE = /\.(wav|wave|mp3|flac|ogg|m4a|aac|webm)$/i;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const q = selector => document.querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

  let activeLocalFile = null;

  function isAudioFile(file) {
    return !!file && (
      String(file.type || '').toLowerCase().startsWith('audio/') ||
      AUDIO_RE.test(String(file.name || ''))
    );
  }

  function setStatus(text) {
    const el = q('#spk3-status');
    if (el) el.textContent = text;
  }

  function rememberLocalFile(file) {
    if (!isAudioFile(file)) return false;
    activeLocalFile = file;
    try { localStorage.setItem(SOURCE_NAME_KEY, String(file.name || 'audio-locale.wav')); } catch {}
    setStatus(`Sorgente locale bloccata: ${file.name || 'audio locale'}. Pitch & Key usera esclusivamente questo file.`);
    window.dispatchEvent(new CustomEvent('sonara:pitch-key-local-source-locked', {
      detail: {
        name: String(file.name || ''),
        size: Number(file.size || 0),
        type: String(file.type || ''),
        source: 'device-file'
      }
    }));
    return true;
  }

  // Capture the exact File selected from PC, phone, tablet or any device exposed by
  // the browser file picker. This File is authoritative for Pitch & Key.
  document.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.files?.length) return;
    const audioFile = Array.from(input.files).find(isAudioFile);
    if (audioFile) rememberLocalFile(audioFile);
  }, true);

  function openAssetsDb() {
    if (!('indexedDB' in window)) return Promise.resolve(null);
    return new Promise(resolve => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      };
    });
  }

  async function latestPersistedAudio() {
    const db = await openAssetsDb();
    if (!db) return null;
    return new Promise(resolve => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => {
          const assets = Array.isArray(request.result) ? request.result : [];
          const preferredName = (() => { try { return localStorage.getItem(SOURCE_NAME_KEY) || ''; } catch { return ''; } })();
          const candidates = assets
            .filter(asset => asset?.blob instanceof Blob && (
              String(asset.blob.type || '').toLowerCase().startsWith('audio/') ||
              AUDIO_RE.test(String(asset.name || ''))
            ))
            .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
          const asset = candidates.find(item => preferredName && String(item.name || '') === preferredName) || candidates[0];
          db.close();
          if (!asset) { resolve(null); return; }
          resolve({
            blob: asset.blob,
            name: String(asset.name || 'sonara-local-source.wav'),
            type: String(asset.blob.type || 'audio/wav'),
            persisted: true
          });
        };
        request.onerror = () => { db.close(); resolve(null); };
      } catch {
        try { db.close(); } catch {}
        resolve(null);
      }
    });
  }

  async function resolveLocalSource() {
    if (activeLocalFile && isAudioFile(activeLocalFile)) {
      return {
        blob: activeLocalFile,
        name: String(activeLocalFile.name || 'sonara-local-source.wav'),
        type: String(activeLocalFile.type || 'audio/wav'),
        persisted: false
      };
    }
    return latestPersistedAudio();
  }

  async function api(path, init) {
    const response = await fetch(window.location.origin + path, init || {});
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) throw new Error(data.error || data.message || (`HTTP ${response.status}`));
    return data;
  }

  function resultUrl(data) {
    const seen = new Set();
    const walk = value => {
      if (!value) return '';
      if (typeof value === 'string') {
        return /^https?:\/\//i.test(value) && /(?:audio|molab|\.wav|\.mp3|\.flac|\.ogg)/i.test(value) ? value : '';
      }
      if (typeof value !== 'object' || seen.has(value)) return '';
      seen.add(value);
      if (Array.isArray(value)) {
        for (const item of value) {
          const hit = walk(item);
          if (hit) return hit;
        }
        return '';
      }
      for (const key of ['recommendedAudioUrl','audioUrl','downloadUrl','url','audio','output','outputs','result','results','items','job']) {
        if (key in value) {
          const hit = walk(value[key]);
          if (hit) return hit;
        }
      }
      for (const item of Object.values(value)) {
        const hit = walk(item);
        if (hit) return hit;
      }
      return '';
    };
    return walk(data);
  }

  async function applyLocalPitchKey() {
    const source = await resolveLocalSource();
    if (!source?.blob) {
      setStatus('Importa prima un file audio dal PC o dal dispositivo. Pitch & Key non usera file generati dal motore o URL remoti.');
      return;
    }

    const targetKey = String(q('#spk3-key')?.value || '');
    const trackPitch = Number(q('#spk3-track')?.value || 0);
    const vocalPitch = Number(q('#spk3-vocal')?.value || 0);
    const formantPitch = Number(q('#spk3-formant')?.value || 0);
    if (!targetKey && !trackPitch && !vocalPitch && !formantPitch) {
      setStatus('Imposta almeno una modifica di Key, pitch o formanti.');
      return;
    }

    const button = q('#spk3-apply');
    if (button) button.disabled = true;
    q('#spk3-result')?.classList.remove('show');

    try {
      const form = new FormData();
      form.append('src_audio', source.blob, source.name);
      form.append('sourceOrigin', 'local-device-file');
      form.append('sourceFilename', source.name);
      form.append('bpm', String(clamp(localStorage.getItem('sonara.preferredBpm') || 124, 40, 220)));
      form.append('targetKey', targetKey);
      form.append('trackPitchSemitones', String(trackPitch));
      form.append('vocalPitchSemitones', String(vocalPitch));
      form.append('vocalFormantSemitones', String(formantPitch));
      form.append('preserveTempo', q('#spk3-tempo')?.checked === false ? 'false' : 'true');
      form.append('preserveStrength', '0.94');

      setStatus(`Elaborazione del file locale "${source.name}". Nessun audio generato viene usato come sorgente...`);
      const submitted = await api('/api/studio/pitch-key', {
        method: 'POST',
        credentials: 'include',
        body: form
      });

      const jobId = submitted.jobId || submitted.id || submitted.job?.id;
      const pollPath = submitted.pollUrl
        ? String(submitted.pollUrl).replace(/^https:\/\/api\.sonaraenterprise\.com/, '')
        : (jobId ? '/api/studio/job/' + encodeURIComponent(jobId) : '');
      if (!pollPath) throw new Error('Job Studio non restituito.');

      for (let attempt = 1; attempt <= 180; attempt += 1) {
        await sleep(attempt === 1 ? 900 : 2200);
        const data = await api(pollPath + (pollPath.includes('?') ? '&' : '?') + 'pitchKeyLocal=' + Date.now() + '-' + attempt, {
          credentials: 'include',
          cache: 'no-store'
        });
        const root = data.job || data.result || data;
        const state = String(root.status || data.status || 'PROCESSING').toUpperCase();
        const progress = Number(root.progress ?? data.progress ?? 0);
        setStatus(`File locale: ${source.name} · ${Number.isFinite(progress) ? Math.round(progress) + '%' : ''} · ${state}`);

        if (['FAILED','ERROR','CANCELLED'].includes(state)) {
          throw new Error(root.error || data.error || 'Pitch & Key non riuscito.');
        }
        if (['COMPLETED','SUCCESS','SUCCEEDED','DONE'].includes(state)) {
          const url = resultUrl(root) || resultUrl(data);
          if (!url) throw new Error('Job completato senza URL audio risultato.');
          const audio = q('#spk3-audio');
          const result = q('#spk3-result');
          if (audio) audio.src = url;
          if (result) {
            result.dataset.url = url;
            result.classList.add('show');
          }
          setStatus(`Completato sul file locale "${source.name}". L'originale resta invariato finche non applichi il risultato.`);
          return;
        }
      }
      throw new Error('Tempo massimo raggiunto; file originale invariato.');
    } catch (error) {
      setStatus(error?.message || String(error));
    } finally {
      if (button) button.disabled = false;
    }
  }

  // Capture phase wins over the legacy remote-source handler. This deliberately
  // prevents Pitch & Key from falling back to generated/remote audio.
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target.closest('#spk3-apply') : null;
    if (!target) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void applyLocalPitchKey();
  }, true);

  const observer = new MutationObserver(() => {
    const statusEl = q('#spk3-status');
    if (!statusEl || statusEl.dataset.localSourceLock === '1') return;
    statusEl.dataset.localSourceLock = '1';
    const storedName = (() => { try { return localStorage.getItem(SOURCE_NAME_KEY) || ''; } catch { return ''; } })();
    statusEl.textContent = storedName
      ? `Sorgente locale pronta: ${storedName}. Pitch & Key usera solo il file importato dal dispositivo.`
      : 'Importa un WAV/MP3/FLAC dal dispositivo: Pitch & Key lavorera esclusivamente su quel file.';
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
