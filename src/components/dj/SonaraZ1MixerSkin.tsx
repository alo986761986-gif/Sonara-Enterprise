import React, { useEffect, useMemo, useState } from 'react';
import { Cable, SlidersHorizontal, Zap } from 'lucide-react';
import { DJDeckId, emitDJControl, onDJFeedback } from './djRuntime';

type ChannelState = { gain: number; high: number; mid: number; low: number; filter: number; volume: number; filterOn: boolean };
const makeChannel = (): ChannelState => ({ gain: 0, high: 0, mid: 0, low: 0, filter: 0, volume: 0.86, filterOn: true });
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function Knob({ label, value, min, max, step, onChange, size = 'normal' }: { label: string; value: number; min: number; max: number; step: number; onChange: (value: number) => void; size?: 'small' | 'normal' }) {
  const pct = ((value - min) / (max - min)) * 100;
  const dimensions = size === 'small' ? 'h-10 w-10' : 'h-12 w-12';
  return <label className="flex select-none flex-col items-center gap-1"><span className="text-[7px] font-black tracking-[0.13em] text-[#aeb4bd]">{label}</span><span className={`relative block ${dimensions} rounded-full border border-white/10 bg-[radial-gradient(circle_at_35%_28%,#5a6068,#22262c_43%,#090a0c_70%)] shadow-[inset_0_0_0_3px_rgba(255,255,255,.025),0_7px_16px_rgba(0,0,0,.7)]`}><span className="absolute inset-[7px] rounded-full border border-black/70" /><span className="absolute left-1/2 top-1/2 h-[38%] w-0.5 origin-bottom rounded-full bg-[#f1f5f9]" style={{ transform: `translate(-50%,-100%) rotate(${(-135 + pct * 270).toFixed(1)}deg)` }} /><input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.currentTarget.value))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" /></span></label>;
}

function Fader({ deck, value, onChange }: { deck: DJDeckId; value: number; onChange: (value: number) => void }) {
  return <label className="flex flex-col items-center gap-2"><div className="relative h-40 w-11 rounded border border-white/5 bg-[#07080a] shadow-inner"><div className="absolute bottom-3 left-1/2 top-3 w-px -translate-x-1/2 bg-[#343942]" />{[0,1,2,3,4,5,6,7,8].map(mark => <span key={mark} className="absolute left-2 right-2 h-px bg-white/5" style={{ top: `${8 + mark * 10.5}%` }} />)}<input aria-label={`CHANNEL ${deck}`} type="range" min={0} max={1} step={0.01} value={value} onChange={event => onChange(Number(event.currentTarget.value))} className="absolute inset-0 h-full w-full accent-[#f1f5f9]" style={{ writingMode: 'vertical-lr', direction: 'rtl' }} /></div><span className="text-[9px] font-black text-white">{deck}</span></label>;
}

function ChannelColumn({ deck, state, patch }: { deck: DJDeckId; state: ChannelState; patch: (patch: Partial<ChannelState>) => void }) {
  return <div className="flex flex-col items-center gap-3"><Knob label="GAIN" value={state.gain} min={-12} max={12} step={0.5} onChange={gain => patch({ gain })} /><div className="h-px w-12 bg-white/10" /><Knob label="HI" value={state.high} min={-18} max={9} step={0.5} onChange={high => patch({ high })} /><Knob label="MID" value={state.mid} min={-18} max={9} step={0.5} onChange={mid => patch({ mid })} /><Knob label="LOW" value={state.low} min={-18} max={9} step={0.5} onChange={low => patch({ low })} /><div className="h-px w-12 bg-white/10" /><Knob label="FILTER / FX" value={state.filter} min={-1} max={1} step={0.01} onChange={filter => patch({ filter })} /><button type="button" onClick={() => patch({ filterOn: !state.filterOn, filter: state.filterOn ? 0 : state.filter })} className={`h-7 w-12 rounded border text-[7px] font-black ${state.filterOn ? 'border-blue-400/50 bg-blue-500/20 text-blue-200' : 'border-white/10 bg-black/40 text-slate-600'}`}>ON</button><Fader deck={deck} value={state.volume} onChange={volume => patch({ volume })} /></div>;
}

