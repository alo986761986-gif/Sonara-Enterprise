(() => {
  if (window.__sonaraStudioResultToTimelineV10) return;
  window.__sonaraStudioResultToTimelineV10 = true;

  const MAP = {
    'spk8-save': { audio: 'spk8-audio', name: 'spk8-result-name', status: 'spk8-status', label: 'Pitch & Key' },
    'spk6-save': { audio: 'spk6-audio', name: 'spk6-result-name', status: 'spk6-status', label: 'Pitch & Key' },
    'swc7-download': { audio: 'swc7-audio', name: 'swc7-name', status: 'swc7-status', label: 'Pulizia WAV' },
    'sti9-download': { audio: 'sti9-audio', name: 'sti9-name', status: 'sti9-status', label: 'Tempo & Intonazione' }
  };

  const imported = new Map();
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function studioRoot() {
    return document.querySelector('[data-sonara-studio-section="true"] .sonara-pro-studio');
  }

  function timelineAudioInput() {
    const root = studioRoot();
    if (!root) return null;
    const inputs = Array.from(root.querySelectorAll('input[type="file"]'));
    return inputs.find(input =>
      input instanceof HTMLInputElement &&
      !input.multiple &&
      !input.id &&
      input.classList.contains('hidden') &&
      /audio/i.test(String(input.accept || '')) &&
      !/midi/i.test(String(input.accept || ''))
    ) || null;
  }

  function status(id, message) {
    const el = id ? document.getElementById(id) : null;
    if (el) el.textContent = message;
  }

  function safeName(value, fallback) {
    const text = String(value || '').trim();
    if (!text) return fallback;
    return /\.wav$/i.test(text) ? text : `${text.replace(/\.[^.]+$/, '')}.wav`;
  }

  async function fetchBlob(url) {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Impossibile leggere il WAV elaborato (HTTP ${response.status}).`);
    const blob = await response.blob();
    if (!blob.size) throw new Error('Il WAV elaborato risulta vuoto.');
    return blob.type === 'audio/wav' ? blob : new Blob([blob], { type: 'audio/wav' });
  }

  async function waitForTimelineInput() {
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const input = timelineAudioInput();
      if (input) return input;
      await sleep(100);
    }
    return null;
  }

  async function importIntoTimeline(config) {
    const audio = document.getElementById(config.audio);
    const nameEl = document.getElementById(config.name);
    const src = audio instanceof HTMLAudioElement ? String(audio.currentSrc || audio.src || '') : '';
    if (!src) throw new Error('Nessun WAV elaborato disponibile per Studio Project.');

    const filename = safeName(nameEl?.textContent, `SONARA-${config.label.replace(/\s+/g, '-')}.wav`);
    const signature = `${filename}|${src}`;
    const recentAt = imported.get(signature) || 0;
    if (Date.now() - recentAt < 5000) return;

    status(config.status, `${config.label}: salvataggio WAV + inserimento nella Timeline Studio Project...`);
    const blob = await fetchBlob(src);
    const file = new File([blob], filename, { type: 'audio/wav', lastModified: Date.now() });
    const input = await waitForTimelineInput();
    if (!input) throw new Error('Timeline Studio Project non disponibile.');

    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
    imported.set(signature, Date.now());
    input.dispatchEvent(new Event('change', { bubbles: true }));

    window.dispatchEvent(new CustomEvent('sonara:studio-dsp-result-imported-to-timeline', {
      detail: { name: filename, size: file.size, type: file.type, source: config.label }
    }));

    status(config.status, `${filename} salvato e caricato nella Timeline Studio Project. Puoi continuare subito con altre modifiche.`);
  }

  document.addEventListener('click', event => {
    const button = event.target instanceof Element ? event.target.closest('button') : null;
    if (!(button instanceof HTMLButtonElement)) return;
    const config = MAP[button.id];
    if (!config) return;

    // Non blocca il download originale: aggiunge in parallelo il risultato alla Timeline nativa.
    window.setTimeout(() => {
      void importIntoTimeline(config).catch(error => {
        status(config.status, `${config.label}: WAV salvato, ma import Timeline non riuscito: ${error?.message || error}`);
      });
    }, 80);
  }, true);
})();
