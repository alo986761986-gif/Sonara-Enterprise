import React, { FormEvent, useMemo, useState } from 'react';
import {
  BrainCircuit,
  Lightbulb,
  MessageCircle,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  WandSparkles
} from 'lucide-react';

type EmberEntry = {
  id: string;
  role: 'user' | 'ember';
  content: string;
};

const QUICK_ACTIONS = [
  {
    label: 'Refine Prompt',
    prompt: 'Aiutami a rendere il prompt piu preciso senza cambiare il genere selezionato.',
    icon: WandSparkles
  },
  {
    label: 'Genre Guidance',
    prompt: 'Controlla che la direzione creativa sia coerente con il genere e sottogenere selezionati.',
    icon: Sparkles
  },
  {
    label: 'Arrangement Ideas',
    prompt: 'Suggerisci una struttura club efficace per la traccia che sto preparando.',
    icon: BrainCircuit
  },
  {
    label: 'EQ Guidance',
    prompt: 'Dammi una direzione EQ e mastering prudente per il mix corrente.',
    icon: SlidersHorizontal
  }
];

const INITIAL_ENTRIES: EmberEntry[] = [
  {
    id: 'ember-welcome',
    role: 'ember',
    content: 'Ciao, sono Ember. La mia interfaccia e pronta. In questa build il motore AI esterno non e collegato: nessun servizio a pagamento viene attivato automaticamente.'
  }
];

export default function EmberWorkspace() {
  const [draft, setDraft] = useState('');
  const [entries, setEntries] = useState<EmberEntry[]>(INITIAL_ENTRIES);

  const statusText = useMemo(
    () => 'UI READY · AI BACKEND OFFLINE',
    []
  );

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;

    const timestamp = Date.now();
    setEntries(previous => [
      ...previous,
      { id: `user-${timestamp}`, role: 'user', content },
      {
        id: `ember-${timestamp}`,
        role: 'ember',
        content: 'Richiesta salvata nella UI. Il collegamento al motore conversazionale di Ember verra attivato in una fase separata, mantenendo il vincolo zero-spesa.'
      }
    ]);
    setDraft('');
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="overflow-hidden rounded-3xl border border-orange-500/20 bg-[#111315] shadow-2xl shadow-black/30">
        <div className="border-b border-white/10 bg-gradient-to-r from-orange-500/10 via-amber-400/5 to-transparent p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-orange-400/30 bg-orange-500/10 text-orange-300">
                <Sparkles className="h-7 w-7" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-black tracking-tight text-[#f5eee6]">Ember</h1>
                  <span className="rounded-full border border-orange-400/30 bg-orange-500/10 px-2.5 py-1 text-[10px] font-bold tracking-[0.14em] text-orange-300">
                    {statusText}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[#e9dfd4]/60">Sonara Creative Intelligence Director</p>
              </div>
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
              <ShieldCheck className="h-4 w-4" />
              Zero paid services enabled
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2">
          {QUICK_ACTIONS.map(({ label, prompt, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => setDraft(prompt)}
              className="group rounded-2xl border border-white/10 bg-[#191c20] p-4 text-left transition hover:-translate-y-0.5 hover:border-orange-400/40 hover:bg-[#1d2025]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-300">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#e9dfd4]/35">Preview</span>
              </div>
              <h2 className="mt-4 text-sm font-bold text-[#f5eee6]">{label}</h2>
              <p className="mt-2 text-xs leading-5 text-[#e9dfd4]/55">Precarica una richiesta nel composer di Ember senza eseguire chiamate esterne.</p>
            </button>
          ))}
        </div>

        <div className="border-t border-white/10 p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#f5eee6]">
            <Lightbulb className="h-4 w-4 text-orange-300" />
            Creative direction
          </div>
          <p className="max-w-3xl text-sm leading-6 text-[#e9dfd4]/60">
            Ember viene mantenuta separata dal motore ACE-Step: puo guidare prompt, genere, arrangiamento ed EQ senza alterare la pipeline audio stabile. Il collegamento AI verra aggiunto solo quando scegliamo un backend compatibile con il vincolo di costo.
          </p>
        </div>
      </section>

      <aside className="flex min-h-[620px] flex-col rounded-3xl border border-white/10 bg-[#0d1015] shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-orange-300" />
            <h2 className="text-sm font-bold text-white">Conversation</h2>
          </div>
          <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">Local UI</span>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {entries.map(entry => (
            <div
              key={entry.id}
              className={entry.role === 'user'
                ? 'ml-8 rounded-2xl bg-purple-600 px-4 py-3 text-sm leading-6 text-white'
                : 'mr-5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm leading-6 text-white/70'}
            >
              {entry.role === 'ember' && (
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-orange-300">Ember</span>
              )}
              {entry.content}
            </div>
          ))}
        </div>

        <form onSubmit={submit} className="border-t border-white/10 p-4">
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder="Scrivi a Ember..."
              className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/30 focus:border-orange-400/50"
            />
            <button
              type="submit"
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white transition hover:bg-orange-400"
              title="Salva richiesta nella UI"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-white/30">Nessuna richiesta viene inviata a provider AI esterni in questa fase.</p>
        </form>
      </aside>
    </div>
  );
}
