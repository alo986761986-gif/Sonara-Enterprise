import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Edit3, Mic2, RotateCcw, Scissors, Sparkles, Volume2, X } from 'lucide-react';

type VoicePayload = {
  id?: string;
  name?: string;
  kind?: string;
  mode?: string;
  mimeType?: string;
  url?: string;
  previewUrl?: string;
  file?: File;
  blob?: Blob;
  detail?: string;
};

type VoiceSource = {
  id: string;
  name: string;
  file: File;
  previewUrl: string;
  duration: number;
  peaks: number[];
};

type AppliedClip = {
  id: string;
  name: string;
  file: File;
  previewUrl: string;
  duration: number;
};

const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);
const VOICE_CLIP_JOBS_KEY = 'sonara.creator.voiceClipStudioJobs.v1';
const PEAK_COUNT = 64;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(value: number) {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, '0')}`;
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    const raw = input instanceof Request ? input.url : String(input);
    return new URL(raw, window.location.href);
  } catch {
    return null;
  }
}

function appendFormValue(form: FormData, key: string, value: unknown) {
  if (value === undefined || value === null || value === '') return;
  form.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
}

function outputAudioUrl(data: any): string {
  const sources = [
    data?.audioUrl,
    data?.audio_url,
    data?.url,
    ...(Array.isArray(data?.outputs) ? data.outputs : []),
    ...(Array.isArray(data?.candidates) ? data.candidates : [])
  ];
  for (const value of sources) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (value && typeof value === 'object') {
      const found = value.audioUrl || value.audio_url || value.url || value.downloadUrl || value.download_url;
      if (typeof found === 'string' && found.trim()) return found.trim();
    }
  }
  return '';
}

function audioFormatFrom(value: string) {
  const match = value.split(/[?#]/)[0].match(/\.([a-zA-Z0-9]{2,5})$/);
  return match?.[1]?.toLowerCase() || 'wav';
}

function readJobIds() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(VOICE_CLIP_JOBS_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : []);
  } catch {
    return new Set<string>();
  }
}

function persistJobIds(ids: Set<string>) {
  try {
    window.localStorage.setItem(VOICE_CLIP_JOBS_KEY, JSON.stringify([...ids].slice(-40)));
  } catch {
    // Recovery is best effort only.
  }
}

async function decodeVoice(file: File): Promise<{ buffer: AudioBuffer; duration: number; peaks: number[] }> {
  const context = new AudioContext();
  try {
    const buffer = await context.decodeAudioData((await file.arrayBuffer()).slice(0));
    const channel = buffer.getChannelData(0);
    const peaks = Array.from({ length: PEAK_COUNT }, (_, index) => {
      const start = Math.floor(index * channel.length / PEAK_COUNT);
      const end = Math.max(start + 1, Math.floor((index + 1) * channel.length / PEAK_COUNT));
      let peak = 0;
      for (let cursor = start; cursor < end; cursor += 1) peak = Math.max(peak, Math.abs(channel[cursor] || 0));
      return peak;
    });
    const maxPeak = Math.max(0.001, ...peaks);
    return { buffer, duration: buffer.duration, peaks: peaks.map(value => value / maxPeak) };
  } finally {
    void context.close();
  }
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) view.setUint8(offset + index, value.charCodeAt(index));
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const channels = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const bytesPerSample = 2;
  const frameCount = buffer.length;
  const dataBytes = frameCount * channels * bytesPerSample;
  const result = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(result);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  const channelData = Array.from({ length: channels }, (_, channel) => buffer.getChannelData(channel));
  let offset = 44;
  for (let frame = 0; frame < frameCount; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = clamp(channelData[channel][frame] || 0, -1, 1);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }
  return new Blob([result], { type: 'audio/wav' });
}

async function renderEditedClip(
  file: File,
  start: number,
  end: number,
  gainDb: number,
  fadeIn: number,
  fadeOut: number,
  normalize: boolean
): Promise<{ file: File; duration: number }> {
  const context = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await context.decodeAudioData((await file.arrayBuffer()).slice(0));
  } finally {
    void context.close();
  }

  const safeStart = clamp(start, 0, Math.max(0, decoded.duration - 0.05));
  const safeEnd = clamp(end, safeStart + 0.05, decoded.duration);
  const duration = safeEnd - safeStart;
  const frameCount = Math.max(1, Math.ceil(duration * decoded.sampleRate));
  const offline = new OfflineAudioContext(decoded.numberOfChannels, frameCount, decoded.sampleRate);
  const source = offline.createBufferSource();
  const gain = offline.createGain();
  source.buffer = decoded;

  let normalizer = 1;
  if (normalize) {
    let sourcePeak = 0;
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const data = decoded.getChannelData(channel);
      const from = Math.floor(safeStart * decoded.sampleRate);
      const to = Math.min(data.length, Math.ceil(safeEnd * decoded.sampleRate));
      for (let index = from; index < to; index += 1) sourcePeak = Math.max(sourcePeak, Math.abs(data[index] || 0));
    }
    if (sourcePeak > 0.0001) normalizer = Math.min(6, 0.96 / sourcePeak);
  }

  const baseGain = Math.pow(10, gainDb / 20) * normalizer;
  const safeFadeIn = clamp(fadeIn, 0, duration / 2);
  const safeFadeOut = clamp(fadeOut, 0, duration / 2);
  gain.gain.cancelScheduledValues(0);
  if (safeFadeIn > 0) {
    gain.gain.setValueAtTime(0, 0);
    gain.gain.linearRampToValueAtTime(baseGain, safeFadeIn);
  } else {
    gain.gain.setValueAtTime(baseGain, 0);
  }
  if (safeFadeOut > 0) {
    gain.gain.setValueAtTime(baseGain, Math.max(safeFadeIn, duration - safeFadeOut));
    gain.gain.linearRampToValueAtTime(0, duration);
  }

  source.connect(gain);
  gain.connect(offline.destination);
  source.start(0, safeStart, duration);
  const rendered = await offline.startRendering();
  const wav = audioBufferToWav(rendered);
  return {
    file: new File([wav], `sonara-voice-clip-${Date.now()}.wav`, { type: 'audio/wav' }),
    duration
  };
}

export default function SonaraCreatorVoiceClipShelf() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [source, setSource] = useState<VoiceSource | null>(null);
  const [appliedClip, setAppliedClip] = useState<AppliedClip | null>(null);
  const [editing, setEditing] = useState(false);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [gainDb, setGainDb] = useState(0);
  const [fadeIn, setFadeIn] = useState(0.08);
  const [fadeOut, setFadeOut] = useState(0.08);
  const [normalize, setNormalize] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const ownUrlsRef = useRef<string[]>([]);
  const appliedClipRef = useRef<AppliedClip | null>(null);
  const jobIdsRef = useRef<Set<string>>(readJobIds());
  const captureTokenRef = useRef(0);

  useEffect(() => {
    const refreshHost = () => {
      const prompt = document.getElementById('sonara-prompt');
      const section = prompt?.closest('section');
      if (!prompt || !section) {
        setHost(null);
        return;
      }
      const promptBlock = (prompt.closest('[data-sonara-creator-block="prompt"]') || prompt.parentElement) as HTMLElement | null;
      if (!promptBlock) return;
      let target = promptBlock.querySelector(':scope > [data-sonara-voice-clip-host]') as HTMLElement | null;
      if (!target) {
        target = document.createElement('div');
        target.dataset.sonaraVoiceClipHost = 'true';
        promptBlock.appendChild(target);
      }
      setHost(current => current === target ? current : target);
    };

    refreshHost();
    const observer = new MutationObserver(refreshHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const importVoice = async (payload: VoicePayload) => {
    const token = ++captureTokenRef.current;
    let file = payload.file;
    let src = payload.previewUrl || payload.url || '';

    if (!file && payload.blob) {
      file = new File([payload.blob], `sonara-voice-${Date.now()}.webm`, { type: payload.mimeType || payload.blob.type || 'audio/webm' });
    }

    if (!file) {
      for (const wait of [20, 90, 220, 500]) {
        await new Promise(resolve => window.setTimeout(resolve, wait));
        if (token !== captureTokenRef.current) return;
        const audio = document.querySelector<HTMLAudioElement>('.sonara-audio-active audio, .sonara-audio-voice-preview audio');
        src = src || audio?.currentSrc || audio?.src || '';
        if (!src) continue;
        try {
          const response = await fetch(src);
          if (!response.ok) continue;
          const blob = await response.blob();
          file = new File([blob], `sonara-voice-${Date.now()}.webm`, { type: blob.type || payload.mimeType || 'audio/webm' });
          break;
        } catch {
          // Retry while the Voice modal finishes rendering its object URL.
        }
      }
    }

    if (!file || token !== captureTokenRef.current) return;
    setMessage('Analizzo la registrazione…');
    try {
      const analysis = await decodeVoice(file);
      const previewUrl = URL.createObjectURL(file);
      ownUrlsRef.current.push(previewUrl);
      const next: VoiceSource = {
        id: payload.id || `voice-${Date.now()}`,
        name: payload.name || 'La mia voce',
        file,
        previewUrl,
        duration: analysis.duration,
        peaks: analysis.peaks
      };
      setSource(next);
      setAppliedClip(null);
      appliedClipRef.current = null;
      setTrimStart(0);
      setTrimEnd(analysis.duration);
      setGainDb(0);
      setFadeIn(Math.min(0.08, analysis.duration / 4));
      setFadeOut(Math.min(0.08, analysis.duration / 4));
      setNormalize(true);
      setEditing(false);
      setMessage('Voce registrata e trasportata nel Prompt.');
    } catch (cause) {
      setMessage(cause instanceof Error ? `Impossibile aprire la registrazione: ${cause.message}` : 'Impossibile aprire la registrazione.');
    }
  };

  useEffect(() => {
    const onSelected = (event: Event) => {
      const payload = (event as CustomEvent<VoicePayload | null>).detail;
      if (!payload || payload.mode !== 'voice' || payload.kind !== 'voice') {
        if (payload === null || payload?.mode !== 'voice') {
          captureTokenRef.current += 1;
          setSource(null);
          setAppliedClip(null);
          appliedClipRef.current = null;
          setMessage('');
        }
        return;
      }
      void importVoice(payload);
    };
    window.addEventListener('sonara:creator-audio-selected', onSelected as EventListener);
    return () => window.removeEventListener('sonara:creator-audio-selected', onSelected as EventListener);
  }, []);

  useEffect(() => {
    appliedClipRef.current = appliedClip;
  }, [appliedClip]);

  useEffect(() => {
    const upstream = window.fetch.bind(window);
    const patchedFetch: typeof window.fetch = async (input, init) => {
      const clip = appliedClipRef.current;
      const url = requestUrl(input);
      const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();

      if (clip && url && method === 'POST' && GENERATE_PATHS.has(url.pathname)) {
        let body: Record<string, unknown> | null = null;
        try {
          if (typeof init?.body === 'string') body = JSON.parse(init.body);
          else if (input instanceof Request) body = await input.clone().json();
        } catch {
          body = null;
        }
        if (body && typeof body === 'object') {
          const form = new FormData();
          for (const [key, value] of Object.entries(body)) appendFormValue(form, key, value);
          form.set('influence', '0.82');
          form.set('referenceInfluence', '0.82');
          form.set('sonaraReferenceName', clip.name);
          form.set('sonaraReferenceKind', 'voice');
          form.set('reference_audio', clip.file, clip.file.name);

          const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
          headers.delete('content-type');
          headers.delete('content-length');
          const response = await upstream(new URL('/api/studio/voice', window.location.origin).toString(), {
            method: 'POST',
            headers,
            body: form,
            credentials: 'include',
            cache: 'no-store'
          });
          try {
            const payload = await response.clone().json();
            const jobId = String(payload?.jobId || '');
            if (response.ok && jobId) {
              jobIdsRef.current.add(jobId);
              persistJobIds(jobIdsRef.current);
              setMessage('Generazione avviata usando il clip vocale modificato.');
            }
          } catch {
            // Preserve the authoritative server response.
          }
          return response;
        }
      }

      if (url && method === 'GET') {
        const match = url.pathname.match(/^\/api\/music\/job\/([^/]+)$/);
        const jobId = match ? decodeURIComponent(match[1]) : '';
        if (jobId && jobIdsRef.current.has(jobId)) {
          const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined));
          const response = await upstream(new URL(`/api/studio/job/${encodeURIComponent(jobId)}`, window.location.origin).toString(), {
            method: 'GET',
            headers,
            credentials: 'include',
            cache: 'no-store'
          });
          if (!response.ok) return response;
          try {
            const data = await response.clone().json();
            const audioUrl = outputAudioUrl(data);
            const status = String(data?.status || 'PROCESSING').toUpperCase();
            const normalized = {
              ...data,
              status,
              progress: Number(data?.progress ?? (status === 'COMPLETED' ? 100 : 0)),
              audioUrl: audioUrl || data?.audioUrl || null,
              metadata: {
                ...(data?.metadata || {}),
                audioUrl: audioUrl || data?.metadata?.audioUrl || null,
                audioFormat: audioUrl ? audioFormatFrom(audioUrl) : (data?.metadata?.audioFormat || 'wav'),
                currentStage: status === 'COMPLETED' ? 'SONARA edited voice complete' : 'SONARA edited voice identity'
              }
            };
            if (status === 'COMPLETED' || status === 'FAILED') {
              jobIdsRef.current.delete(jobId);
              persistJobIds(jobIdsRef.current);
            }
            const responseHeaders = new Headers(response.headers);
            responseHeaders.set('content-type', 'application/json; charset=UTF-8');
            return new Response(JSON.stringify(normalized), {
              status: response.status,
              statusText: response.statusText,
              headers: responseHeaders
            });
          } catch {
            return response;
          }
        }
      }

      return upstream(input, init);
    };

    window.fetch = patchedFetch;
    return () => {
      if (window.fetch === patchedFetch) window.fetch = upstream;
    };
  }, []);

  useEffect(() => () => {
    captureTokenRef.current += 1;
    ownUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
  }, []);

  const currentPreview = appliedClip?.previewUrl || source?.previewUrl || '';
  const currentDuration = appliedClip?.duration || source?.duration || 0;
  const clipLength = useMemo(() => Math.max(0, trimEnd - trimStart), [trimEnd, trimStart]);

  const applyEdits = async () => {
    if (!source || busy || clipLength < 0.05) return;
    setBusy(true);
    setMessage('Creo il nuovo clip vocale…');
    try {
      const rendered = await renderEditedClip(source.file, trimStart, trimEnd, gainDb, fadeIn, fadeOut, normalize);
      const previewUrl = URL.createObjectURL(rendered.file);
      ownUrlsRef.current.push(previewUrl);
      const next: AppliedClip = {
        id: `voice-clip-${Date.now()}`,
        name: 'La mia voce · Clip modificato',
        file: rendered.file,
        previewUrl,
        duration: rendered.duration
      };
      appliedClipRef.current = next;
      setAppliedClip(next);
      setEditing(false);
      setMessage('Clip modificato: questo è ora il riferimento Voice Identity usato da Create.');
      const voiceButton = Array.from(document.querySelectorAll<HTMLButtonElement>('.sonara-creator-actions button'))
        .find(button => button.textContent?.trim().toLowerCase() === 'voice');
      if (voiceButton) {
        voiceButton.dataset.sonaraVoiceAttached = 'true';
        voiceButton.title = 'Clip vocale modificato collegato al Prompt';
      }
      window.dispatchEvent(new CustomEvent('sonara:creator-voice-clip-applied', {
        detail: { id: next.id, name: next.name, mode: 'voice', kind: 'voice', duration: next.duration }
      }));
    } catch (cause) {
      setMessage(cause instanceof Error ? `Modifica non riuscita: ${cause.message}` : 'Modifica del clip non riuscita.');
    } finally {
      setBusy(false);
    }
  };

  const restoreOriginal = () => {
    appliedClipRef.current = null;
    setAppliedClip(null);
    setEditing(false);
    setTrimStart(0);
    setTrimEnd(source?.duration || 0);
    setGainDb(0);
    setFadeIn(Math.min(0.08, (source?.duration || 0) / 4));
    setFadeOut(Math.min(0.08, (source?.duration || 0) / 4));
    setNormalize(true);
    setMessage('Ripristinata la registrazione originale.');
  };

  const removeVoice = () => {
    captureTokenRef.current += 1;
    appliedClipRef.current = null;
    setAppliedClip(null);
    setSource(null);
    setMessage('');
    window.dispatchEvent(new CustomEvent('sonara:creator-audio-selected', { detail: null }));
  };

  if (!host || !source) return null;

  return createPortal(
    <>
      <section className="sonara-voice-clip-shelf" aria-label="Voce registrata nel prompt">
        <div className="sonara-voice-clip-head">
          <div className="sonara-voice-clip-title">
            <span className="sonara-voice-clip-icon"><Mic2 /></span>
            <div><small>VOICE IDENTITY · COLLEGATA AL PROMPT</small><strong>Voce registrata</strong></div>
          </div>
          <div className="sonara-voice-clip-head-actions">
            {appliedClip && <span className="sonara-voice-clip-live"><Check />CLIP ATTIVO</span>}
            <button type="button" className="sonara-voice-clip-close" onClick={removeVoice} title="Rimuovi voce dal prompt"><X /></button>
          </div>
        </div>

        <div className="sonara-voice-wave" aria-label="Forma d'onda della registrazione">
          {source.peaks.map((peak, index) => <i key={index} style={{ height: `${Math.max(10, Math.round(peak * 100))}%` }} />)}
        </div>

        <audio className="sonara-voice-clip-player" controls preload="metadata" src={currentPreview} />

        <div className="sonara-voice-clip-meta">
          <span><Mic2 />{appliedClip ? 'Clip modificato' : source.name}</span>
          <span>{formatTime(currentDuration)}</span>
          <span>{appliedClip ? 'WAV · pronto per SONARA' : 'Registrazione originale'}</span>
        </div>

        <div className="sonara-voice-clip-actions">
          <button type="button" onClick={() => setEditing(value => !value)} aria-pressed={editing}><Edit3 />Modifica</button>
          <button type="button" className="sonara-voice-clip-primary" onClick={() => { setEditing(true); setMessage('Imposta Inizio/Fine e premi Applica clip.'); }}><Scissors />Crea clip</button>
          {appliedClip && <button type="button" onClick={restoreOriginal}><RotateCcw />Originale</button>}
        </div>

        {editing && (
          <div className="sonara-voice-editor">
            <div className="sonara-voice-editor-heading"><Sparkles /><div><strong>Editor clip vocale</strong><span>Taglia la parte migliore e rifinisci la voce prima di generare.</span></div></div>

            <div className="sonara-voice-trim-readout">
              <span>INIZIO <b>{formatTime(trimStart)}</b></span>
              <span>DURATA CLIP <b>{formatTime(clipLength)}</b></span>
              <span>FINE <b>{formatTime(trimEnd)}</b></span>
            </div>

            <label className="sonara-voice-control">
              <span>Taglia inizio</span>
              <input type="range" min="0" max={Math.max(0.1, source.duration - 0.05)} step="0.05" value={trimStart} onChange={event => setTrimStart(Math.min(Number(event.target.value), trimEnd - 0.05))} />
            </label>
            <label className="sonara-voice-control">
              <span>Taglia fine</span>
              <input type="range" min="0.05" max={Math.max(0.1, source.duration)} step="0.05" value={trimEnd} onChange={event => setTrimEnd(Math.max(Number(event.target.value), trimStart + 0.05))} />
            </label>
            <label className="sonara-voice-control">
              <span><Volume2 />Volume <b>{gainDb > 0 ? '+' : ''}{gainDb.toFixed(1)} dB</b></span>
              <input type="range" min="-12" max="9" step="0.5" value={gainDb} onChange={event => setGainDb(Number(event.target.value))} />
            </label>

            <div className="sonara-voice-editor-grid">
              <label><span>Fade in <b>{fadeIn.toFixed(2)}s</b></span><input type="range" min="0" max={Math.min(2, Math.max(0.1, clipLength / 2))} step="0.02" value={Math.min(fadeIn, clipLength / 2)} onChange={event => setFadeIn(Number(event.target.value))} /></label>
              <label><span>Fade out <b>{fadeOut.toFixed(2)}s</b></span><input type="range" min="0" max={Math.min(2, Math.max(0.1, clipLength / 2))} step="0.02" value={Math.min(fadeOut, clipLength / 2)} onChange={event => setFadeOut(Number(event.target.value))} /></label>
            </div>

            <label className="sonara-voice-normalize"><input type="checkbox" checked={normalize} onChange={event => setNormalize(event.target.checked)} /><span><strong>Normalizza voce</strong><small>Porta il livello a un volume pulito prima del Voice Identity.</small></span></label>

            <div className="sonara-voice-editor-footer">
              <button type="button" onClick={() => setEditing(false)}>Annulla</button>
              <button type="button" className="sonara-voice-clip-primary" disabled={busy || clipLength < 0.05} onClick={() => void applyEdits()}>{busy ? <span className="sonara-voice-busy" /> : <Scissors />}{busy ? 'Creo clip…' : 'Applica clip'}</button>
            </div>
          </div>
        )}

        {message && <div className="sonara-voice-clip-message">{message}</div>}
      </section>

      <style>{`
        .sonara-voice-clip-shelf{margin-top:14px;border:1px solid rgba(167,139,250,.22);border-radius:18px;padding:14px;background:linear-gradient(135deg,rgba(76,29,149,.14),rgba(30,41,59,.42) 44%,rgba(15,23,42,.62));box-shadow:inset 0 1px 0 rgba(255,255,255,.035),0 16px 44px rgba(2,6,23,.18);color:#e9e7ff}
        .sonara-voice-clip-head,.sonara-voice-clip-title,.sonara-voice-clip-head-actions,.sonara-voice-clip-actions,.sonara-voice-clip-meta,.sonara-voice-editor-heading,.sonara-voice-editor-footer{display:flex;align-items:center}
        .sonara-voice-clip-head{justify-content:space-between;gap:12px}.sonara-voice-clip-title{gap:10px}.sonara-voice-clip-title>div{display:flex;flex-direction:column;gap:2px}.sonara-voice-clip-title small{font-size:9px;font-weight:900;letter-spacing:.13em;color:#a78bfa}.sonara-voice-clip-title strong{font-size:14px;letter-spacing:-.015em;color:#f8fafc}
        .sonara-voice-clip-icon{width:34px;height:34px;border-radius:11px;display:grid;place-items:center;background:linear-gradient(135deg,rgba(124,58,237,.72),rgba(59,130,246,.56));box-shadow:0 8px 24px rgba(91,33,182,.24)}.sonara-voice-clip-icon svg{width:16px;height:16px}
        .sonara-voice-clip-head-actions{gap:8px}.sonara-voice-clip-live{display:flex;align-items:center;gap:5px;font-size:9px;font-weight:950;letter-spacing:.08em;color:#c4b5fd}.sonara-voice-clip-live svg{width:12px;height:12px}.sonara-voice-clip-close{width:30px;height:30px;border:0;border-radius:9px;background:rgba(255,255,255,.04);color:#94a3b8;display:grid;place-items:center;cursor:pointer}.sonara-voice-clip-close svg{width:14px;height:14px}
        .sonara-voice-wave{height:54px;margin:14px 0 10px;padding:8px 10px;border-radius:12px;background:rgba(2,6,23,.35);display:flex;align-items:center;gap:2px;overflow:hidden}.sonara-voice-wave i{display:block;flex:1;min-width:2px;max-width:5px;border-radius:999px;background:linear-gradient(180deg,#c4b5fd,#6366f1);opacity:.8}
        .sonara-voice-clip-player{width:100%;height:34px}.sonara-voice-clip-meta{justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:8px;color:#94a3b8;font-size:10px;font-weight:700}.sonara-voice-clip-meta span{display:flex;align-items:center;gap:5px}.sonara-voice-clip-meta svg{width:12px;height:12px;color:#a78bfa}
        .sonara-voice-clip-actions{gap:8px;margin-top:12px;flex-wrap:wrap}.sonara-voice-clip-actions button,.sonara-voice-editor-footer button{height:34px;padding:0 12px;border:1px solid rgba(148,163,184,.16);border-radius:10px;background:rgba(15,23,42,.55);color:#cbd5e1;font-size:10px;font-weight:900;display:inline-flex;align-items:center;justify-content:center;gap:6px;cursor:pointer}.sonara-voice-clip-actions button svg,.sonara-voice-editor-footer button svg{width:13px;height:13px}.sonara-voice-clip-actions button:hover,.sonara-voice-editor-footer button:hover{border-color:rgba(167,139,250,.42);color:#f8fafc}.sonara-voice-clip-primary{border-color:rgba(139,92,246,.48)!important;background:linear-gradient(135deg,rgba(124,58,237,.86),rgba(79,70,229,.82))!important;color:white!important;box-shadow:0 7px 22px rgba(91,33,182,.2)}
        .sonara-voice-editor{margin-top:14px;padding:14px;border-radius:14px;background:rgba(2,6,23,.38);border:1px solid rgba(148,163,184,.1)}.sonara-voice-editor-heading{gap:9px;margin-bottom:13px}.sonara-voice-editor-heading>svg{width:16px;height:16px;color:#c4b5fd}.sonara-voice-editor-heading>div{display:flex;flex-direction:column;gap:2px}.sonara-voice-editor-heading strong{font-size:12px;color:#f8fafc}.sonara-voice-editor-heading span{font-size:10px;color:#94a3b8}
        .sonara-voice-trim-readout{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:12px}.sonara-voice-trim-readout span{padding:8px;border-radius:9px;background:rgba(15,23,42,.66);font-size:8px;font-weight:900;letter-spacing:.08em;color:#64748b;text-align:center}.sonara-voice-trim-readout b{display:block;margin-top:3px;font-size:10px;letter-spacing:0;color:#ddd6fe}
        .sonara-voice-control{display:grid;grid-template-columns:110px 1fr;align-items:center;gap:10px;margin:9px 0}.sonara-voice-control>span,.sonara-voice-editor-grid span{font-size:10px;font-weight:800;color:#aeb9ca}.sonara-voice-control>span{display:flex;align-items:center;gap:5px}.sonara-voice-control svg{width:12px;height:12px}.sonara-voice-control input[type=range],.sonara-voice-editor-grid input[type=range]{width:100%;accent-color:#8b5cf6}
        .sonara-voice-editor-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:10px}.sonara-voice-editor-grid label{display:flex;flex-direction:column;gap:6px}.sonara-voice-normalize{display:flex;align-items:flex-start;gap:8px;margin-top:13px;padding:9px 10px;border-radius:10px;background:rgba(15,23,42,.5);cursor:pointer}.sonara-voice-normalize input{accent-color:#8b5cf6;margin-top:2px}.sonara-voice-normalize span{display:flex;flex-direction:column;gap:2px}.sonara-voice-normalize strong{font-size:10px;color:#e2e8f0}.sonara-voice-normalize small{font-size:9px;color:#64748b}
        .sonara-voice-editor-footer{justify-content:flex-end;gap:8px;margin-top:13px}.sonara-voice-editor-footer button:disabled{opacity:.55;cursor:not-allowed}.sonara-voice-busy{width:11px;height:11px;border-radius:50%;border:2px solid rgba(255,255,255,.4);border-top-color:white;animation:sonaraVoiceSpin .7s linear infinite}.sonara-voice-clip-message{margin-top:10px;font-size:9px;font-weight:800;color:#a5b4fc}
        @keyframes sonaraVoiceSpin{to{transform:rotate(360deg)}}
        @media(max-width:640px){.sonara-voice-trim-readout{grid-template-columns:1fr}.sonara-voice-control{grid-template-columns:1fr}.sonara-voice-editor-grid{grid-template-columns:1fr}.sonara-voice-clip-meta{display:grid;grid-template-columns:1fr 1fr}.sonara-voice-clip-actions button{flex:1}}
      `}</style>
    </>,
    host
  );
}
