import React from 'react';
import { Card } from '../ui/Card';

export const Stats: React.FC = () => (
  <Card className="grid grid-cols-2 md:grid-cols-4 gap-6">
    {[
      { label: 'Projects', value: '12' },
      { label: 'Songs', value: '48' },
      { label: 'Credits', value: '12' },
      { label: 'Marketplace', value: '3' },
    ].map(stat => (
      <div key={stat.label}>
        <p className="text-sm text-slate-500 font-medium">{stat.label}</p>
        <p className="text-2xl font-bold text-slate-900 mt-1">{stat.value}</p>
      </div>
    ))}
  </Card>
);
