// AIAgentManager.tsx - Multi-Agent System Engine & Collaboration Hub
import React, { useState } from 'react';
import { 
  Music, 
  TrendingUp, 
  BarChart3, 
  ShoppingBag, 
  UserCheck, 
  Users, 
  Scale, 
  Radio, 
  Sparkles, 
  Play, 
  Pause, 
  RefreshCw, 
  MessageSquare, 
  Layers, 
  CheckCircle2, 
  Zap,
  Activity,
  ArrowRight,
  ShieldCheck,
  Bot
} from 'lucide-react';

export interface AgentSpec {
  id: string;
  name: string;
  role: string;
  description: string;
  icon: React.ElementType;
  color: string;
  badgeBg: string;
  status: 'active' | 'idle' | 'collaborating' | 'thinking';
  currentTask: string;
  accuracy: string;
  completedTasks: number;
}

export const AGENT_LIST: AgentSpec[] = [
  {
    id: 'music-agent',
    name: 'Music Producer Agent',
    role: 'Composition & Arrangement',
    description: 'Generates chord progressions, sound design presets, melodies, and stem separation.',
    icon: Music,
    color: 'text-purple-400',
    badgeBg: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
    status: 'collaborating',
    currentTask: 'Synthesizing Synthwave Lead Stems for "Midnight Echoes"',
    accuracy: '99.4%',
    completedTasks: 142
  },
  {
    id: 'marketing-agent',
    name: 'Marketing Agent',
    role: 'Campaigns & Social Growth',
    description: 'Creates release schedules, TikTok/Instagram snippets, copy, and promotional strategies.',
    icon: TrendingUp,
    color: 'text-pink-400',
    badgeBg: 'bg-pink-500/10 border-pink-500/30 text-pink-300',
    status: 'active',
    currentTask: 'Drafting 14-day Instagram Reel promo queue',
    accuracy: '97.8%',
    completedTasks: 89
  },
  {
    id: 'analytics-agent',
    name: 'Analytics Agent',
    role: 'Data & Audience Intelligence',
    description: 'Monitors Spotify/Apple streams, geographic spikes, and listener retention curves.',
    icon: BarChart3,
    color: 'text-cyan-400',
    badgeBg: 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300',
    status: 'active',
    currentTask: 'Parsing London & Tokyo demographic stream trends',
    accuracy: '99.8%',
    completedTasks: 310
  },
  {
    id: 'marketplace-agent',
    name: 'Marketplace Agent',
    role: 'Sample Packs & Asset Monetization',
    description: 'Auto-tags WAV samples, sets optimal pricing, and formats preset packs for sale.',
    icon: ShoppingBag,
    color: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300',
    status: 'idle',
    currentTask: 'Ready for sample pack indexing',
    accuracy: '98.5%',
    completedTasks: 64
  },
  {
    id: 'creator-agent',
    name: 'Creator Agent',
    role: 'Identity & Career Trajectory',
    description: 'Manages producer bio, brand aesthetic, press kit assets, and goal milestones.',
    icon: UserCheck,
    color: 'text-amber-400',
    badgeBg: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
    status: 'active',
    currentTask: 'Updating electronic artist EPK PDF bundle',
    accuracy: '96.9%',
    completedTasks: 52
  },
  {
    id: 'community-agent',
    name: 'Community Agent',
    role: 'Fanbase & Discord Integration',
    description: 'Handles fan club subscriptions, Discord announcements, and community feedback.',
    icon: Users,
    color: 'text-blue-400',
    badgeBg: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
    status: 'idle',
    currentTask: 'Monitoring community Discord channel reactions',
    accuracy: '95.2%',
    completedTasks: 118
  },
  {
    id: 'legal-agent',
    name: 'Legal Agent',
    role: 'Licensing, Royalty Splits & Contracts',
    description: 'Generates smart legal contracts, master sync licenses, and split sheets.',
    icon: Scale,
    color: 'text-indigo-400',
    badgeBg: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300',
    status: 'collaborating',
    currentTask: 'Drafting 50/50 producer split sheet agreement',
    accuracy: '100%',
    completedTasks: 45
  },
  {
    id: 'publishing-agent',
    name: 'Publishing Agent',
    role: 'DSP Distribution & Metadata',
    description: 'Submits tracks to Spotify, Apple Music, Tidal, ISRC/UPC encoding, and PRO registration.',
    icon: Radio,
    color: 'text-teal-400',
    badgeBg: 'bg-teal-500/10 border-teal-500/30 text-teal-300',
    status: 'active',
    currentTask: 'Verifying ISRC codes for upcoming EP',
    accuracy: '99.9%',
    completedTasks: 78
  },
];

