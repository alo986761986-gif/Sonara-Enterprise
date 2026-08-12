import React, { FormEvent, useMemo, useRef, useState } from 'react';
import {
  BrainCircuit,
  Lightbulb,
  MessageCircle,
  Mic,
  MicOff,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  WandSparkles
} from 'lucide-react';

type EmberEntry = {
  id: string;
  role: 'user' | 'ember';
  content: string;
};

type SpeechRecognitionAlternativeLike = {
  transcript: string;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternativeLike;
};

type SpeechRecognitionEventLike = {
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionErrorEventLike = {
  error?: string;
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
};

type SpeechRecognitionConstructorLike = new () => SpeechRecognitionLike;

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
    content: 'Ciao, sono Ember. La mia intelligenza locale e pronta: posso dare indicazioni creative senza usare servizi AI Sonara a pagamento.'
  }
];

const buildLocalResponse = (message: string): string => {
  const normalized = message.toLowerCase();

  if (normalized.includes('prompt') || normalized.includes('raffin')) {
    return 'Mantieni il genere scelto come vincolo principale e descrivi solo elementi compatibili: groove, basso, batteria, atmosfera, struttura e qualita del mix. Evita di aggiungere generi secondari non richiesti. Una forma efficace e: genere esatto, groove, basso, percussioni, atmosfera, arrangiamento e mix. Se vuoi un brano strumentale, specifica anche senza voci.';
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

  if (normalized.includes('ciao') || normalized.includes('ember')) {
    return 'Eccomi. Sono Ember. Puoi parlarmi di prompt, genere, arrangiamento, BPM, EQ e mastering, e in Voice Mode ti rispondo anche a voce.';
  }

  return 'Posso aiutarti con prompt, coerenza di genere, arrangiamento, BPM, EQ e mastering. Dimmi cosa vuoi ottenere dalla traccia e ti propongo una direzione precisa.';
};

const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructorLike | null => {
  if (typeof window === 'undefined') return null;

  const browserWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructorLike;
    webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
  };

  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition || null;
};

const pickItalianVoice = (): SpeechSynthesisVoice | undefined => {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  const voices = window.speechSynthesis.getVoices();
  return voices.find(voice => voice.lang.toLowerCase() === 'it-it') ||
    voices.find(voice => voice.lang.toLowerCase().startsWith('it')) ||
    voices[0];
};

