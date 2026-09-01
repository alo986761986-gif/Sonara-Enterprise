(() => {
  if (window.__sonaraStudioTimelineAudioV11) return;
  window.__sonaraStudioTimelineAudioV11 = true;

  const TOOL_INPUT_IDS = new Set([
    'spk8-file', 'spk6-file', 'sonara-timeline-add-audio-v11'
  ]);
  const RESULT_MAP = {
    'spk8-save': { audio: 'spk8-audio', name: 'spk8-result-name', status: 'spk8-status', label: 'Pitch & Key V8' },
    'spk6-save': { audio: 'spk6-audio', name: 'spk6-result-name', status: 'spk6-status', label: 'Pitch & Key' },
    'swc7-download': { audio: 'swc7-audio', name: 'swc7-name', status: 'swc7-status', label: 'Pulizia WAV' },
    'sti9-download': { audio: 'sti9-audio', name: 'sti9-name', status: 'sti9-status', label: 'Tempo & Intonazione' }
  };
  const RESULT_ORDER = [
    RESULT_MAP['sti9-download'],
    RESULT_MAP['spk8-save'],
    RESULT_MAP['swc7-download'],
    RESULT_MAP['spk6-save']
  ];

  let mountedHost = null;
  let importing = false;
  let lastAutoSignature = '';
  let lastAutoAt = 0;

  const q = (selector, root = document) => root.querySelector(selector);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function studioSection() {
    return q('[data-sonara-studio-section="true"]');
  }

  function studioHost() {
    const section = studioSection();
    return section ? (q('.sonara-pro-studio', section) || section) : null;
  }

  function setToolbarStatus(message, ok = true) {
    const el = q('#sonara-timeline-audio-status-v11');
    if (!el) return;
    el.textContent = String(message || '');
    el.style.color = ok ? '#c4b5fd' : '#fca5a5';
  }

  function setPanelStatus(id, message) {
    const el = id ? document.getElementById(id) : null;
    if (el) el.textContent = String(message || '');
  }

  function nativeTimelineAudioInput() {
    const section = studioSection();
    if (!section) return null;
    const candidates = Array.from(section.querySelectorAll('input[type="file"]'))
      .filter(input => input instanceof HTMLInputElement)
      .filter(input => !TOOL_INPUT_IDS.has(input.id))
      .filter(input => !input.multiple)
      .filter(input => /audio/i.test(String(input.accept || '')))
      .filter(input => !/midi/i.test(String(input.accept || '')));

    if (!candidates.length) return null;
    // The native React importer is hidden, normally has no id, and lives in Studio itself.
    candidates.sort((a, b) => {
      const score = input =>
        (input.classList.contains('hidden') ? 8 : 0) +
        (!input.id ? 6 : 0) +
        (input.closest('#sonara-studio-pitch-key-dsp-v6') ? -8 : 0) +
        (input.closest('#sonara-studio-timeline-audio-v11') ? -20 : 0);
      return score(b) - score(a);
    });
    return candidates[0] || null;
  }

  async function waitForNativeInput() {
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const input = nativeTimelineAudioInput();
      if (input) return input;
      await sleep(75);
    }
    return null;
  }

  function safeFilename(value, fallback = 'SONARA-Audio.wav') {
    let name = String(value || '').trim();
    if (!name) name = fallback;
    name = name.replace(/[\\/:*?"<>|]+/g, '-');
    if (!/\.(wav|wave|mp3|flac|ogg|m4a|aac|webm)$/i.test(name)) name += '.wav';
    return name;
  }

  async function importFileToTimeline(file, sourceLabel = 'Audio') {
    if (!(file instanceof File) || !file.size) throw new Error('File audio non valido.');
    const input = await waitForNativeInput();
    if (!input) throw new Error('Importatore audio nativo della Timeline non trovato.');

    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));

    window.dispatchEvent(new CustomEvent('sonara:studio-timeline-audio-imported-v11', {
      detail: { name: file.name, size: file.size, type: file.type, source: sourceLabel }
    }));
    setToolbarStatus(`${file.name} aggiunto alla Timeline Studio Project.`);
    return file;
  }

  async function blobFromAudioElement(audioId) {
    const audio = document.getElementById(audioId);
    if (!(audio instanceof HTMLAudioElement)) throw new Error('Player del WAV elaborato non disponibile.');
    const url = String(audio.currentSrc || audio.src || '').trim();
    if (!url) throw new Error('Nessun WAV elaborato disponibile.');
    const response = await fetch(url, { method: 'GET', cache: 'no-store' });
    if (!response.ok) throw new Error(`Lettura WAV elaborato HTTP ${response.status}.`);
    const blob = await response.blob();
    if (!blob.size) throw new Error('Il WAV elaborato risulta vuoto.');
    return { blob, url };
  }

  function resultIsVisible(config) {
    const audio = document.getElementById(config.audio);
    if (!(audio instanceof HTMLAudioElement)) return false;
    if (!String(audio.currentSrc || audio.src || '').trim()) return false;
    const resultBox = audio.closest('[id$="-result"]') || audio.parentElement;
    if (resultBox instanceof HTMLElement && getComputedStyle(resultBox).display === 'none') return false;
    return true;
  }

  function latestAvailableResult() {
    return RESULT_ORDER.find(resultIsVisible) || null;
  }

  async function importResult(config, automatic = false) {
    if (!config || importing) return;
    importing = true;
    try {
      if (automatic) setPanelStatus(config.status, `${config.label}: salvataggio + caricamento automatico nella Timeline...`);
      setToolbarStatus(`${config.label}: preparo il WAV per la Timeline...`);
      const { blob, url } = await blobFromAudioElement(config.audio);
      const nameText = document.getElementById(config.name)?.textContent;
      const filename = safeFilename(nameText, `SONARA-${config.label.replace(/\s+/g, '-')}.wav`);
      const signature = `${filename}|${url}|${blob.size}`;
      if (automatic && signature === lastAutoSignature && Date.now() - lastAutoAt < 3000) return;
      const file = new File([blob], filename, { type: blob.type || 'audio/wav', lastModified: Date.now() });
      await importFileToTimeline(file, config.label);
      lastAutoSignature = signature;
      lastAutoAt = Date.now();
      const message = `${filename} salvato e aggiunto automaticamente alla Timeline Studio Project.`;
      setPanelStatus(config.status, message);
      setToolbarStatus(message);
    } finally {
      importing = false;
    }
  }

  async function importPickedFiles(files) {
    const audioFiles = Array.from(files || []).filter(file =>
      file instanceof File && (String(file.type || '').startsWith('audio/') || /\.(wav|wave|mp3|flac|ogg|m4a|aac|webm)$/i.test(file.name))
    );
    if (!audioFiles.length) {
      setToolbarStatus('Seleziona almeno un file audio valido.', false);
      return;
    }
    for (const file of audioFiles) {
      setToolbarStatus(`Aggiungo ${file.name} alla Timeline...`);
      await importFileToTimeline(file, 'Aggiungi Audio');
      await sleep(120);
    }
    setToolbarStatus(`${audioFiles.length} file audio aggiunto/i alla Timeline.`);
  }

  function mount() {
    const host = studioHost();
    if (!host) return;
    if (mountedHost === host && q('#sonara-studio-timeline-audio-v11')) return;
    q('#sonara-studio-timeline-audio-v11')?.remove();

    const bar = document.createElement('section');
    bar.id = 'sonara-studio-timeline-audio-v11';
    bar.style.cssText = 'position:relative;z-index:35;margin:10px 14px;padding:10px 12px;border:1px solid rgba(139,92,246,.3);border-radius:12px;background:linear-gradient(90deg,rgba(13,10,28,.94),rgba(16,16,38,.94),rgba(8,22,45,.94));color:#e5e7eb;font-family:system-ui';
    bar.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div>
          <div style="font-size:10px;font-weight:900;letter-spacing:.11em;color:#ddd6fe">TIMELINE STUDIO PROJECT · AUDIO</div>
          <div style="margin-top:3px;font-size:8px;color:#94a3b8">Aggiungi WAV originali o modificati e continua a editarli nella Timeline.</div>
        </div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          <button id="sonara-timeline-add-audio-btn-v11" style="border:1px solid rgba(139,92,246,.45);border-radius:9px;padding:8px 11px;background:#111827;color:#ddd6fe;font-size:9px;font-weight:900">+ AGGIUNGI AUDIO</button>
          <button id="sonara-timeline-save-result-btn-v11" style="border:0;border-radius:9px;padding:8px 11px;background:linear-gradient(90deg,#7c3aed,#4f46e5,#2563eb);color:white;font-size:9px;font-weight:900">SALVA IN TIMELINE</button>
          <input id="sonara-timeline-add-audio-v11" type="file" multiple accept="audio/*,.wav,.wave,.mp3,.flac,.ogg,.m4a,.aac,.webm" style="display:none">
        </div>
      </div>
      <div id="sonara-timeline-audio-status-v11" style="margin-top:7px;font-size:9px;color:#c4b5fd">Pronto.</div>`;

    // Place the controls immediately before the native Studio area when possible.
    host.prepend(bar);
    q('#sonara-timeline-add-audio-btn-v11', bar)?.addEventListener('click', () => q('#sonara-timeline-add-audio-v11', bar)?.click());
    q('#sonara-timeline-add-audio-v11', bar)?.addEventListener('change', event => {
      void importPickedFiles(event.target?.files).catch(error => setToolbarStatus(error?.message || String(error), false));
      event.target.value = '';
    });
    q('#sonara-timeline-save-result-btn-v11', bar)?.addEventListener('click', () => {
      const config = latestAvailableResult();
      if (!config) {
        setToolbarStatus('Nessun WAV elaborato disponibile. Usa + AGGIUNGI AUDIO per un file originale/modificato.', false);
        return;
      }
      void importResult(config, false).catch(error => setToolbarStatus(error?.message || String(error), false));
    });
    mountedHost = host;
  }

  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!(button instanceof HTMLButtonElement)) return;
    const config = RESULT_MAP[button.id];
    if (!config) return;

    // Keep the normal browser download AND import the exact same processed WAV into Studio Project.
    window.setTimeout(() => {
      void importResult(config, true).catch(error => {
        const message = `${config.label}: download eseguito, ma import Timeline fallito: ${error?.message || error}`;
        setPanelStatus(config.status, message);
        setToolbarStatus(message, false);
      });
    }, 180);
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  window.addEventListener('load', mount, { once: true });
  window.setInterval(mount, 1600);
})();
