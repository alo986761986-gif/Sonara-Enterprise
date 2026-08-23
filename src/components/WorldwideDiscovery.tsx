import React, { useMemo, useState } from 'react';
import {
  Globe2,
  MapPin,
  Music2,
  Radio,
  Search,
  Sparkles,
  TrendingUp,
  Users
} from 'lucide-react';

export interface WorldwideCreator {
  id: string;
  name: string;
  city: string;
  country: string;
  genre: string;
  listeners: string;
  trend: string;
}

export interface WorldwideDiscoveryProps {
  onSelectCreator?: (creator: any) => void;
}

const creators: WorldwideCreator[] = [
  { id: 'wd-1', name: 'Aria Sterling', city: 'London', country: 'UK', genre: 'Melodic House', listeners: '380K', trend: '+18%' },
  { id: 'wd-2', name: 'Kaito Beats', city: 'Tokyo', country: 'Japan', genre: 'Tech House', listeners: '245K', trend: '+24%' },
  { id: 'wd-3', name: 'Modular Lab', city: 'Berlin', country: 'Germany', genre: 'Techno', listeners: '194K', trend: '+11%' },
  { id: 'wd-4', name: 'Luna Norte', city: 'Madrid', country: 'Spain', genre: 'Afro House', listeners: '172K', trend: '+31%' },
  { id: 'wd-5', name: 'Nova Coast', city: 'Los Angeles', country: 'USA', genre: 'Deep House', listeners: '410K', trend: '+16%' },
  { id: 'wd-6', name: 'Sahara Pulse', city: 'Cape Town', country: 'South Africa', genre: 'Afro Tech', listeners: '298K', trend: '+27%' }
];

export const WorldwideDiscovery: React.FC<WorldwideDiscoveryProps> = ({ onSelectCreator }) => {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return creators;
    return creators.filter(item =>
      `${item.name} ${item.city} ${item.country} ${item.genre}`.toLowerCase().includes(q)
    );
  }, [query]);

  return (
    <div className="min-h-[calc(100vh-72px)] bg-[#070b12] p-6 text-slate-100">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-black uppercase tracking-[0.22em] text-cyan-400">
              <Globe2 className="h-4 w-4" />
              Sonara Worldwide Discovery
            </div>
            <h1 className="text-3xl font-black">Discover creators, scenes and opportunities worldwide.</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-400">
              Global creator discovery layer for collaboration, repertoire scouting, trends and Sonara network intelligence.
            </p>
          </div>

          <div className="relative w-full max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search creator, city or genre..."
              className="w-full rounded-xl border border-slate-700 bg-slate-950 py-3 pl-10 pr-4 text-sm outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          {[
            ['CREATORS', '12.4K', Users],
            ['COUNTRIES', '86', Globe2],
            ['LIVE SCENES', '214', Radio],
            ['TREND SIGNALS', '1,842', TrendingUp]
          ].map(([label, value, Icon]: any) => (
            <div key={label} className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
              <Icon className="mb-3 h-5 w-5 text-cyan-400" />
              <div className="text-xs font-bold text-slate-500">{label}</div>
              <div className="mt-1 text-2xl font-black">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(creator => (
            <button
              key={creator.id}
              type="button"
              onClick={() => onSelectCreator?.(creator)}
              className="group rounded-2xl border border-slate-800 bg-slate-900/75 p-5 text-left transition hover:border-cyan-600 hover:bg-slate-900"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 text-cyan-300">
                  <Music2 className="h-6 w-6" />
                </div>
                <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-xs font-black text-emerald-400">
                  {creator.trend}
                </span>
              </div>

              <h2 className="mt-5 text-lg font-black group-hover:text-cyan-300">{creator.name}</h2>
              <div className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                <MapPin className="h-3.5 w-3.5" />
                {creator.city}, {creator.country}
              </div>

              <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-4 text-xs">
                <span className="rounded-lg bg-purple-500/10 px-2 py-1 font-bold text-purple-300">{creator.genre}</span>
                <span className="flex items-center gap-1 text-slate-400">
                  <Sparkles className="h-3.5 w-3.5" />
                  {creator.listeners} listeners
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default WorldwideDiscovery;
