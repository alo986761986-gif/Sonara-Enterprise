// DomainAssistants.tsx - Modular AI Context Assistants for Workspace, Projects, Analytics, Marketplace & Creators
import React, { useState } from 'react';
import { 
  FolderGit2, 
  BarChart3, 
  ShoppingBag, 
  UserCheck, 
  Music, 
  Sparkles, 
  Send, 
  Bot, 
  Zap, 
  CheckCircle2, 
  TrendingUp, 
  Disc,
  BrainCircuit,
  Wand2
} from 'lucide-react';

// Common Assistant Shell Wrapper Component
export interface DomainAssistantProps {
  title: string;
  subtitle: string;
  icon: React.ElementType;
  color: string;
  suggestions: string[];
}

export const DomainAssistantShell: React.FC<DomainAssistantProps> = ({
  title,
  subtitle,
  icon: Icon,
  color,
  suggestions
}) => {
  const [messages, setMessages] = useState<Array<{ sender: 'ai' | 'user'; text: string }>>([
    { sender: 'ai', text: `Hello! I am your ${title}. How can I optimize your current session?` }
  ]);
  const [input, setInput] = useState('');

  const handleSend = (textToSend?: string) => {
    const msg = textToSend || input;
    if (!msg.trim()) return;

    setMessages(prev => [...prev, { sender: 'user', text: msg }]);
    if (!textToSend) setInput('');

    setTimeout(() => {
      setMessages(prev => [
        ...prev,
        { sender: 'ai', text: `Analyzing request for "${msg}". Executing intelligent recommendations...` }
      ]);
    }, 800);
  };

  return (
    <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 backdrop-blur-md shadow-xl space-y-4 font-sans text-xs select-none">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className={`p-2.5 rounded-xl bg-slate-950 border border-slate-800 ${color}`}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-extrabold text-white text-sm">{title}</h3>
            <p className="text-[10px] text-slate-400 font-mono">{subtitle}</p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[9px] font-bold">
          CONTEXT ACTIVE
        </span>
      </div>

      {/* Suggested Quick Prompts */}
      <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar py-1">
        {suggestions.map((sug, idx) => (
          <button
            key={idx}
            onClick={() => handleSend(sug)}
            className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 font-medium text-[11px] whitespace-nowrap transition-colors flex items-center gap-1 shrink-0"
          >
            <Sparkles className="w-3 h-3 text-purple-400" />
            <span>{sug}</span>
          </button>
        ))}
      </div>

      {/* Message Chat History Log */}
      <div className="h-44 bg-slate-950 rounded-xl border border-slate-800/80 p-3 overflow-y-auto custom-scrollbar space-y-2">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`p-2.5 rounded-xl max-w-[85%] text-[11px] font-sans leading-relaxed ${
              m.sender === 'user'
                ? 'ml-auto bg-indigo-600 text-white font-medium'
                : 'mr-auto bg-slate-900 text-slate-200 border border-slate-800'
            }`}
          >
            {m.text}
          </div>
        ))}
      </div>

      {/* Input Box */}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder={`Ask ${title}...`}
          className="flex-1 px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs"
        />
        <button
          onClick={() => handleSend()}
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center shrink-0"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

// 1. AI Workspace Assistant
export const AIWorkspaceAssistant: React.FC = () => (
  <DomainAssistantShell
    title="AI Workspace Assistant"
    subtitle="DAW Stems, Audio Routing & Realtime Collaboration"
    icon={FolderGit2}
    color="text-indigo-400"
    suggestions={[
      'Separate vocal stems from instrumentals',
      'Optimize DAW buffer latency',
      'Auto-tune lead vocal track',
      'Export 24-bit 48kHz WAV master'
    ]}
  />
);

// 2. AI Project Assistant
export const AIProjectAssistant: React.FC = () => (
  <DomainAssistantShell
    title="AI Project Assistant"
    subtitle="Song Structure, Arrangement & Production Memory"
    icon={Music}
    color="text-purple-400"
    suggestions={[
      'Suggest bridge chord progression',
      'Generate lyrics for Verse 2',
      'Arrange 128 BPM Synthwave intro',
      'Summarize project creative goals'
    ]}
  />
);

// 3. AI Analytics Assistant
export const AIAnalyticsAssistant: React.FC = () => (
  <DomainAssistantShell
    title="AI Analytics Assistant"
    subtitle="Streams, Audience Demographics & Revenue Forecasting"
    icon={BarChart3}
    color="text-cyan-400"
    suggestions={[
      'Analyze Spotify monthly listener growth',
      'Forecast 30-day revenue trajectory',
      'Identify top active listener cities',
      'Compare stream retention curves'
    ]}
  />
);

// 4. AI Marketplace Assistant
export const AIMarketplaceAssistant: React.FC = () => (
  <DomainAssistantShell
    title="AI Marketplace Assistant"
    subtitle="Sample Packs, Preset Bundles & Asset Pricing"
    icon={ShoppingBag}
    color="text-emerald-400"
    suggestions={[
      'Package current stems into sample pack',
      'Set optimal asset price',
      'Generate sample pack cover art',
      'Tag WAV files with genre metadata'
    ]}
  />
);

// 5. AI Creator Assistant
export const AICreatorAssistant: React.FC = () => (
  <DomainAssistantShell
    title="AI Creator Assistant"
    subtitle="Artist Brand Identity, Press Kits & Career Strategy"
    icon={UserCheck}
    color="text-amber-400"
    suggestions={[
      'Generate artist bio & EPK bundle',
      'Recommend producer collaborations',
      'Create 14-day release schedule',
      'Draft record label pitch email'
    ]}
  />
);
