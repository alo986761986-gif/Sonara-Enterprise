import React from 'react';

export const WorkspaceInspector: React.FC = () => (
  <aside className="w-64 border-l border-slate-200 bg-white p-6 hidden lg:block">
    <h3 className="font-bold text-slate-900 mb-4">Inspector</h3>
    <div className="text-sm text-slate-500">Select an item to view properties.</div>
  </aside>
);
