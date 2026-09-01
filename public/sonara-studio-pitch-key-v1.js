(() => {
  if (window.__sonaraStudioPitchKeyStaticV1) return;
  window.__sonaraStudioPitchKeyStaticV1 = true;

  const API = 'https://api.sonaraenterprise.com';
  const SOURCE_KEY = 'sonara.studio.sourceAudioUrl';
  const ROOT_ID = 'sonara-studio-pitch-key-pro';
  const HOST_ID = 'sonara-native-studio-pitch-host';
  const q = (selector, root = document) => root.querySelector(selector);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const signed = n => (n > 0 ? '+' : '') + n;
  const text = el => String(el?.textContent || '').replace(/\s+/g, ' ').trim();

  const style = document.createElement('style');
  style.id = 'sonara-studio-pitch-key-static-v1-style';
  style.textContent = `
#${HOST_ID}{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07)}
#${ROOT_ID}{margin-top:0;padding-top:0}
#${ROOT_ID} .spk-title{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;font:900 10px/1 system-ui;letter-spacing:.12em;text-transform:uppercase;color:#c4b5fd}
#${ROOT_ID} .spk-badge{border:1px solid rgba(139,92,246,.28);background:linear-gradient(135deg,rgba(139,92,246,.15),rgba(59,130,246,.12));color:#ddd6fe;border-radius:999px;padding:4px 7px;font:900 8px/1 system-ui}
#${ROOT_ID} .spk-grid{display:grid;grid-template-columns:1fr;gap:9px}
#${ROOT_ID} .spk-card{border:1px solid rgba(255,255,255,.08);background:linear-gradient(145deg,rgba(76,29,149,.10),rgba(30,64,175,.07));border-radius:11px;padding:10px}
#${ROOT_ID} label{display:block;font:800 8px/1.2 system-ui;letter-spacing:.08em;text-transform:uppercase;color:#7f8da3;margin-bottom:6px}
#${ROOT_ID} select{width:100%;box-sizing:border-box;border:1px solid rgba(255,255,255,.10);background:#090d15;color:#f8fafc;border-radius:9px;padding:8px 9px;font:800 10px/1.2 system-ui;outline:none}
#${ROOT_ID} input[type=range]{width:100%;accent-color:#8b5cf6}
#${ROOT_ID} .spk-value{float:right;color:#e9d5ff;font:900 9px/1 system-ui}
#${ROOT_ID} .spk-actions{display:grid;grid-template-columns:1fr;gap:8px;margin-top:9px}
#${ROOT_ID} button{border:1px solid rgba(255,255,255,.10);border-radius:9px;padding:9px 10px;font:900 9px/1 system-ui;cursor:pointer}
#${ROOT_ID} .spk-apply{background:linear-gradient(90deg,#7c3aed,#6366f1,#2563eb);border-color:rgba(196,181,253,.35);color:#fff}
#${ROOT_ID} .spk-reset{background:#0b1017;color:#94a3b8}
#${ROOT_ID} button:disabled{opacity:.45;cursor:not-allowed}
#${ROOT_ID} .spk-check{display:flex;align-items:center;gap:7px;margin-top:9px;font:800 9px/1.3 system-ui;color:#94a3b8;text-transform:none;letter-spacing:0}
#${ROOT_ID} .spk-hint,#${ROOT_ID} .spk-status{font:700 9px/1.5 system-ui;color:#718096;margin-top:8px}
#${ROOT_ID} .spk-status{color:#c4b5fd}
#${ROOT_ID} .spk-result{display:none;margin-top:10px;border:1px solid rgba(96,165,250,.18);background:rgba(37,99,235,.07);border-radius:10px;padding:9px}
#${ROOT_ID} .spk-result.show{display:block}
#${ROOT_ID} audio{width:100%;height:34px;margin-top:7px}
`;
  document.head.appendChild(style);

  const status = value => {
    const el = q('#spk-status');
    if (el) el.textContent = value;
  };

  const sourceUrl = () => (
    q('#sonara-ai-source-url')?.value ||
    localStorage.getItem(SOURCE_KEY) ||
    q('#sonara-ai-source-player')?.src ||
    ''
  ).trim();

  const currentBpm = () => clamp(Number(localStorage.getItem('sonara.preferredBpm') || 124), 40, 220);
  const allKeys = ['C','C#','D','Eb','E','F','F#','G','Ab','A','Bb','B'];
  const keyOptions = ['<option value="">Mantieni / nessuna correzione Key</option>']
    .concat(allKeys.flatMap(k => [
      '<option value="' + k + ' major">' + k + ' Major</option>',
      '<option value="' + k + ' minor">' + k + ' Minor</option>'
    ])).join('');

  function findStudioAside() {
    const buttons = Array.from(document.querySelectorAll('button'));
    const markers = [
      /^Mix\s*\/\s*Master$/i,
      /^AUDIO$/i,
      /^STEM$/i,
      /^MIDI$/i,
      /MUSIC MARKET/i
    ];
    for (const pattern of markers) {
      const button = buttons.find(item => pattern.test(text(item)));
      const aside = button?.closest('aside');
      if (aside) return aside;
    }
    return Array.from(document.querySelectorAll('aside')).find(aside => /AUDIO|STEM|MIDI|Mix\s*\/\s*Master/i.test(text(aside))) || null;
  }

  function ensureHost() {
    const aside = findStudioAside();
    if (!aside) return null;
    let host = q('#' + HOST_ID);
    if (!host) {
      host = document.createElement('section');
      host.id = HOST_ID;
      host.setAttribute('data-sonara-studio-pro', 'pitch-key');
      aside.appendChild(host);
    } else if (!aside.contains(host)) {
      aside.appendChild(host);
    }
    return host;
  }

  function reset() {
    q('#spk-key').value = '';
    ['track','vocal','formant'].forEach(id => {
      q('#spk-' + id).value = '0';
      q('#spk-' + id + '-v').textContent = '0 st';
    });
    q('#spk-tempo').checked = true;
    status('Reset completato.');
  }

  function resultUrl(data) {
    const seen = new Set();
    const walk = value => {
      if (!value || typeof value === 'number' || typeof value === 'boolean') return '';
      if (typeof value === 'string') {
        return /^https?:\/\//i.test(value) && /(?:audio|molab|\.wav|\.mp3|\.flac|\.ogg)/i.test(value) ? value : '';
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          const hit = walk(item);
          if (hit) return hit;
        }
        return '';
      }
      if (typeof value === 'object') {
        for (const key of ['recommendedAudioUrl','audioUrl','downloadUrl','url','audio','output','outputs','result','results','items']) {
          if (key in value && !seen.has(value[key])) {
            seen.add(value[key]);
            const hit = walk(value[key]);
            if (hit) return hit;
          }
        }
        for (const item of Object.values(value)) {
          const hit = walk(item);
          if (hit) return hit;
        }
      }
      return '';
    };
    return walk(data);
  }

  async function api(path, init) {
    const response = await fetch(API + path, init || {});
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch {}
    if (!response.ok) throw new Error(data.error || data.message || ('HTTP ' + response.status));
    return data;
  }

  async function apply() {
    const src = sourceUrl();
    if (!src) {
      status('Seleziona prima un brano sorgente in Studio Pro.');
      return;
    }
    const body = {
      sourceAudioUrl: src,
      bpm: currentBpm(),
      targetKey: q('#spk-key').value,
      trackPitchSemitones: Number(q('#spk-track').value),
      vocalPitchSemitones: Number(q('#spk-vocal').value),
      vocalFormantSemitones: Number(q('#spk-formant').value),
      preserveTempo: q('#spk-tempo').checked,
      preserveStrength: 0.94
    };
    if (!body.targetKey && body.trackPitchSemitones === 0 && body.vocalPitchSemitones === 0 && body.vocalFormantSemitones === 0) {
      status('Imposta almeno una modifica.');
      return;
    }
    const button = q('#spk-apply');
    button.disabled = true;
    q('#spk-result').classList.remove('show');
    try {
      status('Invio a SONARA Studio Pro...');
      const submitted = await api('/api/studio/pitch-key', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      });
      const jobId = submitted.jobId || submitted.id || submitted.job?.id;
      const pollPath = submitted.pollUrl
        ? submitted.pollUrl.replace(/^https:\/\/api\.sonaraenterprise\.com/, '')
        : (jobId ? '/api/studio/job/' + encodeURIComponent(jobId) : '');
      if (!pollPath) throw new Error('Studio Pro non ha restituito il job di elaborazione.');
      for (let attempt = 1; attempt <= 180; attempt += 1) {
        await sleep(attempt === 1 ? 900 : 2200);
        const data = await api(
          pollPath + (pollPath.includes('?') ? '&' : '?') + 'pitchKey=' + Date.now() + '-' + attempt,
          { credentials: 'include', cache: 'no-store' }
        );
        const root = data.job || data.result || data;
        const state = String(root.status || data.status || 'PROCESSING').toUpperCase();
        const progress = Number(root.progress ?? data.progress ?? 0);
        status('Elaborazione ' + (Number.isFinite(progress) ? Math.round(progress) + '%' : '') + ' · ' + state);
        if (['FAILED','ERROR','CANCELLED'].includes(state)) {
          throw new Error(root.error || data.error || 'Correzione Pitch & Key non riuscita.');
        }
        if (['COMPLETED','SUCCESS','SUCCEEDED','DONE'].includes(state)) {
          const url = resultUrl(root) || resultUrl(data);
          if (!url) throw new Error('Elaborazione completata ma audio risultante non trovato.');
          q('#spk-audio').src = url;
          q('#spk-result').dataset.url = url;
          q('#spk-result').classList.add('show');
          status('Completato. Originale preservato finche non scegli Usa come sorgente.');
          return;
        }
      }
      throw new Error('Tempo massimo di polling raggiunto. Il brano originale resta invariato.');
    } catch (error) {
      status(error?.message || String(error));
    } finally {
      button.disabled = false;
    }
  }

  function useResult() {
    const result = q('#spk-result');
    const url = result?.dataset.url || q('#spk-audio')?.src || '';
    if (!url) {
      status('Nessun risultato disponibile.');
      return;
    }
    localStorage.setItem(SOURCE_KEY, url);
    const input = q('#sonara-ai-source-url');
    if (input) {
      input.value = url;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const player = q('#sonara-ai-source-player');
    if (player) {
      player.src = url;
      player.load();
    }
    window.dispatchEvent(new CustomEvent('sonara:studio-source-changed', {
      detail: { audioUrl: url, source: 'pitch-key-pro' }
    }));
    status('Risultato impostato come nuova sorgente Studio Pro.');
  }

  function mount() {
    const host = ensureHost();
    if (!host) return;
    let box = q('#' + ROOT_ID);
    if (box) {
      if (!host.contains(box)) host.appendChild(box);
      return;
    }
    box = document.createElement('div');
    box.id = ROOT_ID;
    box.setAttribute('data-sonara-static-ui', 'pitch-key-v1');
    box.innerHTML =
      '<div class="spk-title"><span>Pitch & Key Pro</span><span class="spk-badge">KEY · VOICE · PITCH</span></div>' +
      '<div class="spk-grid">' +
        '<div class="spk-card"><label>Tonalita target del brano</label><select id="spk-key">' + keyOptions + '</select><div class="spk-hint">Corregge note fuori tonalita e armonia verso la Key scelta senza riscrivere il brano.</div></div>' +
        '<div class="spk-card"><label>Pitch brano <span id="spk-track-v" class="spk-value">0 st</span></label><input id="spk-track" type="range" min="-12" max="12" step="0.5" value="0"><div class="spk-hint">Pitch globale con preservazione del BPM.</div></div>' +
        '<div class="spk-card"><label>Pitch voce <span id="spk-vocal-v" class="spk-value">0 st</span></label><input id="spk-vocal" type="range" min="-12" max="12" step="0.5" value="0"><div class="spk-hint">Sposta la voce mantenendo lyrics, timing, vibrato e identita.</div></div>' +
        '<div class="spk-card"><label>Formanti / timbro voce <span id="spk-formant-v" class="spk-value">0 st</span></label><input id="spk-formant" type="range" min="-6" max="6" step="0.5" value="0"><div class="spk-hint">Modifica il colore della voce indipendentemente dalla nota.</div></div>' +
      '</div>' +
      '<label class="spk-check"><input id="spk-tempo" type="checkbox" checked> Preserva BPM, durata, bar grid e arrangiamento</label>' +
      '<div class="spk-actions"><button id="spk-apply" class="spk-apply">APPLICA CORREZIONE PROFESSIONALE</button><button id="spk-reset" class="spk-reset">RESET</button></div>' +
      '<div id="spk-status" class="spk-status">Pronto. Seleziona una Key o modifica Pitch / Voce.</div>' +
      '<div id="spk-result" class="spk-result"><div style="font:900 9px/1 system-ui;color:#bfdbfe">RISULTATO CORRETTO</div><audio id="spk-audio" controls preload="metadata"></audio><button id="spk-use" class="spk-reset" style="width:100%;margin-top:7px">USA COME SORGENTE STUDIO</button></div>';
    host.appendChild(box);

    ['track','vocal','formant'].forEach(id => {
      q('#spk-' + id).addEventListener('input', event => {
        q('#spk-' + id + '-v').textContent = signed(Number(event.target.value)) + ' st';
      });
    });
    q('#spk-reset').addEventListener('click', reset);
    q('#spk-apply').addEventListener('click', apply);
    q('#spk-use').addEventListener('click', useResult);
  }

  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pageshow', mount);
})();
