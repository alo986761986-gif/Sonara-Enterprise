import React from 'react';
import { Card } from '../ui/Card';

export const RightsDashboard: React.FC = () => (
  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
    <Card className="p-4">
      <h3 className="font-bold text-slate-800">Registration</h3>
      <p className="text-sm text-slate-500">Status: Registered</p>
    </Card>
    <Card className="p-4">
      <h3 className="font-bold text-slate-800">Publishing</h3>
      <p className="text-sm text-slate-500">Status: Active</p>
    </Card>
    <Card className="p-4">
      <h3 className="font-bold text-slate-800">Earnings</h3>
      <p className="text-sm text-slate-500">$0.00</p>
    </Card>
  </div>
);
