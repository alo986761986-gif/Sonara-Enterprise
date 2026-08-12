import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Cpu,
  Disc3,
  Download,
  Headphones,
  Mic2,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles
} from 'lucide-react';

type CatalogItem = {
  id: string;
  title: string;
  creator: string;
  category: string;
  format: string;
  license: string;
  price: string;
  accent: string;
};

const ITEMS: CatalogItem[] = [
  { id: 'mkt-1', title: 'Underground House Drum Toolkit', creator: 'Sonara Labs', category: 'Samples', format: 'WAV 24-bit', license: 'Royalty-free preview', price: '€24', accent: 'from-purple-600/30 to-fuchsia-500/10' },
  { id: 'mkt-2', title: 'Afro Percussion Session', creator: 'Rhythm District', category: 'Loops', format: 'WAV stems', license: 'Creator license', price: '€29', accent: 'from-orange-500/30 to-amber-400/10' },
  { id: 'mkt-3', title: 'Deep House Chord Library', creator: 'Night Keys', category: 'MIDI', format: 'MIDI + presets', license: 'Royalty-free preview', price: '€18', accent: 'from-cyan-500/30 to-blue-500/10' },
  { id: 'mkt-4', title: 'Club Vocal Texture Pack', creator: 'Nova Voice', category: 'Vocals', format: 'WAV 48kHz', license: 'Commercial preview', price: '€35', accent: 'from-rose-500/30 to-pink-500/10' },
  { id: 'mkt-5', title: 'Analog Bass Essentials', creator: 'Circuit Room', category: 'Presets', format: 'Preset bank', license: 'Creator license', price: '€22', accent: 'from-emerald-500/30 to-teal-500/10' },
  { id: 'mkt-6', title: 'AI Mix Reference Toolkit', creator: 'Sonara Intelligence', category: 'Tools', format: 'Project kit', license: 'Development preview', price: '€0', accent: 'from-violet-500/30 to-indigo-500/10' }
];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  Samples: Disc3,
  Loops: Headphones,
  MIDI: SlidersHorizontal,
  Vocals: Mic2,
  Presets: Cpu,
  Tools: Sparkles
};

export default function MarketplaceWorkspace() {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState<CatalogItem | null>(ITEMS[0]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(ITEMS.map(item => item.category)))],
    []
  );

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return ITEMS.filter(item => {
      const categoryMatch = category === 'All' || item.category === category;
      const queryMatch = !normalized || `${item.title} ${item.creator} ${item.category}`.toLowerCase().includes(normalized);
      return categoryMatch && queryMatch;
    });
  }, [category, query]);

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-[#111827] via-[#0c1220] to-[#080b12] p-6 shadow-2xl shadow-black/30">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-purple-400/20 bg-purple-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-purple-300">Marketplace Preview</span>
              <span className="rounded-full border border-amber-400/20 bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">Checkout disabled in dev</span>
            </div>
            <h1 className="mt-4 text-3xl font-black tracking-tight text-white">Sonara Marketplace</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">Catalogo creativo per sample, preset, MIDI, vocal e strumenti. Questa UI non attiva pagamenti e non effettua acquisti reali.</p>
          </div>

          <div className="flex items-center gap-2 rounded-2xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3 text-xs text-emerald-300">
            <ShieldCheck className="h-4 w-4" />
            Safe development mode
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search sounds, tools and creators..."
              className="w-full rounded-2xl border border-white/10 bg-black/20 py-3 pl-10 pr-4 text-sm text-white outline-none placeholder:text-slate-600 focus:border-purple-500/50"
            />
          </label>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => setCategory(item)}
                className={category === item
                  ? 'shrink-0 rounded-xl bg-purple-600 px-3 py-2 text-xs font-bold text-white'
                  : 'shrink-0 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-slate-400 hover:text-white'}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
          {filtered.map(item => {
            const Icon = CATEGORY_ICONS[item.category] || ShoppingBag;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSelected(item)}
                className={selected?.id === item.id
                  ? 'overflow-hidden rounded-3xl border border-purple-400/60 bg-slate-900 text-left shadow-xl shadow-purple-950/20'
                  : 'overflow-hidden rounded-3xl border border-white/10 bg-slate-900/70 text-left transition hover:-translate-y-0.5 hover:border-white/20'}
              >
                <div className={`h-36 bg-gradient-to-br ${item.accent} p-5`}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/20 text-white">
                    <Icon className="h-6 w-6" />
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-purple-300">{item.category}</p>
                      <h2 className="mt-2 text-sm font-bold leading-5 text-white">{item.title}</h2>
                      <p className="mt-1 text-xs text-slate-500">by {item.creator}</p>
                    </div>
                    <span className="shrink-0 text-sm font-black text-white">{item.price}</span>
                  </div>
                  <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-3 text-[11px] text-slate-500">
                    <span>{item.format}</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </div>
                </div>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div className="col-span-full rounded-3xl border border-dashed border-white/10 p-10 text-center text-sm text-slate-500">No catalog items match this search.</div>
          )}
        </section>

        <aside className="h-fit rounded-3xl border border-white/10 bg-[#0d111a] p-5 shadow-2xl shadow-black/20 xl:sticky xl:top-28">
          {selected ? (
            <>
              <div className={`rounded-2xl bg-gradient-to-br ${selected.accent} p-5`}>
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/60">Selected asset</p>
                <h2 className="mt-2 text-lg font-black text-white">{selected.title}</h2>
                <p className="mt-1 text-xs text-white/50">{selected.creator}</p>
              </div>

              <div className="mt-5 space-y-3 text-xs">
                <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3"><span className="text-slate-500">Category</span><span className="font-semibold text-white">{selected.category}</span></div>
                <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3"><span className="text-slate-500">Format</span><span className="font-semibold text-white">{selected.format}</span></div>
                <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-3"><span className="text-slate-500">License</span><span className="text-right font-semibold text-white">{selected.license}</span></div>
                <div className="flex items-center justify-between gap-4"><span className="text-slate-500">Preview price</span><span className="text-base font-black text-white">{selected.price}</span></div>
              </div>

              <button type="button" disabled className="mt-5 flex w-full cursor-not-allowed items-center justify-center gap-2 rounded-2xl bg-slate-800 px-4 py-3 text-sm font-bold text-slate-500">
                <ShoppingBag className="h-4 w-4" />
                Checkout locked in development
              </button>
              <button type="button" className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 py-3 text-sm font-semibold text-slate-300 hover:border-purple-400/30 hover:text-white">
                <Download className="h-4 w-4" />
                Preview asset details
              </button>
            </>
          ) : (
            <div className="py-10 text-center text-sm text-slate-500">Select a marketplace item.</div>
          )}
        </aside>
      </div>
    </div>
  );
}
