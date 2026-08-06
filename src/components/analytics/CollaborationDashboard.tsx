// CollaborationDashboard.tsx - Network Analytics, Active Projects & Collaborators
import React from 'react';
import { Handshake, FolderGit2, CheckCircle2, Mail, Users, ShieldCheck, ArrowRight } from 'lucide-react';

export const CollaborationDashboard: React.FC = () => {
  const collabStats = [
    { label: 'Active DAW Projects', value: '14 Active', change: 'Realtime WebSocket Sync', icon: FolderGit2, color: 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30' },
    { label: 'Completed Projects', value: '23 Finalized', change: 'Lossless Masters', icon: CheckCircle2, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30' },
    { label: 'Pending Invitations', value: '4 Studio Invites', change: 'Action Required', icon: Mail, color: 'text-amber-400 bg-amber-500/10 border-amber-500/30' },
    { label: 'Verified Network', value: '37 Producers', change: 'London, Tokyo, NYC', icon: Users, color: 'text-purple-400 bg-purple-500/10 border-purple-500/30' },
  ];

  const topCollaborators = [
    { name: 'Kaito Beats', role: 'Cyberpunk Producer', projects: 12, streams: '2.1M', avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop' },
    { name: 'Modular Lab', role: 'Synth Architect', projects: 8, streams: '1.4M', avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop' },
    { name: 'London Soho Studio', role: 'Vocal Studio', projects: 5, streams: '890K', avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?q=80&w=200&auto=format&fit=crop' },
  ];

  return (
    <div className="space-y-6 font-sans text-xs select-none">
      {/* 4 Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {collabStats.map((cs, idx) => {
          const Icon = cs.icon;
          return (
            <div key={idx} className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 font-bold">{cs.label}</span>
                <div className={`p-2 rounded-xl border ${cs.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="text-2xl font-black text-white font-mono">{cs.value}</div>
              <p className="text-[10px] text-purple-400 font-bold">{cs.change}</p>
            </div>
          );
        })}
      </div>

      {/* Top Network Partners */}
      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-xl space-y-4">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <h3 className="font-extrabold text-white text-sm">Top Studio Collaborators</h3>
          <Handshake className="w-4 h-4 text-cyan-400" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {topCollaborators.map((c, idx) => (
            <div key={idx} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
              <div className="flex items-center gap-3">
                <img src={c.avatar} alt={c.name} className="w-10 h-10 rounded-full object-cover border border-slate-700" />
                <div>
                  <h4 className="font-extrabold text-white text-xs flex items-center gap-1">
                    <span>{c.name}</span>
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                  </h4>
                  <p className="text-[10px] text-purple-400 font-bold">{c.role}</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-800/80 text-[10px]">
                <span className="text-slate-400">{c.projects} Co-Projects</span>
                <span className="font-mono text-cyan-400 font-bold">{c.streams} Streams</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default CollaborationDashboard;
