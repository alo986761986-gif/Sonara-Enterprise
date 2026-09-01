(() => {
  // Disable the previous V4 before it can install its reactive DOM loop.
  window.__sonaraStudioPitchKeyLocalOnlyV4 = true;
  if (window.__sonaraStudioPitchKeySafeV5) return;
  window.__sonaraStudioPitchKeySafeV5 = true;

  const ROOT_ID = 'sonara-studio-pitch-key-pro-v3';
  const AUDIO_RE = /\.(wav|wave|mp3|flac|ogg|m4a|aac|webm)$/i;
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const q = (selector, root = document) => root.querySelector(selector);
  let localFile = null;
  let mountedHost = null;
  let lastResultUrl = '';
  let lastResultName = '';

  const isAudio = file => !!file && (String(file.type || '').startsWith('audio/') || AUDIO_RE.test(String(file.name || '')));
  const bytes = value => Number(value || 0) >= 1048576 ? (Number(value) / 1048576).toFixed(1) + ' MB' : (Number(value || 0) / 1024).toFixed(1) + ' KB';

  function setStatus(text) {
    const el = q('#spk3-status');
    if (el && el.textContent !== text) el.textContent = text;
  }

  function safePart(value, fallback = 'audio') {
    const clean = String(value || '')
      .replace(/\.[^.]+$/, '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 70);
    return clean || fallback;
  }

  function outputFileName(targetKey, trackPitch, vocalPitch, formantPitch) {
    const source = safePart(localFile?.name, 'sonara-audio');
    const parts = [];
    if (targetKey) parts.push(safePart(targetKey, 'key'));
    if (trackPitch) parts.push(`track${trackPitch > 0 ? '+' : ''}${trackPitch}`);
    if (vocalPitch) parts.push(`voice${vocalPitch > 0 ? '+' : ''}${vocalPitch}`);
    if (formantPitch) parts.push(`formant${formantPitch > 0 ? '+' : ''}${formantPitch}`);
    return `${source}-SONARA-Pitch-Key-${parts.join('-') || 'processed'}.wav`;
  }

  function hideResult() {
    lastResultUrl = '';
    lastResultName = '';
    const result = q('#spk3-result');
    const audio = q('#spk3-audio');
    const name = q('#spk3-result-name');
    const save = q('#spk3-save');
    const open = q('#spk3-open');
    if (audio) {
      audio.pause?.();
      audio.removeAttribute('src');
      audio.load?.();
    }
    if (name) name.textContent = '';
    if (save) save.disabled = true;
    if (open) open.disabled = true;
    if (result) {
      result.dataset.url = '';
      result.dataset.filename = '';
      result.style.display = 'none';
    }
  }

  function showResult(url, filename) {
    lastResultUrl = String(url || '');
    lastResultName = String(filename || 'sonara-pitch-key-processed.wav');
    const audio = q('#spk3-audio');
    const result = q('#spk3-result');
    const name = q('#spk3-result-name');
    const save = q('#spk3-save');
    const open = q('#spk3-open');
    if (audio) {
      audio.src = lastResultUrl;
      audio.load?.();
    }
    if (name) name.textContent = lastResultName;
    if (save) save.disabled = false;
    if (open) open.disabled = false;
    if (result) {
      result.dataset.url = lastResultUrl;
      result.dataset.filename = lastResultName;
      result.style.display = 'block';
      result.classList.add('show');
      result.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function updateSource() {
    const el = q('#spk3-local-source');
    if (!el) return;
    const text = localFile ? `${localFile.name} · ${bytes(localFile.size)} · FILE LOCALE` : 'Nessun file locale selezionato';
    if (el.textContent !== text) el.textContent = text;
    const ready = localFile ? 'true' : 'false';
    if (el.dataset.ready !== ready) el.dataset.ready = ready;
  }

  function lock(file) {
    if (!isAudio(file)) return;
    localFile = file;
    hideResult();
    updateSource();
    setStatus(`Sorgente locale: ${file.name}. Pitch & Key usera esclusivamente questo file.`);
  }

  document.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.files?.length) return;
    const file = Array.from(input.files).find(isAudio);
    if (file) lock(file);
  }, true);

  document.addEventListener('drop', event => {
    const file = Array.from(event.dataTransfer?.files || []).find(isAudio);
    if (file) lock(file);
  }, true);

  async function api(path, init) {
    const response = await fetch(window.location.origin + path, init || {});
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) throw new Error(data.error || data.message || `HTTP ${response.status}`);
    return data;
  }

  function findAudioUrl(value, seen = new Set()) {
    if (!value) return '';
    if (typeof value === 'string') return /^https?:\/\//i.test(value) ? value : '';
    if (typeof value !== 'object' || seen.has(value)) return '';
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) { const hit = findAudioUrl(item, seen); if (hit) return hit; }
      return '';
    }
    for (const key of ['recommendedAudioUrl','audioUrl','downloadUrl','url','audio','output','outputs','result','results','items','job']) {
      if (key in value) { const hit = findAudioUrl(value[key], seen); if (hit) return hit; }
    }
    for (const item of Object.values(value)) { const hit = findAudioUrl(item, seen); if (hit) return hit; }
    return '';
  }

  function triggerBrowserDownload(href, filename) {
    const link = document.createElement('a');
    link.href = href;
    link.download = filename || 'sonara-pitch-key-processed.wav';
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function saveProcessedFile() {
    const result = q('#spk3-result');
    const url = lastResultUrl || result?.dataset.url || '';
    const filename = lastResultName || result?.dataset.filename || 'sonara-pitch-key-processed.wav';
    if (!url) {
      setStatus('Nessun WAV elaborato disponibile da salvare.');
      return;
    }

    const button = q('#spk3-save');
    if (button) button.disabled = true;
    try {
      setStatus(`Preparazione download WAV: ${filename}...`);
      const response = await fetch(url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        cache: 'no-store',
        headers: { Accept: 'audio/wav,audio/*;q=0.9,*/*;q=0.1' }
      });
      if (!response.ok) throw new Error(`Download audio HTTP ${response.status}`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('Il WAV elaborato risulta vuoto.');
      const objectUrl = URL.createObjectURL(blob);
      triggerBrowserDownload(objectUrl, filename);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
      setStatus(`WAV elaborato pronto e salvato: ${filename}`);
    } catch (error) {
      triggerBrowserDownload(url, filename);
      setStatus(`Download diretto avviato per ${filename}. ${error?.message || ''}`.trim());
    } finally {
      if (button) button.disabled = false;
    }
  }

  function openProcessedFile() {
    const result = q('#spk3-result');
    const url = lastResultUrl || result?.dataset.url || '';
    if (!url) {
      setStatus('Nessun WAV elaborato disponibile da aprire.');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async function apply() {
    if (!localFile) {
      setStatus('Importa prima un WAV/MP3/FLAC dal dispositivo. Nessun file generato verra usato.');
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

    const processedName = outputFileName(targetKey, trackPitch, vocalPitch, formantPitch);
    const form = new FormData();
    form.append('src_audio', localFile, localFile.name || 'source.wav');
    form.append('sourceOrigin', 'user-local-device');
    form.append('sourceFilename', localFile.name || 'source.wav');
    form.append('bpm', String(Math.max(40, Math.min(220, Number(localStorage.getItem('sonara.preferredBpm') || 124)))));
    form.append('targetKey', targetKey);
    form.append('trackPitchSemitones', String(trackPitch));
    form.append('vocalPitchSemitones', String(vocalPitch));
    form.append('vocalFormantSemitones', String(formantPitch));
    form.append('preserveTempo', q('#spk3-tempo')?.checked === false ? 'false' : 'true');
    form.append('preserveStrength', '0.94');

    const button = q('#spk3-apply');
    if (button) button.disabled = true;
    hideResult();
    try {
      setStatus(`Elaborazione file locale: ${localFile.name}...`);
      const submitted = await api('/api/studio/pitch-key', { method: 'POST', credentials: 'include', body: form });
      const jobId = submitted.jobId || submitted.id || submitted.job?.id;
      const pollPath = submitted.pollUrl ? String(submitted.pollUrl).replace(/^https:\/\/api\.sonaraenterprise\.com/, '') : (jobId ? '/api/studio/job/' + encodeURIComponent(jobId) : '');
      if (!pollPath) throw new Error('Job Studio non restituito.');
      for (let attempt = 1; attempt <= 180; attempt += 1) {
        await sleep(attempt === 1 ? 900 : 2200);
        const data = await api(pollPath + (pollPath.includes('?') ? '&' : '?') + 'v6=' + Date.now(), { credentials: 'include', cache: 'no-store' });
        const root = data.job || data.result || data;
        const state = String(root.status || data.status || 'PROCESSING').toUpperCase();
        const progress = Number(root.progress ?? data.progress ?? 0);
        setStatus(`${localFile.name} · ${Number.isFinite(progress) ? Math.round(progress) + '%' : ''} · ${state}`);
        if (['FAILED','ERROR','CANCELLED'].includes(state)) throw new Error(root.error || data.error || 'Pitch & Key non riuscito.');
        if (['COMPLETED','SUCCESS','SUCCEEDED','DONE'].includes(state)) {
          const url = findAudioUrl(root) || findAudioUrl(data);
          if (!url) throw new Error('Job completato senza audio risultato.');
          showResult(url, processedName);
          setStatus(`Completato: ${processedName}. Ora puoi ascoltarlo e salvarlo con SCARICA WAV ELABORATO.`);
          return;
        }
      }
      throw new Error('Tempo massimo raggiunto.');
    } catch (error) {
      hideResult();
      setStatus(error?.message || String(error));
    } finally {
      if (button) button.disabled = false;
    }
  }

  function mount() {
    const studio = q('[data-sonara-studio-section="true"]');
    if (!studio) return;
    const host = q('.sonara-pro-studio', studio) || studio;
    if (mountedHost === host && q('#' + ROOT_ID)) {
      updateSource();
      if (lastResultUrl) showResult(lastResultUrl, lastResultName);
      return;
    }

    q('#' + ROOT_ID)?.remove();
    const root = document.createElement('section');
    root.id = ROOT_ID;
    root.style.cssText = 'position:relative;z-index:20;width:100%;border-bottom:1px solid rgba(139,92,246,.22);background:linear-gradient(90deg,rgba(10,14,24,.98),rgba(14,10,28,.98),rgba(7,14,30,.98));color:#e5e7eb;font-family:system-ui';
    root.innerHTML = `
      <div style="display:flex;align-items:center;gap:9px;padding:9px 14px;border-bottom:1px solid rgba(255,255,255,.05)">
        <strong style="font-size:10px;letter-spacing:.12em;color:#ddd6fe">PITCH & KEY PRO</strong>
        <span style="font-size:8px;color:#64748b">FILE LOCALE · WAV/MP3/FLAC</span>
      </div>
      <div style="padding:10px 14px">
        <div id="spk3-local-source" data-ready="false" style="margin-bottom:9px;padding:8px 10px;border:1px solid rgba(139,92,246,.2);border-radius:9px;font-size:9px;color:#c4b5fd">Nessun file locale selezionato</div>
        <div style="display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px">
          <select id="spk3-key" style="background:#080d15;color:white;border:1px solid #273244;border-radius:8px;padding:8px"><option value="">Mantieni tonalita</option>${['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'].flatMap(k => [`<option value="${k} major">${k} Major</option>`,`<option value="${k} minor">${k} Minor</option>`]).join('')}</select>
          <label style="font-size:9px">Pitch brano <input id="spk3-track" type="range" min="-12" max="12" step="0.5" value="0" style="width:100%"></label>
          <label style="font-size:9px">Pitch voce <input id="spk3-vocal" type="range" min="-12" max="12" step="0.5" value="0" style="width:100%"></label>
          <label style="font-size:9px">Formanti <input id="spk3-formant" type="range" min="-6" max="6" step="0.5" value="0" style="width:100%"></label>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:10px">
          <label style="font-size:9px;color:#94a3b8"><input id="spk3-tempo" type="checkbox" checked> Preserva BPM e durata</label>
          <button id="spk3-apply" style="border:0;border-radius:9px;padding:9px 12px;background:linear-gradient(90deg,#7c3aed,#4f46e5,#2563eb);color:white;font-weight:800">ELABORA PITCH & KEY</button>
        </div>
        <div id="spk3-status" style="margin-top:8px;font-size:9px;color:#c4b5fd">Importa un file audio dal dispositivo.</div>
        <div id="spk3-result" style="display:none;margin-top:12px;padding:12px;border:1px solid rgba(139,92,246,.32);border-radius:12px;background:rgba(15,11,31,.78)" data-url="" data-filename="">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap">
            <div>
              <div style="font-size:9px;font-weight:800;letter-spacing:.1em;color:#a78bfa">WAV ELABORATO PRONTO</div>
              <div id="spk3-result-name" style="margin-top:3px;font-size:10px;color:#e9d5ff;word-break:break-all"></div>
            </div>
            <div style="display:flex;gap:7px;flex-wrap:wrap">
              <button id="spk3-open" disabled style="border:1px solid rgba(139,92,246,.4);border-radius:9px;padding:8px 10px;background:#111827;color:#ddd6fe;font-size:9px;font-weight:800">APRI WAV</button>
              <button id="spk3-save" disabled style="border:0;border-radius:9px;padding:8px 11px;background:linear-gradient(90deg,#7c3aed,#4f46e5,#2563eb);color:white;font-size:9px;font-weight:900">SCARICA WAV ELABORATO</button>
            </div>
          </div>
          <audio id="spk3-audio" controls preload="metadata" style="width:100%"></audio>
        </div>
      </div>`;
    host.prepend(root);
    q('#spk3-apply', root)?.addEventListener('click', () => void apply());
    q('#spk3-save', root)?.addEventListener('click', () => void saveProcessedFile());
    q('#spk3-open', root)?.addEventListener('click', openProcessedFile);
    mountedHost = host;
    updateSource();
    if (lastResultUrl) showResult(lastResultUrl, lastResultName);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  window.addEventListener('load', mount, { once: true });
  window.setInterval(mount, 2000);
})();
