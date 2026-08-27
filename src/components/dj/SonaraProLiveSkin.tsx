import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Disc3, FastForward, FolderOpen, Gauge, Headphones, Pause, Play, Radio, Repeat2, Rewind, Settings2, SlidersHorizontal, Square, Upload, Waves, Zap } from 'lucide-react';
import { DJControlAction, DJDeckId, emitDJFeedback, onDJControl } from './djRuntime';

type DeckState = {
  title: string;
  url: string;
  duration: number;
  bpm: number;
  analyzed: boolean;
  waveform: number[];
  playing: boolean;
  volume: number;
  trim: number;
  low: number;
  mid: number;
  high: number;
  filter: number;
  echo: number;
  rate: number;
  pitchPercent: number;
  cuePoint: number;
  hotCues: Array<number | null>;
  loopActive: boolean;
  loopStart: number;
  loopEnd: number;
  loopBeats: number;
  vinyl: boolean;
  slip: boolean;
  quantize: boolean;
  reverse: boolean;
  timeMode: 'elapsed' | 'remain';
};

type DeckGraph = {
  source: MediaElementAudioSourceNode;
  input: GainNode;
  low: BiquadFilterNode;
  mid: BiquadFilterNode;
  high: BiquadFilterNode;
  filter: BiquadFilterNode;
  dry: GainNode;
  delay: DelayNode;
  delayFeedback: GainNode;
  echoWet: GainNode;
  channelGain: GainNode;
  crossGain: GainNode;
};

type ReverseRun = {
  source: AudioBufferSourceNode;
  contextStartedAt: number;
  deckStartedAt: number;
};

type ScratchRun = {
  pointerId: number;
  startX: number;
  startTime: number;
  wasPlaying: boolean;
};

