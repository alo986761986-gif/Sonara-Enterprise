import React from 'react';
import { MasteringPanel } from './MasteringPanel';
import { MixingPanel } from './MixingPanel';
import { StemManager } from './StemManager';
import { ExportCenter } from './ExportCenter';

export const ProductionCenter: React.FC = () => (
  <div className="p-8 space-y-8">
    <h1 className="text-3xl font-bold text-slate-900">AI Production Center</h1>
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <MixingPanel />
      <MasteringPanel />
      <StemManager />
      <ExportCenter />
    </div>
  </div>
);