function Meter({ level, color }: { level: number; color: 'blue' | 'orange' }) {
  return <div className="flex flex-col-reverse gap-1">{Array.from({ length: 12 }, (_, index) => <span key={index} className={`h-1.5 w-2 rounded-[1px] ${index < level ? (index > 9 ? 'bg-red-400' : index > 7 ? 'bg-amber-300' : color === 'blue' ? 'bg-blue-400' : 'bg-orange-400') : 'bg-[#1c2025]'}`} />)}</div>;
}

export default function SonaraZ1MixerSkin() {
  const [a, setA] = useState<ChannelState>(makeChannel);
  const [b, setB] = useState<ChannelState>(makeChannel);
  const [crossfader, setCrossfader] = useState(0);
  const [master, setMaster] = useState(0.9);
  const [cueVolume, setCueVolume] = useState(0.65);
  const [cueMix, setCueMix] = useState(0.5);
  const [linkPulse, setLinkPulse] = useState(0);
  const [lastFeedback, setLastFeedback] = useState('MIDI READY');

  const sendDeck = (deck: DJDeckId, values: Partial<ChannelState>) => {
    (deck === 'A' ? setA : setB)(current => ({ ...current, ...values }));
    if (values.volume !== undefined) emitDJControl({ type: 'deck.volume', deck, value: values.volume });
    if (values.gain !== undefined) emitDJControl({ type: 'deck.gain', deck, value: values.gain });
    if (values.filter !== undefined) emitDJControl({ type: 'deck.filter', deck, value: values.filter });
    if (values.low !== undefined) emitDJControl({ type: 'deck.eqLow', deck, value: values.low });
    if (values.mid !== undefined) emitDJControl({ type: 'deck.eqMid', deck, value: values.mid });
    if (values.high !== undefined) emitDJControl({ type: 'deck.eqHigh', deck, value: values.high });
    setLinkPulse(Date.now());
  };

  useEffect(() => onDJFeedback(feedback => {
    setLinkPulse(Date.now());
    setLastFeedback(`${feedback.control.toUpperCase()}${feedback.deck ? ` · ${feedback.deck}` : ''}`);
    if (feedback.control === 'crossfader' && typeof feedback.value === 'number') setCrossfader(clamp(feedback.value * 2 - 1, -1, 1));
    if (feedback.control === 'master' && typeof feedback.value === 'number') setMaster(clamp(feedback.value, 0, 1));
    if (feedback.deck && typeof feedback.value === 'number') {
      const values: Partial<ChannelState> = {};
      if (feedback.control === 'volume') values.volume = clamp(feedback.value, 0, 1);
      if (feedback.control === 'gain') values.gain = clamp(feedback.value, -12, 12);
      if (feedback.control === 'filter') values.filter = clamp(feedback.value, -1, 1);
      if (feedback.control === 'eqLow') values.low = clamp(feedback.value, -18, 9);
      if (feedback.control === 'eqMid') values.mid = clamp(feedback.value, -18, 9);
      if (feedback.control === 'eqHigh') values.high = clamp(feedback.value, -18, 9);
      if (Object.keys(values).length) (feedback.deck === 'A' ? setA : setB)(current => ({ ...current, ...values }));
    }
  }), []);

  const meterA = useMemo(() => Math.round(clamp(a.volume * Math.pow(10, a.gain / 20), 0, 1) * 12), [a.volume, a.gain]);
  const meterB = useMemo(() => Math.round(clamp(b.volume * Math.pow(10, b.gain / 20), 0, 1) * 12), [b.volume, b.gain]);
  const pulse = Date.now() - linkPulse < 2200;

  return <section className="rounded-2xl border border-blue-400/15 bg-[#050608] p-4 shadow-2xl" data-sonara-z1-original-skin="true">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-blue-300"/><h2 className="text-sm font-black text-white">SONARA · Z1 ORIGINAL LIVE</h2><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[7px] font-black text-emerald-300">HARDWARE MIRROR</span></div><p className="mt-1 text-[9px] text-slate-600">Layout della Traktor Kontrol Z1 originale, collegato al motore e alla mappatura MIDI reale.</p></div><div className="flex items-center gap-2 rounded-lg border border-white/5 bg-black/40 px-3 py-2 text-[8px] font-black text-slate-500"><Cable className={`h-3.5 w-3.5 ${pulse ? 'text-emerald-300' : 'text-slate-700'}`}/>{lastFeedback}</div></div>
    <div className="mx-auto mt-4 w-full max-w-[410px] rounded-[22px] border border-white/10 bg-[linear-gradient(145deg,#15181c,#08090b_45%,#030405)] px-5 pb-5 pt-4 shadow-[0_38px_90px_rgba(0,0,0,.75),inset_0_0_0_1px_rgba(255,255,255,.025)]">
      <div className="text-center text-[15px] font-black tracking-[0.28em] text-white">SONARA</div><div className="mt-1 text-center text-[7px] font-bold tracking-[0.3em] text-slate-600">KONTROL Z1 · ORIGINAL LAYOUT</div>
      <div className="mt-4 flex justify-center"><Knob label="MAIN" value={master} min={0} max={1} step={0.01} onChange={value => { setMaster(value); emitDJControl({ type: 'mixer.master', value }); }} /></div>
      <div className="mt-4 grid grid-cols-[1fr_92px_1fr] gap-3 border-t border-white/10 pt-4"><ChannelColumn deck="A" state={a} patch={values => sendDeck('A', values)} /><div className="flex flex-col items-center pt-16"><Knob label="CUE VOL" value={cueVolume} min={0} max={1} step={0.01} size="small" onChange={setCueVolume} /><div className="mt-4"><Knob label="CUE MIX" value={cueMix} min={0} max={1} step={0.01} size="small" onChange={setCueMix} /></div><button disabled title="Cue bus separato non ancora disponibile" className="mt-5 h-8 w-14 rounded border border-white/10 bg-black/40 text-[7px] font-black text-slate-600">MODE</button><div className="mt-[136px] flex gap-2 rounded border border-white/5 bg-black/30 p-2"><Meter level={meterA} color="blue"/><Meter level={meterB} color="orange"/></div><div className="mt-2 text-[6px] font-black tracking-[0.12em] text-slate-600">A LEVEL B</div></div><ChannelColumn deck="B" state={b} patch={values => sendDeck('B', values)} /></div>
      <div className="mt-5 border-t border-white/10 pt-4"><div className="flex justify-between text-[8px] font-black text-slate-500"><span>A</span><span>CROSSFADER</span><span>B</span></div><input aria-label="CROSSFADER" type="range" min={-1} max={1} step={0.01} value={crossfader} onChange={event => { const value = Number(event.currentTarget.value); setCrossfader(value); emitDJControl({ type: 'mixer.crossfader', value }); }} className="mt-2 w-full accent-white" /></div>
      <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3"><span className="text-[7px] font-black tracking-[0.18em] text-slate-600">KONTROL Z1</span><span className="text-[6px] font-bold text-slate-700">ORIGINAL · SONARA EDITION</span></div>
    </div>
    <div className="mt-3 rounded-xl border border-emerald-400/10 bg-emerald-400/5 px-3 py-2 text-[8px] font-bold text-emerald-200"><Zap className="mr-1 inline h-3.5 w-3.5"/>GAIN, EQ, FILTER, CHANNEL FADER, CROSSFADER e MAIN sono collegati realmente al DSP e seguono la Z1 fisica.</div>
  </section>;
}
