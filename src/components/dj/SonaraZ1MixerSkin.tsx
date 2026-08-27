import React, { useEffect, useMemo, useState } from 'react';
import { Cable, Headphones, SlidersHorizontal, Sparkles, Zap } from 'lucide-react';
import { DJDeckId, emitDJControl, onDJFeedback } from './djRuntime';

type ChannelState = {
  trim: number;
  high: number;
  mid: number;
  low: number;
  filter: number;
  volume: number;
};

type FxMode = 'FILTER' | 'LOW CUT' | 'HIGH CUT';

const makeChannel = (): ChannelState => ({
  trim: 0,
  high: 0,
  mid: 0,
  low: 0,
  filter: 0,
  volume: 0.86
});

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function Knob({ label, value, min, max, step, accent, onChange, format }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  accent: 'cyan' | 'pink' | 'blue';
  onChange: (value: number) => void;
  format?: (value: number) => string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  const color = accent === 'cyan' ? '#22d3ee' : accent === 'pink' ? '#f472b6' : '#60a5fa';
  return <label className="flex flex-col items-center gap-1.5 select-none">
    <span className="text-[7px] font-black uppercase tracking-[0.13em] text-slate-500">{label}</span>
    <span className="relative block h-12 w-12 rounded-full border border-white/10 bg-[radial-gradient(circle_at_35%_28%,#3b4048,#15181d_46%,#060708_72%)] shadow-[inset_0_0_0_3px_rgba(255,255,255,.025),0_8px_18px_rgba(0,0,0,.55)]">
      <span className="absolute inset-[7px] rounded-full border border-black/70" />
      <span className="absolute left-1/2 top-1/2 h-4 w-0.5 origin-bottom rounded-full" style={{ backgroundColor: color, transform: `translate(-50%,-100%) rotate(${(-135 + pct * 270).toFixed(1)}deg)` }} />
      <input aria-label={label} type="range" min={min} max={max} step={step} value={value} onChange={event => onChange(Number(event.currentTarget.value))} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
    </span>
    <span className="min-h-[10px] text-[6px] font-bold tabular-nums text-slate-600">{format ? format(value) : value.toFixed(1)}</span>
  </label>;
}

function VerticalFader({ label, value, accent, onChange }: { label: string; value: number; accent: 'cyan' | 'pink'; onChange: (value: number) => void }) {
  return <label className="flex flex-col items-center gap-2">
    <span className="text-[7px] font-black tracking-[0.12em] text-slate-500">{label}</span>
    <div className="relative h-40 w-9 rounded-md border border-white/5 bg-black/35 shadow-inner">
      <div className="absolute left-1/2 top-2 bottom-2 w-px -translate-x-1/2 bg-slate-700" />
      <div className="absolute left-2 right-2 h-1 rounded-full bg-white/10" style={{ bottom: `calc(${clamp(value, 0, 1) * 100}% - 2px)` }} />
      <input aria-label={label} type="range" min={0} max={1} step={0.01} value={value} onChange={event => onChange(Number(event.currentTarget.value))} className={accent === 'cyan' ? 'absolute inset-0 h-full w-full accent-cyan-400' : 'absolute inset-0 h-full w-full accent-fuchsia-400'} style={{ writingMode: 'vertical-lr', direction: 'rtl' }} />
    </div>
  </label>;
}

