import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  ChevronDown,
  Copy,
  Download,
  Gauge,
  KeyboardMusic,
  Layers3,
  Loader2,
  Mic2,
  Music2,
  Pause,
  Play,
  Plus,
  Redo2,
  Save,
  Scissors,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Square,
  Trash2,
  Undo2,
  Upload,
  Volume2,
  WandSparkles,
  ZoomIn,
  ZoomOut
} from 'lucide-react';
import { audioBufferToWav, decodeAudioFromUrl, downloadBlob, safeAudioFilename } from '../production/audioUtils';

type TrackKind = 'audio' | 'midi' | 'vocal' | 'instrument';
type QuantizeValue = '1/4' | '1/8' | '1/16' | '1/32';
type MarkerLabel = 'Intro' | 'Verse' | 'Pre' | 'Chorus' | 'Drop' | 'Bridge' | 'Outro';

type Clip = {
  id: string;
  name: string;
  src?: string;
  start: number;
  offset: number;
  duration: number;
  kind: TrackKind;
};

type AutomationPoint = { time: number; value: number };
type StudioMarker = { id: string; label: MarkerLabel; time: number };

type Track = {
  id: string;
  name: string;
  kind: TrackKind;
  volume: number;
  pan: number;
  pitch: number;
  mute: boolean;
  solo: boolean;
  armed: boolean;
  low: number;
  mid: number;
  high: number;
  compression: number;
  reverb: number;
  automation: AutomationPoint[];
  clips: Clip[];
};

type ClipAudioGraph = {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  panner: StereoPannerNode;
};

interface SonaraStudioProps {
  audioUrl?: string;
  title?: string;
  bpm: number;
  keySignature: string;
  onBpmChange?: (value: number) => void;
  onOpenMarket?: () => void;
  onOpenProduction?: () => void;
}

const MIN_TIMELINE_SECONDS = 180;
const MAX_TIMELINE_SECONDS = 480;
const MARKER_LABELS: MarkerLabel[] = ['Intro', 'Verse', 'Pre', 'Chorus', 'Drop', 'Bridge', 'Outro'];
const QUANTIZE_DIVISOR: Record<QuantizeValue, number> = { '1/4': 1, '1/8': 2, '1/16': 4, '1/32': 8 };
const TRACK_COLORS: Record<TrackKind, string> = {
  audio: 'from-violet-600/80 to-indigo-600/65',
  vocal: 'from-fuchsia-600/80 to-purple-600/65',
  instrument: 'from-cyan-600/80 to-blue-600/65',
  midi: 'from-emerald-600/80 to-teal-600/65'
};

