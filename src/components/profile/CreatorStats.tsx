import React from 'react';
import { Card } from '../../ui/Card';

export const CreatorStats: React.FC = () => (
  <Card className="p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
    {[
      { label: 'Songs', value: '48' },
      { label: 'Projects', value: '12' },
      { label: 'Downloads', value: '1.2k' },
      { label: 'Followers', value: '500' },
    ].map(stat => (
      <div key={stat.label}>
        <p className="text-sm text-slate-500">{stat.label}</p>
        <p className="text-xl font-bold text-slate-900">{stat.value}</p>
      </div>
    ))}
  </Card>
);
