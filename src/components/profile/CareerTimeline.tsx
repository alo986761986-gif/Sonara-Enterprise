import React from 'react';
import { Card } from '../core/Card';

export const CareerTimeline: React.FC = () => {
  const milestones = [
    { year: '2024', event: 'Global Top 10 Producer on Sonara' },
    { year: '2023', event: 'Released "Aetheric" Platinum Pack' },
    { year: '2022', event: 'Collaborated with Urban Vibe' },
  ];

  return (
    <Card className="flex flex-col gap-6">
      <h3 className="font-semibold text-slate-900 border-b border-slate-100 pb-4">Career Timeline</h3>
      <div className="flex flex-col gap-6 relative">
        <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-slate-100" />
        {milestones.map((milestone, idx) => (
          <div key={idx} className="relative flex gap-4 pl-8">
            <div className="absolute left-0 top-1.5 w-5 h-5 rounded-full bg-white border-4 border-indigo-500 shadow-sm" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-indigo-600">{milestone.year}</span>
              <span className="text-sm text-slate-700 leading-tight">{milestone.event}</span>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-4 pt-6 border-t border-slate-100 flex flex-col gap-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 font-medium">Availability</span>
          <span className="text-emerald-600 font-bold">Open to Project</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-slate-500 font-medium">Location</span>
          <span className="text-slate-900 font-bold">Remote / LA</span>
        </div>
      </div>
    </Card>
  );
};
