import React, { FormEvent, useEffect, useRef, useState } from 'react';
import {
  AudioLines,
  Flame,
  Lightbulb,
  Loader2,
  MessageCircleMore,
  Mic,
  PhoneOff,
  RotateCcw,
  Send,
  Sparkles,
  Square,
  Volume2,
  WandSparkles,
  Waves
} from 'lucide-react';
import { getFirebaseIdToken } from '../../lib/firebaseClient';

interface StudioContext {
  prompt: string;
  genre: string;
  subgenre: string;
  mood: string;
  bpm: number;
  keySignature: string;
  hasAudio: boolean;
}

interface EmberWorkspaceProps {
  studioContext: StudioContext;
}

interface EmberMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface EmberConfig {
  chatEnabled: boolean;
  voiceEnabled: boolean;
  realtimeEnabled: boolean;
  voice?: string;
  realtimeVoice?: string;
}

type RealtimeState = 'idle' | 'connecting' | 'listening' | 'thinking' | 'speaking';

const REALTIME_LABELS: Record<RealtimeState, string> = {
  idle: 'Modalita vocale inattiva',
  connecting: 'Connessione sicura a Ember...',
  listening: 'Ti ascolto. Parla liberamente.',
  thinking: 'Ember sta pensando...',
  speaking: 'Ember sta parlando'
};

const AUTO_SPEAK_KEY = 'sonara.ember.autoSpeak';
const WELCOME: EmberMessage = {
  id: 'ember-welcome',
  role: 'assistant',
  content: 'Ciao, sono Ember, la tua AI Creative Director. Dimmi cosa vuoi creare o migliorare nella tua traccia.'
};

const QUICK_ACTIONS = [
  { label: 'Raffina il prompt', icon: WandSparkles, prompt: 'Raffina il prompt corrente rendendolo piu preciso e professionale.' },
  { label: 'Analizza la traccia', icon: AudioLines, prompt: 'Analizza il contesto della traccia e indicami i tre miglioramenti piu importanti.' },
  { label: 'Guida EQ', icon: Lightbulb, prompt: 'Suggerisci una direzione EQ professionale per questo genere e sottogenere.' },
  { label: 'Idea creativa', icon: Sparkles, prompt: 'Proponi una variazione creativa coerente con il mood e il genere selezionati.' }
];

function errorMessage(response: Response, payload: any): string {
  const code = payload?.error?.code;
  if (response.status === 401 || response.status === 403) return 'Sessione scaduta. Accedi di nuovo per usare Ember.';
  if (code === 'EMBER_NOT_CONFIGURED' || code === 'EMBER_VOICE_NOT_CONFIGURED') {
    return 'La chiave API di Ember deve essere attivata sul server.';
  }
  if (response.status === 429) return 'Limite temporaneo raggiunto. Attendi qualche minuto e riprova.';
  return payload?.error?.message || 'Ember non e disponibile in questo momento.';
}

