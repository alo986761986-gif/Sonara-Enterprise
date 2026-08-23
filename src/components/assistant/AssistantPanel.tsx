import React, { useMemo, useState } from 'react';
import { Bot, Send, Sparkles, X } from 'lucide-react';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { AssistantServiceInstance } from '../../services/AssistantService';

export const AssistantPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const conversation = useMemo(
    () => AssistantServiceInstance.getConversations()[0],
    []
  );
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState(conversation?.messages || []);

  React.useEffect(() => {
    return AssistantServiceInstance.subscribe(() => {
      const current = AssistantServiceInstance.getConversations()[0];
      setMessages(current?.messages || []);
    });
  }, []);

  const send = () => {
    const value = input.trim();
    if (!value || !conversation) return;
    AssistantServiceInstance.sendMessage(conversation.id, value);
    setInput('');
  };

  return (
    <Card className="fixed bottom-24 right-4 z-[110] flex h-[34rem] w-[min(92vw,24rem)] flex-col border border-purple-700/50 bg-slate-950/95 p-4 text-slate-100 shadow-2xl backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="flex items-center gap-2 font-black">
            <Bot size={18} className="text-purple-400" /> EMBER
          </h3>
          <div className="mt-1 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-purple-300">
            <Sparkles size={12} /> Sonara Intelligence Copilot
          </div>
        </div>
        <Button variant="ghost" size="sm" className="p-2" onClick={onClose} aria-label="Close Ember">
          <X size={18} />
        </Button>
      </div>

      <div className="mb-3 flex-1 space-y-3 overflow-y-auto rounded-xl border border-slate-800 bg-black/20 p-3 text-sm">
        {messages.map(message => (
          <div
            key={message.id}
            className={`rounded-xl p-3 ${
              message.role === 'user'
                ? 'ml-8 bg-purple-600/20 text-purple-100'
                : 'mr-8 bg-slate-900 text-slate-300'
            }`}
          >
            <div className="mb-1 text-[10px] font-black uppercase tracking-wider text-slate-500">
              {message.role === 'user' ? 'YOU' : 'EMBER'}
            </div>
            {message.content}
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={event => setInput(event.target.value)}
          onKeyDown={event => {
            if (event.key === 'Enter') send();
          }}
          placeholder="Ask Ember about your Sonara workspace..."
          className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-purple-500"
        />
        <Button size="sm" onClick={send} aria-label="Send to Ember">
          <Send size={16} />
        </Button>
      </div>
    </Card>
  );
};
