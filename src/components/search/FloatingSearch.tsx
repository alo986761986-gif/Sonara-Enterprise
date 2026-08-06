import React from 'react';
import { Card } from '../ui/Card';
import { Search } from 'lucide-react';

export const FloatingSearch: React.FC = () => (
  <Card className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] w-full max-w-lg p-3 flex items-center gap-3 bg-white/80 backdrop-blur-md">
    <Search className="text-slate-400" size={20} />
    <input type="text" placeholder="Search Sonara AI..." className="flex-1 bg-transparent outline-none text-sm" />
  </Card>
);
