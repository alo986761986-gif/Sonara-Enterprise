import React from 'react';
import { Card } from '../core/Card';
import { PageHeader } from '../core/PageHeader';
import { Button } from '../core/Button';

export const TeamsHub: React.FC = () => {
  const teams = [
    { name: 'Sonara Originals', role: 'Owner', members: 12, projects: 5 },
    { name: 'Midnight Collective', role: 'Producer', members: 4, projects: 2 },
    { name: 'Dream State', role: 'Guest', members: 8, projects: 1 },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title="Teams Hub" subtitle="Manage and collaborate with your creative teams." />
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {teams.map((team, idx) => (
          <Card key={idx} variant="interactive" className="flex flex-col gap-6">
            <div className="flex items-start justify-between">
              <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-bold text-2xl shadow-lg shadow-indigo-200">
                {team.name.charAt(0)}
              </div>
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded">
                {team.role.toUpperCase()}
              </span>
            </div>
            
            <div>
              <h3 className="font-bold text-slate-900 text-lg">{team.name}</h3>
              <p className="text-sm text-slate-500">{team.members} Members • {team.projects} Projects</p>
            </div>
            
            <div className="pt-4 border-t border-slate-100 flex gap-2">
              <Button size="sm" className="flex-1">Open Studio</Button>
              <Button size="sm" variant="outline" className="flex-1">Settings</Button>
            </div>
          </Card>
        ))}
        
        <Card variant="interactive" className="border-dashed flex flex-col items-center justify-center gap-4 text-center py-12">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
            +
          </div>
          <div>
            <p className="font-bold text-slate-900">Create New Team</p>
            <p className="text-xs text-slate-500">Build your creative production team</p>
          </div>
        </Card>
      </div>
    </div>
  );
};