type SlipRun = { startedAt: number; deckStartedAt: number };
type MixerTab = 'mixer' | 'effects' | 'sampler';
type CrossCurve = 'linear' | 'equal' | 'sharp';
type SampleSlot = { name: string; buffer: AudioBuffer | null };

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const seconds = (value: number) => {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, '0')}`;
};
const dbToGain = (db: number) => Math.pow(10, db / 20);

const makeDeck = (): DeckState => ({
  title: 'LOAD TRACK',
  url: '',
  duration: 0,
  bpm: 126,
  analyzed: false,
  waveform: [],
  playing: false,
  volume: 0.86,
  trim: 0,
  low: 0,
  mid: 0,
  high: 0,
  filter: 0,
  echo: 0,
  rate: 1,
  pitchPercent: 0,
  cuePoint: 0,
  hotCues: [null, null, null, null],
  loopActive: false,
  loopStart: 0,
  loopEnd: 0,
  loopBeats: 8,
  vinyl: true,
  slip: false,
  quantize: true,
  reverse: false,
  timeMode: 'elapsed'
});

function buildWaveform(buffer: AudioBuffer, bars = 220) {
  const channel = buffer.getChannelData(0);
  const stride = Math.max(1, Math.floor(channel.length / bars));
  const peaks: number[] = [];
  let max = 0.0001;
  for (let bar = 0; bar < bars; bar += 1) {
    const start = bar * stride;
    const end = Math.min(channel.length, start + stride);
    let peak = 0;
    const sampleStep = Math.max(1, Math.floor(stride / 160));
    for (let index = start; index < end; index += sampleStep) peak = Math.max(peak, Math.abs(channel[index] || 0));
    peaks.push(peak);
    max = Math.max(max, peak);
  }
  return peaks.map(value => clamp(value / max, 0.035, 1));
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
  if (envelope.length < 80) return 0;
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

function reverseBuffer(ctx: AudioContext, buffer: AudioBuffer) {
  const reversed = ctx.createBuffer(buffer.numberOfChannels, buffer.length, buffer.sampleRate);
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const source = buffer.getChannelData(channel);
    const target = reversed.getChannelData(channel);
    for (let index = 0, end = source.length - 1; index < source.length; index += 1, end -= 1) target[index] = source[end] || 0;
  }
  return reversed;
}

function Waveform({ peaks, progress, accent }: { peaks: number[]; progress: number; accent: 'cyan' | 'pink' }) {
  const active = accent === 'cyan' ? 'bg-cyan-300' : 'bg-fuchsia-400';
  return <div className="relative h-20 overflow-hidden rounded-md border border-white/10 bg-black/70 px-2 py-2 shadow-inner">
    <div className="flex h-full items-center gap-px">
      {peaks.length ? peaks.map((peak, index) => <div key={index} className={`min-w-0 flex-1 rounded-full ${index / peaks.length <= progress ? active : 'bg-slate-700/70'}`} style={{ height: `${Math.max(5, peak * 100)}%`, opacity: index / peaks.length <= progress ? 0.88 : 0.72 }} />) : <div className="m-auto text-[8px] font-black tracking-[0.2em] text-slate-700">LOAD AUDIO FOR REAL WAVEFORM</div>}
    </div>
    {peaks.length ? <div className="pointer-events-none absolute inset-y-1 w-px bg-white/90" style={{ left: `${clamp(progress, 0, 1) * 100}%` }} /> : null}
  </div>;
}

function MiniRange({ label, value, min, max, step, color, onChange, format }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  color: 'cyan' | 'pink' | 'white';
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  const accent = color === 'cyan' ? 'accent-cyan-400' : color === 'pink' ? 'accent-fuchsia-400' : 'accent-slate-200';
  return <label className="block rounded-lg border border-white/5 bg-black/20 p-2 text-[7px] font-black uppercase tracking-[0.12em] text-slate-500">
    <span className="flex items-center justify-between gap-2"><span>{label}</span><span className="text-slate-200">{format ? format(value) : value.toFixed(1)}</span></span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.currentTarget.value))} className={`mt-1 w-full ${accent}`} />
  </label>;
}

function DeckFace({
  id, model, currentTime, accent, onLoad, onPlay, onCueDown, onCueUp, onSync, onHotCue, onLoopToggle, onLoopIn, onLoopOut, onReloop,
  onLoopExit, onLoopHalf, onLoopDouble, onBeatJump, onSearch, onReverse, onSlip, onQuantize, onPitch, onScratchStart, onScratchMove,
  onScratchEnd, onToggleTime, onVinyl
}: {
  id: DJDeckId;
  model: DeckState;
  currentTime: number;
  accent: 'cyan' | 'pink';
  onLoad: () => void;
  onPlay: () => void;
  onCueDown: () => void;
  onCueUp: () => void;
  onSync: () => void;
  onHotCue: (index: number) => void;
  onLoopToggle: () => void;
  onLoopIn: () => void;
  onLoopOut: () => void;
  onReloop: () => void;
  onLoopExit: () => void;
  onLoopHalf: () => void;
  onLoopDouble: () => void;
  onBeatJump: (beats: number) => void;
  onSearch: (seconds: number) => void;
  onReverse: () => void;
  onSlip: () => void;
  onQuantize: () => void;
  onPitch: (percent: number) => void;
  onScratchStart: (event: React.PointerEvent<HTMLDivElement>) => void;
  onScratchMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onScratchEnd: (event: React.PointerEvent<HTMLDivElement>) => void;
  onToggleTime: () => void;
  onVinyl: () => void;
}) {
  const cyan = accent === 'cyan';
  const glow = cyan ? 'text-cyan-300' : 'text-fuchsia-300';
  const border = cyan ? 'border-cyan-400/25' : 'border-fuchsia-400/25';
  const soft = cyan ? 'bg-cyan-400/10' : 'bg-fuchsia-400/10';
  const progress = model.duration ? currentTime / model.duration : 0;
  const shownTime = model.timeMode === 'elapsed' ? currentTime : Math.max(0, model.duration - currentTime);
  const actualBpm = model.bpm * model.rate;
  return <section className={`rounded-xl border ${border} bg-[linear-gradient(155deg,#0b0d10,#050607)] shadow-2xl shadow-black/40`}>
    <div className="border-b border-white/5 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${border} ${soft} text-xl font-black ${glow}`}>{id}</div>
          <div className="min-w-0"><div className="truncate text-sm font-black text-white">{model.title}</div><div className="mt-1 text-[8px] font-bold text-slate-500">{model.analyzed ? 'ANALYZED' : 'LOCAL DECK'} · {model.quantize ? 'Q ON' : 'Q OFF'} · {model.slip ? 'SLIP ON' : 'SLIP OFF'}</div></div>
        </div>
        <div className="text-right"><div className={`text-xl font-black ${glow}`}>{actualBpm.toFixed(2)}</div><div className="text-[8px] font-bold text-slate-500">{model.pitchPercent >= 0 ? '+' : ''}{model.pitchPercent.toFixed(1)}%</div></div>
      </div>
      <div className="mt-3"><Waveform peaks={model.waveform} progress={progress} accent={accent} /></div>
      <div className="mt-2 grid grid-cols-[auto_auto_1fr_auto] items-center gap-2 text-[8px] font-black">
        <button type="button" onClick={onLoad} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-slate-200">LOAD</button>
        <button type="button" onClick={onToggleTime} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-slate-400">{model.timeMode === 'elapsed' ? 'TIME' : 'REMAIN'}</button>
        <div className={`${glow} tabular-nums`}>{seconds(shownTime)}</div>
        <button type="button" onClick={onSlip} className={`rounded-md border px-3 py-2 ${model.slip ? `${border} ${soft} ${glow}` : 'border-white/10 bg-white/5 text-slate-500'}`}>SLIP</button>
      </div>
    </div>

    <div className="grid grid-cols-[112px_1fr_72px] gap-3 p-3">
      <div className="space-y-2 text-[7px] font-black text-slate-500">
        <div className="rounded-lg border border-white/5 bg-black/20 p-2">
          <div className="mb-2 text-center text-slate-300">LOOP</div>
          <div className="grid grid-cols-3 gap-1"><button onClick={onLoopHalf} className="rounded border border-white/10 py-1.5">-</button><button onClick={onLoopToggle} className={`rounded border py-1.5 ${model.loopActive ? `${border} ${soft} ${glow}` : 'border-white/10 text-white'}`}>{model.loopBeats}</button><button onClick={onLoopDouble} className="rounded border border-white/10 py-1.5">+</button></div>
          <div className="mt-1 grid grid-cols-2 gap-1"><button onClick={onLoopIn} className="rounded border border-white/10 py-1.5">IN</button><button onClick={onLoopOut} className="rounded border border-white/10 py-1.5">OUT</button></div>
          <div className="mt-1 grid grid-cols-2 gap-1"><button onClick={onReloop} className="rounded border border-white/10 py-1.5">RELOOP</button><button onClick={onLoopExit} className="rounded border border-white/10 py-1.5">EXIT</button></div>
        </div>
        <div className="rounded-lg border border-white/5 bg-black/20 p-2"><div className="mb-2 text-center text-slate-300">BEAT JUMP</div><div className="grid grid-cols-2 gap-1"><button onClick={() => onBeatJump(-4)} className="rounded border border-white/10 py-2"><Rewind className="mx-auto h-3 w-3"/></button><button onClick={() => onBeatJump(4)} className="rounded border border-white/10 py-2"><FastForward className="mx-auto h-3 w-3"/></button></div></div>
        <div className="rounded-lg border border-white/5 bg-black/20 p-2"><div className="mb-2 text-center text-slate-300">DIRECTION</div><button onClick={onReverse} className={`w-full rounded border py-2 ${model.reverse ? 'border-rose-400/35 bg-rose-400/10 text-rose-300' : 'border-white/10'}`}>REV</button></div>
        <div className="rounded-lg border border-white/5 bg-black/20 p-2"><div className="mb-2 text-center text-slate-300">SEARCH</div><div className="grid grid-cols-2 gap-1"><button onClick={() => onSearch(-30)} className="rounded border border-white/10 py-2">-30</button><button onClick={() => onSearch(30)} className="rounded border border-white/10 py-2">+30</button><button onClick={() => onSearch(-5)} className="rounded border border-white/10 py-2">-5</button><button onClick={() => onSearch(5)} className="rounded border border-white/10 py-2">+5</button></div></div>
      </div>

      <div>
        <div
          role="slider"
          aria-label={`Jog wheel deck ${id}`}
          onPointerDown={onScratchStart}
          onPointerMove={onScratchMove}
          onPointerUp={onScratchEnd}
          onPointerCancel={onScratchEnd}
          className={`relative mx-auto aspect-square max-w-[330px] touch-none select-none rounded-full border-[10px] border-[#181b20] bg-[repeating-radial-gradient(circle,#11151a_0_3px,#1d2229_3px_6px)] shadow-[0_28px_70px_rgba(0,0,0,.65),inset_0_0_0_2px_rgba(255,255,255,.06)] ${model.playing ? 'cursor-grabbing' : 'cursor-grab'}`}
        >
          <div className={`absolute inset-[27%] rounded-full border-2 ${border} bg-black shadow-[0_0_30px_rgba(34,211,238,.08)]`}><div className={`absolute inset-[27%] rounded-full ${soft} ring-1 ring-white/10`} /></div>
          <div className={`absolute bottom-[7%] left-1/2 h-1 w-14 -translate-x-1/2 rounded-full ${cyan ? 'bg-cyan-400' : 'bg-fuchsia-400'}`} />
        </div>
        <div className="mt-3 grid grid-cols-[1fr_1.2fr_1fr] gap-2">
          <button type="button" onPointerDown={onCueDown} onPointerUp={onCueUp} onPointerCancel={onCueUp} className={`rounded-full border-2 ${border} bg-black/50 py-3 text-[10px] font-black text-white`}>CUE</button>
          <button type="button" onClick={onPlay} disabled={!model.url} className={`rounded-full border-2 ${model.playing ? 'border-emerald-400 bg-emerald-400/10 text-emerald-200' : 'border-white/15 bg-black/50 text-white'} py-3 disabled:opacity-30`}>{model.playing ? <Pause className="mx-auto h-4 w-4"/> : <Play className="mx-auto h-4 w-4"/>}</button>
          <button type="button" onClick={onSync} className={`rounded-full border-2 ${border} bg-black/50 py-3 text-[9px] font-black text-white`}>SYNC</button>
        </div>
      </div>

      <div className="flex flex-col items-stretch gap-2 text-[7px] font-black text-slate-500">
        <button type="button" onClick={onVinyl} className={`rounded border ${model.vinyl ? `${border} ${soft} ${glow}` : 'border-white/10'} py-2`}>VINYL</button>
        <button type="button" onClick={onSlip} className={`rounded border ${model.slip ? `${border} ${soft} ${glow}` : 'border-white/10'} py-2`}>SLIP</button>
        <button type="button" onClick={onQuantize} className={`rounded border ${model.quantize ? `${border} ${soft} ${glow}` : 'border-white/10'} py-2`}>Q</button>
        <div className="mt-2 text-center text-slate-400">PITCH</div>
        <div className="flex flex-1 items-center justify-center"><input aria-label={`Pitch deck ${id}`} type="range" min={-8} max={8} step={0.1} value={model.pitchPercent} onChange={event => onPitch(Number(event.currentTarget.value))} className={cyan ? 'accent-cyan-400' : 'accent-fuchsia-400'} style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 230 }} /></div>
        <div className="text-center text-slate-300">+/-8</div>
      </div>
    </div>

    <div className="border-t border-white/5 p-3">
      <div className="mb-2 text-[8px] font-black tracking-[0.16em] text-slate-500">HOT CUES</div>
      <div className="grid grid-cols-4 gap-2">{model.hotCues.map((cue, index) => <button key={index} type="button" onClick={() => onHotCue(index)} className={`rounded-md border px-2 py-3 text-[9px] font-black ${cue == null ? 'border-white/10 bg-black/30 text-slate-500' : `${border} ${soft} ${glow}`}`}>{index + 1}{cue != null ? <span className="ml-1 text-[7px] opacity-70">{seconds(cue)}</span> : null}</button>)}</div>
    </div>
  </section>;
}

