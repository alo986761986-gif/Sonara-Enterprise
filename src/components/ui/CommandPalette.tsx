import React, { useState, useEffect } from 'react';
import { Search, Command } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start justify-center pt-20">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-lg p-4">
        <div className="flex items-center gap-3 border-b pb-3">
          <Search size={20} className="text-slate-400" />
          <input 
            autoFocus
            className="flex-1 outline-none text-lg"
            placeholder="Search everything..."
          />
          <kbd className="bg-slate-100 px-2 py-1 rounded text-xs text-slate-500">ESC</kbd>
        </div>
        <div className="mt-2 space-y-1">
          <button className="w-full text-left p-2 hover:bg-slate-100 rounded">Create Project</button>
          <button className="w-full text-left p-2 hover:bg-slate-100 rounded">Generate Song</button>
        </div>
      </div>
    </div>
  );
};
