import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  BrainCircuit,
  Lightbulb,
  LoaderCircle,
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

type LocalModelStatus = 'checking' | 'ready' | 'fallback';

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
    content: 'Ciao, sono Ember. Voice Mode zero-costo e pronto. Se troviamo un modello locale sul computer, usero quello; altrimenti continuo con il cervello Sonara integrato.'
  }
];

const buildLocalResponse = (message: string): string => {
  const normalized = message.toLowerCase();

  if (normalized.includes('prompt') || normalized.includes('raffin')) {
    return 'Mantieni il genere scelto come vincolo principale e descrivi solo elementi compatibili: groove, basso, batteria, atmosfera, struttura e qualita del mix. Evita generi secondari non richiesti. Una forma efficace e: genere esatto, groove, basso, percussioni, atmosfera, arrangiamento e mix. Se vuoi un brano strumentale, specifica anche senza voci.';
  }

  if (normalized.includes('genere') || normalized.includes('genre') || normalized.includes('sottogenere')) {
    return 'Per proteggere il genre lock, tratta genere e sottogenere selezionati come identita primaria del brano. Gli altri termini devono descrivere atmosfera, energia o tecnica di produzione, non nuovi generi. Se il risultato si ibrida troppo, riduci gli aggettivi stilistici e rafforza ritmo, timbri e arrangiamento tipici del genere scelto.';
  }

  if (normalized.includes('arrang') || normalized.includes('struttura') || normalized.includes('club')) {
    return 'Per una struttura club efficace: intro ritmica pulita, ingresso progressivo del basso, prima sezione principale, breakdown breve, ricostruzione della tensione, seconda sezione principale piu piena e outro DJ-friendly. Fai evolvere il groove con automazioni, variazioni percussive e micro-pause invece di cambiare stile.';
  }

  if (normalized.includes('eq') || normalized.includes('master') || normalized.includes('mix')) {
    return 'Parti dal bilanciamento e poi usa EQ sottrattiva leggera. Proteggi sub e kick da sovrapposizioni, correggi i low-mid solo se davvero impastati e conserva presenza e aria senza rendere il master aggressivo. Sul master fai piccoli interventi, lascia headroom e confronta spesso con il segnale non processato.';
  }

  if (normalized.includes('bpm') || normalized.includes('tempo')) {
    return 'Usa il BPM selezionato come vincolo ritmico stabile. Per cambiare la sensazione di energia, lavora su densita delle percussioni, sincopi, pause e durata delle sezioni invece di cambiare tempo.';
  }

  if (normalized.includes('ciao') || normalized.includes('ember')) {
    return 'Eccomi. Sono Ember. Parlami normalmente: posso ragionare con te su prompt, genere, arrangiamento, BPM, EQ e mastering, e in Voice Mode ti rispondo a voce.';
  }

  return 'Dimmi che risultato vuoi ottenere dalla traccia. Posso aiutarti a trasformarlo in una direzione precisa per prompt, genere, arrangiamento, BPM, mix e mastering.';
};

const getSpeechRecognitionConstructor = (): SpeechRecognitionConstructorLike | null => {
  if (typeof window === 'undefined') return null;

  const browserWindow = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructorLike;
    webkitSpeechRecognition?: SpeechRecognitionConstructorLike;
  };

  return browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition || null;
};

const scoreVoice = (voice: SpeechSynthesisVoice): number => {
  const lang = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();
  let score = lang === 'it-it' ? 300 : lang.startsWith('it') ? 240 : 0;

  if (name.includes('natural')) score += 180;
  if (name.includes('neural')) score += 160;
  if (name.includes('online')) score += 80;
  if (name.includes('isabella')) score += 70;
  if (name.includes('elsa')) score += 60;
  if (name.includes('cosimo')) score += 55;
  if (name.includes('google')) score += 30;
  if (!voice.localService) score += 20;

  return score;
};

const rankVoices = (voices: SpeechSynthesisVoice[]) =>
  [...voices].sort((a, b) => scoreVoice(b) - scoreVoice(a));

