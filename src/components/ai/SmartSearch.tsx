import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Search, Sparkles, Command, ArrowRight, Music, Layout, Globe, Users, BarChart3, Settings, ShieldAlert } from 'lucide-react';
import { transitions } from '../../lib/motion';

export const SmartSearch: React.FC = () => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);

  const categories = [
    { label: 'Intelligence', items: ['Show unfinished songs', 'Open latest artwork', 'Continue yesterday'], icon: Sparkles },
    { label: 'Workspaces', items: ['Switch to Nova Records', 'Enterprise Dashboard', 'Studio Alpha Stems'], icon: Layout },
    { label: 'Worldwide Discovery', items: ['Top Producers in Berlin', 'Trending in Tokyo', 'Latin American Samples'], icon: Globe },
    { label: 'Global Marketplace', items: ['Featured Analog Synth', 'Regional Licenses', 'Global Distribution'], icon: Music },
  ];

  return (
    <div className="relative w-full max-w-xl">
      <div className={`relative flex items-center bg-white/5 border rounded-[20px] transition-all duration-500 ${
        isFocused ? 'border-indigo-500/50 shadow-[0_32px_64px_-16px_rgba(99,102,241,0.2)] ring-4 ring-indigo-500/5 bg-[#0F1116]' : 'border-white/5'
      }`}>
        <div className="pl-5 text-slate-500">
          <Search size={20} />
        </div>
        <input 
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
          placeholder="Search projects, ecosystem, or AI commands..."
          className="w-full bg-transparent border-none outline-none py-5 px-4 text-sm text-white placeholder:text-slate-600 font-bold tracking-tight"
        />
        <div className="pr-5 flex items-center gap-3">
           <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-500 bg-white/5 px-2.5 py-1.5 rounded-lg border border-white/5">
              <Command size={10} />
              <span>K</span>
           </div>
           <Sparkles size={18} className={`transition-colors duration-500 ${isFocused ? 'text-indigo-500' : 'text-slate-700'}`} />
        </div>
      </div>

      <AnimatePresence>
        {isFocused && (
          <motion.div
            initial={{ opacity: 0, y: 15, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.98 }}
            transition={transitions.spring}
            className="absolute top-full left-0 right-0 mt-3 bg-[#0F1116] border border-white/5 rounded-[24px] shadow-[0_48px_96px_-24px_rgba(0,0,0,0.8)] z-[100] overflow-hidden backdrop-blur-3xl"
          >
            <div className="p-3 max-h-[480px] overflow-y-auto no-scrollbar">
              {categories.map((cat, catIdx) => (
                <div key={catIdx} className="mb-4 last:mb-0">
                  <div className="px-4 py-2 flex items-center gap-2">
                    <cat.icon size={12} className="text-slate-600" />
                    <h6 className="text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]">{cat.label}</h6>
                  </div>
                  <div className="space-y-1">
                    {cat.items.map((item, index) => (
                      <div 
                        key={index}
                        className="group flex items-center justify-between p-4 rounded-[18px] hover:bg-white/5 cursor-pointer transition-all active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all shadow-sm">
                            <Sparkles size={16} />
                          </div>
                          <span className="text-sm font-bold text-slate-300 group-hover:text-white transition-colors">{item}</span>
                        </div>
                        <ArrowRight size={16} className="text-slate-700 group-hover:text-slate-400 transition-colors" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            
            <div className="p-4 bg-white/[0.02] border-t border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-4 text-[10px] font-black text-slate-600 uppercase tracking-widest">
                <span>↑↓ Navigate</span>
                <span>↵ Select</span>
              </div>
              <div className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">
                Phoenix Intelligence v2.4
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
