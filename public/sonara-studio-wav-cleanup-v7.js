(() => {
  if (window.__sonaraStudioWavCleanupV7) return;
  window.__sonaraStudioWavCleanupV7 = true;

  const PANEL_ID = 'sonara-studio-wav-cleanup-v7';
  const AUDIO_RE = /\.(wav|wave|mp3|flac|ogg|m4a|aac|webm)$/i;
  const q = (selector, root = document) => root.querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

  let sourceFile = null;
  let cleanBlob = null;
  let cleanUrl = '';
  let cleanName = '';
  let processing = false;
  let mountedRoot = null;

  const isAudio = file => !!file && (String(file.type || '').startsWith('audio/') || AUDIO_RE.test(String(file.name || '')));

  function setStatus(message) {
    const el = q('#swc7-status');
    if (el) el.textContent = String(message || '');
  }

  function bytes(value) {
    const size = Number(value || 0);
    if (size >= 1048576) return `${(size / 1048576).toFixed(1)} MB`;
    return `${(size / 1024).toFixed(1)} KB`;
  }

  function safePart(value, fallback = 'audio') {
    const clean = String(value || '')
      .replace(/\.[^.]+$/, '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return clean || fallback;
  }

  function revokeCleanUrl() {
    if (cleanUrl && cleanUrl.startsWith('blob:')) URL.revokeObjectURL(cleanUrl);
    cleanUrl = '';
  }

  function clearResult() {
    revokeCleanUrl();
    cleanBlob = null;
    cleanName = '';
    const box = q('#swc7-result');
    const audio = q('#swc7-audio');
    const name = q('#swc7-name');
    if (audio) {
      audio.pause?.();
      audio.removeAttribute('src');
      audio.load?.();
    }
    if (name) name.textContent = '';
    if (box) box.style.display = 'none';
  }

  function updateSource() {
    const el = q('#swc7-source');
    if (!el) return;
    el.textContent = sourceFile
      ? `${sourceFile.name} · ${bytes(sourceFile.size)} · PRONTO PER LA PULIZIA DSP`
      : 'Usa IMPORTA AUDIO del Pitch & Key oppure trascina qui un file audio.';
  }

  function lockSource(file) {
    if (!isAudio(file) || processing) return;
    sourceFile = file;
    clearResult();
    updateSource();
    setStatus(`Pronto: ${file.name}. La pulizia lavora sul file originale, senza generazione AI.`);
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

  function workerSource() {
    return `
      const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

      function dcAndRumble(input, sampleRate, amount) {
        const cutoff = 18 + amount * 0.22;
        const dt = 1 / sampleRate;
        const rc = 1 / (2 * Math.PI * cutoff);
        const alpha = rc / (rc + dt);
        const out = new Float32Array(input.length);
        let prevX = 0;
        let prevY = 0;
        for (let i = 0; i < input.length; i += 1) {
          const x = input[i] || 0;
          const y = alpha * (prevY + x - prevX);
          out[i] = y;
          prevX = x;
          prevY = y;
        }
        return out;
      }

      function biquadNotch(input, sampleRate, frequency, qValue) {
        if (!frequency || frequency >= sampleRate * 0.45) return new Float32Array(input);
        const w0 = 2 * Math.PI * frequency / sampleRate;
        const alpha = Math.sin(w0) / (2 * qValue);
        const b0 = 1;
        const b1 = -2 * Math.cos(w0);
        const b2 = 1;
        const a0 = 1 + alpha;
        const a1 = -2 * Math.cos(w0);
        const a2 = 1 - alpha;
        const nb0 = b0 / a0;
        const nb1 = b1 / a0;
        const nb2 = b2 / a0;
        const na1 = a1 / a0;
        const na2 = a2 / a0;
        const out = new Float32Array(input.length);
        let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
        for (let i = 0; i < input.length; i += 1) {
          const x = input[i] || 0;
          const y = nb0 * x + nb1 * x1 + nb2 * x2 - na1 * y1 - na2 * y2;
          out[i] = y;
          x2 = x1;
          x1 = x;
          y2 = y1;
          y1 = y;
        }
        return out;
      }

      function removeHum(input, sampleRate, baseFrequency, amount) {
        if (!baseFrequency) return new Float32Array(input);
        let out = new Float32Array(input);
        const q = 24 + amount * 0.45;
        const harmonics = amount >= 70 ? 5 : amount >= 40 ? 4 : 3;
        for (let harmonic = 1; harmonic <= harmonics; harmonic += 1) {
          out = biquadNotch(out, sampleRate, baseFrequency * harmonic, q);
        }
        return out;
      }

      function estimateNoiseFloor(input) {
        const frameSize = 1024;
        const values = [];
        for (let start = 0; start < input.length; start += frameSize) {
          const end = Math.min(input.length, start + frameSize);
          let sum = 0;
          for (let i = start; i < end; i += 1) {
            const x = input[i] || 0;
            sum += x * x;
          }
          values.push(Math.sqrt(sum / Math.max(1, end - start)));
        }
        if (!values.length) return 0;
        values.sort((a, b) => a - b);
        const index = Math.min(values.length - 1, Math.max(0, Math.floor(values.length * 0.18)));
        return values[index] || 0;
      }

      function adaptiveExpander(input, sampleRate, amount) {
        const strength = clamp(amount, 0, 100) / 100;
        if (strength <= 0.001) return new Float32Array(input);
        const floor = Math.max(0.00002, estimateNoiseFloor(input));
        const threshold = floor * (1.35 + strength * 3.2);
        const minGain = Math.max(0.08, 0.62 - strength * 0.54);
        const attack = Math.exp(-1 / (sampleRate * 0.004));
        const release = Math.exp(-1 / (sampleRate * (0.08 + strength * 0.12)));
        const out = new Float32Array(input.length);
        let envelope = 0;
        let gain = 1;
        for (let i = 0; i < input.length; i += 1) {
          const x = input[i] || 0;
          const level = Math.abs(x);
          envelope = level > envelope
            ? attack * envelope + (1 - attack) * level
            : release * envelope + (1 - release) * level;
          const ratio = threshold > 0 ? envelope / threshold : 10;
          let target = 1;
          if (ratio < 1) {
            const shaped = Math.pow(clamp(ratio, 0, 1), 1.5 + strength * 2.3);
            target = minGain + (1 - minGain) * shaped;
          }
          const coeff = target < gain ? 0.985 : 0.9992;
          gain = coeff * gain + (1 - coeff) * target;
          out[i] = x * gain;
        }
        return out;
      }

      function deClick(input, amount) {
        const strength = clamp(amount, 0, 100) / 100;
        if (strength < 0.05 || input.length < 7) return new Float32Array(input);
        const out = new Float32Array(input);
        const threshold = 0.42 - strength * 0.18;
        for (let i = 2; i < input.length - 2; i += 1) {
          const center = input[i] || 0;
          const left = (input[i - 1] || 0);
          const right = (input[i + 1] || 0);
          const expected = (left + right) * 0.5;
          const spike = Math.abs(center - expected);
          const neighborMotion = Math.abs(right - left);
          if (spike > threshold && spike > neighborMotion * (2.8 + (1 - strength) * 1.6)) {
            out[i] = expected;
          }
        }
        return out;
      }

      function lowPassHiss(input, sampleRate, amount) {
        const strength = clamp(amount, 0, 100) / 100;
        if (strength < 0.12) return new Float32Array(input);
        const cutoff = Math.max(14500, 20500 - strength * 5200);
        if (cutoff >= sampleRate * 0.48) return new Float32Array(input);
        const dt = 1 / sampleRate;
        const rc = 1 / (2 * Math.PI * cutoff);
        const alpha = dt / (rc + dt);
        const out = new Float32Array(input.length);
        let y = 0;
        for (let i = 0; i < input.length; i += 1) {
          const x = input[i] || 0;
          y += alpha * (x - y);
          out[i] = y;
        }
        return out;
      }

      function normalize(channels) {
        let peak = 0;
        for (const channel of channels) {
          for (let i = 0; i < channel.length; i += 1) peak = Math.max(peak, Math.abs(channel[i] || 0));
        }
        if (peak <= 0 || peak <= 0.985) return channels;
        const gain = 0.985 / peak;
        for (const channel of channels) {
          for (let i = 0; i < channel.length; i += 1) channel[i] *= gain;
        }
        return channels;
      }

      self.onmessage = event => {
        const data = event.data || {};
        try {
          const amount = clamp(data.amount, 0, 100);
          const hum = Number(data.hum) || 0;
          const deClickEnabled = data.deClick !== false;
          let channels = (data.channels || []).map(buffer => new Float32Array(buffer));
          channels = channels.map((channel, index) => {
            let out = dcAndRumble(channel, data.sampleRate, amount);
            self.postMessage({ type: 'progress', value: 12 + Math.round(index / Math.max(1, channels.length) * 7) });
            out = removeHum(out, data.sampleRate, hum, amount);
            self.postMessage({ type: 'progress', value: 30 + Math.round(index / Math.max(1, channels.length) * 7) });
            if (deClickEnabled) out = deClick(out, amount);
            self.postMessage({ type: 'progress', value: 48 + Math.round(index / Math.max(1, channels.length) * 7) });
            out = adaptiveExpander(out, data.sampleRate, amount);
            self.postMessage({ type: 'progress', value: 67 + Math.round(index / Math.max(1, channels.length) * 7) });
            out = lowPassHiss(out, data.sampleRate, amount);
            return out;
          });
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

  function runWorker(decoded, settings) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([workerSource()], { type: 'text/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);
      const cleanup = () => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
      };

      worker.onmessage = event => {
        const data = event.data || {};
        if (data.type === 'progress') {
          setStatus(`${sourceFile?.name || 'Audio'} · PULIZIA DSP ${Math.round(Number(data.value) || 0)}%`);
          return;
        }
        if (data.type === 'error') {
          cleanup();
          reject(new Error(data.error || 'Errore durante la pulizia DSP.'));
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
        reject(new Error(event.message || 'Worker di pulizia DSP non disponibile.'));
      };

      const transfers = decoded.channels.map(channel => channel.buffer);
      worker.postMessage({
        channels: transfers,
        sampleRate: decoded.sampleRate,
        amount: settings.amount,
        hum: settings.hum,
        deClick: settings.deClick
      }, transfers);
    });
  }

  function showResult(blob, filename) {
    clearResult();
    cleanBlob = blob;
    cleanName = filename;
    cleanUrl = URL.createObjectURL(blob);

    const result = q('#swc7-result');
    const audio = q('#swc7-audio');
    const name = q('#swc7-name');
    if (audio) {
      audio.src = cleanUrl;
      audio.load?.();
    }
    if (name) name.textContent = filename;
    if (result) {
      result.style.display = 'block';
      result.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function downloadResult() {
    if (!cleanUrl || !cleanName) return;
    const link = document.createElement('a');
    link.href = cleanUrl;
    link.download = cleanName;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function useCleanInPitchKey() {
    if (!cleanBlob || !cleanName) {
      setStatus('Prima esegui la pulizia WAV.');
      return;
    }
    const input = q('#spk6-file');
    if (!(input instanceof HTMLInputElement)) {
      setStatus('Ingresso Pitch & Key non disponibile.');
      return;
    }
    try {
      const file = new File([cleanBlob], cleanName, { type: 'audio/wav', lastModified: Date.now() });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      sourceFile = file;
      updateSource();
      setStatus('WAV pulito impostato come nuova sorgente del Pitch & Key. Ora puoi modificare tonalità, pitch e formanti.');
    } catch (error) {
      setStatus(`Impossibile trasferire automaticamente il WAV pulito al Pitch & Key: ${error?.message || error}`);
    }
  }

  async function processCleanup() {
    if (processing) return;
    if (!sourceFile) {
      setStatus('Importa prima un file audio dal Pitch & Key.');
      return;
    }

    const amount = clamp(q('#swc7-amount')?.value, 0, 100);
    const hum = Number(q('#swc7-hum')?.value || 0);
    const deClick = q('#swc7-declick')?.checked !== false;
    const button = q('#swc7-clean');

    processing = true;
    if (button) button.disabled = true;
    clearResult();

    try {
      setStatus(`Analisi del rumore: ${sourceFile.name}...`);
      const decoded = await decodeAudio(sourceFile);
      setStatus(`${sourceFile.name} · PULIZIA DSP 5%`);
      const channels = await runWorker(decoded, { amount, hum, deClick });
      setStatus(`${sourceFile.name} · creazione WAV pulito 97%`);
      const blob = encodeWav(channels, decoded.sampleRate);
      const filename = `${safePart(sourceFile.name, 'sonara-audio')}-SONARA-CLEAN.wav`;
      showResult(blob, filename);
      setStatus('Pulizia completata: rumble/DC, ronzio, click isolati, rumore di fondo e fruscio sono stati ridotti senza generazione AI.');
    } catch (error) {
      clearResult();
      setStatus(error?.message || String(error));
    } finally {
      processing = false;
      if (button) button.disabled = false;
    }
  }

  function syncAmount() {
    const range = q('#swc7-amount');
    const number = q('#swc7-amount-num');
    if (!range || !number) return;
    const apply = value => {
      const v = Math.round(clamp(value, 0, 100));
      range.value = String(v);
      number.value = String(v);
    };
    range.addEventListener('input', () => apply(range.value));
    number.addEventListener('input', () => apply(number.value));
    number.addEventListener('change', () => apply(number.value));
    apply(range.value);
  }

  function mount() {
    const root = q('#sonara-studio-pitch-key-dsp-v6');
    if (!root) return;
    if (mountedRoot === root && q('#' + PANEL_ID, root)) {
      updateSource();
      return;
    }

    q('#' + PANEL_ID)?.remove();
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.style.cssText = 'margin:0 14px 11px;padding:11px 12px;border:1px solid rgba(96,165,250,.28);border-radius:12px;background:linear-gradient(110deg,rgba(30,20,60,.72),rgba(20,24,48,.8),rgba(7,29,56,.72));color:#e5e7eb';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px">
        <div>
          <div style="font-size:10px;font-weight:900;letter-spacing:.12em;color:#ddd6fe">PULIZIA WAV PRO · DSP V7</div>
          <div style="margin-top:3px;font-size:8px;color:#94a3b8">RIDUZIONE RUMORE · RONZIO · RUMBLE/DC · CLICK · FRUSCIO · NO AI GENERATIVA</div>
        </div>
        <div style="font-size:8px;color:#93c5fd;border:1px solid rgba(96,165,250,.28);border-radius:999px;padding:5px 8px">SORGENTE ORIGINALE PROTETTA</div>
      </div>
      <div id="swc7-source" style="margin-bottom:10px;padding:7px 9px;border:1px solid rgba(167,139,250,.22);border-radius:8px;font-size:9px;color:#c4b5fd">Usa IMPORTA AUDIO del Pitch & Key oppure trascina qui un file audio.</div>
      <div style="display:grid;grid-template-columns:minmax(220px,1.4fr) minmax(150px,.7fr) minmax(150px,.7fr);gap:12px;align-items:end">
        <label style="display:block;font-size:9px;color:#cbd5e1">
          <span style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px"><span>Intensità pulizia</span><span style="display:flex;align-items:center;gap:4px"><input id="swc7-amount-num" type="number" min="0" max="100" step="1" value="65" style="width:62px;background:#080d15;color:white;border:1px solid rgba(139,92,246,.45);border-radius:7px;padding:5px 6px;text-align:right;font-size:10px;font-weight:800"><span style="font-size:8px;color:#64748b">%</span></span></span>
          <input id="swc7-amount" type="range" min="0" max="100" step="1" value="65" style="width:100%;accent-color:#8b5cf6">
          <span style="display:flex;justify-content:space-between;margin-top:2px;font-size:7px;color:#64748b"><span>Delicata</span><span>65</span><span>Forte</span></span>
        </label>
        <label style="display:block;font-size:9px;color:#cbd5e1">Ronzio rete
          <select id="swc7-hum" style="display:block;width:100%;margin-top:5px;background:#080d15;color:white;border:1px solid #273244;border-radius:8px;padding:8px;font-size:10px">
            <option value="50" selected>50 Hz · Europa/Italia</option>
            <option value="60">60 Hz</option>
            <option value="0">Disattivato</option>
          </select>
        </label>
        <label style="display:flex;align-items:center;justify-content:space-between;gap:8px;border:1px solid #273244;border-radius:8px;padding:8px 9px;font-size:9px;color:#cbd5e1;background:#080d15">Rimuovi click isolati<input id="swc7-declick" type="checkbox" checked style="accent-color:#8b5cf6"></label>
      </div>
      <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:11px;flex-wrap:wrap">
        <button id="swc7-clean" style="border:0;border-radius:9px;padding:9px 13px;background:linear-gradient(90deg,#7c3aed,#6366f1,#2563eb);color:white;font-weight:900;font-size:9px">PULISCI WAV</button>
      </div>
      <div id="swc7-status" style="margin-top:8px;font-size:9px;color:#c4b5fd">La pulizia viene applicata al file audio importato nel Pitch & Key.</div>
      <div id="swc7-result" style="display:none;margin-top:11px;padding:10px;border:1px solid rgba(96,165,250,.28);border-radius:10px;background:rgba(3,11,25,.56)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px">
          <div><div style="font-size:9px;font-weight:900;color:#93c5fd">WAV PULITO</div><div id="swc7-name" style="margin-top:3px;font-size:9px;color:#e9d5ff;word-break:break-all"></div></div>
          <div style="display:flex;gap:7px;flex-wrap:wrap">
            <button id="swc7-use" style="border:1px solid rgba(139,92,246,.42);border-radius:9px;padding:8px 10px;background:#111827;color:#ddd6fe;font-size:9px;font-weight:900">USA NEL PITCH & KEY</button>
            <button id="swc7-download" style="border:0;border-radius:9px;padding:8px 10px;background:linear-gradient(90deg,#7c3aed,#4f46e5,#2563eb);color:white;font-size:9px;font-weight:900">SCARICA WAV PULITO</button>
          </div>
        </div>
        <audio id="swc7-audio" controls preload="metadata" style="width:100%"></audio>
      </div>`;

    const sourceBox = q('#spk6-local-source', root);
    if (sourceBox?.parentElement) sourceBox.insertAdjacentElement('afterend', panel);
    else root.appendChild(panel);

    q('#swc7-clean', panel)?.addEventListener('click', () => void processCleanup());
    q('#swc7-download', panel)?.addEventListener('click', downloadResult);
    q('#swc7-use', panel)?.addEventListener('click', useCleanInPitchKey);
    syncAmount();
    mountedRoot = root;
    updateSource();
  }

  document.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.files?.length) return;
    const file = Array.from(input.files).find(isAudio);
    if (file) lockSource(file);
  }, true);

  document.addEventListener('drop', event => {
    const file = Array.from(event.dataTransfer?.files || []).find(isAudio);
    if (file) lockSource(file);
  }, true);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  window.addEventListener('load', mount, { once: true });
  window.setInterval(mount, 1400);
  window.addEventListener('beforeunload', revokeCleanUrl, { once: true });
})();