export default function SonaraProLiveSkin() {
  const [deckA, setDeckA] = useState<DeckState>(makeDeck);
  const [deckB, setDeckB] = useState<DeckState>(makeDeck);
  const [timeA, setTimeA] = useState(0);
  const [timeB, setTimeB] = useState(0);
  const [crossfader, setCrossfader] = useState(0);
  const [master, setMaster] = useState(0.9);
  const [curve, setCurve] = useState<CrossCurve>('equal');
  const [tab, setTab] = useState<MixerTab>('mixer');
  const [limiterEnabled, setLimiterEnabled] = useState(true);
  const [recording, setRecording] = useState(false);
  const [recordingMime, setRecordingMime] = useState('');
  const [meter, setMeter] = useState(0);
  const [autoMix, setAutoMix] = useState(false);
  const [status, setStatus] = useState('SONARA PRO LIVE ready. Load a track into Deck A or B.');
  const [midiPulse, setMidiPulse] = useState(0);
  const [samples, setSamples] = useState<SampleSlot[]>(() => Array.from({ length: 4 }, (_, index) => ({ name: `SAMPLE ${index + 1}`, buffer: null })));

  const audioA = useRef<HTMLAudioElement | null>(null);
  const audioB = useRef<HTMLAudioElement | null>(null);
  const deckARef = useRef(deckA);
  const deckBRef = useRef(deckB);
  const timeARef = useRef(timeA);
  const timeBRef = useRef(timeB);
  const crossRef = useRef(crossfader);
  const masterRef = useRef(master);
  const curveRef = useRef(curve);
  const contextRef = useRef<AudioContext | null>(null);
  const graphA = useRef<DeckGraph | null>(null);
  const graphB = useRef<DeckGraph | null>(null);
  const decodedA = useRef<AudioBuffer | null>(null);
  const decodedB = useRef<AudioBuffer | null>(null);
  const reversedA = useRef<AudioBuffer | null>(null);
  const reversedB = useRef<AudioBuffer | null>(null);
  const reverseA = useRef<ReverseRun | null>(null);
  const reverseB = useRef<ReverseRun | null>(null);
  const scratchA = useRef<ScratchRun | null>(null);
  const scratchB = useRef<ScratchRun | null>(null);
  const slipA = useRef<SlipRun | null>(null);
  const slipB = useRef<SlipRun | null>(null);
  const masterGain = useRef<GainNode | null>(null);
  const limiter = useRef<DynamicsCompressorNode | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const recordDestination = useRef<MediaStreamAudioDestinationNode | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recordChunks = useRef<Blob[]>([]);
  const desiredSink = useRef('');
  const raf = useRef<number | null>(null);
  const lastMeterAt = useRef(0);
  const autoMixRun = useRef<{ from: DJDeckId; startedAt: number } | null>(null);
  const fileA = useRef<HTMLInputElement | null>(null);
  const fileB = useRef<HTMLInputElement | null>(null);
  const sampleInputs = useRef<Array<HTMLInputElement | null>>([]);

  if (!audioA.current && typeof Audio !== 'undefined') {
    audioA.current = new Audio();
    audioA.current.preload = 'auto';
    if ('preservesPitch' in audioA.current) (audioA.current as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = true;
  }
  if (!audioB.current && typeof Audio !== 'undefined') {
    audioB.current = new Audio();
    audioB.current.preload = 'auto';
    if ('preservesPitch' in audioB.current) (audioB.current as HTMLAudioElement & { preservesPitch: boolean }).preservesPitch = true;
  }

  useEffect(() => { deckARef.current = deckA; }, [deckA]);
  useEffect(() => { deckBRef.current = deckB; }, [deckB]);
  useEffect(() => { timeARef.current = timeA; }, [timeA]);
  useEffect(() => { timeBRef.current = timeB; }, [timeB]);
  useEffect(() => { crossRef.current = crossfader; }, [crossfader]);
  useEffect(() => { masterRef.current = master; }, [master]);
  useEffect(() => { curveRef.current = curve; }, [curve]);

  const getDeck = (deck: DJDeckId) => deck === 'A' ? deckARef.current : deckBRef.current;
  const getAudio = (deck: DJDeckId) => deck === 'A' ? audioA.current : audioB.current;
  const getGraph = (deck: DJDeckId) => deck === 'A' ? graphA.current : graphB.current;
  const getReverse = (deck: DJDeckId) => deck === 'A' ? reverseA : reverseB;
  const getReversedBuffer = (deck: DJDeckId) => deck === 'A' ? reversedA.current : reversedB.current;
  const getScratch = (deck: DJDeckId) => deck === 'A' ? scratchA : scratchB;
  const getSlip = (deck: DJDeckId) => deck === 'A' ? slipA : slipB;
  const getTime = (deck: DJDeckId) => deck === 'A' ? timeARef.current : timeBRef.current;
  const setTime = (deck: DJDeckId, value: number) => deck === 'A' ? setTimeA(value) : setTimeB(value);
  const patchDeck = (deck: DJDeckId, patch: Partial<DeckState>) => deck === 'A' ? setDeckA(current => ({ ...current, ...patch })) : setDeckB(current => ({ ...current, ...patch }));

  const ensureGraph = async () => {
    if (!contextRef.current) {
      const AudioContextCtor = window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioContextCtor({ latencyHint: 'interactive' });
      contextRef.current = ctx;
      masterGain.current = ctx.createGain();
      limiter.current = ctx.createDynamicsCompressor();
      analyser.current = ctx.createAnalyser();
      analyser.current.fftSize = 256;
      recordDestination.current = ctx.createMediaStreamDestination();
      masterGain.current.gain.value = masterRef.current;
      limiter.current.threshold.value = -2;
      limiter.current.knee.value = 3;
      limiter.current.ratio.value = 12;
      limiter.current.attack.value = 0.003;
      limiter.current.release.value = 0.08;
      masterGain.current.connect(limiter.current);
      limiter.current.connect(analyser.current);
      analyser.current.connect(ctx.destination);
      analyser.current.connect(recordDestination.current);
      const sinkCtx = ctx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
      if (desiredSink.current && sinkCtx.setSinkId) void sinkCtx.setSinkId(desiredSink.current).catch(() => undefined);
    }
    const ctx = contextRef.current!;
    if (ctx.state === 'suspended') await ctx.resume();
    const buildDeckGraph = (audio: HTMLAudioElement, holder: React.MutableRefObject<DeckGraph | null>) => {
      if (holder.current) return holder.current;
      const source = ctx.createMediaElementSource(audio);
      const input = ctx.createGain();
      const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 180;
      const mid = ctx.createBiquadFilter(); mid.type = 'peaking'; mid.frequency.value = 1200; mid.Q.value = 0.8;
      const high = ctx.createBiquadFilter(); high.type = 'highshelf'; high.frequency.value = 6500;
      const filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 20000; filter.Q.value = 0.7;
      const dry = ctx.createGain();
      const delay = ctx.createDelay(2);
      const delayFeedback = ctx.createGain();
      const echoWet = ctx.createGain();
      const channelGain = ctx.createGain();
      const crossGain = ctx.createGain();
      source.connect(input);
      input.connect(low).connect(mid).connect(high).connect(filter);
      filter.connect(dry).connect(channelGain);
      filter.connect(delay);
      delay.connect(delayFeedback).connect(delay);
      delay.connect(echoWet).connect(channelGain);
      channelGain.connect(crossGain).connect(masterGain.current!);
      holder.current = { source, input, low, mid, high, filter, dry, delay, delayFeedback, echoWet, channelGain, crossGain };
      return holder.current;
    };
    if (audioA.current) buildDeckGraph(audioA.current, graphA);
    if (audioB.current) buildDeckGraph(audioB.current, graphB);
    return ctx;
  };

  const applyDeckGraph = (deck: DJDeckId) => {
    const model = getDeck(deck);
    const graph = getGraph(deck);
    const audio = getAudio(deck);
    if (!graph) return;
    graph.input.gain.value = dbToGain(model.trim);
    graph.channelGain.gain.value = model.volume;
    graph.low.gain.value = model.low;
    graph.mid.gain.value = model.mid;
    graph.high.gain.value = model.high;
    graph.delay.delayTime.value = clamp((60 / Math.max(40, model.bpm * model.rate)) * 0.5, 0.04, 1.2);
    graph.echoWet.gain.value = model.echo * 0.55;
    graph.delayFeedback.gain.value = 0.15 + model.echo * 0.55;
    if (model.filter < 0) { graph.filter.type = 'lowpass'; graph.filter.frequency.value = 20000 * Math.pow(0.025, -model.filter); }
    else if (model.filter > 0) { graph.filter.type = 'highpass'; graph.filter.frequency.value = 25 * Math.pow(340, model.filter); }
    else { graph.filter.type = 'lowpass'; graph.filter.frequency.value = 20000; }
    if (audio) audio.playbackRate = model.rate;
    const reverse = getReverse(deck).current;
    if (reverse) reverse.source.playbackRate.value = model.rate;
  };

  useEffect(() => { applyDeckGraph('A'); }, [deckA.volume, deckA.trim, deckA.low, deckA.mid, deckA.high, deckA.filter, deckA.echo, deckA.rate, deckA.bpm]);
  useEffect(() => { applyDeckGraph('B'); }, [deckB.volume, deckB.trim, deckB.low, deckB.mid, deckB.high, deckB.filter, deckB.echo, deckB.rate, deckB.bpm]);
  useEffect(() => { if (masterGain.current) masterGain.current.gain.value = master; }, [master]);

  const applyCross = (value = crossRef.current, activeCurve = curveRef.current) => {
    const x = clamp((value + 1) / 2, 0, 1);
    let a = 1 - x;
    let b = x;
    if (activeCurve === 'equal') { a = Math.cos(x * Math.PI / 2); b = Math.sin(x * Math.PI / 2); }
    if (activeCurve === 'sharp') { a = x < 0.52 ? 1 : Math.max(0, 1 - (x - 0.52) * 2.08); b = x > 0.48 ? 1 : Math.max(0, x * 2.08); }
    if (graphA.current) graphA.current.crossGain.gain.value = a;
    if (graphB.current) graphB.current.crossGain.gain.value = b;
  };
  useEffect(() => { applyCross(crossfader, curve); emitDJFeedback({ control: 'crossfader', value: (crossfader + 1) / 2 }); }, [crossfader, curve]);

  const quantizedTime = (deck: DJDeckId, value: number) => {
    const model = getDeck(deck);
    if (!model.quantize || !model.bpm) return value;
    const beat = 60 / (model.bpm * model.rate);
    return clamp(Math.round(value / beat) * beat, 0, model.duration || value);
  };

  const setPlayhead = (deck: DJDeckId, target: number) => {
    const model = getDeck(deck);
    const safe = clamp(target, 0, model.duration || Math.max(0, target));
    const audio = getAudio(deck);
    const reverseHolder = getReverse(deck);
    if (reverseHolder.current) {
      try { reverseHolder.current.source.stop(); } catch { }
      reverseHolder.current = null;
      if (audio) audio.currentTime = safe;
      setTime(deck, safe);
      if (model.playing && model.reverse) void startReverse(deck, safe);
      return;
    }
    if (audio) audio.currentTime = safe;
    setTime(deck, safe);
  };

  const beginSlip = (deck: DJDeckId) => {
    const model = getDeck(deck);
    const holder = getSlip(deck);
    if (!model.slip || !model.playing || holder.current) return;
    holder.current = { startedAt: performance.now(), deckStartedAt: getTime(deck) };
  };

  const endSlip = (deck: DJDeckId) => {
    const holder = getSlip(deck);
    const run = holder.current;
    if (!run) return;
    const model = getDeck(deck);
    holder.current = null;
    const elapsed = (performance.now() - run.startedAt) / 1000;
    setPlayhead(deck, run.deckStartedAt + elapsed * model.rate);
  };

  const reverseTime = (deck: DJDeckId) => {
    const run = getReverse(deck).current;
    const ctx = contextRef.current;
    if (!run || !ctx) return getTime(deck);
    const elapsed = (ctx.currentTime - run.contextStartedAt) * getDeck(deck).rate;
    return clamp(run.deckStartedAt - elapsed, 0, getDeck(deck).duration);
  };

  const startReverse = async (deck: DJDeckId, fromTime = getTime(deck)) => {
    const buffer = getReversedBuffer(deck);
    const audio = getAudio(deck);
    if (!buffer || !audio) { setStatus(`Deck ${deck}: reverse audio needs a decoded local track.`); return false; }
    const ctx = await ensureGraph();
    const graph = getGraph(deck);
    if (!graph) return false;
    const holder = getReverse(deck);
    if (holder.current) { try { holder.current.source.stop(); } catch { } holder.current = null; }
    audio.pause();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = getDeck(deck).rate;
    source.connect(graph.input);
    const safeTime = clamp(fromTime, 0, getDeck(deck).duration);
    const offset = clamp(getDeck(deck).duration - safeTime, 0, Math.max(0, buffer.duration - 0.01));
    source.start(0, offset);
    holder.current = { source, contextStartedAt: ctx.currentTime, deckStartedAt: safeTime };
    patchDeck(deck, { playing: true, reverse: true });
    setStatus(`Deck ${deck}: real reverse buffer running.`);
    return true;
  };

  const stopReverse = (deck: DJDeckId, resumeForward: boolean) => {
    const holder = getReverse(deck);
    const current = reverseTime(deck);
    if (holder.current) { try { holder.current.source.stop(); } catch { } holder.current = null; }
    const audio = getAudio(deck);
    if (audio) audio.currentTime = current;
    setTime(deck, current);
    patchDeck(deck, { reverse: false, playing: resumeForward });
    if (resumeForward && audio) void ensureGraph().then(() => audio.play()).catch(() => undefined);
  };

  const toggleReverse = (deck: DJDeckId) => {
    const model = getDeck(deck);
    if (!model.url) return;
    if (!model.reverse) {
      beginSlip(deck);
      patchDeck(deck, { reverse: true });
      if (model.playing) void startReverse(deck);
      else setStatus(`Deck ${deck}: reverse armed. Press PLAY.`);
    } else {
      const wasPlaying = model.playing;
      stopReverse(deck, wasPlaying);
      endSlip(deck);
    }
  };

  const togglePlay = async (deck: DJDeckId) => {
    const model = getDeck(deck);
    if (!model.url) return;
    setMidiPulse(Date.now());
    if (model.reverse) {
      if (model.playing) { stopReverse(deck, false); patchDeck(deck, { reverse: true, playing: false }); emitDJFeedback({ control: 'play', deck, value: false }); }
      else if (await startReverse(deck)) emitDJFeedback({ control: 'play', deck, value: true });
      return;
    }
    const audio = getAudio(deck);
    if (!audio) return;
    try {
      await ensureGraph();
      if (audio.paused) await audio.play(); else audio.pause();
      const playing = !audio.paused;
      patchDeck(deck, { playing });
      emitDJFeedback({ control: 'play', deck, value: playing });
      setStatus(`Deck ${deck}: ${playing ? 'PLAY' : 'PAUSE'} confirmed by audio engine.`);
    } catch (error) {
      patchDeck(deck, { playing: false });
      setStatus(error instanceof Error ? error.message : `Deck ${deck}: browser blocked playback.`);
    }
  };

  const cueDown = async (deck: DJDeckId) => {
    const model = getDeck(deck);
    const audio = getAudio(deck);
    if (!audio || !model.url) return;
    if (model.reverse) stopReverse(deck, false);
    if (model.playing) {
      audio.pause();
      setPlayhead(deck, model.cuePoint);
      patchDeck(deck, { playing: false, reverse: false });
      emitDJFeedback({ control: 'cue', deck, value: true });
      return;
    }
    const now = getTime(deck);
    if (Math.abs(now - model.cuePoint) > 0.18) {
      const point = quantizedTime(deck, now);
      patchDeck(deck, { cuePoint: point });
      setStatus(`Deck ${deck}: CUE stored at ${seconds(point)}.`);
      emitDJFeedback({ control: 'cue', deck, value: true });
      return;
    }
    try {
      await ensureGraph();
      audio.currentTime = model.cuePoint;
      await audio.play();
      patchDeck(deck, { playing: true });
      getScratch(deck).current = { pointerId: -999, startX: 0, startTime: model.cuePoint, wasPlaying: false };
      emitDJFeedback({ control: 'cue', deck, value: true });
    } catch { }
  };

  const cueUp = (deck: DJDeckId) => {
    const scratch = getScratch(deck);
    if (scratch.current?.pointerId !== -999) return;
    const audio = getAudio(deck);
    if (audio) { audio.pause(); audio.currentTime = getDeck(deck).cuePoint; }
    setTime(deck, getDeck(deck).cuePoint);
    patchDeck(deck, { playing: false });
    scratch.current = null;
    emitDJFeedback({ control: 'cue', deck, value: false });
  };

  const syncDeck = (deck: DJDeckId) => {
    const own = getDeck(deck);
    const other = getDeck(deck === 'A' ? 'B' : 'A');
    if (!own.url || !other.url || own.bpm <= 0 || other.bpm <= 0) { setStatus('SYNC requires a loaded track on both decks.'); return; }
    const targetBpm = other.bpm * other.rate;
    const rate = clamp(targetBpm / own.bpm, 0.5, 2);
    patchDeck(deck, { rate, pitchPercent: (rate - 1) * 100 });
    emitDJFeedback({ control: 'sync', deck, value: true });
    setStatus(`Deck ${deck}: synced to ${targetBpm.toFixed(2)} BPM.`);
  };

  const setPitch = (deck: DJDeckId, percent: number) => {
    const safe = clamp(percent, -8, 8);
    patchDeck(deck, { pitchPercent: safe, rate: 1 + safe / 100 });
    emitDJFeedback({ control: 'pitch', deck, value: safe });
  };

  const hotCue = (deck: DJDeckId, index: number) => {
    const model = getDeck(deck);
    if (!model.url) return;
    const existing = model.hotCues[index];
    if (existing == null) {
      const next = [...model.hotCues];
      next[index] = quantizedTime(deck, getTime(deck));
      patchDeck(deck, { hotCues: next });
      setStatus(`Deck ${deck}: HOT ${index + 1} stored.`);
    } else setPlayhead(deck, existing);
    emitDJFeedback({ control: `hotcue-${index + 1}`, deck, value: true });
  };

  const toggleLoop = (deck: DJDeckId, forcedBeats?: number) => {
    const model = getDeck(deck);
    if (!model.url) return;
    if (model.loopActive) {
      patchDeck(deck, { loopActive: false });
      endSlip(deck);
    } else {
      const beats = forcedBeats || model.loopBeats;
      const beatSeconds = 60 / Math.max(1, model.bpm * model.rate);
      const start = quantizedTime(deck, getTime(deck));
      beginSlip(deck);
      patchDeck(deck, { loopActive: true, loopBeats: beats, loopStart: start, loopEnd: clamp(start + beatSeconds * beats, start, model.duration || start + beatSeconds * beats) });
    }
    emitDJFeedback({ control: 'loop', deck, value: !model.loopActive });
  };

  const loopIn = (deck: DJDeckId) => {
    const start = quantizedTime(deck, getTime(deck));
    patchDeck(deck, { loopStart: start });
    setStatus(`Deck ${deck}: LOOP IN ${seconds(start)}.`);
  };
  const loopOut = (deck: DJDeckId) => {
    const model = getDeck(deck);
    const end = quantizedTime(deck, getTime(deck));
    if (end <= model.loopStart) return;
    const beats = Math.max(1, Math.round((end - model.loopStart) / (60 / Math.max(1, model.bpm * model.rate))));
    beginSlip(deck);
    patchDeck(deck, { loopEnd: end, loopBeats: beats, loopActive: true });
  };
  const loopExit = (deck: DJDeckId) => { patchDeck(deck, { loopActive: false }); endSlip(deck); };
  const reloop = (deck: DJDeckId) => {
    const model = getDeck(deck);
    if (model.loopEnd > model.loopStart) { beginSlip(deck); patchDeck(deck, { loopActive: true }); setPlayhead(deck, model.loopStart); }
    else toggleLoop(deck);
  };
  const loopScale = (deck: DJDeckId, factor: number) => {
    const model = getDeck(deck);
    const beats = clamp(Math.round(model.loopBeats * factor), 1, 64);
    const duration = (60 / Math.max(1, model.bpm * model.rate)) * beats;
    patchDeck(deck, { loopBeats: beats, loopEnd: model.loopStart + duration });
  };

  const beatJump = (deck: DJDeckId, beats: number) => {
    const model = getDeck(deck);
    if (!model.url) return;
    const delta = (60 / Math.max(1, model.bpm * model.rate)) * beats;
    setPlayhead(deck, getTime(deck) + delta);
    emitDJFeedback({ control: 'beat-jump', deck, value: beats });
  };
  const search = (deck: DJDeckId, delta: number) => {
    if (!getDeck(deck).url) return;
    setPlayhead(deck, getTime(deck) + delta);
    emitDJFeedback({ control: 'search', deck, value: delta });
  };

  const beginScratch = (deck: DJDeckId, event: React.PointerEvent<HTMLDivElement>) => {
    const model = getDeck(deck);
    if (!model.url || !model.vinyl) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const audio = getAudio(deck);
    const current = getTime(deck);
    const wasPlaying = model.playing;
    beginSlip(deck);
    if (model.reverse) stopReverse(deck, false);
    audio?.pause();
    getScratch(deck).current = { pointerId: event.pointerId, startX: event.clientX, startTime: current, wasPlaying };
    patchDeck(deck, { playing: false, reverse: false });
  };
  const moveScratch = (deck: DJDeckId, event: React.PointerEvent<HTMLDivElement>) => {
    const run = getScratch(deck).current;
    if (!run || run.pointerId !== event.pointerId) return;
    const delta = (event.clientX - run.startX) * 0.045;
    setPlayhead(deck, run.startTime + delta);
  };
  const endScratch = (deck: DJDeckId, event: React.PointerEvent<HTMLDivElement>) => {
    const holder = getScratch(deck);
    const run = holder.current;
    if (!run || run.pointerId !== event.pointerId) return;
    holder.current = null;
    endSlip(deck);
    if (run.wasPlaying) void togglePlay(deck);
  };

  const loadDeck = async (deck: DJDeckId, file: File) => {
    const audio = getAudio(deck);
    if (!audio) return;
    const previous = getDeck(deck).url;
    if (previous) URL.revokeObjectURL(previous);
    const url = URL.createObjectURL(file);
    audio.pause();
    audio.src = url;
    audio.load();
    setStatus(`Deck ${deck}: decoding ${file.name}...`);
    let duration = 0;
    let waveform: number[] = [];
    let bpm = 0;
    try {
      const ctx = await ensureGraph();
      const decoded = await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
      duration = decoded.duration;
      waveform = buildWaveform(decoded);
      bpm = estimateBpm(decoded);
      if (deck === 'A') { decodedA.current = decoded; reversedA.current = reverseBuffer(ctx, decoded); }
      else { decodedB.current = decoded; reversedB.current = reverseBuffer(ctx, decoded); }
    } catch {
      duration = await new Promise<number>(resolve => {
        const done = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 0);
        audio.addEventListener('loadedmetadata', done, { once: true });
        window.setTimeout(done, 2500);
      });
    }
    patchDeck(deck, {
      title: file.name.replace(/\.[^.]+$/, ''), url, duration, bpm: bpm || 126, analyzed: Boolean(bpm), waveform, playing: false, rate: 1, pitchPercent: 0,
      cuePoint: 0, hotCues: [null, null, null, null], loopActive: false, loopStart: 0, loopEnd: 0, reverse: false
    });
    setTime(deck, 0);
    setStatus(`Deck ${deck}: ${file.name} loaded${bpm ? ` · ${bpm.toFixed(1)} BPM` : ''}.`);
  };

  const setCross = (value: number) => { const safe = clamp(value, -1, 1); setCrossfader(safe); crossRef.current = safe; };
  const setMasterValue = (value: number) => { const safe = clamp(value, 0, 1); setMaster(safe); masterRef.current = safe; emitDJFeedback({ control: 'master', value: safe }); };

  const toggleLimiter = () => {
    const next = !limiterEnabled;
    setLimiterEnabled(next);
    if (limiter.current) {
      limiter.current.threshold.value = next ? -2 : 0;
      limiter.current.knee.value = next ? 3 : 0;
      limiter.current.ratio.value = next ? 12 : 1;
    }
    setStatus(`Limiter ${next ? 'ON' : 'OFF'}.`);
  };

  const toggleRecording = async () => {
    await ensureGraph();
    if (recording) { recorder.current?.stop(); setRecording(false); return; }
    if (!recordDestination.current || typeof MediaRecorder === 'undefined') { setStatus('MediaRecorder is not available in this browser.'); return; }
    const types = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/webm'];
    const mime = types.find(type => MediaRecorder.isTypeSupported(type)) || '';
    const next = new MediaRecorder(recordDestination.current.stream, mime ? { mimeType: mime } : undefined);
    recordChunks.current = [];
    next.ondataavailable = event => { if (event.data.size) recordChunks.current.push(event.data); };
    next.onstop = () => {
      const actualType = next.mimeType || mime || 'audio/webm';
      const blob = new Blob(recordChunks.current, { type: actualType });
      const extension = actualType.includes('ogg') ? 'ogg' : 'webm';
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `sonara-dj-pro-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    next.start(750);
    recorder.current = next;
    setRecordingMime(next.mimeType || mime || 'audio/webm');
    setRecording(true);
    setStatus('Master recording started.');
  };

  const loadSample = async (index: number, file: File) => {
    try {
      const ctx = await ensureGraph();
      const buffer = await ctx.decodeAudioData((await file.arrayBuffer()).slice(0));
      setSamples(current => current.map((slot, slotIndex) => slotIndex === index ? { name: file.name.replace(/\.[^.]+$/, ''), buffer } : slot));
      setStatus(`Sampler ${index + 1}: ${file.name} loaded.`);
    } catch { setStatus(`Sampler ${index + 1}: unsupported audio file.`); }
  };

  const triggerSample = async (index: number) => {
    const slot = samples[index];
    if (!slot?.buffer) { sampleInputs.current[index]?.click(); return; }
    const ctx = await ensureGraph();
    if (!masterGain.current) return;
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.78;
    source.buffer = slot.buffer;
    source.connect(gain).connect(masterGain.current);
    source.start();
    setStatus(`Sampler ${index + 1}: trigger.`);
  };

  const openControllerConfig = () => {
    const buttons = Array.from(document.querySelectorAll('[data-ni-console] button')) as HTMLButtonElement[];
    const config = buttons.find(button => (button.textContent || '').includes('CONFIGURA CONTROLLI'));
    if (config) { config.click(); config.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else setStatus('Controller config is available in the X1/Z1 panel above.');
  };

  useEffect(() => {
    const routing = (event: Event) => {
      const detail = (event as CustomEvent<{ masterOutput?: string }>).detail;
      desiredSink.current = detail?.masterOutput || '';
      const ctx = contextRef.current as (AudioContext & { setSinkId?: (id: string) => Promise<void> }) | null;
      if (ctx?.setSinkId && desiredSink.current) void ctx.setSinkId(desiredSink.current).catch(error => setStatus(error instanceof Error ? error.message : 'Unable to route master output.'));
    };
    const arm = () => { void ensureGraph().then(() => setStatus('Audio engine armed from user gesture.')).catch(() => undefined); };
    window.addEventListener('sonara:dj-audio-routing', routing);
    window.addEventListener('sonara:dj-arm-audio', arm);
    return () => { window.removeEventListener('sonara:dj-audio-routing', routing); window.removeEventListener('sonara:dj-arm-audio', arm); };
  }, []);

  useEffect(() => onDJControl((action: DJControlAction) => {
    setMidiPulse(Date.now());
    if (action.type === 'deck.play' && action.pressed !== false) { void togglePlay(action.deck); return; }
    if (action.type === 'deck.cue') { if (action.pressed) void cueDown(action.deck); else cueUp(action.deck); return; }
    if (action.type === 'deck.sync' && action.pressed !== false) { syncDeck(action.deck); return; }
    if (action.type === 'deck.pitch') { setPitch(action.deck, action.value); return; }
    if (action.type === 'deck.volume') { patchDeck(action.deck, { volume: clamp(action.value, 0, 1) }); emitDJFeedback({ control: 'volume', deck: action.deck, value: action.value }); return; }
    if (action.type === 'deck.filter') { patchDeck(action.deck, { filter: clamp(action.value, -1, 1) }); emitDJFeedback({ control: 'filter', deck: action.deck, value: action.value }); return; }
    if (action.type === 'deck.eqLow') { patchDeck(action.deck, { low: clamp(action.value, -18, 9) }); emitDJFeedback({ control: 'eqLow', deck: action.deck, value: action.value }); return; }
    if (action.type === 'deck.eqMid') { patchDeck(action.deck, { mid: clamp(action.value, -18, 9) }); emitDJFeedback({ control: 'eqMid', deck: action.deck, value: action.value }); return; }
    if (action.type === 'deck.eqHigh') { patchDeck(action.deck, { high: clamp(action.value, -18, 9) }); emitDJFeedback({ control: 'eqHigh', deck: action.deck, value: action.value }); return; }
    if (action.type === 'deck.hotcue' && action.pressed !== false) { hotCue(action.deck, action.index); return; }
    if (action.type === 'deck.loop' && action.pressed !== false) { toggleLoop(action.deck, action.beats); return; }
    if (action.type === 'mixer.crossfader') { setCross(action.value); return; }
    if (action.type === 'mixer.master') { setMasterValue(action.value); return; }
    if (action.type === 'mixer.filter') { patchDeck('A', { filter: clamp(action.value, -1, 1) }); patchDeck('B', { filter: clamp(action.value, -1, 1) }); emitDJFeedback({ control: 'mixer-filter', value: action.value }); }
  }), []);

  useEffect(() => {
    const tick = (now: number) => {
      const processDeck = (deck: DJDeckId) => {
        const model = getDeck(deck);
        const audio = getAudio(deck);
        const reverseHolder = getReverse(deck);
        let current = reverseHolder.current ? reverseTime(deck) : (audio?.currentTime || 0);
        if (model.loopActive && model.loopEnd > model.loopStart) {
          if (!model.reverse && audio && current >= model.loopEnd) { audio.currentTime = model.loopStart; current = model.loopStart; }
          if (model.reverse && reverseHolder.current && current <= model.loopStart) { void startReverse(deck, model.loopEnd); current = model.loopEnd; }
        }
        if (reverseHolder.current && current <= 0.01) { stopReverse(deck, false); patchDeck(deck, { reverse: true, playing: false }); current = 0; }
        setTime(deck, current);
      };
      processDeck('A');
      processDeck('B');

      if (autoMix) {
        const a = getDeck('A'); const b = getDeck('B'); const ta = getTime('A'); const tb = getTime('B');
        if (!autoMixRun.current && a.playing && a.duration - ta < 10 && b.url && !b.playing) { void togglePlay('B'); autoMixRun.current = { from: 'A', startedAt: now }; }
        if (!autoMixRun.current && b.playing && b.duration - tb < 10 && a.url && !a.playing) { void togglePlay('A'); autoMixRun.current = { from: 'B', startedAt: now }; }
        if (autoMixRun.current) {
          const progress = clamp((now - autoMixRun.current.startedAt) / 8000, 0, 1);
          setCross(autoMixRun.current.from === 'A' ? -1 + progress * 2 : 1 - progress * 2);
          if (progress >= 1) {
            const from = autoMixRun.current.from;
            if (getDeck(from).playing) void togglePlay(from);
            setPlayhead(from, 0);
            autoMixRun.current = null;
          }
        }
      } else autoMixRun.current = null;

      if (analyser.current && now - lastMeterAt.current > 90) {
        const data = new Uint8Array(analyser.current.frequencyBinCount);
        analyser.current.getByteTimeDomainData(data);
        let sum = 0;
        for (const value of data) { const normalized = (value - 128) / 128; sum += normalized * normalized; }
        setMeter(clamp(Math.sqrt(sum / data.length) * 2.4, 0, 1));
        lastMeterAt.current = now;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [autoMix]);

  const meterBars = Math.round(meter * 18);
  const midiActive = Date.now() - midiPulse < 2200;
  const latency = useMemo(() => {
    const ctx = contextRef.current as (AudioContext & { outputLatency?: number }) | null;
    if (!ctx) return 'ARM';
    const total = Number(ctx.baseLatency || 0) + Number(ctx.outputLatency || 0);
    return total > 0 ? `${(total * 1000).toFixed(1)} ms` : 'LIVE';
  }, [recording, status]);

  const mixerContent = tab === 'mixer' ? <div className="grid grid-cols-2 gap-3">
    {(['A', 'B'] as DJDeckId[]).map(deck => {
      const model = deck === 'A' ? deckA : deckB;
      const color: 'cyan' | 'pink' = deck === 'A' ? 'cyan' : 'pink';
      return <div key={deck} className="space-y-2 rounded-lg border border-white/5 bg-black/20 p-2">
        <div className={`text-center text-[9px] font-black ${deck === 'A' ? 'text-cyan-300' : 'text-fuchsia-300'}`}>CHANNEL {deck}</div>
        <MiniRange label="TRIM" value={model.trim} min={-12} max={12} step={0.5} color={color} onChange={value => patchDeck(deck, { trim: value })} format={value => `${value >= 0 ? '+' : ''}${value.toFixed(1)} dB`} />
        <MiniRange label="HIGH" value={model.high} min={-18} max={9} step={0.5} color={color} onChange={value => patchDeck(deck, { high: value })} format={value => `${value.toFixed(1)} dB`} />
        <MiniRange label="MID" value={model.mid} min={-18} max={9} step={0.5} color={color} onChange={value => patchDeck(deck, { mid: value })} format={value => `${value.toFixed(1)} dB`} />
        <MiniRange label="LOW" value={model.low} min={-18} max={9} step={0.5} color={color} onChange={value => patchDeck(deck, { low: value })} format={value => `${value.toFixed(1)} dB`} />
        <MiniRange label="FILTER" value={model.filter} min={-1} max={1} step={0.01} color={color} onChange={value => patchDeck(deck, { filter: value })} format={value => value.toFixed(2)} />
        <MiniRange label="FADER" value={model.volume} min={0} max={1} step={0.01} color={color} onChange={value => patchDeck(deck, { volume: value })} format={value => `${Math.round(value * 100)}%`} />
      </div>;
    })}
  </div> : tab === 'effects' ? <div className="space-y-3">
    <div className="rounded-lg border border-white/5 bg-black/20 p-3"><div className="mb-2 text-[9px] font-black text-cyan-300">DECK A ECHO</div><input type="range" min={0} max={1} step={0.01} value={deckA.echo} onChange={event => setDeckA(current => ({ ...current, echo: Number(event.currentTarget.value) }))} className="w-full accent-cyan-400"/><button onClick={() => setDeckA(current => ({ ...current, echo: 0 }))} className="mt-2 w-full rounded border border-white/10 py-2 text-[8px] font-black text-slate-400">FX KILL A</button></div>
    <div className="rounded-lg border border-white/5 bg-black/20 p-3"><div className="mb-2 text-[9px] font-black text-fuchsia-300">DECK B ECHO</div><input type="range" min={0} max={1} step={0.01} value={deckB.echo} onChange={event => setDeckB(current => ({ ...current, echo: Number(event.currentTarget.value) }))} className="w-full accent-fuchsia-400"/><button onClick={() => setDeckB(current => ({ ...current, echo: 0 }))} className="mt-2 w-full rounded border border-white/10 py-2 text-[8px] font-black text-slate-400">FX KILL B</button></div>
    <div className="text-[8px] leading-4 text-slate-600">Echo is generated by the real Web Audio delay network and follows each deck BPM.</div>
  </div> : <div className="grid grid-cols-2 gap-2">{samples.map((slot, index) => <div key={index} className="rounded-lg border border-white/5 bg-black/20 p-2"><button onClick={() => void triggerSample(index)} className={`w-full rounded-lg border px-2 py-5 text-[9px] font-black ${slot.buffer ? 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200' : 'border-white/10 text-slate-500'}`}>{slot.name}</button><button onClick={() => sampleInputs.current[index]?.click()} className="mt-1 w-full rounded border border-white/10 py-1.5 text-[7px] font-black text-slate-600"><Upload className="mx-auto h-3 w-3"/></button><input ref={node => { sampleInputs.current[index] = node; }} type="file" accept="audio/*" className="hidden" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void loadSample(index, file); event.currentTarget.value = ''; }} /></div>)}</div>;

  return <section className="rounded-2xl border border-white/10 bg-[#050607] p-2 shadow-2xl shadow-black/60" data-sonara-pro-live-skin="true">
    <style>{`
      [data-ni-console] [data-sonara-deck-skin-manager="true"]{display:none!important}
      [data-ni-console] .ni-decks{position:absolute!important;left:-10000px!important;top:-10000px!important;width:1px!important;height:1px!important;overflow:hidden!important;opacity:0!important;pointer-events:none!important}
      [data-sonara-pro-live-skin] button,[data-sonara-pro-live-skin] input{touch-action:manipulation}
    `}</style>
    <input ref={fileA} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a,.aac,.ogg" className="hidden" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void loadDeck('A', file); event.currentTarget.value = ''; }} />
    <input ref={fileB} type="file" accept="audio/*,.wav,.mp3,.flac,.m4a,.aac,.ogg" className="hidden" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void loadDeck('B', file); event.currentTarget.value = ''; }} />

    <div className="overflow-x-auto">
      <div className="min-w-[1320px] overflow-hidden rounded-xl border border-white/5 bg-[linear-gradient(180deg,#0d0f12,#070809)]">
        <header className="flex items-center justify-between border-b border-white/5 px-4 py-2">
          <div className="flex items-center gap-4 text-[8px] font-black tracking-[0.14em] text-slate-500"><span>{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span className={midiActive ? 'text-cyan-300' : ''}>MIDI <span className={`ml-1 inline-block h-1.5 w-1.5 rounded-full ${midiActive ? 'bg-cyan-400' : 'bg-slate-700'}`} /></span><button onClick={() => void toggleRecording()} className={recording ? 'text-rose-300' : 'text-slate-500'}>REC <span className={`ml-1 inline-block h-1.5 w-1.5 rounded-full ${recording ? 'bg-rose-400' : 'border border-slate-600'}`} /></button><button onClick={openControllerConfig} className="text-slate-500"><Settings2 className="h-3.5 w-3.5"/></button></div>
          <div className="text-sm font-black tracking-[0.12em] text-white">SONARA DJ <span className="bg-gradient-to-r from-cyan-300 to-fuchsia-400 bg-clip-text text-transparent">PRO</span></div>
          <div className="flex items-center gap-3"><span className="text-[8px] font-black text-slate-500">MASTER</span><div className="flex gap-px">{Array.from({ length: 18 }, (_, index) => <span key={index} className={`h-2.5 w-1 rounded-sm ${index < meterBars ? (index > 14 ? 'bg-fuchsia-400' : 'bg-cyan-400') : 'bg-slate-800'}`} />)}</div><span className="rounded border border-white/10 px-2 py-1 text-[7px] font-black text-slate-500">{latency}</span></div>
        </header>

        <div className="grid grid-cols-[1fr_410px_1fr] gap-1 p-1">
          <DeckFace id="A" model={deckA} currentTime={timeA} accent="cyan" onLoad={() => fileA.current?.click()} onPlay={() => void togglePlay('A')} onCueDown={() => void cueDown('A')} onCueUp={() => cueUp('A')} onSync={() => syncDeck('A')} onHotCue={index => hotCue('A', index)} onLoopToggle={() => toggleLoop('A')} onLoopIn={() => loopIn('A')} onLoopOut={() => loopOut('A')} onReloop={() => reloop('A')} onLoopExit={() => loopExit('A')} onLoopHalf={() => loopScale('A', 0.5)} onLoopDouble={() => loopScale('A', 2)} onBeatJump={beats => beatJump('A', beats)} onSearch={delta => search('A', delta)} onReverse={() => toggleReverse('A')} onSlip={() => setDeckA(current => ({ ...current, slip: !current.slip }))} onQuantize={() => setDeckA(current => ({ ...current, quantize: !current.quantize }))} onPitch={percent => setPitch('A', percent)} onScratchStart={event => beginScratch('A', event)} onScratchMove={event => moveScratch('A', event)} onScratchEnd={event => endScratch('A', event)} onToggleTime={() => setDeckA(current => ({ ...current, timeMode: current.timeMode === 'elapsed' ? 'remain' : 'elapsed' }))} onVinyl={() => setDeckA(current => ({ ...current, vinyl: !current.vinyl }))} />

          <section className="rounded-xl border border-white/10 bg-[linear-gradient(180deg,#111318,#090a0d)] p-3 shadow-inner">
            <div className="grid grid-cols-3 gap-1 border-b border-white/5 pb-2">{(['mixer','effects','sampler'] as MixerTab[]).map(value => <button key={value} onClick={() => setTab(value)} className={`rounded-md px-2 py-2 text-[8px] font-black uppercase ${tab === value ? 'bg-white/8 text-cyan-200 ring-1 ring-cyan-400/20' : 'text-slate-600'}`}>{value}</button>)}</div>
            <div className="mt-3">{mixerContent}</div>
            <div className="mt-3 rounded-lg border border-white/5 bg-black/30 p-3">
              <div className="flex items-center justify-between text-[8px] font-black text-slate-500"><span className="flex items-center gap-1"><Headphones className="h-3.5 w-3.5"/> MASTER CONTROL</span><span>{Math.round(master * 100)}%</span></div>
              <input type="range" min={0} max={1} step={0.01} value={master} onChange={event => setMasterValue(Number(event.currentTarget.value))} className="mt-2 w-full accent-cyan-400" />
            </div>
            <div className="mt-3 rounded-lg border border-white/5 bg-black/30 p-3">
              <div className="mb-2 flex items-center justify-between text-[8px] font-black text-slate-500"><span>CROSSFADER</span><span>{crossfader < -0.05 ? 'A' : crossfader > 0.05 ? 'B' : 'CENTER'}</span></div>
              <input type="range" min={-1} max={1} step={0.01} value={crossfader} onChange={event => setCross(Number(event.currentTarget.value))} className="w-full accent-fuchsia-400" />
              <div className="mt-2 grid grid-cols-3 gap-1">{(['linear','equal','sharp'] as CrossCurve[]).map(value => <button key={value} onClick={() => setCurve(value)} className={`rounded border px-2 py-1.5 text-[7px] font-black uppercase ${curve === value ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200' : 'border-white/10 text-slate-600'}`}>{value}</button>)}</div>
            </div>
          </section>

          <DeckFace id="B" model={deckB} currentTime={timeB} accent="pink" onLoad={() => fileB.current?.click()} onPlay={() => void togglePlay('B')} onCueDown={() => void cueDown('B')} onCueUp={() => cueUp('B')} onSync={() => syncDeck('B')} onHotCue={index => hotCue('B', index)} onLoopToggle={() => toggleLoop('B')} onLoopIn={() => loopIn('B')} onLoopOut={() => loopOut('B')} onReloop={() => reloop('B')} onLoopExit={() => loopExit('B')} onLoopHalf={() => loopScale('B', 0.5)} onLoopDouble={() => loopScale('B', 2)} onBeatJump={beats => beatJump('B', beats)} onSearch={delta => search('B', delta)} onReverse={() => toggleReverse('B')} onSlip={() => setDeckB(current => ({ ...current, slip: !current.slip }))} onQuantize={() => setDeckB(current => ({ ...current, quantize: !current.quantize }))} onPitch={percent => setPitch('B', percent)} onScratchStart={event => beginScratch('B', event)} onScratchMove={event => moveScratch('B', event)} onScratchEnd={event => endScratch('B', event)} onToggleTime={() => setDeckB(current => ({ ...current, timeMode: current.timeMode === 'elapsed' ? 'remain' : 'elapsed' }))} onVinyl={() => setDeckB(current => ({ ...current, vinyl: !current.vinyl }))} />
        </div>

        <footer className="grid grid-cols-[1fr_auto_1fr] items-center border-t border-white/5 px-4 py-2 text-[8px] font-black text-slate-600">
          <button type="button" onClick={() => setAutoMix(value => !value)} className={`justify-self-start ${autoMix ? 'text-emerald-300' : ''}`}>AUTO MIX <span className={`ml-1 inline-block h-2 w-2 rounded-full ${autoMix ? 'bg-emerald-400' : 'border border-slate-600'}`} /></button>
          <div className="flex items-center gap-3"><button type="button" onClick={() => { setPlayhead('A', 0); setPlayhead('B', 0); setCross(0); }} className="flex items-center gap-1 rounded border border-white/10 px-2 py-1.5"><Repeat2 className="h-3 w-3"/> RESET MIX</button><span className="text-slate-700">{recordingMime || 'REAL WEB AUDIO'}</span></div>
          <div className="flex items-center justify-end gap-3"><span>OUTPUT</span><div className="flex gap-px">{Array.from({ length: 18 }, (_, index) => <span key={index} className={`h-2 w-1 ${index < meterBars ? (index > 14 ? 'bg-fuchsia-400' : 'bg-cyan-400') : 'bg-slate-800'}`} />)}</div><button type="button" onClick={toggleLimiter} className={`rounded border px-2 py-1.5 ${limiterEnabled ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : 'border-white/10'}`}>LIMITER</button></div>
        </footer>
      </div>
    </div>

    <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-white/5 bg-black/30 px-3 py-2 text-[8px] font-bold text-slate-500"><span className="flex min-w-0 items-center gap-2"><Zap className="h-3.5 w-3.5 shrink-0 text-cyan-300"/><span className="truncate">{status}</span></span><span className="shrink-0 text-slate-700">Native skin · real controls · no cosmetic overlay</span></div>
  </section>;
}
