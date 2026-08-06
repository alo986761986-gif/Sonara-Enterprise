import React from 'react';
import { Card } from '../core/Card';
import { Button } from '../core/Button';

export const ApprovalCenter: React.FC = () => {
  return (
    <Card className="flex flex-col gap-6">
      <h3 className="text-xl font-bold text-slate-900">Approval Center</h3>
      <div className="p-4 rounded-2xl border border-amber-100 bg-amber-50/50 flex flex-col gap-3">
        <div className="flex justify-between items-start">
          <p className="text-sm font-bold text-slate-900">Final Master v1</p>
          <span className="text-[10px] font-bold text-amber-600 px-2 py-0.5 rounded bg-amber-100">PENDING</span>
        </div>
        <p className="text-xs text-slate-600">Needs approval from Producer and Label.</p>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1">Approve</Button>
          <Button variant="outline" size="sm" className="flex-1">Reject</Button>
        </div>
      </div>
    </Card>
  );
};
