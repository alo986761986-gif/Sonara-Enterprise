// MarketplaceHeader.tsx - Search, Sorting, and Filter Control Bar
import React from 'react';
import { Search, SlidersHorizontal, Sparkles, Flame, Clock, Star, DollarSign } from 'lucide-react';

export interface MarketplaceHeaderProps {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortBy: 'trending' | 'latest' | 'rating' | 'price';
  onSortChange: (sort: 'trending' | 'latest' | 'rating' | 'price') => void;
  isAiRecommended: boolean;
  onToggleAiRecommended: () => void;
}

export const MarketplaceHeader: React.FC<MarketplaceHeaderProps> = ({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  isAiRecommended,
  onToggleAiRecommended,
}) => {
  return (
    <header className="h-14 w-full bg-slate-900/90 border-b border-slate-800 px-6 flex items-center justify-between gap-4 shrink-0 backdrop-blur-md select-none font-sans z-20">
      {/* Search Input */}
      <div className="flex-1 max-w-md relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search sample packs, synth presets, vocals, plugins..."
          className="w-full bg-slate-950/90 border border-slate-800 rounded-xl pl-9 pr-4 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
        />
      </div>

      {/* Sorting & Filters */}
      <div className="flex items-center gap-2 text-xs">
        {/* AI Recommended Toggle */}
        <button
          onClick={onToggleAiRecommended}
          className={`px-3 py-1.5 rounded-xl border font-extrabold flex items-center gap-1.5 transition-all ${
            isAiRecommended
              ? 'bg-gradient-to-r from-purple-600 to-cyan-500 text-white border-purple-500/50 shadow-md'
              : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-white'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>AI Match</span>
        </button>

        <div className="w-px h-5 bg-slate-800 mx-1" />

        {/* Sort Buttons */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 font-bold text-slate-400">
          <button
            onClick={() => onSortChange('trending')}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all ${
              sortBy === 'trending' ? 'bg-purple-600 text-white' : 'hover:text-white'
            }`}
          >
            <Flame className="w-3 h-3" />
            <span>Trending</span>
          </button>
          <button
            onClick={() => onSortChange('latest')}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all ${
              sortBy === 'latest' ? 'bg-purple-600 text-white' : 'hover:text-white'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>Latest</span>
          </button>
          <button
            onClick={() => onSortChange('rating')}
            className={`px-2.5 py-1 rounded-lg flex items-center gap-1 transition-all ${
              sortBy === 'rating' ? 'bg-purple-600 text-white' : 'hover:text-white'
            }`}
          >
            <Star className="w-3 h-3" />
            <span>Rating</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default MarketplaceHeader;