const uid = (prefix: string) => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const formatTime = (seconds: number) => `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
const sleep = (milliseconds: number) => new Promise<void>(resolve => window.setTimeout(resolve, milliseconds));
const toDb = (level: number) => level <= 0.00001 ? -60 : Math.max(-60, 20 * Math.log10(level));
const meterPercent = (level: number) => clamp(((toDb(level) + 60) / 60) * 100, 0, 100);

function baseTrack(name: string, kind: TrackKind): Track {
  return {
    id: uid('track'),
    name,
    kind,
    volume: kind === 'midi' ? 0.8 : 0.86,
    pan: 0,
    pitch: 0,
    mute: false,
    solo: false,
    armed: false,
    low: 0,
    mid: 0,
    high: 0,
    compression: kind === 'midi' ? 10 : 18,
    reverb: kind === 'midi' ? 14 : 8,
    automation: [],
    clips: []
  };
}

function makeAudioTrack(name: string, src: string, duration = 180, kind: TrackKind = 'audio'): Track {
  const track = baseTrack(name, kind);
  track.clips = [{ id: uid('clip'), name, src, start: 0, offset: 0, duration, kind }];
  return track;
}

function makeEmptyAudioTrack(name = 'Audio Track'): Track {
  const track = baseTrack(name, 'audio');
  track.armed = true;
  return track;
}

function makeMidiTrack(name = 'MIDI / Synth'): Track {
  const track = baseTrack(name, 'midi');
  track.clips = [{ id: uid('clip'), name: 'MIDI Clip', start: 0, offset: 0, duration: 16, kind: 'midi' }];
  return track;
}

async function probeDuration(src: string): Promise<number> {
  return await new Promise(resolve => {
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    audio.src = src;
    const finish = () => resolve(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 180);
    audio.addEventListener('loadedmetadata', finish, { once: true });
    audio.addEventListener('error', () => resolve(180), { once: true });
  });
}

function float32Wav(buffer: AudioBuffer): Blob {
  const channels = Math.min(2, Math.max(1, buffer.numberOfChannels));
  const frames = buffer.length;
  const bytesPerSample = 4;
  const blockAlign = channels * bytesPerSample;
  const dataSize = frames * blockAlign;
  const out = new ArrayBuffer(44 + dataSize);
  const view = new DataView(out);
  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 32, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  const data = Array.from({ length: channels }, (_, index) => buffer.getChannelData(index));
  let offset = 44;
  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < channels; channel += 1) {
      view.setFloat32(offset, clamp(data[channel][frame] || 0, -1, 1), true);
      offset += 4;
    }
  }
  return new Blob([out], { type: 'audio/wav' });
}

export default function SonaraStudio({
  audioUrl,
  title = 'SONARA Project',
  bpm,
  keySignature,
  onBpmChange,
  onOpenMarket,
  onOpenProduction
}: SonaraStudioProps) {
  const [projectName, setProjectName] = useState(title || 'SONARA Project');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [selectedTrackId, setSelectedTrackId] = useState('');
  const [selectedClipId, setSelectedClipId] = useState('');
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [recording, setRecording] = useState(false);
  const [countingIn, setCountingIn] = useState(false);
  const [countInBeat, setCountInBeat] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [snap, setSnap] = useState(true);
  const [quantize, setQuantize] = useState<QuantizeValue>('1/16');
  const [loop, setLoop] = useState(false);
  const [metronome, setMetronome] = useState(false);
  const [countInBars, setCountInBars] = useState<0 | 1 | 2>(1);
  const [markerLabel, setMarkerLabel] = useState<MarkerLabel>('Intro');
  const [markers, setMarkers] = useState<StudioMarker[]>([]);
  const [masterVolume, setMasterVolume] = useState(0.92);
  const [masterMuted, setMasterMuted] = useState(false);
  const [masterMeter, setMasterMeter] = useState({ left: 0, right: 0, peakLeft: 0, peakRight: 0 });
  const [panel, setPanel] = useState<'mixer' | 'effects' | 'automation' | 'synth'>('mixer');
  const [assistantText, setAssistantText] = useState('');
  const [assistantNotice, setAssistantNotice] = useState('Studio pronto. Arma una traccia con R per registrare oppure importa audio, stem e MIDI.');
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [musicalTyping, setMusicalTyping] = useState(false);
  const [history, setHistory] = useState<Track[][]>([]);
  const [future, setFuture] = useState<Track[][]>([]);

  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const stemInputRef = useRef<HTMLInputElement | null>(null);
  const midiInputRef = useRef<HTMLInputElement | null>(null);
  const audioElements = useRef(new Map<string, HTMLAudioElement>());
  const clipGraphs = useRef(new Map<string, ClipAudioGraph>());
  const directClips = useRef(new Set<string>());
  const playingClips = useRef(new Set<string>());
  const frameRef = useRef<number | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const transportTokenRef = useRef(0);
  const lastMetronomeBeatRef = useRef(-1);
  const fallbackMeterRef = useRef({ left: 0, right: 0 });

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainNodeRef = useRef<GainNode | null>(null);
  const masterLimiterRef = useRef<DynamicsCompressorNode | null>(null);
  const analyserLeftRef = useRef<AnalyserNode | null>(null);
  const analyserRightRef = useRef<AnalyserNode | null>(null);
  const meterLeftDataRef = useRef(new Float32Array(256));
  const meterRightDataRef = useRef(new Float32Array(256));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef(0);
  const recordingTrackIdsRef = useRef<string[]>([]);

  useEffect(() => setProjectName(title || 'SONARA Project'), [title]);

  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;
    void probeDuration(audioUrl).then(duration => {
      if (cancelled) return;
      setTracks(current => {
        const already = current.some(track => track.clips.some(clip => clip.src === audioUrl));
        if (already) return current;
        const next = [makeAudioTrack(title || 'SONARA Master', audioUrl, duration), ...current];
        setSelectedTrackId(next[0].id);
        setSelectedClipId(next[0].clips[0].id);
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [audioUrl, title]);

  const totalDuration = useMemo(() => {
    const end = tracks.reduce((max, track) => Math.max(max, ...track.clips.map(clip => clip.start + clip.duration), 0), 0);
    return clamp(Math.max(MIN_TIMELINE_SECONDS, Math.ceil(end / 30) * 30), MIN_TIMELINE_SECONDS, MAX_TIMELINE_SECONDS);
  }, [tracks]);

  const pxPerSecond = 7 * zoom;
  const timelineWidth = Math.max(900, totalDuration * pxPerSecond);
  const selectedTrack = tracks.find(track => track.id === selectedTrackId) || tracks[0];
  const anySolo = tracks.some(track => track.solo);

  const pushHistory = () => {
    setHistory(current => [...current.slice(-29), structuredClone(tracks)]);
    setFuture([]);
  };

  const updateTrack = (id: string, patch: Partial<Track>, record = false) => {
    if (record) pushHistory();
    setTracks(current => current.map(track => track.id === id ? { ...track, ...patch } : track));
  };

  const undo = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setFuture(current => [structuredClone(tracks), ...current]);
    setTracks(previous);
    setHistory(current => current.slice(0, -1));
  };

  const redo = () => {
    const next = future[0];
    if (!next) return;
    setHistory(current => [...current, structuredClone(tracks)]);
    setTracks(next);
    setFuture(current => current.slice(1));
  };

  const snapTime = (value: number) => {
    if (!snap) return clamp(value, 0, totalDuration);
    const quarter = 60 / Math.max(1, bpm);
    const grid = quarter / QUANTIZE_DIVISOR[quantize];
    return clamp(Math.round(value / grid) * grid, 0, totalDuration);
  };

  const importFiles = async (files: FileList | null, asStems = false) => {
    if (!files?.length) return;
    const audioFiles = Array.from(files).filter(file => file.type.startsWith('audio/') || /\.(wav|mp3|flac|ogg|m4a|aac|webm)$/i.test(file.name));
    if (!audioFiles.length) return;
    pushHistory();
    const imported: Track[] = [];
    for (const file of audioFiles) {
      const url = URL.createObjectURL(file);
      const duration = await probeDuration(url);
      const name = file.name.replace(/\.[^.]+$/, '');
      const inferredKind: TrackKind = /vocal|voice|vox|acap/i.test(name) ? 'vocal' : asStems ? 'instrument' : 'audio';
      imported.push(makeAudioTrack(name, url, duration, inferredKind));
    }
    setTracks(current => [...current, ...imported]);
    if (imported[0]) {
      setSelectedTrackId(imported[0].id);
      setSelectedClipId(imported[0].clips[0].id);
    }
  };

  const importMidi = (files: FileList | null) => {
    if (!files?.length) return;
    pushHistory();
    const next = Array.from(files).filter(file => /\.(mid|midi)$/i.test(file.name)).map(file => ({
      ...makeMidiTrack(file.name.replace(/\.(mid|midi)$/i, '')),
      clips: [{ id: uid('clip'), name: file.name, start: snapTime(playhead), offset: 0, duration: 16, kind: 'midi' as TrackKind }]
    }));
    setTracks(current => [...current, ...next]);
    setAssistantNotice(next.length ? `${next.length} traccia/e MIDI aggiunte alla timeline.` : 'Nessun file MIDI valido selezionato.');
  };

  const addMidiTrack = () => {
    pushHistory();
    const track = makeMidiTrack();
    track.clips[0].start = snapTime(playhead);
    setTracks(current => [...current, track]);
    setSelectedTrackId(track.id);
    setSelectedClipId(track.clips[0].id);
  };

  const addAudioTrack = () => {
    pushHistory();
    const number = tracks.filter(track => track.kind !== 'midi').length + 1;
    const track = makeEmptyAudioTrack(`Audio ${number}`);
    setTracks(current => [...current, track]);
    setSelectedTrackId(track.id);
    setSelectedClipId('');
    setAssistantNotice(`${track.name} creata e armata. Premi REC per registrare dal microfono/interfaccia selezionata dal browser.`);
  };

  const removeTrack = (id: string) => {
    pushHistory();
    setTracks(current => current.filter(track => track.id !== id));
    if (selectedTrackId === id) setSelectedTrackId('');
  };

  const splitSelectedClip = () => {
    const track = tracks.find(item => item.id === selectedTrackId);
    const clip = track?.clips.find(item => item.id === selectedClipId);
    if (!track || !clip || playhead <= clip.start + 0.05 || playhead >= clip.start + clip.duration - 0.05) return;
    pushHistory();
    const splitAt = snapTime(playhead);
    if (splitAt <= clip.start + 0.05 || splitAt >= clip.start + clip.duration - 0.05) return;
    const leftDuration = splitAt - clip.start;
    const rightDuration = clip.duration - leftDuration;
    const left = { ...clip, duration: leftDuration };
    const right = { ...clip, id: uid('clip'), name: `${clip.name} B`, start: splitAt, offset: clip.offset + leftDuration, duration: rightDuration };
    setTracks(current => current.map(item => item.id === track.id ? { ...item, clips: item.clips.flatMap(existing => existing.id === clip.id ? [left, right] : [existing]) } : item));
    setSelectedClipId(right.id);
  };

  const duplicateSelectedClip = () => {
    const track = tracks.find(item => item.id === selectedTrackId);
    const clip = track?.clips.find(item => item.id === selectedClipId);
    if (!track || !clip) return;
    pushHistory();
    const copy = { ...clip, id: uid('clip'), name: `${clip.name} Copy`, start: snapTime(clip.start + clip.duration) };
    setTracks(current => current.map(item => item.id === track.id ? { ...item, clips: [...item.clips, copy] } : item));
    setSelectedClipId(copy.id);
  };

  const deleteSelectedClip = () => {
    if (!selectedTrackId || !selectedClipId) return;
    pushHistory();
    setTracks(current => current.map(track => track.id === selectedTrackId ? { ...track, clips: track.clips.filter(clip => clip.id !== selectedClipId) } : track));
    setSelectedClipId('');
  };

  const addMarker = () => {
    const time = snapTime(playhead);
    setMarkers(current => {
      const withoutSame = current.filter(marker => Math.abs(marker.time - time) > 0.05);
      return [...withoutSame, { id: uid('marker'), label: markerLabel, time }].sort((a, b) => a.time - b.time);
    });
    const currentIndex = MARKER_LABELS.indexOf(markerLabel);
    setMarkerLabel(MARKER_LABELS[(currentIndex + 1) % MARKER_LABELS.length]);
    setAssistantNotice(`${markerLabel} marker inserito a ${formatTime(time)}.`);
  };

  const startMeterLoop = () => {
    if (meterFrameRef.current) return;
    const tick = () => {
      const leftAnalyser = analyserLeftRef.current;
      const rightAnalyser = analyserRightRef.current;
      let left = 0;
      let right = 0;

      if (leftAnalyser && rightAnalyser) {
        const leftData = meterLeftDataRef.current;
        const rightData = meterRightDataRef.current;
        leftAnalyser.getFloatTimeDomainData(leftData);
        rightAnalyser.getFloatTimeDomainData(rightData);
        let leftSum = 0;
        let rightSum = 0;
        for (let index = 0; index < leftData.length; index += 1) {
          leftSum += leftData[index] * leftData[index];
          rightSum += rightData[index] * rightData[index];
        }
        left = Math.sqrt(leftSum / leftData.length);
        right = Math.sqrt(rightSum / rightData.length);
      }

      left = Math.max(left, fallbackMeterRef.current.left);
      right = Math.max(right, fallbackMeterRef.current.right);

      setMasterMeter(current => ({
        left: current.left * 0.55 + left * 0.45,
        right: current.right * 0.55 + right * 0.45,
        peakLeft: Math.max(left, current.peakLeft * 0.992),
        peakRight: Math.max(right, current.peakRight * 0.992)
      }));
      meterFrameRef.current = requestAnimationFrame(tick);
    };
    meterFrameRef.current = requestAnimationFrame(tick);
  };

  const ensureAudioEngine = async () => {
    const AudioCtor = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtor) throw new Error('Web Audio non supportato dal browser.');

    let context = audioContextRef.current;
    if (!context || context.state === 'closed') {
      context = new AudioCtor();
      audioContextRef.current = context;

      const master = context.createGain();
      master.gain.value = masterMuted ? 0 : masterVolume;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -1.2;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.08;
      const splitter = context.createChannelSplitter(2);
      const left = context.createAnalyser();
      const right = context.createAnalyser();
      left.fftSize = 256;
      right.fftSize = 256;
      left.smoothingTimeConstant = 0.72;
      right.smoothingTimeConstant = 0.72;

      master.connect(limiter);
      limiter.connect(context.destination);
      limiter.connect(splitter);
      splitter.connect(left, 0);
      splitter.connect(right, 1);

      masterGainNodeRef.current = master;
      masterLimiterRef.current = limiter;
      analyserLeftRef.current = left;
      analyserRightRef.current = right;
      startMeterLoop();
    }

    if (context.state === 'suspended') await context.resume();
    return context;
  };

  useEffect(() => {
    if (masterGainNodeRef.current) masterGainNodeRef.current.gain.value = masterMuted ? 0 : masterVolume;
  }, [masterVolume, masterMuted]);

  const canRouteThroughWebAudio = (src: string) => {
    try {
      const url = new URL(src, window.location.href);
      return url.protocol === 'blob:' || url.protocol === 'data:' || url.origin === window.location.origin;
    } catch {
      return true;
    }
  };

  const preparePlayback = async () => {
    const context = await ensureAudioEngine();
    const master = masterGainNodeRef.current;
    if (!master) return;

    for (const track of tracks) {
      for (const clip of track.clips) {
        if (!clip.src || clip.kind === 'midi') continue;
        let audio = audioElements.current.get(clip.id);
        if (!audio) {
          audio = new Audio(clip.src);
          audio.preload = 'auto';
          if ('preservesPitch' in audio) (audio as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = false;
          audioElements.current.set(clip.id, audio);
        }

        audio.playbackRate = Math.pow(2, track.pitch / 12);
        if (!canRouteThroughWebAudio(clip.src)) {
          directClips.current.add(clip.id);
          audio.volume = clamp(track.volume * (masterMuted ? 0 : masterVolume), 0, 1);
          continue;
        }

        if (!clipGraphs.current.has(clip.id)) {
          try {
            const source = context.createMediaElementSource(audio);
            const gain = context.createGain();
            const panner = context.createStereoPanner();
            source.connect(gain).connect(panner).connect(master);
            clipGraphs.current.set(clip.id, { source, gain, panner });
          } catch {
            directClips.current.add(clip.id);
          }
        }

        const graph = clipGraphs.current.get(clip.id);
        if (graph) {
          audio.volume = 1;
          graph.gain.gain.value = track.volume;
          graph.panner.pan.value = clamp(track.pan / 100, -1, 1);
        }
      }
    }
  };

  const emitMetronomeClick = (accent: boolean) => {
    const context = audioContextRef.current;
    if (!context || context.state === 'closed') return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = accent ? 1760 : 1180;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(accent ? 0.18 : 0.11, context.currentTime + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.055);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.06);
  };

  const runCountIn = async (token: number) => {
    if (!countInBars) return true;
    await ensureAudioEngine();
    setCountingIn(true);
    const totalBeats = countInBars * 4;
    const beatMilliseconds = 60000 / Math.max(1, bpm);
    for (let beat = 0; beat < totalBeats; beat += 1) {
      if (token !== transportTokenRef.current) {
        setCountingIn(false);
        setCountInBeat(0);
        return false;
      }
      setCountInBeat(totalBeats - beat);
      emitMetronomeClick(beat % 4 === 0);
      await sleep(beatMilliseconds);
    }
    setCountingIn(false);
    setCountInBeat(0);
    return token === transportTokenRef.current;
  };

  const syncClips = (time: number) => {
    let fallbackLeft = 0;
    let fallbackRight = 0;

    for (const track of tracks) {
      const audible = !track.mute && (!anySolo || track.solo);
      for (const clip of track.clips) {
        if (!clip.src || clip.kind === 'midi') continue;
        const active = audible && !masterMuted && time >= clip.start && time < clip.start + clip.duration;
        const audio = audioElements.current.get(clip.id);
        if (!audio) continue;
        const graph = clipGraphs.current.get(clip.id);

        audio.playbackRate = Math.pow(2, track.pitch / 12);
        if (graph) {
          graph.gain.gain.value = track.volume;
          graph.panner.pan.value = clamp(track.pan / 100, -1, 1);
        } else {
          audio.volume = clamp(track.volume * masterVolume, 0, 1);
        }

        if (active && !playingClips.current.has(clip.id)) {
          audio.currentTime = Math.max(0, clip.offset + (time - clip.start));
          void audio.play().catch(() => undefined);
          playingClips.current.add(clip.id);
        } else if (!active && playingClips.current.has(clip.id)) {
          audio.pause();
          playingClips.current.delete(clip.id);
        }

        if (active && directClips.current.has(clip.id)) {
          const level = clamp(track.volume * masterVolume * 0.72, 0, 1.2);
          const pan = clamp(track.pan / 100, -1, 1);
          const angle = (pan + 1) * Math.PI / 4;
          fallbackLeft = Math.max(fallbackLeft, level * Math.cos(angle));
          fallbackRight = Math.max(fallbackRight, level * Math.sin(angle));
        }
      }
    }
    fallbackMeterRef.current = { left: fallbackLeft, right: fallbackRight };
  };

  const stopPlayback = (reset = false) => {
    transportTokenRef.current += 1;
    setPlaying(false);
    setCountingIn(false);
    setCountInBeat(0);
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    audioElements.current.forEach(audio => audio.pause());
    playingClips.current.clear();
    lastMetronomeBeatRef.current = -1;
    fallbackMeterRef.current = { left: 0, right: 0 };
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    if (reset) setPlayhead(0);
  };

  const beginPlayback = (token: number, startAt: number) => {
    if (token !== transportTokenRef.current) return;
    setPlaying(true);
    lastMetronomeBeatRef.current = -1;
    const started = performance.now() - startAt * 1000;

    const tick = () => {
      if (token !== transportTokenRef.current) return;
      const next = (performance.now() - started) / 1000;
      if (next >= totalDuration) {
        if (loop && !recording) {
          audioElements.current.forEach(audio => audio.pause());
          playingClips.current.clear();
          setPlayhead(0);
          beginPlayback(token, 0);
          return;
        }
        stopPlayback(true);
        return;
      }

      setPlayhead(next);
      syncClips(next);

      if (metronome) {
        const beatSeconds = 60 / Math.max(1, bpm);
        const beatIndex = Math.floor((next + 0.002) / beatSeconds);
        if (beatIndex !== lastMetronomeBeatRef.current) {
          emitMetronomeClick(beatIndex % 4 === 0);
          lastMetronomeBeatRef.current = beatIndex;
        }
      }

      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  const startPlayback = async (skipCountIn = false) => {
    if (playing || countingIn) return;
    const token = ++transportTokenRef.current;
    try {
      await preparePlayback();
      if (!skipCountIn) {
        const completed = await runCountIn(token);
        if (!completed) return;
      }
      beginPlayback(token, playhead);
    } catch (error) {
      setAssistantNotice(error instanceof Error ? error.message : String(error));
    }
  };

  const stopRecordingStream = () => {
    recordingStreamRef.current?.getTracks().forEach(track => track.stop());
    recordingStreamRef.current = null;
  };

  const startRecording = async () => {
    if (recording) {
      stopPlayback(false);
      return;
    }

    const armedTracks = tracks.filter(track => track.armed && track.kind !== 'midi');
    if (!armedTracks.length) {
      setAssistantNotice('Arma almeno una traccia audio con il tasto R, oppure crea + TRACK.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      setAssistantNotice('Registrazione microfono non supportata da questo browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recordingStreamRef.current = stream;

      let token = transportTokenRef.current;
      if (!playing) {
        token = ++transportTokenRef.current;
        await preparePlayback();
        const completed = await runCountIn(token);
        if (!completed) {
          stopRecordingStream();
          return;
        }
      }

      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, preferred ? { mimeType: preferred } : undefined);
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingStartRef.current = playhead;
      recordingTrackIdsRef.current = armedTracks.map(track => track.id);

      recorder.ondataavailable = event => {
        if (event.data.size > 0) recordingChunksRef.current.push(event.data);
      };

      recorder.onerror = () => {
        setAssistantNotice('Errore durante la registrazione audio.');
      };

      recorder.onstop = () => {
        const chunks = recordingChunksRef.current;
        const armedIds = [...recordingTrackIdsRef.current];
        const startAt = recordingStartRef.current;
        const type = recorder.mimeType || preferred || 'audio/webm';
        setRecording(false);
        stopRecordingStream();
        if (!chunks.length) return;

        const blob = new Blob(chunks, { type });
        const url = URL.createObjectURL(blob);
        void probeDuration(url).then(duration => {
          let firstClipId = '';
          setTracks(current => current.map(track => {
            if (!armedIds.includes(track.id)) return track;
            const clipId = uid('recording');
            if (!firstClipId) firstClipId = clipId;
            const clip: Clip = {
              id: clipId,
              name: `Recording ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`,
              src: url,
              start: snapTime(startAt),
              offset: 0,
              duration,
              kind: track.kind === 'vocal' ? 'vocal' : 'audio'
            };
            return { ...track, clips: [...track.clips, clip] };
          }));
          if (armedIds[0]) setSelectedTrackId(armedIds[0]);
          if (firstClipId) setSelectedClipId(firstClipId);
          setAssistantNotice(`Registrazione acquisita realmente: ${formatTime(duration)} su ${armedIds.length} traccia/e armata/e.`);
        });
      };

      recorder.start(200);
      setRecording(true);
      setAssistantNotice(`REC attivo su ${armedTracks.map(track => track.name).join(', ')}.`);
      if (!playing) beginPlayback(token, playhead);
    } catch (error) {
      stopRecordingStream();
      setAssistantNotice(error instanceof Error ? `Registrazione non disponibile: ${error.message}` : 'Registrazione non disponibile.');
    }
  };

  useEffect(() => () => {
    transportTokenRef.current += 1;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current);
    audioElements.current.forEach(audio => audio.pause());
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop();
    stopRecordingStream();
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') void audioContextRef.current.close();
  }, []);

  useEffect(() => {
    if (!musicalTyping) return;
    const notes: Record<string, number> = { a: 60, w: 61, s: 62, e: 63, d: 64, f: 65, t: 66, g: 67, y: 68, h: 69, u: 70, j: 71, k: 72 };
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat || !notes[event.key.toLowerCase()] || ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)) return;
      void ensureAudioEngine().then(context => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const midi = notes[event.key.toLowerCase()];
        oscillator.type = 'sawtooth';
        oscillator.frequency.value = 440 * Math.pow(2, (midi - 69) / 12);
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.42);
        oscillator.connect(gain).connect(masterGainNodeRef.current || context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.45);
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [musicalTyping]);

  const renderTracks = async (sourceTracks: Track[]) => {
    const audibleTracks = sourceTracks.filter(track => !track.mute && (!sourceTracks.some(item => item.solo) || track.solo));
    const audioClips = audibleTracks.flatMap(track => track.clips.filter(clip => clip.src).map(clip => ({ track, clip })));
    if (!audioClips.length) throw new Error('Nessuna clip audio reale da renderizzare.');
    const duration = Math.min(MAX_TIMELINE_SECONDS, Math.max(1, ...audioClips.map(({ clip }) => clip.start + clip.duration)));
    const sampleRate = 48000;
    const OfflineCtor = window.OfflineAudioContext || (window as any).webkitOfflineAudioContext;
    if (!OfflineCtor) throw new Error('Offline AudioContext non supportato dal browser.');
    const offline: OfflineAudioContext = new OfflineCtor(2, Math.ceil(duration * sampleRate), sampleRate);

    const master = offline.createGain();
    master.gain.value = masterMuted ? 0 : masterVolume;
    const limiter = offline.createDynamicsCompressor();
    limiter.threshold.value = -1.2;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.08;
    master.connect(limiter).connect(offline.destination);

    for (const { track, clip } of audioClips) {
      const decoded = await decodeAudioFromUrl(String(clip.src));
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.playbackRate.value = Math.pow(2, track.pitch / 12);

      const gain = offline.createGain();
      gain.gain.value = track.volume;
      for (const point of [...track.automation].sort((a, b) => a.time - b.time)) {
        if (point.time <= duration) gain.gain.linearRampToValueAtTime(clamp(point.value, 0, 1), point.time);
      }

      const low = offline.createBiquadFilter();
      low.type = 'lowshelf';
      low.frequency.value = 180;
      low.gain.value = track.low;
      const mid = offline.createBiquadFilter();
      mid.type = 'peaking';
      mid.frequency.value = 1600;
      mid.Q.value = 0.8;
      mid.gain.value = track.mid;
      const high = offline.createBiquadFilter();
      high.type = 'highshelf';
      high.frequency.value = 7000;
      high.gain.value = track.high;
      const compressor = offline.createDynamicsCompressor();
      compressor.threshold.value = -8 - track.compression * 0.34;
      compressor.knee.value = 20;
      compressor.ratio.value = 1 + track.compression * 0.08;
      compressor.attack.value = 0.008;
      compressor.release.value = 0.2;
      const panner = offline.createStereoPanner();
      panner.pan.value = track.pan / 100;

      source.connect(gain).connect(low).connect(mid).connect(high).connect(compressor).connect(panner).connect(master);

      if (track.reverb > 0) {
        const convolver = offline.createConvolver();
        const impulseLength = Math.floor(sampleRate * 1.8);
        const impulse = offline.createBuffer(2, impulseLength, sampleRate);
        for (let channel = 0; channel < 2; channel += 1) {
          const data = impulse.getChannelData(channel);
          for (let index = 0; index < impulseLength; index += 1) data[index] = (Math.random() * 2 - 1) * Math.pow(1 - index / impulseLength, 3);
        }
        convolver.buffer = impulse;
        const wet = offline.createGain();
        wet.gain.value = clamp(track.reverb / 100, 0, 0.5);
        high.connect(convolver).connect(wet).connect(master);
      }

      const availableSource = Math.max(0.05, Math.min(clip.duration, decoded.duration - clip.offset));
      source.start(clip.start, Math.max(0, clip.offset), availableSource);
    }

    return offline.startRendering();
  };

  const exportMix = async (float = true) => {
    if (rendering) return;
    setRendering(true);
    setAssistantNotice('Rendering multitraccia reale a 48 kHz attraverso il master limiter...');
    try {
      const rendered = await renderTracks(tracks);
      const blob = float ? float32Wav(rendered) : audioBufferToWav(rendered);
      downloadBlob(blob, `${safeAudioFilename(projectName)}-${float ? '32bit-48k' : 'pcm16'}`, 'wav');
      setAssistantNotice(`Mix esportato realmente in WAV ${float ? '32-bit float / 48 kHz' : 'PCM 16-bit'} con master channel.`);
    } catch (error) {
      setAssistantNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setRendering(false);
    }
  };

  const exportMultitrack = async () => {
    if (rendering) return;
    setRendering(true);
    setAssistantNotice('Rendering stems time-aligned a 48 kHz...');
    try {
      const audioTracks = tracks.filter(track => track.clips.some(clip => clip.src));
      if (!audioTracks.length) throw new Error('Nessuna traccia audio reale da esportare.');
      for (const track of audioTracks) {
        const rendered = await renderTracks([{ ...track, mute: false, solo: false }]);
        downloadBlob(float32Wav(rendered), `${safeAudioFilename(projectName)}-${safeAudioFilename(track.name)}-32bit-48k`, 'wav');
      }
      setAssistantNotice(`${audioTracks.length} stem WAV 32-bit/48 kHz renderizzati e scaricati.`);
    } catch (error) {
      setAssistantNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setRendering(false);
    }
  };

  const saveProject = () => {
    setSaving(true);
    try {
      const project = {
        version: 3,
        name: projectName,
        bpm,
        keySignature,
        tracks,
        markers,
        quantize,
        metronome,
        countInBars,
        masterVolume,
        savedAt: new Date().toISOString()
      };
      localStorage.setItem('sonara.studio.project.v3', JSON.stringify(project));
      setAssistantNotice('Sessione Studio Pro salvata sul dispositivo.');
    } catch {
      setAssistantNotice('Impossibile salvare la sessione sul dispositivo.');
    } finally {
      window.setTimeout(() => setSaving(false), 350);
    }
  };

  const runAssistant = () => {
    const command = assistantText.trim();
    if (!command) return;
    const lower = command.toLowerCase();
    const bpmMatch = lower.match(/\b(?:bpm|tempo)\D{0,8}(\d{2,3})\b/) || lower.match(/\b(\d{2,3})\s*bpm\b/);
    if (bpmMatch) {
      const next = clamp(Number(bpmMatch[1]), 40, 220);
      onBpmChange?.(next);
      setAssistantNotice(`Tempo impostato a ${next} BPM.`);
    } else if (lower.includes('metronom') || lower.includes('click')) {
      setMetronome(true);
      setAssistantNotice('Metronomo attivato.');
    } else if (lower.includes('marker') || lower.includes('segnaposto')) {
      addMarker();
    } else if (lower.includes('traccia audio')) {
      addAudioTrack();
    } else if (lower.includes('midi') || lower.includes('synth')) {
      addMidiTrack();
      setAssistantNotice('Nuova traccia MIDI / Synth aggiunta alla posizione del playhead.');
    } else if (lower.includes('market') || lower.includes('sample') || lower.includes('loop')) {
      onOpenMarket?.();
      setAssistantNotice('Apro Music Market per cercare sample, loop e preset.');
    } else if (lower.includes('stem')) {
      stemInputRef.current?.click();
      setAssistantNotice('Seleziona gli stem reali da importare come tracce separate.');
    } else if (lower.includes('master') || lower.includes('mix')) {
      onOpenProduction?.();
      setAssistantNotice('Apro la suite Produzione / Mastering SONARA.');
    } else {
      setAssistantNotice('Prova: “tempo 128 BPM”, “attiva metronomo”, “aggiungi marker”, “traccia audio”, “aggiungi synth”, “importa stem” oppure “apri mastering”.');
    }
    setAssistantText('');
  };

  const addAutomationPoint = () => {
    if (!selectedTrack) return;
    const next = [...selectedTrack.automation.filter(point => Math.abs(point.time - playhead) > 0.05), { time: playhead, value: selectedTrack.volume }].sort((a, b) => a.time - b.time);
    updateTrack(selectedTrack.id, { automation: next }, true);
  };

  const timelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const scrollLeft = event.currentTarget.parentElement?.scrollLeft || 0;
    setPlayhead(snapTime((event.clientX - rect.left + scrollLeft) / pxPerSecond));
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-[#05070c] shadow-2xl shadow-black/40">
      <input ref={audioInputRef} type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac,.webm" className="hidden" onChange={event => void importFiles(event.target.files)} />
      <input ref={stemInputRef} type="file" multiple accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a,.aac,.webm" className="hidden" onChange={event => void importFiles(event.target.files, true)} />
      <input ref={midiInputRef} type="file" multiple accept=".mid,.midi,audio/midi,audio/x-midi" className="hidden" onChange={event => importMidi(event.target.files)} />

      <header className="border-b border-slate-800 bg-slate-950/95 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-fuchsia-600 to-indigo-600 shadow-lg shadow-purple-950/40"><Music2 className="h-4 w-4 text-white" /></div>
            <div className="min-w-0">
              <div className="flex items-center gap-2"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-purple-300">SONARA STUDIO PRO</span><span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black text-emerald-300">LIVE DAW</span></div>
              <input value={projectName} onChange={event => setProjectName(event.target.value)} className="mt-0.5 w-full min-w-48 bg-transparent text-sm font-black text-white outline-none" aria-label="Nome progetto" />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={undo} disabled={!history.length} className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300 disabled:opacity-30" title="Undo"><Undo2 className="h-4 w-4" /></button>
            <button onClick={redo} disabled={!future.length} className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300 disabled:opacity-30" title="Redo"><Redo2 className="h-4 w-4" /></button>
            <button onClick={saveProject} className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-[10px] font-black text-slate-200">{saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} SALVA</button>
            <button onClick={onOpenMarket} className="flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/10 px-3 py-2 text-[10px] font-black text-violet-200"><ShoppingBag className="h-3.5 w-3.5" /> MUSIC MARKET</button>
            <div className="relative group">
              <button className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-fuchsia-600 to-indigo-600 px-3 py-2 text-[10px] font-black text-white"><Download className="h-3.5 w-3.5" /> EXPORT <ChevronDown className="h-3 w-3" /></button>
              <div className="invisible absolute right-0 top-full z-50 mt-2 w-56 rounded-xl border border-slate-700 bg-slate-950 p-1.5 opacity-0 shadow-2xl transition group-hover:visible group-hover:opacity-100">
                <button onClick={() => void exportMix(true)} className="w-full rounded-lg px-3 py-2 text-left text-[10px] font-bold text-slate-200 hover:bg-slate-800">Full mix · WAV 32-bit / 48 kHz</button>
                <button onClick={() => void exportMix(false)} className="w-full rounded-lg px-3 py-2 text-left text-[10px] font-bold text-slate-200 hover:bg-slate-800">Full mix · WAV PCM 16-bit</button>
                <button onClick={() => void exportMultitrack()} className="w-full rounded-lg px-3 py-2 text-left text-[10px] font-bold text-slate-200 hover:bg-slate-800">Multitrack · stem time-aligned</button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex min-h-[690px] flex-col xl:flex-row">
        <aside className="w-full shrink-0 border-b border-slate-800 bg-[#080b12] p-3 xl:w-56 xl:border-b-0 xl:border-r">
          <div className="grid grid-cols-3 gap-2 xl:grid-cols-1">
            <button onClick={() => audioInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-[10px] font-black text-slate-300 hover:border-purple-500/40"><Upload className="h-3.5 w-3.5" /> AUDIO</button>
            <button onClick={() => stemInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-[10px] font-black text-slate-300 hover:border-cyan-500/40"><Layers3 className="h-3.5 w-3.5" /> STEM</button>
            <button onClick={() => midiInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-[10px] font-black text-slate-300 hover:border-emerald-500/40"><KeyboardMusic className="h-3.5 w-3.5" /> MIDI</button>
          </div>
          <div className="mt-4 border-t border-slate-800 pt-4">
            <div className="mb-2 text-[9px] font-black uppercase tracking-[0.18em] text-slate-600">Sessione</div>
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-1">
              <button onClick={addAudioTrack} className="flex items-center gap-2 rounded-lg px-2 py-2 text-[10px] font-bold text-slate-400 hover:bg-slate-900 hover:text-white"><Plus className="h-3.5 w-3.5" /> Nuova traccia audio</button>
              <button onClick={addMidiTrack} className="flex items-center gap-2 rounded-lg px-2 py-2 text-[10px] font-bold text-slate-400 hover:bg-slate-900 hover:text-white"><Plus className="h-3.5 w-3.5" /> Nuova traccia MIDI</button>
              <button onClick={onOpenProduction} className="flex items-center gap-2 rounded-lg px-2 py-2 text-[10px] font-bold text-slate-400 hover:bg-slate-900 hover:text-white"><SlidersHorizontal className="h-3.5 w-3.5" /> Mix / Master</button>
              <button onClick={() => setMusicalTyping(value => !value)} className={`flex items-center gap-2 rounded-lg px-2 py-2 text-[10px] font-bold ${musicalTyping ? 'bg-emerald-500/10 text-emerald-300' : 'text-slate-400 hover:bg-slate-900 hover:text-white'}`}><KeyboardMusic className="h-3.5 w-3.5" /> Musical typing</button>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-3">
            <div className="text-[9px] font-black uppercase tracking-wider text-slate-600">Project</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
              <label className="text-slate-500">BPM<input type="number" min={40} max={220} value={bpm} onChange={event => onBpmChange?.(clamp(Number(event.target.value), 40, 220))} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 p-2 font-black text-white outline-none" /></label>
              <div className="text-slate-500">Key<div className="mt-1 rounded-lg border border-slate-800 bg-slate-900 p-2 font-black text-white">{keySignature}</div></div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 bg-[#06080d]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/75 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => playing ? stopPlayback() : void startPlayback()} disabled={countingIn} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black disabled:opacity-50">{playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}</button>
              <button onClick={() => stopPlayback(true)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300"><Square className="h-3.5 w-3.5 fill-current" /></button>
              <button onClick={() => void startRecording()} className={`flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[9px] font-black ${recording ? 'border-rose-400 bg-rose-500 text-white shadow-[0_0_16px_rgba(244,63,94,.35)]' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`} title="Registra sulle tracce armate"><Mic2 className="h-3.5 w-3.5" /> {recording ? 'REC' : 'REC'}</button>
              <button onClick={addAudioTrack} className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2 text-[9px] font-black text-slate-400" title="Crea traccia audio armata"><Plus className="h-3.5 w-3.5" /> TRACK</button>
              <div className="min-w-20 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-center font-mono text-xs font-black text-white">{countingIn ? `-${countInBeat}` : formatTime(playhead)}</div>
              <button onClick={() => setMetronome(value => !value)} className={`rounded-lg border px-2 py-2 text-[9px] font-black ${metronome ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : 'border-slate-800 bg-slate-900 text-slate-500'}`}>CLICK</button>
              <select value={countInBars} onChange={event => setCountInBars(Number(event.target.value) as 0 | 1 | 2)} className="h-8 rounded-lg border border-slate-800 bg-slate-900 px-2 text-[9px] font-black text-slate-400 outline-none" title="Count-in">
                <option value={0}>IN OFF</option><option value={1}>IN 1 BAR</option><option value={2}>IN 2 BAR</option>
              </select>
              <button onClick={() => setLoop(value => !value)} className={`rounded-lg border px-2 py-2 text-[9px] font-black ${loop ? 'border-purple-500/50 bg-purple-500/15 text-purple-200' : 'border-slate-800 bg-slate-900 text-slate-500'}`}>LOOP</button>
              <button onClick={() => setSnap(value => !value)} className={`rounded-lg border px-2 py-2 text-[9px] font-black ${snap ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200' : 'border-slate-800 bg-slate-900 text-slate-500'}`}>Q</button>
              <select value={quantize} onChange={event => setQuantize(event.target.value as QuantizeValue)} disabled={!snap} className="h-8 rounded-lg border border-slate-800 bg-slate-900 px-2 text-[9px] font-black text-slate-400 outline-none disabled:opacity-40" title="Quantizzazione">
                <option>1/4</option><option>1/8</option><option>1/16</option><option>1/32</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-8 items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1">
                <select value={markerLabel} onChange={event => setMarkerLabel(event.target.value as MarkerLabel)} className="h-6 bg-transparent px-1 text-[8px] font-black text-slate-400 outline-none">{MARKER_LABELS.map(label => <option key={label} value={label}>{label}</option>)}</select>
                <button onClick={addMarker} className="h-6 rounded bg-slate-800 px-2 text-[8px] font-black text-white">+ MARK</button>
              </div>
              <button onClick={splitSelectedClip} className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300" title="Split"><Scissors className="h-3.5 w-3.5" /></button>
              <button onClick={duplicateSelectedClip} className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300" title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
              <button onClick={deleteSelectedClip} className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-rose-300" title="Delete clip"><Trash2 className="h-3.5 w-3.5" /></button>
              <button onClick={() => setZoom(value => clamp(value - 0.15, 0.55, 2.2))} className="p-2 text-slate-500"><ZoomOut className="h-4 w-4" /></button>
              <span className="w-10 text-center text-[9px] font-black text-slate-500">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom(value => clamp(value + 0.15, 0.55, 2.2))} className="p-2 text-slate-500"><ZoomIn className="h-4 w-4" /></button>

              <div className="ml-1 flex h-10 items-center gap-2 rounded-lg border border-slate-800 bg-[#080b10] px-2" title={`Master peak ${Math.max(toDb(masterMeter.peakLeft), toDb(masterMeter.peakRight)).toFixed(1)} dBFS`}>
                <button onClick={() => setMasterMuted(value => !value)} className={`text-[8px] font-black ${masterMuted ? 'text-rose-300' : 'text-slate-500'}`}>MASTER</button>
                <div className="w-14 space-y-1">
                  <div className="flex items-center gap-1"><span className="w-2 text-[7px] text-slate-600">L</span><div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400 transition-[width] duration-75" style={{ width: `${meterPercent(masterMeter.left)}%` }} /></div></div>
                  <div className="flex items-center gap-1"><span className="w-2 text-[7px] text-slate-600">R</span><div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400 transition-[width] duration-75" style={{ width: `${meterPercent(masterMeter.right)}%` }} /></div></div>
                </div>
                <input type="range" min={0} max={1.25} step={0.01} value={masterVolume} onChange={event => setMasterVolume(Number(event.target.value))} className="w-16 accent-emerald-400" aria-label="Master volume" />
                <button onClick={() => setMasterMeter({ left: 0, right: 0, peakLeft: 0, peakRight: 0 })} className="w-10 text-right font-mono text-[8px] font-bold text-slate-400">{Math.max(toDb(masterMeter.peakLeft), toDb(masterMeter.peakRight)).toFixed(1)}</button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto border-b border-slate-800" style={{ maxHeight: 500 }}>
            <div className="sticky top-0 z-20 flex h-10 border-b border-slate-800 bg-[#090c13]" style={{ width: 190 + timelineWidth }}>
              <div className="sticky left-0 z-30 flex w-[190px] shrink-0 items-center border-r border-slate-800 bg-[#090c13] px-3 text-[9px] font-black uppercase tracking-wider text-slate-600">Tracks</div>
              <div className="relative h-full" style={{ width: timelineWidth }}>
                {Array.from({ length: Math.floor(totalDuration / 10) + 1 }, (_, index) => index * 10).map(second => <div key={second} className="absolute top-0 h-full border-l border-slate-800/80 pl-1 pt-1 text-[8px] text-slate-600" style={{ left: second * pxPerSecond }}>{formatTime(second)}</div>)}
                {markers.map(marker => <button key={marker.id} onClick={() => setPlayhead(marker.time)} onDoubleClick={() => setMarkers(current => current.filter(item => item.id !== marker.id))} className="absolute bottom-0 z-10 -translate-x-1/2 rounded-t border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-0.5 text-[7px] font-black text-cyan-200" style={{ left: marker.time * pxPerSecond }} title="Click: vai al marker · doppio click: elimina">{marker.label}</button>)}
              </div>
            </div>

            {tracks.length === 0 && (
              <div className="flex min-h-[330px] w-full items-center justify-center p-8">
                <div className="max-w-md text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/10 text-purple-300"><WandSparkles className="h-6 w-6" /></div><h3 className="mt-4 text-lg font-black text-white">Inizia una sessione SONARA Studio Pro</h3><p className="mt-2 text-xs leading-5 text-slate-500">Importa audio o stem, crea MIDI oppure aggiungi una traccia audio e registra realmente dal microfono/interfaccia del browser.</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button onClick={() => audioInputRef.current?.click()} className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-black text-white">Importa audio</button><button onClick={addAudioTrack} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-black text-rose-200">Crea traccia REC</button><button onClick={addMidiTrack} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-black text-white">Crea MIDI</button></div></div>
              </div>
            )}

            {tracks.map(track => (
              <div key={track.id} className={`flex min-h-[86px] border-b border-slate-800/80 ${selectedTrackId === track.id ? 'bg-purple-500/[0.025]' : ''}`} style={{ width: 190 + timelineWidth }}>
                <div className="sticky left-0 z-10 w-[190px] shrink-0 border-r border-slate-800 bg-[#090c13] p-2.5">
                  <div className="flex items-start gap-2">
                    <button onClick={() => setSelectedTrackId(track.id)} className="min-w-0 flex-1 text-left"><div className="truncate text-[11px] font-black text-white">{track.name}</div><div className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-600">{track.kind}{track.armed ? ' · ARMED' : ''}</div></button>
                    <button onClick={() => removeTrack(track.id)} className="text-slate-700 hover:text-rose-300"><Trash2 className="h-3 w-3" /></button>
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <button disabled={track.kind === 'midi'} onClick={() => updateTrack(track.id, { armed: !track.armed })} className={`h-6 w-6 rounded text-[8px] font-black disabled:cursor-not-allowed disabled:opacity-25 ${track.armed ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,.3)]' : 'bg-slate-800 text-slate-500'}`} title={track.kind === 'midi' ? 'Record arm audio non disponibile per MIDI' : 'Record arm'}>R</button>
                    <button onClick={() => updateTrack(track.id, { mute: !track.mute })} className={`h-6 w-6 rounded text-[8px] font-black ${track.mute ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-500'}`}>M</button>
                    <button onClick={() => updateTrack(track.id, { solo: !track.solo })} className={`h-6 w-6 rounded text-[8px] font-black ${track.solo ? 'bg-emerald-400 text-black' : 'bg-slate-800 text-slate-500'}`}>S</button>
                    <Volume2 className="ml-0.5 h-3 w-3 text-slate-600" />
                    <input type="range" min={0} max={1} step={0.01} value={track.volume} onChange={event => updateTrack(track.id, { volume: Number(event.target.value) })} className="w-16 accent-purple-500" />
                  </div>
                </div>

                <div className="relative min-h-[86px] bg-[linear-gradient(to_right,rgba(51,65,85,.2)_1px,transparent_1px)]" style={{ width: timelineWidth, backgroundSize: `${Math.max(20, pxPerSecond * ((60 / Math.max(1, bpm)) / QUANTIZE_DIVISOR[quantize]))}px 100%` }} onClick={timelineClick} onDragOver={event => event.preventDefault()} onDrop={event => {
                  const clipId = event.dataTransfer.getData('text/sonara-clip');
                  if (!clipId) return;
                  const rect = event.currentTarget.getBoundingClientRect();
                  const start = (event.clientX - rect.left) / pxPerSecond;
                  const sourceTrack = tracks.find(item => item.clips.some(clip => clip.id === clipId));
                  const clip = sourceTrack?.clips.find(item => item.id === clipId);
                  if (!sourceTrack || !clip) return;
                  pushHistory();
                  setTracks(current => current.map(item => {
                    if (item.id === sourceTrack.id && item.id !== track.id) return { ...item, clips: item.clips.filter(existing => existing.id !== clipId) };
                    if (item.id === track.id) return { ...item, clips: [...item.clips.filter(existing => existing.id !== clipId), { ...clip, kind: track.kind, start: snapTime(start) }] };
                    return item;
                  }));
                  setSelectedTrackId(track.id);
                }}>
                  {track.clips.map(clip => (
                    <button
                      key={clip.id}
                      draggable
                      onDragStart={event => event.dataTransfer.setData('text/sonara-clip', clip.id)}
                      onClick={event => { event.stopPropagation(); setSelectedTrackId(track.id); setSelectedClipId(clip.id); }}
                      className={`absolute top-2 h-[68px] overflow-hidden rounded-lg border bg-gradient-to-r px-2 text-left shadow-lg ${TRACK_COLORS[clip.kind]} ${selectedClipId === clip.id ? 'border-white/70 ring-2 ring-white/20' : 'border-white/10'}`}
                      style={{ left: clip.start * pxPerSecond, width: Math.max(34, clip.duration * pxPerSecond) }}
                    >
                      <div className="truncate text-[9px] font-black text-white">{clip.name}</div>
                      <div className="mt-1 flex h-8 items-end gap-[2px] overflow-hidden opacity-55">{Array.from({ length: Math.min(70, Math.max(10, Math.floor(clip.duration / 2))) }, (_, index) => <span key={index} className="w-[2px] shrink-0 rounded-full bg-white" style={{ height: `${20 + ((index * 37) % 75)}%` }} />)}</div>
                      <div className="mt-1 text-[7px] font-bold text-white/60">{formatTime(clip.duration)} {clip.kind === 'midi' ? '· MIDI' : '· AUDIO'}</div>
                    </button>
                  ))}
                  <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-fuchsia-400 shadow-[0_0_10px_rgba(232,121,249,.9)]" style={{ left: playhead * pxPerSecond }} />
                </div>
              </div>
            ))}
          </div>

          <div className="grid border-b border-slate-800 lg:grid-cols-[1fr_320px]">
            <div className="border-b border-slate-800 p-3 lg:border-b-0 lg:border-r">
              <div className="mb-3 flex flex-wrap gap-2">
                {(['mixer', 'effects', 'automation', 'synth'] as const).map(id => <button key={id} onClick={() => setPanel(id)} className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-wider ${panel === id ? 'bg-purple-600 text-white' : 'border border-slate-800 bg-slate-950 text-slate-500'}`}>{id}</button>)}
              </div>
              {!selectedTrack ? <div className="py-8 text-center text-xs text-slate-600">Seleziona una traccia per modificarla.</div> : (
                <div>
                  {panel === 'mixer' && <div className="grid gap-3 sm:grid-cols-3"><label className="text-[9px] font-bold text-slate-500">Volume <span className="float-right text-white">{Math.round(selectedTrack.volume * 100)}%</span><input type="range" min={0} max={1} step={0.01} value={selectedTrack.volume} onChange={event => updateTrack(selectedTrack.id, { volume: Number(event.target.value) })} className="mt-2 w-full accent-purple-500" /></label><label className="text-[9px] font-bold text-slate-500">Pan <span className="float-right text-white">{selectedTrack.pan}</span><input type="range" min={-100} max={100} value={selectedTrack.pan} onChange={event => updateTrack(selectedTrack.id, { pan: Number(event.target.value) })} className="mt-2 w-full accent-purple-500" /></label><label className="text-[9px] font-bold text-slate-500">Pitch / varispeed <span className="float-right text-white">{selectedTrack.pitch > 0 ? '+' : ''}{selectedTrack.pitch} st</span><input type="range" min={-12} max={12} step={1} value={selectedTrack.pitch} onChange={event => updateTrack(selectedTrack.id, { pitch: Number(event.target.value) })} className="mt-2 w-full accent-purple-500" /></label></div>}
                  {panel === 'effects' && <div className="grid gap-3 sm:grid-cols-5">{([['Low EQ', 'low', -12, 12], ['Mid EQ', 'mid', -12, 12], ['High EQ', 'high', -12, 12], ['Compression', 'compression', 0, 100], ['Reverb', 'reverb', 0, 100]] as const).map(([label, key, min, max]) => <label key={key} className="text-[9px] font-bold text-slate-500">{label}<span className="float-right text-white">{selectedTrack[key]}</span><input type="range" min={min} max={max} value={selectedTrack[key]} onChange={event => updateTrack(selectedTrack.id, { [key]: Number(event.target.value) } as Partial<Track>)} className="mt-2 w-full accent-fuchsia-500" /></label>)}</div>}
                  {panel === 'automation' && <div className="flex flex-wrap items-center gap-3"><button onClick={addAutomationPoint} className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-[10px] font-black text-purple-200"><Activity className="h-3.5 w-3.5" /> Punto volume @ {formatTime(playhead)}</button><span className="text-[9px] text-slate-500">{selectedTrack.automation.length} punti · applicati realmente nel render offline</span><button onClick={() => updateTrack(selectedTrack.id, { automation: [] }, true)} className="text-[9px] font-bold text-rose-300">Reset</button></div>}
                  {panel === 'synth' && <div className="flex flex-wrap items-center gap-3"><button onClick={() => setMusicalTyping(value => !value)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-black ${musicalTyping ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-800 bg-slate-950 text-slate-400'}`}><KeyboardMusic className="h-3.5 w-3.5" /> {musicalTyping ? 'TASTIERA ATTIVA' : 'ATTIVA TASTIERA'}</button><span className="text-[9px] text-slate-500">Tasti A W S E D F T G Y H U J K · synth sawtooth Web Audio</span></div>}
                </div>
              )}
            </div>
            <div className="bg-slate-950/60 p-3">
              <div className="flex items-center justify-between"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-purple-300"><Bot className="h-3.5 w-3.5" /> Studio AI Bar</div><span className="text-[8px] text-slate-700">BETA</span></div>
              <div className="mt-2 flex gap-2"><input value={assistantText} onChange={event => setAssistantText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') runAssistant(); }} placeholder="Es. tempo 128 BPM, metronomo, marker..." className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-[#070a10] px-3 py-2 text-[10px] text-white outline-none focus:border-purple-500" /><button onClick={runAssistant} className="rounded-lg bg-purple-600 p-2.5 text-white"><Sparkles className="h-3.5 w-3.5" /></button></div>
              <div className="mt-2 min-h-8 text-[9px] leading-4 text-slate-500">{assistantNotice}</div>
            </div>
          </div>
        </main>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-950 px-4 py-2 text-[8px] font-bold uppercase tracking-wider text-slate-600">
        <div className="flex items-center gap-4"><span className="flex items-center gap-1.5"><Gauge className="h-3 w-3" /> {bpm} BPM</span><span>{keySignature}</span><span>{tracks.length} tracks</span><span>{tracks.reduce((sum, track) => sum + track.clips.length, 0)} clips</span><span>{markers.length} markers</span></div>
        <div className="flex items-center gap-3"><span>Q {quantize}</span><span>Master {Math.round(masterVolume * 100)}%</span><span>48 kHz render</span><span>32-bit float export</span>{recording && <span className="text-rose-300">● REC</span>}{rendering && <span className="flex items-center gap-1 text-purple-300"><Loader2 className="h-3 w-3 animate-spin" /> rendering</span>}</div>
      </footer>
    </div>
  );
}
