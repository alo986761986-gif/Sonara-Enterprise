(() => {
  // V6 is authoritative: keep legacy V4/V5 from mounting or calling the generative repair path.
  window.__sonaraStudioPitchKeyLocalOnlyV4 = true;
  window.__sonaraStudioPitchKeySafeV5 = true;
  if (window.__sonaraStudioPitchKeyDspV6) return;
  window.__sonaraStudioPitchKeyDspV6 = true;

  const ROOT_ID = 'sonara-studio-pitch-key-dsp-v6';
  const LEGACY_ROOT_ID = 'sonara-studio-pitch-key-pro-v3';
  const AUDIO_RE = /\.(wav|wave|mp3|flac|ogg|m4a|aac|webm)$/i;
  const q = (selector, root = document) => root.querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
  let localFile = null;
  let mountedHost = null;
  let lastResultUrl = '';
  let lastResultName = '';
  let processing = false;

  const isAudio = file => !!file && (String(file.type || '').startsWith('audio/') || AUDIO_RE.test(String(file.name || '')));
  const bytes = value => Number(value || 0) >= 1048576
    ? (Number(value) / 1048576).toFixed(1) + ' MB'
    : (Number(value || 0) / 1024).toFixed(1) + ' KB';

  function setStatus(text) {
    const el = q('#spk6-status');
    if (el) el.textContent = String(text || '');
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

  function signed(value) {
    const number = Number(value || 0);
    return `${number > 0 ? '+' : ''}${Number.isInteger(number) ? number.toFixed(0) : number.toFixed(1)}`;
  }

  function outputFileName(targetKey, trackPitch, vocalPitch, formantPitch) {
    const source = safePart(localFile?.name, 'sonara-audio');
    const parts = [];
    if (targetKey) parts.push(safePart(targetKey, 'key'));
    if (trackPitch) parts.push(`track${signed(trackPitch)}`);
    if (vocalPitch) parts.push(`voice${signed(vocalPitch)}`);
    if (formantPitch) parts.push(`formant${signed(formantPitch)}`);
    return `${source}-SONARA-Pitch-Key-DSP-${parts.join('-') || 'processed'}.wav`;
  }

  function revokeResultUrl() {
    if (lastResultUrl && lastResultUrl.startsWith('blob:')) URL.revokeObjectURL(lastResultUrl);
    lastResultUrl = '';
    lastResultName = '';
  }

  function hideResult() {
    revokeResultUrl();
    const result = q('#spk6-result');
    const audio = q('#spk6-audio');
    const name = q('#spk6-result-name');
    if (audio) {
      audio.pause?.();
      audio.removeAttribute('src');
      audio.load?.();
    }
    if (name) name.textContent = '';
    if (result) result.style.display = 'none';
  }

  function showResult(blob, filename) {
    revokeResultUrl();
    lastResultUrl = URL.createObjectURL(blob);
    lastResultName = filename || 'sonara-pitch-key-dsp.wav';
    const audio = q('#spk6-audio');
    const result = q('#spk6-result');
    const name = q('#spk6-result-name');
    if (audio) {
      audio.src = lastResultUrl;
      audio.load?.();
    }
    if (name) name.textContent = lastResultName;
    if (result) {
      result.style.display = 'block';
      result.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function updateSource() {
    const el = q('#spk6-local-source');
    if (!el) return;
    el.textContent = localFile
      ? `${localFile.name} · ${bytes(localFile.size)} · SORGENTE ORIGINALE`
      : 'Nessun file audio selezionato';
    el.dataset.ready = localFile ? 'true' : 'false';
  }

  function lock(file) {
    if (!isAudio(file) || processing) return;
    localFile = file;
    hideResult();
    updateSource();
    setStatus(`Pronto: ${file.name}. Il DSP userà esclusivamente questo file, senza generazione AI.`);
  }

  function parseKeyRoot(value) {
    const match = String(value || '').trim().match(/^([A-G])([#b]?)/i);
    if (!match) return null;
    const pc = {
      C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4,
      F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9,
      'A#': 10, Bb: 10, B: 11
    };
    const token = match[1].toUpperCase() + (match[2] || '');
    return Number.isFinite(pc[token]) ? pc[token] : null;
  }

  function shortestKeyShift(sourceKey, targetKey) {
    const source = parseKeyRoot(sourceKey);
    const target = parseKeyRoot(targetKey);
    if (source == null || target == null) return 0;
    let delta = target - source;
    while (delta > 6) delta -= 12;
    while (delta < -6) delta += 12;
    return delta;
  }

  function writeAscii(view, offset, text) {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  }

  function encodeWav(channels, sampleRate) {
    const channelCount = Math.max(1, channels.length);
    const frames = channels[0]?.length || 0;
    const bytesPerSample = 2;
    const blockAlign = channelCount * bytesPerSample;
    const dataSize = frames * blockAlign;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);
    writeAscii(view, 0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeAscii(view, 8, 'WAVE');
    writeAscii(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, channelCount, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeAscii(view, 36, 'data');
    view.setUint32(40, dataSize, true);
    let offset = 44;
    for (let i = 0; i < frames; i += 1) {
      for (let ch = 0; ch < channelCount; ch += 1) {
        const sample = Math.max(-1, Math.min(1, channels[ch][i] || 0));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  function workerSource() {
    return `
      const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));
      const lerp = (array, index) => {
        if (index <= 0) return array[0] || 0;
        if (index >= array.length - 1) return array[array.length - 1] || 0;
        const left = Math.floor(index);
        const frac = index - left;
        return (array[left] || 0) * (1 - frac) + (array[left + 1] || 0) * frac;
      };
      function pitchShift(input, semitones) {
        const amount = clamp(semitones, -18, 18);
        if (Math.abs(amount) < 0.001) return new Float32Array(input);
        const ratio = Math.pow(2, amount / 12);
        const length = input.length;
        const output = new Float32Array(length);
        const norm = new Float32Array(length);
        const grain = 1024;
        const hop = 512;
        const half = grain * 0.5;
        for (let start = -grain; start < length + grain; start += hop) {
          const anchor = start + half;
          for (let i = 0; i < grain; i += 1) {
            const outIndex = start + i;
            if (outIndex < 0 || outIndex >= length) continue;
            const sourceIndex = anchor + (i - half) * ratio;
            if (sourceIndex < 0 || sourceIndex >= length - 1) continue;
            const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (grain - 1));
            output[outIndex] += lerp(input, sourceIndex) * window;
            norm[outIndex] += window;
          }
        }
        for (let i = 0; i < length; i += 1) {
          if (norm[i] > 0.00001) output[i] /= norm[i];
        }
        return output;
      }
      function timbreShift(input, semitones, sampleRate) {
        const amount = clamp(semitones, -6, 6) / 6;
        if (Math.abs(amount) < 0.001) return new Float32Array(input);
        const out = new Float32Array(input.length);
        const cutoff = 2400 * Math.pow(2, amount * 0.8);
        const alpha = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
        let low = 0;
        for (let i = 0; i < input.length; i += 1) {
          const x = input[i] || 0;
          low = (1 - alpha) * x + alpha * low;
          const high = x - low;
          out[i] = amount >= 0 ? x + high * amount * 0.8 : x * (1 + amount) - low * amount;
        }
        return out;
      }
      function normalize(channels) {
        let peak = 0;
        for (const channel of channels) {
          for (let i = 0; i < channel.length; i += 1) peak = Math.max(peak, Math.abs(channel[i] || 0));
        }
        if (peak <= 0.985 || peak <= 0) return channels;
        const gain = 0.985 / peak;
        for (const channel of channels) {
          for (let i = 0; i < channel.length; i += 1) channel[i] *= gain;
        }
        return channels;
      }
      function centerProcess(channels, transform) {
        if (channels.length < 2) {
          channels[0] = transform(channels[0]);
          return channels;
        }
        const length = Math.min(channels[0].length, channels[1].length);
        const mid = new Float32Array(length);
        const side = new Float32Array(length);
        for (let i = 0; i < length; i += 1) {
          const left = channels[0][i] || 0;
          const right = channels[1][i] || 0;
          mid[i] = (left + right) * 0.5;
          side[i] = (left - right) * 0.5;
        }
        const changed = transform(mid);
        for (let i = 0; i < length; i += 1) {
          channels[0][i] = changed[i] + side[i];
          channels[1][i] = changed[i] - side[i];
        }
        return channels;
      }
      self.onmessage = event => {
        const data = event.data || {};
        try {
          let channels = (data.channels || []).map(buffer => new Float32Array(buffer));
          const totalShift = clamp(data.trackPitch, -18, 18) + clamp(data.keyShift, -12, 12);
          if (Math.abs(totalShift) > 0.001) {
            channels = channels.map((channel, index) => {
              const shifted = pitchShift(channel, totalShift);
              self.postMessage({ type: 'progress', value: 12 + Math.round(((index + 1) / channels.length) * 43) });
              return shifted;
            });
          } else {
            self.postMessage({ type: 'progress', value: 55 });
          }
          if (Math.abs(Number(data.vocalPitch) || 0) > 0.001) {
            channels = centerProcess(channels, mid => pitchShift(mid, data.vocalPitch));
          }
          self.postMessage({ type: 'progress', value: 78 });
          if (Math.abs(Number(data.formantPitch) || 0) > 0.001) {
            channels = centerProcess(channels, mid => timbreShift(mid, data.formantPitch, data.sampleRate));
          }
          normalize(channels);
          self.postMessage({ type: 'progress', value: 94 });
          const transfers = channels.map(channel => channel.buffer);
          self.postMessage({ type: 'done', channels: transfers }, transfers);
        } catch (error) {
          self.postMessage({ type: 'error', error: error?.message || String(error) });
        }
      };
    `;
  }

  async function decodeAudio(file) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) throw new Error('Il browser non supporta Web Audio DSP.');
    const context = new AudioCtor();
    try {
      const arrayBuffer = await file.arrayBuffer();
      const decoded = await context.decodeAudioData(arrayBuffer.slice(0));
      const channels = [];
      for (let ch = 0; ch < decoded.numberOfChannels; ch += 1) {
        channels.push(new Float32Array(decoded.getChannelData(ch)));
      }
      return { channels, sampleRate: decoded.sampleRate, duration: decoded.duration };
    } finally {
      await context.close?.();
    }
  }

  function runWorker(decoded, settings) {
    return new Promise((resolve, reject) => {
      const workerBlob = new Blob([workerSource()], { type: 'text/javascript' });
      const workerUrl = URL.createObjectURL(workerBlob);
      const worker = new Worker(workerUrl);
      const cleanup = () => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      };
      worker.onmessage = event => {
        const data = event.data || {};
        if (data.type === 'progress') {
          setStatus(`${localFile?.name || 'Audio'} · DSP ${Math.round(Number(data.value) || 0)}%`);
          return;
        }
        if (data.type === 'error') {
          cleanup();
          reject(new Error(data.error || 'Errore DSP.'));
          return;
        }
        if (data.type === 'done') {
          const channels = (data.channels || []).map(buffer => new Float32Array(buffer));
          cleanup();
          resolve(channels);
        }
      };
      worker.onerror = event => {
        cleanup();
        reject(new Error(event.message || 'Worker DSP non disponibile.'));
      };
      const transfers = decoded.channels.map(channel => channel.buffer);
      worker.postMessage({
        channels: transfers,
        sampleRate: decoded.sampleRate,
        trackPitch: settings.trackPitch,
        vocalPitch: settings.vocalPitch,
        formantPitch: settings.formantPitch,
        keyShift: settings.keyShift
      }, transfers);
    });
  }

  function triggerBrowserDownload(href, filename) {
    const link = document.createElement('a');
    link.href = href;
    link.download = filename || 'sonara-pitch-key-dsp.wav';
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function apply() {
    if (processing) return;
    if (!localFile) {
      setStatus('Seleziona prima il WAV/MP3/FLAC da modificare.');
      return;
    }
    const sourceKey = String(localStorage.getItem('sonara.studio.keySignature') || '');
    const targetKey = String(q('#spk6-key')?.value || '');
    const trackPitch = clamp(q('#spk6-track')?.value, -12, 12);
    const vocalPitch = clamp(q('#spk6-vocal')?.value, -12, 12);
    const formantPitch = clamp(q('#spk6-formant')?.value, -6, 6);
    const keyShift = targetKey && sourceKey && targetKey !== sourceKey ? shortestKeyShift(sourceKey, targetKey) : 0;
    if (!keyShift && !trackPitch && !vocalPitch && !formantPitch) {
      setStatus('Imposta almeno una modifica di tonalità, Pitch brano, Pitch voce o Formanti.');
      return;
    }

    const button = q('#spk6-apply');
    processing = true;
    if (button) button.disabled = true;
    hideResult();
    try {
      setStatus(`Decodifica del file originale: ${localFile.name}...`);
      const decoded = await decodeAudio(localFile);
      setStatus(`${localFile.name} · DSP 5% · nessuna generazione AI`);
      const channels = await runWorker(decoded, { trackPitch, vocalPitch, formantPitch, keyShift });
      setStatus(`${localFile.name} · creazione WAV 97%`);
      const blob = encodeWav(channels, decoded.sampleRate);
      const filename = outputFileName(targetKey, trackPitch + keyShift, vocalPitch, formantPitch);
      showResult(blob, filename);
      setStatus(`Completato: stesso file sorgente elaborato in DSP e convertito in WAV. Nessuna nuova canzone generata.`);
    } catch (error) {
      hideResult();
      setStatus(error?.message || String(error));
    } finally {
      processing = false;
      if (button) button.disabled = false;
    }
  }

  function bindNumericPair(id, min, max, step) {
    const range = q(`#${id}`);
    const number = q(`#${id}-num`);
    if (!range || !number) return;
    const normalize = value => {
      const snapped = Math.round(clamp(value, min, max) / step) * step;
      return Number(snapped.toFixed(2));
    };
    const fromRange = () => { number.value = String(normalize(range.value)); };
    const fromNumber = () => {
      const value = normalize(number.value);
      number.value = String(value);
      range.value = String(value);
    };
    range.addEventListener('input', fromRange);
    number.addEventListener('input', fromNumber);
    number.addEventListener('change', fromNumber);
    fromRange();
  }

  function controlMarkup(label, id, min, max, step, unit) {
    return `
      <label style="display:block;font-size:9px;color:#cbd5e1;min-width:0">
        <span style="display:flex;justify-content:space-between;align-items:center;gap:6px;margin-bottom:5px">
          <span>${label}</span>
          <span style="display:flex;align-items:center;gap:4px">
            <input id="${id}-num" type="number" min="${min}" max="${max}" step="${step}" value="0" inputmode="decimal" style="width:62px;background:#080d15;color:#f5f3ff;border:1px solid rgba(139,92,246,.45);border-radius:7px;padding:5px 6px;text-align:right;font-size:10px;font-weight:800">
            <span style="font-size:8px;color:#7c8aa0">${unit}</span>
          </span>
        </span>
        <input id="${id}" type="range" min="${min}" max="${max}" step="${step}" value="0" style="width:100%;accent-color:#8b5cf6">
        <span style="display:flex;justify-content:space-between;margin-top:2px;font-size:7px;color:#64748b"><span>${min}</span><span>0</span><span>+${max}</span></span>
      </label>`;
  }

  function mount() {
    const studio = q('[data-sonara-studio-section="true"]');
    if (!studio) return;
    const host = q('.sonara-pro-studio', studio) || studio;
    q('#' + LEGACY_ROOT_ID)?.remove();
    if (mountedHost === host && q('#' + ROOT_ID)) {
      updateSource();
      return;
    }

    q('#' + ROOT_ID)?.remove();
    const root = document.createElement('section');
    root.id = ROOT_ID;
    root.style.cssText = 'position:relative;z-index:30;width:100%;border-bottom:1px solid rgba(139,92,246,.24);background:linear-gradient(90deg,rgba(7,10,22,.99),rgba(17,9,35,.99),rgba(6,15,36,.99));color:#e5e7eb;font-family:system-ui';
    const storedKey = String(localStorage.getItem('sonara.studio.keySignature') || 'A Minor');
    const keys = ['C Major','C# Major','D Major','Eb Major','E Major','F Major','F# Major','G Major','Ab Major','A Major','Bb Major','B Major','C Minor','C# Minor','D Minor','Eb Minor','E Minor','F Minor','F# Minor','G Minor','Ab Minor','A Minor','Bb Minor','B Minor'];
    root.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 14px;border-bottom:1px solid rgba(255,255,255,.05);flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:9px"><strong style="font-size:10px;letter-spacing:.12em;color:#ddd6fe">PITCH & KEY PRO · DSP V6</strong><span style="font-size:8px;color:#64748b">FILE ORIGINALE · NO GENERAZIONE AI</span></div>
        <label style="cursor:pointer;border:1px solid rgba(139,92,246,.45);border-radius:8px;padding:6px 9px;font-size:8px;font-weight:800;color:#ddd6fe;background:rgba(76,29,149,.14)">IMPORTA AUDIO<input id="spk6-file" type="file" accept="audio/*,.wav,.wave,.mp3,.flac,.ogg,.m4a,.aac,.webm" style="display:none"></label>
      </div>
      <div style="padding:10px 14px">
        <div id="spk6-local-source" data-ready="false" style="margin-bottom:10px;padding:8px 10px;border:1px solid rgba(139,92,246,.25);border-radius:9px;font-size:9px;color:#c4b5fd">Nessun file audio selezionato</div>
        <div style="display:grid;grid-template-columns:minmax(160px,.8fr) repeat(3,minmax(190px,1fr));gap:12px;align-items:end;overflow-x:auto;padding-bottom:2px">
          <label style="display:block;font-size:9px;color:#cbd5e1">Tonalità target
            <select id="spk6-key" style="display:block;width:100%;margin-top:5px;background:#080d15;color:white;border:1px solid #273244;border-radius:8px;padding:8px;font-size:10px">
              <option value="">Mantieni tonalità</option>${keys.map(key => `<option value="${key}" ${key === storedKey ? 'selected' : ''}>${key}</option>`).join('')}
            </select>
          </label>
          ${controlMarkup('Pitch brano', 'spk6-track', -12, 12, 0.5, 'st')}
          ${controlMarkup('Pitch voce', 'spk6-vocal', -12, 12, 0.5, 'st')}
          ${controlMarkup('Formanti / timbro', 'spk6-formant', -6, 6, 0.5, 'st')}
        </div>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:11px;flex-wrap:wrap">
          <button id="spk6-apply" style="border:0;border-radius:9px;padding:9px 13px;background:linear-gradient(90deg,#7c3aed,#6366f1,#2563eb);color:white;font-weight:900;font-size:9px">ELABORA IL FILE CARICATO</button>
        </div>
        <div id="spk6-status" style="margin-top:8px;font-size:9px;color:#c4b5fd">Importa il WAV o un altro file audio da modificare.</div>
        <div id="spk6-result" style="display:none;margin-top:12px;padding:12px;border:1px solid rgba(139,92,246,.32);border-radius:12px;background:rgba(15,11,31,.78)">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap">
            <div><div style="font-size:9px;font-weight:900;letter-spacing:.1em;color:#a78bfa">WAV DEL TUO FILE ELABORATO</div><div id="spk6-result-name" style="margin-top:3px;font-size:10px;color:#e9d5ff;word-break:break-all"></div></div>
            <div style="display:flex;gap:7px;flex-wrap:wrap">
              <button id="spk6-open" style="border:1px solid rgba(139,92,246,.4);border-radius:9px;padding:8px 10px;background:#111827;color:#ddd6fe;font-size:9px;font-weight:800">APRI WAV</button>
              <button id="spk6-save" style="border:0;border-radius:9px;padding:8px 11px;background:linear-gradient(90deg,#7c3aed,#4f46e5,#2563eb);color:white;font-size:9px;font-weight:900">SCARICA WAV</button>
            </div>
          </div>
          <audio id="spk6-audio" controls preload="metadata" style="width:100%"></audio>
        </div>
      </div>`;

    host.prepend(root);
    q('#spk6-file', root)?.addEventListener('change', event => {
      const file = Array.from(event.target?.files || []).find(isAudio);
      if (file) lock(file);
    });
    q('#spk6-apply', root)?.addEventListener('click', () => void apply());
    q('#spk6-save', root)?.addEventListener('click', () => {
      if (lastResultUrl) triggerBrowserDownload(lastResultUrl, lastResultName);
    });
    q('#spk6-open', root)?.addEventListener('click', () => {
      if (lastResultUrl) window.open(lastResultUrl, '_blank', 'noopener,noreferrer');
    });
    bindNumericPair('spk6-track', -12, 12, 0.5);
    bindNumericPair('spk6-vocal', -12, 12, 0.5);
    bindNumericPair('spk6-formant', -6, 6, 0.5);
    mountedHost = host;
    updateSource();
  }

  document.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || input.id === 'spk6-file' || !input.files?.length) return;
    const file = Array.from(input.files).find(isAudio);
    if (file) lock(file);
  }, true);

  document.addEventListener('drop', event => {
    const file = Array.from(event.dataTransfer?.files || []).find(isAudio);
    if (file) lock(file);
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  window.addEventListener('load', mount, { once: true });
  window.setInterval(mount, 1800);
  window.addEventListener('beforeunload', revokeResultUrl, { once: true });
})();
