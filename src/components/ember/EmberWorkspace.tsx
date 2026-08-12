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
    content: 'Ciao, sono Ember. La mia intelligenza locale e pronta: posso dare indicazioni creative senza usare servizi AI esterni o a pagamento.'
  }
];

const buildLocalResponse = (message: string): string => {
  const normalized = message.toLowerCase();

  if (normalized.includes('prompt') || normalized.includes('raffin')) {
    return 'Mantieni il genere scelto come vincolo principale e descrivi solo elementi compatibili: groove, basso, batteria, atmosfera, struttura e qualita del mix. Evita di aggiungere generi secondari non richiesti. Una forma efficace e: [genere esatto] + [groove] + [basso] + [percussioni] + [atmosfera] + [arrangiamento] + [mix], senza voci se vuoi un brano strumentale.';
  }

  if (normalized.includes('genere') || normalized.includes('genre') || normalized.includes('sottogenere')) {
    return 'Per proteggere il genre lock, tratta genere e sottogenere selezionati come identita primaria del brano. Gli altri termini devono descrivere solo atmosfera, energia o tecnica di produzione, non nuovi generi. Se il risultato tende a ibridarsi troppo, riduci gli aggettivi stilistici e rafforza ritmo, timbri e arrangiamento tipici del genere scelto.';
  }

  if (normalized.includes('arrang') || normalized.includes('struttura') || normalized.includes('club')) {
    return 'Struttura club consigliata: intro ritmica pulita, ingresso progressivo del basso, prima sezione principale, breve breakdown, ricostruzione della tensione, seconda sezione principale piu piena e outro DJ-friendly. Mantieni pochi elementi simultanei e fai evolvere il groove con automazioni, variazioni percussive e micro-pause invece di cambiare stile.';
  }

  if (normalized.includes('eq') || normalized.includes('master') || normalized.includes('mix')) {
    return 'Direzione prudente: controlla prima il bilanciamento, poi usa EQ sottrattiva leggera. Proteggi sub e kick da sovrapposizioni, riduci eventuale fango nei low-mid solo se realmente presente, conserva presenza e aria senza rendere il master aggressivo. Sul master evita correzioni drastiche: piccoli interventi, headroom sufficiente e confronto continuo con il segnale non processato.';
  }

  if (normalized.includes('bpm') || normalized.includes('tempo')) {
    return 'Usa il BPM selezionato come vincolo ritmico stabile. Invece di cambiare tempo, lavora su densita delle percussioni, sincopi, pause e durata delle sezioni per aumentare o ridurre la sensazione di energia.';
  }

  return 'Posso aiutarti localmente con prompt, coerenza di genere, arrangiamento, BPM, EQ e mastering. In questa modalita non invio dati a provider esterni e non attivo costi.';
};

export default function EmberWorkspace() {
  const [draft, setDraft] = useState('');
  const [entries, setEntries] = useState<EmberEntry[]>(INITIAL_ENTRIES);

  const statusText = useMemo(
    () => 'LOCAL INTELLIGENCE READY',
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
        content: buildLocalResponse(content)
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
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#e9dfd4]/35">Local</span>
              </div>
              <h2 className="mt-4 text-sm font-bold text-[#f5eee6]">{label}</h2>
              <p className="mt-2 text-xs leading-5 text-[#e9dfd4]/55">Precarica una richiesta che Ember elabora localmente, senza chiamate esterne.</p>
            </button>
          ))}
        </div>

        <div className="border-t border-white/10 p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#f5eee6]">
            <Lightbulb className="h-4 w-4 text-orange-300" />
            Creative direction
          </div>
          <p className="max-w-3xl text-sm leading-6 text-[#e9dfd4]/60">
            Ember resta separata dal motore ACE-Step: puo guidare prompt, genere, arrangiamento, BPM ed EQ senza alterare la pipeline audio stabile. Questa prima intelligenza locale funziona senza provider esterni e senza costi.
          </p>
        </div>
      </section>

      <aside className="flex min-h-[620px] flex-col rounded-3xl border border-white/10 bg-[#0d1015] shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-orange-300" />
            <h2 className="text-sm font-bold text-white">Conversation</h2>
          </div>
          <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">Local intelligence</span>
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
              title="Invia a Ember locale"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-2 text-[10px] leading-4 text-white/30">Elaborazione locale: nessun dato inviato a provider AI esterni.</p>
        </form>
      </aside>
    </div>
  );
}
