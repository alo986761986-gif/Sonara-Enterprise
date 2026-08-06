import React, { useState } from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign, 
  Globe, 
  ShieldCheck, 
  Download, 
  X, 
  CheckCircle2, 
  Activity,
  Award,
  PieChart
} from 'lucide-react';

interface EnterpriseBiModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const EnterpriseBiModal: React.FC<EnterpriseBiModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'ceo' | 'financial' | 'forecast' | 'market' | 'realtime' | 'export'>('ceo');
  const [exportFormat, setExportFormat] = useState('PDF Report (Executive Summary)');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none font-sans">
      <div className="bg-[#0b1021] border border-cyan-500/30 rounded-2xl w-full max-w-6xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900/90 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400">
              <BarChart3 size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">Enterprise Business Intelligence Center (Version 2.4)</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-bold">EXECUTIVE SUITE</span>
              </div>
              <p className="text-xs text-slate-400">CEO Dashboard, Global KPIs, Financial Ledgers, AI Revenue Forecasts & Realtime Monitoring</p>
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
            { id: 'ceo', label: 'CEO Dashboard' },
            { id: 'financial', label: 'Financial KPIs' },
            { id: 'forecast', label: 'AI Revenue Forecast' },
            { id: 'market', label: 'Market Intelligence' },
            { id: 'realtime', label: 'Realtime Monitoring' },
            { id: 'export', label: 'Executive Export' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === tab.id ? 'bg-cyan-600 text-white shadow-md' : 'text-slate-400 hover:text-white hover:bg-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-300">
          {activeTab === 'ceo' && (
            <div className="grid grid-cols-3 gap-6">
              <div className="col-span-2 space-y-4">
                <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                  <h3 className="text-sm font-black text-white">Global Enterprise KPIs & Performance</h3>
                  <div className="grid grid-cols-3 gap-3 font-mono">
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="text-slate-400 text-[10px]">Total Annual Revenue</div>
                      <div className="text-xl font-black text-emerald-400">$1,482,910</div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="text-slate-400 text-[10px]">Total Published Releases</div>
                      <div className="text-xl font-black text-cyan-400">1,248 Works</div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                      <div className="text-slate-400 text-[10px]">Active Creators & Labels</div>
                      <div className="text-xl font-black text-purple-400">482 Teams</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-1 space-y-4">
                <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                  <h3 className="text-sm font-black text-white">Security & Encryption</h3>
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1 font-mono text-[11px]">
                    <div className="text-emerald-400 font-bold">✓ Financial Data Encrypted</div>
                    <div className="text-slate-400 text-[10px]">Role-Based Executive Access</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'financial' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <h3 className="text-sm font-black text-white">Financial & Royalty Ledger Breakdown</h3>
              <div className="space-y-2 font-mono text-xs">
                {[
                  { stream: 'Global DSP Streaming Royalties', amount: '$840,210.00', growth: '+34.2%' },
                  { stream: 'Marketplace Asset Sales', amount: '$310,400.00', growth: '+18.5%' },
                  { stream: 'Commercial Sync & Licensing', amount: '$215,800.00', growth: '+42.1%' },
                  { stream: 'Enterprise Label Subscriptions', amount: '$116,500.00', growth: '+12.8%' },
                ].map((f, i) => (
                  <div key={i} className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 flex justify-between items-center">
                    <div>
                      <div className="font-bold text-white">{f.stream}</div>
                      <div className="text-[10px] text-emerald-400 mt-0.5">YoY Growth: {f.growth}</div>
                    </div>
                    <span className="text-sm font-black text-white">{f.amount}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'forecast' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                  <TrendingUp size={16} className="text-cyan-400" /> AI Revenue & Growth Predictions (Next 12 Months)
                </h3>
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-cyan-200 space-y-2">
                  <p>• Projected Annualized Revenue: $2,450,000 (+65% growth trajectory)</p>
                  <p>• Predicted Marketplace Asset Turnover: 18,400 units</p>
                  <p>• Audience Expansion Index: High demand in Tokyo, Berlin, and Los Angeles.</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'market' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <h3 className="text-sm font-black text-white">Global Market Intelligence & Trends</h3>
              <div className="grid grid-cols-2 gap-4 font-mono text-xs">
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <div className="text-cyan-400 font-bold">Trending Genres</div>
                  <div className="text-white">1. Cyberpunk Synthwave<br/>2. Cinematic Orchestral<br/>3. Ambient Phonk</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
                  <div className="text-emerald-400 font-bold">Top Streaming Regions</div>
                  <div className="text-white">1. North America (42%)<br/>2. Europe & UK (35%)<br/>3. Asia-Pacific (23%)</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'realtime' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <h3 className="text-sm font-black text-white">Realtime Infrastructure Monitoring</h3>
              <div className="grid grid-cols-3 gap-3 font-mono text-xs">
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                  <div className="text-slate-400 text-[10px]">Active Users Online</div>
                  <div className="text-xl font-black text-emerald-400">14,290</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                  <div className="text-slate-400 text-[10px]">Active DAW Projects</div>
                  <div className="text-xl font-black text-cyan-400">3,842</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
                  <div className="text-slate-400 text-[10px]">Distribution Jobs</div>
                  <div className="text-xl font-black text-purple-400">128 Running</div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'export' && (
            <div className="space-y-4 max-w-4xl mx-auto">
              <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
                <h3 className="text-sm font-black text-white">Executive Report Export</h3>
                <div className="space-y-3">
                  <label className="text-slate-400 font-bold block">Select Format</label>
                  <select 
                    value={exportFormat}
                    onChange={(e) => setExportFormat(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                  >
                    <option>PDF Report (Executive Summary & KPIs)</option>
                    <option>Excel Financial Ledger (.xlsx)</option>
                    <option>CSV Raw Data Export (.csv)</option>
                    <option>JSON Complete System Payload (.json)</option>
                  </select>
                </div>
                <button className="w-full py-3.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20">
                  <Download size={14} /> Download Executive Report ({exportFormat})
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnterpriseBiModal;
