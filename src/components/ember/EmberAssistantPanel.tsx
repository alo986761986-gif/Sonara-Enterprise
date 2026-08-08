import React, { FormEvent, useState } from 'react';
import {
  AudioLines,
  ChevronRight,
  Lightbulb,
  Send,
  Sparkles,
  WandSparkles
} from 'lucide-react';

export type EmberStatus =
  | 'online'
  | 'listening'
  | 'analyzing'
  | 'processing'
  | 'offline';

export type EmberMessageRole = 'user' | 'assistant';

export interface EmberMessage {
  id: string;
  role: EmberMessageRole;
  content: string;
  createdAt?: string;
}

export interface EmberAssistantPanelProps {
  status?: EmberStatus;
  messages?: EmberMessage[];
  insight?: string | null;
  recommendedAction?: string | null;
  onSendMessage?: (message: string) => void;
}

const PORTRAIT_URL = '/assets/ember/ember-director.png';

const DEFAULT_MESSAGES: EmberMessage[] = [
  {
    id: 'ember-welcome',
    role: 'assistant',
    content: 'Ciao, sono Ember. Dimmi cosa vuoi creare oggi.'
  }
];

const STATUS_LABELS: Record<EmberStatus, string> = {
  online: 'Creative Intelligence Online',
  listening: 'Creative Intelligence Listening',
  analyzing: 'Creative Intelligence Analyzing',
  processing: 'Creative Intelligence Processing',
  offline: 'Creative Intelligence Offline'
};

const QUICK_ACTIONS = [
  { label: 'Refine Prompt', icon: WandSparkles },
  { label: 'Suggest Genre', icon: Sparkles },
  { label: 'Analyze Track', icon: AudioLines },
  { label: 'EQ Guidance', icon: Lightbulb }
];

export function EmberAssistantPanel({
  status = 'online',
  messages,
  insight,
  recommendedAction,
  onSendMessage
}: EmberAssistantPanelProps) {
  const [input, setInput] = useState('');
  const [localMessages, setLocalMessages] = useState<EmberMessage[]>([]);
  const [previewNotice, setPreviewNotice] = useState<string | null>(null);

  const conversation = [...(messages || DEFAULT_MESSAGES), ...localMessages];
  const statusLabel = STATUS_LABELS[status];

  const sendPreviewMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content) return;

    const createdAt = new Date().toISOString();
    setLocalMessages(previous => [
      ...previous,
      { id: `ember-user-${Date.now()}`, role: 'user', content, createdAt },
      {
        id: `ember-preview-${Date.now() + 1}`,
        role: 'assistant',
        content: 'Modalita anteprima: la conversazione intelligente di Ember sara collegata nella prossima fase.',
        createdAt
      }
    ]);
    setInput('');
    onSendMessage?.(content);
  };

  return (
    <aside className="rounded-2xl border border-[#34312d] bg-[#111315] p-4 shadow-xl shadow-black/20 sm:p-5">
      <div className="flex items-center gap-3 border-b border-[#34312d] pb-4">
        <img
          src={PORTRAIT_URL}
          alt="Ember — Sonara AI Director"
          className="h-16 w-16 shrink-0 rounded-full border border-[#D97941]/70 object-cover object-center shadow-lg shadow-black/40"
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[#EDE7DE]">Ember</h2>
            <span className="rounded-full border border-[#D97941]/40 bg-[#D97941]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#F2A65A]">
              Online
            </span>
          </div>
          <p className="text-xs font-medium text-[#EDE7DE]/75">Sonara AI Director</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-emerald-300">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
            <span>{statusLabel}</span>
          </p>
        </div>
      </div>

      <section className="border-b border-[#34312d] py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#F2A65A]">
          Your Creative Intelligence
        </p>
        <p className="mt-2 text-sm leading-6 text-[#EDE7DE]">
          Sono pronta ad aiutarti a costruire la tua prossima traccia. Parti da un prompt, da un genere o da un mood.
        </p>
        <p className="mt-2 text-xs leading-5 text-[#EDE7DE]/65">
          Posso aiutarti a interpretare il Music Brain, raffinare la direzione creativa e guidare il sound.
        </p>
      </section>

      <section className="border-b border-[#34312d] py-4" aria-labelledby="ember-insight-title">
        <div className="flex items-center justify-between gap-2">
          <h3 id="ember-insight-title" className="text-sm font-semibold text-[#EDE7DE]">
            Creative Insight
          </h3>
          <span className="text-[10px] uppercase tracking-wide text-[#EDE7DE]/45">Preview mode</span>
        </div>
        <p className="mt-2 text-xs leading-5 text-[#EDE7DE]/65">
          {insight || 'Music Brain context will appear here.'}
        </p>
        {recommendedAction && (
          <p className="mt-2 text-xs font-medium text-[#F2A65A]">{recommendedAction}</p>
        )}
      </section>

      <section className="border-b border-[#34312d] py-4" aria-label="Ember preview actions">
        <div className="grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => setPreviewNotice('Questa funzione sara disponibile con Ember Phase 2.')}
              className="group flex min-h-16 flex-col items-start justify-between rounded-lg border border-[#3a3d41] bg-[#1C1F24] p-3 text-left transition-colors hover:border-[#D97941]/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2A65A]"
            >
              <Icon className="h-4 w-4 text-[#F2A65A]" aria-hidden="true" />
              <span className="flex w-full items-center justify-between gap-1 text-[11px] font-medium text-[#EDE7DE]">
                {label}
                <ChevronRight className="h-3.5 w-3.5 text-[#EDE7DE]/40" aria-hidden="true" />
              </span>
              <span className="text-[10px] text-[#EDE7DE]/50">Phase 2</span>
            </button>
          ))}
        </div>
        {previewNotice && (
          <p className="mt-3 text-xs leading-5 text-[#F2A65A]" role="status">
            {previewNotice}
          </p>
        )}
      </section>

      <section className="pt-4" aria-labelledby="ember-chat-title">
        <div className="flex items-center justify-between gap-2">
          <h3 id="ember-chat-title" className="text-sm font-semibold text-[#EDE7DE]">
            Conversation
          </h3>
          <span className="text-[10px] text-[#EDE7DE]/50">AI connection coming in Phase 2</span>
        </div>

        <div className="mt-3 max-h-56 space-y-2 overflow-y-auto pr-1" aria-live="polite">
          {conversation.map(message => (
            <div
              key={message.id}
              className={message.role === 'user'
                ? 'ml-6 rounded-lg bg-purple-600 px-3 py-2 text-xs leading-5 text-white'
                : 'mr-4 rounded-lg border border-[#3a3d41] bg-[#1C1F24] px-3 py-2 text-xs leading-5 text-[#EDE7DE]/85'}
            >
              {message.role === 'assistant' && (
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-[#F2A65A]">Ember</span>
              )}
              {message.content}
            </div>
          ))}
        </div>

        <form className="mt-3 flex gap-2" onSubmit={sendPreviewMessage}>
          <label className="sr-only" htmlFor="ember-message">Scrivi un messaggio a Ember</label>
          <input
            id="ember-message"
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder="Scrivi un messaggio a Ember..."
            className="min-w-0 flex-1 rounded-lg border border-[#3a3d41] bg-[#1C1F24] px-3 py-2 text-xs text-[#EDE7DE] placeholder:text-[#EDE7DE]/40 focus:border-[#D97941] focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#D97941] px-3 py-2 text-xs font-semibold text-[#111315] transition-colors hover:bg-[#F2A65A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2A65A]"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Invia</span>
          </button>
        </form>
      </section>
    </aside>
  );
}
