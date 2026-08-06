import React from 'react';
import { 
  Crown, 
  CheckCircle2, 
  ShieldCheck, 
  Database, 
  X, 
  CreditCard, 
  Sparkles,
  Zap,
  Lock
} from 'lucide-react';

interface SubscriptionReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SubscriptionReportModal: React.FC<SubscriptionReportModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md select-none font-sans">
      <div className="bg-[#0b1021] border border-amber-500/30 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900/90 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400">
              <Crown size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white tracking-tight">Subscription System Report</h2>
                <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-mono font-bold">STEP 7 PRODUCTION</span>
              </div>
              <p className="text-xs text-slate-400">4-Tier Memberships (Free, Creator, Pro, Enterprise), Subscription Engine & Billing Architecture</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-300">
          {/* Membership Plans */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Zap size={16} className="text-amber-400" /> 4-Tier Membership Architecture
            </h3>
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-slate-400 font-bold block">1. Free Plan</span>
                <span className="text-slate-500 text-[10px]">Marketplace access, free assets, basic AI & workspace tools.</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-purple-400 font-bold block">2. Creator Plan</span>
                <span className="text-slate-400 text-[10px]">Unlimited product publishing, creator dashboard & analytics.</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-cyan-400 font-bold block">3. Pro Plan</span>
                <span className="text-slate-400 text-[10px]">Unlimited AI usage, AI mastering, real-time collaboration.</span>
              </div>
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 space-y-1">
                <span className="text-amber-400 font-bold block">4. Enterprise</span>
                <span className="text-slate-400 text-[10px]">Team accounts, unlimited storage, revenue reports & diamond badge.</span>
              </div>
            </div>
          </div>

          {/* Database Collections */}
          <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
            <h3 className="text-sm font-black text-white flex items-center gap-2">
              <Database size={16} className="text-purple-400" /> Firestore Subscriptions Collection
            </h3>
            <div className="grid grid-cols-1 font-mono text-[11px]">
              <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 text-purple-300 font-bold">
                subscriptions (subscriptionId, userId, plan, status, billingCycle, price, currency, startedAt, expiresAt, renewalDate, autoRenew, trial)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SubscriptionReportModal;
