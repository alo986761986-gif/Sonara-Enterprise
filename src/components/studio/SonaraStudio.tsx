import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bot,
  ChevronDown,
  Copy,
  Download,
  Gauge,
  Headphones,
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
type LatencyMode = 'low' | 'balanced' | 'safe';

type Clip = {
  id: string;
  name: string;
  src?: string;
  start: number;
  offset: number;
  duration: number;
  kind: TrackKind;
  sourceDuration?: number;
  waveform?: number[];
  fadeIn?: number;
  fadeOut?: number;
  takeGroup?: string;
  takeNumber?: number;
  muted?: boolean;
};

type AutomationPoint = { time: number; value: number };
type StudioMarker = { id: string; label: MarkerLabel; time: number };
type CompSection = { id: string; takeGroup: string; start: number; end: number; clipId: string };

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
  compSections: CompSection[];
  clips: Clip[];
};

type ClipAudioGraph = {
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  panner: StereoPannerNode;
};

type PunchSnapshot = {
  enabled: boolean;
  punchIn: number;
  punchOut: number;
};

type RenderSegment = { start: number; offset: number; duration: number };

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
const LATENCY_LABELS: Record<LatencyMode, string> = { low: 'LOW', balanced: 'BAL', safe: 'SAFE' };
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
const dbToGain = (db: number) => Math.pow(10, db / 20);

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
    compSections: [],
    clips: []
  };
}

function makeAudioTrack(name: string, src: string, duration = 180, kind: TrackKind = 'audio'): Track {
  const track = baseTrack(name, kind);
  track.clips = [{ id: uid('clip'), name, src, start: 0, offset: 0, duration, sourceDuration: duration, fadeIn: 0, fadeOut: 0, kind }];
  return track;
}

function makeEmptyAudioTrack(name = 'Audio Track'): Track {
  const track = baseTrack(name, 'audio');
  track.armed = true;
  return track;
}

function makeMidiTrack(name = 'MIDI / Synth'): Track {
  const track = baseTrack(name, 'midi');
  track.clips = [{ id: uid('clip'), name: 'MIDI Clip', start: 0, offset: 0, duration: 16, fadeIn: 0, fadeOut: 0, kind: 'midi' }];
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

async function analyzeWaveform(src: string, points = 96): Promise<{ waveform: number[]; duration: number }> {
  const buffer = await decodeAudioFromUrl(src);
  const bucket = Math.max(1, Math.floor(buffer.length / points));
  const stride = Math.max(1, Math.floor(bucket / 96));
  const waveform = Array.from({ length: points }, (_, point) => {
    const start = point * bucket;
    const end = Math.min(buffer.length, start + bucket);
    let peak = 0;
    for (let sample = start; sample < end; sample += stride) {
      for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
        peak = Math.max(peak, Math.abs(buffer.getChannelData(channel)[sample] || 0));
      }
    }
    return peak;
  });
  const maxPeak = Math.max(0.0001, ...waveform);
  return { waveform: waveform.map(value => clamp(value / maxPeak, 0.04, 1)), duration: buffer.duration };
}

function visibleWaveform(clip: Clip) {
  if (!clip.waveform?.length) return [];
  const sourceDuration = Math.max(clip.duration, clip.sourceDuration || clip.duration);
  const startRatio = clamp(clip.offset / sourceDuration, 0, 1);
  const endRatio = clamp((clip.offset + clip.duration) / sourceDuration, startRatio, 1);
  const startIndex = Math.floor(startRatio * clip.waveform.length);
  const endIndex = Math.max(startIndex + 1, Math.ceil(endRatio * clip.waveform.length));
  return clip.waveform.slice(startIndex, endIndex);
}

