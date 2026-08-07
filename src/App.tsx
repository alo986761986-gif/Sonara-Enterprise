import React, { useState } from 'react';
import { Music, Globe2, ShoppingBag } from 'lucide-react';

import GeneratorApp from './App.generator-backup';
import WorldwideDiscovery from './components/WorldwideDiscovery';
import MarketplaceDesktop from './components/marketplace/MarketplaceDesktop';

type View = 'studio' | 'discovery' | 'marketplace';

export default function App() {
  const [view, setView] = useState<View>('studio');

  return (
    <div className="min-h-screen bg-[#02050e] text-white">
      <nav className="sticky top-0 z-50 flex gap-2 border-b border-slate-800 bg-[#070b14] p-3">
        <button
          onClick={() => setView('studio')}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2"
        >
          <Music size={17} />
          Studio
        </button>

        <button
          onClick={() => setView('discovery')}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2"
        >
          <Globe2 size={17} />
          Discovery
        </button>

        <button
          onClick={() => setView('marketplace')}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2"
        >
          <ShoppingBag size={17} />
          Marketplace
        </button>
      </nav>

      {view === 'studio' && <GeneratorApp />}
      {view === 'discovery' && <WorldwideDiscovery />}
      {view === 'marketplace' && <MarketplaceDesktop />}
    </div>
  );
}