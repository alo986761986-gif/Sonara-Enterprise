import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioWaveform,
  Check,
  Download,
  Library,
  LoaderCircle,
  Music2,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  UploadCloud,
  WandSparkles,
  X
} from 'lucide-react';
import {
  GENERATED_ASSET_EVENT,
  listGeneratedProjects,
  type GeneratedProjectArchive,
  type StoredGeneratedAsset
} from '../../services/generatedAssetVault';

const API_ORIGIN = 'https://api.sonaraenterprise.com';
const MIN_SEGMENT_SECONDS = 4;
const MAX_REMIX_SECONDS = 600;
const WAVE_BARS = 148;

type SourceTrack = {
  id: string;
  name: string;
  url: string;
  file?: File;
  bpm?: number;
  key?: string;
  durationSec?: number;
};

type RemixOutput = {
  id: string;
  label: string;
  audioUrl: string;
  quality?: {
    qualityScore?: number;
    bpmPassed?: boolean;
    detectedBpm?: number;
  } | null;
};

type StudioJob = {
  jobId?: string;
  status?: string;
  progress?: number;
  error?: string;
  outputs?: RemixOutput[];
};

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds)) return '0:00';
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

function safeFileName(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9-_ ]+/g, '')
    .trim()
    .replace(/\s+/g, '-') || 'sonara-remix';
}

function audioAsset(project: GeneratedProjectArchive): StoredGeneratedAsset | null {
  return project.assets.find(asset => asset.kind === 'audio' && (asset.blob || asset.remoteUrl)) || null;
}

function readSelectedTrack(): SourceTrack | null {
  try {
    const value = JSON.parse(window.localStorage.getItem('sonara.selectedGeneratedTrack') || 'null');
    if (!value?.audioUrl) return null;
    return {
      id: value.jobId || value.variationId || `selected-${Date.now()}`,
      name: value.title || (value.variationId ? `SONARA MASTER ${value.variationId}` : 'SONARA selected track'),
      url: value.audioUrl,
      durationSec: Number(value.durationSec || 0) || undefined
    };
  } catch {
    return null;
  }
}

function buildWaveform(buffer: AudioBuffer) {
  const source = buffer.getChannelData(0);
  const step = Math.max(1, Math.floor(source.length / WAVE_BARS));
  const values: number[] = [];
  let max = 0;
  for (let index = 0; index < WAVE_BARS; index += 1) {
    const start = index * step;
    const end = Math.min(source.length, start + step);
    let peak = 0;
    for (let cursor = start; cursor < end; cursor += Math.max(1, Math.floor(step / 90))) {
      peak = Math.max(peak, Math.abs(source[cursor] || 0));
    }
    max = Math.max(max, peak);
    values.push(peak);
  }
  const normalization = max > 0 ? max : 1;
  return values.map(value => Math.max(0.08, value / normalization));
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

function segmentToWav(buffer: AudioBuffer, startSec: number, endSec: number, fileName: string) {
  const channels = Math.max(1, Math.min(2, buffer.numberOfChannels));
  const sampleRate = buffer.sampleRate;
  const startFrame = clamp(Math.floor(startSec * sampleRate), 0, buffer.length - 1);
  const endFrame = clamp(Math.ceil(endSec * sampleRate), startFrame + 1, buffer.length);
  const frameCount = endFrame - startFrame;
  const bytesPerSample = 2;
  const dataSize = frameCount * channels * bytesPerSample;
  const wav = new ArrayBuffer(44 + dataSize);
  const view = new DataView(wav);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channels * bytesPerSample, true);
  view.setUint16(32, channels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  const channelData = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index));
  let offset = 44;
  for (let frame = startFrame; frame < endFrame; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      const sample = clamp(channelData[channel][frame] || 0, -1, 1);
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      offset += 2;
    }
  }

  return new File([wav], fileName, { type: 'audio/wav', lastModified: Date.now() });
}

