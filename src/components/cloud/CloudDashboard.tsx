import React from 'react';
import { Card } from '../ui/Card';
import { Cloud, Wifi, RefreshCw } from 'lucide-react';

export const CloudDashboard: React.FC = () => (
  <div className="p-8 space-y-8">
    <h1 className="text-3xl font-bold text-slate-900">Cloud Ecosystem</h1>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      <Card className="flex items-center gap-4">
        <div className="p-3 bg-indigo-100 rounded-full text-indigo-600">
          <Cloud size={24} />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500">Status</p>
          <p className="text-lg font-bold">Online</p>
        </div>
      </Card>
      <Card className="flex items-center gap-4">
        <div className="p-3 bg-emerald-100 rounded-full text-emerald-600">
          <Wifi size={24} />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500">Syncing</p>
          <p className="text-lg font-bold">Up to date</p>
        </div>
      </Card>
      <Card className="flex items-center gap-4">
        <div className="p-3 bg-amber-100 rounded-full text-amber-600">
          <RefreshCw size={24} />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500">Offline</p>
          <p className="text-lg font-bold">Enabled</p>
        </div>
      </Card>
    </div>
  </div>
);
