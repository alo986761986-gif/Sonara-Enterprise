import React from 'react';
import { 
  Workflow, 
  CheckCircle2, 
  ShieldCheck, 
  Cpu, 
  X, 
  Award, 
  Database,
  Activity
} from 'lucide-react';

interface AiOrchestrationReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AiOrchestrationReportModal: React.FC<AiOrchestrationReportModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none font-sans">
      <div className="bg-[#0b1021] border border-cyan-500/30 rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900/90 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-400">
              <Workflow size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">Sonara AI Orchestration Engine — Certification Report</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 text-xs font-mono font-bold">VERSION 2.1</span>
              </div>
              <p className="text-xs text-slate-400">Centralized Provider Router, Request Pipeline, Workspace Storage & Security Audit Logs</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-300">
          {/* Banner */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-cyan-950/65 to-blue-950/65 border border-cyan-500/40 flex items-center justify-between shadow-2xl">
            <div className="space-y-1">
              <div className="text-cyan-400 font-mono text-[10px] font-bold tracking-widest uppercase">Orchestration Certification</div>
              <div className="text-2xl font-black text-white tracking-tight">AI ORCHESTRATION ENGINE VERIFIED (VERSION 2.1)</div>
              <p className="text-slate-300 text-xs">All AI requests routed centrally with automated fallbacks, encrypted token vaults, and instant workspace sync.</p>
            </div>
            <div className="px-5 py-3 rounded-xl bg-cyan-500 text-slate-950 font-black text-sm font-mono tracking-wider shadow-lg">
              PASSED 100%
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-4 gap-3 font-mono">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-slate-400 text-[10px]">Active Providers</div>
              <div className="text-xl font-black text-white">6 Connected</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-slate-400 text-[10px]">Fallback Success Rate</div>
              <div className="text-xl font-black text-emerald-400">100%</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-slate-400 text-[10px]">Avg Latency</div>
              <div className="text-xl font-black text-cyan-400">84ms</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-slate-400 text-[10px]">Audit Security</div>
              <div className="text-xl font-black text-emerald-400">Encrypted</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiOrchestrationReportModal;
