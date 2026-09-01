(() => {
  if (window.__sonaraStudioTempoIntonationV9) return;
  window.__sonaraStudioTempoIntonationV9 = true;

  const PANEL_ID = 'sonara-studio-tempo-intonation-v9';
  const SOURCE_KEY = 'sonara.studio.sourceAudioUrl';
  const AUDIO_RE = /\.(wav|wave|mp3|flac|ogg|m4a|aac|webm)(?:$|\?)/i;
  const q = (selector, root = document) => root.querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

  let localFile = null;
  let sourceUrl = '';
  let resultBlob = null;
  let resultUrl = '';
  let resultName = '';
  let processing = false;
  let mountedRoot = null;

  const isAudio = file => !!file && (String(file.type || '').startsWith('audio/') || AUDIO_RE.test(String(file.name || '')));

  function setStatus(message) {
    const el = q('#sti9-status');
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

  function revokeResult() {
    if (resultUrl && resultUrl.startsWith('blob:')) URL.revokeObjectURL(resultUrl);
    resultUrl = '';
    resultBlob = null;
    resultName = '';
  }

  function hideResult() {
    revokeResult();
    const result = q('#sti9-result');
    const audio = q('#sti9-audio');
    const name = q('#sti9-name');
    if (audio) {
      audio.pause?.();
      audio.removeAttribute('src');
      audio.load?.();
    }
    if (name) name.textContent = '';
    if (result) result.style.display = 'none';
  }

  function showResult(blob, filename) {
    hideResult();
    resultBlob = blob;
    resultName = filename;
    resultUrl = URL.createObjectURL(blob);
    const result = q('#sti9-result');
    const audio = q('#sti9-audio');
    const name = q('#sti9-name');
    if (audio) {
      audio.src = resultUrl;
      audio.load?.();
    }
    if (name) name.textContent = filename;
    if (result) {
      result.style.display = 'block';
      result.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function updateSourceLabel() {
    const el = q('#sti9-source');
    if (!el) return;
    if (localFile) {
      el.textContent = `${localFile.name} · ${bytes(localFile.size)} · FILE AUDIO CORRENTE`;
      return;
    }
    const current = sourceUrl || localStorage.getItem(SOURCE_KEY) || '';
    el.textContent = current
      ? 'Brano Studio corrente rilevato · pronto per Tempo & Intonazione'
      : 'Nessun brano corrente rilevato. Importa o genera un brano in Studio.';
  }

  function lockFile(file) {
    if (!isAudio(file) || processing) return;
    localFile = file;
    sourceUrl = '';
    hideResult();
    updateSourceLabel();
    setStatus(`Pronto: ${file.name}. Correzione micro-tempo e note fuori tonalità sullo stesso file.`);
  }

  function captureSourceUrl(url) {
    const value = String(url || '').trim();
    if (!value || processing) return;
    sourceUrl = value;
    if (!localFile) updateSourceLabel();
  }

  async function fetchSourceFile(url) {
    const absolute = new URL(url, window.location.href);
    let requestUrl = absolute.href;
    if (absolute.hostname === 'api.sonaraenterprise.com' && window.location.hostname.endsWith('sonaraenterprise.com')) {
      requestUrl = window.location.origin + absolute.pathname + absolute.search;
    }
    const response = await fetch(requestUrl, {
      method: 'GET',
      credentials: new URL(requestUrl, window.location.href).origin === window.location.origin ? 'include' : 'omit',
      cache: 'no-store',
      mode: 'cors'
    });
    if (!response.ok) throw new Error(`Impossibile leggere il brano Studio (HTTP ${response.status}).`);
    const blob = await response.blob();
    if (!blob.size) throw new Error('Il brano Studio risulta vuoto.');
    return new File([blob], 'sonara-studio-current.wav', { type: blob.type || 'audio/wav', lastModified: Date.now() });
  }

  async function resolveSourceFile() {
    if (localFile && isAudio(localFile)) return localFile;
    const inputFile = q('#spk6-file')?.files?.[0];
    if (isAudio(inputFile)) return inputFile;
    const currentUrl = sourceUrl || localStorage.getItem(SOURCE_KEY) || q('#sonara-ai-source-player')?.src || q('#spk6-audio')?.src || '';
    if (!currentUrl) throw new Error('Nessun brano disponibile. Genera/importa prima un brano in Studio.');
    setStatus('Recupero del brano Studio corrente...');
    return fetchSourceFile(currentUrl);
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
    if (!AudioCtor) throw new Error('Il browser non supporta il DSP audio necessario.');
    const context = new AudioCtor();
    try {
      const data = await file.arrayBuffer();
      const decoded = await context.decodeAudioData(data.slice(0));
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
      const lerp = (array, index) => {
        if (index <= 0) return array[0] || 0;
        if (index >= array.length - 1) return array[array.length - 1] || 0;
        const left = Math.floor(index);
        const frac = index - left;
        return (array[left] || 0) * (1 - frac) + (array[left + 1] || 0) * frac;
      };

      function monoFromChannels(channels) {
        const length = channels[0]?.length || 0;
        const mono = new Float32Array(length);
        for (let ch = 0; ch < channels.length; ch += 1) {
          const channel = channels[ch];
          for (let i = 0; i < length; i += 1) mono[i] += (channel[i] || 0) / channels.length;
        }
        return mono;
      }

      function median(values) {
        if (!values.length) return 0;
        const sorted = values.slice().sort((a, b) => a - b);
        return sorted[Math.floor(sorted.length / 2)] || 0;
      }

      function detectTransients(mono, sampleRate) {
        const frame = Math.max(128, Math.round(sampleRate * 0.008));
        const hop = Math.max(64, Math.round(sampleRate * 0.004));
        const rms = [];
        for (let start = 0; start < mono.length; start += hop) {
          const end = Math.min(mono.length, start + frame);
          let sum = 0;
          for (let i = start; i < end; i += 1) {
            const x = mono[i] || 0;
            sum += x * x;
          }
          rms.push(Math.sqrt(sum / Math.max(1, end - start)));
        }
        const flux = new Array(rms.length).fill(0);
        for (let i = 1; i < rms.length; i += 1) flux[i] = Math.max(0, rms[i] - rms[i - 1] * 0.985);
        const threshold = Math.max(0.00035, median(flux) * 3.2);
        const minDistance = Math.max(1, Math.round((sampleRate * 0.075) / hop));
        const points = [];
        let last = -minDistance;
        for (let i = 2; i < flux.length - 2; i += 1) {
          if (i - last < minDistance) continue;
          if (flux[i] < threshold) continue;
          if (flux[i] < flux[i - 1] || flux[i] < flux[i + 1]) continue;
          points.push(i * hop);
          last = i;
          if (points.length >= 1800) break;
        }
        return points;
      }

      function buildWarpAnchors(length, transients, sampleRate, bpm, subdivision, strength) {
        const beat = sampleRate * 60 / clamp(bpm, 40, 220);
        const grid = beat / Math.max(1, subdivision);
        const maxShift = Math.min(sampleRate * 0.03, grid * 0.28);
        const amount = clamp(strength, 0, 100) / 100;
        const anchors = [{ dst: 0, src: 0 }];
        let lastDst = 0;
        for (const src of transients) {
          if (src < sampleRate * 0.05 || src > length - sampleRate * 0.05) continue;
          const nearest = Math.round(src / grid) * grid;
          const delta = clamp(nearest - src, -maxShift, maxShift) * amount;
          const dst = src + delta;
          if (dst <= lastDst + sampleRate * 0.025) continue;
          anchors.push({ dst, src });
          lastDst = dst;
        }
        anchors.push({ dst: length - 1, src: length - 1 });
        return anchors;
      }

      function microWarp(channels, anchors) {
        const length = channels[0]?.length || 0;
        const output = channels.map(() => new Float32Array(length));
        for (let a = 0; a < anchors.length - 1; a += 1) {
          const left = anchors[a];
          const right = anchors[a + 1];
          const outStart = Math.max(0, Math.floor(left.dst));
          const outEnd = Math.min(length - 1, Math.ceil(right.dst));
          const outSpan = Math.max(1e-6, right.dst - left.dst);
          const srcSpan = right.src - left.src;
          for (let i = outStart; i <= outEnd; i += 1) {
            const t = clamp((i - left.dst) / outSpan, 0, 1);
            const srcIndex = left.src + srcSpan * t;
            for (let ch = 0; ch < channels.length; ch += 1) output[ch][i] = lerp(channels[ch], srcIndex);
          }
        }
        return output;
      }

      function parseKey(key) {
        const match = String(key || '').trim().match(/^([A-G])([#b]?)[ ]*(Major|Minor)?/i);
        if (!match) return { root: 9, minor: true };
        const map = { C:0,'C#':1,Db:1,D:2,'D#':3,Eb:3,E:4,F:5,'F#':6,Gb:6,G:7,'G#':8,Ab:8,A:9,'A#':10,Bb:10,B:11 };
        const token = match[1].toUpperCase() + (match[2] || '');
        return { root: Number.isFinite(map[token]) ? map[token] : 9, minor: String(match[3] || 'Minor').toLowerCase() === 'minor' };
      }

      function scaleClasses(key) {
        const parsed = parseKey(key);
        const intervals = parsed.minor ? [0,2,3,5,7,8,10] : [0,2,4,5,7,9,11];
        return intervals.map(value => (parsed.root + value) % 12);
      }

      function nearestScaleDelta(midi, allowed) {
        let best = 0;
        let distance = Infinity;
        const center = Math.round(midi);
        for (let note = center - 3; note <= center + 3; note += 1) {
          const pc = ((note % 12) + 12) % 12;
          if (!allowed.includes(pc)) continue;
          const delta = note - midi;
          const abs = Math.abs(delta);
          if (abs < distance) { distance = abs; best = delta; }
        }
        return best;
      }

      function estimatePitch(frame, sampleRate) {
        const decimation = 8;
        const size = Math.floor(frame.length / decimation);
        if (size < 128) return null;
        const data = new Float32Array(size);
        let mean = 0;
        for (let i = 0; i < size; i += 1) {
          data[i] = frame[i * decimation] || 0;
          mean += data[i];
        }
        mean /= size;
        let energy = 0;
        for (let i = 0; i < size; i += 1) {
          data[i] -= mean;
          energy += data[i] * data[i];
        }
        if (energy / size < 0.000006) return null;
        const sr = sampleRate / decimation;
        const minLag = Math.max(3, Math.floor(sr / 1000));
        const maxLag = Math.min(size - 8, Math.ceil(sr / 70));
        let bestLag = 0;
        let bestCorr = 0;
        for (let lag = minLag; lag <= maxLag; lag += 1) {
          let sum = 0;
          let a2 = 0;
          let b2 = 0;
          for (let i = 0; i < size - lag; i += 2) {
            const a = data[i];
            const b = data[i + lag];
            sum += a * b;
            a2 += a * a;
            b2 += b * b;
          }
          const corr = sum / Math.sqrt(Math.max(1e-12, a2 * b2));
          if (corr > bestCorr) { bestCorr = corr; bestLag = lag; }
        }
        if (bestCorr < 0.67 || !bestLag) return null;
        return { frequency: sr / bestLag, confidence: bestCorr };
      }

      function makeShiftMap(input, sampleRate, key, strength, toleranceCents) {
        const allowed = scaleClasses(key);
        const frameSize = 4096;
        const hop = 4096;
        const amount = clamp(strength, 0, 100) / 100;
        const tolerance = clamp(toleranceCents, 5, 50) / 100;
        const points = [];
        const frame = new Float32Array(frameSize);
        for (let start = 0; start < input.length; start += hop) {
          frame.fill(0);
          const available = Math.min(frameSize, input.length - start);
          for (let i = 0; i < available; i += 1) frame[i] = input[start + i] || 0;
          const pitch = estimatePitch(frame, sampleRate);
          let shift = 0;
          if (pitch) {
            const midi = 69 + 12 * Math.log2(pitch.frequency / 440);
            const delta = nearestScaleDelta(midi, allowed);
            if (Math.abs(delta) >= tolerance) shift = clamp(delta, -0.75, 0.75) * amount;
          }
          points.push({ sample: start + frameSize * 0.5, shift });
        }
        if (!points.length) points.push({ sample: 0, shift: 0 });
        return points;
      }

      function shiftAt(points, sample) {
        if (points.length === 1 || sample <= points[0].sample) return points[0].shift;
        for (let i = 0; i < points.length - 1; i += 1) {
          const a = points[i];
          const b = points[i + 1];
          if (sample <= b.sample) {
            const t = clamp((sample - a.sample) / Math.max(1, b.sample - a.sample), 0, 1);
            return a.shift * (1 - t) + b.shift * t;
          }
        }
        return points[points.length - 1].shift;
      }

      function variablePitch(input, points) {
        const length = input.length;
        const output = new Float32Array(length);
        const norm = new Float32Array(length);
        const grain = 2048;
        const hop = 1024;
        const half = grain * 0.5;
        for (let start = -grain; start < length + grain; start += hop) {
          const center = start + half;
          const shift = shiftAt(points, center);
          const ratio = Math.pow(2, shift / 12);
          for (let i = 0; i < grain; i += 1) {
            const outIndex = start + i;
            if (outIndex < 0 || outIndex >= length) continue;
            const sourceIndex = center + (i - half) * ratio;
            if (sourceIndex < 0 || sourceIndex >= length - 1) continue;
            const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (grain - 1));
            output[outIndex] += lerp(input, sourceIndex) * window;
            norm[outIndex] += window;
          }
        }
        for (let i = 0; i < length; i += 1) {
          output[i] = norm[i] > 0.00001 ? output[i] / norm[i] : input[i] || 0;
        }
        return output;
      }

      function correctCenterIntonation(channels, sampleRate, key, strength, toleranceCents) {
        if (strength <= 0) return channels;
        if (channels.length < 2) {
          const points = makeShiftMap(channels[0], sampleRate, key, strength, toleranceCents);
          channels[0] = variablePitch(channels[0], points);
          return channels;
        }
        const length = Math.min(channels[0].length, channels[1].length);
        const mid = new Float32Array(length);
        const side = new Float32Array(length);
        for (let i = 0; i < length; i += 1) {
          const l = channels[0][i] || 0;
          const r = channels[1][i] || 0;
          mid[i] = (l + r) * 0.5;
          side[i] = (l - r) * 0.5;
        }
        const points = makeShiftMap(mid, sampleRate, key, strength, toleranceCents);
        const corrected = variablePitch(mid, points);
        for (let i = 0; i < length; i += 1) {
          channels[0][i] = corrected[i] + side[i];
          channels[1][i] = corrected[i] - side[i];
        }
        return channels;
      }

      function protect(channels) {
        const ceiling = 0.94;
        let peak = 0;
        for (const channel of channels) {
          for (let i = 0; i < channel.length; i += 1) peak = Math.max(peak, Math.abs(channel[i] || 0));
        }
        const trim = peak > ceiling ? ceiling / peak : 0.985;
        for (const channel of channels) {
          let previous = 0;
          for (let i = 0; i < channel.length; i += 1) {
            let x = (channel[i] || 0) * trim;
            const jump = x - previous;
            if (Math.abs(jump) > 0.72 && i > 1 && i < channel.length - 2) {
              x = ((channel[i - 1] || 0) + (channel[i + 1] || 0)) * 0.5 * trim;
            }
            x = Math.tanh(x / ceiling) * ceiling;
            channel[i] = x;
            previous = x;
          }
        }
        return channels;
      }

      self.onmessage = event => {
        const data = event.data || {};
        try {
          let channels = (data.channels || []).map(buffer => new Float32Array(buffer));
          self.postMessage({ type: 'progress', value: 8, stage: 'analisi-tempo' });
          if (Number(data.tempoStrength) > 0) {
            const mono = monoFromChannels(channels);
            const transients = detectTransients(mono, data.sampleRate);
            self.postMessage({ type: 'progress', value: 24, stage: 'transienti' });
            const anchors = buildWarpAnchors(channels[0].length, transients, data.sampleRate, data.bpm, data.subdivision, data.tempoStrength);
            channels = microWarp(channels, anchors);
          }
          self.postMessage({ type: 'progress', value: 52, stage: 'tempo-corretto' });
          if (Number(data.pitchStrength) > 0) {
            channels = correctCenterIntonation(channels, data.sampleRate, data.key, data.pitchStrength, data.toleranceCents);
          }
          self.postMessage({ type: 'progress', value: 88, stage: 'intonazione-corretta' });
          protect(channels);
          self.postMessage({ type: 'progress', value: 96, stage: 'protezione-finale' });
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
          setStatus(`${localFile?.name || 'Brano Studio'} · ${String(data.stage || 'DSP')} · ${Math.round(Number(data.value) || 0)}%`);
          return;
        }
        if (data.type === 'error') {
          cleanup();
          reject(new Error(data.error || 'Errore Tempo & Intonazione.'));
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
        reject(new Error(event.message || 'Worker Tempo & Intonazione non disponibile.'));
      };
      const transfers = decoded.channels.map(channel => channel.buffer);
      worker.postMessage({
        channels: transfers,
        sampleRate: decoded.sampleRate,
        bpm: settings.bpm,
        subdivision: settings.subdivision,
        tempoStrength: settings.tempoStrength,
        key: settings.key,
        pitchStrength: settings.pitchStrength,
        toleranceCents: settings.toleranceCents
      }, transfers);
    });
  }

  function downloadResult() {
    if (!resultUrl || !resultName) return;
    const link = document.createElement('a');
    link.href = resultUrl;
    link.download = resultName;
    link.rel = 'noopener';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function useInPitchKey() {
    if (!resultBlob || !resultName) {
      setStatus('Prima esegui la correzione Tempo & Intonazione.');
      return;
    }
    const input = q('#spk6-file');
    if (!(input instanceof HTMLInputElement)) {
      setStatus('Ingresso Pitch & Key non disponibile.');
      return;
    }
    try {
      const file = new File([resultBlob], resultName, { type: 'audio/wav', lastModified: Date.now() });
      const transfer = new DataTransfer();
      transfer.items.add(file);
      input.files = transfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      lockFile(file);
      setStatus('WAV corretto impostato come nuova sorgente del Pitch & Key.');
    } catch (error) {
      setStatus(error?.message || String(error));
    }
  }

  async function processRepair() {
    if (processing) return;
    const bpm = clamp(q('#sti9-bpm')?.value || localStorage.getItem('sonara.preferredBpm') || 124, 40, 220);
    const subdivision = Number(q('#sti9-grid')?.value || 4);
    const tempoStrength = clamp(q('#sti9-tempo')?.value, 0, 100);
    const key = String(q('#sti9-key')?.value || localStorage.getItem('sonara.studio.keySignature') || 'A Minor');
    const pitchStrength = clamp(q('#sti9-pitch')?.value, 0, 100);
    const toleranceCents = clamp(q('#sti9-tolerance')?.value, 5, 50);
    if (!tempoStrength && !pitchStrength) {
      setStatus('Imposta almeno una correzione Tempo o Intonazione maggiore di 0%.');
      return;
    }
    const button = q('#sti9-process');
    processing = true;
    if (button) button.disabled = true;
    hideResult();
    try {
      const file = await resolveSourceFile();
      localFile = file;
      updateSourceLabel();
      setStatus(`Decodifica ${file.name}...`);
      const decoded = await decodeAudio(file);
      const channels = await runWorker(decoded, { bpm, subdivision, tempoStrength, key, pitchStrength, toleranceCents });
      setStatus('Creazione WAV corretto 98%...');
      const blob = encodeWav(channels, decoded.sampleRate);
      const filename = `${safePart(file.name, 'sonara-brano')}-SONARA-TEMPO-INTONAZIONE.wav`;
      showResult(blob, filename);
      localStorage.setItem('sonara.preferredBpm', String(bpm));
      localStorage.setItem('sonara.studio.keySignature', key);
      setStatus('Completato: transienti riallineati alla griglia BPM e intonazione centrale corretta verso la tonalità scelta.');
    } catch (error) {
      hideResult();
      setStatus(error?.message || String(error));
    } finally {
      processing = false;
      if (button) button.disabled = false;
    }
  }

  function bindPair(rangeId, numberId, min, max, step = 1) {
    const range = q('#' + rangeId);
    const number = q('#' + numberId);
    if (!range || !number) return;
    const sync = value => {
      const snapped = Math.round(clamp(value, min, max) / step) * step;
      range.value = String(snapped);
      number.value = String(snapped);
    };
    range.addEventListener('input', () => sync(range.value));
    number.addEventListener('input', () => sync(number.value));
    number.addEventListener('change', () => sync(number.value));
    sync(range.value);
  }

  function mount() {
    const root = q('#sonara-studio-pitch-key-dsp-v6');
    if (!root) return;
    if (mountedRoot === root && q('#' + PANEL_ID, root)) {
      updateSourceLabel();
      return;
    }
    q('#' + PANEL_ID)?.remove();
    const panel = document.createElement('section');
    panel.id = PANEL_ID;
    panel.style.cssText = 'margin:0 14px 12px;padding:11px 12px;border:1px solid rgba(129,140,248,.28);border-radius:12px;background:linear-gradient(110deg,rgba(22,14,48,.76),rgba(14,24,49,.82),rgba(6,32,58,.72));color:#e5e7eb';
    const currentBpm = clamp(localStorage.getItem('sonara.preferredBpm') || 124, 40, 220);
    const currentKey = String(localStorage.getItem('sonara.studio.keySignature') || 'A Minor');
    const keys = ['C Major','C# Major','D Major','Eb Major','E Major','F Major','F# Major','G Major','Ab Major','A Major','Bb Major','B Major','C Minor','C# Minor','D Minor','Eb Minor','E Minor','F Minor','F# Minor','G Minor','Ab Minor','A Minor','Bb Minor','B Minor'];
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:9px">
        <div><div style="font-size:10px;font-weight:900;letter-spacing:.12em;color:#ddd6fe">TEMPO & INTONAZIONE · DSP V9</div><div style="margin-top:3px;font-size:8px;color:#94a3b8">MICRO-QUANTIZE TRANSIENTI · NOTE FUORI TONALITÀ · STESSO BRANO · NO RIGENERAZIONE</div></div>
        <span style="font-size:8px;color:#a5b4fc;border:1px solid rgba(129,140,248,.3);border-radius:999px;padding:5px 8px">CORREZIONE CONSERVATIVA</span>
      </div>
      <div id="sti9-source" style="margin-bottom:10px;padding:7px 9px;border:1px solid rgba(167,139,250,.22);border-radius:8px;font-size:9px;color:#c4b5fd">Nessun brano corrente rilevato.</div>
      <div style="display:grid;grid-template-columns:120px 140px minmax(210px,1fr) 170px minmax(210px,1fr) 130px;gap:10px;align-items:end;overflow-x:auto;padding-bottom:2px">
        <label style="font-size:9px;color:#cbd5e1">BPM<input id="sti9-bpm" type="number" min="40" max="220" step="1" value="${currentBpm}" style="display:block;width:100%;margin-top:5px;background:#080d15;color:white;border:1px solid #273244;border-radius:8px;padding:8px"></label>
        <label style="font-size:9px;color:#cbd5e1">Griglia<select id="sti9-grid" style="display:block;width:100%;margin-top:5px;background:#080d15;color:white;border:1px solid #273244;border-radius:8px;padding:8px"><option value="2">1/8</option><option value="4" selected>1/16</option><option value="8">1/32</option></select></label>
        <label style="font-size:9px;color:#cbd5e1"><span style="display:flex;justify-content:space-between;gap:6px"><span>Correzione tempo</span><span><input id="sti9-tempo-num" type="number" min="0" max="100" step="1" value="70" style="width:56px;background:#080d15;color:white;border:1px solid rgba(139,92,246,.45);border-radius:6px;padding:4px;text-align:right"> %</span></span><input id="sti9-tempo" type="range" min="0" max="100" step="1" value="70" style="width:100%;accent-color:#8b5cf6"></label>
        <label style="font-size:9px;color:#cbd5e1">Tonalità<select id="sti9-key" style="display:block;width:100%;margin-top:5px;background:#080d15;color:white;border:1px solid #273244;border-radius:8px;padding:8px">${keys.map(key => `<option value="${key}" ${key === currentKey ? 'selected' : ''}>${key}</option>`).join('')}</select></label>
        <label style="font-size:9px;color:#cbd5e1"><span style="display:flex;justify-content:space-between;gap:6px"><span>Correzione intonazione</span><span><input id="sti9-pitch-num" type="number" min="0" max="100" step="1" value="70" style="width:56px;background:#080d15;color:white;border:1px solid rgba(139,92,246,.45);border-radius:6px;padding:4px;text-align:right"> %</span></span><input id="sti9-pitch" type="range" min="0" max="100" step="1" value="70" style="width:100%;accent-color:#8b5cf6"></label>
        <label style="font-size:9px;color:#cbd5e1">Tolleranza<input id="sti9-tolerance" type="number" min="5" max="50" step="1" value="25" style="display:block;width:100%;margin-top:5px;background:#080d15;color:white;border:1px solid #273244;border-radius:8px;padding:8px"><span style="font-size:7px;color:#64748b">centesimi</span></label>
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:11px"><button id="sti9-process" style="border:0;border-radius:9px;padding:9px 13px;background:linear-gradient(90deg,#7c3aed,#6366f1,#2563eb);color:white;font-weight:900;font-size:9px">CORREGGI TEMPO + INTONAZIONE</button></div>
      <div id="sti9-status" style="margin-top:8px;font-size:9px;color:#c4b5fd">Il modulo usa il brano Studio corrente o il file importato nel Pitch & Key.</div>
      <div id="sti9-result" style="display:none;margin-top:11px;padding:10px;border:1px solid rgba(129,140,248,.28);border-radius:10px;background:rgba(3,11,25,.56)">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px"><div><div style="font-size:9px;font-weight:900;color:#a5b4fc">WAV TEMPO + INTONAZIONE CORRETTI</div><div id="sti9-name" style="margin-top:3px;font-size:9px;color:#e9d5ff;word-break:break-all"></div></div><div style="display:flex;gap:7px;flex-wrap:wrap"><button id="sti9-use" style="border:1px solid rgba(139,92,246,.42);border-radius:9px;padding:8px 10px;background:#111827;color:#ddd6fe;font-size:9px;font-weight:900">USA NEL PITCH & KEY</button><button id="sti9-download" style="border:0;border-radius:9px;padding:8px 10px;background:linear-gradient(90deg,#7c3aed,#4f46e5,#2563eb);color:white;font-size:9px;font-weight:900">SCARICA WAV CORRETTO</button></div></div>
        <audio id="sti9-audio" controls preload="metadata" style="width:100%"></audio>
      </div>`;
    const cleanup = q('#sonara-studio-wav-cleanup-v7', root);
    if (cleanup?.parentElement) cleanup.insertAdjacentElement('afterend', panel);
    else root.appendChild(panel);
    q('#sti9-process', panel)?.addEventListener('click', () => void processRepair());
    q('#sti9-download', panel)?.addEventListener('click', downloadResult);
    q('#sti9-use', panel)?.addEventListener('click', useInPitchKey);
    bindPair('sti9-tempo', 'sti9-tempo-num', 0, 100, 1);
    bindPair('sti9-pitch', 'sti9-pitch-num', 0, 100, 1);
    mountedRoot = root;
    updateSourceLabel();
  }

  document.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || !input.files?.length) return;
    const file = Array.from(input.files).find(isAudio);
    if (file) lockFile(file);
  }, true);

  document.addEventListener('drop', event => {
    const file = Array.from(event.dataTransfer?.files || []).find(isAudio);
    if (file) lockFile(file);
  }, true);

  window.addEventListener('sonara:studio-source-changed', event => captureSourceUrl(event?.detail?.audioUrl));
  window.addEventListener('sonara:studio-apply-full-source-candidate', event => captureSourceUrl(event?.detail?.audioUrl));

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
  window.addEventListener('load', mount, { once: true });
  window.setInterval(mount, 1400);
  window.addEventListener('beforeunload', revokeResult, { once: true });
})();
