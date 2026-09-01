(() => {
  if (window.__sonaraStudioPitchKeyLocalOnlyV4) return;
  window.__sonaraStudioPitchKeyLocalOnlyV4 = true;

  const ROOT_ID = 'sonara-studio-pitch-key-pro-v3';
  const SOURCE_LABEL_ID = 'spk3-local-source';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const q = (selector, root = document) => root.querySelector(selector);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
  const signed = n => (n > 0 ? '+' : '') + n;
  const AUDIO_RE = /\.(wav|wave|mp3|flac|ogg|m4a|aac|webm)$/i;
  const keys = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const keyOptions = ['<option value="">Mantieni tonalita</option>']
    .concat(keys.flatMap(key => [
      '<option value="' + key + ' major">' + key + ' Major</option>',
      '<option value="' + key + ' minor">' + key + ' Minor</option>'
    ])).join('');

  let localSourceFile = null;
  let localSourceObjectUrl = '';

  function isAudioFile(file) {
    return !!file && (
      String(file.type || '').toLowerCase().startsWith('audio/') ||
      AUDIO_RE.test(String(file.name || ''))
    );
  }

  function formatBytes(bytes) {
    const value = Number(bytes || 0);
    if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + ' MB';
    if (value >= 1024) return (value / 1024).toFixed(1) + ' KB';
    return value + ' B';
  }

  function status(value) {
    const el = q('#spk3-status');
    if (el) el.textContent = value;
  }

  function updateLocalSourceUi() {
    const el = q('#' + SOURCE_LABEL_ID);
    if (!el) return;
    if (!localSourceFile) {
      el.textContent = 'Nessun file locale selezionato';
      el.dataset.ready = 'false';
      return;
    }
    el.textContent = `${localSourceFile.name} · ${formatBytes(localSourceFile.size)} · FILE LOCALE`;
    el.dataset.ready = 'true';
  }

  function lockLocalFile(file, origin = 'device') {
    if (!isAudioFile(file)) return false;
    localSourceFile = file;
    if (localSourceObjectUrl) URL.revokeObjectURL(localSourceObjectUrl);
    localSourceObjectUrl = URL.createObjectURL(file);
    updateLocalSourceUi();
    status(`Sorgente Pitch & Key: ${file.name}. Verra elaborato esclusivamente questo file locale.`);
    window.dispatchEvent(new CustomEvent('sonara:pitch-key-source-locked', {
      detail: {
        name: String(file.name || ''),
        size: Number(file.size || 0),
        type: String(file.type || ''),
        origin
      }
    }));
    return true;
  }

  // Native browser file selection: PC, Mac, Android, iPhone/iPad or mounted device.
  document.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.files?.length) return;
    const file = Array.from(input.files).find(isAudioFile);
    if (file) lockLocalFile(file, 'file-input');
  }, true);

  // Also support drag/drop into Studio.
  document.addEventListener('drop', event => {
    const file = Array.from(event.dataTransfer?.files || []).find(isAudioFile);
    if (file) lockLocalFile(file, 'drop');
  }, true);

  // Direct event bridge for the React Studio importer.
  window.addEventListener('sonara:studio-local-audio-selected', event => {
    const file = event?.detail?.file;
    if (isAudioFile(file)) lockLocalFile(file, 'studio-import');
  });

  const style = document.createElement('style');
  style.id = ROOT_ID + '-style-v4';
  style.textContent = `
#${ROOT_ID}{position:relative;z-index:20;width:100%;border-bottom:1px solid rgba(139,92,246,.22);background:linear-gradient(90deg,rgba(10,14,24,.98),rgba(14,10,28,.98),rgba(7,14,30,.98));font-family:system-ui;color:#e5e7eb;box-shadow:0 10px 30px rgba(0,0,0,.18)}
#${ROOT_ID}[data-collapsed=true] .spk-body{display:none}
#${ROOT_ID} .spk-head{display:flex;align-items:center;gap:9px;min-height:42px;padding:8px 14px;cursor:pointer}
#${ROOT_ID} .spk-title{font-size:10px;font-weight:950;letter-spacing:.12em;text-transform:uppercase;color:#ddd6fe;flex:1}
#${ROOT_ID} .spk-sub{font-size:8px;color:#64748b}
#${ROOT_ID} .spk-live{font-size:7px;font-weight:950;color:#6ee7b7;border:1px solid rgba(52,211,153,.22);border-radius:999px;padding:4px 6px}
#${ROOT_ID} .spk-toggle{border:1px solid rgba(255,255,255,.08);border-radius:8px;background:#0a0f17;color:#94a3b8;font-size:12px;line-height:1;padding:6px 8px;cursor:pointer}
#${ROOT_ID} .spk-body{padding:10px 14px 12px;border-top:1px solid rgba(255,255,255,.05)}
#${ROOT_ID} .spk-source{display:flex;align-items:center;gap:8px;margin-bottom:9px;border:1px solid rgba(139,92,246,.2);border-radius:9px;background:rgba(124,58,237,.07);padding:8px 10px;font-size:9px;color:#c4b5fd}
#${ROOT_ID} .spk-source:before{content:'●';color:#64748b}
#${ROOT_ID} .spk-source[data-ready=true]:before{color:#34d399}
#${ROOT_ID} .spk-grid{display:grid;grid-template-columns:minmax(180px,1.2fr) repeat(3,minmax(150px,1fr));gap:8px}
#${ROOT_ID} .spk-card{border:1px solid rgba(255,255,255,.07);border-radius:11px;padding:9px;background:rgba(15,23,42,.52);min-width:0}
#${ROOT_ID} label{display:block;margin-bottom:5px;font-size:8px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#718096}
#${ROOT_ID} select{width:100%;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:#080d15;color:#fff;padding:8px;font-size:10px;font-weight:800}
#${ROOT_ID} input[type=range]{width:100%;accent-color:#8b5cf6}
#${ROOT_ID} .spk-value{float:right;color:#e9d5ff}
#${ROOT_ID} .spk-hint{margin-top:5px;font-size:8px;line-height:1.45;color:#64748b}
#${ROOT_ID} .spk-bottom{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:end;margin-top:9px}
#${ROOT_ID} .spk-check{display:flex;align-items:center;gap:7px;margin:0;font-size:9px;color:#94a3b8;text-transform:none;letter-spacing:0}
#${ROOT_ID} .spk-actions{display:flex;gap:7px}
#${ROOT_ID} button.spk-action{border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:9px 12px;font-size:9px;font-weight:950;cursor:pointer;white-space:nowrap}
#${ROOT_ID} .spk-apply{background:linear-gradient(90deg,#7c3aed,#4f46e5,#2563eb);color:#fff}
#${ROOT_ID} .spk-reset{background:#0a0f17;color:#94a3b8}
#${ROOT_ID} button:disabled{opacity:.45;cursor:not-allowed}
#${ROOT_ID} .spk-status{margin-top:8px;font-size:9px;line-height:1.45;color:#c4b5fd}
#${ROOT_ID} .spk-result{display:none;margin-top:9px;border:1px solid rgba(96,165,250,.18);border-radius:10px;padding:8px;background:rgba(37,99,235,.07)}
#${ROOT_ID} .spk-result.show{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}
#${ROOT_ID} audio{width:100%;height:32px}
@media(max-width:1100px){#${ROOT_ID} .spk-grid{grid-template-columns:1fr 1fr}#${ROOT_ID} .spk-bottom{grid-template-columns:1fr}}
@media(max-width:640px){#${ROOT_ID} .spk-grid{grid-template-columns:1fr}#${ROOT_ID} .spk-head{padding:8px 10px}#${ROOT_ID} .spk-sub{display:none}#${ROOT_ID} .spk-body{padding:9px 10px}#${ROOT_ID} .spk-actions{display:grid;grid-template-columns:1fr auto}#${ROOT_ID} .spk-result.show{grid-template-columns:1fr}}
`;
  document.head.appendChild(style);

  async function api(path, init) {
    const response = await fetch(window.location.origin + path, init || {});
    const text = await response.text();
    let data = {};
    try { data = text ? JSON.parse(text) : {}; } catch {}
    if (!response.ok) throw new Error(data.error || data.message || ('HTTP ' + response.status));
    return data;
  }

  function resultUrl(data) {
    const seen = new Set();
    const walk = value => {
      if (!value) return '';
      if (typeof value === 'string') return /^https?:\/\//i.test(value) ? value : '';
      if (typeof value !== 'object' || seen.has(value)) return '';
      seen.add(value);
      if (Array.isArray(value)) {
        for (const item of value) { const hit = walk(item); if (hit) return hit; }
        return '';
      }
      for (const key of ['recommendedAudioUrl','audioUrl','downloadUrl','url','audio','output','outputs','result','results','items','job']) {
        if (key in value) { const hit = walk(value[key]); if (hit) return hit; }
      }
      for (const item of Object.values(value)) { const hit = walk(item); if (hit) return hit; }
      return '';
    };
    return walk(data);
  }

  function reset() {
    const key = q('#spk3-key');
    if (key) key.value = '';
    ['track','vocal','formant'].forEach(id => {
      const input = q('#spk3-' + id);
      const value = q('#spk3-' + id + '-v');
      if (input) input.value = '0';
      if (value) value.textContent = '0 st';
    });
    const tempo = q('#spk3-tempo');
    if (tempo) tempo.checked = true;
    status(localSourceFile
      ? `Pronto sul file locale ${localSourceFile.name}.`
      : 'Importa un WAV/MP3/FLAC dal dispositivo. Pitch & Key non usa audio generati dal motore.');
  }

  async function apply() {
    const file = localSourceFile;
    if (!file) {
      status('ERRORE: nessun file audio locale selezionato. Importa prima il WAV/MP3/FLAC dal PC o dispositivo. Nessun audio generato verra usato.');
      return;
    }

    const targetKey = String(q('#spk3-key')?.value || '');
    const trackPitch = Number(q('#spk3-track')?.value || 0);
    const vocalPitch = Number(q('#spk3-vocal')?.value || 0);
    const formantPitch = Number(q('#spk3-formant')?.value || 0);
    if (!targetKey && !trackPitch && !vocalPitch && !formantPitch) {
      status('Imposta almeno una modifica di tonalita, pitch o formanti.');
      return;
    }

    const form = new FormData();
    form.append('src_audio', file, file.name || 'source.wav');
    form.append('sourceOrigin', 'user-local-device');
    form.append('sourceFilename', file.name || 'source.wav');
    form.append('bpm', String(clamp(localStorage.getItem('sonara.preferredBpm') || 124, 40, 220)));
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
      status(`UPLOAD FILE LOCALE: ${file.name} (${formatBytes(file.size)}). Elaborazione Pitch & Key sul file selezionato...`);
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
        status(`${file.name} · ${Number.isFinite(progress) ? Math.round(progress) + '%' : ''} · ${state}`);
        if (['FAILED','ERROR','CANCELLED'].includes(state)) throw new Error(root.error || data.error || 'Pitch & Key non riuscito.');
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
          status(`COMPLETATO: Pitch & Key applicato al file locale ${file.name}. L'originale resta invariato.`);
          return;
        }
      }
      throw new Error('Tempo massimo raggiunto; originale invariato.');
    } catch (error) {
      status(error?.message || String(error));
    } finally {
      if (button) button.disabled = false;
    }
  }

  function useResult() {
    const result = q('#spk3-result');
    const url = result?.dataset.url || q('#spk3-audio')?.src || '';
    if (!url) return;
    window.dispatchEvent(new CustomEvent('sonara:studio-source-changed', { detail: { audioUrl: url, source: 'pitch-key-local-only-v4' } }));
    window.dispatchEvent(new CustomEvent('sonara:studio-apply-full-source-candidate', {
      detail: { audioUrl: url, title: 'SONARA Pitch & Key Result', operation: 'pitch-key', variation: 'A' }
    }));
    status(`Risultato derivato da ${localSourceFile?.name || 'file locale'} applicato come nuova sorgente Studio.`);
  }

  function mount() {
    const studio = q('[data-sonara-studio-section="true"]');
    let existing = q('#' + ROOT_ID);
    if (!studio) {
      if (existing) existing.remove();
      return;
    }
    const host = q('.sonara-pro-studio', studio) || studio;
    if (existing) {
      if (existing.parentElement !== host) host.prepend(existing);
      updateLocalSourceUi();
      return;
    }

    const root = document.createElement('section');
    root.id = ROOT_ID;
    root.dataset.collapsed = 'true';
    root.innerHTML = `
      <div class="spk-head" role="button" tabindex="0" aria-expanded="false">
        <div class="spk-title">Pitch & Key Pro</div>
        <div class="spk-sub">FILE LOCALE · WAV/MP3/FLAC</div>
        <span class="spk-live">LOCAL SOURCE</span>
        <button class="spk-toggle" type="button" aria-label="Apri Pitch & Key">▾</button>
      </div>
      <div class="spk-body">
        <div id="${SOURCE_LABEL_ID}" class="spk-source" data-ready="false">Nessun file locale selezionato</div>
        <div class="spk-grid">
          <div class="spk-card"><label>Tonalita target</label><select id="spk3-key">${keyOptions}</select><div class="spk-hint">Il motore lavora esclusivamente sul file audio importato dal tuo dispositivo.</div></div>
          <div class="spk-card"><label>Pitch brano <span id="spk3-track-v" class="spk-value">0 st</span></label><input id="spk3-track" type="range" min="-12" max="12" step="0.5" value="0"></div>
          <div class="spk-card"><label>Pitch voce <span id="spk3-vocal-v" class="spk-value">0 st</span></label><input id="spk3-vocal" type="range" min="-12" max="12" step="0.5" value="0"></div>
          <div class="spk-card"><label>Formanti / timbro <span id="spk3-formant-v" class="spk-value">0 st</span></label><input id="spk3-formant" type="range" min="-6" max="6" step="0.5" value="0"></div>
        </div>
        <div class="spk-bottom">
          <label class="spk-check"><input id="spk3-tempo" type="checkbox" checked> Preserva BPM, durata e arrangiamento</label>
          <div class="spk-actions"><button id="spk3-apply" class="spk-action spk-apply">ELABORA PITCH & KEY</button><button id="spk3-reset" class="spk-action spk-reset">RESET</button></div>
        </div>
        <div id="spk3-status" class="spk-status">Importa un WAV/MP3/FLAC dal dispositivo. Pitch & Key non usa audio generati dal motore.</div>
        <div id="spk3-result" class="spk-result"><audio id="spk3-audio" controls preload="metadata"></audio><button id="spk3-use" class="spk-action spk-apply">USA RISULTATO</button></div>
      </div>`;
    host.prepend(root);

    const head = q('.spk-head', root);
    const toggle = q('.spk-toggle', root);
    const togglePanel = () => {
      const collapsed = root.dataset.collapsed === 'true';
      root.dataset.collapsed = collapsed ? 'false' : 'true';
      head?.setAttribute('aria-expanded', collapsed ? 'true' : 'false');
      if (toggle) toggle.textContent = collapsed ? '▴' : '▾';
    };
    head?.addEventListener('click', event => {
      if (event.target instanceof Element && event.target.closest('button')) return;
      togglePanel();
    });
    toggle?.addEventListener('click', togglePanel);
    head?.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); togglePanel(); }
    });

    ['track','vocal','formant'].forEach(id => {
      q('#spk3-' + id, root)?.addEventListener('input', event => {
        const value = Number(event.target.value || 0);
        const out = q('#spk3-' + id + '-v', root);
        if (out) out.textContent = signed(value) + ' st';
      });
    });
    q('#spk3-apply', root)?.addEventListener('click', () => void apply());
    q('#spk3-reset', root)?.addEventListener('click', reset);
    q('#spk3-use', root)?.addEventListener('click', useResult);
    updateLocalSourceUi();
  }

  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  window.addEventListener('load', mount, { once: true });
  window.setInterval(mount, 1500);
})();
