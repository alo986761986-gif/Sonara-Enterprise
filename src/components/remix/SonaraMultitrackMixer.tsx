import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Layers3, LoaderCircle, Plus, Trash2, Volume2, ArrowUp, ArrowDown } from 'lucide-react';
import { planDjArrangement } from './djArrangement';

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
  cue: number;
  take: number;
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

async function renderMix(tracks: Track[], mode: 'dj' | 'layers', transitionSeconds: number) {
  const active = tracks.filter(track => !track.muted && track.volume > 0);
  if (!active.length) throw new Error('Attiva almeno una traccia audio.');
  if (mode === 'dj') {
    const plan = planDjArrangement(active.map(track => ({
      id: track.id, duration: track.audio.duration, cue: track.cue,
      take: track.take, volume: track.volume, muted: track.muted
    })), transitionSeconds, MAX_SECONDS);
    const offline = new OfflineAudioContext(2, Math.ceil(plan.totalSeconds * SAMPLE_RATE), SAMPLE_RATE);
    for (const segment of plan.segments) {
      const track = active.find(item => item.id === segment.id);
      if (!track) continue;
      const source = offline.createBufferSource();
      source.buffer = track.audio;
      const volume = offline.createGain();
      const filter = offline.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 20000;
      const gain = track.volume / 100;
      const at = segment.timelineStart;
      const end = segment.timelineEnd;
      // Equal-power crossfades with short, softened edge for a musical blend.
      // Equal-power endpoints prevent level collapse; no whole-track overlap.
      volume.gain.setValueAtTime(segment.fadeIn ? 0.0001 : gain, at);
      if (segment.fadeIn) {
        const frames = 24;
        for (let i = 1; i <= frames; i++) {
          const f = i / frames;
          volume.gain.linearRampToValueAtTime(gain * Math.sin(f * Math.PI / 2), at + f * segment.fadeIn);
          // Progressive high-end entry reduces simultaneous hi-hat clashes.
          filter.frequency.setValueAtTime(900 + 19100 * f * f, at + f * segment.fadeIn);
        }
      }
      if (segment.fadeOut) {
        const fadeStart = end - segment.fadeOut;
        volume.gain.setValueAtTime(gain, fadeStart);
        const frames = 24;
        for (let i = 1; i <= frames; i++) {
          const f = i / frames;
          volume.gain.linearRampToValueAtTime(Math.max(0.0001, gain * Math.cos(f * Math.PI / 2)), fadeStart + f * segment.fadeOut);
          filter.frequency.setValueAtTime(20000 - 19100 * f * f, fadeStart + f * segment.fadeOut);
        }
      } else {
        volume.gain.setValueAtTime(gain, Math.max(at, end - 0.02));
        volume.gain.linearRampToValueAtTime(0, end);
      }
      source.connect(filter);
      filter.connect(volume);
      volume.connect(offline.destination);
      source.start(at, segment.sourceStart, segment.sourceDuration);
    }
    return encodeWav(await offline.startRendering());
  }

  // Legacy layering remains opt-in for stems, drums and instrument tracks.
  const seconds = Math.max(...active.map(track => track.start + track.audio.duration));
  if (seconds < 4 || seconds > MAX_SECONDS) throw new Error('Durata mix non valida (4-600 secondi).');
  const offline = new OfflineAudioContext(2, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  for (const track of active) {
    const source = offline.createBufferSource();
    const volume = offline.createGain();
    const at = track.start;
    const fade = Math.min(0.015, track.audio.duration / 4);
    const level = track.volume / 100;
    source.buffer = track.audio;
    volume.gain.setValueAtTime(0, at);
    volume.gain.linearRampToValueAtTime(level, at + fade);
    volume.gain.setValueAtTime(level, at + track.audio.duration - fade);
    volume.gain.linearRampToValueAtTime(0, at + track.audio.duration);
    source.connect(volume);
    volume.connect(offline.destination);
    source.start(at);
  }
  return encodeWav(await offline.startRendering());
}

export default function SonaraMultitrackMixer({ onMixReady, onMixInvalidated }: Props) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [mode, setMode] = useState<'dj' | 'layers'>('dj');
  const [transitionSeconds, setTransitionSeconds] = useState(8);
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
  const duration = useMemo(() => {
    if (!tracks.length) return 0;
    if (mode === 'layers') return Math.max(...tracks.map(track => track.start + track.audio.duration));
    try { return planDjArrangement(tracks.map(track => ({ id: track.id, duration: track.audio.duration, cue: track.cue, take: track.take, volume: track.volume, muted: track.muted })), transitionSeconds).totalSeconds; }
    catch { return 0; }
  }, [tracks, mode, transitionSeconds]);

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
            volume: 100, start: 0, cue: 0, take: Math.min(decoded.duration, 64), muted: false
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

  const change = (id: string, update: Partial<Pick<Track, 'volume' | 'start' | 'cue' | 'take' | 'muted'>>) => {
    invalidate();
    setTracks(previous => previous.map(track => track.id === id ? { ...track, ...update } : track));
  };

  const remove = (id: string) => {
    invalidate();
    const track = tracks.find(item => item.id === id);
    if (track) { URL.revokeObjectURL(track.url); urls.current.delete(track.url); }
    setTracks(previous => previous.filter(item => item.id !== id));
  };

  const move = (id: string, direction: number) => {
    invalidate();
    setTracks(previous => {
      const next = [...previous];
      const index = next.findIndex(track => track.id === id);
      const target = index + direction;
      if (index >= 0 && target >= 0 && target < next.length) [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const create = async () => {
    if (busy || !tracks.length) return;
    invalidate();
    setError('');
    setBusy('render');
    try {
      const file = await renderMix(tracks, mode, transitionSeconds);
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
        <div><strong>SONARA DJ Mix & Remix</strong><small>Modalità DJ: brani in sequenza e transizioni musicali, non sovrapposti integralmente.</small></div>
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
      <div className="sonara-multitrack-modes">
        <button type="button" data-active={mode === 'dj'} disabled={busy !== null} onClick={() => { invalidate(); setMode('dj'); }}>DJ Mix automatico</button>
        <button type="button" data-active={mode === 'layers'} disabled={busy !== null} onClick={() => { invalidate(); setMode('layers'); }}>Sovrapponi tracce / stems</button>
      </div>
      {mode === 'dj' && <label className="sonara-multitrack-transition">Durata transizione: <strong>{transitionSeconds} secondi</strong>
        <input type="range" min="2" max="24" step="1" value={transitionSeconds} disabled={busy !== null} onChange={event => { invalidate(); setTransitionSeconds(Number(event.target.value)); }} />
      </label>}
      <div className="sonara-multitrack-tracks">
        {tracks.map((track, index) => (
          <div className="sonara-multitrack-track" key={track.id}>
            <div className="sonara-multitrack-track-head">
              <strong>{index + 1}. {track.file.name}</strong>
              <span>{stamp(track.audio.duration)}</span>
              {mode === 'dj' && <><button type="button" disabled={busy !== null || index === 0} title="Sposta prima" onClick={() => move(track.id, -1)}><ArrowUp /></button><button type="button" disabled={busy !== null || index === tracks.length - 1} title="Sposta dopo" onClick={() => move(track.id, 1)}><ArrowDown /></button></>}
              <button type="button" disabled={busy !== null} title="Rimuovi"
                aria-label={'Rimuovi ' + track.file.name} onClick={() => remove(track.id)}><Trash2 /></button>
            </div>
            <audio controls preload="none" src={track.url} />
            <div className="sonara-multitrack-controls">
              <label className="sonara-multitrack-volume"><Volume2 /> Volume {track.volume}%
                <input type="range" min="0" max="150" step="1" value={track.volume}
                  disabled={busy !== null} onChange={event => change(track.id, { volume: Number(event.target.value) })} />
              </label>
              {mode === 'layers' ? <label>Inizio (secondi)
                <input type="number" min="0" max="599" step="0.1" value={track.start}
                  disabled={busy !== null} onChange={event => change(track.id, { start: Math.min(599, Math.max(0, Number(event.target.value) || 0)) })} />
              </label> : <><label>Punto ingresso (s)
                <input type="number" min="0" max={Math.max(0, track.audio.duration - 4)} step="0.5" value={track.cue}
                  disabled={busy !== null} onChange={event => { const cue = Math.max(0, Math.min(track.audio.duration - 4, Number(event.target.value) || 0)); change(track.id, { cue, take: Math.min(track.take, track.audio.duration - cue) }); }} />
              </label><label>Segmento (s)
                <input type="number" min="4" max={Math.max(4, Math.min(180, track.audio.duration - track.cue))} step="1" value={Math.round(track.take)}
                  disabled={busy !== null} onChange={event => change(track.id, { take: Math.max(4, Math.min(180, track.audio.duration - track.cue, Number(event.target.value) || 4)) })} />
              </label></>}
              <button type="button" data-muted={track.muted} disabled={busy !== null}
                onClick={() => change(track.id, { muted: !track.muted })}>{track.muted ? 'Riattiva' : 'Mute'}</button>
            </div>
          </div>
        ))}
      </div>
      <div className="sonara-multitrack-summary"><span>Durata: <strong>{stamp(duration)}</strong></span><span>Dimensioni: <strong>{Math.round(bytes / 1024 / 1024)} MB</strong></span></div>
      <p className="sonara-multitrack-hint">In modalità DJ i brani suonano in sequenza, con incroci brevi e dissolvenze equal-power. Non avviene ancora una sincronizzazione BPM o una separazione delle voci: per brani a tempi molto diversi possono restare stacchi ritmici. Usa solo file che puoi utilizzare legittimamente; i link YouTube sono reference.</p>
      {error && <p className="sonara-multitrack-error" role="alert">{error}</p>}
      <button type="button" className="sonara-multitrack-render" disabled={busy !== null || !tracks.length}
        onClick={() => void create()}>
        {busy ? <LoaderCircle className="sonara-multitrack-spinner" /> : <Layers3 />}
        {busy === 'decode' ? 'Analisi file…' : busy === 'render' ? 'Creazione del mix reale…' : 'Crea DJ Mix completo e prepara Remix AI'}
      </button>
      {readyUrl && <div className="sonara-multitrack-ready">
        <strong>Mix pronto. Ascoltalo, scaricalo o premi Create Remix per generare con ACE-Step.</strong>
        <audio controls src={readyUrl} />
        <a href={readyUrl} download="SONARA-MULTITRACK-MIX.wav"><Download /> Scarica mix WAV</a>
      </div>}
      <style>{`
        .sonara-remix-multitrack{margin:12px 16px 16px;padding:14px;border:1px solid rgba(167,139,250,.19);border-radius:13px;background:#0b0b11;color:#e8e8ed}
        .sonara-remix-multitrack button,.sonara-remix-multitrack input{font:inherit}
        .sonara-multitrack-heading{display:flex;align-items:center;gap:10px;margin-bottom:13px}
        .sonara-multitrack-heading>svg{width:22px;height:22px;color:#a78bfa}
        .sonara-multitrack-heading strong{display:block;font-size:12px;font-weight:800}
        .sonara-multitrack-heading small{display:block;margin-top:3px;color:#9999a7;font-size:10px;line-height:1.4}
        .sonara-multitrack-modes{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.sonara-multitrack-modes button{min-height:39px;padding:7px;border:1px solid rgba(167,139,250,.18);border-radius:8px;background:#14141d;color:#b8b5c5;font-size:10px;cursor:pointer}.sonara-multitrack-modes button[data-active=true]{background:#4c1d95;color:#fff;border-color:#a78bfa}.sonara-multitrack-transition{display:grid;gap:8px;margin-top:12px;font-size:10px;color:#c4b5fd}.sonara-multitrack-transition input{width:100%;accent-color:#8b5cf6}
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
        .sonara-multitrack-controls{display:flex;flex-wrap:wrap;align-items:end;gap:9px}.sonara-multitrack-controls .sonara-multitrack-volume{flex:1 1 125px}.sonara-multitrack-controls>label:not(.sonara-multitrack-volume){flex:0 1 105px}.sonara-multitrack-controls>button{min-width:60px}
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
      `}</style>
    </div>
  );
}
