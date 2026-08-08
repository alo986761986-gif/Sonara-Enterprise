import React, { FormEvent, useState } from 'react';
import {
  AudioLines,
  ChevronRight,
  Lightbulb,
  RotateCcw,
  Send,
  Square,
  Sparkles,
  Volume2,
  WandSparkles
} from 'lucide-react';
import { EmberMessage, EmberStatus, EmberToolTrace } from '../../types/ember';

export interface EmberAssistantPanelProps {
  status?: EmberStatus;
  messages?: EmberMessage[];
  insight?: string | null;
  recommendedAction?: string | null;
  onSendMessage?: (message: string) => void | Promise<void>;
  isSending?: boolean;
  error?: string | null;
  toolTrace?: EmberToolTrace[];
  voice?: {
    enabled: boolean;
    isLoading: boolean;
    isPlaying: boolean;
    error: string | null;
    autoSpeak: boolean;
    hasCachedAudio: boolean;
    speak: (text: string) => void | Promise<void>;
    stop: () => void;
    replay: () => void | Promise<void>;
    setAutoSpeak: (enabled: boolean) => void;
  };
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
  analyzing: 'Creative Intelligence Analyzing',
  offline: 'Creative Intelligence Offline'
};

const QUICK_ACTIONS = [
  { label: 'Refine Prompt', prompt: 'Suggerisci un prompt musicale piu efficace, senza modificare lo Studio.', icon: WandSparkles },
  { label: 'Suggest Genre', prompt: 'Consiglia un genere e un sottogenere coerenti con il contesto Studio attuale.', icon: Sparkles },
  { label: 'Analyze Track', prompt: 'Analizza il contesto Studio disponibile e dammi consigli creativi read-only.', icon: AudioLines },
  { label: 'EQ Guidance', prompt: 'Consulta i preset EQ disponibili e suggerisci una direzione EQ, senza applicare modifiche.', icon: Lightbulb }
];

export function EmberAssistantPanel({
  status = 'online',
  messages,
  insight,
  recommendedAction,
  onSendMessage,
  isSending = false,
  error,
  toolTrace = [],
  voice
}: EmberAssistantPanelProps) {
  const [input, setInput] = useState('');

  const conversation = messages || DEFAULT_MESSAGES;
  const statusLabel = STATUS_LABELS[status];
  const latestAssistantMessage = [...conversation].reverse().find(message => message.role === 'assistant');

  const sendMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = input.trim();
    if (!content || isSending) return;

    setInput('');
    void onSendMessage?.(content);
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
              {status === 'analyzing' ? 'Thinking' : status === 'offline' ? 'Offline' : 'Online'}
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
          <span className="text-[10px] uppercase tracking-wide text-[#EDE7DE]/45">Studio context</span>
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
              onClick={() => void onSendMessage?.(prompt)}
              disabled={isSending}
              className="group flex min-h-16 flex-col items-start justify-between rounded-lg border border-[#3a3d41] bg-[#1C1F24] p-3 text-left transition-colors hover:border-[#D97941]/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2A65A] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Icon className="h-4 w-4 text-[#F2A65A]" aria-hidden="true" />
              <span className="flex w-full items-center justify-between gap-1 text-[11px] font-medium text-[#EDE7DE]">
                {label}
                <ChevronRight className="h-3.5 w-3.5 text-[#EDE7DE]/40" aria-hidden="true" />
              </span>
              <span className="text-[10px] text-[#EDE7DE]/50">Ask Ember</span>
            </button>
          ))}
        </div>
      </section>

      <section className="border-b border-[#34312d] py-4" aria-label="Controlli voce Ember">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[#EDE7DE]">Voce Ember</h3>
            <p className="mt-1 text-[11px] text-[#EDE7DE]/55">
              {voice?.enabled ? 'Ascolto della risposta finale di Ember.' : "Pronta per l'attivazione"}
            </p>
          </div>
          <label className="flex items-center gap-2 text-[11px] text-[#EDE7DE]/70">
            <input
              type="checkbox"
              checked={voice?.autoSpeak || false}
              onChange={event => voice?.setAutoSpeak(event.target.checked)}
              disabled={!voice?.enabled}
              className="h-3.5 w-3.5 accent-[#D97941] disabled:opacity-50"
            />
            Auto
          </label>
        </div>
        {voice?.enabled && latestAssistantMessage && (
          <div className="mt-3 flex items-center gap-2">
            {voice.isPlaying ? (
              <button
                type="button"
                onClick={voice.stop}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#D97941]/50 px-2.5 py-1.5 text-[11px] font-medium text-[#F2A65A]"
              >
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
                Stop
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void voice.speak(latestAssistantMessage.content)}
                disabled={voice.isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#3a3d41] bg-[#1C1F24] px-2.5 py-1.5 text-[11px] font-medium text-[#EDE7DE] disabled:opacity-50"
              >
                <Volume2 className="h-3.5 w-3.5 text-[#F2A65A]" aria-hidden="true" />
                {voice.isLoading ? 'Preparazione...' : 'Ascolta'}
              </button>
            )}
            {voice.hasCachedAudio && !voice.isPlaying && (
              <button
                type="button"
                onClick={() => void voice.replay()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#3a3d41] px-2.5 py-1.5 text-[11px] font-medium text-[#EDE7DE]/80"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Replay
              </button>
            )}
          </div>
        )}
        {voice?.error && voice.enabled && (
          <p className="mt-2 text-[11px] text-red-200" role="status">{voice.error}</p>
        )}
      </section>

      <section className="pt-4" aria-labelledby="ember-chat-title">
        <div className="flex items-center justify-between gap-2">
          <h3 id="ember-chat-title" className="text-sm font-semibold text-[#EDE7DE]">
            Conversation
          </h3>
          <span className="text-[10px] text-[#EDE7DE]/50">Read-only guidance</span>
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

        {toolTrace.length > 0 && (
          <p className="mt-3 text-[10px] text-[#EDE7DE]/55" role="status">
            Consulted: {toolTrace.filter(trace => trace.ok).map(trace => trace.name).join(', ') || 'Sonara context'}
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-950/30 px-3 py-2 text-xs leading-5 text-red-200" role="alert">
            {error}
          </p>
        )}

        <form className="mt-3 flex gap-2" onSubmit={sendMessage}>
          <label className="sr-only" htmlFor="ember-message">Scrivi un messaggio a Ember</label>
          <input
            id="ember-message"
            value={input}
            onChange={event => setInput(event.target.value)}
            placeholder="Scrivi un messaggio a Ember..."
            disabled={isSending}
            className="min-w-0 flex-1 rounded-lg border border-[#3a3d41] bg-[#1C1F24] px-3 py-2 text-xs text-[#EDE7DE] placeholder:text-[#EDE7DE]/40 focus:border-[#D97941] focus:outline-none"
          />
          <button
            type="submit"
            disabled={isSending}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[#D97941] px-3 py-2 text-xs font-semibold text-[#111315] transition-colors hover:bg-[#F2A65A] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#F2A65A] disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{isSending ? 'Invio...' : 'Invia'}</span>
          </button>
        </form>
      </section>
    </aside>
  );
}
