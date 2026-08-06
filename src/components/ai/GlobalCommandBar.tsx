// GlobalCommandBar.tsx - CTRL + SPACE Global AI Command Bar & Modal
import React, { useState, useEffect, useRef } from 'react';
import { 
  Sparkles, 
  Search, 
  Zap, 
  X, 
  Music, 
  FileText, 
  Disc, 
  ImageIcon, 
  Users, 
  Radio, 
  Calendar, 
  TrendingUp, 
  Globe, 
  Scale, 
  ListPlus,
  ArrowRight,
  Command,
  Mic,
  MicOff
} from 'lucide-react';

export const GlobalCommandBar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keyboard Shortcut Event Listener: CTRL + SPACE
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const presetCommands = [
    { title: 'Create new project', category: 'Music', icon: Music, command: 'Create new Cyberpunk project in F Minor' },
    { title: 'Generate lyrics', category: 'Lyrics', icon: FileText, command: 'Generate Verse & Chorus lyrics for "Midnight Echoes"' },
    { title: 'Master this song', category: 'Mastering', icon: Disc, command: 'Apply SSL Fusion AI Master to active track' },
    { title: 'Create album cover', category: 'Cover Art', icon: ImageIcon, command: 'Generate 4K Sci-Fi Album Cover Art' },
    { title: 'Find producer', category: 'Community', icon: Users, command: 'Find verified Synthwave producers in London' },
    { title: 'Publish song', category: 'Publishing', icon: Radio, command: 'Publish active track to Spotify & Apple Music' },
    { title: 'Schedule release', category: 'Marketing', icon: Calendar, command: 'Schedule release campaign for Friday 16:00 UTC' },
    { title: 'Create marketing campaign', category: 'Marketing', icon: TrendingUp, command: 'Generate 14-day Instagram Reel promo campaign' },
    { title: 'Generate social posts', category: 'Marketing', icon: TrendingUp, command: 'Create 5 Twitter/X teasers for new release' },
    { title: 'Analyze audience', category: 'Analytics', icon: Globe, command: 'Generate audience demographic retention report' },
    { title: 'Suggest collaborations', category: 'Network', icon: Users, command: 'Recommend top 3 collaborator matches' },
    { title: 'Translate lyrics', category: 'Lyrics', icon: Globe, command: 'Translate active song lyrics to Japanese' },
    { title: 'Create playlist', category: 'Publishing', icon: ListPlus, command: 'Generate Sonara Selects Spotify Playlist' },
    { title: 'Generate contracts', category: 'Legal', icon: Scale, command: 'Generate 50/50 Producer Split Sheet Contract' },
  ];

  const filteredCommands = query.trim()
    ? presetCommands.filter(c => c.title.toLowerCase().includes(query.toLowerCase()) || c.category.toLowerCase().includes(query.toLowerCase()))
    : presetCommands;

  const executeCommand = (cmdText: string) => {
    alert(`Executing AI Command: "${cmdText}"`);
    setIsOpen(false);
    setQuery('');
  };

  const toggleVoiceMode = () => {
    setIsVoiceListening(prev => !prev);
  };

  if (!isOpen) {
    return (
      <div 
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-6 z-40 hidden md:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-purple-500/30 text-slate-300 font-mono text-xs shadow-2xl backdrop-blur-md hover:border-purple-500 cursor-pointer transition-all hover:scale-105 select-none"
      >
        <Sparkles className="w-3.5 h-3.5 text-purple-400" />
        <span>Press</span>
        <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-purple-300 font-bold text-[10px]">CTRL + SPACE</kbd>
        <span>for AI Command</span>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-lg flex items-start justify-center pt-20 px-4 font-sans text-xs select-none animate-fadeIn">
      <div className="w-full max-w-2xl bg-slate-900 border border-purple-500/40 rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Top Search Input Header */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3 bg-slate-950">
          <Sparkles className="w-5 h-5 text-purple-400 animate-pulse shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type an AI command or press voice button... (e.g., 'Master this song')"
            className="flex-1 bg-transparent text-white font-medium placeholder-slate-500 focus:outline-none text-sm"
          />

          {/* Voice Mode Toggle Button */}
          <button
            onClick={toggleVoiceMode}
            className={`p-2 rounded-xl border transition-all ${
              isVoiceListening 
                ? 'bg-rose-500/20 border-rose-500 text-rose-400 animate-pulse' 
                : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
            }`}
            title="Realtime Voice Conversation (Hands-Free)"
          >
            {isVoiceListening ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </button>

          <button
            onClick={() => setIsOpen(false)}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Realtime Voice Banner */}
        {isVoiceListening && (
          <div className="px-4 py-2 bg-rose-950/30 border-b border-rose-500/30 text-rose-300 font-mono text-[11px] flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
              Realtime Hands-Free Voice Mode Active — Speak your command...
            </span>
            <button onClick={() => executeCommand('Voice: Create new Cyberpunk project')} className="underline font-bold">
              Simulate Voice Input
            </button>
          </div>
        )}

        {/* Command List Grid */}
        <div className="max-h-96 overflow-y-auto custom-scrollbar p-3 space-y-1.5">
          {filteredCommands.map((cmd, idx) => {
            const Icon = cmd.icon;
            return (
              <div
                key={idx}
                onClick={() => executeCommand(cmd.command)}
                className="p-3 rounded-xl bg-slate-950/60 hover:bg-slate-800/80 border border-slate-800/80 hover:border-purple-500/50 flex items-center justify-between gap-3 cursor-pointer transition-all group"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-purple-400 group-hover:text-purple-300">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-white text-xs group-hover:text-purple-200 transition-colors">
                      {cmd.title}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-mono">{cmd.command}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded font-mono text-[9px] bg-purple-500/10 text-purple-300 border border-purple-500/30">
                    {cmd.category}
                  </span>
                  <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition-colors" />
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Shortcut Guide */}
        <div className="p-3 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-[10px] text-slate-500 font-mono">
          <span>Navigation: <kbd className="text-slate-400 font-bold">↑ ↓</kbd> to select, <kbd className="text-slate-400 font-bold">ENTER</kbd> to execute</span>
          <span className="text-purple-400 font-bold">Sonara AI Command Center OS</span>
        </div>
      </div>
    </div>
  );
};

export default GlobalCommandBar;
