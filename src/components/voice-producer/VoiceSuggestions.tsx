import React from 'react';

export const VoiceSuggestions: React.FC = React.memo(() => (
  <div className="flex flex-wrap gap-2">
    <span className="px-3 py-1 bg-gray-50 border rounded-full text-xs">Stronger chorus</span>
    <span className="px-3 py-1 bg-gray-50 border rounded-full text-xs">Add piano</span>
  </div>
));