export const AIAgentManager: React.FC = () => {
  const [agents, setAgents] = useState<AgentSpec[]>(AGENT_LIST);
  const [selectedAgent, setSelectedAgent] = useState<AgentSpec>(AGENT_LIST[0]);
  const [isCollaborating, setIsCollaborating] = useState(false);
  const [collabLog, setCollabLog] = useState<string[]>([
    'Music Agent: Stems generated for "Midnight Echoes" (128 BPM, F Minor)',
    'Legal Agent: Generated automated 50/50 split contract with Modular Lab',
    'Marketing Agent: Generated 3 TikTok teaser captions matched to hook stems',
    'Publishing Agent: Staged distribution to Spotify & Apple Music'
  ]);
  const [promptInput, setPromptInput] = useState('');

  const triggerCollaboration = () => {
    setIsCollaborating(true);
    setTimeout(() => {
      setCollabLog(prev => [
        ...prev,
        `Multi-Agent Synergy Executed: Music, Legal & Marketing agents aligned project release targets.`
      ]);
      setIsCollaborating(false);
    }, 1500);
  };

  const sendAgentCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) return;
    setCollabLog(prev => [
      ...prev,
      `User Directive to ${selectedAgent.name}: "${promptInput}"`,
      `${selectedAgent.name}: Processing request using Sonara Neural Memory...`
    ]);
    setPromptInput('');
  };

  return (
    <div className="space-y-6 font-sans text-xs select-none">
      {/* Top Header Banner */}
      <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 border border-indigo-500/30 backdrop-blur-md shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-indigo-600/20 border border-indigo-500/40 text-indigo-400 shadow-lg">
            <Bot className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white tracking-wide">Multi-Agent Intelligence Network</h2>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono text-[10px] font-bold">
                8 Autonomous Agents Active
              </span>
            </div>
            <p className="text-slate-400 text-[11px] mt-0.5">
              Autonomous AI agents operating synchronously to execute composition, publishing, legal, marketing, and monetization workflows.
            </p>
          </div>
        </div>

        <button
          onClick={triggerCollaboration}
          disabled={isCollaborating}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black flex items-center gap-2 shadow-lg transition-all active:scale-95 shrink-0"
        >
          <Sparkles className={`w-4 h-4 ${isCollaborating ? 'animate-spin' : ''}`} />
          <span>{isCollaborating ? 'Agent Team Collaborating...' : 'Trigger Team Collaboration Session'}</span>
        </button>
      </div>

      {/* Main Grid: Agent Cards & Live Collaboration Terminal */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Agent Cards (2 cols on large screen) */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {agents.map((agent) => {
            const Icon = agent.icon;
            const isSelected = selectedAgent.id === agent.id;
            return (
              <div
                key={agent.id}
                onClick={() => setSelectedAgent(agent)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer backdrop-blur-md flex flex-col justify-between gap-3 ${
                  isSelected 
                    ? 'bg-slate-900 border-indigo-500 shadow-xl shadow-indigo-500/10 ring-1 ring-indigo-500/50' 
                    : 'bg-slate-900/80 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2.5 rounded-xl bg-slate-950 border border-slate-800 ${agent.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h3 className="font-extrabold text-white text-xs">{agent.name}</h3>
                      <p className="text-[10px] text-slate-400 font-medium">{agent.role}</p>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-full font-mono text-[9px] font-bold border ${agent.badgeBg}`}>
                    {agent.status.toUpperCase()}
                  </span>
                </div>

                <p className="text-slate-300 text-[11px] leading-relaxed line-clamp-2">
                  {agent.description}
                </p>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 font-mono">
                  <span className="truncate max-w-[180px]">Task: {agent.currentTask}</span>
                  <span className="text-emerald-400 font-bold">{agent.completedTasks} done</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Agent Control Console & Collaboration Log */}
        <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 backdrop-blur-md shadow-xl flex flex-col justify-between gap-4">
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className={`p-2 rounded-xl bg-slate-950 border border-slate-800 ${selectedAgent.color}`}>
                  <selectedAgent.icon className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-extrabold text-white text-xs">{selectedAgent.name}</h3>
                  <span className="text-[10px] text-slate-400 font-mono">Accuracy: {selectedAgent.accuracy}</span>
                </div>
              </div>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
            </div>

            {/* Direct Command Input */}
            <form onSubmit={sendAgentCommand} className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Direct Command Directive
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder={`Assign custom task to ${selectedAgent.name}...`}
                  className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 text-xs"
                />
                <button
                  type="submit"
                  className="px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold flex items-center justify-center shrink-0"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </form>

            {/* Realtime Agent Synergy Terminal */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                <span>Multi-Agent Live Synergy Feed</span>
                <span className="text-cyan-400 font-mono">WEBSOCKET LIVE</span>
              </div>

              <div className="h-56 bg-slate-950 rounded-xl border border-slate-800 p-3 overflow-y-auto custom-scrollbar font-mono text-[10px] space-y-2">
                {collabLog.map((log, idx) => (
                  <div key={idx} className="p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 text-slate-300 leading-snug">
                    <span className="text-indigo-400 font-bold">[SYNC] </span>
                    {log}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 flex items-center justify-between text-[10px]">
            <span className="text-slate-400">Agent Memory Synchronization</span>
            <span className="text-emerald-400 font-bold flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> 100% In-Sync
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AIAgentManager;
