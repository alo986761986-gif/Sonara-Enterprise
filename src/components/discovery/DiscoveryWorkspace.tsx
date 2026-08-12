import React, { useMemo, useState } from 'react';
import {
  Activity,
  Globe2,
  MapPin,
  Radio,
  Search,
  Sparkles,
  Users
} from 'lucide-react';

type DiscoveryHub = {
  id: string;
  city: string;
  country: string;
  genre: string;
  creators: number;
  live: number;
  x: number;
  y: number;
};

const HUBS: DiscoveryHub[] = [
  { id: 'london', city: 'London', country: 'UK', genre: 'House / Garage', creators: 1840, live: 126, x: 48, y: 29 },
  { id: 'berlin', city: 'Berlin', country: 'DE', genre: 'Techno / House', creators: 2210, live: 174, x: 56, y: 31 },
  { id: 'ibiza', city: 'Ibiza', country: 'ES', genre: 'House / Balearic', creators: 980, live: 88, x: 46, y: 42 },
  { id: 'lagos', city: 'Lagos', country: 'NG', genre: 'Afro House', creators: 1320, live: 102, x: 49, y: 59 },
  { id: 'new-york', city: 'New York', country: 'US', genre: 'House / Hip-Hop', creators: 2680, live: 203, x: 24, y: 38 },
  { id: 'los-angeles', city: 'Los Angeles', country: 'US', genre: 'Electronic / Pop', creators: 2510, live: 196, x: 13, y: 46 },
  { id: 'sao-paulo', city: 'São Paulo', country: 'BR', genre: 'Latin / House', creators: 1580, live: 121, x: 34, y: 72 },
  { id: 'tokyo', city: 'Tokyo', country: 'JP', genre: 'Electronic / Future', creators: 2130, live: 159, x: 84, y: 40 }
];

const FILTERS = ['All', 'House', 'Techno', 'Afro', 'Electronic', 'Latin'];

