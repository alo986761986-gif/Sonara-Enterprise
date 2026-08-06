// StudioInspector.tsx - Right Side Inspector for Metadata, Permissions & Realtime Collaborators
import React from 'react';
import { 
  SlidersHorizontal, 
  ShieldCheck, 
  Users, 
  Clock, 
  Lock, 
  Globe, 
  Info, 
  Sparkles, 
  Music, 
  Radio, 
  CheckCircle2, 
  Share2 
} from 'lucide-react';

export interface StudioInspectorProps {
  projectInfo?: {
    name: string;
    bpm: number;
    key: string;
    sampleRate: string;
    visibility: string;
    created: string;
    collaborators: { name: string; role: string; avatar: string; status: string }[];
  };
}

export const StudioInspector: React.FC<StudioInspectorProps> = ({
  projectInfo = {
    name: 'Midnight Echoes (Deluxe LP)',
    bpm: 128,
    key: 'F Minor',
    sampleRate: '48 kHz / 24-bit',
    visibility: 'Collaborators Only',
    created: '2026-07-28',
    collaborators: [
      { name: 'Aria Sterling', role: 'Vocalist / Lead', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop', status: 'Editing Lead Vox' },
      { name: 'Kaito Beats', role: 'Synth Producer', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop', status: 'Mixing Sub-Bass' },
      { name: 'Modular Lab', role: 'Sound Designer', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop', status: 'Idle in Session' },
    ]
  }
}) => {
  return (
    <aside className="w-72 h-full bg-slate-950 border-l border-slate-800/80 flex flex-col font-sans text-xs select-none shrink-0 overflow-y-auto custom-scrollbar">
      {/* Top Header */}
      <div className="p-3 border-b border-slate-800/80 flex items-center justify-between bg-slate-900/60">
        <div className="flex items-center gap-1.5">
          <SlidersHorizontal className="w-4 h-4 text-purple-400" />
          <h3 className="font-extrabold text-white uppercase tracking-wider text-[11px]">Studio Inspector</h3>
        </div>
        <span className="px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/30 text-purple-300 font-mono text-[10px]">
          DAW v4.2
        </span>
      </div>

      {/* Project Metadata Section */}
      <div className="p-4 border-b border-slate-800/80 space-y-3">
        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Project Metadata</span>
        <div className="space-y-2 bg-slate-900/80 p-3 rounded-2xl border border-slate-800">
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Tempo (BPM)</span>
            <span className="font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded-md border border-cyan-500/20">
              {projectInfo.bpm} BPM
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Harmonic Key</span>
            <span className="font-mono font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
              {projectInfo.key}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Audio Resolution</span>
            <span className="font-mono font-bold text-slate-200">{projectInfo.sampleRate}</span>
          </div>
        </div>
      </div>

      {/* Permissions & Security */}
      <div className="p-4 border-b border-slate-800/80 space-y-3">
        <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Permissions & Rights</span>
        <div className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-300 font-bold flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-purple-400" />
              <span>{projectInfo.visibility}</span>
            </span>
            <button className="text-[10px] text-purple-400 font-bold hover:underline">Change</button>
          </div>
          <p className="text-[10px] text-slate-400 leading-snug">
            All stem exports automatically tagged with Sonara AI Cryptographic Rights Marker.
          </p>
        </div>
      </div>

      {/* Realtime Collaborators & Presence */}
      <div className="p-4 space-y-3 flex-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Active Collaborators</span>
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
        </div>

        <div className="space-y-2">
          {projectInfo.collaborators.map((c, idx) => (
            <div key={idx} className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800/80 space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <img src={c.avatar} alt={c.name} className="w-6 h-6 rounded-full object-cover border border-slate-700" />
                  <span className="font-bold text-white text-[11px]">{c.name}</span>
                </div>
                <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
              </div>
              <div className="flex items-center justify-between text-[10px] pt-1 border-t border-slate-800/60">
                <span className="text-purple-400 font-bold">{c.role}</span>
                <span className="text-emerald-400 font-mono">{c.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
};

export default StudioInspector;
