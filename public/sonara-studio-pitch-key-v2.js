(() => {
  if (window.__sonaraStudioPitchKeyStaticV2) return;
  window.__sonaraStudioPitchKeyStaticV2 = true;

  const API = 'https://api.sonaraenterprise.com';
  const SOURCE_KEY = 'sonara.studio.sourceAudioUrl';
  const KEY_STORAGE = 'sonara.studio.keySignature';
  const ROOT_ID = 'sonara-studio-pitch-key-pro-v2';
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const q = (selector, root = document) => root.querySelector(selector);
  const clamp = (n, min, max) => Math.max(min, Math.min(max, Number(n) || 0));
  const signed = n => (n > 0 ? '+' : '') + n;
  const keys = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const keyOptions = ['<option value="">Mantieni tonalità</option>']
    .concat(keys.flatMap(key => [
      '<option value="' + key + ' major">' + key + ' Major</option>',
      '<option value="' + key + ' minor">' + key + ' Minor</option>'
    ])).join('');

  const style = document.createElement('style');
  style.id = ROOT_ID + '-style';
  style.textContent = `
#${ROOT_ID}{position:fixed;right:18px;top:126px;z-index:2147482500;width:min(360px,calc(100vw - 28px));border:1px solid rgba(139,92,246,.28);border-radius:16px;background:rgba(5,8,14,.98);box-shadow:0 24px 70px rgba(0,0,0,.65);font-family:system-ui;color:#e5e7eb;overflow:hidden}
#${ROOT_ID}[data-collapsed=true] .spk-body{display:none}
#${ROOT_ID} .spk-head{display:flex;align-items:center;gap:8px;padding:11px 12px;border-bottom:1px solid rgba(255,255,255,.07);background:linear-gradient(90deg,rgba(124,58,237,.13),rgba(37,99,235,.08))}
#${ROOT_ID} .spk-title{font-size:10px;font-weight:950;letter-spacing:.12em;text-transform:uppercase;color:#ddd6fe;flex:1}
#${ROOT_ID} .spk-live{font-size:7px;font-weight:950;color:#6ee7b7;border:1px solid rgba(52,211,153,.22);border-radius:999px;padding:4px 6px}
#${ROOT_ID} .spk-toggle{border:0;background:transparent;color:#94a3b8;font-size:14px;cursor:pointer}
#${ROOT_ID} .spk-body{padding:12px;max-height:calc(100vh - 190px);overflow:auto}
#${ROOT_ID} .spk-grid{display:grid;gap:9px}
#${ROOT_ID} .spk-card{border:1px solid rgba(255,255,255,.07);border-radius:11px;padding:9px;background:rgba(15,23,42,.58)}
#${ROOT_ID} label{display:block;margin-bottom:5px;font-size:8px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color:#718096}
#${ROOT_ID} select{width:100%;border:1px solid rgba(255,255,255,.1);border-radius:9px;background:#080d15;color:#fff;padding:8px;font-size:10px;font-weight:800}
#${ROOT_ID} input[type=range]{width:100%;accent-color:#8b5cf6}
#${ROOT_ID} .spk-value{float:right;color:#e9d5ff}
#${ROOT_ID} .spk-hint{margin-top:5px;font-size:8px;line-height:1.45;color:#64748b}
#${ROOT_ID} .spk-check{display:flex;align-items:center;gap:7px;margin:9px 0;font-size:9px;color:#94a3b8;text-transform:none;letter-spacing:0}
#${ROOT_ID} .spk-actions{display:grid;grid-template-columns:1fr auto;gap:7px}
#${ROOT_ID} button.spk-action{border:1px solid rgba(255,255,255,.1);border-radius:9px;padding:9px;font-size:9px;font-weight:950;cursor:pointer}
#${ROOT_ID} .spk-apply{background:linear-gradient(90deg,#7c3aed,#4f46e5,#2563eb);color:#fff}
#${ROOT_ID} .spk-reset{background:#0a0f17;color:#94a3b8}
#${ROOT_ID} button:disabled{opacity:.45;cursor:not-allowed}
#${ROOT_ID} .spk-status{margin-top:8px;font-size:9px;line-height:1.45;color:#c4b5fd}
#${ROOT_ID} .spk-result{display:none;margin-top:9px;border:1px solid rgba(96,165,250,.18);border-radius:10px;padding:8px;background:rgba(37,99,235,.07)}
#${ROOT_ID} .spk-result.show{display:block}
#${ROOT_ID} audio{width:100%;height:32px;margin-top:6px}
@media(max-width:700px){#${ROOT_ID}{right:8px;top:118px;width:calc(100vw - 16px)}}
`;
  document.head.appendChild(style);

  let sourceOverride = '';
  window.addEventListener('sonara:studio-source-changed', event => {
    sourceOverride = String(event?.detail?.audioUrl || '').trim();
    if (sourceOverride && /^https?:\/\//i.test(sourceOverride)) localStorage.setItem(SOURCE_KEY, sourceOverride);
  });

  function sourceUrl() {
    const candidates = [
      sourceOverride,
      localStorage.getItem(SOURCE_KEY) || '',
      q('#sonara-ai-source-url')?.value || '',
      q('#sonara-ai-source-player')?.src || '',
      Array.from(document.querySelectorAll('audio[src]')).map(audio => audio.src).find(src => /^https?:\/\//i.test(src)) || ''
    ];
    return candidates.map(value => String(value || '').trim()).find(value => /^https?:\/\//i.test(value)) || '';
  }

  function status(value) {
    const el = q('#spk2-status');
    if (el) el.textContent = value;
  }

  async function api(path, init) {
    const response = await fetch(API + path, init || {});
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
      if (typeof value === 'string') return /^https?:\/\//i.test(value) && /(?:audio|molab|\.wav|\.mp3|\.flac|\.ogg)/i.test(value) ? value : '';
      if (typeof value !== 'object') return '';
      if (seen.has(value)) return '';
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
    q('#spk2-key').value = '';
    ['track','vocal','formant'].forEach(id => {
      q('#spk2-' + id).value = '0';
      q('#spk2-' + id + '-v').textContent = '0 st';
    });
    q('#spk2-tempo').checked = true;
    status('Pronto. Il pitch live della traccia resta separato da questa elaborazione server.');
  }

  async function apply() {
    const src = sourceUrl();
    if (!src) {
      status('Per Pitch & Key AI serve una sorgente SONARA remota. Import locali: usa il pitch live della traccia oppure salva prima la sorgente online.');
      return;
    }
    const body = {
      sourceAudioUrl: src,
      bpm: clamp(localStorage.getItem('sonara.preferredBpm') || 124, 40, 220),
      targetKey: q('#spk2-key').value,
      trackPitchSemitones: Number(q('#spk2-track').value),
      vocalPitchSemitones: Number(q('#spk2-vocal').value),
      vocalFormantSemitones: Number(q('#spk2-formant').value),
      preserveTempo: q('#spk2-tempo').checked,
      preserveStrength: 0.94
    };
    if (!body.targetKey && !body.trackPitchSemitones && !body.vocalPitchSemitones && !body.vocalFormantSemitones) {
      status('Imposta almeno una modifica.');
      return;
    }
    const button = q('#spk2-apply');
    button.disabled = true;
    q('#spk2-result').classList.remove('show');
    try {
      status('Invio al motore Studio Pitch & Key...');
      const submitted = await api('/api/studio/pitch-key', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
      });
      const jobId = submitted.jobId || submitted.id || submitted.job?.id;
      const pollPath = submitted.pollUrl ? submitted.pollUrl.replace(/^https:\/\/api\.sonaraenterprise\.com/, '') : (jobId ? '/api/studio/job/' + encodeURIComponent(jobId) : '');
      if (!pollPath) throw new Error('Job Studio non restituito.');
      for (let attempt = 1; attempt <= 180; attempt += 1) {
        await sleep(attempt === 1 ? 900 : 2200);
        const data = await api(pollPath + (pollPath.includes('?') ? '&' : '?') + 'pitchKey=' + Date.now() + '-' + attempt, { credentials: 'include', cache: 'no-store' });
        const root = data.job || data.result || data;
        const state = String(root.status || data.status || 'PROCESSING').toUpperCase();
        const progress = Number(root.progress ?? data.progress ?? 0);
        status('Elaborazione ' + (Number.isFinite(progress) ? Math.round(progress) + '%' : '') + ' · ' + state);
        if (['FAILED','ERROR','CANCELLED'].includes(state)) throw new Error(root.error || data.error || 'Pitch & Key non riuscito.');
        if (['COMPLETED','SUCCESS','SUCCEEDED','DONE'].includes(state)) {
          const url = resultUrl(root) || resultUrl(data);
          if (!url) throw new Error('Job completato senza URL audio risultato.');
          q('#spk2-audio').src = url;
          q('#spk2-result').dataset.url = url;
          q('#spk2-result').classList.add('show');
          status('Elaborazione completata. L’originale resta invariato finché non applichi il risultato.');
          return;
        }
      }
      throw new Error('Tempo massimo raggiunto; originale invariato.');
    } catch (error) {
      status(error?.message || String(error));
    } finally {
      button.disabled = false;
    }
  }

  function useResult() {
    const result = q('#spk2-result');
    const url = result?.dataset.url || q('#spk2-audio')?.src || '';
    if (!url) return;
    localStorage.setItem(SOURCE_KEY, url);
    sourceOverride = url;
    window.dispatchEvent(new CustomEvent('sonara:studio-source-changed', { detail: { audioUrl: url, source: 'pitch-key-v2' } }));
    window.dispatchEvent(new CustomEvent('sonara:studio-apply-full-source-candidate', { detail: { audioUrl: url, title: 'SONARA Pitch & Key Result', operation: 'pitch-key', variation: 'A' } }));
    status('Risultato applicato come nuova sorgente Studio.');
  }

  function mount() {
    const studio = q('[data-sonara-studio-section="true"]');
    const existing = q('#' + ROOT_ID);
    if (!studio) {
      if (existing) existing.remove();
      return;
    }
    if (existing) return;
    const root = document.createElement('section');
    root.id = ROOT_ID;
    root.dataset.collapsed = 'true';
    root.innerHTML = `
      <div class="spk-head"><div class="spk-title">Pitch & Key Pro</div><span class="spk-live">SERVER LIVE</span><button class="spk-toggle" type="button" aria-label="Apri Pitch & Key">▾</button></div>
      <div class="spk-body">
        <div class="spk-grid">
          <div class="spk-card"><label>Tonalità target</label><select id="spk2-key">${keyOptions}</select><div class="spk-hint">Correzione/trasformazione tramite il motore Studio. Non sostituisce il pitch live varispeed della singola traccia.</div></div>
          <div class="spk-card"><label>Pitch brano <span id="spk2-track-v" class="spk-value">0 st</span></label><input id="spk2-track" type="range" min="-12" max="12" step="0.5" value="0"></div>
          <div class="spk-card"><label>Pitch voce <span id="spk2-vocal-v" class="spk-value">0 st</span></label><input id="spk2-vocal" type="range" min="-12" max="12" step="0.5" value="0"></div>
          <div class="spk-card"><label>Formanti / timbro <span id="spk2-formant-v" class="spk-value">0 st</span></label><input id="spk2-formant" type="range" min="-6" max="6" step="0.5" value="0"></div>
        </div>
        <label class="spk-check"><input id="spk2-tempo" type="checkbox" checked> Richiedi preservazione BPM, durata e arrangiamento</label>
        <div class="spk-actions"><button id="spk2-apply" class="spk-action spk-apply">ELABORA PITCH & KEY</button><button id="spk2-reset" class="spk-action spk-reset">RESET</button></div>
        <div id="spk2-status" class="spk-status">Pronto. Apri un brano SONARA e imposta la trasformazione.</div>
        <div id="spk2-result" class="spk-result"><strong style="font-size:8px;color:#bfdbfe">RISULTATO</strong><audio id="spk2-audio" controls preload="metadata"></audio><button id="spk2-use" class="spk-action spk-reset" style="width:100%;margin-top:6px">USA COME SORGENTE STUDIO</button></div>
      </div>`;
    document.body.appendChild(root);
    const storedKey = localStorage.getItem(KEY_STORAGE) || '';
    const normalized = storedKey.replace(/ Major$/i, ' major').replace(/ Minor$/i, ' minor');
    if (Array.from(q('#spk2-key').options).some(option => option.value === normalized)) q('#spk2-key').value = normalized;
    q('.spk-toggle', root).addEventListener('click', () => {
      root.dataset.collapsed = root.dataset.collapsed === 'true' ? 'false' : 'true';
      q('.spk-toggle', root).textContent = root.dataset.collapsed === 'true' ? '▾' : '▴';
    });
    ['track','vocal','formant'].forEach(id => q('#spk2-' + id).addEventListener('input', event => { q('#spk2-' + id + '-v').textContent = signed(Number(event.target.value)) + ' st'; }));
    q('#spk2-reset').addEventListener('click', reset);
    q('#spk2-apply').addEventListener('click', apply);
    q('#spk2-use').addEventListener('click', useResult);
  }

  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
