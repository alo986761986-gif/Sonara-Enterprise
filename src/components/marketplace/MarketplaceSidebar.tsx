// MarketplaceSidebar.tsx - Collapsible Left Category Sidebar for Marketplace
import React, { useState } from 'react';
import { 
  Music, 
  Disc, 
  Repeat, 
  Mic, 
  Sliders, 
  Box, 
  Layers, 
  FileText, 
  Sparkles, 
  ImageIcon, 
  Clock, 
  Heart, 
  Download,
  ChevronLeft,
  ChevronRight,
  Store
} from 'lucide-react';

export interface MarketplaceSidebarProps {
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
}

export const CATEGORY_ITEMS = [
  { id: 'All', label: 'All Assets', icon: Store },
  { id: 'Audio', label: 'Audio Tracks', icon: Music },
  { id: 'Samples', label: 'Sample Packs', icon: Disc },
  { id: 'Loops', label: 'Melodic Loops', icon: Repeat },
  { id: 'Vocals', label: 'Vocal Stems', icon: Mic },
  { id: 'Presets', label: 'Synth Presets', icon: Sliders },
  { id: 'Plugins', label: 'Audio Plugins', icon: Box },
  { id: 'Instruments', label: 'Virtual Instruments', icon: Layers },
  { id: 'Templates', label: 'DAW Templates', icon: FileText },
  { id: 'Projects', label: 'Full Projects', icon: Layers },
  { id: 'AI Models', label: 'AI Voice Models', icon: Sparkles },
  { id: 'Cover Arts', label: 'Cover Artworks', icon: ImageIcon },
];

export const COLLECTION_ITEMS = [
  { id: 'History', label: 'Marketplace History', icon: Clock },
  { id: 'Favorites', label: 'Saved Favorites', icon: Heart },
  { id: 'Downloads', label: 'My Downloads', icon: Download },
];

export const MarketplaceSidebar: React.FC<MarketplaceSidebarProps> = ({
  selectedCategory,
  onSelectCategory,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`h-full bg-slate-900/90 border-r border-slate-800 transition-all duration-300 flex flex-col shrink-0 z-10 select-none font-sans ${
        isCollapsed ? 'w-16' : 'w-[240px]'
      }`}
    >
      {/* Header / Collapse */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        {!isCollapsed && (
          <span className="text-xs font-black uppercase tracking-wider text-slate-300">Categories</span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors mx-auto"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Nav List */}
      <nav className="p-2 flex flex-col gap-1 overflow-y-auto custom-scrollbar flex-1 text-xs">
        {CATEGORY_ITEMS.map((cat) => {
          const Icon = cat.icon;
          const isActive = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl font-bold transition-all ${
                isActive
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span className="truncate">{cat.label}</span>}
            </button>
          );
        })}

        <div className="my-2 border-t border-slate-800/80" />

        {!isCollapsed && (
          <span className="px-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">User Vault</span>
        )}

        {COLLECTION_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = selectedCategory === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectCategory(item.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-xl font-bold transition-all ${
                isActive
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span className="truncate">{item.label}</span>}
            </button>
          );
        })}
      </nav>
    </aside>
  );
};

export default MarketplaceSidebar;
