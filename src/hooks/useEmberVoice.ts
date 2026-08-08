import { useEffect, useRef, useState } from 'react';
import { EmberMessage } from '../types/ember';
import { EmberVoiceConfig } from '../types/emberVoice';

const AUTO_SPEAK_STORAGE_KEY = 'sonara.ember.autoSpeak';
const VOICE_CONFIG_URL = '/api/ember/voice/config';
const VOICE_SPEECH_URL = '/api/ember/voice/speech';

const initialConfig: EmberVoiceConfig = {
  enabled: false,
  providerConfigured: false,
  capabilities: { speech: true, realtime: false }
};

function getInitialAutoSpeak(): boolean {
  try {
    return localStorage.getItem(AUTO_SPEAK_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function voiceErrorMessage(response: Response, payload: unknown): string {
  const code = typeof payload === 'object' && payload && 'error' in payload &&
    typeof (payload as { error?: { code?: unknown } }).error?.code === 'string'
    ? (payload as { error: { code: string } }).error.code
    : '';
  if (code === 'EMBER_VOICE_DISABLED') return "Voce Ember pronta per l'attivazione.";
  if (response.status === 401 || response.status === 403) return 'Accedi per usare la voce Ember.';
  return 'La voce Ember non e disponibile in questo momento.';
}

export function useEmberVoice(messages: EmberMessage[]) {
  const [config, setConfig] = useState<EmberVoiceConfig>(initialConfig);
  const [isLoading, setIsLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeakState] = useState(getInitialAutoSpeak);
  const [hasCachedAudio, setHasCachedAudio] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const lastAudioBlobRef = useRef<Blob | null>(null);
  const synthesisInFlightRef = useRef(false);
  const requestIdRef = useRef(0);
  const lastAssistantIdRef = useRef<string | null>(null);

  const cleanupCurrentAudio = (expectedAudio?: HTMLAudioElement) => {
    if (expectedAudio && audioRef.current !== expectedAudio) return;
    const audio = audioRef.current;
    const objectUrl = objectUrlRef.current;
    audioRef.current = null;
    objectUrlRef.current = null;

    if (audio) {
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
    }
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  };

  const stop = (cancelRequest = true) => {
    if (cancelRequest) requestIdRef.current += 1;
    cleanupCurrentAudio();
    setIsPlaying(false);
    setIsLoading(false);
  };

  const playBlob = async (blob: Blob): Promise<void> => {
    cleanupCurrentAudio();
    const objectUrl = URL.createObjectURL(blob);
    const audio = new Audio(objectUrl);
    objectUrlRef.current = objectUrl;
    audioRef.current = audio;
    const finishPlayback = () => {
      cleanupCurrentAudio(audio);
      setIsPlaying(false);
    };
    audio.onended = finishPlayback;
    audio.onerror = () => {
      finishPlayback();
      setError('Impossibile riprodurre la voce Ember.');
    };
    try {
      await audio.play();
      if (audioRef.current === audio) setIsPlaying(true);
    } catch (error) {
      finishPlayback();
      throw error;
    }
  };

  const speak = async (rawText: string): Promise<void> => {
    const text = rawText.trim();
    if (!config.enabled || !text || isLoading || synthesisInFlightRef.current) return;

    synthesisInFlightRef.current = true;
    stop();
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(VOICE_SPEECH_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(voiceErrorMessage(response, payload));
      }
      const blob = await response.blob();
      if (requestId !== requestIdRef.current) return;
      lastAudioBlobRef.current = blob;
      setHasCachedAudio(true);
      await playBlob(blob);
    } catch (requestError) {
      if (requestId === requestIdRef.current) {
        setError(requestError instanceof Error ? requestError.message : 'La voce Ember non e disponibile in questo momento.');
      }
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
      synthesisInFlightRef.current = false;
    }
  };

  const replay = async (): Promise<void> => {
    if (!lastAudioBlobRef.current || isLoading) return;
    setError(null);
    try {
      await playBlob(lastAudioBlobRef.current);
    } catch {
      setError('Impossibile riprodurre la voce Ember.');
    }
  };

  const setAutoSpeak = (enabled: boolean) => {
    setAutoSpeakState(enabled);
    try {
      localStorage.setItem(AUTO_SPEAK_STORAGE_KEY, String(enabled));
    } catch {
      // The setting remains available for the current session when storage is unavailable.
    }
  };

  useEffect(() => {
    let active = true;
    void fetch(VOICE_CONFIG_URL, { credentials: 'same-origin', cache: 'no-store' })
      .then(async response => {
        if (!response.ok) return initialConfig;
        return await response.json() as EmberVoiceConfig;
      })
      .then(nextConfig => {
        if (active) setConfig(nextConfig);
      })
      .catch(() => {
        if (active) setConfig(initialConfig);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const latestAssistant = [...messages].reverse().find(message => message.role === 'assistant');
    if (!latestAssistant) return;
    if (lastAssistantIdRef.current === null) {
      lastAssistantIdRef.current = latestAssistant.id;
      return;
    }
    if (latestAssistant.id === lastAssistantIdRef.current) return;
    lastAssistantIdRef.current = latestAssistant.id;
    if (autoSpeak && config.enabled) void speak(latestAssistant.content);
  }, [autoSpeak, config.enabled, messages]);

  useEffect(() => () => stop(), []);

  return {
    available: config.capabilities.speech,
    enabled: config.enabled,
    isLoading,
    isPlaying,
    error,
    autoSpeak,
    hasCachedAudio,
    speak,
    stop,
    replay,
    setAutoSpeak
  };
}