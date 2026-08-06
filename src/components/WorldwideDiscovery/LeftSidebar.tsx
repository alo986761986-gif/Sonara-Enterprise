// LeftSidebar.tsx - Collapsible 280px Left Navigation Sidebar Layout
import React, { useState } from 'react';
import { 
  Compass, 
  Map, 
  Layers, 
  SlidersHorizontal, 
  Clock, 
  ChevronLeft, 
  ChevronRight,
  Radio,
  Bookmark
} from 'lucide-react';

export const LeftSidebar: React.FC = () => {
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <aside
      className={`h-full bg-slate-900/90 border-r border-slate-800 transition-all duration-300 flex flex-col shrink-0 z-10 ${
        isCollapsed ? 'w-16' : 'w-[280px]'
      }`}
    >
      {/* Header / Collapse Toggle */}
      <div className="p-3 border-b border-slate-800 flex items-center justify-between">
        {!isCollapsed && (
          <span className="text-xs font-black uppercase tracking-wider text-slate-300">
            Navigation
          </span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors mx-auto"
          title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
        >
          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="p-2 flex flex-col gap-1 overflow-y-auto custom-scrollbar flex-1">
        <button className="flex items-center gap-3 px-3 py-2 rounded-xl bg-purple-600/20 text-purple-300 border border-purple-500/30 text-xs font-bold transition-all">
          <Compass className="w-4 h-4 text-purple-400 shrink-0" />
          {!isCollapsed && <span>Explore World</span>}
        </button>

        <button className="flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 text-xs font-semibold transition-all">
          <Map className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Hotspots & Hubs</span>}
        </button>

        <button className="flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 text-xs font-semibold transition-all">
          <Layers className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Ecosystem Layers</span>}
        </button>

        <button className="flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 text-xs font-semibold transition-all">
          <SlidersHorizontal className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Genre Filters</span>}
        </button>

        <button className="flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 text-xs font-semibold transition-all">
          <Clock className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Era Timeline</span>}
        </button>

        <button className="flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 text-xs font-semibold transition-all">
          <Radio className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Live Broadcasts</span>}
        </button>

        <button className="flex items-center gap-3 px-3 py-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 text-xs font-semibold transition-all">
          <Bookmark className="w-4 h-4 shrink-0" />
          {!isCollapsed && <span>Bookmarks</span>}
        </button>
      </nav>
    </aside>
  );
};

export default LeftSidebar;