export default function EmberWorkspace() {
  const [draft, setDraft] = useState('');
  const [entries, setEntries] = useState<EmberEntry[]>(INITIAL_ENTRIES);
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [lastHeard, setLastHeard] = useState('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const handledFinalRef = useRef(false);

  const voiceSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(getSpeechRecognitionConstructor()) && 'speechSynthesis' in window;
  }, []);

  const statusText = useMemo(
    () => voiceSupported ? 'LOCAL INTELLIGENCE + VOICE READY' : 'LOCAL INTELLIGENCE READY',
    [voiceSupported]
  );

  const stopSpeaking = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  };

  const speak = (text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'it-IT';
    utterance.rate = 0.96;
    utterance.pitch = 1.04;
    utterance.volume = 1;

    const voice = pickItalianVoice();
    if (voice) utterance.voice = voice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => {
      setIsSpeaking(false);
      setVoiceError('La voce di Ember non e disponibile in questo momento nel browser.');
    };

    window.speechSynthesis.speak(utterance);
  };

  const processMessage = (content: string, speakReply: boolean) => {
    const cleanContent = content.trim();
    if (!cleanContent) return;

    const timestamp = Date.now();
    const reply = buildLocalResponse(cleanContent);

    setEntries(previous => [
      ...previous,
      { id: `user-${timestamp}`, role: 'user', content: cleanContent },
      { id: `ember-${timestamp}`, role: 'ember', content: reply }
    ]);

    if (speakReply) speak(reply);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;

    processMessage(content, voiceModeEnabled);
    setDraft('');
  };

  const stopListening = () => {
    try {
      recognitionRef.current?.stop();
    } catch {
      // The browser may already have stopped the recognition session.
    }
    recognitionRef.current = null;
    setIsListening(false);
  };

  const startListening = () => {
    const Recognition = getSpeechRecognitionConstructor();
    if (!Recognition) {
      setVoiceError('Il riconoscimento vocale non e disponibile in questo browser.');
      return;
    }

    stopSpeaking();
    stopListening();
    setVoiceError('');
    setLastHeard('');
    handledFinalRef.current = false;

    const recognition = new Recognition();
    recognition.lang = 'it-IT';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setVoiceError('');
    };

    recognition.onresult = event => {
      if (handledFinalRef.current) return;

      let transcript = '';
      for (let index = 0; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (!result?.isFinal) continue;
        const alternative = result[0];
        if (alternative?.transcript) transcript += `${alternative.transcript} `;
      }

      const content = transcript.trim();
      if (!content) return;

      handledFinalRef.current = true;
      setLastHeard(content);
      processMessage(content, true);
      recognition.stop();
    };

    recognition.onerror = event => {
      setIsListening(false);
      const error = event.error || '';
      if (error === 'not-allowed' || error === 'service-not-allowed') {
        setVoiceError('Consenti a Sonara di usare il microfono nel browser, poi riprova.');
      } else if (error === 'no-speech') {
        setVoiceError('Non ho sentito la voce. Premi Parla con Ember e riprova.');
      } else {
        setVoiceError(`Voice Mode non disponibile: ${error || 'errore del browser'}.`);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setIsListening(false);
      setVoiceError('Non riesco ad avviare il microfono. Riprova tra un momento.');
    }
  };

  const toggleVoiceMode = () => {
    if (voiceModeEnabled) {
      stopListening();
      stopSpeaking();
      setVoiceModeEnabled(false);
      setVoiceError('');
      return;
    }

    if (!voiceSupported) {
      setVoiceError('Voice Mode richiede un browser con riconoscimento vocale e sintesi vocale disponibili.');
      return;
    }

    setVoiceModeEnabled(true);
    setVoiceError('');
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

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={toggleVoiceMode}
                className={voiceModeEnabled
                  ? 'flex items-center gap-2 rounded-xl border border-orange-300/50 bg-orange-500 px-4 py-2.5 text-xs font-black text-white shadow-lg shadow-orange-950/30'
                  : 'flex items-center gap-2 rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-2.5 text-xs font-black text-orange-200 transition hover:border-orange-300/60 hover:bg-orange-500/20'}
              >
                {voiceModeEnabled ? <Mic className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                Voice Mode
              </button>

              <div className="flex items-center gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-300">
                <ShieldCheck className="h-4 w-4" />
                No paid Sonara API
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 p-6 sm:grid-cols-2">
          {QUICK_ACTIONS.map(({ label, prompt, icon: Icon }) => (
            <button
              key={label}
              type="button"
              onClick={() => {
                if (voiceModeEnabled) {
                  processMessage(prompt, true);
                } else {
                  setDraft(prompt);
                }
              }}
              className="group rounded-2xl border border-white/10 bg-[#191c20] p-4 text-left transition hover:-translate-y-0.5 hover:border-orange-400/40 hover:bg-[#1d2025]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-300">
                  <Icon className="h-5 w-5" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#e9dfd4]/35">{voiceModeEnabled ? 'Voice' : 'Local'}</span>
              </div>
              <h2 className="mt-4 text-sm font-bold text-[#f5eee6]">{label}</h2>
              <p className="mt-2 text-xs leading-5 text-[#e9dfd4]/55">
                {voiceModeEnabled
                  ? 'Ember elabora la richiesta e ti risponde subito a voce.'
                  : 'Precarica una richiesta che Ember elabora senza API Sonara a pagamento.'}
              </p>
            </button>
          ))}
        </div>

        <div className="border-t border-white/10 p-6">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[#f5eee6]">
            <Lightbulb className="h-4 w-4 text-orange-300" />
            Creative direction
          </div>
          <p className="max-w-3xl text-sm leading-6 text-[#e9dfd4]/60">
            Ember resta separata dal motore ACE-Step: puo guidare prompt, genere, arrangiamento, BPM ed EQ senza alterare la pipeline audio stabile. Voice Mode usa le funzioni vocali disponibili nel browser e non richiede una API Sonara a pagamento.
          </p>
        </div>
      </section>

      <aside className="flex min-h-[620px] flex-col rounded-3xl border border-white/10 bg-[#0d1015] shadow-2xl shadow-black/30">
        <div className="flex items-center justify-between border-b border-white/10 p-5">
          <div className="flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-orange-300" />
            <h2 className="text-sm font-bold text-white">Conversation</h2>
          </div>
          <span className="text-[10px] uppercase tracking-[0.14em] text-white/35">
            {voiceModeEnabled ? 'Voice mode' : 'Local intelligence'}
          </span>
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

        {voiceModeEnabled ? (
          <div className="border-t border-white/10 p-4">
            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              className={isListening
                ? 'flex w-full items-center justify-center gap-3 rounded-2xl border border-red-300/40 bg-red-500 px-4 py-4 text-sm font-black text-white shadow-lg shadow-red-950/30'
                : 'flex w-full items-center justify-center gap-3 rounded-2xl border border-orange-300/40 bg-orange-500 px-4 py-4 text-sm font-black text-white shadow-lg shadow-orange-950/30 transition hover:bg-orange-400'}
            >
              {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              {isListening ? 'Sto ascoltando…' : 'Parla con Ember'}
            </button>

            {isSpeaking && (
              <button
                type="button"
                onClick={stopSpeaking}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/70"
              >
                <Volume2 className="h-4 w-4 text-orange-300" />
                Ember sta parlando · premi per fermarla
              </button>
            )}

            {lastHeard && (
              <p className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] leading-5 text-white/50">
                Ho sentito: “{lastHeard}”
              </p>
            )}

            {voiceError && (
              <p className="mt-3 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-2 text-[11px] leading-5 text-red-200">
                {voiceError}
              </p>
            )}

            <p className="mt-2 text-[10px] leading-4 text-white/30">Premi il microfono, parla, poi Ember risponde automaticamente a voce.</p>
          </div>
        ) : (
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
            {voiceError && (
              <p className="mt-2 text-[10px] leading-4 text-red-300">{voiceError}</p>
            )}
            <p className="mt-2 text-[10px] leading-4 text-white/30">Attiva Voice Mode per parlare con Ember senza scrivere.</p>
          </form>
        )}
      </aside>
    </div>
  );
}
