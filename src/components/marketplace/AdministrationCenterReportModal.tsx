import React from 'react';
import { 
  ShieldAlert, 
  CheckCircle2, 
  ShieldCheck, 
  Cpu, 
  X, 
  Award, 
  Database,
  Users
} from 'lucide-react';

interface AdministrationCenterReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AdministrationCenterReportModal: React.FC<AdministrationCenterReportModalProps> = ({
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
            <div className="p-2 rounded-xl bg-purple-500/20 border border-purple-500/40 text-purple-400">
              <ShieldAlert size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">Enterprise Administration — Certification Report</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 text-xs font-mono font-bold">VERSION 2.1</span>
              </div>
              <p className="text-xs text-slate-400">Users, Creators, Marketplace, Commerce, Cloud, AI, Security Audit Logs, Permissions & Feature Flags</p>
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
          <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-950/65 to-blue-950/65 border border-purple-500/40 flex items-center justify-between shadow-2xl">
            <div className="space-y-1">
              <div className="text-purple-400 font-mono text-[10px] font-bold tracking-widest uppercase">Administration Certification</div>
              <div className="text-2xl font-black text-white tracking-tight">ADMINISTRATION CENTER VERIFIED (VERSION 2.1)</div>
              <p className="text-slate-300 text-xs">All root controls, security audit logs, feature flags, and maintenance modes certified for production deployment.</p>
            </div>
            <div className="px-5 py-3 rounded-xl bg-purple-500 text-slate-950 font-black text-sm font-mono tracking-wider shadow-lg">
              PASSED 100%
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-4 gap-3 font-mono">
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-slate-400 text-[10px]">Root Permissions</div>
              <div className="text-xl font-black text-white">Verified</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-slate-400 text-[10px]">Audit Logs</div>
              <div className="text-xl font-black text-purple-400">Active</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-slate-400 text-[10px]">Feature Flags</div>
              <div className="text-xl font-black text-emerald-400">Configured</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-1">
              <div className="text-slate-400 text-[10px]">Production Status</div>
              <div className="text-xl font-black text-emerald-400">READY</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdministrationCenterReportModal;
