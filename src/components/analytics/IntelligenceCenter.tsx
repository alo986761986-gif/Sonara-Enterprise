import React from 'react';
import { Card } from '../core/Card';
import { BrainCircuit, Zap, Sparkles, Activity } from 'lucide-react';

export const IntelligenceCenter: React.FC = () => (
  <Card variant="premium" className="overflow-hidden">
    <div className="flex items-center justify-between mb-10">
      <div>
        <h4 className="text-2xl font-black text-white tracking-tighter">Neural Intelligence Core</h4>
        <p className="text-[10px] text-indigo-400 font-black uppercase tracking-[0.25em] mt-1">AI-Driven Predictive Analysis</p>
      </div>
      <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 rounded-full border border-indigo-500/20">
        <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
        <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Analyzing Patterns</span>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
      <IntelligenceMetric 
        icon={Zap} 
        label="Optimization Level" 
        value="98.4%" 
        desc="Ecosystem efficiency" 
      />
      <IntelligenceMetric 
        icon={Sparkles} 
        label="Creative Velocity" 
        value="+42.5%" 
        desc="Output vs Historical" 
      />
      <IntelligenceMetric 
        icon={Activity} 
        label="Market Resonance" 
        value="8.2" 
        desc="Global trend alignment" 
      />
    </div>
  </Card>
);

const IntelligenceMetric: React.FC<{ icon: any, label: string, value: string, desc: string }> = ({ icon: Icon, label, value, desc }) => (
  <div className="space-y-3">
    <div className="flex items-center gap-3 text-indigo-400">
      <Icon size={18} />
      <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">{label}</span>
    </div>
    <div className="text-3xl font-black text-white tracking-tight">{value}</div>
    <p className="text-[10px] font-bold text-slate-600 leading-none">{desc}</p>
  </div>
);
