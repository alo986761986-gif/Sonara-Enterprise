import React from 'react';
import { analyticsStore } from '../../services/analytics/AnalyticsStore';

export const AiAnalytics: React.FC = () => {
  const events = analyticsStore.getEvents();
  const aiEvents = events.filter(e => e.type.startsWith('ai_'));

  return (
    <div className="p-6 border rounded-lg bg-white shadow-sm">
      <h2 className="text-xl font-bold mb-4">AI Analytics</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-gray-500">Songs Generated</p>
          <h2 className="text-xl font-bold">{events.filter(e => e.type === 'ai_generate').length}</h2>
        </div>
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-gray-500">Errors</p>
          <h2 className="text-xl font-bold">{events.filter(e => e.type === 'ai_error').length}</h2>
        </div>
        <div className="p-4 border rounded-lg">
          <p className="text-sm text-gray-500">Credits Used</p>
          <h2 className="text-xl font-bold">{events.filter(e => e.type === 'ai_credit_used').reduce((sum, e) => sum + (e.data?.credits || 0), 0)}</h2>
        </div>
      </div>
    </div>
  );
};
