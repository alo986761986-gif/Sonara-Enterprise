import React from 'react';
import { Card } from '../core/Card';
import { PageHeader } from '../core/PageHeader';
import { Button } from '../core/Button';

export const MessagesHub: React.FC = () => {
  const conversations = [
    { name: 'Alex Rivera', lastMsg: 'The mix sounds great!', time: '10m ago', unread: true },
    { name: 'Creative Team Alpha', lastMsg: 'Marcus: Just uploaded the stems.', time: '1h ago', unread: false },
    { name: 'Sarah Chen', lastMsg: 'Can we meet at 3?', time: '3h ago', unread: false },
  ];

  return (
    <div className="flex flex-col gap-8 h-full">
      <PageHeader title="Messages Hub" subtitle="Stay connected with your creative network." />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1">
        <Card className="lg:col-span-1 flex flex-col gap-4 p-0 overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Conversations</h3>
            <Button size="sm" variant="ghost">New</Button>
          </div>
          <div className="flex flex-col">
            {conversations.map((conv, idx) => (
              <div key={idx} className={`p-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50 transition-colors ${conv.unread ? 'bg-indigo-50/30' : ''}`}>
                <div className="w-12 h-12 rounded-full bg-slate-200" />
                <div className="flex-1 overflow-hidden">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-slate-900 text-sm truncate">{conv.name}</span>
                    <span className="text-[10px] text-slate-500 whitespace-nowrap">{conv.time}</span>
                  </div>
                  <p className="text-xs text-slate-500 truncate">{conv.lastMsg}</p>
                </div>
                {conv.unread && <div className="w-2 h-2 rounded-full bg-indigo-600" />}
              </div>
            ))}
          </div>
        </Card>
        
        <Card className="lg:col-span-2 flex items-center justify-center bg-slate-50 border-dashed">
          <div className="text-center">
            <p className="text-slate-500 font-medium">Select a conversation to start messaging</p>
            <p className="text-xs text-slate-400 mt-1">End-to-end encrypted creative communication</p>
          </div>
        </Card>
      </div>
    </div>
  );
};
