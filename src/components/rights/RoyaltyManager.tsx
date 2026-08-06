import React from 'react';
import { Card } from '../ui/Card';

export const RoyaltyManager: React.FC = () => (
  <Card className="p-4">
    <h3 className="font-bold text-slate-800 mb-4">Royalty Splits</h3>
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-2 w-full bg-slate-100 rounded-full"><div className="h-full w-full bg-indigo-600 rounded-full"/></div>
        <span className="text-sm font-bold">100%</span>
      </div>
    </div>
  </Card>
);