function fadeFactor(clip: Clip, timelineTime: number) {
  const local = timelineTime - clip.start;
  if (local < 0 || local > clip.duration) return 0;
  const fadeIn = clamp(clip.fadeIn || 0, 0, clip.duration / 2);
  const fadeOut = clamp(clip.fadeOut || 0, 0, clip.duration / 2);
  let factor = 1;
  if (fadeIn > 0 && local < fadeIn) factor = Math.min(factor, local / fadeIn);
  if (fadeOut > 0 && local > clip.duration - fadeOut) factor = Math.min(factor, (clip.duration - local) / fadeOut);
  return clamp(factor, 0, 1);
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
  const [panel, setPanel] = useState<'mixer' | 'effects' | 'automation' | 'synth' | 'clip' | 'takes'>('mixer');
  const [assistantText, setAssistantText] = useState('');
  const [assistantNotice, setAssistantNotice] = useState('Studio pronto. Arma una traccia con R oppure apri INPUT per configurare microfono o interfaccia audio.');
  const [rendering, setRendering] = useState(false);
  const [saving, setSaving] = useState(false);
  const [musicalTyping, setMusicalTyping] = useState(false);
  const [history, setHistory] = useState<Track[][]>([]);
  const [future, setFuture] = useState<Track[][]>([]);
  const [crossfadeLength, setCrossfadeLength] = useState(1);

  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedInputId, setSelectedInputId] = useState('');
  const [inputGainDb, setInputGainDb] = useState(0);
  const [monitoring, setMonitoring] = useState(false);
  const [inputReady, setInputReady] = useState(false);
  const [inputMeter, setInputMeter] = useState(0);
  const [inputError, setInputError] = useState('');
  const [latencyMode, setLatencyMode] = useState<LatencyMode>('low');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);

  const [punchEnabled, setPunchEnabled] = useState(false);
  const [punchIn, setPunchIn] = useState(0);
  const [punchOut, setPunchOut] = useState(16);

  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const stemInputRef = useRef<HTMLInputElement | null>(null);
  const midiInputRef = useRef<HTMLInputElement | null>(null);
  const audioElements = useRef(new Map<string, HTMLAudioElement>());
  const clipGraphs = useRef(new Map<string, ClipAudioGraph>());
  const directClips = useRef(new Set<string>());
  const playingClips = useRef(new Set<string>());
  const frameRef = useRef<number | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const inputMeterFrameRef = useRef<number | null>(null);
  const transportTokenRef = useRef(0);
  const lastMetronomeBeatRef = useRef(-1);
  const fallbackMeterRef = useRef({ left: 0, right: 0 });
  const recordingActiveRef = useRef(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainNodeRef = useRef<GainNode | null>(null);
  const masterLimiterRef = useRef<DynamicsCompressorNode | null>(null);
  const analyserLeftRef = useRef<AnalyserNode | null>(null);
  const analyserRightRef = useRef<AnalyserNode | null>(null);
  const meterLeftDataRef = useRef(new Float32Array(256));
  const meterRightDataRef = useRef(new Float32Array(256));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingStartRef = useRef(0);
  const recordingTrackIdsRef = useRef<string[]>([]);
  const recordingPunchRef = useRef<PunchSnapshot>({ enabled: false, punchIn: 0, punchOut: 16 });

  const inputStreamRef = useRef<MediaStream | null>(null);
  const inputSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const inputGainNodeRef = useRef<GainNode | null>(null);
  const inputAnalyserRef = useRef<AnalyserNode | null>(null);
  const inputMonitorGainRef = useRef<GainNode | null>(null);
  const inputRecordDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const inputMeterDataRef = useRef(new Float32Array(256));

  useEffect(() => setProjectName(title || 'SONARA Project'), [title]);

  const hydrateSource = async (src: string) => {
    try {
      const analysis = await analyzeWaveform(src);
      setTracks(current => current.map(track => ({
        ...track,
        clips: track.clips.map(clip => clip.src === src ? { ...clip, waveform: analysis.waveform, sourceDuration: analysis.duration } : clip)
      })));
    } catch {
      // Playback/export can still work even when a remote source cannot be decoded for waveform analysis.
    }
  };

  useEffect(() => {
    if (!audioUrl) return;
    let cancelled = false;
    void probeDuration(audioUrl).then(duration => {
      if (cancelled) return;
      const track = makeAudioTrack(title || 'SONARA Master', audioUrl, duration);
      setTracks(current => {
        const already = current.some(item => item.clips.some(clip => clip.src === audioUrl));
        if (already) return current;
        setSelectedTrackId(track.id);
        setSelectedClipId(track.clips[0].id);
        return [track, ...current];
      });
      void hydrateSource(audioUrl);
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
  const selectedClip = selectedTrack?.clips.find(clip => clip.id === selectedClipId);
  const anySolo = tracks.some(track => track.solo);
  const selectedTakes = selectedTrack?.clips.filter(clip => clip.takeGroup) || [];

  const pushHistory = () => {
    setHistory(current => [...current.slice(-29), structuredClone(tracks)]);
    setFuture([]);
  };

  const updateTrack = (id: string, patch: Partial<Track>, record = false) => {
    if (record) pushHistory();
    setTracks(current => current.map(track => track.id === id ? { ...track, ...patch } : track));
  };

  const updateClip = (trackId: string, clipId: string, patch: Partial<Clip>, record = false) => {
    if (record) pushHistory();
    setTracks(current => current.map(track => track.id === trackId ? { ...track, clips: track.clips.map(clip => clip.id === clipId ? { ...clip, ...patch } : clip) } : track));
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
      void hydrateSource(url);
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
      clips: [{ id: uid('clip'), name: file.name, start: snapTime(playhead), offset: 0, duration: 16, fadeIn: 0, fadeOut: 0, kind: 'midi' as TrackKind }]
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
    setAssistantNotice(`${track.name} creata e armata. Configura INPUT e premi REC.`);
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
    const left: Clip = { ...clip, duration: leftDuration, fadeOut: Math.min(clip.fadeOut || 0, leftDuration / 2) };
    const right: Clip = { ...clip, id: uid('clip'), name: `${clip.name} B`, start: splitAt, offset: clip.offset + leftDuration, duration: rightDuration, fadeIn: Math.min(clip.fadeIn || 0, rightDuration / 2) };
    setTracks(current => current.map(item => item.id === track.id ? { ...item, clips: item.clips.flatMap(existing => existing.id === clip.id ? [left, right] : [existing]) } : item));
    setSelectedClipId(right.id);
  };

  const duplicateSelectedClip = () => {
    const track = tracks.find(item => item.id === selectedTrackId);
    const clip = track?.clips.find(item => item.id === selectedClipId);
    if (!track || !clip) return;
    pushHistory();
    const copy = { ...clip, id: uid('clip'), name: `${clip.name} Copy`, start: snapTime(clip.start + clip.duration), takeGroup: undefined, takeNumber: undefined, muted: false };
    setTracks(current => current.map(item => item.id === track.id ? { ...item, clips: [...item.clips, copy] } : item));
    setSelectedClipId(copy.id);
  };

  const deleteSelectedClip = () => {
    if (!selectedTrackId || !selectedClipId) return;
    pushHistory();
    setTracks(current => current.map(track => track.id === selectedTrackId ? { ...track, clips: track.clips.filter(clip => clip.id !== selectedClipId), compSections: track.compSections.filter(section => section.clipId !== selectedClipId) } : track));
    setSelectedClipId('');
  };

  const trimSelectedStart = (delta: number) => {
    if (!selectedTrack || !selectedClip || selectedClip.kind === 'midi') return;
    const maxExtend = Math.min(selectedClip.offset, selectedClip.start);
    const applied = clamp(delta, -maxExtend, selectedClip.duration - 0.05);
    const nextDuration = selectedClip.duration - applied;
    updateClip(selectedTrack.id, selectedClip.id, {
      start: selectedClip.start + applied,
      offset: selectedClip.offset + applied,
      duration: nextDuration,
      fadeIn: Math.min(selectedClip.fadeIn || 0, nextDuration / 2),
      fadeOut: Math.min(selectedClip.fadeOut || 0, nextDuration / 2)
    }, true);
  };

  const trimSelectedEnd = (delta: number) => {
    if (!selectedTrack || !selectedClip || selectedClip.kind === 'midi') return;
    const sourceDuration = selectedClip.sourceDuration || selectedClip.offset + selectedClip.duration;
    const maxDuration = Math.max(0.05, sourceDuration - selectedClip.offset);
    const nextDuration = clamp(selectedClip.duration + delta, 0.05, maxDuration);
    updateClip(selectedTrack.id, selectedClip.id, {
      duration: nextDuration,
      fadeIn: Math.min(selectedClip.fadeIn || 0, nextDuration / 2),
      fadeOut: Math.min(selectedClip.fadeOut || 0, nextDuration / 2)
    }, true);
  };

  const slipSelected = (delta: number) => {
    if (!selectedTrack || !selectedClip || selectedClip.kind === 'midi') return;
    const sourceDuration = selectedClip.sourceDuration || selectedClip.offset + selectedClip.duration;
    const maxOffset = Math.max(0, sourceDuration - selectedClip.duration);
    updateClip(selectedTrack.id, selectedClip.id, { offset: clamp(selectedClip.offset + delta, 0, maxOffset) }, true);
  };

  const setSelectedFade = (type: 'fadeIn' | 'fadeOut', value: number) => {
    if (!selectedTrack || !selectedClip) return;
    updateClip(selectedTrack.id, selectedClip.id, { [type]: clamp(value, 0, selectedClip.duration / 2) }, false);
  };

  const applyCrossfade = () => {
    if (!selectedTrack || !selectedClip || selectedClip.kind === 'midi') return;
    const ordered = [...selectedTrack.clips].filter(clip => clip.id !== selectedClip.id && clip.kind !== 'midi' && !clip.muted).sort((a, b) => a.start - b.start);
    const next = ordered.find(clip => clip.start >= selectedClip.start);
    if (!next) {
      setAssistantNotice('Nessuna clip successiva disponibile per il crossfade.');
      return;
    }
    const selectedEnd = selectedClip.start + selectedClip.duration;
    const requested = clamp(crossfadeLength, 0.05, Math.min(selectedClip.duration / 2, next.duration / 2));
    let nextStart = next.start;
    let overlap = selectedEnd - nextStart;
    if (overlap < requested) {
      nextStart = Math.max(selectedClip.start + 0.05, selectedEnd - requested);
      overlap = selectedEnd - nextStart;
    }
    const length = clamp(overlap, 0.05, requested);
    pushHistory();
    setTracks(current => current.map(track => track.id !== selectedTrack.id ? track : {
      ...track,
      clips: track.clips.map(clip => clip.id === selectedClip.id ? { ...clip, fadeOut: length } : clip.id === next.id ? { ...clip, start: nextStart, fadeIn: length } : clip)
    }));
    setAssistantNotice(`Crossfade reale di ${length.toFixed(2)} s creato tra ${selectedClip.name} e ${next.name}.`);
  };

  const selectTake = (trackId: string, clipId: string) => {
    pushHistory();
    setTracks(current => current.map(track => {
      if (track.id !== trackId) return track;
      const target = track.clips.find(clip => clip.id === clipId);
      if (!target?.takeGroup) return track;
      return {
        ...track,
        compSections: track.compSections.filter(section => section.takeGroup !== target.takeGroup),
        clips: track.clips.map(clip => clip.takeGroup === target.takeGroup ? { ...clip, muted: clip.id !== clipId } : clip)
      };
    }));
    setSelectedClipId(clipId);
  };

  const replaceCompSection = (sections: CompSection[], incoming: CompSection) => {
    const next: CompSection[] = [];
    for (const section of sections) {
      if (section.takeGroup !== incoming.takeGroup || section.end <= incoming.start || section.start >= incoming.end) {
        next.push(section);
        continue;
      }
      if (section.start < incoming.start) next.push({ ...section, id: uid('comp'), end: incoming.start });
      if (section.end > incoming.end) next.push({ ...section, id: uid('comp'), start: incoming.end });
    }
    return [...next, incoming].sort((a, b) => a.start - b.start);
  };

  const selectTakeRange = (trackId: string, clipId: string) => {
    if (!punchEnabled) {
      setAssistantNotice('Attiva PUNCH e imposta IN/OUT per scegliere una take solo in una sezione.');
      return;
    }
    const track = tracks.find(item => item.id === trackId);
    const target = track?.clips.find(clip => clip.id === clipId);
    if (!track || !target?.takeGroup) return;
    const start = Math.max(punchIn, target.start);
    const end = Math.min(punchOut, target.start + target.duration);
    if (end - start < 0.05) {
      setAssistantNotice('La regione Punch non interseca questa take.');
      return;
    }
    const section: CompSection = { id: uid('comp'), takeGroup: target.takeGroup, start, end, clipId };
    pushHistory();
    setTracks(current => current.map(item => item.id === trackId ? { ...item, compSections: replaceCompSection(item.compSections, section) } : item));
    setSelectedClipId(clipId);
    setAssistantNotice(`Comp: Take ${target.takeNumber || ''} selezionata solo da ${formatTime(start)} a ${formatTime(end)}.`);
  };

  const clearCompSections = () => {
    if (!selectedTrack) return;
    pushHistory();
    updateTrack(selectedTrack.id, { compSections: [] });
    setAssistantNotice('Comp a sezioni azzerato: resta attiva la take principale.');
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

  const setPunchPoint = (point: 'in' | 'out') => {
    const time = snapTime(playhead);
    const bar = (60 / Math.max(1, bpm)) * 4;
    if (point === 'in') {
      setPunchIn(time);
      if (time >= punchOut) setPunchOut(clamp(time + bar, 0, totalDuration));
    } else {
      setPunchOut(Math.max(time, punchIn + 0.05));
    }
    setPunchEnabled(true);
  };

  const findCompSection = (track: Track, clip: Clip, time: number) => clip.takeGroup ? track.compSections.find(section => section.takeGroup === clip.takeGroup && time >= section.start && time < section.end) : undefined;

  const clipAudibleAt = (track: Track, clip: Clip, time: number) => {
    if (!clip.takeGroup) return !clip.muted;
    const section = findCompSection(track, clip, time);
    return section ? section.clipId === clip.id : !clip.muted;
  };

  const renderSegmentsForClip = (track: Track, clip: Clip): RenderSegment[] => {
    if (!clip.src || clip.kind === 'midi') return [];
    const clipEnd = clip.start + clip.duration;
    const sections = clip.takeGroup ? track.compSections.filter(section => section.takeGroup === clip.takeGroup && section.end > clip.start && section.start < clipEnd) : [];
    if (!sections.length) return clip.muted ? [] : [{ start: clip.start, offset: clip.offset, duration: clip.duration }];
    const boundaries = [clip.start, clipEnd, ...sections.flatMap(section => [clamp(section.start, clip.start, clipEnd), clamp(section.end, clip.start, clipEnd)])].sort((a, b) => a - b);
    const unique = boundaries.filter((value, index) => index === 0 || Math.abs(value - boundaries[index - 1]) > 0.0001);
    const segments: RenderSegment[] = [];
    for (let index = 0; index < unique.length - 1; index += 1) {
      const start = unique[index];
      const end = unique[index + 1];
      if (end - start < 0.001) continue;
      const midpoint = (start + end) / 2;
      const section = sections.find(item => midpoint >= item.start && midpoint < item.end);
      const audible = section ? section.clipId === clip.id : !clip.muted;
      if (audible) segments.push({ start, offset: clip.offset + (start - clip.start), duration: end - start });
    }
    return segments;
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
      const latencyHint = latencyMode === 'low' ? 'interactive' : latencyMode === 'safe' ? 'playback' : 'balanced';
      context = new AudioCtor({ latencyHint });
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
      const outputLatency = Number((context as AudioContext & { outputLatency?: number }).outputLatency || 0);
      setLatencyMs(Math.round(((context.baseLatency || 0) + outputLatency) * 1000));
    }
    if (context.state === 'suspended') await context.resume();
    return context;
  };

  useEffect(() => {
    if (masterGainNodeRef.current) masterGainNodeRef.current.gain.value = masterMuted ? 0 : masterVolume;
  }, [masterVolume, masterMuted]);

  useEffect(() => {
    if (inputGainNodeRef.current) inputGainNodeRef.current.gain.value = dbToGain(inputGainDb);
  }, [inputGainDb]);

  useEffect(() => {
    if (inputMonitorGainRef.current) inputMonitorGainRef.current.gain.value = monitoring ? 1 : 0;
  }, [monitoring]);

  const refreshInputDevices = async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter(device => device.kind === 'audioinput');
      setInputDevices(devices);
      setSelectedInputId(current => current || devices[0]?.deviceId || '');
    } catch {
      setInputDevices([]);
    }
  };

  useEffect(() => {
    void refreshInputDevices();
    const onDeviceChange = () => void refreshInputDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', onDeviceChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onDeviceChange);
  }, []);

  const stopInputSession = () => {
    if (inputMeterFrameRef.current) cancelAnimationFrame(inputMeterFrameRef.current);
    inputMeterFrameRef.current = null;
    inputSourceNodeRef.current?.disconnect();
    inputGainNodeRef.current?.disconnect();
    inputAnalyserRef.current?.disconnect();
    inputMonitorGainRef.current?.disconnect();
    inputStreamRef.current?.getTracks().forEach(track => track.stop());
    inputStreamRef.current = null;
    inputSourceNodeRef.current = null;
    inputGainNodeRef.current = null;
    inputAnalyserRef.current = null;
    inputMonitorGainRef.current = null;
    inputRecordDestinationRef.current = null;
    setInputReady(false);
    setInputMeter(0);
  };

  const startInputMeterLoop = () => {
    if (inputMeterFrameRef.current) cancelAnimationFrame(inputMeterFrameRef.current);
    const tick = () => {
      const analyser = inputAnalyserRef.current;
      if (!analyser) return;
      const data = inputMeterDataRef.current;
      analyser.getFloatTimeDomainData(data);
      let sum = 0;
      for (let index = 0; index < data.length; index += 1) sum += data[index] * data[index];
      const rms = Math.sqrt(sum / data.length);
      setInputMeter(current => current * 0.55 + rms * 0.45);
      inputMeterFrameRef.current = requestAnimationFrame(tick);
    };
    inputMeterFrameRef.current = requestAnimationFrame(tick);
  };

  const ensureInputSession = async (force = false, deviceIdOverride?: string) => {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Ingresso audio non supportato dal browser.');
    if (inputRecordDestinationRef.current && inputStreamRef.current && !force) return inputRecordDestinationRef.current.stream;
    if (force) stopInputSession();
    const context = await ensureAudioEngine();
    const deviceId = deviceIdOverride ?? selectedInputId;
    const audioConstraints: MediaTrackConstraints = {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
      ...(deviceId ? { deviceId: { exact: deviceId } } : {})
    };
    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    inputStreamRef.current = stream;
    const source = context.createMediaStreamSource(stream);
    const gain = context.createGain();
    gain.gain.value = dbToGain(inputGainDb);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.68;
    const monitorGain = context.createGain();
    monitorGain.gain.value = monitoring ? 1 : 0;
    const recordDestination = context.createMediaStreamDestination();
    source.connect(gain);
    gain.connect(analyser);
    gain.connect(recordDestination);
    gain.connect(monitorGain);
    monitorGain.connect(masterGainNodeRef.current || context.destination);
    inputSourceNodeRef.current = source;
    inputGainNodeRef.current = gain;
    inputAnalyserRef.current = analyser;
    inputMonitorGainRef.current = monitorGain;
    inputRecordDestinationRef.current = recordDestination;
    setInputReady(true);
    setInputError('');
    startInputMeterLoop();
    await refreshInputDevices();
    return recordDestination.stream;
  };

  const enableInput = async () => {
    try {
      await ensureInputSession(true);
      setAssistantNotice('Ingresso audio pronto. Gain, meter e monitoring sono attivi sul segnale selezionato.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setInputError(message);
      setAssistantNotice(`Ingresso audio non disponibile: ${message}`);
    }
  };

  const changeInputDevice = async (deviceId: string) => {
    setSelectedInputId(deviceId);
    if (!inputReady) return;
    try {
      await ensureInputSession(true, deviceId);
      setAssistantNotice('Ingresso audio cambiato.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setInputError(message);
    }
  };

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
      const audibleTrack = !track.mute && (!anySolo || track.solo);
      for (const clip of track.clips) {
        if (!clip.src || clip.kind === 'midi') continue;
        const active = audibleTrack && clipAudibleAt(track, clip, time) && !masterMuted && time >= clip.start && time < clip.start + clip.duration;
        const audio = audioElements.current.get(clip.id);
        if (!audio) continue;
        const graph = clipGraphs.current.get(clip.id);
        const fade = active ? fadeFactor(clip, time) : 0;
        audio.playbackRate = Math.pow(2, track.pitch / 12);
        if (graph) {
          graph.gain.gain.value = track.volume * fade;
          graph.panner.pan.value = clamp(track.pan / 100, -1, 1);
        } else {
          audio.volume = clamp(track.volume * masterVolume * fade, 0, 1);
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
          const level = clamp(track.volume * masterVolume * fade * 0.72, 0, 1.2);
          const pan = clamp(track.pan / 100, -1, 1);
          const angle = (pan + 1) * Math.PI / 4;
          fallbackLeft = Math.max(fallbackLeft, level * Math.cos(angle));
          fallbackRight = Math.max(fallbackRight, level * Math.sin(angle));
        }
      }
    }
    fallbackMeterRef.current = { left: fallbackLeft, right: fallbackRight };
  };

  const stopRecorderOnly = () => {
    const recorder = mediaRecorderRef.current;
    if (recorder?.state === 'recording') recorder.stop();
    recordingActiveRef.current = false;
    setRecording(false);
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
    stopRecorderOnly();
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
        if (loop && !recordingActiveRef.current) {
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
      const punch = recordingPunchRef.current;
      if (recordingActiveRef.current && punch.enabled && next >= punch.punchOut) {
        stopRecorderOnly();
        setAssistantNotice(`Punch-out eseguito a ${formatTime(punch.punchOut)}. Playback continua.`);
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

  const startRecording = async () => {
    if (recording) {
      stopRecorderOnly();
      setAssistantNotice('Registrazione fermata. Playback lasciato in esecuzione.');
      return;
    }
    const armedTracks = tracks.filter(track => track.armed && track.kind !== 'midi');
    if (!armedTracks.length) {
      setAssistantNotice('Arma almeno una traccia audio con R, oppure crea + TRACK.');
      return;
    }
    if (punchEnabled && playhead >= punchOut) {
      setAssistantNotice('Il playhead e oltre il Punch Out. Spostalo prima del punto OUT.');
      return;
    }
    if (typeof MediaRecorder === 'undefined') {
      setAssistantNotice('MediaRecorder non supportato da questo browser.');
      return;
    }
    try {
      const processedStream = await ensureInputSession();
      let token = transportTokenRef.current;
      if (!playing) {
        token = ++transportTokenRef.current;
        await preparePlayback();
        const completed = await runCountIn(token);
        if (!completed) return;
      }
      const preferred = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(processedStream, preferred ? { mimeType: preferred } : undefined);
      mediaRecorderRef.current = recorder;
      recordingChunksRef.current = [];
      recordingStartRef.current = playhead;
      recordingTrackIdsRef.current = armedTracks.map(track => track.id);
      recordingPunchRef.current = { enabled: punchEnabled, punchIn, punchOut };
      recorder.ondataavailable = event => { if (event.data.size > 0) recordingChunksRef.current.push(event.data); };
      recorder.onerror = () => setAssistantNotice('Errore durante la registrazione audio.');
      recorder.onstop = () => {
        const chunks = recordingChunksRef.current;
        const armedIds = [...recordingTrackIdsRef.current];
        const startAt = recordingStartRef.current;
        const punch = recordingPunchRef.current;
        const type = recorder.mimeType || preferred || 'audio/webm';
        recordingActiveRef.current = false;
        setRecording(false);
        if (!chunks.length) return;
        const blob = new Blob(chunks, { type });
        const url = URL.createObjectURL(blob);
        void probeDuration(url).then(rawDuration => {
          const rawEnd = startAt + rawDuration;
          const clipStart = punch.enabled ? Math.max(startAt, punch.punchIn) : startAt;
          const desiredEnd = punch.enabled ? Math.min(rawEnd, punch.punchOut) : rawEnd;
          const sourceOffset = Math.max(0, clipStart - startAt);
          const clipDuration = Math.max(0, Math.min(rawDuration - sourceOffset, desiredEnd - clipStart));
          if (clipDuration < 0.05) {
            setAssistantNotice('Take troppo breve: nessuna clip aggiunta.');
            return;
          }
          let firstClipId = '';
          let highestTake = 1;
          setTracks(current => current.map(track => {
            if (!armedIds.includes(track.id)) return track;
            const takeGroup = `${track.id}:${Math.round(clipStart * 1000)}:${Math.round(desiredEnd * 1000)}`;
            const previousTakes = track.clips.filter(clip => clip.takeGroup === takeGroup);
            const takeNumber = Math.max(0, ...previousTakes.map(clip => clip.takeNumber || 0)) + 1;
            highestTake = Math.max(highestTake, takeNumber);
            const clipId = uid('take');
            if (!firstClipId) firstClipId = clipId;
            const recordedClip: Clip = {
              id: clipId,
              name: `Take ${takeNumber}`,
              src: url,
              start: snapTime(clipStart),
              offset: sourceOffset,
              duration: clipDuration,
              sourceDuration: rawDuration,
              fadeIn: 0,
              fadeOut: 0,
              kind: track.kind === 'vocal' ? 'vocal' : 'audio',
              takeGroup,
              takeNumber,
              muted: false
            };
            return {
              ...track,
              clips: [...track.clips.map(clip => clip.takeGroup === takeGroup ? { ...clip, muted: true } : clip), recordedClip]
            };
          }));
          void hydrateSource(url);
          if (armedIds[0]) setSelectedTrackId(armedIds[0]);
          if (firstClipId) setSelectedClipId(firstClipId);
          setPanel('takes');
          setAssistantNotice(`Take ${highestTake} registrata: ${formatTime(clipDuration)}. Waveform reale in analisi e take pronta per il comp.`);
        });
      };
      recorder.start(150);
      recordingActiveRef.current = true;
      setRecording(true);
      setAssistantNotice(`REC attivo da ${inputDevices.find(device => device.deviceId === selectedInputId)?.label || 'ingresso selezionato'}${punchEnabled ? ` · Punch ${formatTime(punchIn)}-${formatTime(punchOut)}` : ''}.`);
      if (!playing) beginPlayback(token, playhead);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setInputError(message);
      setAssistantNotice(`Registrazione non disponibile: ${message}`);
    }
  };

  useEffect(() => () => {
    transportTokenRef.current += 1;
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
    if (meterFrameRef.current) cancelAnimationFrame(meterFrameRef.current);
    if (inputMeterFrameRef.current) cancelAnimationFrame(inputMeterFrameRef.current);
    audioElements.current.forEach(audio => audio.pause());
    stopRecorderOnly();
    stopInputSession();
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

  const scheduleFadeEnvelope = (gain: GainNode, clip: Clip, segmentStart: number, segmentEnd: number) => {
    const fadeInEnd = clip.start + clamp(clip.fadeIn || 0, 0, clip.duration / 2);
    const fadeOutStart = clip.start + clip.duration - clamp(clip.fadeOut || 0, 0, clip.duration / 2);
    const points = [segmentStart, fadeInEnd, fadeOutStart, segmentEnd].filter(time => time >= segmentStart && time <= segmentEnd).sort((a, b) => a - b).filter((time, index, values) => index === 0 || Math.abs(time - values[index - 1]) > 0.0001);
    if (!points.length) return;
    gain.gain.setValueAtTime(fadeFactor(clip, points[0]), points[0]);
    for (let index = 1; index < points.length; index += 1) gain.gain.linearRampToValueAtTime(fadeFactor(clip, points[index]), points[index]);
  };

  const renderTracks = async (sourceTracks: Track[]) => {
    const audibleTracks = sourceTracks.filter(track => !track.mute && (!sourceTracks.some(item => item.solo) || track.solo));
    const renderItems = audibleTracks.flatMap(track => track.clips.flatMap(clip => renderSegmentsForClip(track, clip).map(segment => ({ track, clip, segment }))));
    if (!renderItems.length) throw new Error('Nessuna clip audio reale da renderizzare.');
    const duration = Math.min(MAX_TIMELINE_SECONDS, Math.max(1, ...renderItems.map(({ segment }) => segment.start + segment.duration)));
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
    const decodedCache = new Map<string, AudioBuffer>();

    for (const { track, clip, segment } of renderItems) {
      const src = String(clip.src);
      let decoded = decodedCache.get(src);
      if (!decoded) {
        decoded = await decodeAudioFromUrl(src);
        decodedCache.set(src, decoded);
      }
      const source = offline.createBufferSource();
      source.buffer = decoded;
      source.playbackRate.value = Math.pow(2, track.pitch / 12);
      const trackGain = offline.createGain();
      trackGain.gain.value = track.volume;
      for (const point of [...track.automation].sort((a, b) => a.time - b.time)) {
        if (point.time <= duration) trackGain.gain.linearRampToValueAtTime(clamp(point.value, 0, 1), point.time);
      }
      const fadeGain = offline.createGain();
      scheduleFadeEnvelope(fadeGain, clip, segment.start, segment.start + segment.duration);
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
      source.connect(trackGain).connect(fadeGain).connect(low).connect(mid).connect(high).connect(compressor).connect(panner).connect(master);
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
      const availableSource = Math.max(0.05, Math.min(segment.duration, decoded.duration - segment.offset));
      source.start(segment.start, Math.max(0, segment.offset), availableSource);
    }
    return offline.startRendering();
  };

  const exportMix = async (float = true) => {
    if (rendering) return;
    setRendering(true);
    setAssistantNotice('Rendering multitraccia reale a 48 kHz con fade, crossfade e comp attivo...');
    try {
      const rendered = await renderTracks(tracks);
      const blob = float ? float32Wav(rendered) : audioBufferToWav(rendered);
      downloadBlob(blob, `${safeAudioFilename(projectName)}-${float ? '32bit-48k' : 'pcm16'}`, 'wav');
      setAssistantNotice(`Mix esportato realmente in WAV ${float ? '32-bit float / 48 kHz' : 'PCM 16-bit'} con editing e comp applicati.`);
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
        version: 5,
        name: projectName,
        bpm,
        keySignature,
        tracks,
        markers,
        quantize,
        metronome,
        countInBars,
        masterVolume,
        input: { selectedInputId, inputGainDb, monitoring, latencyMode },
        punch: { punchEnabled, punchIn, punchOut },
        savedAt: new Date().toISOString()
      };
      localStorage.setItem('sonara.studio.project.v5', JSON.stringify(project));
      setAssistantNotice('Sessione Studio Pro v5 salvata con waveform, fade e comping.');
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
    } else if (lower.includes('crossfade')) {
      applyCrossfade();
    } else if (lower.includes('comp')) {
      setPanel('takes');
      setAssistantNotice('Pannello Takes aperto. Usa PUNCH IN/OUT e USE RANGE per il comp a sezioni.');
    } else if (lower.includes('monitor')) {
      setMonitoring(true);
      void enableInput();
    } else if (lower.includes('punch')) {
      setPunchEnabled(true);
      setAssistantNotice(`Punch attivo tra ${formatTime(punchIn)} e ${formatTime(punchOut)}.`);
    } else if (lower.includes('input') || lower.includes('microfono')) {
      void enableInput();
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
      setAssistantNotice('Prova: “crossfade”, “apri comp”, “input microfono”, “monitoring”, “attiva punch”, “tempo 128 BPM” o “apri mastering”.');
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
              <div className="flex items-center gap-2"><span className="text-[9px] font-black uppercase tracking-[0.2em] text-purple-300">SONARA STUDIO PRO 5</span><span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black text-emerald-300">EDIT + COMP</span></div>
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
            <button onClick={() => audioInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-[10px] font-black text-slate-300"><Upload className="h-3.5 w-3.5" /> AUDIO</button>
            <button onClick={() => stemInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-[10px] font-black text-slate-300"><Layers3 className="h-3.5 w-3.5" /> STEM</button>
            <button onClick={() => midiInputRef.current?.click()} className="flex items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-[10px] font-black text-slate-300"><KeyboardMusic className="h-3.5 w-3.5" /> MIDI</button>
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
        </aside>

        <main className="min-w-0 flex-1 bg-[#06080d]">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 bg-slate-950/75 px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => playing ? stopPlayback() : void startPlayback()} disabled={countingIn} className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black disabled:opacity-50">{playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}</button>
              <button onClick={() => stopPlayback(true)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-800 bg-slate-900 text-slate-300"><Square className="h-3.5 w-3.5 fill-current" /></button>
              <button onClick={() => void startRecording()} className={`flex h-8 items-center gap-1.5 rounded-lg border px-2 text-[9px] font-black ${recording ? 'border-rose-400 bg-rose-500 text-white shadow-[0_0_16px_rgba(244,63,94,.35)]' : 'border-rose-500/30 bg-rose-500/10 text-rose-300'}`}><Mic2 className="h-3.5 w-3.5" /> REC</button>
              <button onClick={addAudioTrack} className="flex h-8 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-900 px-2 text-[9px] font-black text-slate-400"><Plus className="h-3.5 w-3.5" /> TRACK</button>
              <div className="min-w-20 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-center font-mono text-xs font-black text-white">{countingIn ? `-${countInBeat}` : formatTime(playhead)}</div>

              <details className="relative">
                <summary className={`flex h-8 cursor-pointer list-none items-center gap-2 rounded-lg border px-2 text-[9px] font-black ${inputReady ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-slate-800 bg-slate-900 text-slate-500'}`}><Headphones className="h-3.5 w-3.5" /> INPUT<span className="h-1.5 w-10 overflow-hidden rounded-full bg-slate-800"><span className="block h-full rounded-full bg-emerald-400" style={{ width: `${meterPercent(inputMeter)}%` }} /></span></summary>
                <div className="absolute left-0 top-full z-50 mt-2 w-[310px] rounded-xl border border-slate-700 bg-[#080b12] p-3 shadow-2xl">
                  <div className="flex items-center justify-between"><div className="text-[9px] font-black uppercase tracking-wider text-slate-400">Audio Input</div><button onClick={() => void enableInput()} className="rounded-lg bg-white px-2 py-1 text-[8px] font-black text-black">{inputReady ? 'RECONNECT' : 'ENABLE'}</button></div>
                  <select value={selectedInputId} onChange={event => void changeInputDevice(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-[9px] font-bold text-slate-300 outline-none">{!inputDevices.length && <option value="">Default input</option>}{inputDevices.map((device, index) => <option key={device.deviceId || index} value={device.deviceId}>{device.label || `Audio input ${index + 1}`}</option>)}</select>
                  <div className="mt-3 flex items-center gap-2"><span className="w-12 text-[8px] font-black text-slate-600">LEVEL</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${meterPercent(inputMeter)}%` }} /></div><span className="w-12 text-right font-mono text-[8px] text-slate-400">{toDb(inputMeter).toFixed(1)} dB</span></div>
                  <label className="mt-3 block text-[8px] font-black text-slate-600">INPUT GAIN <span className="float-right text-slate-300">{inputGainDb > 0 ? '+' : ''}{inputGainDb} dB</span><input type="range" min={-24} max={24} step={1} value={inputGainDb} onChange={event => setInputGainDb(Number(event.target.value))} className="mt-1 w-full accent-emerald-400" /></label>
                  <div className="mt-3 grid grid-cols-2 gap-2"><button onClick={() => setMonitoring(value => !value)} className={`rounded-lg border px-2 py-2 text-[8px] font-black ${monitoring ? 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200' : 'border-slate-800 bg-slate-950 text-slate-500'}`}>MONITOR {monitoring ? 'ON' : 'OFF'}</button><select value={latencyMode} onChange={event => setLatencyMode(event.target.value as LatencyMode)} disabled={latencyMs !== null} className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-2 text-[8px] font-black text-slate-400 outline-none disabled:opacity-50"><option value="low">LATENCY LOW</option><option value="balanced">LATENCY BAL</option><option value="safe">LATENCY SAFE</option></select></div>
                  <div className="mt-2 text-[8px] leading-4 text-slate-600">Mode {LATENCY_LABELS[latencyMode]}{latencyMs !== null ? ` · browser reports ~${latencyMs} ms` : ' · applies when audio engine starts'}. Usa cuffie con monitoring.</div>{inputError && <div className="mt-2 text-[8px] text-rose-300">{inputError}</div>}
                </div>
              </details>

              <button onClick={() => setMetronome(value => !value)} className={`rounded-lg border px-2 py-2 text-[9px] font-black ${metronome ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200' : 'border-slate-800 bg-slate-900 text-slate-500'}`}>CLICK</button>
              <select value={countInBars} onChange={event => setCountInBars(Number(event.target.value) as 0 | 1 | 2)} className="h-8 rounded-lg border border-slate-800 bg-slate-900 px-2 text-[9px] font-black text-slate-400 outline-none"><option value={0}>IN OFF</option><option value={1}>IN 1 BAR</option><option value={2}>IN 2 BAR</option></select>
              <button onClick={() => setPunchEnabled(value => !value)} className={`rounded-lg border px-2 py-2 text-[9px] font-black ${punchEnabled ? 'border-rose-500/50 bg-rose-500/15 text-rose-200' : 'border-slate-800 bg-slate-900 text-slate-500'}`}>PUNCH</button>
              <button onClick={() => setPunchPoint('in')} className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-[8px] font-black text-slate-500">IN {formatTime(punchIn)}</button>
              <button onClick={() => setPunchPoint('out')} className="rounded-lg border border-slate-800 bg-slate-900 px-2 py-2 text-[8px] font-black text-slate-500">OUT {formatTime(punchOut)}</button>
              <button onClick={() => setLoop(value => !value)} className={`rounded-lg border px-2 py-2 text-[9px] font-black ${loop ? 'border-purple-500/50 bg-purple-500/15 text-purple-200' : 'border-slate-800 bg-slate-900 text-slate-500'}`}>LOOP</button>
              <button onClick={() => setSnap(value => !value)} className={`rounded-lg border px-2 py-2 text-[9px] font-black ${snap ? 'border-cyan-500/50 bg-cyan-500/15 text-cyan-200' : 'border-slate-800 bg-slate-900 text-slate-500'}`}>Q</button>
              <select value={quantize} onChange={event => setQuantize(event.target.value as QuantizeValue)} disabled={!snap} className="h-8 rounded-lg border border-slate-800 bg-slate-900 px-2 text-[9px] font-black text-slate-400 outline-none disabled:opacity-40"><option>1/4</option><option>1/8</option><option>1/16</option><option>1/32</option></select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-8 items-center gap-1 rounded-lg border border-slate-800 bg-slate-900 p-1"><select value={markerLabel} onChange={event => setMarkerLabel(event.target.value as MarkerLabel)} className="h-6 bg-transparent px-1 text-[8px] font-black text-slate-400 outline-none">{MARKER_LABELS.map(label => <option key={label} value={label}>{label}</option>)}</select><button onClick={addMarker} className="h-6 rounded bg-slate-800 px-2 text-[8px] font-black text-white">+ MARK</button></div>
              <button onClick={splitSelectedClip} className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300" title="Split"><Scissors className="h-3.5 w-3.5" /></button>
              <button onClick={duplicateSelectedClip} className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-slate-300" title="Duplicate"><Copy className="h-3.5 w-3.5" /></button>
              <button onClick={deleteSelectedClip} className="rounded-lg border border-slate-800 bg-slate-900 p-2 text-rose-300" title="Delete clip"><Trash2 className="h-3.5 w-3.5" /></button>
              <button onClick={() => setZoom(value => clamp(value - 0.15, 0.55, 2.2))} className="p-2 text-slate-500"><ZoomOut className="h-4 w-4" /></button><span className="w-10 text-center text-[9px] font-black text-slate-500">{Math.round(zoom * 100)}%</span><button onClick={() => setZoom(value => clamp(value + 0.15, 0.55, 2.2))} className="p-2 text-slate-500"><ZoomIn className="h-4 w-4" /></button>
              <div className="ml-1 flex h-10 items-center gap-2 rounded-lg border border-slate-800 bg-[#080b10] px-2" title={`Master peak ${Math.max(toDb(masterMeter.peakLeft), toDb(masterMeter.peakRight)).toFixed(1)} dBFS`}><button onClick={() => setMasterMuted(value => !value)} className={`text-[8px] font-black ${masterMuted ? 'text-rose-300' : 'text-slate-500'}`}>MASTER</button><div className="w-14 space-y-1"><div className="flex items-center gap-1"><span className="w-2 text-[7px] text-slate-600">L</span><div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${meterPercent(masterMeter.left)}%` }} /></div></div><div className="flex items-center gap-1"><span className="w-2 text-[7px] text-slate-600">R</span><div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-emerald-400" style={{ width: `${meterPercent(masterMeter.right)}%` }} /></div></div></div><input type="range" min={0} max={1.25} step={0.01} value={masterVolume} onChange={event => setMasterVolume(Number(event.target.value))} className="w-16 accent-emerald-400" aria-label="Master volume" /><button onClick={() => setMasterMeter({ left: 0, right: 0, peakLeft: 0, peakRight: 0 })} className="w-10 text-right font-mono text-[8px] font-bold text-slate-400">{Math.max(toDb(masterMeter.peakLeft), toDb(masterMeter.peakRight)).toFixed(1)}</button></div>
            </div>
          </div>

          <div className="overflow-x-auto border-b border-slate-800" style={{ maxHeight: 500 }}>
            <div className="sticky top-0 z-20 flex h-10 border-b border-slate-800 bg-[#090c13]" style={{ width: 190 + timelineWidth }}><div className="sticky left-0 z-30 flex w-[190px] shrink-0 items-center border-r border-slate-800 bg-[#090c13] px-3 text-[9px] font-black uppercase tracking-wider text-slate-600">Tracks</div><div className="relative h-full" style={{ width: timelineWidth }}>{Array.from({ length: Math.floor(totalDuration / 10) + 1 }, (_, index) => index * 10).map(second => <div key={second} className="absolute top-0 h-full border-l border-slate-800/80 pl-1 pt-1 text-[8px] text-slate-600" style={{ left: second * pxPerSecond }}>{formatTime(second)}</div>)}{punchEnabled && <div className="pointer-events-none absolute bottom-0 top-0 border-x border-rose-400/50 bg-rose-500/[0.06]" style={{ left: punchIn * pxPerSecond, width: Math.max(2, (punchOut - punchIn) * pxPerSecond) }} />}{markers.map(marker => <button key={marker.id} onClick={() => setPlayhead(marker.time)} onDoubleClick={() => setMarkers(current => current.filter(item => item.id !== marker.id))} className="absolute bottom-0 z-10 -translate-x-1/2 rounded-t border border-cyan-400/25 bg-cyan-400/10 px-1.5 py-0.5 text-[7px] font-black text-cyan-200" style={{ left: marker.time * pxPerSecond }}>{marker.label}</button>)}</div></div>

            {tracks.length === 0 && <div className="flex min-h-[330px] w-full items-center justify-center p-8"><div className="max-w-md text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-purple-500/20 bg-purple-500/10 text-purple-300"><WandSparkles className="h-6 w-6" /></div><h3 className="mt-4 text-lg font-black text-white">Inizia una sessione SONARA Studio Pro</h3><p className="mt-2 text-xs leading-5 text-slate-500">Importa audio o stem, crea MIDI oppure registra. Le clip audio mostrano waveform reale e supportano trim, slip, fade, crossfade e comp.</p><div className="mt-4 flex flex-wrap justify-center gap-2"><button onClick={() => audioInputRef.current?.click()} className="rounded-xl bg-purple-600 px-4 py-2 text-xs font-black text-white">Importa audio</button><button onClick={addAudioTrack} className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-xs font-black text-rose-200">Crea traccia REC</button><button onClick={addMidiTrack} className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-xs font-black text-white">Crea MIDI</button></div></div></div>}

            {tracks.map(track => (
              <div key={track.id} className={`flex min-h-[86px] border-b border-slate-800/80 ${selectedTrackId === track.id ? 'bg-purple-500/[0.025]' : ''}`} style={{ width: 190 + timelineWidth }}>
                <div className="sticky left-0 z-10 w-[190px] shrink-0 border-r border-slate-800 bg-[#090c13] p-2.5"><div className="flex items-start gap-2"><button onClick={() => setSelectedTrackId(track.id)} className="min-w-0 flex-1 text-left"><div className="truncate text-[11px] font-black text-white">{track.name}</div><div className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-600">{track.kind}{track.armed ? ' · ARMED' : ''}{track.compSections.length ? ` · ${track.compSections.length} COMP` : ''}</div></button><button onClick={() => removeTrack(track.id)} className="text-slate-700 hover:text-rose-300"><Trash2 className="h-3 w-3" /></button></div><div className="mt-2 flex items-center gap-1.5"><button disabled={track.kind === 'midi'} onClick={() => updateTrack(track.id, { armed: !track.armed })} className={`h-6 w-6 rounded text-[8px] font-black disabled:opacity-25 ${track.armed ? 'bg-rose-500 text-white shadow-[0_0_12px_rgba(244,63,94,.3)]' : 'bg-slate-800 text-slate-500'}`}>R</button><button onClick={() => updateTrack(track.id, { mute: !track.mute })} className={`h-6 w-6 rounded text-[8px] font-black ${track.mute ? 'bg-amber-500 text-black' : 'bg-slate-800 text-slate-500'}`}>M</button><button onClick={() => updateTrack(track.id, { solo: !track.solo })} className={`h-6 w-6 rounded text-[8px] font-black ${track.solo ? 'bg-emerald-400 text-black' : 'bg-slate-800 text-slate-500'}`}>S</button><Volume2 className="ml-0.5 h-3 w-3 text-slate-600" /><input type="range" min={0} max={1} step={0.01} value={track.volume} onChange={event => updateTrack(track.id, { volume: Number(event.target.value) })} className="w-16 accent-purple-500" /></div></div>
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
                    if (item.id === sourceTrack.id && item.id !== track.id) return { ...item, clips: item.clips.filter(existing => existing.id !== clipId), compSections: item.compSections.filter(section => section.clipId !== clipId) };
                    if (item.id === track.id) return { ...item, clips: [...item.clips.filter(existing => existing.id !== clipId), { ...clip, kind: track.kind, start: snapTime(start), takeGroup: item.id === sourceTrack.id ? clip.takeGroup : undefined, takeNumber: item.id === sourceTrack.id ? clip.takeNumber : undefined }] };
                    return item;
                  }));
                  setSelectedTrackId(track.id);
                }}>
                  {punchEnabled && <div className="pointer-events-none absolute bottom-0 top-0 border-x border-rose-400/20 bg-rose-500/[0.035]" style={{ left: punchIn * pxPerSecond, width: Math.max(2, (punchOut - punchIn) * pxPerSecond) }} />}
                  {track.compSections.map(section => <div key={section.id} className="pointer-events-none absolute bottom-1 top-1 z-[1] border-x border-emerald-300/30 bg-emerald-400/[0.04]" style={{ left: section.start * pxPerSecond, width: Math.max(2, (section.end - section.start) * pxPerSecond) }} />)}
                  {track.clips.map(clip => {
                    const waveform = visibleWaveform(clip);
                    return <button key={clip.id} draggable onDragStart={event => event.dataTransfer.setData('text/sonara-clip', clip.id)} onClick={event => { event.stopPropagation(); setSelectedTrackId(track.id); setSelectedClipId(clip.id); setPanel(clip.takeGroup ? 'takes' : 'clip'); }} className={`absolute top-2 h-[68px] overflow-hidden rounded-lg border bg-gradient-to-r px-2 text-left shadow-lg ${TRACK_COLORS[clip.kind]} ${clip.muted ? 'opacity-30 grayscale' : ''} ${selectedClipId === clip.id ? 'border-white/70 ring-2 ring-white/20' : 'border-white/10'}`} style={{ left: clip.start * pxPerSecond, width: Math.max(34, clip.duration * pxPerSecond) }}><div className="flex items-center gap-1"><div className="min-w-0 flex-1 truncate text-[9px] font-black text-white">{clip.name}</div>{clip.takeNumber && <span className="rounded bg-black/25 px-1 text-[7px] font-black text-white/70">T{clip.takeNumber}</span>}</div><div className="relative mt-1 flex h-8 items-center overflow-hidden border-y border-white/5"><div className="absolute inset-x-0 top-1/2 h-px bg-white/15" />{clip.kind === 'midi' ? Array.from({ length: 20 }, (_, index) => <span key={index} className="absolute h-1.5 rounded-sm bg-white/60" style={{ left: `${(index * 19) % 95}%`, top: `${12 + ((index * 23) % 60)}%`, width: '5%' }} />) : waveform.length ? <div className="flex h-full w-full items-center gap-px">{waveform.map((peak, index) => <span key={index} className="min-w-px flex-1 rounded-full bg-white/75" style={{ height: `${Math.max(8, peak * 94)}%` }} />)}</div> : <div className="flex h-full w-full items-center gap-px opacity-40">{Array.from({ length: 36 }, (_, index) => <span key={index} className="min-w-px flex-1 rounded-full bg-white" style={{ height: `${18 + ((index * 37) % 70)}%` }} />)}</div>}{(clip.fadeIn || 0) > 0 && <div className="pointer-events-none absolute bottom-0 left-0 border-b border-white/60" style={{ width: `${clamp(((clip.fadeIn || 0) / clip.duration) * 100, 0, 50)}%`, height: '100%', clipPath: 'polygon(0 100%,100% 0,100% 100%)', background: 'rgba(255,255,255,.08)' }} />}{(clip.fadeOut || 0) > 0 && <div className="pointer-events-none absolute bottom-0 right-0 border-b border-white/60" style={{ width: `${clamp(((clip.fadeOut || 0) / clip.duration) * 100, 0, 50)}%`, height: '100%', clipPath: 'polygon(0 0,100% 100%,0 100%)', background: 'rgba(255,255,255,.08)' }} />}</div><div className="mt-1 text-[7px] font-bold text-white/60">{formatTime(clip.duration)} {clip.kind === 'midi' ? '· MIDI' : clip.takeNumber ? '· TAKE' : '· AUDIO'}{clip.offset > 0.001 ? ` · slip ${clip.offset.toFixed(2)}s` : ''}</div></button>;
                  })}
                  <div className="pointer-events-none absolute bottom-0 top-0 z-20 w-px bg-fuchsia-400 shadow-[0_0_10px_rgba(232,121,249,.9)]" style={{ left: playhead * pxPerSecond }} />
                </div>
              </div>
            ))}
          </div>

          <div className="grid border-b border-slate-800 lg:grid-cols-[1fr_320px]">
            <div className="border-b border-slate-800 p-3 lg:border-b-0 lg:border-r">
              <div className="mb-3 flex flex-wrap gap-2">{(['mixer', 'effects', 'automation', 'synth', 'clip', 'takes'] as const).map(id => <button key={id} onClick={() => setPanel(id)} className={`rounded-lg px-3 py-1.5 text-[9px] font-black uppercase tracking-wider ${panel === id ? 'bg-purple-600 text-white' : 'border border-slate-800 bg-slate-950 text-slate-500'}`}>{id}</button>)}</div>
              {!selectedTrack ? <div className="py-8 text-center text-xs text-slate-600">Seleziona una traccia per modificarla.</div> : <div>
                {panel === 'mixer' && <div className="grid gap-3 sm:grid-cols-3"><label className="text-[9px] font-bold text-slate-500">Volume <span className="float-right text-white">{Math.round(selectedTrack.volume * 100)}%</span><input type="range" min={0} max={1} step={0.01} value={selectedTrack.volume} onChange={event => updateTrack(selectedTrack.id, { volume: Number(event.target.value) })} className="mt-2 w-full accent-purple-500" /></label><label className="text-[9px] font-bold text-slate-500">Pan <span className="float-right text-white">{selectedTrack.pan}</span><input type="range" min={-100} max={100} value={selectedTrack.pan} onChange={event => updateTrack(selectedTrack.id, { pan: Number(event.target.value) })} className="mt-2 w-full accent-purple-500" /></label><label className="text-[9px] font-bold text-slate-500">Pitch / varispeed <span className="float-right text-white">{selectedTrack.pitch > 0 ? '+' : ''}{selectedTrack.pitch} st</span><input type="range" min={-12} max={12} step={1} value={selectedTrack.pitch} onChange={event => updateTrack(selectedTrack.id, { pitch: Number(event.target.value) })} className="mt-2 w-full accent-purple-500" /></label></div>}
                {panel === 'effects' && <div className="grid gap-3 sm:grid-cols-5">{([['Low EQ', 'low', -12, 12], ['Mid EQ', 'mid', -12, 12], ['High EQ', 'high', -12, 12], ['Compression', 'compression', 0, 100], ['Reverb', 'reverb', 0, 100]] as const).map(([label, key, min, max]) => <label key={key} className="text-[9px] font-bold text-slate-500">{label}<span className="float-right text-white">{selectedTrack[key]}</span><input type="range" min={min} max={max} value={selectedTrack[key]} onChange={event => updateTrack(selectedTrack.id, { [key]: Number(event.target.value) } as Partial<Track>)} className="mt-2 w-full accent-fuchsia-500" /></label>)}</div>}
                {panel === 'automation' && <div className="flex flex-wrap items-center gap-3"><button onClick={addAutomationPoint} className="flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-[10px] font-black text-purple-200"><Activity className="h-3.5 w-3.5" /> Punto volume @ {formatTime(playhead)}</button><span className="text-[9px] text-slate-500">{selectedTrack.automation.length} punti · applicati nel render offline</span><button onClick={() => updateTrack(selectedTrack.id, { automation: [] }, true)} className="text-[9px] font-bold text-rose-300">Reset</button></div>}
                {panel === 'synth' && <div className="flex flex-wrap items-center gap-3"><button onClick={() => setMusicalTyping(value => !value)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-black ${musicalTyping ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200' : 'border-slate-800 bg-slate-950 text-slate-400'}`}><KeyboardMusic className="h-3.5 w-3.5" /> {musicalTyping ? 'TASTIERA ATTIVA' : 'ATTIVA TASTIERA'}</button><span className="text-[9px] text-slate-500">Tasti A W S E D F T G Y H U J K · synth Web Audio</span></div>}
                {panel === 'clip' && (!selectedClip ? <div className="py-5 text-[10px] text-slate-600">Seleziona una clip audio.</div> : <div className="grid gap-3 xl:grid-cols-[1.2fr_1fr_1fr]">
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="flex items-center justify-between"><div className="text-[9px] font-black text-white">{selectedClip.name}</div><span className="text-[8px] text-slate-600">{selectedClip.waveform?.length ? 'REAL WAVEFORM' : 'ANALYZING'}</span></div><div className="mt-3 grid grid-cols-3 gap-2"><button onClick={() => trimSelectedStart(-0.05)} className="rounded-lg border border-slate-800 px-2 py-2 text-[8px] font-black text-slate-400">IN −50ms</button><button onClick={() => trimSelectedStart(0.05)} className="rounded-lg border border-slate-800 px-2 py-2 text-[8px] font-black text-slate-400">IN +50ms</button><button onClick={() => slipSelected(-0.05)} className="rounded-lg border border-cyan-500/20 px-2 py-2 text-[8px] font-black text-cyan-300">SLIP ←</button><button onClick={() => trimSelectedEnd(-0.05)} className="rounded-lg border border-slate-800 px-2 py-2 text-[8px] font-black text-slate-400">OUT −50ms</button><button onClick={() => trimSelectedEnd(0.05)} className="rounded-lg border border-slate-800 px-2 py-2 text-[8px] font-black text-slate-400">OUT +50ms</button><button onClick={() => slipSelected(0.05)} className="rounded-lg border border-cyan-500/20 px-2 py-2 text-[8px] font-black text-cyan-300">SLIP →</button></div><div className="mt-2 text-[8px] text-slate-600">Start {formatTime(selectedClip.start)} · Offset {selectedClip.offset.toFixed(2)} s · Length {selectedClip.duration.toFixed(2)} s</div></div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><label className="block text-[8px] font-black text-slate-600">FADE IN <span className="float-right text-white">{(selectedClip.fadeIn || 0).toFixed(2)} s</span><input type="range" min={0} max={Math.min(5, selectedClip.duration / 2)} step={0.01} value={selectedClip.fadeIn || 0} onChange={event => setSelectedFade('fadeIn', Number(event.target.value))} className="mt-2 w-full accent-cyan-400" /></label><label className="mt-3 block text-[8px] font-black text-slate-600">FADE OUT <span className="float-right text-white">{(selectedClip.fadeOut || 0).toFixed(2)} s</span><input type="range" min={0} max={Math.min(5, selectedClip.duration / 2)} step={0.01} value={selectedClip.fadeOut || 0} onChange={event => setSelectedFade('fadeOut', Number(event.target.value))} className="mt-2 w-full accent-fuchsia-400" /></label></div>
                  <div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><label className="block text-[8px] font-black text-slate-600">CROSSFADE <span className="float-right text-white">{crossfadeLength.toFixed(2)} s</span><input type="range" min={0.05} max={4} step={0.05} value={crossfadeLength} onChange={event => setCrossfadeLength(Number(event.target.value))} className="mt-2 w-full accent-emerald-400" /></label><button onClick={applyCrossfade} className="mt-3 w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-[9px] font-black text-emerald-200">APPLICA CROSSFADE</button><div className="mt-2 text-[8px] leading-4 text-slate-600">Crea sovrapposizione e curve fade reali; playback ed export usano la stessa envelope.</div></div>
                </div>)}
                {panel === 'takes' && <div>{!selectedTakes.length ? <div className="py-5 text-[10px] text-slate-600">Nessuna take registrata sulla traccia selezionata.</div> : <><div className="flex flex-wrap gap-2">{selectedTakes.sort((a, b) => (a.takeNumber || 0) - (b.takeNumber || 0)).map(clip => <div key={clip.id} className={`rounded-xl border p-2 ${clip.muted ? 'border-slate-800 bg-slate-950' : 'border-emerald-500/30 bg-emerald-500/10'}`}><button onClick={() => selectTake(selectedTrack.id, clip.id)} className={`block w-full px-1 py-1 text-left ${clip.muted ? 'text-slate-500' : 'text-emerald-200'}`}><div className="text-[9px] font-black">TAKE {clip.takeNumber} {clip.muted ? '' : '· MAIN'}</div><div className="mt-0.5 text-[8px]">{formatTime(clip.start)} · {formatTime(clip.duration)}</div></button><button onClick={() => selectTakeRange(selectedTrack.id, clip.id)} className="mt-1 w-full rounded-md border border-cyan-500/20 bg-cyan-500/[0.06] px-2 py-1 text-[7px] font-black text-cyan-300">USE RANGE {punchEnabled ? `${formatTime(punchIn)}–${formatTime(punchOut)}` : '(SET PUNCH)'}</button></div>)}</div><div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[8px] text-slate-600">Section comp: {selectedTrack.compSections.length} regioni. Fuori dalle regioni resta la take MAIN.</span>{selectedTrack.compSections.length > 0 && <button onClick={clearCompSections} className="text-[8px] font-black text-rose-300">RESET COMP</button>}</div></>}</div>}
              </div>}
            </div>
            <div className="bg-slate-950/60 p-3"><div className="flex items-center justify-between"><div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-purple-300"><Bot className="h-3.5 w-3.5" /> Studio AI Bar</div><span className="text-[8px] text-slate-700">BETA</span></div><div className="mt-2 flex gap-2"><input value={assistantText} onChange={event => setAssistantText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') runAssistant(); }} placeholder="Es. crossfade, apri comp, input microfono..." className="min-w-0 flex-1 rounded-lg border border-slate-800 bg-[#070a10] px-3 py-2 text-[10px] text-white outline-none focus:border-purple-500" /><button onClick={runAssistant} className="rounded-lg bg-purple-600 p-2.5 text-white"><Sparkles className="h-3.5 w-3.5" /></button></div><div className="mt-2 min-h-8 text-[9px] leading-4 text-slate-500">{assistantNotice}</div></div>
          </div>
        </main>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-800 bg-slate-950 px-4 py-2 text-[8px] font-bold uppercase tracking-wider text-slate-600"><div className="flex items-center gap-4"><span className="flex items-center gap-1.5"><Gauge className="h-3 w-3" /> {bpm} BPM</span><span>{keySignature}</span><span>{tracks.length} tracks</span><span>{tracks.reduce((sum, track) => sum + track.clips.length, 0)} clips</span><span>{tracks.reduce((sum, track) => sum + track.compSections.length, 0)} comp</span></div><div className="flex items-center gap-3"><span>Q {quantize}</span><span>Input {inputReady ? 'ready' : 'off'}</span>{latencyMs !== null && <span>~{latencyMs}ms</span>}<span>48 kHz render</span><span>32-bit float export</span>{recording && <span className="text-rose-300">● REC</span>}{rendering && <span className="flex items-center gap-1 text-purple-300"><Loader2 className="h-3 w-3 animate-spin" /> rendering</span>}</div></footer>
    </div>
  );
}
