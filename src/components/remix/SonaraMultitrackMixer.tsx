import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Layers3, LoaderCircle, Plus, Trash2, Volume2 } from 'lucide-react';

const MAX_TRACKS = 8;
const MAX_BYTES = 160 * 1024 * 1024;
const MAX_TOTAL_BYTES = 480 * 1024 * 1024;
const MAX_SECONDS = 600;
const SAMPLE_RATE = 44100;

type Track = {
  id: string;
  file: File;
  url: string;
  audio: AudioBuffer;
  volume: number;
  start: number;
  muted: boolean;
};

type Props = {
  onMixReady: (file: File) => void;
  onMixInvalidated: () => void;
};

function stamp(seconds: number) {
  const value = Math.max(0, Math.round(seconds));
  return Math.floor(value / 60) + ':' + String(value % 60).padStart(2, '0');
}

function encodeWav(buffer: AudioBuffer): File {
  const count = buffer.length;
  const size = count * 4;
  const array = new ArrayBuffer(44 + size);
  const data = new DataView(array);
  const ascii = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i++) data.setUint8(offset + i, value.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  data.setUint32(4, size + 36, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  data.setUint32(16, 16, true);
  data.setUint16(20, 1, true);
  data.setUint16(22, 2, true);
  data.setUint32(24, buffer.sampleRate, true);
  data.setUint32(28, buffer.sampleRate * 4, true);
  data.setUint16(32, 4, true);
  data.setUint16(34, 16, true);
  ascii(36, 'data');
  data.setUint32(40, size, true);

  const left = buffer.getChannelData(0);
  const right = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : left;
  let peak = 0;
  for (let i = 0; i < count; i++) {
    peak = Math.max(peak, Math.abs(left[i] || 0), Math.abs(right[i] || 0));
  }
  // A limiter-like peak reduction prevents overlap clipping without fake audio generation.
  const scale = peak > 0.98 ? 0.98 / peak : 1;
  let index = 44;
  for (let i = 0; i < count; i++) {
    for (const value of [left[i] || 0, right[i] || 0]) {
      const sample = Math.max(-1, Math.min(1, value * scale));
      data.setInt16(index, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
      index += 2;
    }
  }
  return new File([array], 'SONARA-MULTITRACK-' + Date.now() + '.wav', { type: 'audio/wav' });
}

async function renderMix(tracks: Track[]) {
  const active = tracks.filter(track => !track.muted && track.volume > 0);
  if (!active.length) throw new Error('Attiva almeno una traccia audio.');
  const seconds = Math.max(...active.map(track => track.start + track.audio.duration));
  if (seconds < 4) throw new Error('Il mix deve durare almeno 4 secondi.');
  if (seconds > MAX_SECONDS) throw new Error('Il mix supera 10 minuti. Riduci la durata o gli offset.');
  const offline = new OfflineAudioContext(2, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  for (const track of active) {
    const source = offline.createBufferSource();
    const volume = offline.createGain();
    const start = track.start;
    const fade = Math.min(0.015, track.audio.duration / 4);
    const level = track.volume / 100;
    source.buffer = track.audio;
    volume.gain.setValueAtTime(0, start);
    volume.gain.linearRampToValueAtTime(level, start + fade);
    volume.gain.setValueAtTime(level, start + track.audio.duration - fade);
    volume.gain.linearRampToValueAtTime(0, start + track.audio.duration);
    source.connect(volume);
    volume.connect(offline.destination);
    source.start(start);
  }
  return encodeWav(await offline.startRendering());
}

export default function SonaraMultitrackMixer({ onMixReady, onMixInvalidated }: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [busy, setBusy] = useState<'decode' | 'render' | null>(null);
  const [error, setError] = useState('');
  const [readyUrl, setReadyUrl] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);
  const urls = useRef<Set<string>>(new Set());
  const renderedUrl = useRef('');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      urls.current.forEach(url => URL.revokeObjectURL(url));
      urls.current.clear();
      if (renderedUrl.current) URL.revokeObjectURL(renderedUrl.current);
    };
  }, []);

  const bytes = useMemo(() => tracks.reduce((sum, track) => sum + track.file.size, 0), [tracks]);
  const duration = useMemo(() => tracks.length ? Math.max(...tracks.map(track => track.start + track.audio.duration)) : 0, [tracks]);

  const invalidate = () => {
    if (renderedUrl.current) URL.revokeObjectURL(renderedUrl.current);
    renderedUrl.current = '';
    setReadyUrl('');
    onMixInvalidated();
  };

  const addFiles = async (incoming: File[]) => {
    if (!incoming.length || busy) return;
    const available = MAX_TRACKS - tracks.length;
    if (available <= 0) { setError('Limite massimo: 8 tracce.'); return; }
    const picked = incoming.slice(0, available);
    const problems: string[] = incoming.length > available ? ['Alcuni file non sono stati aggiunti (massimo 8).'] : [];
    const accepted: Track[] = [];
    let currentBytes = bytes;
    let audioContext: AudioContext | null = null;
    setBusy('decode');
    setError('');
    try {
      audioContext = new AudioContext();
      for (const file of picked) {
        if (!file.type.startsWith('audio/') && !/\.(wav|mp3|flac|ogg|m4a|aac|webm)$/i.test(file.name)) {
          problems.push(file.name + ': formato non audio.'); continue;
        }
        if (file.size > MAX_BYTES || file.size + currentBytes > MAX_TOTAL_BYTES) {
          problems.push(file.name + ': limite 160 MB/file e 480 MB totali.'); continue;
        }
        try {
          const decoded = await audioContext.decodeAudioData(await file.arrayBuffer());
          if (decoded.duration < 0.1 || decoded.duration > MAX_SECONDS) {
            problems.push(file.name + ': durata non valida o superiore a 10 minuti.'); continue;
          }
          const url = URL.createObjectURL(file);
          urls.current.add(url);
          accepted.push({
            id: Date.now() + '-' + Math.random(), file, url, audio: decoded,
            volume: 100, start: 0, muted: false
          });
          currentBytes += file.size;
        } catch {
          problems.push(file.name + ': formato non decodificabile nel browser.');
        }
      }
    } catch {
      problems.push('Il decoder audio del browser non è disponibile.');
    } finally {
      if (audioContext) await audioContext.close().catch(() => undefined);
      if (mounted.current) setBusy(null);
    }
    if (!mounted.current) return;
    if (accepted.length) {
      invalidate();
      setTracks(previous => [...previous, ...accepted]);
    }
    if (problems.length) setError(problems.join(' '));
  };

  const change = (id: string, update: Partial<Pick<Track, 'volume' | 'start' | 'muted'>>) => {
    invalidate();
    setTracks(previous => previous.map(track => track.id === id ? { ...track, ...update } : track));
  };

  const remove = (id: string) => {
    invalidate();
    const track = tracks.find(item => item.id === id);
    if (track) { URL.revokeObjectURL(track.url); urls.current.delete(track.url); }
    setTracks(previous => previous.filter(item => item.id !== id));
  };

  const create = async () => {
    if (busy || !tracks.length) return;
    invalidate();
    setError('');
    setBusy('render');
    try {
      const file = await renderMix(tracks);
      if (!mounted.current) return;
      const url = URL.createObjectURL(file);
      renderedUrl.current = url;
      setReadyUrl(url);
      onMixReady(file);
    } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Mix non riuscito.');
    } finally {
      if (mounted.current) setBusy(null);
    }
  };

  return (
    <div className="sonara-remix-multitrack">
      <div className="sonara-multitrack-heading">
        <Layers3 />
        <div><strong>Multitrack Mixer</strong><small>Unisci fino a 8 brani in un vero mix stereo, poi crea il Remix AI.</small></div>
      </div>
      <div className="sonara-multitrack-drop"
        onDragOver={event => event.preventDefault()}
        onDrop={event => { event.preventDefault(); void addFiles(Array.from(event.dataTransfer.files)); }}>
        <input type="file" multiple ref={fileInput}
          accept="audio/*,.wav,.mp3,.flac,.m4a,.aac,.ogg,.webm"
          onChange={event => { void addFiles(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ''; }} />
        <button type="button" disabled={busy !== null || tracks.length >= MAX_TRACKS}
          onClick={() => fileInput.current?.click()}><Plus /> Aggiungi file audio</button>
        <small>Trascina più file qui · {tracks.length} di 8 tracce · WAV, MP3, FLAC, M4A, OGG</small>
      </div>
      <div className="sonara-multitrack-tracks">
        {tracks.map((track, index) => (
          <div className="sonara-multitrack-track" key={track.id}>
            <div className="sonara-multitrack-track-head">
              <strong>{index + 1}. {track.file.name}</strong>
              <span>{stamp(track.audio.duration)}</span>
              <button type="button" disabled={busy !== null} title="Rimuovi"
                aria-label={'Rimuovi ' + track.file.name} onClick={() => remove(track.id)}><Trash2 /></button>
            </div>
            <audio controls preload="none" src={track.url} />
            <div className="sonara-multitrack-controls">
              <label className="sonara-multitrack-volume"><Volume2 /> Volume {track.volume}%
                <input type="range" min="0" max="150" step="1" value={track.volume}
                  disabled={busy !== null} onChange={event => change(track.id, { volume: Number(event.target.value) })} />
              </label>
              <label>Inizio (secondi)
                <input type="number" min="0" max="599" step="0.1" value={track.start}
                  disabled={busy !== null} onChange={event => change(track.id, { start: Math.min(599, Math.max(0, Number(event.target.value) || 0)) })} />
              </label>
              <button type="button" data-muted={track.muted} disabled={busy !== null}
                onClick={() => change(track.id, { muted: !track.muted })}>{track.muted ? 'Riattiva' : 'Mute'}</button>
            </div>
          </div>
        ))}
      </div>
      <div className="sonara-multitrack-summary"><span>Durata: <strong>{stamp(duration)}</strong></span><span>Dimensioni: <strong>{Math.round(bytes / 1024 / 1024)} MB</strong></span></div>
      <p className="sonara-multitrack-hint">Regola volume e posizione di ogni file sulla timeline. L'allineamento BPM è manuale. Per includere l'audio di un video YouTube devi caricare un file originale/autorizzato: il link YouTube è solo una reference.</p>
      {error && <p className="sonara-multitrack-error" role="alert">{error}</p>}
      <button type="button" className="sonara-multitrack-render" disabled={busy !== null || !tracks.length}
        onClick={() => void create()}>
        {busy ? <LoaderCircle className="sonara-multitrack-spinner" /> : <Layers3 />}
        {busy === 'decode' ? 'Analisi file…' : busy === 'render' ? 'Creazione del mix reale…' : 'Crea mix WAV e prepara Remix AI'}
      </button>
      {readyUrl && <div className="sonara-multitrack-ready">
        <strong>Mix pronto. Ascoltalo, scaricalo o premi Create Remix per generare con ACE-Step.</strong>
        <audio controls src={readyUrl} />
        <a href={readyUrl} download="SONARA-MULTITRACK-MIX.wav"><Download /> Scarica mix WAV</a>
      </div>}
      <style>{\`
        .sonara-remix-multitrack{margin:12px 16px 16px;padding:14px;border:1px solid rgba(167,139,250,.19);border-radius:13px;background:#0b0b11;color:#e8e8ed}
        .sonara-remix-multitrack button,.sonara-remix-multitrack input{font:inherit}
        .sonara-multitrack-heading{display:flex;align-items:center;gap:10px;margin-bottom:13px}
        .sonara-multitrack-heading>svg{width:22px;height:22px;color:#a78bfa}
        .sonara-multitrack-heading strong{display:block;font-size:12px;font-weight:800}
        .sonara-multitrack-heading small{display:block;margin-top:3px;color:#9999a7;font-size:10px;line-height:1.4}
        .sonara-multitrack-drop{padding:15px 10px;display:flex;flex-direction:column;align-items:center;gap:8px;border:1px dashed rgba(167,139,250,.3);border-radius:11px;background:#12111b}
        .sonara-multitrack-drop input{display:none}
        .sonara-multitrack-drop>button{min-height:36px;padding:7px 12px;display:flex;align-items:center;gap:7px;border:1px solid rgba(167,139,250,.25);border-radius:8px;background:#272038;color:#e9dcff;font-size:11px;font-weight:800;cursor:pointer}
        .sonara-multitrack-drop>button svg,.sonara-multitrack-render svg,.sonara-multitrack-ready a svg{width:15px;height:15px}
        .sonara-multitrack-drop>small{color:#9999a7;font-size:9px;text-align:center}
        .sonara-multitrack-tracks{display:grid;gap:10px;margin-top:12px;max-height:490px;overflow:auto}
        .sonara-multitrack-track{padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#14141c}
        .sonara-multitrack-track-head{display:flex;align-items:center;gap:9px;min-width:0}
        .sonara-multitrack-track-head strong{flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}
        .sonara-multitrack-track-head span{color:#a7a7b2;font-size:9px}
        .sonara-multitrack-track-head button{height:27px;width:27px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.08);border-radius:7px;background:#24202a;color:#e8bdcd;cursor:pointer}
        .sonara-multitrack-track-head button svg{width:13px}
        .sonara-multitrack-track audio{width:100%;height:30px;margin:8px 0}
        .sonara-multitrack-controls{display:grid;grid-template-columns:minmax(0,1fr) 105px 60px;align-items:end;gap:9px}
        .sonara-multitrack-controls label{display:flex;flex-direction:column;gap:6px;color:#9999a7;font-size:9px;min-width:0}
        .sonara-multitrack-controls label svg{width:12px;height:12px;display:inline}
        .sonara-multitrack-controls input[type=range]{width:100%;accent-color:#a78bfa}
        .sonara-multitrack-controls input[type=number]{width:100%;height:30px;padding:4px 6px;border:1px solid rgba(255,255,255,.1);border-radius:6px;background:#0b0b12;color:#fff;font-size:10px}
        .sonara-multitrack-controls>button{height:30px;border:1px solid rgba(255,255,255,.12);border-radius:7px;background:#24232f;color:#ccc8e3;font-size:9px;cursor:pointer}
        .sonara-multitrack-controls>button[data-muted=true]{background:#5f293a;color:#fff}
        .sonara-multitrack-summary{display:flex;justify-content:space-between;gap:10px;margin-top:13px;color:#9999a7;font-size:10px}
        .sonara-multitrack-summary strong{color:#e8e8ef}
        .sonara-multitrack-hint{color:#9292a0;font-size:10px;line-height:1.55;margin:10px 0}
        .sonara-multitrack-error{color:#fca5a5;font-size:10px;line-height:1.55}
        .sonara-multitrack-render{width:100%;min-height:44px;display:flex;align-items:center;justify-content:center;gap:8px;border:1px solid rgba(196,181,253,.27);border-radius:9px;background:linear-gradient(100deg,#6d28d9,#4338ca);color:#fff;font-size:11px;font-weight:800;cursor:pointer}
        .sonara-multitrack-render:disabled,.sonara-multitrack-drop>button:disabled{opacity:.45;cursor:not-allowed}
        .sonara-multitrack-ready{display:grid;gap:9px;margin-top:12px;padding:11px;border:1px solid rgba(52,211,153,.24);border-radius:10px;background:rgba(5,150,105,.05)}
        .sonara-multitrack-ready strong{font-size:10px;line-height:1.45}
        .sonara-multitrack-ready audio{width:100%}
        .sonara-multitrack-ready a{display:flex;align-items:center;justify-content:center;gap:7px;padding:9px;border:1px solid rgba(52,211,153,.17);border-radius:7px;background:rgba(5,150,105,.12);color:#b8f7d9;text-decoration:none;font-size:10px;font-weight:800}
        .sonara-multitrack-spinner{animation:sonara-multitrack-spin .8s linear infinite}
        @keyframes sonara-multitrack-spin{to{transform:rotate(360deg)}}
        @media(max-width:640px){.sonara-multitrack-controls{grid-template-columns:minmax(0,1fr) 95px}.sonara-multitrack-controls>button{grid-column:1/-1}}
      \`}</style>
    </div>
  );
}