export default function SonaraRemixSection() {
  const [open, setOpen] = useState(false);
  const [libraryTracks, setLibraryTracks] = useState<SourceTrack[]>([]);
  const [source, setSource] = useState<SourceTrack | null>(readSelectedTrack);
  const [sourceTab, setSourceTab] = useState<'library' | 'upload'>('library');
  const [duration, setDuration] = useState(0);
  const [segmentStart, setSegmentStart] = useState(0);
  const [segmentEnd, setSegmentEnd] = useState(30);
  const [waveform, setWaveform] = useState<number[]>(Array.from({ length: WAVE_BARS }, () => 0.12));
  const [decoding, setDecoding] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [prompt, setPrompt] = useState('Reimagine this track with a polished modern production while preserving its strongest musical identity, groove and emotional character.');
  const [variance, setVariance] = useState(34);
  const [styleInfluence, setStyleInfluence] = useState(72);
  const [lyricsMode, setLyricsMode] = useState<'auto' | 'custom' | 'instrumental'>('auto');
  const [lyrics, setLyrics] = useState('');
  const [bpm, setBpm] = useState(124);
  const [musicalKey, setMusicalKey] = useState('');
  const [outputCount, setOutputCount] = useState<1 | 2>(2);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<number[]>([]);
  const [outputs, setOutputs] = useState<RemixOutput[]>([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const uploadRef = useRef<HTMLInputElement | null>(null);
  const playerRef = useRef<HTMLAudioElement | null>(null);
  const decodedBufferRef = useRef<AudioBuffer | null>(null);
  const localObjectUrlRef = useRef<string>('');
  const libraryObjectUrlsRef = useRef<string[]>([]);
  const generationTokenRef = useRef(0);

  const segmentLength = Math.max(0, segmentEnd - segmentStart);
  const preserveStrength = useMemo(() => clamp(0.95 - (variance / 100) * 0.7, 0.2, 0.95), [variance]);
  const remixNoise = useMemo(() => clamp(0.04 + (variance / 100) * 0.24 + (styleInfluence / 100) * 0.06, 0.04, 0.36), [variance, styleInfluence]);
  const selectionLeft = duration > 0 ? clamp((segmentStart / duration) * 100, 0, 100) : 0;
  const selectionWidth = duration > 0 ? clamp((segmentLength / duration) * 100, 0, 100) : 100;

  const refreshLibrary = async () => {
    libraryObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    libraryObjectUrlsRef.current = [];
    try {
      const projects = await listGeneratedProjects();
      const tracks: SourceTrack[] = [];
      for (const project of projects.slice(0, 30)) {
        const asset = audioAsset(project);
        if (!asset) continue;
        let url = asset.remoteUrl || '';
        if (!url && asset.blob) {
          url = URL.createObjectURL(asset.blob);
          libraryObjectUrlsRef.current.push(url);
        }
        if (!url) continue;
        tracks.push({
          id: `${project.id}-${asset.id}`,
          name: project.title || asset.name || asset.label || 'SONARA track',
          url,
          bpm: project.bpm,
          key: project.keySignature,
          durationSec: project.durationSec
        });
        if (tracks.length >= 12) break;
      }
      const selected = readSelectedTrack();
      if (selected && !tracks.some(track => track.url === selected.url)) tracks.unshift(selected);
      setLibraryTracks(tracks.slice(0, 12));
    } catch {
      const selected = readSelectedTrack();
      setLibraryTracks(selected ? [selected] : []);
    }
  };

  useEffect(() => {
    void refreshLibrary();
    const handler = () => void refreshLibrary();
    window.addEventListener(GENERATED_ASSET_EVENT, handler);
    window.addEventListener('sonara:generated-track-selected', handler);
    return () => {
      window.removeEventListener(GENERATED_ASSET_EVENT, handler);
      window.removeEventListener('sonara:generated-track-selected', handler);
      libraryObjectUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  useEffect(() => {
    const openRemix = () => setOpen(true);
    window.addEventListener('sonara:open-remix', openRemix);

    const installEntryPoints = () => {
      const nav = document.querySelector('.sonara-violet-nav-links');
      if (nav && !nav.querySelector('[data-sonara-remix-entry="nav"]')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.sonaraRemixEntry = 'nav';
        button.innerHTML = '<span aria-hidden="true" style="font-size:15px">↻</span><span>Remix</span>';
        button.addEventListener('click', openRemix);
        const library = Array.from(nav.querySelectorAll('button')).find(item => item.textContent?.trim().toLowerCase().includes('library'));
        nav.insertBefore(button, library || null);
      }

      const quick = document.querySelector('.sonara-violet-quick-actions');
      if (quick && !quick.querySelector('[data-sonara-remix-entry="quick"]')) {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.sonaraRemixEntry = 'quick';
        button.innerHTML = '<span style="font-size:22px;line-height:1" aria-hidden="true">↻</span><span><strong>Remix</strong><small>Reimmagina un brano</small></span>';
        button.addEventListener('click', openRemix);
        quick.appendChild(button);
      }
    };

    installEntryPoints();
    const observer = new MutationObserver(installEntryPoints);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('sonara:open-remix', openRemix);
      document.querySelectorAll('[data-sonara-remix-entry]').forEach(node => node.remove());
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    document.body.dataset.sonaraRemixOpen = 'true';
    void refreshLibrary();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      delete document.body.dataset.sonaraRemixOpen;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!source?.url) {
      decodedBufferRef.current = null;
      setDuration(0);
      setWaveform(Array.from({ length: WAVE_BARS }, () => 0.12));
      return;
    }

    let cancelled = false;
    const analyze = async () => {
      setDecoding(true);
      setError('');
      try {
        const bytes = source.file
          ? await source.file.arrayBuffer()
          : await fetch(source.url, { cache: 'no-store' }).then(response => {
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              return response.arrayBuffer();
            });
        const context = new AudioContext();
        const buffer = await context.decodeAudioData(bytes.slice(0));
        await context.close();
        if (cancelled) return;
        decodedBufferRef.current = buffer;
        const nextDuration = Math.min(buffer.duration, MAX_REMIX_SECONDS);
        setDuration(nextDuration);
        setWaveform(buildWaveform(buffer));
        setSegmentStart(0);
        setSegmentEnd(Math.min(nextDuration, Math.max(MIN_SEGMENT_SECONDS, source.durationSec && source.durationSec <= 120 ? source.durationSec : 30)));
        if (source.bpm) setBpm(source.bpm);
        if (source.key) setMusicalKey(source.key);
      } catch {
        if (cancelled) return;
        decodedBufferRef.current = null;
        const fallbackDuration = clamp(Number(source.durationSec || 30), MIN_SEGMENT_SECONDS, MAX_REMIX_SECONDS);
        setDuration(fallbackDuration);
        setSegmentStart(0);
        setSegmentEnd(Math.min(30, fallbackDuration));
        setWaveform(Array.from({ length: WAVE_BARS }, (_, index) => 0.16 + ((index * 17) % 29) / 48));
        setNotice('Waveform locale non disponibile per questa sorgente remota; il Remix resta utilizzabile sul brano completo.');
      } finally {
        if (!cancelled) setDecoding(false);
      }
    };
    void analyze();
    return () => { cancelled = true; };
  }, [source?.id, source?.url]);

  useEffect(() => () => {
    if (localObjectUrlRef.current) URL.revokeObjectURL(localObjectUrlRef.current);
  }, []);

  const chooseLibraryTrack = (track: SourceTrack) => {
    setSource(track);
    setOutputs([]);
    setError('');
    setNotice('');
  };

  const chooseUpload = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('audio/') && !/\.(wav|mp3|flac|ogg|m4a|aac|webm)$/i.test(file.name)) {
      setError('Seleziona un file audio valido.');
      return;
    }
    if (file.size > 160 * 1024 * 1024) {
      setError('Il file supera il limite di 160 MB.');
      return;
    }
    if (localObjectUrlRef.current) URL.revokeObjectURL(localObjectUrlRef.current);
    const url = URL.createObjectURL(file);
    localObjectUrlRef.current = url;
    setSource({ id: `upload-${file.name}-${file.lastModified}`, name: file.name, url, file });
    setOutputs([]);
    setError('');
    setNotice('');
  };

  const previewSelection = async () => {
    const audio = playerRef.current;
    if (!audio || !source) return;
    if (!audio.paused) {
      audio.pause();
      setPlaying(false);
      return;
    }
    try {
      audio.currentTime = segmentStart;
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  const onPlayerTime = () => {
    const audio = playerRef.current;
    if (!audio) return;
    if (audio.currentTime >= segmentEnd - 0.03) {
      audio.pause();
      audio.currentTime = segmentStart;
      setPlaying(false);
    }
  };

  const updateStart = (value: number) => {
    const next = clamp(value, 0, Math.max(0, segmentEnd - MIN_SEGMENT_SECONDS));
    setSegmentStart(next);
    if (playerRef.current) playerRef.current.currentTime = next;
  };

  const updateEnd = (value: number) => {
    const next = clamp(value, Math.min(duration, segmentStart + MIN_SEGMENT_SECONDS), duration || MIN_SEGMENT_SECONDS);
    setSegmentEnd(next);
  };

  const resetSelection = () => {
    setSegmentStart(0);
    setSegmentEnd(Math.min(duration || 30, 30));
    if (playerRef.current) playerRef.current.currentTime = 0;
  };

  const makeSourceForGeneration = async () => {
    if (!source) throw new Error('Scegli prima un brano da remixare.');
    const buffer = decodedBufferRef.current;
    if (buffer && segmentLength >= MIN_SEGMENT_SECONDS && (segmentStart > 0.01 || segmentEnd < Math.min(buffer.duration, MAX_REMIX_SECONDS) - 0.01)) {
      return {
        file: segmentToWav(buffer, segmentStart, segmentEnd, `sonara-remix-source-${Date.now()}.wav`),
        url: ''
      };
    }
    if (source.file) return { file: source.file, url: '' };
    return { file: null, url: source.url };
  };

  const pollJob = async (jobId: string, slot: number, token: number): Promise<RemixOutput[]> => {
    for (let attempt = 0; attempt < 240; attempt += 1) {
      if (generationTokenRef.current !== token) throw new Error('Generazione annullata.');
      const response = await fetch(`${API_ORIGIN}/api/studio/job/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
      let data: StudioJob = {};
      try { data = await response.json(); } catch { /* handled below */ }
      setProgress(current => {
        const next = [...current];
        next[slot] = clamp(Number(data.progress || 0), 0, 100);
        return next;
      });
      if (data.status === 'COMPLETED' && data.outputs?.length) return data.outputs;
      if (!response.ok || data.status === 'FAILED' || data.status === 'NOT_FOUND') {
        throw new Error(data.error || `Remix ${slot + 1} non riuscito.`);
      }
      await sleep(1800);
    }
    throw new Error(`Timeout Remix ${slot + 1}.`);
  };

  const submitRemix = async (slot: number, prepared: { file: File | null; url: string }, token: number) => {
    const form = new FormData();
    if (prepared.file) form.set('src_audio', prepared.file, prepared.file.name || 'sonara-remix-source.wav');
    else if (prepared.url) form.set('sourceAudioUrl', prepared.url);
    else throw new Error('Sorgente audio non disponibile.');

    const lyricInstruction = lyricsMode === 'instrumental'
      ? 'Instrumental only. Do not generate vocals.'
      : lyricsMode === 'custom' && lyrics.trim()
        ? `Use these lyrics faithfully while adapting phrasing naturally: ${lyrics.trim()}`
        : 'Preserve or intelligently reinterpret vocal phrasing only when musically appropriate.';
    const composedPrompt = `${prompt.trim()} ${lyricInstruction} Prompt influence ${styleInfluence}%. Variation ${slot + 1}: create a distinct, release-ready interpretation while retaining the source musical DNA according to the selected variance.`;

    form.set('prompt', composedPrompt);
    if (lyricsMode === 'custom') form.set('lyrics', lyrics);
    form.set('bpm', String(bpm));
    if (musicalKey.trim()) form.set('key', musicalKey.trim());
    form.set('durationSec', String(clamp(segmentLength || duration || 30, MIN_SEGMENT_SECONDS, MAX_REMIX_SECONDS)));
    form.set('influence', preserveStrength.toFixed(3));
    form.set('audio_cover_strength', preserveStrength.toFixed(3));
    form.set('coverNoiseStrength', remixNoise.toFixed(3));
    form.set('cover_noise_strength', remixNoise.toFixed(3));

    const response = await fetch(`${API_ORIGIN}/api/studio/cover`, { method: 'POST', body: form });
    let data: StudioJob = {};
    try { data = await response.json(); } catch { /* handled below */ }
    if (!response.ok || !data.jobId) throw new Error(data.error || `Impossibile avviare Remix ${slot + 1}.`);
    setProgress(current => {
      const next = [...current];
      next[slot] = 2;
      return next;
    });
    return pollJob(data.jobId, slot, token);
  };

  const generate = async () => {
    if (!source || generating) return;
    if (!prompt.trim()) {
      setError('Scrivi il Prompt Remix.');
      return;
    }
    if (segmentLength < MIN_SEGMENT_SECONDS) {
      setError(`Seleziona almeno ${MIN_SEGMENT_SECONDS} secondi di audio.`);
      return;
    }

    const token = generationTokenRef.current + 1;
    generationTokenRef.current = token;
    setGenerating(true);
    setProgress(Array.from({ length: outputCount }, () => 0));
    setOutputs([]);
    setError('');
    setNotice('SONARA sta creando il Remix con il motore audio reale.');

    try {
      const prepared = await makeSourceForGeneration();
      const tasks = Array.from({ length: outputCount }, (_, index) => submitRemix(index, prepared, token));
      const settled = await Promise.allSettled(tasks);
      if (generationTokenRef.current !== token) return;
      const successful = settled.flatMap(result => result.status === 'fulfilled' ? result.value : []);
      const failures = settled.filter(result => result.status === 'rejected') as PromiseRejectedResult[];
      setOutputs(successful.map((output, index) => ({ ...output, label: outputCount > 1 ? `Remix ${index + 1}` : output.label || 'Remix' })));
      if (!successful.length) throw new Error(failures[0]?.reason instanceof Error ? failures[0].reason.message : 'La generazione Remix non è riuscita.');
      setNotice(successful.length === outputCount ? `${successful.length} Remix completati.` : `${successful.length} Remix completati; una variante non è riuscita.`);
      if (failures.length && successful.length) setError(failures[0]?.reason instanceof Error ? failures[0].reason.message : 'Una variante non è riuscita.');
    } catch (generationError) {
      if (generationTokenRef.current === token) setError(generationError instanceof Error ? generationError.message : String(generationError));
    } finally {
      if (generationTokenRef.current === token) setGenerating(false);
    }
  };

  const selectOutput = (output: RemixOutput) => {
    const payload = {
      variationId: output.label,
      jobId: output.id,
      audioUrl: output.audioUrl,
      audioFormat: 'wav',
      title: output.label
    };
    try { window.localStorage.setItem('sonara.selectedGeneratedTrack', JSON.stringify(payload)); } catch { /* optional */ }
    window.dispatchEvent(new CustomEvent('sonara:generated-track-selected', { detail: payload }));
    setNotice(`${output.label} selezionato nel player SONARA.`);
  };

  const downloadOutput = async (output: RemixOutput) => {
    try {
      const response = await fetch(output.audioUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${safeFileName(output.label)}.wav`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 20_000);
    } catch {
      window.open(output.audioUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (!open) return null;

  return (
    <div className="sonara-remix-shell" role="dialog" aria-modal="true" aria-label="SONARA Remix">
      <header className="sonara-remix-topbar">
        <div className="sonara-remix-brand">
          <span className="sonara-remix-logo"><AudioWaveform /></span>
          <div><strong>REMIX</strong><small>SONARA AUDIO-TO-AUDIO</small></div>
        </div>
        <div className="sonara-remix-top-status"><span>XL TURBO</span><i />REAL AUDIO</div>
        <button type="button" className="sonara-remix-close" onClick={() => setOpen(false)} aria-label="Chiudi Remix"><X /></button>
      </header>

      <main className="sonara-remix-main">
        <section className="sonara-remix-source-panel">
          <div className="sonara-remix-section-head">
            <div><span>01</span><div><strong>Source</strong><small>Scegli il brano da reimmaginare</small></div></div>
            {source && <em><Check />READY</em>}
          </div>

          <div className="sonara-remix-source-tabs">
            <button type="button" data-active={sourceTab === 'library'} onClick={() => setSourceTab('library')}><Library />Your songs</button>
            <button type="button" data-active={sourceTab === 'upload'} onClick={() => setSourceTab('upload')}><UploadCloud />Upload audio</button>
          </div>

          {sourceTab === 'library' ? (
            <div className="sonara-remix-library">
              {libraryTracks.length ? libraryTracks.map(track => (
                <button key={track.id} type="button" data-active={source?.id === track.id} onClick={() => chooseLibraryTrack(track)}>
                  <span className="sonara-remix-track-icon"><Music2 /></span>
                  <span><strong>{track.name}</strong><small>{track.bpm ? `${track.bpm} BPM` : 'SONARA audio'}{track.key ? ` · ${track.key}` : ''}{track.durationSec ? ` · ${formatTime(track.durationSec)}` : ''}</small></span>
                  {source?.id === track.id && <Check />}
                </button>
              )) : <div className="sonara-remix-empty-library"><Music2 /><strong>Nessun brano in Library</strong><small>Genera un brano oppure usa Upload audio.</small></div>}
            </div>
          ) : (
            <div className="sonara-remix-upload" onClick={() => uploadRef.current?.click()}>
              <input ref={uploadRef} type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac,.webm" onChange={event => chooseUpload(event.currentTarget.files?.[0])} />
              <UploadCloud /><strong>{source?.file ? source.name : 'Drop or choose an audio file'}</strong><small>WAV, MP3, FLAC, M4A, OGG · max 160 MB</small><button type="button">Choose file</button>
            </div>
          )}

          {source && (
            <div className="sonara-remix-editor">
              <div className="sonara-remix-track-head">
                <div><span className="sonara-remix-disc"><Music2 /></span><div><strong>{source.name}</strong><small>{duration ? `${formatTime(duration)} source` : 'Analisi sorgente…'}</small></div></div>
                <button type="button" onClick={previewSelection}>{playing ? <Pause /> : <Play />}{playing ? 'Pause' : 'Preview'}</button>
              </div>
              <audio ref={playerRef} src={source.url} preload="metadata" onTimeUpdate={onPlayerTime} onPause={() => setPlaying(false)} onPlay={() => setPlaying(true)} />
              <div className="sonara-remix-wave-wrap" aria-label="Waveform e selezione Remix">
                <div className="sonara-remix-wave">
                  {waveform.map((value, index) => <i key={index} style={{ height: `${Math.round(12 + value * 64)}%` }} />)}
                </div>
                <div className="sonara-remix-selection" style={{ left: `${selectionLeft}%`, width: `${selectionWidth}%` }}><span /><span /></div>
                {decoding && <div className="sonara-remix-wave-loading"><LoaderCircle />Analyzing audio</div>}
              </div>
              <div className="sonara-remix-time-row"><span>0:00</span><strong>{formatTime(segmentStart)} — {formatTime(segmentEnd)} <small>{formatTime(segmentLength)} selected</small></strong><span>{formatTime(duration)}</span></div>
              <div className="sonara-remix-trim-grid">
                <label>START <b>{formatTime(segmentStart)}</b><input type="range" min={0} max={Math.max(0, duration - MIN_SEGMENT_SECONDS)} step={0.1} value={Math.min(segmentStart, Math.max(0, duration - MIN_SEGMENT_SECONDS))} onChange={event => updateStart(Number(event.target.value))} /></label>
                <label>END <b>{formatTime(segmentEnd)}</b><input type="range" min={MIN_SEGMENT_SECONDS} max={Math.max(MIN_SEGMENT_SECONDS, duration)} step={0.1} value={Math.min(Math.max(MIN_SEGMENT_SECONDS, segmentEnd), Math.max(MIN_SEGMENT_SECONDS, duration))} onChange={event => updateEnd(Number(event.target.value))} /></label>
                <button type="button" onClick={resetSelection} title="Ripristina selezione"><RotateCcw /></button>
              </div>
            </div>
          )}
        </section>

        <section className="sonara-remix-controls-panel">
          <div className="sonara-remix-section-head">
            <div><span>02</span><div><strong>Remix controls</strong><small>Descrivi come deve cambiare il brano</small></div></div>
            <WandSparkles />
          </div>

          <label className="sonara-remix-label">PROMPT REMIX</label>
          <div className="sonara-remix-prompt-box">
            <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={5} placeholder="Describe your remix…" />
            <div><span>{prompt.length}/9000</span><button type="button" onClick={() => setPrompt('Keep the core hook and groove, then rebuild the production with stronger drums, wider synths, deeper bass and a premium club-ready mix.')}><Sparkles />Inspire</button></div>
          </div>

          <div className="sonara-remix-slider-block">
            <div><label>VARIANCE</label><strong>{variance}%</strong></div>
            <input type="range" min={0} max={100} value={variance} onChange={event => setVariance(Number(event.target.value))} />
            <div className="sonara-remix-scale"><span>Subtle</span><span>Balanced</span><span>Different</span></div>
            <small>Più alta = maggiore reinterpretazione. Preserve strength reale: {Math.round(preserveStrength * 100)}%.</small>
          </div>

          <div className="sonara-remix-slider-block">
            <div><label>STYLE INFLUENCE</label><strong>{styleInfluence}%</strong></div>
            <input type="range" min={0} max={100} value={styleInfluence} onChange={event => setStyleInfluence(Number(event.target.value))} />
            <div className="sonara-remix-scale"><span>Source</span><span>Mix</span><span>Prompt</span></div>
          </div>

          <div className="sonara-remix-subsection">
            <label className="sonara-remix-label">LYRICS</label>
            <div className="sonara-remix-segmented">
              <button type="button" data-active={lyricsMode === 'auto'} onClick={() => setLyricsMode('auto')}>Auto</button>
              <button type="button" data-active={lyricsMode === 'custom'} onClick={() => setLyricsMode('custom')}>Custom</button>
              <button type="button" data-active={lyricsMode === 'instrumental'} onClick={() => setLyricsMode('instrumental')}>Instrumental</button>
            </div>
            {lyricsMode === 'custom' && <textarea className="sonara-remix-lyrics" value={lyrics} onChange={event => setLyrics(event.target.value)} rows={7} placeholder="Paste or write the lyrics for this remix…" />}
          </div>

          <button type="button" className="sonara-remix-advanced-toggle" onClick={() => setAdvancedOpen(value => !value)}><SlidersHorizontal />Advanced settings <span>{advancedOpen ? '−' : '+'}</span></button>
          {advancedOpen && (
            <div className="sonara-remix-advanced-grid">
              <label>BPM<input type="number" min={40} max={220} value={bpm} onChange={event => setBpm(clamp(Number(event.target.value) || 124, 40, 220))} /></label>
              <label>KEY<input type="text" value={musicalKey} onChange={event => setMusicalKey(event.target.value)} placeholder="Auto / Am / F#" /></label>
              <label>VERSIONS<div className="sonara-remix-count"><button type="button" data-active={outputCount === 1} onClick={() => setOutputCount(1)}>1</button><button type="button" data-active={outputCount === 2} onClick={() => setOutputCount(2)}>2</button></div></label>
              <label>ENGINE<div className="sonara-remix-readonly">XL TURBO</div></label>
            </div>
          )}

          {(notice || error) && <div className={`sonara-remix-message ${error ? 'is-error' : ''}`}>{error || notice}</div>}

          <div className="sonara-remix-generate-wrap">
            {generating && <div className="sonara-remix-progress-list">{progress.map((value, index) => <div key={index}><span>REMIX {index + 1}</span><i><b style={{ width: `${value}%` }} /></i><strong>{Math.round(value)}%</strong></div>)}</div>}
            <button type="button" className="sonara-remix-generate" disabled={!source || generating || segmentLength < MIN_SEGMENT_SECONDS} onClick={() => void generate()}>
              {generating ? <LoaderCircle className="sonara-spin" /> : <WandSparkles />}
              <span><strong>{generating ? 'Creating remix…' : `Create ${outputCount === 2 ? '2 remixes' : 'remix'}`}</strong><small>{source ? `${formatTime(segmentLength)} selected · ${Math.round(preserveStrength * 100)}% source DNA` : 'Choose a source track first'}</small></span>
            </button>
          </div>
        </section>

        <section className="sonara-remix-results-panel">
          <div className="sonara-remix-section-head">
            <div><span>03</span><div><strong>Results</strong><small>Ascolta e scegli la versione migliore</small></div></div>
            <span className="sonara-remix-result-count">{outputs.length || '—'}</span>
          </div>
          {outputs.length ? (
            <div className="sonara-remix-results">
              {outputs.map((output, index) => (
                <article key={`${output.id}-${index}`}>
                  <div className="sonara-remix-result-art"><AudioWaveform /><span>{String(index + 1).padStart(2, '0')}</span></div>
                  <div className="sonara-remix-result-body">
                    <div className="sonara-remix-result-title"><div><strong>{output.label || `Remix ${index + 1}`}</strong><small>SONARA XL TURBO · WAV</small></div>{typeof output.quality?.qualityScore === 'number' && <em>{Math.round(output.quality.qualityScore)} Q</em>}</div>
                    <audio controls preload="metadata" src={output.audioUrl} />
                    <div className="sonara-remix-result-actions"><button type="button" onClick={() => selectOutput(output)}><Check />Use this remix</button><button type="button" onClick={() => void downloadOutput(output)}><Download />Download</button></div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="sonara-remix-empty-results"><AudioWaveform /><strong>Your remixes will appear here</strong><small>Seleziona una sorgente, imposta il segmento e premi Create.</small></div>
          )}
        </section>
      </main>

      <style>{`
        body[data-sonara-remix-open="true"]{overflow:hidden!important}
        .sonara-remix-shell{position:fixed;inset:0;z-index:22000;overflow:auto;background:#08080b;color:#f5f5f7;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;isolation:isolate}
        .sonara-remix-shell *{box-sizing:border-box}.sonara-remix-shell button,.sonara-remix-shell input,.sonara-remix-shell textarea{font:inherit}
        .sonara-remix-shell::before{content:'';position:fixed;inset:0;z-index:-2;background:radial-gradient(circle at 12% 6%,rgba(109,40,217,.15),transparent 24%),radial-gradient(circle at 88% 12%,rgba(37,99,235,.11),transparent 26%),linear-gradient(180deg,#0a0a0e,#07070a 65%,#09090d)}
        .sonara-remix-shell::after{content:'';position:fixed;inset:0;z-index:-1;opacity:.18;background-image:linear-gradient(rgba(255,255,255,.018) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.018) 1px,transparent 1px);background-size:32px 32px;mask-image:linear-gradient(to bottom,black,transparent 65%)}
        .sonara-remix-topbar{position:sticky;top:0;z-index:20;min-height:72px;padding:0 26px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;border-bottom:1px solid rgba(255,255,255,.065);background:rgba(8,8,11,.88);backdrop-filter:blur(24px)}
        .sonara-remix-brand{display:flex;align-items:center;gap:11px}.sonara-remix-logo{width:38px;height:38px;display:grid;place-items:center;border-radius:11px;background:linear-gradient(135deg,#7c3aed,#4f46e5 58%,#2563eb);box-shadow:0 8px 24px rgba(76,29,149,.28)}.sonara-remix-logo svg{width:19px}.sonara-remix-brand strong{display:block;font-size:14px;font-weight:950;letter-spacing:.04em}.sonara-remix-brand small{display:block;margin-top:2px;color:#63636d;font-size:8px;font-weight:850;letter-spacing:.2em}
        .sonara-remix-top-status{justify-self:center;display:flex;align-items:center;gap:8px;color:#777782;font-size:8px;font-weight:900;letter-spacing:.13em}.sonara-remix-top-status span{padding:6px 8px;border:1px solid rgba(167,139,250,.16);border-radius:7px;background:rgba(124,58,237,.07);color:#a78bfa}.sonara-remix-top-status i{width:5px;height:5px;border-radius:50%;background:#34d399;box-shadow:0 0 10px rgba(52,211,153,.55)}
        .sonara-remix-close{justify-self:end;width:36px;height:36px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:#111116;color:#9f9fa9;cursor:pointer}.sonara-remix-close:hover{color:#fff;border-color:rgba(255,255,255,.16)}.sonara-remix-close svg{width:16px}
        .sonara-remix-main{width:min(1420px,calc(100% - 44px));margin:0 auto;padding:28px 0 76px;display:grid;grid-template-columns:minmax(0,1.18fr) minmax(380px,.82fr);gap:18px;align-items:start}
        .sonara-remix-source-panel,.sonara-remix-controls-panel,.sonara-remix-results-panel{border:1px solid rgba(255,255,255,.065);border-radius:18px;background:rgba(15,15,20,.86);box-shadow:0 20px 60px rgba(0,0,0,.2);overflow:hidden}.sonara-remix-source-panel{grid-column:1}.sonara-remix-controls-panel{grid-column:2;grid-row:1/span 2}.sonara-remix-results-panel{grid-column:1}
        .sonara-remix-section-head{min-height:68px;padding:15px 17px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.055);background:rgba(255,255,255,.012)}.sonara-remix-section-head>div{display:flex;align-items:center;gap:11px}.sonara-remix-section-head>div>span{width:31px;height:31px;display:grid;place-items:center;border:1px solid rgba(167,139,250,.16);border-radius:9px;background:rgba(124,58,237,.07);color:#a78bfa;font-size:9px;font-weight:950}.sonara-remix-section-head strong{display:block;font-size:12px;font-weight:950}.sonara-remix-section-head small{display:block;margin-top:3px;color:#656570;font-size:9px}.sonara-remix-section-head>em{display:flex;align-items:center;gap:5px;color:#6ee7b7;font-size:8px;font-style:normal;font-weight:900;letter-spacing:.12em}.sonara-remix-section-head>em svg,.sonara-remix-section-head>svg{width:14px}.sonara-remix-section-head>svg{color:#7c3aed}
        .sonara-remix-source-tabs{display:flex;gap:5px;padding:14px 16px 0}.sonara-remix-source-tabs button{display:flex;align-items:center;gap:7px;padding:9px 12px;border:1px solid transparent;border-radius:10px;background:transparent;color:#777782;font-size:9px;font-weight:900;cursor:pointer}.sonara-remix-source-tabs button svg{width:13px}.sonara-remix-source-tabs button[data-active="true"]{border-color:rgba(255,255,255,.075);background:#18181e;color:#fff}
        .sonara-remix-library{padding:10px 16px 16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px;max-height:206px;overflow:auto}.sonara-remix-library>button{min-width:0;padding:9px 10px;display:grid;grid-template-columns:32px minmax(0,1fr) auto;align-items:center;gap:9px;text-align:left;border:1px solid rgba(255,255,255,.055);border-radius:11px;background:#111116;color:#b7b7c0;cursor:pointer}.sonara-remix-library>button:hover,.sonara-remix-library>button[data-active="true"]{border-color:rgba(167,139,250,.28);background:linear-gradient(135deg,rgba(76,29,149,.15),#121218)}.sonara-remix-library>button>span:nth-child(2){min-width:0}.sonara-remix-library strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.sonara-remix-library small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin-top:3px;color:#62626d;font-size:8px}.sonara-remix-library>button>svg{width:13px;color:#a78bfa}.sonara-remix-track-icon{width:32px;height:32px;display:grid;place-items:center;border-radius:8px;background:#1b1b22;color:#71717f}.sonara-remix-track-icon svg{width:14px}.sonara-remix-empty-library{grid-column:1/-1;min-height:105px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px dashed rgba(255,255,255,.065);border-radius:12px;color:#5f5f69}.sonara-remix-empty-library svg{width:20px}.sonara-remix-empty-library strong{margin-top:7px;color:#9a9aa5;font-size:10px}.sonara-remix-empty-library small{margin-top:4px;font-size:8px}
        .sonara-remix-upload{margin:10px 16px 16px;min-height:150px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px dashed rgba(167,139,250,.23);border-radius:13px;background:linear-gradient(135deg,rgba(76,29,149,.08),rgba(37,99,235,.035));cursor:pointer}.sonara-remix-upload input{display:none}.sonara-remix-upload>svg{width:23px;color:#8b5cf6}.sonara-remix-upload strong{margin-top:9px;font-size:10px}.sonara-remix-upload small{margin-top:4px;color:#666672;font-size:8px}.sonara-remix-upload button{margin-top:10px;padding:7px 10px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:#17171d;color:#c4c4cc;font-size:8px;font-weight:900}
        .sonara-remix-editor{margin:0 16px 16px;padding:13px;border:1px solid rgba(255,255,255,.065);border-radius:14px;background:#0c0c10}.sonara-remix-editor audio{display:none}.sonara-remix-track-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.sonara-remix-track-head>div{display:flex;align-items:center;gap:9px;min-width:0}.sonara-remix-track-head>div>div{min-width:0}.sonara-remix-track-head strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.sonara-remix-track-head small{display:block;margin-top:3px;color:#5f5f69;font-size:8px}.sonara-remix-disc{width:34px;height:34px;display:grid;place-items:center;border-radius:9px;background:linear-gradient(135deg,#24242d,#15151b);color:#787886}.sonara-remix-disc svg{width:14px}.sonara-remix-track-head>button{display:flex;align-items:center;gap:6px;padding:7px 9px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#15151b;color:#bcbcc5;font-size:8px;font-weight:900;cursor:pointer}.sonara-remix-track-head>button svg{width:11px}
        .sonara-remix-wave-wrap{position:relative;height:112px;margin-top:13px;overflow:hidden;border:1px solid rgba(255,255,255,.045);border-radius:10px;background:#08080b}.sonara-remix-wave{position:absolute;inset:9px 8px;display:flex;align-items:center;gap:2px}.sonara-remix-wave i{flex:1;min-width:1px;border-radius:2px;background:#50505d;opacity:.9}.sonara-remix-selection{position:absolute;top:0;bottom:0;min-width:2px;border-left:2px solid #8b5cf6;border-right:2px solid #6366f1;background:linear-gradient(90deg,rgba(124,58,237,.17),rgba(79,70,229,.14));box-shadow:inset 0 0 40px rgba(99,102,241,.05)}.sonara-remix-selection span{position:absolute;top:7px;width:8px;height:18px;border-radius:3px;background:#8b5cf6;box-shadow:0 3px 12px rgba(76,29,149,.4)}.sonara-remix-selection span:first-child{left:-5px}.sonara-remix-selection span:last-child{right:-5px;background:#6366f1}.sonara-remix-wave-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;gap:7px;background:rgba(8,8,11,.78);color:#858590;font-size:8px;font-weight:900;letter-spacing:.08em}.sonara-remix-wave-loading svg{width:13px;animation:sonara-remix-spin 1s linear infinite}
        .sonara-remix-time-row{margin-top:7px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;color:#555560;font-size:8px}.sonara-remix-time-row>span:last-child{text-align:right}.sonara-remix-time-row strong{color:#b0b0ba;font-size:8px}.sonara-remix-time-row strong small{margin-left:7px;color:#7c3aed}.sonara-remix-trim-grid{margin-top:11px;display:grid;grid-template-columns:1fr 1fr 34px;gap:8px;align-items:end}.sonara-remix-trim-grid label{display:grid;grid-template-columns:1fr auto;gap:3px;color:#666672;font-size:7px;font-weight:900;letter-spacing:.12em}.sonara-remix-trim-grid label b{color:#aaaab4;font-size:8px;letter-spacing:0}.sonara-remix-trim-grid input{grid-column:1/-1;width:100%;accent-color:#7c3aed}.sonara-remix-trim-grid>button{width:34px;height:31px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:#141419;color:#70707b;cursor:pointer}.sonara-remix-trim-grid>button svg{width:12px}
        .sonara-remix-controls-panel{padding-bottom:15px}.sonara-remix-controls-panel>.sonara-remix-section-head{margin-bottom:15px}.sonara-remix-label{display:block;margin:0 16px 7px;color:#696975;font-size:8px;font-weight:950;letter-spacing:.14em}.sonara-remix-prompt-box{margin:0 16px;border:1px solid rgba(255,255,255,.075);border-radius:13px;background:#0b0b0f;overflow:hidden}.sonara-remix-prompt-box textarea{width:100%;min-height:116px;padding:13px;border:0;outline:0;resize:vertical;background:transparent;color:#eeeef2;font-size:11px;line-height:1.6}.sonara-remix-prompt-box>div{min-height:38px;padding:6px 8px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,.045)}.sonara-remix-prompt-box>div span{color:#50505a;font-size:7px}.sonara-remix-prompt-box button{display:flex;align-items:center;gap:5px;padding:6px 8px;border:1px solid rgba(167,139,250,.13);border-radius:7px;background:rgba(124,58,237,.07);color:#a78bfa;font-size:7px;font-weight:900;cursor:pointer}.sonara-remix-prompt-box button svg{width:10px}
        .sonara-remix-slider-block{margin:15px 16px 0;padding:12px;border:1px solid rgba(255,255,255,.055);border-radius:12px;background:#101014}.sonara-remix-slider-block>div:first-child{display:flex;align-items:center;justify-content:space-between}.sonara-remix-slider-block label{color:#777782;font-size:8px;font-weight:950;letter-spacing:.12em}.sonara-remix-slider-block strong{color:#d8d8df;font-size:9px}.sonara-remix-slider-block input{width:100%;margin:10px 0 3px;accent-color:#7c3aed}.sonara-remix-scale{display:flex;justify-content:space-between;color:#50505a;font-size:7px}.sonara-remix-slider-block>small{display:block;margin-top:8px;color:#5f5f69;font-size:7px;line-height:1.5}.sonara-remix-subsection{margin-top:15px}.sonara-remix-segmented{margin:0 16px;display:grid;grid-template-columns:repeat(3,1fr);padding:3px;border:1px solid rgba(255,255,255,.055);border-radius:10px;background:#0d0d11}.sonara-remix-segmented button{min-height:32px;border:0;border-radius:7px;background:transparent;color:#64646f;font-size:8px;font-weight:900;cursor:pointer}.sonara-remix-segmented button[data-active="true"]{background:#222229;color:#fff}.sonara-remix-lyrics{width:calc(100% - 32px);margin:8px 16px 0;padding:11px;border:1px solid rgba(255,255,255,.065);border-radius:10px;outline:0;background:#0b0b0f;color:#ececf1;font-size:10px;line-height:1.55;resize:vertical}
        .sonara-remix-advanced-toggle{width:calc(100% - 32px);margin:15px 16px 0;padding:10px 11px;display:flex;align-items:center;gap:7px;border:1px solid rgba(255,255,255,.055);border-radius:10px;background:#101014;color:#858590;font-size:8px;font-weight:900;cursor:pointer}.sonara-remix-advanced-toggle svg{width:12px}.sonara-remix-advanced-toggle span{margin-left:auto;color:#6d6d78}.sonara-remix-advanced-grid{margin:8px 16px 0;display:grid;grid-template-columns:1fr 1fr;gap:7px}.sonara-remix-advanced-grid>label{display:block;color:#62626d;font-size:7px;font-weight:900;letter-spacing:.1em}.sonara-remix-advanced-grid input,.sonara-remix-readonly,.sonara-remix-count{width:100%;height:34px;margin-top:5px;border:1px solid rgba(255,255,255,.06);border-radius:8px;background:#0b0b0f;color:#d7d7df}.sonara-remix-advanced-grid input{padding:0 9px;outline:0;font-size:9px}.sonara-remix-readonly{display:flex;align-items:center;padding:0 9px;color:#8b5cf6;font-size:8px;font-weight:900}.sonara-remix-count{display:grid;grid-template-columns:1fr 1fr;padding:3px}.sonara-remix-count button{border:0;border-radius:6px;background:transparent;color:#61616c;font-size:8px;font-weight:900;cursor:pointer}.sonara-remix-count button[data-active="true"]{background:#24242b;color:#fff}
        .sonara-remix-message{margin:12px 16px 0;padding:9px 10px;border:1px solid rgba(52,211,153,.12);border-radius:9px;background:rgba(16,185,129,.045);color:#8ed9bd;font-size:8px;line-height:1.45}.sonara-remix-message.is-error{border-color:rgba(248,113,113,.18);background:rgba(127,29,29,.08);color:#fca5a5}.sonara-remix-generate-wrap{margin:14px 16px 0}.sonara-remix-progress-list{margin-bottom:8px;display:grid;gap:5px}.sonara-remix-progress-list>div{display:grid;grid-template-columns:52px 1fr 32px;align-items:center;gap:7px;color:#676772;font-size:7px;font-weight:900}.sonara-remix-progress-list i{height:4px;overflow:hidden;border-radius:99px;background:#202027}.sonara-remix-progress-list b{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#7c3aed,#6366f1)}.sonara-remix-progress-list strong{text-align:right;color:#92929c;font-size:7px}.sonara-remix-generate{width:100%;min-height:58px;padding:10px 13px;display:flex;align-items:center;justify-content:center;gap:10px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:linear-gradient(110deg,#f4f4f5,#fff 46%,#e4e4e7);color:#09090b;box-shadow:0 12px 34px rgba(0,0,0,.24);cursor:pointer}.sonara-remix-generate:disabled{opacity:.38;cursor:not-allowed}.sonara-remix-generate>svg{width:17px}.sonara-remix-generate span{text-align:left}.sonara-remix-generate strong{display:block;font-size:10px;font-weight:950}.sonara-remix-generate small{display:block;margin-top:2px;color:#65656d;font-size:7px}.sonara-spin{animation:sonara-remix-spin 1s linear infinite}
        .sonara-remix-result-count{min-width:28px;height:25px;display:grid;place-items:center;border:1px solid rgba(255,255,255,.06);border-radius:7px;background:#141419;color:#767681;font-size:8px;font-weight:900}.sonara-remix-results{padding:14px 16px 16px;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px}.sonara-remix-results article{min-width:0;display:grid;grid-template-columns:72px minmax(0,1fr);border:1px solid rgba(255,255,255,.06);border-radius:13px;background:#0d0d11;overflow:hidden}.sonara-remix-result-art{position:relative;min-height:128px;display:grid;place-items:center;background:linear-gradient(145deg,#24113e,#10152d 58%,#0b0b11);color:#8b5cf6}.sonara-remix-result-art svg{width:25px}.sonara-remix-result-art span{position:absolute;left:8px;bottom:7px;color:rgba(255,255,255,.4);font-size:8px;font-weight:950}.sonara-remix-result-body{min-width:0;padding:10px}.sonara-remix-result-title{display:flex;align-items:flex-start;gap:8px}.sonara-remix-result-title>div{min-width:0}.sonara-remix-result-title strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:10px}.sonara-remix-result-title small{display:block;margin-top:3px;color:#575761;font-size:7px}.sonara-remix-result-title em{margin-left:auto;padding:4px 5px;border-radius:6px;background:rgba(52,211,153,.08);color:#6ee7b7;font-size:7px;font-style:normal;font-weight:900}.sonara-remix-result-body audio{width:100%;height:30px;margin-top:9px}.sonara-remix-result-actions{display:grid;grid-template-columns:1fr auto;gap:5px;margin-top:7px}.sonara-remix-result-actions button{min-height:28px;display:flex;align-items:center;justify-content:center;gap:5px;border:1px solid rgba(255,255,255,.065);border-radius:7px;background:#16161c;color:#a7a7b0;font-size:7px;font-weight:900;cursor:pointer}.sonara-remix-result-actions button:first-child{border-color:rgba(167,139,250,.16);background:rgba(124,58,237,.07);color:#b7a4ff}.sonara-remix-result-actions svg{width:10px}.sonara-remix-empty-results{min-height:210px;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#4f4f59}.sonara-remix-empty-results svg{width:27px}.sonara-remix-empty-results strong{margin-top:10px;color:#8a8a95;font-size:10px}.sonara-remix-empty-results small{margin-top:4px;font-size:8px}
        @keyframes sonara-remix-spin{to{transform:rotate(360deg)}}
        @media(max-width:1080px){.sonara-remix-main{grid-template-columns:1fr;width:min(900px,calc(100% - 30px))}.sonara-remix-source-panel,.sonara-remix-controls-panel,.sonara-remix-results-panel{grid-column:1;grid-row:auto}.sonara-remix-controls-panel{order:2}.sonara-remix-results-panel{order:3}.sonara-remix-topbar{grid-template-columns:1fr auto}.sonara-remix-top-status{display:none}}
        @media(max-width:680px){.sonara-remix-topbar{min-height:62px;padding:0 14px}.sonara-remix-main{width:calc(100% - 18px);padding:14px 0 54px;gap:10px}.sonara-remix-library,.sonara-remix-results{grid-template-columns:1fr}.sonara-remix-results article{grid-template-columns:62px minmax(0,1fr)}.sonara-remix-advanced-grid{grid-template-columns:1fr}.sonara-remix-wave-wrap{height:96px}.sonara-remix-trim-grid{grid-template-columns:1fr 1fr 30px}.sonara-remix-brand small{display:none}.sonara-remix-source-panel,.sonara-remix-controls-panel,.sonara-remix-results-panel{border-radius:14px}}
      `}</style>
    </div>
  );
}
