// OverviewDashboard.tsx - High-Impact Overview Cards, Charts & Activity Feed
import React from 'react';
import { 
  Users, 
  Radio, 
  Play, 
  TrendingUp, 
  Disc, 
  FolderGit2, 
  ShoppingBag, 
  Handshake, 
  Sparkles, 
  ArrowUpRight,
  ArrowDownRight,
  DollarSign
} from 'lucide-react';

export const OverviewDashboard: React.FC = () => {
  const metrics = [
    { label: 'Followers', value: '48.2K', change: '+12.4%', isPos: true, icon: Users, color: 'text-purple-400' },
    { label: 'Monthly Listeners', value: '380.5K', change: '+18.2%', isPos: true, icon: Radio, color: 'text-cyan-400' },
    { label: 'Daily Streams', value: '42.1K', change: '+8.9%', isPos: true, icon: Play, color: 'text-emerald-400' },
    { label: 'Weekly Streams', value: '294.8K', change: '+14.1%', isPos: true, icon: TrendingUp, color: 'text-blue-400' },
    { label: 'Monthly Streams', value: '1.24M', change: '+22.0%', isPos: true, icon: Disc, color: 'text-pink-400' },
    { label: 'Songs Published', value: '28 Tracks', change: '+3 this mo', isPos: true, icon: Disc, color: 'text-amber-400' },
    { label: 'DAW Projects', value: '14 Active', change: '+2 new', isPos: true, icon: FolderGit2, color: 'text-indigo-400' },
    { label: 'Marketplace Sales', value: '$8,420', change: '+31.5%', isPos: true, icon: ShoppingBag, color: 'text-emerald-400' },
    { label: 'Collaborations', value: '37 Network', change: '+5 verified', isPos: true, icon: Handshake, color: 'text-cyan-400' },
    { label: 'AI Usage Time', value: '142 Hours', change: '+18h', isPos: true, icon: Sparkles, color: 'text-purple-400' },
  ];

  const recentActivity = [
    { title: 'New Stream Milestone', desc: '"Midnight Echoes" passed 1,400,000 streams', time: '12m ago', tag: 'Streaming', color: 'text-cyan-400 bg-cyan-500/10' },
    { title: 'Marketplace Sale', desc: 'Cyberpunk Vocal Chops purchased by @m_vance', time: '34m ago', tag: 'Marketplace', color: 'text-emerald-400 bg-emerald-500/10' },
    { title: 'Collaboration Invite', desc: 'Modular Lab requested stem access for "Analog Heat"', time: '1h ago', tag: 'Network', color: 'text-purple-400 bg-purple-500/10' },
    { title: 'AI Master Completed', desc: 'SSL Fusion AI engine processed 48kHz WAV master', time: '3h ago', tag: 'AI Engine', color: 'text-amber-400 bg-amber-500/10' },
  ];

  return (
    <div className="space-y-6 font-sans text-xs select-none">
      {/* 10 Overview Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {metrics.map((m, idx) => {
          const Icon = m.icon;
          return (
            <div
              key={idx}
              className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all backdrop-blur-md shadow-xl flex flex-col justify-between gap-2"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400">{m.label}</span>
                <div className={`p-1.5 rounded-xl bg-slate-950 border border-slate-800 ${m.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
              </div>

              <div>
                <div className="text-lg font-black text-white font-mono tracking-tight">{m.value}</div>
                <div className="flex items-center gap-1 text-[10px] font-bold mt-0.5">
                  <span className={m.isPos ? 'text-emerald-400' : 'text-rose-400'}>{m.change}</span>
                  <span className="text-slate-500">vs last month</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Primary Streaming & Revenue Overview Chart Graphic */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-extrabold text-white text-sm">Streaming Performance & Revenue Trend</h3>
              <p className="text-slate-400 text-[11px]">Realtime aggregated data across Spotify, Apple Music & Sonara Platform</p>
            </div>
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="flex items-center gap-1 text-cyan-400 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-cyan-400" /> Streams
              </span>
              <span className="flex items-center gap-1 text-purple-400 font-bold">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-400" /> Revenue ($)
              </span>
            </div>
          </div>

          {/* Area / Line Wave Visualizer Chart */}
          <div className="w-full h-48 bg-slate-950 rounded-2xl border border-slate-800/80 p-4 relative flex items-end justify-between gap-2 overflow-hidden">
            {/* Background Grid Lines */}
            <div className="absolute inset-0 flex flex-col justify-between p-4 pointer-events-none opacity-20">
              <div className="border-b border-slate-700 w-full" />
              <div className="border-b border-slate-700 w-full" />
              <div className="border-b border-slate-700 w-full" />
            </div>

            {/* Bars/Points Mock Chart */}
            {[42, 58, 65, 52, 78, 89, 94, 82, 100, 112, 128, 145].map((val, idx) => (
              <div key={idx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end z-10 group">
                <div className="w-full bg-slate-900 rounded-t-lg relative flex items-end overflow-hidden" style={{ height: `${(val / 150) * 100}%` }}>
                  <div className="w-full bg-gradient-to-t from-purple-600/40 via-cyan-500/60 to-cyan-400 transition-all group-hover:brightness-125" style={{ height: '100%' }} />
                </div>
                <span className="text-[9px] font-mono text-slate-500">{['J','F','M','A','M','J','J','A','S','O','N','D'][idx]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Realtime Recent Activity Feed */}
        <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h3 className="font-extrabold text-white text-sm">Live Studio Activity</h3>
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          </div>

          <div className="space-y-3">
            {recentActivity.map((act, idx) => (
              <div key={idx} className="p-3 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white text-xs">{act.title}</span>
                  <span className="text-[10px] font-mono text-slate-500">{act.time}</span>
                </div>
                <p className="text-[11px] text-slate-400 leading-tight">{act.desc}</p>
                <div className="pt-1">
                  <span className={`px-2 py-0.5 rounded-md font-mono text-[9px] font-bold ${act.color}`}>
                    {act.tag}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OverviewDashboard;
