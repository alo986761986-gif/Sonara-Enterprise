import React, { useMemo, useState } from 'react';
import { BarChart3, Download, Layers, Package, ShieldCheck, ShoppingBag, Sparkles, Store, Star } from 'lucide-react';

import { MarketplaceAnalytics } from './MarketplaceAnalytics';
import MarketplaceDownloads from './MarketplaceDownloads';
import MarketplaceHeader from './MarketplaceHeader';
import { MarketplaceProductCard } from './MarketplaceProductCard';
import MarketplaceSidebar from './MarketplaceSidebar';
import type { MarketplaceItem } from './types';

const INITIAL_ITEMS: MarketplaceItem[] = [
  {
    id: 'm1',
    title: 'Cyberpunk Synthwave Vol. 1',
    creatorName: 'Kaito Beats',
    creator: 'Kaito Beats',
    category: 'Samples',
    price: '$24.99',
    rating: 4.9,
    downloads: '1.4k',
    description: 'Retro-futuristic sample pack built for high-energy productions.',
    version: '1.0',
    license: 'Commercial Royalty-Free',
    coverUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'm2',
    title: 'Tokyo Vocal Stems (WAV)',
    creatorName: 'Aria Sterling',
    creator: 'Aria Sterling',
    category: 'Vocals',
    price: '$34.99',
    rating: 5.0,
    downloads: '2.9k',
    description: 'Clean vocal stems for pop, future bass, and cinematic work.',
    version: '2.1',
    license: 'Commercial Royalty-Free',
    coverUrl: 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'm3',
    title: 'Serum Analog Heat Presets',
    creatorName: 'Modular Lab',
    creator: 'Modular Lab',
    category: 'Presets',
    price: '$19.99',
    rating: 4.8,
    downloads: '980',
    description: 'Analog-inspired presets tuned for modern synth design.',
    version: '1.3',
    license: 'Commercial Royalty-Free',
    coverUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'm4',
    title: 'Sonara AI Voice Model: CyberDiva',
    creatorName: 'Sonara Labs',
    creator: 'Sonara Labs',
    category: 'AI Models',
    price: '$49.99',
    rating: 5.0,
    downloads: '5.1k',
    description: 'Studio-ready AI voice model for cinematic and pop workflows.',
    version: '3.0',
    license: 'Commercial Royalty-Free',
    coverUrl: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'm5',
    title: 'Ableton Techno Master Template',
    creatorName: 'Berlin Underground',
    creator: 'Berlin Underground',
    category: 'Templates',
    price: '$39.99',
    rating: 4.7,
    downloads: '640',
    description: 'Hybrid template optimized for fast techno and club production.',
    version: '1.0',
    license: 'Commercial Royalty-Free',
    coverUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=800&auto=format&fit=crop',
  },
  {
    id: 'm6',
    title: 'LoFi Hip-Hop Guitar Loops',
    creatorName: 'Chillhop Studio',
    creator: 'Chillhop Studio',
    category: 'Loops',
    price: '$14.99',
    rating: 4.9,
    downloads: '3.2k',
    description: 'Warm guitar loops for mellow lo-fi and chillhop arrangements.',
    version: '1.2',
    license: 'Commercial Royalty-Free',
    coverUrl: 'https://images.unsplash.com/photo-1465847899084-d164df4dedc6?q=80&w=800&auto=format&fit=crop',
  },
];

