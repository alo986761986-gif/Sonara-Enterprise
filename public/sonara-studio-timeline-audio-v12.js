(() => {
  if (window.__sonaraStudioTimelineAudioV12) return;
  window.__sonaraStudioTimelineAudioV12 = true;

  const TOOL_INPUT_IDS = new Set(['spk8-file', 'spk6-file', 'sonara-timeline-add-audio-v12']);
  const RESULTS = [
    { audio: 'sti9-audio', name: 'sti9-name', status: 'sti9-status', label: 'Tempo & Intonazione' },
    { audio: 'spk8-audio', name: 'spk8-result-name', status: 'spk8-status', label: 'Pitch & Key V8' },
    { audio: 'swc7-audio', name: 'swc7-name', status: 'swc7-status', label: 'Pulizia WAV' },
    { audio: 'spk6-audio', name: 'spk6-result-name', status: 'spk6-status', label: 'Pitch & Key' }
  ];

  let mountedHost = null;
  let importing = false;
  const importedSignatures = new Set();

  const q = (selector, root = document) => root.querySelector(selector);
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function studioSection() { return q('[data-sonara-studio-section="true"]'); }
  function studioHost() {
    const section = studioSection();
    return section ? (q('.sonara-pro-studio', section) || section) : null;
  }

  function setToolbarStatus(message, ok = true) {
    const el = q('#sonara-timeline-audio-status-v12');
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
    candidates.sort((a, b) => {
      const score = input =>
        (input.classList.contains('hidden') ? 10 : 0) +
        (!input.id ? 8 : 0) +
        (input.closest('#sonara-studio-pitch-key-dsp-v6') ? -12 : 0) +
        (input.closest('#sonara-studio-timeline-audio-v12') ? -30 : 0);
      return score(b) - score(a);
    });
    return candidates[0] || null;
  }

  async function waitForNativeInput() {
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const input = nativeTimelineAudioInput();
      if (input) return input;
      await sleep(80);
    }
    return null;
  }

  function safeFilename(value, fallback = 'SONARA-Audio.wav') {
    let name = String(value || '').trim() || fallback;
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
    window.dispatchEvent(new CustomEvent('sonara:studio-timeline-audio-imported-v12', {
      detail: { name: file.name, size: file.size, type: file.type, source: sourceLabel }
    }));
    setToolbarStatus(`${file.name} aggiunto alla Timeline Studio Project.`);
  }

  function configUrl(config) {
    const audio = document.getElementById(config.audio);
    return audio instanceof HTMLAudioElement ? String(audio.currentSrc || audio.src || '').trim() : '';
  }

  function resultAvailable(config) {
    const url = configUrl(config);
    if (!url) return false;
    const audio = document.getElementById(config.audio);
    const box = audio?.closest('[id$="-result"]') || audio?.parentElement;
    return !(box instanceof HTMLElement) || getComputedStyle(box).display !== 'none';
  }

  async function importResult(config, reason = 'automatico') {
    if (!config || importing || !resultAvailable(config)) return;
    const url = configUrl(config);
    const nameText = document.getElementById(config.name)?.textContent;
    const filename = safeFilename(nameText, `SONARA-${config.label.replace(/\s+/g, '-')}.wav`);
    const signature = `${config.audio}|${filename}|${url}`;
    if (importedSignatures.has(signature)) return;

    importing = true;
    try {
      setToolbarStatus(`${config.label}: caricamento ${reason} nella Timeline...`);
      const response = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (!response.ok) throw new Error(`Lettura WAV HTTP ${response.status}.`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('WAV elaborato vuoto.');
      const file = new File([blob], filename, { type: blob.type || 'audio/wav', lastModified: Date.now() });
      await importFileToTimeline(file, config.label);
      importedSignatures.add(signature);
      const message = `${filename} caricato automaticamente nella Timeline. Puoi continuare a modificarlo.`;
      setPanelStatus(config.status, message);
      setToolbarStatus(message);
    } catch (error) {
      setToolbarStatus(`${config.label}: import Timeline non riuscito: ${error?.message || error}`, false);
    } finally {
      importing = false;
    }
  }

  async function scanResults() {
    if (importing) return;
    for (const config of RESULTS) {
      if (resultAvailable(config)) {
        await importResult(config, 'automatico');
      }
    }
  }

  async function importPickedFiles(files) {
    const audioFiles = Array.from(files || []).filter(file =>
      file instanceof File && (String(file.type || '').startsWith('audio/') || /\.(wav|wave|mp3|flac|ogg|m4a|aac|webm)$/i.test(file.name))
    );
    if (!audioFiles.length) throw new Error('Seleziona almeno un file audio valido.');
    for (const file of audioFiles) {
      await importFileToTimeline(file, 'Aggiungi Audio');
      await sleep(120);
    }
    setToolbarStatus(`${audioFiles.length} file audio aggiunto/i alla Timeline.`);
  }

  function latestResult() { return RESULTS.find(resultAvailable) || null; }

  function mount() {
    const host = studioHost();
    if (!host) return;
    if (mountedHost === host && q('#sonara-studio-timeline-audio-v12')) return;
    q('#sonara-studio-timeline-audio-v12')?.remove();

    const bar = document.createElement('section');
    bar.id = 'sonara-studio-timeline-audio-v12';
    bar.style.cssText = 'position:relative;z-index:35;padding:9px 12px;border-bottom:1px solid rgba(139,92,246,.28);background:linear-gradient(90deg,rgba(13,10,28,.97),rgba(16,16,38,.97),rgba(8,22,45,.97));color:#e5e7eb;font-family:system-ui';
    bar.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap">
        <div><div style="font-size:10px;font-weight:900;letter-spacing:.1em;color:#ddd6fe">TIMELINE · AUDIO</div><div style="margin-top:2px;font-size:8px;color:#94a3b8">I WAV elaborati vengono caricati automaticamente. Puoi aggiungere anche file originali o già modificati.</div></div>
        <div style="display:flex;gap:7px;flex-wrap:wrap">
          <button id="sonara-timeline-add-audio-btn-v12" style="border:1px solid rgba(139,92,246,.45);border-radius:9px;padding:8px 11px;background:#111827;color:#ddd6fe;font-size:9px;font-weight:900">+ AGGIUNGI AUDIO</button>
          <button id="sonara-timeline-save-audio-btn-v12" style="border:0;border-radius:9px;padding:8px 11px;background:linear-gradient(90deg,#7c3aed,#4f46e5,#2563eb);color:white;font-size:9px;font-weight:900">SALVA AUDIO IN TIMELINE</button>
          <input id="sonara-timeline-add-audio-v12" type="file" multiple accept="audio/*,.wav,.wave,.mp3,.flac,.ogg,.m4a,.aac,.webm" style="display:none">
        </div>
      </div>
      <div id="sonara-timeline-audio-status-v12" style="margin-top:6px;font-size:9px;color:#c4b5fd">Import automatico attivo.</div>`;

    const main = q('main', host);
    const transport = main?.firstElementChild;
    if (transport?.parentElement) transport.insertAdjacentElement('afterend', bar);
    else host.prepend(bar);

    q('#sonara-timeline-add-audio-btn-v12', bar)?.addEventListener('click', () => q('#sonara-timeline-add-audio-v12', bar)?.click());
    q('#sonara-timeline-add-audio-v12', bar)?.addEventListener('change', event => {
      void importPickedFiles(event.target?.files).catch(error => setToolbarStatus(error?.message || String(error), false));
      event.target.value = '';
    });
    q('#sonara-timeline-save-audio-btn-v12', bar)?.addEventListener('click', () => {
      const config = latestResult();
      if (!config) {
        setToolbarStatus('Nessun WAV elaborato disponibile. Usa + AGGIUNGI AUDIO per caricare un file.', false);
        return;
      }
      void importResult(config, 'manuale').catch(error => setToolbarStatus(error?.message || String(error), false));
    });
    mountedHost = host;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  window.addEventListener('load', mount, { once: true });
  window.setInterval(() => { mount(); void scanResults(); }, 1200);
})();