function ChannelStrip({ deck, state, onPatch }: { deck: DJDeckId; state: ChannelState; onPatch: (patch: Partial<ChannelState>) => void }) {
  const accent = deck === 'A' ? 'cyan' : 'pink';
  const text = deck === 'A' ? 'text-cyan-300' : 'text-fuchsia-300';
  const soft = deck === 'A' ? 'bg-cyan-400/10 border-cyan-400/20' : 'bg-fuchsia-400/10 border-fuchsia-400/20';
  return <div className="rounded-xl border border-white/5 bg-[linear-gradient(180deg,#121419,#090a0d)] p-3">
    <div className={`mb-3 text-center text-[9px] font-black tracking-[0.18em] ${text}`}>CHANNEL {deck}</div>
    <div className="grid grid-cols-2 gap-x-2 gap-y-3">
      <Knob label="TRIM" value={state.trim} min={-12} max={12} step={0.5} accent={accent} onChange={value => onPatch({ trim: value })} format={value => `${value >= 0 ? '+' : ''}${value.toFixed(1)}`} />
      <Knob label="FILTER" value={state.filter} min={-1} max={1} step={0.01} accent={accent} onChange={value => onPatch({ filter: value })} format={value => value.toFixed(2)} />
      <Knob label="HIGH" value={state.high} min={-18} max={9} step={0.5} accent={accent} onChange={value => onPatch({ high: value })} format={value => `${value.toFixed(1)}`} />
      <Knob label="MID" value={state.mid} min={-18} max={9} step={0.5} accent={accent} onChange={value => onPatch({ mid: value })} format={value => `${value.toFixed(1)}`} />
      <Knob label="LOW" value={state.low} min={-18} max={9} step={0.5} accent={accent} onChange={value => onPatch({ low: value })} format={value => `${value.toFixed(1)}`} />
      <div className="flex flex-col items-center gap-1.5"><span className="text-[7px] font-black uppercase tracking-[0.13em] text-slate-500">STEMS</span><div className="grid w-full gap-1">{['VOCALS','MELODY','BASS','DRUMS'].map(label => <button key={label} type="button" disabled title="Disponibile quando il motore DJ avra stems separati reali" className="rounded border border-white/5 bg-black/25 px-1 py-1.5 text-[6px] font-black text-slate-700 disabled:cursor-not-allowed">{label}</button>)}</div></div>
    </div>
    <div className="mt-4 flex justify-center"><VerticalFader label={`LEVEL ${deck}`} value={state.volume} accent={accent} onChange={value => onPatch({ volume: value })} /></div>
    <button type="button" disabled title="Cue bus separato non ancora disponibile nel browser engine" className={`mt-3 w-full rounded-lg border px-2 py-2 text-[8px] font-black ${soft} ${text} opacity-35 disabled:cursor-not-allowed`}>CUE</button>
  </div>;
}

