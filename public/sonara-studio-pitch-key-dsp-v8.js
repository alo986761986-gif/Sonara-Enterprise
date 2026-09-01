(() => {
  // V8 supersedes the older DSP panel while preserving the same host id for WAV Cleanup V7.
  window.__sonaraStudioPitchKeyLocalOnlyV4 = true;
  window.__sonaraStudioPitchKeySafeV5 = true;
  window.__sonaraStudioPitchKeyDspV6 = true;
  if (window.__sonaraStudioPitchKeyDspV8) return;
  window.__sonaraStudioPitchKeyDspV8 = true;

  const ROOT_ID = 'sonara-studio-pitch-key-dsp-v6';
  const AUDIO_RE = /\.(wav|wave|mp3|flac|ogg|m4a|aac|webm)$/i;
  const q = (selector, root = document) => root.querySelector(selector);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value) || 0));

  let localFile = null;
  let mountedHost = null;
  let lastResultBlob = null;
  let lastResultUrl = '';
  let lastResultName = '';
  let processing = false;

  const isAudio = file => !!file && (String(file.type || '').startsWith('audio/') || AUDIO_RE.test(String(file.name || '')));
  const bytes = value => Number(value || 0) >= 1048576
    ? (Number(value) / 1048576).toFixed(1) + ' MB'
    : (Number(value || 0) / 1024).toFixed(1) + ' KB';

  function setStatus(text) {
    const el = q('#spk8-status');
    if (el) el.textContent = String(text || '');
  }

  function safePart(value, fallback = 'audio') {
    const clean = String(value || '')
      .replace(/\.[^.]+$/, '')
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 72);
    return clean || fallback;
  }

  function signed(value) {
    const n = Number(value || 0);
    return `${n > 0 ? '+' : ''}${Number.isInteger(n) ? n.toFixed(0) : n.toFixed(1)}`;
  }

  function outputFileName(targetKey, trackPitch, vocalPitch, formantPitch, repaired = false) {
    const source = safePart(localFile?.name, 'sonara-audio');
    const parts = [];
    if (targetKey) parts.push(safePart(targetKey, 'key'));
    if (trackPitch) parts.push(`track${signed(trackPitch)}`);
    if (vocalPitch) parts.push(`voice${signed(vocalPitch)}`);
    if (formantPitch) parts.push(`formant${signed(formantPitch)}`);
    if (repaired) parts.push('anti-distortion');
    return `${source}-SONARA-Pitch-Key-V8-${parts.join('-') || 'processed'}.wav`;
  }

  function revokeResultUrl() {
    if (lastResultUrl && lastResultUrl.startsWith('blob:')) URL.revokeObjectURL(lastResultUrl);
    lastResultUrl = '';
  }

  function hideResult() {
    revokeResultUrl();
    lastResultBlob = null;
    lastResultName = '';
    const result = q('#spk8-result');
    const audio = q('#spk8-audio');
    if (audio) {
      audio.pause?.();
      audio.removeAttribute('src');
      audio.load?.();
    }
    if (result) result.style.display = 'none';
  }

  function showResult(blob, filename) {
    revokeResultUrl();
    lastResultBlob = blob;
    lastResultName = filename;
    lastResultUrl = URL.createObjectURL(blob);
    const audio = q('#spk8-audio');
    const result = q('#spk8-result');
    const name = q('#spk8-result-name');
    if (audio) {
      audio.src = lastResultUrl;
      audio.load?.();
    }
    if (name) name.textContent = filename;
    if (result) {
      result.style.display = 'block';
      result.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function updateSource() {
    const el = q('#spk8-local-source');
    if (!el) return;
    el.textContent = localFile
      ? `${localFile.name} · ${bytes(localFile.size)} · SORGENTE ORIGINALE`
      : 'Nessun file audio selezionato';
  }

  function lock(file) {
    if (!isAudio(file) || processing) return;
    localFile = file;
    hideResult();
    updateSource();
    setStatus(`Pronto: ${file.name}. Anti-distortion automatico attivo durante tutta l'elaborazione.`);
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
        const sample = Math.max(-0.985, Math.min(0.985, channels[ch][i] || 0));
        view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
        offset += 2;
      }
    }
    return new Blob([buffer], { type: 'audio/wav' });
  }

  async function decodeAudio(input) {
    const AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) throw new Error('Il browser non supporta Web Audio DSP.');
    const context = new AudioCtor();
    try {
      const arrayBuffer = input instanceof Blob ? await input.arrayBuffer() : await input.arrayBuffer();
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
      const finite = value => Number.isFinite(value) ? value : 0;
      const lerp = (array, index) => {
        if (index <= 0) return finite(array[0] || 0);
        if (index >= array.length - 1) return finite(array[array.length - 1] || 0);
        const left = Math.floor(index);
        const frac = index - left;
        return finite(array[left] || 0) * (1 - frac) + finite(array[left + 1] || 0) * frac;
      };

      function sanitize(input) {
        const out = new Float32Array(input.length);
        for (let i = 0; i < input.length; i += 1) out[i] = finite(input[i] || 0);
        return out;
      }

      function dcBlock(input, sampleRate) {
        const out = new Float32Array(input.length);
        const cutoff = 17;
        const dt = 1 / sampleRate;
        const rc = 1 / (2 * Math.PI * cutoff);
        const alpha = rc / (rc + dt);
        let prevX = 0;
        let prevY = 0;
        for (let i = 0; i < input.length; i += 1) {
          const x = finite(input[i] || 0);
          const y = alpha * (prevY + x - prevX);
          out[i] = y;
          prevX = x;
          prevY = y;
        }
        return out;
      }

      function deSpike(input, strength = 0.7) {
        const out = new Float32Array(input);
        if (input.length < 7) return out;
        const threshold = 0.52 - clamp(strength, 0, 1) * 0.18;
        for (let i = 2; i < input.length - 2; i += 1) {
          const center = finite(input[i] || 0);
          const expected = (finite(input[i - 1] || 0) + finite(input[i + 1] || 0)) * 0.5;
          const deviation = Math.abs(center - expected);
          const localMotion = Math.abs(finite(input[i + 1] || 0) - finite(input[i - 1] || 0));
          if (deviation > threshold && deviation > localMotion * 3.2) out[i] = expected;
        }
        return out;
      }

      function transparentLimiter(input, sampleRate, ceiling = 0.92) {
        const out = new Float32Array(input.length);
        const releaseCoeff = Math.exp(-1 / (Math.max(1, sampleRate) * 0.07));
        let gain = 1;
        for (let i = 0; i < input.length; i += 1) {
          const x = finite(input[i] || 0);
          const abs = Math.abs(x);
          const needed = abs > ceiling ? ceiling / Math.max(abs, 1e-9) : 1;
          if (needed < gain) gain = needed;
          else gain = releaseCoeff * gain + (1 - releaseCoeff) * 1;
          out[i] = x * gain;
        }
        return out;
      }

      function antiDistortionChannel(input, sampleRate, strength = 0.65) {
        let out = sanitize(input);
        out = dcBlock(out, sampleRate);
        out = deSpike(out, strength);
        out = transparentLimiter(out, sampleRate, 0.92);
        return out;
      }

      function pitchShift(input, semitones, sampleRate) {
        const amount = clamp(semitones, -18, 18);
        if (Math.abs(amount) < 0.001) return antiDistortionChannel(input, sampleRate, 0.4);
        const ratio = Math.pow(2, amount / 12);
        const length = input.length;
        const output = new Float32Array(length);
        const norm = new Float32Array(length);
        const grain = sampleRate >= 88200 ? 4096 : 3072;
        const hop = Math.floor(grain / 4);
        const half = grain * 0.5;
        for (let start = -grain; start < length + grain; start += hop) {
          const anchor = start + half;
          for (let i = 0; i < grain; i += 1) {
            const outIndex = start + i;
            if (outIndex < 0 || outIndex >= length) continue;
            const sourceIndex = anchor + (i - half) * ratio;
            if (sourceIndex < 0 || sourceIndex >= length - 1) continue;
            const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / Math.max(1, grain - 1));
            output[outIndex] += lerp(input, sourceIndex) * window;
            norm[outIndex] += window;
          }
        }
        for (let i = 0; i < length; i += 1) {
          if (norm[i] > 0.00001) output[i] /= norm[i];
          else output[i] = finite(input[i] || 0);
        }
        return antiDistortionChannel(output, sampleRate, 0.55);
      }

      function timbreShift(input, semitones, sampleRate) {
        const amount = clamp(semitones, -6, 6) / 6;
        if (Math.abs(amount) < 0.001) return antiDistortionChannel(input, sampleRate, 0.35);
        const out = new Float32Array(input.length);
        const cutoff = Math.min(sampleRate * 0.42, Math.max(1200, 3000 * Math.pow(2, amount * 0.62)));
        const alpha = Math.exp((-2 * Math.PI * cutoff) / sampleRate);
        let low = 0;
        for (let i = 0; i < input.length; i += 1) {
          const x = finite(input[i] || 0);
          low = (1 - alpha) * x + alpha * low;
          const high = x - low;
          // Keep formant processing intentionally conservative to avoid metallic clipping.
          out[i] = amount >= 0 ? x + high * amount * 0.42 : x * (1 + amount * 0.28) - low * amount * 0.28;
        }
        return antiDistortionChannel(out, sampleRate, 0.6);
      }

      function centerProcess(channels, transform, sampleRate) {
        if (channels.length < 2) {
          channels[0] = antiDistortionChannel(transform(channels[0]), sampleRate, 0.65);
          return channels;
        }
        const length = Math.min(channels[0].length, channels[1].length);
        const mid = new Float32Array(length);
        const side = new Float32Array(length);
        for (let i = 0; i < length; i += 1) {
          const left = finite(channels[0][i] || 0);
          const right = finite(channels[1][i] || 0);
          mid[i] = (left + right) * 0.5;
          side[i] = (left - right) * 0.5;
        }
        const changed = transform(mid);
        for (let i = 0; i < length; i += 1) {
          channels[0][i] = finite(changed[i] || 0) + side[i];
          channels[1][i] = finite(changed[i] || 0) - side[i];
        }
        channels[0] = antiDistortionChannel(channels[0], sampleRate, 0.7);
        channels[1] = antiDistortionChannel(channels[1], sampleRate, 0.7);
        return channels;
      }

      function finalMaster(channels, sampleRate, strength = 0.72) {
        channels = channels.map(channel => antiDistortionChannel(channel, sampleRate, strength));
        let peak = 0;
        for (const channel of channels) {
          for (let i = 0; i < channel.length; i += 1) peak = Math.max(peak, Math.abs(finite(channel[i] || 0)));
        }
        if (peak > 0.9) {
          const gain = 0.9 / peak;
          for (const channel of channels) {
            for (let i = 0; i < channel.length; i += 1) channel[i] *= gain;
          }
        }
        return channels;
      }

      self.onmessage = event => {
        const data = event.data || {};
        try {
          let channels = (data.channels || []).map(buffer => new Float32Array(buffer));
          const totalShift = clamp(data.trackPitch, -18, 18) + clamp(data.keyShift, -12, 12);
          channels = channels.map(channel => antiDistortionChannel(channel, data.sampleRate, 0.35));
          self.postMessage({ type: 'progress', value: 8, stage: 'headroom' });

          if (Math.abs(totalShift) > 0.001) {
            channels = channels.map((channel, index) => {
              const shifted = pitchShift(channel, totalShift, data.sampleRate);
              self.postMessage({ type: 'progress', value: 18 + Math.round(((index + 1) / channels.length) * 32), stage: 'pitch' });
              return shifted;
            });
          } else {
            self.postMessage({ type: 'progress', value: 50, stage: 'pitch' });
          }

          if (Math.abs(Number(data.vocalPitch) || 0) > 0.001) {
            channels = centerProcess(channels, mid => pitchShift(mid, data.vocalPitch, data.sampleRate), data.sampleRate);
          }
          self.postMessage({ type: 'progress', value: 68, stage: 'vocal' });

          if (Math.abs(Number(data.formantPitch) || 0) > 0.001) {
            channels = centerProcess(channels, mid => timbreShift(mid, data.formantPitch, data.sampleRate), data.sampleRate);
          }
          self.postMessage({ type: 'progress', value: 82, stage: 'formant' });

          channels = finalMaster(channels, data.sampleRate, data.repairStrength || 0.72);
          self.postMessage({ type: 'progress', value: 96, stage: 'anti-distortion' });
          const transfers = channels.map(channel => channel.buffer);
          self.postMessage({ type: 'done', channels: transfers, stage: 'done' }, transfers);
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
          const stage = data.stage === 'anti-distortion' ? 'ANTI-DISTORSIONE' : String(data.stage || 'DSP').toUpperCase();
          setStatus(`${localFile?.name || 'Audio'} · ${stage} ${Math.round(Number(data.value) || 0)}%`);
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
        keyShift: settings.keyShift,
        repairStrength: settings.repairStrength
      }, transfers);
    });
  }

  async function processBlob(blob, settings) {
    const decoded = await decodeAudio(blob);
    const channels = await runWorker(decoded, settings);
    return { blob: encodeWav(channels, decoded.sampleRate), sampleRate: decoded.sampleRate };
  }

  function triggerDownload(href, filename) {
    if (!href) return;
    const link = document.createElement('a');
    link.href = href;
    link.download = filename || 'sonara-pitch-key-v8.wav';
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
    const targetKey = String(q('#spk8-key')?.value || '');
    const trackPitch = clamp(q('#spk8-track')?.value, -12, 12);
    const vocalPitch = clamp(q('#spk8-vocal')?.value, -12, 12);
    const formantPitch = clamp(q('#spk8-formant')?.value, -6, 6);
    const keyShift = targetKey && sourceKey && targetKey !== sourceKey ? shortestKeyShift(sourceKey, targetKey) : 0;
    if (!keyShift && !trackPitch && !vocalPitch && !formantPitch) {
      setStatus('Imposta almeno una modifica di tonalità, Pitch brano, Pitch voce o Formanti.');
      return;
    }

    const button = q('#spk8-apply');
    processing = true;
    if (button) button.disabled = true;
    hideResult();

    try {
      setStatus(`Preparazione headroom e anti-distortion: ${localFile.name}...`);
      const result = await processBlob(localFile, {
        trackPitch,
        vocalPitch,
        formantPitch,
        keyShift,
        repairStrength: 0.72
      });
      const filename = outputFileName(targetKey, trackPitch + keyShift, vocalPitch, formantPitch, false);
      showResult(result.blob, filename);
      setStatus('Completato con anti-distortion automatico: de-clip, de-spike, DC removal e limiter trasparente applicati durante e dopo il DSP.');
    } catch (error) {
      hideResult();
      setStatus(error?.message || String(error));
    } finally {
      processing = false;
      if (button) button.disabled = false;
    }
  }

  async function repairAgain() {
    if (processing || !lastResultBlob) return;
    const button = q('#spk8-repair');
    processing = true;
    if (button) button.disabled = true;
    try {
      setStatus('Secondo passaggio anti-distortion sul WAV già elaborato...');
      const result = await processBlob(lastResultBlob, {
        trackPitch: 0,
        vocalPitch: 0,
        formantPitch: 0,
        keyShift: 0,
        repairStrength: 0.92
      });
      const currentKey = String(q('#spk8-key')?.value || '');
      const filename = outputFileName(
        currentKey,
        clamp(q('#spk8-track')?.value, -12, 12),
        clamp(q('#spk8-vocal')?.value, -12, 12),
        clamp(q('#spk8-formant')?.value, -6, 6),
        true
      );
      showResult(result.blob, filename);
      setStatus('Riparazione anti-distortion finale completata. Ascolta il nuovo WAV e scaricalo se il risultato è migliore.');
    } catch (error) {
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
    const normalize = value => Number((Math.round(clamp(value, min, max) / step) * step).toFixed(2));
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
    if (mountedHost === host && q('#' + ROOT_ID)) {
      updateSource();
      return;
    }

    q('#' + ROOT_ID)?.remove();
    const root = document.createElement('section');
    root.id = ROOT_ID;
    root.dataset.engine = 'sonara-pitch-key-dsp-v8-anti-distortion';
    root.style.cssText = 'position:relative;z-index:30;width:100%;border-bottom:1px solid rgba(139,92,246,.24);background:linear-gradient(90deg,rgba(7,10,22,.99),rgba(17,9,35,.99),rgba(6,15,36,.99));color:#e5e7eb;font-family:system-ui';

    const storedKey = String(localStorage.getItem('sonara.studio.keySignature') || 'A Minor');
    const keys = ['C Major','C# Major','D Major','Eb Major','E Major','F Major','F# Major','G Major','Ab Major','A Major','Bb Major','B Major','C Minor','C# Minor','D Minor','Eb Minor','E Minor','F Minor','F# Minor','G Minor','Ab Minor','A Minor','Bb Minor','B Minor'];

    root.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 14px;border-bottom:1px solid rgba(255,255,255,.05);flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
          <strong style="font-size:10px;letter-spacing:.12em;color:#ddd6fe">PITCH & KEY PRO · DSP V8</strong>
          <span style="font-size:8px;color:#64748b">ANTI-DISTORSIONE AUTOMATICA · FILE ORIGINALE</span>
          <span style="font-size:7px;color:#6ee7b7;border:1px solid rgba(52,211,153,.22);border-radius:999px;padding:4px 6px">HEADROOM SAFE</span>
        </div>
        <label style="cursor:pointer;border:1px solid rgba(139,92,246,.45);border-radius:8px;padding:6px 9px;font-size:8px;font-weight:800;color:#ddd6fe;background:rgba(76,29,149,.14)">IMPORTA AUDIO<input id="spk8-file" type="file" accept="audio/*,.wav,.wave,.mp3,.flac,.ogg,.m4a,.aac,.webm" style="display:none"></label>
      </div>
      <div style="padding:10px 14px">
        <div id="spk8-local-source" style="margin-bottom:10px;padding:8px 10px;border:1px solid rgba(139,92,246,.25);border-radius:9px;font-size:9px;color:#c4b5fd">Nessun file audio selezionato</div>
        <div style="display:grid;grid-template-columns:minmax(160px,.8fr) repeat(3,minmax(190px,1fr));gap:12px;align-items:end;overflow-x:auto;padding-bottom:2px">
          <label style="display:block;font-size:9px;color:#cbd5e1">Tonalità target
            <select id="spk8-key" style="display:block;width:100%;margin-top:5px;background:#080d15;color:white;border:1px solid #273244;border-radius:8px;padding:8px;font-size:10px">
              <option value="">Mantieni tonalità</option>${keys.map(key => `<option value="${key}" ${key === storedKey ? 'selected' : ''}>${key}</option>`).join('')}
            </select>
          </label>
          ${controlMarkup('Pitch brano', 'spk8-track', -12, 12, 0.5, 'st')}
          ${controlMarkup('Pitch voce', 'spk8-vocal', -12, 12, 0.5, 'st')}
          ${controlMarkup('Formanti / timbro', 'spk8-formant', -6, 6, 0.5, 'st')}
        </div>
        <div style="margin-top:9px;padding:8px 10px;border:1px solid rgba(52,211,153,.18);border-radius:9px;background:rgba(6,78,59,.08);font-size:8px;color:#a7f3d0;line-height:1.5">ANTI-DISTORSIONE: headroom preventivo, rimozione DC, de-spike/de-clip e limiter trasparente vengono applicati automaticamente dopo Pitch brano, Pitch voce, Formanti e ancora sul master finale.</div>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-top:11px;flex-wrap:wrap">
          <button id="spk8-apply" style="border:0;border-radius:9px;padding:9px 13px;background:linear-gradient(90deg,#7c3aed,#6366f1,#2563eb);color:white;font-weight:900;font-size:9px">ELABORA + ANTI-DISTORSIONE</button>
        </div>
        <div id="spk8-status" style="margin-top:8px;font-size:9px;color:#c4b5fd">Importa il WAV o un altro file audio da modificare.</div>
        <div id="spk8-result" style="display:none;margin-top:12px;padding:12px;border:1px solid rgba(139,92,246,.32);border-radius:12px;background:rgba(15,11,31,.78)">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;flex-wrap:wrap">
            <div><div style="font-size:9px;font-weight:900;letter-spacing:.1em;color:#a78bfa">WAV ELABORATO · ANTI-DISTORSIONE</div><div id="spk8-result-name" style="margin-top:3px;font-size:10px;color:#e9d5ff;word-break:break-all"></div></div>
            <div style="display:flex;gap:7px;flex-wrap:wrap">
              <button id="spk8-repair" style="border:1px solid rgba(52,211,153,.38);border-radius:9px;padding:8px 10px;background:#0b1720;color:#a7f3d0;font-size:9px;font-weight:900">RIPARA DISTORSIONE</button>
              <button id="spk8-open" style="border:1px solid rgba(139,92,246,.4);border-radius:9px;padding:8px 10px;background:#111827;color:#ddd6fe;font-size:9px;font-weight:800">APRI WAV</button>
              <button id="spk8-save" style="border:0;border-radius:9px;padding:8px 11px;background:linear-gradient(90deg,#7c3aed,#4f46e5,#2563eb);color:white;font-size:9px;font-weight:900">SCARICA WAV</button>
            </div>
          </div>
          <audio id="spk8-audio" controls preload="metadata" style="width:100%"></audio>
        </div>
      </div>`;

    host.prepend(root);
    q('#spk8-file', root)?.addEventListener('change', event => {
      const file = Array.from(event.target?.files || []).find(isAudio);
      if (file) lock(file);
    });
    q('#spk8-apply', root)?.addEventListener('click', () => void apply());
    q('#spk8-repair', root)?.addEventListener('click', () => void repairAgain());
    q('#spk8-save', root)?.addEventListener('click', () => triggerDownload(lastResultUrl, lastResultName));
    q('#spk8-open', root)?.addEventListener('click', () => {
      if (lastResultUrl) window.open(lastResultUrl, '_blank', 'noopener,noreferrer');
    });
    bindNumericPair('spk8-track', -12, 12, 0.5);
    bindNumericPair('spk8-vocal', -12, 12, 0.5);
    bindNumericPair('spk8-formant', -6, 6, 0.5);
    mountedHost = host;
    updateSource();
  }

  document.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement) || input.type !== 'file' || input.id === 'spk8-file' || !input.files?.length) return;
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
  window.setInterval(mount, 1700);
  window.addEventListener('beforeunload', revokeResultUrl, { once: true });
})();