export const MarketplaceShell: React.FC = () => {
  const [activeView, setActiveView] = useState<'store' | 'studio' | 'library'>('store');
  const [items, setItems] = useState<MarketplaceItem[]>(INITIAL_ITEMS);
  const [myItems] = useState<MarketplaceItem[]>([INITIAL_ITEMS[1], INITIAL_ITEMS[3]]);
  const [purchasedItems, setPurchasedItems] = useState<MarketplaceItem[]>([INITIAL_ITEMS[0]]);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'trending' | 'latest' | 'rating' | 'price'>('trending');
  const [isAiRecommended, setIsAiRecommended] = useState(false);
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(INITIAL_ITEMS[0]);

  const filteredItems = useMemo(() => {
    const filtered = items.filter((item) => {
      if (selectedCategory !== 'All' && item.category !== selectedCategory) return false;
      const search = searchQuery.trim().toLowerCase();
      if (search) {
        const haystack = `${item.title} ${item.creatorName} ${item.category}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });

    const sorted = [...filtered];
    if (sortBy === 'rating') {
      sorted.sort((left, right) => right.rating - left.rating);
    } else if (sortBy === 'price') {
      sorted.sort((left, right) => parseFloat(left.price.replace(/[^0-9.]/g, '')) - parseFloat(right.price.replace(/[^0-9.]/g, '')));
    } else if (sortBy === 'latest') {
      sorted.reverse();
    } else {
      sorted.sort((left, right) => Number.parseFloat(`${right.downloads}`) - Number.parseFloat(`${left.downloads}`));
    }

    return sorted;
  }, [items, searchQuery, selectedCategory, sortBy]);

  const handleAddSelectedToLibrary = () => {
    if (!selectedItem) return;
    setPurchasedItems((current) => {
      if (current.some((item) => item.id === selectedItem.id)) return current;
      return [selectedItem, ...current];
    });
  };

  const selectedInLibrary = selectedItem ? purchasedItems.some((item) => item.id === selectedItem.id) : false;

  return (
    <div className="min-h-screen bg-[#02050e] text-white flex flex-col">
      <nav className="sticky top-0 z-40 flex flex-wrap items-center gap-2 border-b border-slate-800 bg-[#070b14]/95 px-3 py-3 backdrop-blur-md sm:px-4">
        <button
          onClick={() => setActiveView('store')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${activeView === 'store' ? 'bg-slate-900 text-white' : 'bg-slate-900/50 text-slate-400 hover:text-white'}`}
        >
          <Store size={16} />
          Store
        </button>
        <button
          onClick={() => setActiveView('studio')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${activeView === 'studio' ? 'bg-slate-900 text-white' : 'bg-slate-900/50 text-slate-400 hover:text-white'}`}
        >
          <Package size={16} />
          Studio
        </button>
        <button
          onClick={() => setActiveView('library')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-all ${activeView === 'library' ? 'bg-slate-900 text-white' : 'bg-slate-900/50 text-slate-400 hover:text-white'}`}
        >
          <Download size={16} />
          Library
        </button>
        <div className="ml-auto flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-xs font-semibold text-cyan-200">
          <Sparkles size={14} />
          Marketplace online
        </div>
      </nav>

      {activeView === 'store' && (
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
          <MarketplaceSidebar selectedCategory={selectedCategory} onSelectCategory={setSelectedCategory} />

          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <MarketplaceHeader
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
              isAiRecommended={isAiRecommended}
              onToggleAiRecommended={() => setIsAiRecommended((current) => !current)}
            />

            <div className="flex min-h-0 flex-1 flex-col overflow-hidden xl:flex-row">
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                <div className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                  <ShoppingBag size={14} className="text-indigo-400" />
                  <span>Curated marketplace assets</span>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {filteredItems.map((item) => (
                    <MarketplaceProductCard
                      key={item.id}
                      name={item.title}
                      creator={item.creatorName}
                      price={item.price}
                      rating={item.rating}
                      downloads={`${item.downloads}`}
                      category={item.category}
                      imageBg="from-indigo-600/30 to-violet-600/20"
                      onSelect={() => setSelectedItem(item)}
                    />
                  ))}
                </div>
                {filteredItems.length === 0 && (
                  <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400">
                    No assets match the current filters.
                  </div>
                )}
              </div>

              <aside className="border-t border-slate-800 bg-slate-950/80 p-4 sm:p-6 xl:w-[360px] xl:border-l xl:border-t-0">
                {selectedItem ? (
                  <div className="space-y-4">
                    <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70">
                      <img src={selectedItem.coverUrl} alt={selectedItem.title} className="h-48 w-full object-cover" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-cyan-300">
                        <ShieldCheck size={14} />
                        <span>{selectedItem.license}</span>
                      </div>
                      <h2 className="mt-2 text-2xl font-black text-white">{selectedItem.title}</h2>
                      <p className="mt-1 text-sm text-slate-400">By {selectedItem.creatorName}</p>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-slate-300">
                      <div className="flex items-center gap-1 text-amber-400">
                        <Star size={14} className="fill-current" />
                        <span>{selectedItem.rating.toFixed(1)}</span>
                      </div>
                      <span className="text-slate-600">|</span>
                      <span>{selectedItem.category}</span>
                    </div>
                    <p className="text-sm leading-6 text-slate-400">{selectedItem.description}</p>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-400">Price</span>
                        <span className="text-lg font-black text-white">{selectedItem.price}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-semibold text-slate-400">Downloads</span>
                        <span>{selectedItem.downloads}</span>
                      </div>
                      <div className="mt-2 flex items-center justify-between">
                        <span className="font-semibold text-slate-400">Version</span>
                        <span>{selectedItem.version}</span>
                      </div>
                    </div>
                    <button
                      onClick={handleAddSelectedToLibrary}
                      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-600/20 transition-transform hover:scale-[1.01]"
                    >
                      <Download size={16} />
                      {selectedInLibrary ? 'Already in Library' : 'Add to Library'}
                    </button>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-400">
                    Select an asset to inspect its details.
                  </div>
                )}
              </aside>
            </div>
          </div>
        </div>
      )}

      {activeView === 'studio' && (
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mb-6 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Layers size={14} className="text-indigo-400" />
            <span>Creator studio and analytics</span>
          </div>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                {myItems.map((item) => (
                  <MarketplaceProductCard
                    key={item.id}
                    name={item.title}
                    creator={item.creatorName}
                    price={item.price}
                    rating={item.rating}
                    downloads={`${item.downloads}`}
                    category={item.category}
                    imageBg="from-emerald-600/25 to-cyan-600/20"
                    isOwned
                    onSelect={() => setSelectedItem(item)}
                  />
                ))}
              </div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-300">
                <div className="flex items-center gap-2 text-cyan-300">
                  <Sparkles size={14} />
                  <span className="font-bold uppercase tracking-wider text-xs">Studio status</span>
                </div>
                <p className="mt-3 text-slate-400">
                  Your seller surface is online. The advanced enterprise workflows will be restored after the marketplace stabilization pass.
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <MarketplaceAnalytics />
              <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 text-sm text-slate-400">
                <div className="flex items-center gap-2 text-white">
                  <BarChart3 size={16} className="text-cyan-300" />
                  <span className="font-bold">Activity snapshot</span>
                </div>
                <p className="mt-3 leading-6">
                  Creator inventory, commercial assets, and distribution analytics remain connected to the existing marketplace dataset.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeView === 'library' && (
        <div className="min-h-0 flex-1 overflow-hidden">
          <MarketplaceDownloads purchasedItems={purchasedItems} />
        </div>
      )}
    </div>
  );
};

export default MarketplaceShell;
