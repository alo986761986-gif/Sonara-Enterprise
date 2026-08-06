// SearchBar.tsx - Global Universal Search Input Component
import React, { useState } from 'react';
import { Search, X, MapPin, Sparkles } from 'lucide-react';
import { HoverEngine } from '../../lib/animation-system';
import { motion } from 'motion/react';

export interface SearchBarProps {
  value: string;
  onChange: (query: string) => void;
  onClear?: () => void;
  placeholder?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value,
  onChange,
  onClear,
  placeholder = 'Search creators, cities, genres, stems, studios...',
}) => {
  return (
    <div className="relative flex items-center w-full max-w-md">
      <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center gap-1">
        <Search className="w-4 h-4 text-purple-400" />
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-slate-900/90 border border-purple-500/30 rounded-xl pl-9 pr-8 py-2 text-xs font-medium text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent backdrop-blur-xl transition-all shadow-lg"
        aria-label="Search Worldwide Discovery"
      />
      {value && (
        <button
          onClick={() => {
            onChange('');
            if (onClear) onClear();
          }}
          className="absolute right-2 text-slate-400 hover:text-white p-1 rounded-md transition-colors focus:outline-none focus:ring-1 focus:ring-purple-400"
          aria-label="Clear Search"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
};
