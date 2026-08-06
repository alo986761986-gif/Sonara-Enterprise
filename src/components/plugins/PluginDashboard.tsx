import React, { useState, useEffect } from 'react';
import { PluginManager } from '../../services/PluginManager';
import { PluginInstance } from '../../types';
import { Package, Power, RefreshCw, Trash2, Settings } from 'lucide-react';

export const PluginDashboard: React.FC = () => {
  const [plugins, setPlugins] = useState<PluginInstance[]>([]);

  useEffect(() => {
    const update = () => setPlugins(PluginManager.getPlugins());
    update();
    return PluginManager.subscribe(update);
  }, []);

  return (
    <div className="flex h-full bg-slate-50 p-8">
      <div className="max-w-4xl w-full mx-auto">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><Package/> Plugin Manager</h1>
        <div className="grid gap-4">
          {plugins.map(p => (
            <div key={p.id} className="bg-white p-4 rounded-xl border flex items-center justify-between">
              <div>
                <h3 className="font-bold">{p.manifest.name} <span className="text-xs text-slate-400">v{p.manifest.version}</span></h3>
                <p className="text-sm text-slate-500">{p.manifest.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => PluginManager.togglePlugin(p.id)} className={`p-2 rounded-lg ${p.manifest.enabled ? 'bg-green-100 text-green-700' : 'bg-slate-100'}`}>
                  <Power size={18}/>
                </button>
                <button className="p-2 rounded-lg bg-slate-100"><Settings size={18}/></button>
                <button className="p-2 rounded-lg bg-rose-50 text-rose-600"><Trash2 size={18}/></button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
