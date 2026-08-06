// TopToolbar.tsx - Top Desktop Toolbar Layout Structure
import React from 'react';
import { Search, Bell, Globe, User, Sparkles } from 'lucide-react';

export const TopToolbar: React.FC = () => {
  return (
    <header className="h-14 w-full bg-slate-900/90 border-b border-slate-800 px-4 flex items-center justify-between gap-4 shrink-0 backdrop-blur-md z-30">
      {/* Brand / Logo Area */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-purple-600 to-cyan-500 flex items-center justify-center text-white shadow-md">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-black tracking-wider uppercase text-white">Project Phoenix</span>
          <span className="text-[10px] text-slate-400 font-medium">Worldwide Desktop</span>
        </div>
      </div>

      {/* Search Bar Placeholder */}
      <div className="flex-1 max-w-md relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search creators, cities, genres, studios..."
          className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-colors"
          readOnly
        />
      </div>

      {/* Actions: Notifications, Language, Profile */}
      <div className="flex items-center gap-2 shrink-0">
        <button className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 transition-colors">
          <Globe className="w-4 h-4" />
        </button>
        <button className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 border border-slate-700/60 transition-colors relative">
          <Bell className="w-4 h-4" />
          <span className="w-2 h-2 rounded-full bg-purple-500 absolute top-1.5 right-1.5" />
        </button>
        <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
          <div className="w-8 h-8 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
            <User className="w-4 h-4" />
          </div>
        </div>
      </div>
    </header>
  );
};

export default TopToolbar;
