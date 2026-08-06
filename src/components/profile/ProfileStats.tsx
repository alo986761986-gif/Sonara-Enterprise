import React from 'react';
import { Card } from '../core/Card';

export const ProfileStats: React.FC = () => {
  const stats = [
    { label: 'Followers', value: '12.4K', trend: '+12%' },
    { label: 'Total Streams', value: '2.8M', trend: '+5%' },
    { label: 'Sales', value: '450', trend: '+8%' },
    { label: 'Marketplace Rank', value: '#12', trend: 'Top 1%' },
  ];

  return (
    <Card className="flex flex-col gap-6">
      <h3 className="font-semibold text-slate-900 border-b border-slate-100 pb-4">Identity Stats</h3>
      <div className="grid grid-cols-2 gap-4">
        {stats.map((stat) => (
          <div key={stat.label} className="flex flex-col gap-1">
            <span className="text-xs font-medium text-slate-500 uppercase tracking-wider">{stat.label}</span>
            <span className="text-xl font-bold text-slate-900">{stat.value}</span>
            <span className="text-[10px] font-bold text-emerald-600">{stat.trend}</span>
          </div>
        ))}
      </div>
    </Card>
  );
};