async function emberFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getFirebaseIdToken();
  return fetch(`/api/ember/${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
      Authorization: `Bearer ${token}`
    }
  });
}

export default function EmberWorkspace({ studioContext }: EmberWorkspaceProps) {
  const [messages, setMessages] = useState<EmberMessage[]>([WELCOME]);
  const [input, setInput] = useState('');
  const [config, setConfig] = useState<EmberConfig>({ chatEnabled: false, voiceEnabled: false, realtimeEnabled: false });
  const [configReady, setConfigReady] = useState(false);
  const [sending, setSending] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voicePlaying, setVoicePlaying] = useState(false);
  const [realtimeState, setRealtimeState] = useState<RealtimeState>('idle');
  const [error, setError] = useState('');
  const [autoSpeak, setAutoSpeakState] = useState(() => localStorage.getItem(AUTO_SPEAK_KEY) === 'true');
  const [lastAudio, setLastAudio] = useState<Blob | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const conversationRef = useRef<HTMLDivElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const realtimeAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let active = true;
    void emberFetch('config', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(errorMessage(response, payload));
        if (active) setConfig(payload as EmberConfig);
      })
      .catch(loadError => {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Impossibile verificare Ember.');
      })
      .finally(() => {
        if (active) setConfigReady(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    conversationRef.current?.scrollTo({ top: conversationRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, sending]);

  const stopVoice = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setVoicePlaying(false);
  };

  const stopRealtime = (updateState = true) => {
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    microphoneStreamRef.current?.getTracks().forEach(track => track.stop());
    microphoneStreamRef.current = null;
    if (realtimeAudioRef.current) {
      realtimeAudioRef.current.pause();
      realtimeAudioRef.current.srcObject = null;
      realtimeAudioRef.current = null;
    }
    if (updateState) setRealtimeState('idle');
  };

  useEffect(() => () => {
    stopVoice();
    stopRealtime(false);
  }, []);

  const startRealtime = async () => {
    if (realtimeState !== 'idle') return;
    if (!config.realtimeEnabled) {
      setError('La conversazione vocale in tempo reale deve essere attivata sul server.');
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof RTCPeerConnection === 'undefined') {
      setError('Questo browser non supporta la conversazione vocale in tempo reale.');
      return;
    }

    stopVoice();
    setError('');
    setRealtimeState('connecting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      microphoneStreamRef.current = stream;

      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;
      stream.getAudioTracks().forEach(track => peerConnection.addTrack(track, stream));

      const remoteAudio = new Audio();
      remoteAudio.autoplay = true;
      realtimeAudioRef.current = remoteAudio;
      peerConnection.ontrack = event => {
        remoteAudio.srcObject = event.streams[0];
        void remoteAudio.play().catch(() => {
          setError('Tocca nuovamente il microfono per consentire la riproduzione audio.');
        });
      };
      peerConnection.onconnectionstatechange = () => {
        if (peerConnection.connectionState === 'failed' || peerConnection.connectionState === 'disconnected') {
          stopRealtime();
          setError('La conversazione vocale si e interrotta. Riprova.');
        }
      };

      const dataChannel = peerConnection.createDataChannel('oai-events');
      dataChannelRef.current = dataChannel;
      dataChannel.addEventListener('open', () => setRealtimeState('listening'));
      dataChannel.addEventListener('close', () => {
        if (dataChannelRef.current === dataChannel) setRealtimeState('idle');
      });
      dataChannel.addEventListener('message', event => {
        try {
          const payload = JSON.parse(String(event.data || '{}'));
          const type = String(payload?.type || '');
          if (type === 'input_audio_buffer.speech_started') setRealtimeState('listening');
          else if (type === 'input_audio_buffer.speech_stopped' || type === 'response.created') setRealtimeState('thinking');
          else if (type.includes('audio.delta')) setRealtimeState('speaking');
          else if (type === 'response.done') setRealtimeState('listening');
          else if (type === 'error') setError(String(payload?.error?.message || 'Errore nella conversazione vocale.'));
        } catch {
          // Ignore non-JSON diagnostic events from the realtime channel.
        }
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      const params = new URLSearchParams({
        genre: studioContext.genre,
        subgenre: studioContext.subgenre,
        mood: studioContext.mood,
        bpm: String(studioContext.bpm),
        keySignature: studioContext.keySignature,
        hasAudio: String(studioContext.hasAudio)
      });
      const response = await emberFetch(`realtime?${params.toString()}`, {
        method: 'POST',
        body: offer.sdp || '',
        headers: { 'Content-Type': 'application/sdp', Accept: 'application/sdp' }
      });
      const answer = await response.text();
      if (!response.ok) {
        let payload: any = null;
        try { payload = JSON.parse(answer); } catch { /* The upstream response was not JSON. */ }
        throw new Error(errorMessage(response, payload));
      }
      await peerConnection.setRemoteDescription({ type: 'answer', sdp: answer });
    } catch (realtimeError) {
      stopRealtime();
      const permissionDenied = realtimeError instanceof DOMException && realtimeError.name === 'NotAllowedError';
      setError(permissionDenied
        ? 'Permesso microfono negato. Abilitalo nelle impostazioni del browser e riprova.'
        : realtimeError instanceof Error ? realtimeError.message : 'Impossibile avviare la conversazione vocale.');
    }
  };

  const playBlob = async (blob: Blob) => {
    stopVoice();
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    objectUrlRef.current = url;
    audioRef.current = audio;
    audio.onended = stopVoice;
    audio.onerror = () => {
      stopVoice();
      setError('Impossibile riprodurre la voce di Ember.');
    };
    await audio.play();
    setVoicePlaying(true);
  };

  const speak = async (text: string) => {
    if (!config.voiceEnabled || voiceLoading || !text.trim()) return;
    setVoiceLoading(true);
    setError('');
    try {
      const response = await emberFetch('speech', {
        method: 'POST',
        body: JSON.stringify({ text: text.slice(0, 3_000) })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(errorMessage(response, payload));
      }
      const blob = await response.blob();
      setLastAudio(blob);
      await playBlob(blob);
    } catch (speechError) {
      setError(speechError instanceof Error ? speechError.message : 'La voce di Ember non e disponibile.');
    } finally {
      setVoiceLoading(false);
    }
  };

  const sendMessage = async (rawMessage: string) => {
    const content = rawMessage.trim();
    if (!content || sending) return;

    const userMessage: EmberMessage = { id: `ember-user-${Date.now()}`, role: 'user', content };
    const history = messages.map(({ role, content: messageContent }) => ({ role, content: messageContent }));
    setMessages(previous => [...previous, userMessage]);
    setInput('');
    setSending(true);
    setError('');
    try {
      const response = await emberFetch('chat', {
        method: 'POST',
        body: JSON.stringify({ message: content, history, studioContext })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || typeof payload?.reply !== 'string') {
        throw new Error(errorMessage(response, payload));
      }
      const assistantMessage: EmberMessage = {
        id: `ember-assistant-${Date.now()}`,
        role: 'assistant',
        content: payload.reply
      };
      setMessages(previous => [...previous, assistantMessage]);
      if (autoSpeak && config.voiceEnabled) void speak(assistantMessage.content);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Ember non e disponibile.');
    } finally {
      setSending(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const setAutoSpeak = (enabled: boolean) => {
    setAutoSpeakState(enabled);
    localStorage.setItem(AUTO_SPEAK_KEY, String(enabled));
  };

  const latestAssistant = [...messages].reverse().find(message => message.role === 'assistant');
  const realtimeActive = realtimeState !== 'idle';

  return (
    <div className="overflow-hidden rounded-2xl border border-purple-500/20 bg-[#080d18] shadow-2xl shadow-purple-950/20">
      <div className="flex flex-col gap-5 border-b border-white/10 bg-gradient-to-r from-purple-950/55 via-[#0c1220] to-cyan-950/30 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-center gap-4">
          <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-full border border-fuchsia-400/40 bg-gradient-to-br from-fuchsia-600 via-purple-600 to-indigo-700 shadow-lg shadow-purple-950/70">
            <Flame className="h-8 w-8 text-white" />
            <span className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-[#080d18] bg-emerald-400" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-black text-white">Ember</h2>
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">AI Director Online</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">Creative intelligence · Sonara Enterprise</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-3 py-1.5 text-[10px] font-bold ${configReady && config.realtimeEnabled ? 'border-cyan-500/25 bg-cyan-500/10 text-cyan-300' : 'border-amber-500/25 bg-amber-500/10 text-amber-300'}`}>
            {configReady && config.realtimeEnabled ? 'VOCE LIVE PRONTA' : configReady ? 'API DA ATTIVARE' : 'VERIFICA API...'}
          </span>
          <label className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] text-slate-300">
            <input type="checkbox" checked={autoSpeak} onChange={event => setAutoSpeak(event.target.checked)} disabled={!config.voiceEnabled || realtimeActive} className="accent-purple-500" />
            Parla automaticamente
          </label>
        </div>
      </div>

      <div className="grid lg:grid-cols-[270px_1fr]">
        <aside className="border-b border-white/10 p-5 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-widest text-purple-300"><Sparkles className="h-4 w-4" />Azioni rapide</div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {QUICK_ACTIONS.map(({ label, icon: Icon, prompt }) => (
              <button key={label} type="button" onClick={() => void sendMessage(prompt)} disabled={sending || realtimeActive || !config.chatEnabled} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.035] p-3 text-left text-xs font-semibold text-slate-300 transition hover:border-purple-500/40 hover:bg-purple-500/10 hover:text-white disabled:opacity-50">
                <Icon className="h-4 w-4 text-purple-400" />{label}
              </button>
            ))}
          </div>
          <div className="mt-5 rounded-xl border border-cyan-500/15 bg-cyan-500/[0.06] p-3 text-[11px] leading-5 text-cyan-100/75">
            <b className="text-cyan-300">Contesto Studio</b><br />
            {studioContext.genre} · {studioContext.subgenre}<br />
            {studioContext.mood} · {studioContext.bpm} BPM · {studioContext.keySignature}
          </div>
        </aside>

        <section className="min-w-0 p-5 sm:p-6">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-bold text-white"><MessageCircleMore className="h-4 w-4 text-purple-400" />Conversazione</div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => realtimeActive ? stopRealtime() : void startRealtime()} disabled={!config.realtimeEnabled && !realtimeActive} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-[10px] font-black transition ${realtimeActive ? 'border-rose-500/40 bg-rose-500/15 text-rose-200' : 'border-cyan-500/35 bg-cyan-500/10 text-cyan-200 hover:bg-cyan-500/20'} disabled:opacity-40`}>
                {realtimeState === 'connecting' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : realtimeActive ? <PhoneOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {realtimeState === 'connecting' ? 'Connessione...' : realtimeActive ? 'Termina' : 'Parla con Ember'}
              </button>
              {voicePlaying ? (
                <button type="button" onClick={stopVoice} className="flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-[10px] font-bold text-rose-300"><Square className="h-3.5 w-3.5" />Stop</button>
              ) : (
                <button type="button" onClick={() => latestAssistant && void speak(latestAssistant.content)} disabled={realtimeActive || !config.voiceEnabled || voiceLoading || !latestAssistant} className="flex items-center gap-1.5 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-[10px] font-bold text-purple-200 disabled:opacity-40">
                  {voiceLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Volume2 className="h-3.5 w-3.5" />}{voiceLoading ? 'Preparazione...' : 'Ascolta Ember'}
                </button>
              )}
              <button type="button" onClick={() => lastAudio && void playBlob(lastAudio)} disabled={!lastAudio || voicePlaying} className="rounded-lg border border-white/10 p-2 text-slate-400 disabled:opacity-30" aria-label="Ripeti voce Ember" title="Replay"><RotateCcw className="h-3.5 w-3.5" /></button>
            </div>
          </div>

          <div ref={conversationRef} className="h-[360px] space-y-3 overflow-y-auto rounded-xl border border-white/10 bg-slate-950/70 p-4" aria-live="polite">
            {realtimeActive ? (
              <div className="flex h-full flex-col items-center justify-center px-4 text-center">
                <div className="relative mb-7 flex h-28 w-28 items-center justify-center">
                  <span className={`absolute inset-0 rounded-full bg-fuchsia-500/15 ${realtimeState === 'listening' || realtimeState === 'speaking' ? 'animate-ping' : ''}`} />
                  <span className={`absolute inset-3 rounded-full bg-gradient-to-br from-fuchsia-500/35 to-cyan-500/20 blur-md ${realtimeState === 'thinking' ? 'animate-pulse' : ''}`} />
                  <span className="relative flex h-20 w-20 items-center justify-center rounded-full border border-fuchsia-300/40 bg-gradient-to-br from-fuchsia-600 via-purple-600 to-indigo-700 shadow-2xl shadow-fuchsia-950">
                    {realtimeState === 'connecting' ? <Loader2 className="h-9 w-9 animate-spin text-white" /> : realtimeState === 'speaking' ? <Waves className="h-10 w-10 animate-pulse text-white" /> : <Mic className="h-9 w-9 text-white" />}
                  </span>
                </div>
                <h3 className="text-lg font-black text-white">Conversazione diretta con Ember</h3>
                <p className="mt-2 text-sm font-semibold text-fuchsia-200">{REALTIME_LABELS[realtimeState]}</p>
                <p className="mt-3 max-w-md text-xs leading-5 text-slate-400">Parla naturalmente. Ember riconosce le pause, risponde con la sua voce e puoi interromperla iniziando a parlare.</p>
                <button type="button" onClick={() => stopRealtime()} className="mt-6 flex items-center gap-2 rounded-full border border-rose-500/35 bg-rose-500/10 px-5 py-2.5 text-xs font-bold text-rose-200 hover:bg-rose-500/20"><PhoneOff className="h-4 w-4" />Termina conversazione</button>
              </div>
            ) : messages.map(message => (
              <div key={message.id} className={message.role === 'user' ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 text-xs leading-5 text-white' : 'max-w-[90%] rounded-2xl rounded-bl-md border border-white/10 bg-white/[0.045] px-4 py-3 text-xs leading-5 text-slate-200'}>
                {message.role === 'assistant' && <span className="mb-1 block text-[9px] font-black uppercase tracking-widest text-fuchsia-300">Ember</span>}
                {message.content}
              </div>
            ))}
            {!realtimeActive && sending && <div className="flex max-w-[90%] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-xs text-slate-400"><Loader2 className="h-4 w-4 animate-spin text-purple-400" />Ember sta analizzando...</div>}
          </div>

          {error && <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">{error}</div>}

          <form onSubmit={submit} className="mt-3 flex gap-2">
            <input value={input} onChange={event => setInput(event.target.value)} disabled={realtimeActive || sending || !config.chatEnabled} maxLength={4000} placeholder={realtimeActive ? 'Conversazione vocale in corso...' : 'Scrivi un messaggio a Ember...'} className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-600 focus:border-purple-500 disabled:opacity-60" />
            <button type="submit" disabled={realtimeActive || sending || !input.trim() || !config.chatEnabled} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 to-purple-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-40"><Send className="h-4 w-4" /><span className="hidden sm:inline">Invia</span></button>
          </form>
        </section>
      </div>
    </div>
  );
}
