import React from 'react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { X, Send, Bot } from 'lucide-react';

export const AssistantPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <Card className="fixed bottom-24 right-4 z-[110] w-80 h-96 p-4 flex flex-col bg-white/90 backdrop-blur-md shadow-2xl border border-indigo-100">
    <div className="flex justify-between items-center mb-4">
      <h3 className="font-bold text-slate-800 flex items-center gap-2"><Bot size={18} /> Sonara Assistant</h3>
      <Button variant="ghost" className="p-1" onClick={onClose}><X size={18} /></Button>
    </div>
    <div className="flex-1 bg-slate-50 rounded-md p-2 mb-2 text-sm text-slate-600 overflow-y-auto">
      Hi! How can I help you with your music today?
    </div>
    <div className="flex gap-2">
      <input type="text" placeholder="Type prompt..." className="flex-1 px-3 py-2 border border-slate-200 rounded-md text-sm outline-none" />
      <Button size="sm"><Send size={16} /></Button>
    </div>
  </Card>
);
