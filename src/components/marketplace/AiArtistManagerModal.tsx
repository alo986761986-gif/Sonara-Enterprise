import React, { useState } from 'react';
import { 
  Crown, 
  Sparkles, 
  Calendar, 
  FileText, 
  Users, 
  TrendingUp, 
  X, 
  CheckCircle2, 
  Activity,
  Award
} from 'lucide-react';

interface AiArtistManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiArtistManagerModal: React.FC<AiArtistManagerModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'profile' | 'calendar' | 'social' | 'press' | 'recommendations'>('dashboard');
  const [artistName, setArtistName] = useState('Sonara AI Creator');
  const [bio, setBio] = useState('Pioneering the future of AI-assisted electronic and cinematic music composition.');
  const [goals, setGoals] = useState([
    { id: 1, title: 'Release Neon Odyssey Deluxe Album', progress: '100%', status: 'Completed' },
    { id: 2, title: 'Reach 50k Monthly Listeners on Spotify', progress: '85%', status: 'In Progress' }
  ]);
  const [recommendations, setRecommendations] = useState([
    { id: 1, text: 'Optimal release day for next single: Friday at 00:00 UTC for playlist placement.' },
    { id: 2, text: 'Trending genre convergence: Cyberpunk Synthwave + Phonk elements.' }
  ]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none font-sans">
      <div className="bg-[#0b1021] border border-cyan-500/30 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900/90 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <Crown size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">AI Artist Manager (Version 2.3)</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono font-bold">PERSONAL DIGITAL MANAGER</span>
              </div>
              <p className="text-xs text-slate-400">Career Overview, Growth Analytics, Release Calendar, Social Media AI Generator & Press Kit Studio</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Sub-Tabs */}
        <div className="px-6 py-3 bg-slate-900/50 border-b border-slate-800 flex items-center gap-2 shrink-0">
          {[
            { id: 'dashboard', label: 'Dashboard' },
            { id: 'profile', label: 'Artist Profile' },
            { id: 'calendar', label: 'Release Calendar' },
            { id: 'social', label: 'Social Media AI' },
            { id: 'press', label: 'Press Kit Generator' },
            { id: 'recommendations', label: 'AI Recommendations' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === tab.id ? 'bg-amber-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-300">
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 space-y-4">
                <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                  <h3 className="text-sm font-black text-white">Career Growth & Milestones</h3>
                  <div className="grid grid-cols-3 gap-3 font-mono">
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="text-slate-400 text-[10px]">Monthly Listeners</div>
                      <div className="text-xl font-black text-emerald-400">48,290</div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="text-slate-400 text-[10px]">Active Releases</div>
                      <div className="text-xl font-black text-cyan-400">12 Works</div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="text-slate-400 text-[10px]">Fan Engagement</div>
                      <div className="text-xl font-black text-amber-400">+24.5%</div>
                    </div>
                  </div>
                </div>

                <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <h3 className="text-sm font-black text-white">Current Career Goals</h3>
                  <div className="space-y-2">
                    {goals.map(g => (
                      <div key={g.id} className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 flex justify-between items-center font-mono text-xs">
                        <span className="text-white font-bold">{g.title}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-cyan-400">{g.progress}</span>
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px]">{g.status}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="col-span-1 space-y-4">
                <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <h3 className="text-sm font-black text-white">AI Manager Insight</h3>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-[11px] text-amber-300">
                    <Sparkles size={16} className="text-amber-400" />
                    <p>Your latest cyberpunk single is gaining major traction in Tokyo and Berlin. Recommend scheduling a remix EP next month.</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <h3 className="text-sm font-black text-white">Artist Profile & Press Information</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Artist / Stage Name</label>
                    <input 
                      type="text" 
                      value={artistName}
                      onChange={(e) => setArtistName(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-white" 
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Primary Genre</label>
                    <input 
                      type="text" 
                      value="Cyberpunk Synthwave & Cinematic"
                      disabled
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-400" 
                    />
                  </div>
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">Official Biography</label>
                  <textarea 
                    rows={4}
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono text-xs resize-none"
                  />
                </div>
              </div>
            </div>
          )}

          {activeTab === 'calendar' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <h3 className="text-sm font-black text-white">Release Calendar & Marketing Deadlines</h3>
              <div className="space-y-2 font-mono text-xs">
                {[
                  { date: 'Aug 15, 2026', event: 'Neon Odyssey Deluxe — DSP Distribution Lock', status: 'Scheduled' },
                  { date: 'Aug 22, 2026', event: 'Social Media Pre-save Campaign Launch', status: 'Pending' },
                  { date: 'Sep 05, 2026', event: 'Official Music Video & Visualizer Premiere', status: 'Planning' },
                ].map((c, i) => (
                  <div key={i} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-amber-400">{c.date}</div>
                      <div className="text-white mt-0.5">{c.event}</div>
                    </div>
                    <span className="px-2.5 py-1 rounded bg-amber-500/20 text-amber-300 font-bold text-[10px]">{c.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'social' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <Sparkles size={16} className="text-amber-400" /> AI Social Media Caption Generator
                </h3>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-amber-200 leading-relaxed space-y-2">
                  <p>"The future is electric. ⚡ Neon Odyssey is officially out everywhere. Step into the cyberpunk grid and let the analog synths take over. Link in bio. 🎧 #Synthwave #Cyberpunk #SonaraAI"</p>
                </div>
                <button className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors">Generate New Cross-Platform Caption</button>
              </div>
            </div>
          )}

          {activeTab === 'press' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <h3 className="text-sm font-black text-white">Electronic Press Kit (EPK) Generator</h3>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                  <div className="font-bold text-white text-xs">Complete Press Kit Package (.zip)</div>
                  <div className="text-[10px] text-slate-400">Includes short bio, long bio, high-res press photos, and release one-sheet.</div>
                  <button className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white font-bold transition-colors">Download EPK Package</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'recommendations' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <h3 className="text-sm font-black text-white">AI Manager Actionable Recommendations</h3>
              <div className="space-y-3">
                {recommendations.map(r => (
                  <div key={r.id} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex items-start gap-3">
                    <Sparkles size={16} className="text-amber-400 shrink-0 mt-0.5" />
                    <span className="text-white text-xs">{r.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AiArtistManagerModal;