export default function EmberWorkspace() {
  const [draft, setDraft] = useState('');
  const [entries, setEntries] = useState<EmberEntry[]>(INITIAL_ENTRIES);
  const [voiceModeEnabled, setVoiceModeEnabled] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [voiceError, setVoiceError] = useState('');
  const [lastHeard, setLastHeard] = useState('');
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceName, setSelectedVoiceName] = useState('');
  const [localModelStatus, setLocalModelStatus] = useState<LocalModelStatus>('checking');
  const [localModelName, setLocalModelName] = useState('');

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const handledFinalRef = useRef(false);
  const voiceModeEnabledRef = useRef(false);
  const processingRef = useRef(false);
  const entriesRef = useRef<EmberEntry[]>(INITIAL_ENTRIES);

  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  useEffect(() => {
    voiceModeEnabledRef.current = voiceModeEnabled;
  }, [voiceModeEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const refreshVoices = () => {
      const ranked = rankVoices(window.speechSynthesis.getVoices());
      setVoices(ranked);
      setSelectedVoiceName(previous => previous || ranked[0]?.name || '');
    };

    refreshVoices();
    window.speechSynthesis.onvoiceschanged = refreshVoices;

    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkLocalModel = async () => {
      try {
        const response = await fetch('/api/ember/status');
        if (!response.ok) throw new Error('status unavailable');
        const payload = await response.json() as { available?: boolean; model?: string | null };
        if (cancelled) return;

        if (payload.available && payload.model) {
          setLocalModelStatus('ready');
          setLocalModelName(payload.model);
        } else {
          setLocalModelStatus('fallback');
          setLocalModelName('');
        }
      } catch {
        if (!cancelled) {
          setLocalModelStatus('fallback');
          setLocalModelName('');
        }
      }
    };

    void checkLocalModel();
    return () => {
      cancelled = true;
    };
  }, []);

  const voiceSupported = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(getSpeechRecognitionConstructor()) && 'speechSynthesis' in window;
  }, []);

  const selectedVoice = useMemo(
    () => voices.find(voice => voice.name === selectedVoiceName) || voices[0],
    [selectedVoiceName, voices]
  );

  const statusText = useMemo(() => {
    if (!voiceSupported) return 'LOCAL INTELLIGENCE READY';
    if (localModelStatus === 'ready') return 'LOCAL AI + VOICE READY';
    return 'ZERO-COST VOICE READY';
  }, [localModelStatus, voiceSupported]);

  const stopSpeaking = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
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
    if (!voiceModeEnabledRef.current || processingRef.current) return;

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
      recognition.stop();
      void processMessage(content, true);
    };

    recognition.onerror = event => {
      setIsListening(false);
      const error = event.error || '';
      if (error === 'not-allowed' || error === 'service-not-allowed') {
        setVoiceError('Consenti a Sonara di usare il microfono nel browser, poi riprova.');
      } else if (error === 'no-speech') {
        setVoiceError('Non ho sentito la voce. Premi il microfono e riprova.');
      } else if (error !== 'aborted') {
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

  const speak = (text: string, continueConversation = true) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = selectedVoice?.lang || 'it-IT';
    utterance.rate = 1.02;
    utterance.pitch = 1.0;
    utterance.volume = 1;
    if (selectedVoice) utterance.voice = selectedVoice;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      if (continueConversation && voiceModeEnabledRef.current) {
        window.setTimeout(() => startListening(), 350);
      }
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setVoiceError('La voce selezionata non e disponibile in questo momento. Prova un altra voce.');
    };

    window.speechSynthesis.speak(utterance);
  };

  const askLocalModel = async (content: string): Promise<string | null> => {
    try {
      const conversation = entriesRef.current.slice(-14).map(entry => ({
        role: entry.role === 'ember' ? 'assistant' : 'user',
        content: entry.content
      }));

      const response = await fetch('/api/ember/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...conversation, { role: 'user', content }]
        })
      });

      if (!response.ok) return null;
      const payload = await response.json() as { reply?: string; model?: string };
      const reply = payload.reply?.trim();
      if (!reply) return null;

      setLocalModelStatus('ready');
      if (payload.model) setLocalModelName(payload.model);
      return reply;
    } catch {
      return null;
    }
  };

  const processMessage = async (content: string, speakReply: boolean) => {
    const cleanContent = content.trim();
    if (!cleanContent || processingRef.current) return;

    processingRef.current = true;
    setIsThinking(true);
    setVoiceError('');

    const timestamp = Date.now();
    setEntries(previous => [
      ...previous,
      { id: `user-${timestamp}`, role: 'user', content: cleanContent }
    ]);

    const modelReply = await askLocalModel(cleanContent);
    const reply = modelReply || buildLocalResponse(cleanContent);

    if (!modelReply && localModelStatus === 'checking') {
      setLocalModelStatus('fallback');
    }

    setEntries(previous => [
      ...previous,
      { id: `ember-${timestamp}`, role: 'ember', content: reply }
    ]);

    processingRef.current = false;
    setIsThinking(false);

    if (speakReply) speak(reply, true);
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const content = draft.trim();
    if (!content) return;

    void processMessage(content, voiceModeEnabled);
    setDraft('');
  };

  const toggleVoiceMode = () => {
    if (voiceModeEnabledRef.current) {
      voiceModeEnabledRef.current = false;
      setVoiceModeEnabled(false);
      stopListening();
      stopSpeaking();
      setVoiceError('');
      return;
    }

    if (!voiceSupported) {
      setVoiceError('Voice Mode richiede un browser con riconoscimento vocale e sintesi vocale disponibili.');
      return;
    }

    voiceModeEnabledRef.current = true;
    setVoiceModeEnabled(true);
    setVoiceError('');
    window.setTimeout(() => startListening(), 250);
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
                Zero paid API
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
                  void processMessage(prompt, true);
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
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#e9dfd4]/35">{voiceModeEnabled ? 'Voice' : 'Zero cost'}</span>
              </div>
              <h2 className="mt-4 text-sm font-bold text-[#f5eee6]">{label}</h2>
              <p className="mt-2 text-xs leading-5 text-[#e9dfd4]/55">
                {voiceModeEnabled
                  ? 'Ember elabora la richiesta e continua la conversazione a voce.'
                  : 'Usa il cervello locale disponibile senza attivare API a pagamento.'}
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
            Questa fase resta a costo zero. Ember prova prima un modello AI installato localmente sul computer e, se non lo trova, usa il cervello integrato di Sonara. Voice Mode seleziona automaticamente la voce italiana piu naturale disponibile nel browser e riapre il microfono dopo ogni risposta per una conversazione piu fluida.
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
            {localModelStatus === 'ready' ? `Local AI · ${localModelName}` : 'Built-in brain'}
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

          {isThinking && (
            <div className="mr-5 flex items-center gap-2 rounded-2xl border border-orange-400/10 bg-orange-500/[0.04] px-4 py-3 text-xs text-orange-200/70">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Ember sta pensando…
            </div>
          )}
        </div>

        {voiceModeEnabled ? (
          <div className="border-t border-white/10 p-4">
            <div className="mb-3">
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.14em] text-white/35">Voce Ember</label>
              <select
                value={selectedVoiceName}
                onChange={event => setSelectedVoiceName(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-white/70 outline-none focus:border-orange-400/40"
              >
                {voices.map(voice => (
                  <option key={`${voice.name}-${voice.lang}`} value={voice.name}>
                    {voice.name} · {voice.lang}{voice.name.toLowerCase().includes('natural') || voice.name.toLowerCase().includes('neural') ? ' · Natural' : ''}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={isListening ? stopListening : startListening}
              disabled={isThinking || isSpeaking}
              className={isListening
                ? 'flex w-full items-center justify-center gap-3 rounded-2xl border border-red-300/40 bg-red-500 px-4 py-4 text-sm font-black text-white shadow-lg shadow-red-950/30'
                : 'flex w-full items-center justify-center gap-3 rounded-2xl border border-orange-300/40 bg-orange-500 px-4 py-4 text-sm font-black text-white shadow-lg shadow-orange-950/30 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50'}
            >
              {isListening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              {isListening ? 'Sto ascoltando…' : isThinking ? 'Ember sta pensando…' : isSpeaking ? 'Ember sta parlando…' : 'Parla con Ember'}
            </button>

            {isSpeaking && (
              <button
                type="button"
                onClick={stopSpeaking}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-white/70"
              >
                <Volume2 className="h-4 w-4 text-orange-300" />
                Ferma la voce
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

            <p className="mt-2 text-[10px] leading-4 text-white/30">Voice Mode resta aperto: dopo la risposta Ember torna automaticamente in ascolto.</p>
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
                disabled={isThinking}
                className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-white transition hover:bg-orange-400 disabled:opacity-50"
                title="Invia a Ember"
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