export default function SonaraZ1MixerSkin() {
  const [a, setA] = useState<ChannelState>(makeChannel);
  const [b, setB] = useState<ChannelState>(makeChannel);
  const [crossfader, setCrossfader] = useState(0);
  const [master, setMaster] = useState(0.9);
  const [fxMode, setFxMode] = useState<FxMode>('FILTER');
  const [fxDeck, setFxDeck] = useState<DJDeckId>('A');
  const [fxAmount, setFxAmount] = useState(0);
  const [linkPulse, setLinkPulse] = useState(0);
  const [lastFeedback, setLastFeedback] = useState('ENGINE READY');

  const sendDeck = (deck: DJDeckId, patch: Partial<ChannelState>) => {
    const setter = deck === 'A' ? setA : setB;
    setter(current => ({ ...current, ...patch }));
    if (patch.volume !== undefined) emitDJControl({ type: 'deck.volume', deck, value: patch.volume });
    if (patch.filter !== undefined) emitDJControl({ type: 'deck.filter', deck, value: patch.filter });
    if (patch.low !== undefined) emitDJControl({ type: 'deck.eqLow', deck, value: patch.low });
    if (patch.mid !== undefined) emitDJControl({ type: 'deck.eqMid', deck, value: patch.mid });
    if (patch.high !== undefined) emitDJControl({ type: 'deck.eqHigh', deck, value: patch.high });
    if (patch.trim !== undefined) {
      // The current shared DJ runtime has no dedicated trim action yet. Keep the visual trim local rather than faking DSP.
      setLastFeedback(`TRIM ${deck} UI · ENGINE ACTION NOT EXPOSED`);
    }
    setLinkPulse(Date.now());
  };

  const applyFx = (value: number) => {
    const bipolar = clamp(value, -1, 1);
    setFxAmount(bipolar);
    if (fxMode === 'FILTER') sendDeck(fxDeck, { filter: bipolar });
    if (fxMode === 'LOW CUT') sendDeck(fxDeck, { low: clamp(-18 + (bipolar + 1) * 13.5, -18, 9) });
    if (fxMode === 'HIGH CUT') sendDeck(fxDeck, { high: clamp(-18 + (bipolar + 1) * 13.5, -18, 9) });
  };

  useEffect(() => onDJFeedback(feedback => {
    setLinkPulse(Date.now());
    const deck = feedback.deck;
    setLastFeedback(`${feedback.control.toUpperCase()}${deck ? ` · ${deck}` : ''}`);
    if (feedback.control === 'crossfader' && typeof feedback.value === 'number') setCrossfader(clamp(feedback.value * 2 - 1, -1, 1));
    if (feedback.control === 'master' && typeof feedback.value === 'number') setMaster(clamp(feedback.value, 0, 1));
    if (deck && typeof feedback.value === 'number') {
      const patch: Partial<ChannelState> = {};
      if (feedback.control === 'volume') patch.volume = clamp(feedback.value, 0, 1);
      if (feedback.control === 'filter') patch.filter = clamp(feedback.value, -1, 1);
      if (feedback.control === 'eqLow') patch.low = clamp(feedback.value, -18, 9);
      if (feedback.control === 'eqMid') patch.mid = clamp(feedback.value, -18, 9);
      if (feedback.control === 'eqHigh') patch.high = clamp(feedback.value, -18, 9);
      if (Object.keys(patch).length) (deck === 'A' ? setA : setB)(current => ({ ...current, ...patch }));
    }
  }), []);

  const pulse = Date.now() - linkPulse < 2200;
  const meterA = useMemo(() => Math.round(clamp(a.volume * (1 - Math.max(0, crossfader)), 0, 1) * 12), [a.volume, crossfader]);
  const meterB = useMemo(() => Math.round(clamp(b.volume * (1 + Math.min(0, crossfader)), 0, 1) * 12), [b.volume, crossfader]);

  return <section className="rounded-2xl border border-blue-400/15 bg-[linear-gradient(145deg,#080a0d,#030405)] p-4 shadow-2xl shadow-black/50" data-sonara-z1-mixer-skin="true">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div><div className="flex items-center gap-2"><SlidersHorizontal className="h-4 w-4 text-blue-300"/><h2 className="text-sm font-black text-white">SONARA Z1 MK2 LIVE</h2><span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[7px] font-black text-emerald-300">FUNCTIONAL MIXER SKIN</span></div><p className="mt-1 text-[9px] text-slate-600">Hardware-style mixer inspired by the supplied Z1 image. Real controls use the same DJ engine and MIDI event bus as SONARA PRO LIVE.</p></div>
      <div className="flex items-center gap-2 rounded-xl border border-white/5 bg-black/25 px-3 py-2 text-[8px] font-black text-slate-500"><Cable className={`h-3.5 w-3.5 ${pulse ? 'text-emerald-300' : 'text-slate-700'}`}/><span>{lastFeedback}</span></div>
    </div>

    <div className="mx-auto mt-4 max-w-[760px] overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d10] shadow-[0_35px_90px_rgba(0,0,0,.65)]">
      <div className="flex items-center justify-between border-b border-white/5 bg-[#111318] px-4 py-2"><span className="text-sm font-black tracking-[0.1em] text-white">SONARA</span><span className="text-[8px] font-black tracking-[0.22em] text-slate-500">Z1 MK2 · LIVE MIXER</span></div>
      <div className="grid grid-cols-[1fr_180px_1fr] gap-2 p-3">
        <ChannelStrip deck="A" state={a} onPatch={patch => sendDeck('A', patch)} />

        <div className="rounded-xl border border-white/5 bg-[linear-gradient(180deg,#15181e,#080a0d)] p-3">
          <div className="flex flex-col items-center">
            <span className="text-[7px] font-black tracking-[0.14em] text-slate-500">FX / BROWSE</span>
            <Knob label={fxMode} value={fxAmount} min={-1} max={1} step={0.01} accent="blue" onChange={applyFx} format={value => value.toFixed(2)} />
            <div className="mt-2 grid w-full grid-cols-2 gap-1"><button onClick={() => setFxDeck('A')} className={`rounded border py-1.5 text-[7px] font-black ${fxDeck === 'A' ? 'border-cyan-400/25 bg-cyan-400/10 text-cyan-200' : 'border-white/10 text-slate-600'}`}>A</button><button onClick={() => setFxDeck('B')} className={`rounded border py-1.5 text-[7px] font-black ${fxDeck === 'B' ? 'border-fuchsia-400/25 bg-fuchsia-400/10 text-fuchsia-200' : 'border-white/10 text-slate-600'}`}>B</button></div>
            <button onClick={() => setFxMode(current => current === 'FILTER' ? 'LOW CUT' : current === 'LOW CUT' ? 'HIGH CUT' : 'FILTER')} className="mt-1 w-full rounded border border-white/10 py-1.5 text-[7px] font-black text-slate-500">MODE</button>
          </div>

          <div className="mt-4 grid grid-cols-[1fr_auto_1fr] gap-2 rounded-lg border border-white/5 bg-black/30 p-2">
            <div className="rounded bg-[#11151a] p-2 text-[7px] font-black text-cyan-300"><div className="text-slate-600">FX A</div><div className="mt-1">{fxDeck === 'A' ? fxMode : 'FILTER'}</div><div className="mt-1 text-slate-500">{Math.round(a.filter * 100)}%</div></div>
            <div className="flex items-end gap-1">{Array.from({ length: 12 }, (_, index) => <div key={`a-${index}`} className={`w-1 rounded-sm ${index < meterA ? 'bg-blue-400' : 'bg-slate-800'}`} style={{ height: `${8 + index * 2}px` }} />)}</div>
            <div className="rounded bg-[#11151a] p-2 text-right text-[7px] font-black text-fuchsia-300"><div className="text-slate-600">FX B</div><div className="mt-1">{fxDeck === 'B' ? fxMode : 'FILTER'}</div><div className="mt-1 text-slate-500">{Math.round(b.filter * 100)}%</div></div>
          </div>

          <div className="mt-4 flex items-center justify-center gap-2"><Headphones className="h-4 w-4 text-slate-700"/><span className="text-[7px] font-black text-slate-700">CUE BUS NOT EXPOSED</span></div>
          <div className="mt-3 rounded-lg border border-white/5 bg-black/25 p-2"><div className="flex items-center justify-between text-[7px] font-black text-slate-500"><span>MASTER</span><span>{Math.round(master * 100)}%</span></div><input type="range" min={0} max={1} step={0.01} value={master} onChange={event => { const value = Number(event.currentTarget.value); setMaster(value); emitDJControl({ type: 'mixer.master', value }); setLinkPulse(Date.now()); }} className="mt-2 w-full accent-blue-400" /></div>
        </div>

        <ChannelStrip deck="B" state={b} onPatch={patch => sendDeck('B', patch)} />
      </div>

      <div className="border-t border-white/5 bg-[#080a0d] px-5 py-4">
        <div className="flex items-center justify-between text-[8px] font-black"><span className="text-cyan-300">A</span><span className="text-slate-600">CROSSFADER</span><span className="text-fuchsia-300">B</span></div>
        <input type="range" min={-1} max={1} step={0.01} value={crossfader} onChange={event => { const value = Number(event.currentTarget.value); setCrossfader(value); emitDJControl({ type: 'mixer.crossfader', value }); setLinkPulse(Date.now()); }} className="mt-2 w-full accent-blue-400" />
      </div>
    </div>

    <div className="mt-3 grid gap-2 md:grid-cols-3">
      <div className="rounded-xl border border-emerald-400/10 bg-emerald-400/5 px-3 py-2 text-[8px] font-bold text-emerald-200"><Zap className="mr-1 inline h-3.5 w-3.5"/>EQ, FILTER, FADER, CROSSFADER e MASTER comandano realmente il motore.</div>
      <div className="rounded-xl border border-blue-400/10 bg-blue-400/5 px-3 py-2 text-[8px] font-bold text-blue-200"><Sparkles className="mr-1 inline h-3.5 w-3.5"/>FX knob usa DSP gia disponibile: filter / low cut / high cut.</div>
      <div className="rounded-xl border border-slate-800 bg-black/20 px-3 py-2 text-[8px] font-bold text-slate-600">Stems e cue bus restano disabilitati finche non esiste un percorso audio separato reale.</div>
    </div>
  </section>;
}
