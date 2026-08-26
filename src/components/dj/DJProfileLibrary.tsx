import React, { useMemo, useState } from 'react';
import { CheckCircle2, Cpu, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { DJ_CAPABILITY_LABELS, DJ_DEVICE_PROFILES, DJDeviceProfile } from './deviceProfiles';

const PROFILE_KEY = 'sonara.dj.active-profile.v1';

export default function DJProfileLibrary({ detectedProfileId, onSelect }: { detectedProfileId?: string; onSelect?: (profile: DJDeviceProfile) => void }) {
  const initial = localStorage.getItem(PROFILE_KEY) || detectedProfileId || 'generic-midi';
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(initial);
  const selected = DJ_DEVICE_PROFILES.find(item => item.id === selectedId) || DJ_DEVICE_PROFILES[DJ_DEVICE_PROFILES.length - 1];
  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return DJ_DEVICE_PROFILES.filter(item => !q || `${item.brand} ${item.model} ${item.aliases.join(' ')}`.toLowerCase().includes(q));
  }, [query]);
  const select = (profile: DJDeviceProfile) => {
    setSelectedId(profile.id);
    localStorage.setItem(PROFILE_KEY, profile.id);
    onSelect?.(profile);
  };

  return <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-4 sm:p-5">
    <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center"><div><div className="flex items-center gap-2"><Cpu className="h-4 w-4 text-purple-300"/><h2 className="text-sm font-black text-white">Hardware Profile Library</h2><span className="rounded-full border border-purple-500/20 bg-purple-500/10 px-2 py-0.5 text-[8px] font-black text-purple-200">{DJ_DEVICE_PROFILES.length} PROFILI</span></div><p className="mt-1 text-[10px] text-slate-500">Auto-detection del modello, capabilities, metodo di connessione e fallback MIDI Learn.</p></div><label className="flex min-w-[260px] items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-3"><Search className="h-3.5 w-3.5 text-slate-600"/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cerca console o controller..." className="w-full bg-transparent py-2.5 text-[10px] text-white outline-none placeholder:text-slate-700"/></label></div>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1.15fr]">
      <div className="max-h-[430px] space-y-2 overflow-auto pr-1">{filtered.map(profile => <button key={profile.id} onClick={() => select(profile)} className={`flex w-full items-center justify-between gap-3 rounded-xl border p-3 text-left transition ${profile.id === selected.id ? 'border-cyan-500/35 bg-cyan-500/10' : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'}`}><div className="min-w-0"><div className="truncate text-[10px] font-black text-white">{profile.model}</div><div className="mt-1 truncate text-[8px] font-bold text-slate-600">{profile.brand}</div></div><div className="flex shrink-0 gap-1">{profile.transports.slice(0, 3).map(item => <span key={item} className="rounded-md border border-slate-800 bg-slate-900 px-1.5 py-1 text-[7px] font-black uppercase text-slate-500">{item}</span>)}</div></button>)}</div>
      <div className="rounded-2xl border border-slate-800 bg-[#070a10] p-4"><div className="flex items-start justify-between gap-3"><div><div className="text-[9px] font-black uppercase tracking-[0.18em] text-cyan-300">{selected.brand}</div><h3 className="mt-1 text-lg font-black text-white">{selected.model}</h3><p className="mt-2 text-[10px] leading-5 text-slate-500">{selected.notes}</p></div>{selected.id === detectedProfileId ? <span className="flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[8px] font-black text-emerald-300"><CheckCircle2 className="h-3 w-3"/> AUTO</span> : null}</div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-[7px] font-black text-slate-600">DECK</div><div className="mt-1 text-xs font-black text-white">{selected.deckCount}</div></div><div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-[7px] font-black text-slate-600">CONNECTION</div><div className="mt-1 text-[9px] font-black text-cyan-200">{selected.connection.replaceAll('-', ' ').toUpperCase()}</div></div><div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-[7px] font-black text-slate-600">MAPPING</div><div className="mt-1 text-[9px] font-black text-purple-200">{selected.mapping.replaceAll('-', ' ').toUpperCase()}</div></div><div className="rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="text-[7px] font-black text-slate-600">TRANSPORT</div><div className="mt-1 text-[9px] font-black text-white">{selected.transports.join(' / ').toUpperCase()}</div></div></div>
        <div className="mt-4"><div className="flex items-center gap-2 text-[9px] font-black text-slate-400"><SlidersHorizontal className="h-3.5 w-3.5"/> CAPABILITIES</div><div className="mt-2 flex flex-wrap gap-1.5">{selected.capabilities.map(item => <span key={item} className="rounded-lg border border-slate-800 bg-slate-950 px-2 py-1.5 text-[8px] font-bold text-slate-400">{DJ_CAPABILITY_LABELS[item]}</span>)}</div></div>
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-[9px] leading-5 text-amber-100/70"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300"/><span>I profili SONARA descrivono capacità e percorsi di integrazione. Un mapping hardware viene marcato come operativo solo dopo che il controller espone realmente i messaggi MIDI/HID o dopo handshake con DJ Bridge.</span></div>
      </div>
    </div>
  </section>;
}
