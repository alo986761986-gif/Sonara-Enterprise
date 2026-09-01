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

  const isAudio = file => !!file && (String(file.type || '').startsWith('audio/') || AUDIO_RE.test(String(file.name || '')));
  const bytes = value => Number(value || 0) >= 1048576 ? (Number(value) / 1048576).toFixed(1) + ' MB' : (Number(value || 0) / 1024).toFixed(1) + ' KB';

  function setStatus(text) {
    const el = q('#spk3-status');
    if (el && el.textContent !== text) el.textContent = text;
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
    q('#spk3-result')?.classList.remove('show');
    try {
      setStatus(`Elaborazione file locale: ${localFile.name}...`);
      const submitted = await api('/api/studio/pitch-key', { method: 'POST', credentials: 'include', body: form });
      const jobId = submitted.jobId || submitted.id || submitted.job?.id;
      const pollPath = submitted.pollUrl ? String(submitted.pollUrl).replace(/^https:\/\/api\.sonaraenterprise\.com/, '') : (jobId ? '/api/studio/job/' + encodeURIComponent(jobId) : '');
      if (!pollPath) throw new Error('Job Studio non restituito.');
      for (let attempt = 1; attempt <= 180; attempt += 1) {
        await sleep(attempt === 1 ? 900 : 2200);
        const data = await api(pollPath + (pollPath.includes('?') ? '&' : '?') + 'v5=' + Date.now(), { credentials: 'include', cache: 'no-store' });
        const root = data.job || data.result || data;
        const state = String(root.status || data.status || 'PROCESSING').toUpperCase();
        const progress = Number(root.progress ?? data.progress ?? 0);
        setStatus(`${localFile.name} · ${Number.isFinite(progress) ? Math.round(progress) + '%' : ''} · ${state}`);
        if (['FAILED','ERROR','CANCELLED'].includes(state)) throw new Error(root.error || data.error || 'Pitch & Key non riuscito.');
        if (['COMPLETED','SUCCESS','SUCCEEDED','DONE'].includes(state)) {
          const url = findAudioUrl(root) || findAudioUrl(data);
          if (!url) throw new Error('Job completato senza audio risultato.');
          const audio = q('#spk3-audio');
          const result = q('#spk3-result');
          if (audio) audio.src = url;
          if (result) { result.dataset.url = url; result.classList.add('show'); }
          setStatus(`Completato sul file locale ${localFile.name}.`);
          return;
        }
      }
      throw new Error('Tempo massimo raggiunto.');
    } catch (error) {
      setStatus(error?.message || String(error));
    } finally {
      if (button) button.disabled = false;
    }
  }

  function mount() {
    const studio = q('[data-sonara-studio-section="true"]');
    if (!studio) return;
    const host = q('.sonara-pro-studio', studio) || studio;
    if (mountedHost === host && q('#' + ROOT_ID)) { updateSource(); return; }

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
        <div id="spk3-result" style="display:none;margin-top:8px" class=""><audio id="spk3-audio" controls style="width:100%"></audio></div>
      </div>`;
    host.prepend(root);
    q('#spk3-apply', root)?.addEventListener('click', () => void apply());
    mountedHost = host;
    updateSource();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  window.addEventListener('load', mount, { once: true });
  window.setInterval(mount, 2000);
})();
