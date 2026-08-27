import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Disc3, Download, FolderOpen, Gauge, Pause, Play, Radio, RotateCcw, SlidersHorizontal, Zap } from 'lucide-react';
import { DJDeckId, emitDJFeedback, onDJControl } from './djRuntime';

type DeckModel = {
  title: string;
  url: string;
  duration: number;
  bpm: number;
  bpmAnalyzed: boolean;
  waveform: number[];
  playing: boolean;
  volume: number;
  filter: number;
  low: number;
  mid: number;
  high: number;
  echo: number;
  hotCues: Array<number | null>;
  loopActive: boolean;
  loopStart: number;
  loopBeats: number;
  rate: number;
};

type DeckAudioGraph = {
  source: MediaElementAudioSourceNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  filter: BiquadFilterNode;
  dry: GainNode;
  delay: DelayNode;
  delayFeedback: GainNode;
  echoWet: GainNode;
  deckGain: GainNode;
  crossGain: GainNode;
};

const makeDeck = (): DeckModel => ({
  title: 'Nessuna traccia', url: '', duration: 0, bpm: 124, bpmAnalyzed: false, waveform: [], playing: false, volume: 0.9,
  filter: 0, low: 0, mid: 0, high: 0, echo: 0, hotCues: [null, null, null, null, null, null, null, null],
  loopActive: false, loopStart: 0, loopBeats: 4, rate: 1
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const seconds = (value: number) => `${Math.floor(value / 60)}:${Math.floor(value % 60).toString().padStart(2, '0')}`;

function buildWaveform(buffer: AudioBuffer, bars = 160) {
  const channel = buffer.getChannelData(0);
  const stride = Math.max(1, Math.floor(channel.length / bars));
  const peaks: number[] = [];
  let max = 0.0001;
  for (let bar = 0; bar < bars; bar += 1) {
    const start = bar * stride;
    const end = Math.min(channel.length, start + stride);
    let peak = 0;
    for (let index = start; index < end; index += Math.max(1, Math.floor(stride / 180))) peak = Math.max(peak, Math.abs(channel[index] || 0));
    peaks.push(peak);
    max = Math.max(max, peak);
  }
  return peaks.map(value => clamp(value / max, 0.04, 1));
}

function estimateBpm(buffer: AudioBuffer) {
  const channel = buffer.getChannelData(0);
  const frame = 1024;
  const usable = Math.min(channel.length, Math.floor(buffer.sampleRate * 120));
  const envelope: number[] = [];
  for (let start = 0; start + frame < usable; start += frame) {
    let sum = 0;
    for (let index = start; index < start + frame; index += 4) sum += Math.abs(channel[index] || 0);
    envelope.push(sum / (frame / 4));
  }
  if (envelope.length < 100) return 0;
  const onset = envelope.map((value, index) => Math.max(0, value - (envelope[index - 1] || value)));
  const fps = buffer.sampleRate / frame;
  const minLag = Math.max(1, Math.floor((fps * 60) / 190));
  const maxLag = Math.max(minLag + 1, Math.ceil((fps * 60) / 65));
  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let score = 0;
    for (let index = lag; index < onset.length; index += 1) score += onset[index] * onset[index - lag];
    if (score > bestScore) { bestScore = score; bestLag = lag; }
  }
  if (!bestLag) return 0;
  let bpm = (fps * 60) / bestLag;
  while (bpm < 80) bpm *= 2;
  while (bpm > 170) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

function DeckPanel({ id, model, currentTime, onFile, onToggle, onCue, onHotCue, onLoop, onModel }: {
  id: DJDeckId;
  model: DeckModel;
  currentTime: number;
  onFile: (file: File) => void;
  onToggle: () => void;
  onCue: () => void;
  onHotCue: (index: number) => void;
  onLoop: () => void;
  onModel: (patch: Partial<DeckModel>) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const progress = model.duration ? clamp(currentTime / model.duration, 0, 1) : 0;
  return <div className="rounded-2xl border border-slate-800 bg-[#070a10] p-4 shadow-xl">
    <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="text-[9px] font-black uppercase tracking-[0.25em] text-cyan-300">DECK {id}</div><div className="mt-1 truncate text-sm font-black text-white">{model.title}</div><div className="mt-1 text-[9px] text-slate-500">{seconds(currentTime)} / {seconds(model.duration)} · {model.bpm.toFixed(1)} BPM {model.bpmAnalyzed ? '· ANALYZED' : ''} · {model.rate.toFixed(3)}x</div></div><Disc3 className={`h-9 w-9 shrink-0 text-slate-600 ${model.playing ? 'animate-spin' : ''}`} /></div>
    <div className="relative mt-4 h-20 overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-2"><div className="flex h-full items-center gap-px">{model.waveform.length ? model.waveform.map((peak, index) => <div key={index} className={`min-w-0 flex-1 rounded-full ${index / model.waveform.length <= progress ? 'bg-cyan-300/80' : 'bg-slate-700/70'}`} style={{ height: `${Math.max(7, peak * 100)}%` }} />) : <div className="m-auto text-[8px] font-black text-slate-700">CARICA UNA TRACCIA PER LA WAVEFORM REALE</div>}</div>{model.waveform.length ? <div className="pointer-events-none absolute inset-y-1 w-px bg-white/90" style={{ left: `${progress * 100}%` }} /> : null}</div>
    <div className="mt-3 grid grid-cols-4 gap-2"><button onClick={onToggle} disabled={!model.url} className={`rounded-xl px-3 py-3 text-[9px] font-black ${model.playing ? 'bg-emerald-400 text-black' : 'border border-slate-800 bg-slate-950 text-white'} disabled:opacity-40`}>{model.playing ? <Pause className="mx-auto h-4 w-4" /> : <Play className="mx-auto h-4 w-4" />}</button><button onClick={onCue} disabled={!model.url} className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-3 text-[9px] font-black text-amber-200 disabled:opacity-40">CUE</button><button onClick={onLoop} disabled={!model.url} className={`rounded-xl border px-3 py-3 text-[9px] font-black ${model.loopActive ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-100' : 'border-slate-800 bg-slate-950 text-slate-300'} disabled:opacity-40`}>LOOP</button><button onClick={() => inputRef.current?.click()} className="rounded-xl border border-purple-500/25 bg-purple-500/10 px-3 py-3 text-purple-100"><FolderOpen className="mx-auto h-4 w-4" /></button></div>
    <input ref={inputRef} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a,.aac,.ogg" className="hidden" onChange={event => { const file = event.target.files?.[0]; if (file) onFile(file); event.currentTarget.value = ''; }} />
    <div className="mt-3 grid grid-cols-4 gap-1.5">{model.hotCues.map((cue, index) => <button key={index} onClick={() => onHotCue(index)} disabled={!model.url} className={`rounded-lg border px-2 py-2 text-[8px] font-black ${cue == null ? 'border-slate-800 bg-slate-950 text-slate-600' : 'border-fuchsia-500/35 bg-fuchsia-500/10 text-fuchsia-200'} disabled:opacity-40`}>HOT {index + 1}{cue != null ? <span className="ml-1 text-[7px] text-slate-500">{seconds(cue)}</span> : null}</button>)}</div>
    <div className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-[8px] font-black text-slate-500">BPM <span className="float-right text-white">{model.bpm.toFixed(1)}</span><input type="range" min={60} max={200} step={0.1} value={model.bpm} onChange={e => onModel({ bpm: Number(e.target.value), bpmAnalyzed: false })} className="mt-1 w-full accent-cyan-500" /></label><label className="text-[8px] font-black text-slate-500">VOLUME <span className="float-right text-white">{Math.round(model.volume * 100)}%</span><input type="range" min={0} max={1} step={0.01} value={model.volume} onChange={e => onModel({ volume: Number(e.target.value) })} className="mt-1 w-full accent-fuchsia-500" /></label></div>
    <div className="mt-3 grid grid-cols-5 gap-2"><label className="text-[8px] font-bold text-slate-600">LOW<input type="range" min={-18} max={9} step={0.5} value={model.low} onChange={e => onModel({ low: Number(e.target.value) })} className="mt-1 w-full accent-purple-500" /></label><label className="text-[8px] font-bold text-slate-600">MID<input type="range" min={-18} max={9} step={0.5} value={model.mid} onChange={e => onModel({ mid: Number(e.target.value) })} className="mt-1 w-full accent-purple-500" /></label><label className="text-[8px] font-bold text-slate-600">HIGH<input type="range" min={-18} max={9} step={0.5} value={model.high} onChange={e => onModel({ high: Number(e.target.value) })} className="mt-1 w-full accent-purple-500" /></label><label className="text-[8px] font-bold text-slate-600">FILTER<input type="range" min={-1} max={1} step={0.01} value={model.filter} onChange={e => onModel({ filter: Number(e.target.value) })} className="mt-1 w-full accent-cyan-500" /></label><label className="text-[8px] font-bold text-slate-600">ECHO<input type="range" min={0} max={1} step={0.01} value={model.echo} onChange={e => onModel({ echo: Number(e.target.value) })} className="mt-1 w-full accent-fuchsia-500" /></label></div>
  </div>;
}

export default function DJLiveMixer() {
  const [deckA, setDeckA] = useState<DeckModel>(makeDeck);
  const [deckB, setDeckB] = useState<DeckModel>(makeDeck);
  const [timeA, setTimeA] = useState(0);
  const [timeB, setTimeB] = useState(0);
  const [crossfader, setCrossfader] = useState(0);
  const [master, setMaster] = useState(0.9);
  const [audioReady, setAudioReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingMime, setRecordingMime] = useState('');
  const audioA = useRef<HTMLAudioElement | null>(null);
  const audioB = useRef<HTMLAudioElement | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const graphA = useRef<DeckAudioGraph | null>(null);
  const graphB = useRef<DeckAudioGraph | null>(null);
  const masterGain = useRef<GainNode | null>(null);
  const limiter = useRef<DynamicsCompressorNode | null>(null);
  const recordDestination = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const raf = useRef<number | null>(null);

  if (!audioA.current && typeof Audio !== 'undefined') { audioA.current = new Audio(); audioA.current.preload = 'metadata'; }
  if (!audioB.current && typeof Audio !== 'undefined') { audioB.current = new Audio(); audioB.current.preload = 'metadata'; }

  const ensureGraph = async () => {
    if (!contextRef.current) {
      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextCtor({ latencyHint: 'interactive' });
      contextRef.current = ctx;
      masterGain.current = ctx.createGain();
      limiter.current = ctx.createDynamicsCompressor();
      limiter.current.threshold.value = -2;
      limiter.current.knee.value = 3;
      limiter.current.ratio.value = 12;
      limiter.current.attack.value = 0.003;
      limiter.current.release.value = 0.08;
      recordDestination.current = ctx.createMediaStreamDestination();
      masterGain.current.connect(limiter.current);
      limiter.current.connect(ctx.destination);
      limiter.current.connect(recordDestination.current);
    }
    const ctx = contextRef.current!;
    if (ctx.state === 'suspended') await ctx.resume();
    const create = (audio: HTMLAudioElement, graphRef: React.MutableRefObject<DeckAudioGraph | null>) => {
      if (graphRef.current) return graphRef.current;
      const source = ctx.createMediaElementSource(audio);
      const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 180;
      const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = 0.8;
      const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 6500;
      const filterNode = ctx.createBiquadFilter(); filterNode.type = 'lowpass'; filterNode.frequency.value = 20000; filterNode.Q.value = 0.7;
      const dry = ctx.createGain(); dry.gain.value = 1;
      const delay = ctx.createDelay(2); delay.delayTime.value = 0.25;
      const delayFeedback = ctx.createGain(); delayFeedback.gain.value = 0.28;
      const echoWet = ctx.createGain(); echoWet.gain.value = 0;
      const deckGain = ctx.createGain(); const crossGain = ctx.createGain();
      source.connect(low).connect(mid).connect(high).connect(filterNode);
      filterNode.connect(dry).connect(deckGain);
      filterNode.connect(delay);
      delay.connect(delayFeedback).connect(delay);
      delay.connect(echoWet).connect(deckGain);
      deckGain.connect(crossGain).connect(masterGain.current!);
      graphRef.current = { source, low, mid, high, filter: filterNode, dry, delay, delayFeedback, echoWet, deckGain, crossGain };
      return graphRef.current;
    };
    if (audioA.current) create(audioA.current, graphA);
    if (audioB.current) create(audioB.current, graphB);
    setAudioReady(true);
    return ctx;
  };

  const updateGraph = (model: DeckModel, graph: DeckAudioGraph | null) => {
    if (!graph) return;
    graph.deckGain.gain.value = model.volume;
    graph.low.gain.value = model.low; graph.mid.gain.value = model.mid; graph.high.gain.value = model.high;
    graph.delay.delayTime.value = clamp((60 / Math.max(40, model.bpm)) * 0.5, 0.05, 1);
    graph.echoWet.gain.value = model.echo * 0.55;
    graph.delayFeedback.gain.value = 0.18 + model.echo * 0.45;
    if (model.filter < 0) { graph.filter.type = 'lowpass'; graph.filter.frequency.value = 20000 * Math.pow(0.03, -model.filter); }
    else if (model.filter > 0) { graph.filter.type = 'highpass'; graph.filter.frequency.value = 25 * Math.pow(300, model.filter); }
    else { graph.filter.type = 'lowpass'; graph.filter.frequency.value = 20000; }
  };

  useEffect(() => { updateGraph(deckA, graphA.current); if (audioA.current) audioA.current.playbackRate = deckA.rate; }, [deckA.volume, deckA.low, deckA.mid, deckA.high, deckA.filter, deckA.echo, deckA.bpm, deckA.rate]);
  useEffect(() => { updateGraph(deckB, graphB.current); if (audioB.current) audioB.current.playbackRate = deckB.rate; }, [deckB.volume, deckB.low, deckB.mid, deckB.high, deckB.filter, deckB.echo, deckB.bpm, deckB.rate]);
  useEffect(() => { if (masterGain.current) masterGain.current.gain.value = master; }, [master]);
  useEffect(() => { const x = clamp((crossfader + 1) / 2, 0, 1); if (graphA.current) graphA.current.crossGain.gain.value = Math.cos(x * Math.PI / 2); if (graphB.current) graphB.current.crossGain.gain.value = Math.sin(x * Math.PI / 2); emitDJFeedback({ control: 'crossfader', value: (crossfader + 1) / 2 }); }, [crossfader]);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ masterOutput?: string }>).detail;
      const ctx = contextRef.current as AudioContext & { setSinkId?: (id: string) => Promise<void> };
      if (ctx?.setSinkId && detail?.masterOutput) void ctx.setSinkId(detail.masterOutput).catch(() => undefined);
    };
    window.addEventListener('sonara:dj-audio-routing', handler);
    return () => window.removeEventListener('sonara:dj-audio-routing', handler);
  }, []);

  useEffect(() => {
    const tick = () => {
      const a = audioA.current; const b = audioB.current;
      if (a) { setTimeA(a.currentTime || 0); if (deckA.loopActive) { const length = (60 / deckA.bpm) * deckA.loopBeats; if (a.currentTime >= deckA.loopStart + length) a.currentTime = deckA.loopStart; } }
      if (b) { setTimeB(b.currentTime || 0); if (deckB.loopActive) { const length = (60 / deckB.bpm) * deckB.loopBeats; if (b.currentTime >= deckB.loopStart + length) b.currentTime = deckB.loopStart; } }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [deckA.loopActive, deckA.loopStart, deckA.loopBeats, deckA.bpm, deckB.loopActive, deckB.loopStart, deckB.loopBeats, deckB.bpm]);

  useEffect(() => onDJControl(action => {
    const apply = (deck: DJDeckId, patch: Partial<DeckModel>) => deck === 'A' ? setDeckA(current => ({ ...current, ...patch })) : setDeckB(current => ({ ...current, ...patch }));
    const audio = action.type.startsWith('deck.') && 'deck' in action ? (action.deck === 'A' ? audioA.current : audioB.current) : null;
    if (action.type === 'deck.play' && audio) { void ensureGraph().then(() => { if (audio.paused) void audio.play(); else audio.pause(); apply(action.deck, { playing: !audio.paused }); emitDJFeedback({ control: 'play', deck: action.deck, value: !audio.paused }); }); }
    if (action.type === 'deck.cue' && audio && action.pressed) { audio.pause(); audio.currentTime = 0; apply(action.deck, { playing: false }); emitDJFeedback({ control: 'cue', deck: action.deck, value: true }); }
    if (action.type === 'deck.pitch') { const value = clamp(action.value, -50, 100); apply(action.deck, { rate: clamp(1 + value / 100, 0.5, 2) }); emitDJFeedback({ control: 'pitch', deck: action.deck, value }); }
    if (action.type === 'deck.volume') { const value = clamp(action.value, 0, 1); apply(action.deck, { volume: value }); emitDJFeedback({ control: 'volume', deck: action.deck, value }); }
    if (action.type === 'deck.filter') { const value = clamp(action.value, -1, 1); apply(action.deck, { filter: value }); emitDJFeedback({ control: 'filter', deck: action.deck, value }); }
    if (action.type === 'deck.eqLow') { const value = clamp(action.value, -18, 9); apply(action.deck, { low: value }); emitDJFeedback({ control: 'eqLow', deck: action.deck, value }); }
    if (action.type === 'deck.eqMid') { const value = clamp(action.value, -18, 9); apply(action.deck, { mid: value }); emitDJFeedback({ control: 'eqMid', deck: action.deck, value }); }
    if (action.type === 'deck.eqHigh') { const value = clamp(action.value, -18, 9); apply(action.deck, { high: value }); emitDJFeedback({ control: 'eqHigh', deck: action.deck, value }); }
    if (action.type === 'deck.hotcue' && audio && action.pressed !== false) { const model = action.deck === 'A' ? deckA : deckB; const cue = model.hotCues[action.index]; if (cue == null) { const next = [...model.hotCues]; next[action.index] = audio.currentTime; apply(action.deck, { hotCues: next }); } else audio.currentTime = cue; }
    if (action.type === 'deck.loop' && audio && action.pressed !== false) { const model = action.deck === 'A' ? deckA : deckB; apply(action.deck, { loopActive: !model.loopActive, loopStart: audio.currentTime, loopBeats: action.beats || model.loopBeats }); }
    if (action.type === 'deck.sync' && action.pressed !== false) { const own = action.deck === 'A' ? deckA : deckB; const other = action.deck === 'A' ? deckB : deckA; if (own.bpm > 0 && other.bpm > 0) apply(action.deck, { rate: clamp(other.bpm / own.bpm, 0.5, 2) }); }
    if (action.type === 'mixer.crossfader') setCrossfader(clamp(action.value, -1, 1));
    if (action.type === 'mixer.master') { const value = clamp(action.value, 0, 1); setMaster(value); emitDJFeedback({ control: 'master', value }); }
  }), [deckA, deckB]);

  const loadFile = async (deck: DJDeckId, file: File) => {
    const audio = deck === 'A' ? audioA.current : audioB.current; if (!audio) return;
    const previous = deck === 'A' ? deckA.url : deckB.url; if (previous) URL.revokeObjectURL(previous);
    const url = URL.createObjectURL(file); audio.src = url; audio.load();
    let duration = 0; let waveform: number[] = []; let analyzedBpm = 0;
    try {
      const ctx = await ensureGraph();
      const bytes = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(bytes.slice(0));
      duration = decoded.duration;
      waveform = buildWaveform(decoded);
      analyzedBpm = estimateBpm(decoded);
    } catch {
      duration = await new Promise<number>(resolve => { const done = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 0); audio.addEventListener('loadedmetadata', done, { once: true }); window.setTimeout(() => resolve(Number.isFinite(audio.duration) ? audio.duration : 0), 2500); });
    }
    const patch: Partial<DeckModel> = { title: file.name.replace(/\.[^.]+$/, ''), url, duration, waveform, bpm: analyzedBpm || 124, bpmAnalyzed: Boolean(analyzedBpm), playing: false, hotCues: [null, null, null, null, null, null, null, null], loopActive: false, loopStart: 0, rate: 1 };
    if (deck === 'A') setDeckA(current => ({ ...current, ...patch })); else setDeckB(current => ({ ...current, ...patch }));
  };
  const toggle = async (deck: DJDeckId) => { const audio = deck === 'A' ? audioA.current : audioB.current; if (!audio?.src) return; await ensureGraph(); if (audio.paused) await audio.play(); else audio.pause(); (deck === 'A' ? setDeckA : setDeckB)(current => ({ ...current, playing: !audio.paused })); emitDJFeedback({ control: 'play', deck, value: !audio.paused }); };
  const cue = (deck: DJDeckId) => { const audio = deck === 'A' ? audioA.current : audioB.current; if (!audio) return; audio.pause(); audio.currentTime = 0; (deck === 'A' ? setDeckA : setDeckB)(current => ({ ...current, playing: false })); };
  const hotCue = (deck: DJDeckId, index: number) => { const audio = deck === 'A' ? audioA.current : audioB.current; const model = deck === 'A' ? deckA : deckB; if (!audio) return; const cuePoint = model.hotCues[index]; if (cuePoint == null) { const next = [...model.hotCues]; next[index] = audio.currentTime; (deck === 'A' ? setDeckA : setDeckB)(current => ({ ...current, hotCues: next })); } else audio.currentTime = cuePoint; };
  const loop = (deck: DJDeckId) => { const audio = deck === 'A' ? audioA.current : audioB.current; if (!audio) return; (deck === 'A' ? setDeckA : setDeckB)(current => ({ ...current, loopActive: !current.loopActive, loopStart: audio.currentTime })); };
  const sync = (deck: DJDeckId) => { const own = deck === 'A' ? deckA : deckB; const other = deck === 'A' ? deckB : deckA; if (!own.url || !other.url || !own.bpm || !other.bpm) return; const rate = clamp(other.bpm / own.bpm, 0.5, 2); (deck === 'A' ? setDeckA : setDeckB)(current => ({ ...current, rate })); };

  const toggleRecording = async () => {
    await ensureGraph();
    if (recording) { recorderRef.current?.stop(); setRecording(false); return; }
    if (!recordDestination.current || typeof MediaRecorder === 'undefined') return;
    const candidates = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];
    const mimeType = candidates.find(type => MediaRecorder.isTypeSupported(type)) || '';
    const recorder = new MediaRecorder(recordDestination.current.stream, mimeType ? { mimeType } : undefined);
    recordChunks.current = [];
    recorder.ondataavailable = event => { if (event.data.size) recordChunks.current.push(event.data); };
    recorder.onstop = () => {
      const actualType = recorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(recordChunks.current, { type: actualType });
      const extension = actualType.includes('ogg') ? 'ogg' : 'webm';
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = `sonara-dj-set-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`; anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    recorder.start(1000); recorderRef.current = recorder; setRecordingMime(recorder.mimeType || mimeType || 'audio/webm'); setRecording(true);
  };

  const latency = useMemo(() => { const ctx = contextRef.current as (AudioContext & { outputLatency?: number }) | null; if (!ctx) return '—'; const total = Number(ctx.baseLatency || 0) + Number(ctx.outputLatency || 0); return total > 0 ? `${(total * 1000).toFixed(1)} ms` : 'browser'; }, [audioReady]);

  return <section className="rounded-3xl border border-fuchsia-500/15 bg-[linear-gradient(145deg,#070910,#05070b)] p-4 sm:p-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><Zap className="h-4 w-4 text-fuchsia-300"/><h2 className="text-sm font-black text-white">SONARA LIVE DECK ENGINE</h2><span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[8px] font-black text-emerald-300">REAL AUDIO</span></div><p className="mt-1 text-[10px] text-slate-500">Waveform derivata dal file, analisi BPM locale, due deck Web Audio, EQ, filter, echo, hot cue, loop, sync e recording master.</p></div><div className="flex flex-wrap gap-2 text-[8px] font-black"><span className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-400">Latency {latency}</span><button onClick={() => void toggleRecording()} className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 ${recording ? 'border-rose-500/30 bg-rose-500/10 text-rose-300' : 'border-slate-800 bg-slate-950 text-slate-400'}`}><Radio className="h-3 w-3"/>{recording ? 'STOP REC' : 'REC SET'}</button>{recordingMime ? <span className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-slate-500">{recordingMime}</span> : null}</div></div>
    <div className="mt-5 grid gap-4 xl:grid-cols-2"><DeckPanel id="A" model={deckA} currentTime={timeA} onFile={file => void loadFile('A', file)} onToggle={() => void toggle('A')} onCue={() => cue('A')} onHotCue={index => hotCue('A', index)} onLoop={() => loop('A')} onModel={patch => setDeckA(current => ({ ...current, ...patch }))}/><DeckPanel id="B" model={deckB} currentTime={timeB} onFile={file => void loadFile('B', file)} onToggle={() => void toggle('B')} onCue={() => cue('B')} onHotCue={index => hotCue('B', index)} onLoop={() => loop('B')} onModel={patch => setDeckB(current => ({ ...current, ...patch }))}/></div>
    <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/70 p-4"><div className="flex items-center gap-2 text-[10px] font-black text-white"><SlidersHorizontal className="h-4 w-4 text-cyan-300"/> MASTER MIXER</div><div className="mt-4 grid gap-4 lg:grid-cols-[1fr_auto_1fr]"><button onClick={() => sync('A')} className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-[9px] font-black text-cyan-100">SYNC A → B</button><button onClick={() => { if (audioA.current) audioA.current.currentTime = 0; if (audioB.current) audioB.current.currentTime = 0; setCrossfader(0); }} className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-slate-400"><RotateCcw className="h-4 w-4"/></button><button onClick={() => sync('B')} className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/10 px-3 py-2 text-[9px] font-black text-fuchsia-100">SYNC B → A</button></div><label className="mt-4 block text-[9px] font-black text-slate-500">CROSSFADER <span className="float-right text-white">{crossfader < -0.05 ? 'A' : crossfader > 0.05 ? 'B' : 'CENTER'}</span><input type="range" min={-1} max={1} step={0.01} value={crossfader} onChange={event => setCrossfader(Number(event.target.value))} className="mt-2 w-full accent-fuchsia-500"/></label><label className="mt-3 block text-[9px] font-black text-slate-500">MASTER <span className="float-right text-white">{Math.round(master * 100)}%</span><input type="range" min={0} max={1} step={0.01} value={master} onChange={event => setMaster(Number(event.target.value))} className="mt-2 w-full accent-cyan-500"/></label><div className="mt-3 flex items-center gap-2 text-[9px] text-slate-600"><Gauge className="h-3.5 w-3.5"/> Il tempo sync usa playbackRate reale. Key-lock/time-stretch indipendente richiede un DSP dedicato e non viene simulato.</div>{!recording && recordingMime ? <div className="mt-2 flex items-center gap-2 text-[8px] text-slate-600"><Download className="h-3 w-3"/> Le registrazioni vengono scaricate nel MIME realmente prodotto dal browser, senza cambiare estensione in modo fittizio.</div> : null}</div>
  </section>;
}