export default function DiscoveryWorkspace() {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('All');
  const [selected, setSelected] = useState<DiscoveryHub>(HUBS[0]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return HUBS.filter(hub => {
      const genreMatch = filter === 'All' || hub.genre.toLowerCase().includes(filter.toLowerCase());
      const queryMatch = !normalized || `${hub.city} ${hub.country} ${hub.genre}`.toLowerCase().includes(normalized);
      return genreMatch && queryMatch;
    });
  }, [filter, query]);

  const totalCreators = filtered.reduce((sum, hub) => sum + hub.creators, 0);
  const liveCreators = filtered.reduce((sum, hub) => sum + hub.live, 0);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-cyan-500/20 bg-gradient-to-br from-[#08121d] via-[#080d18] to-[#06080e] p-6 shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-cyan-400/20 bg-cyan-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">Worldwide Discovery</span>
              <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-violet-300">Safe UI preview</span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white">Discover the Sonara network</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Esplora hub creativi, scene musicali e attività globali. Il motore 3D completo resta isolato finché non viene reintegrato e testato senza rischiare la build stabile.</p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Creators</p>
              <p className="mt-1 text-lg font-black text-white">{totalCreators.toLocaleString()}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Live now</p>
              <p className="mt-1 text-lg font-black text-emerald-300">{liveCreators.toLocaleString()}</p>
            </div>
            <div className="col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 sm:col-span-1">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Hubs</p>
              <p className="mt-1 text-lg font-black text-cyan-300">{filtered.length}</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search city, country or scene..."
              className="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-cyan-500/50"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {FILTERS.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => setFilter(item)}
                className={filter === item
                  ? 'shrink-0 rounded-xl bg-cyan-500 px-3 py-2 text-xs font-black text-slate-950'
                  : 'shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white'}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="relative min-h-[620px] overflow-hidden rounded-3xl border border-white/10 bg-[#030712] shadow-2xl shadow-black/30">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.13),transparent_38%),radial-gradient(circle_at_30%_20%,rgba(139,92,246,0.12),transparent_30%)]" />
          <div className="absolute left-1/2 top-1/2 h-[460px] w-[460px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-400/20 bg-[radial-gradient(circle_at_35%_30%,rgba(56,189,248,0.20),rgba(15,23,42,0.92)_45%,rgba(2,6,23,1)_75%)] shadow-[0_0_90px_rgba(34,211,238,0.14)]">
            <div className="absolute inset-[10%] rounded-full border border-white/5" />
            <div className="absolute inset-[25%] rounded-full border border-white/5" />
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/5" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/5" />
          </div>

          <div className="absolute left-5 top-5 z-20 flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-slate-300 backdrop-blur-xl">
            <Globe2 className="h-4 w-4 text-cyan-300" />
            Network map preview
          </div>

          {filtered.map(hub => (
            <button
              key={hub.id}
              type="button"
              onClick={() => setSelected(hub)}
              style={{ left: `${hub.x}%`, top: `${hub.y}%` }}
              className="group absolute z-20 -translate-x-1/2 -translate-y-1/2"
              title={`${hub.city} · ${hub.genre}`}
            >
              <span
                className={selected.id === hub.id
                  ? 'absolute -inset-3 rounded-full bg-cyan-400/20 blur-sm'
                  : 'absolute -inset-2 rounded-full bg-violet-400/10 opacity-0 blur-sm transition group-hover:opacity-100'}
              />
              <span className={selected.id === hub.id
                ? 'relative flex h-8 w-8 items-center justify-center rounded-full border border-cyan-200 bg-cyan-400 text-slate-950 shadow-[0_0_24px_rgba(34,211,238,0.7)]'
                : 'relative flex h-7 w-7 items-center justify-center rounded-full border border-violet-300/70 bg-violet-500/80 text-white shadow-[0_0_18px_rgba(139,92,246,0.5)] transition group-hover:scale-110'}
              >
                <MapPin className="h-3.5 w-3.5" />
              </span>
            </button>
          ))}

          {filtered.length === 0 && (
            <div className="absolute inset-0 z-20 flex items-center justify-center">
              <div className="rounded-2xl border border-white/10 bg-black/40 px-5 py-4 text-sm text-slate-400 backdrop-blur">No discovery hubs match this filter.</div>
            </div>
          )}

          <div className="absolute bottom-5 left-5 right-5 z-20 grid gap-2 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-black/35 p-3 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-xs font-bold text-white"><Radio className="h-4 w-4 text-emerald-300" /> Live sessions</div>
              <p className="mt-1 text-[11px] text-slate-500">Signals visualized locally.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/35 p-3 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-xs font-bold text-white"><Users className="h-4 w-4 text-violet-300" /> Creator hubs</div>
              <p className="mt-1 text-[11px] text-slate-500">Curated preview dataset.</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-black/35 p-3 backdrop-blur-xl">
              <div className="flex items-center gap-2 text-xs font-bold text-white"><Sparkles className="h-4 w-4 text-cyan-300" /> 3D engine</div>
              <p className="mt-1 text-[11px] text-slate-500">Staged for later reintegration.</p>
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="rounded-3xl border border-white/10 bg-[#0d111a] p-5 shadow-2xl shadow-black/20">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-300">Selected hub</p>
            <h2 className="mt-2 text-2xl font-black text-white">{selected.city}</h2>
            <p className="text-xs text-slate-500">{selected.country}</p>

            <div className="mt-5 rounded-2xl border border-cyan-500/15 bg-cyan-500/5 p-4">
              <p className="text-xs font-bold text-white">{selected.genre}</p>
              <p className="mt-1 text-[11px] leading-5 text-slate-400">Active scene profile for the current discovery preview.</p>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <Users className="h-4 w-4 text-violet-300" />
                <p className="mt-2 text-lg font-black text-white">{selected.creators.toLocaleString()}</p>
                <p className="text-[10px] text-slate-500">Creators</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                <Activity className="h-4 w-4 text-emerald-300" />
                <p className="mt-2 text-lg font-black text-white">{selected.live}</p>
                <p className="text-[10px] text-slate-500">Live now</p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#0d111a] p-5">
            <h3 className="text-sm font-bold text-white">Integration status</h3>
            <div className="mt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Discovery shell</span><span className="font-bold text-emerald-300">READY</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Local preview data</span><span className="font-bold text-emerald-300">READY</span></div>
              <div className="flex items-center justify-between gap-3"><span className="text-slate-500">Full WebGL globe</span><span className="font-bold text-amber-300">STAGED</span></div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
