import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Download, Image as ImageIcon, Pause, Play, RefreshCw, Sparkles, Volume2, VolumeX } from 'lucide-react';
import { buildGenerationPrompt, type VocalMode } from '../../generationPrompt';
import { getFirebaseIdToken } from '../../lib/firebaseClient';
import { archiveGeneratedProject } from '../../services/generatedAssetVault';

type CandidateId = 'A' | 'B';
type CandidateState = {
  id: CandidateId;
  status: 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  stage: string;
  audioUrl: string;
  audioFormat: string;
  coverDataUrl: string;
  coverMime: string;
  coverFormat: string;
  coverPrompt: string;
  coverStatus: 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  coverError: string;
  coverRevision: number;
  jobId: string;
  error: string;
};

type Context = {
  rawPrompt: string;
  genreFamily: string;
  genre: string;
  subgenre: string;
  mood: string;
  keySignature: string;
  bpm: number;
  durationSec: number;
  weirdness: number;
  styleInfluence: number;
  title: string;
  vocalMode: VocalMode;
  vocalLanguageCode: string;
  vocalLanguageName: string;
  lyrics: string;
};

type CoverResponse = {
  coverDataUrl?: string;
  coverMime?: string;
  coverFormat?: string;
  coverPrompt?: string;
  variationId?: CandidateId;
  error?: { code?: string; message?: string } | string;
};

type JobResponse = {
  jobId?: string;
  status?: string;
  progress?: number;
  audioUrl?: string | null;
  audioUrls?: string[];
  candidates?: Array<{ id?: string; audioUrl?: string; audioFormat?: string }>;
  error?: string | { message?: string } | null;
  message?: string;
  metadata?: Record<string, any>;
  job?: JobResponse;
  data?: JobResponse;
  result?: JobResponse;
};

const empty = (id: CandidateId): CandidateState => ({
  id,
  status: 'IDLE',
  progress: 0,
  stage: 'Pronto',
  audioUrl: '',
  audioFormat: 'mp3',
  coverDataUrl: '',
  coverMime: 'image/webp',
  coverFormat: 'webp',
  coverPrompt: '',
  coverStatus: 'IDLE',
  coverError: '',
  coverRevision: 0,
  jobId: '',
  error: ''
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function normalize(value: JobResponse): JobResponse {
  return value?.job || value?.data || value;
}

function errorText(value: JobResponse, fallback: string) {
  if (typeof value.error === 'string') return value.error;
  if (value.error && typeof value.error.message === 'string') return value.error.message;
  return value.message || fallback;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; }
  catch { throw new Error(`Risposta SONARA non valida (HTTP ${response.status}).`); }
}

function readContext(textarea: HTMLTextAreaElement): Context {
  const card = textarea.closest('section');
  if (!card) throw new Error('Creator SONARA non disponibile.');
  const selects = Array.from(card.querySelectorAll('select')) as HTMLSelectElement[];
  const value = (index: number, fallback: string) => selects[index]?.value || fallback;
  const bpmInput = card.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
  const weirdnessInput = card.querySelector('#sonara-weirdness') as HTMLInputElement | null;
  const styleInfluenceInput = card.querySelector('#sonara-style-influence') as HTMLInputElement | null;
  const titleInput = Array.from(card.querySelectorAll('input')).find(input => {
    const field = input as HTMLInputElement;
    return field.type !== 'number' && field.type !== 'range';
  }) as HTMLInputElement | undefined;
  const details = card.querySelector('details');
  const activeVocalButton = details?.querySelector('button[data-sonara-vocal-mode][aria-pressed="true"]') as HTMLButtonElement | null;
  const rawVocalMode = String(activeVocalButton?.dataset.sonaraVocalMode || 'instrumental');
  const vocalMode = (['instrumental', 'male', 'female', 'duet'].includes(rawVocalMode) ? rawVocalMode : 'instrumental') as VocalMode;
  const lyricsTextarea = details?.querySelector('textarea') as HTMLTextAreaElement | null;
  const vocalLanguageSelect = details?.querySelector('#sonara-vocal-language') as HTMLSelectElement | null;
  return {
    rawPrompt: textarea.value.trim(),
    genreFamily: value(0, 'Electronic / Dance'),
    genre: value(1, 'House'),
    subgenre: value(2, value(1, 'House')),
    mood: value(3, 'Authentic'),
    keySignature: value(4, 'A Minor'),
    bpm: Number(bpmInput?.value || 124),
    durationSec: Number(value(5, '30')),
    weirdness: Number(weirdnessInput?.value || 50),
    styleInfluence: Number(styleInfluenceInput?.value || 50),
    title: titleInput?.value?.trim() || `Sonara ${value(2, 'Track')}`,
    vocalMode,
    vocalLanguageCode: vocalLanguageSelect?.value || 'en',
    vocalLanguageName: vocalLanguageSelect?.selectedOptions?.[0]?.textContent?.split(' — ').pop()?.trim() || 'English',
    lyrics: vocalMode === 'instrumental' ? '' : String(lyricsTextarea?.value || '').trim()
  };
}

function candidatesFrom(value: JobResponse) {
  if (Array.isArray(value.candidates) && value.candidates.length) return value.candidates.slice(0, 2);
  const urls = value.audioUrls || (value.audioUrl ? [value.audioUrl] : []);
  return urls.slice(0, 2).map((audioUrl, index) => ({ id: index === 0 ? 'A' : 'B', audioUrl, audioFormat: 'mp3' }));
}

function safeFileName(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9-_ ]+/g, '').trim().replace(/\s+/g, '-') || 'sonara-track';
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  const minutes = Math.floor(whole / 60);
  const remainder = String(whole % 60).padStart(2, '0');
  return `${minutes}:${remainder}`;
}

const GLOBAL_VOLUME_EVENT = 'sonara:global-player-volume';
const GLOBAL_VOLUME_STORAGE = 'sonara.globalPlayerVolume';

function readGlobalVolume() {
  if (typeof window === 'undefined') return 0.82;
  try {
    const stored = Number(window.localStorage.getItem(GLOBAL_VOLUME_STORAGE));
    return Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : 0.82;
  } catch {
    return 0.82;
  }
}

function ProfessionalCandidatePlayer({
  candidate,
  chosen,
  onChoose,
  onDownload
}: {
  candidate: CandidateState;
  chosen: boolean;
  onChoose: () => void;
  onDownload: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(readGlobalVolume);
  const [lastVolume, setLastVolume] = useState(() => {
    const initial = readGlobalVolume();
    return initial > 0.01 ? initial : 0.82;
  });
  const isMuted = volume <= 0.001;

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
  }, [candidate.audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.volume = volume;
  }, [candidate.audioUrl, volume]);

  useEffect(() => {
    const onGlobalVolume = (event: Event) => {
      const detail = (event as CustomEvent<{ volume?: number }>).detail;
      const next = Number(detail?.volume);
      if (!Number.isFinite(next)) return;
      const clamped = Math.max(0, Math.min(1, next));
      setVolume(clamped);
      if (clamped > 0.01) setLastVolume(clamped);
      if (audioRef.current) audioRef.current.volume = clamped;
    };
    window.addEventListener(GLOBAL_VOLUME_EVENT, onGlobalVolume);
    return () => window.removeEventListener(GLOBAL_VOLUME_EVENT, onGlobalVolume);
  }, []);

  const toggle = async () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      try {
        await audio.play();
        setPlaying(true);
      } catch {
        setPlaying(false);
      }
    } else {
      audio.pause();
      setPlaying(false);
    }
  };

  const seek = (value: number) => {
    const audio = audioRef.current;
    if (!audio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;
    const next = Math.max(0, Math.min(audio.duration, value));
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const applyVolume = (value: number) => {
    const next = Math.max(0, Math.min(1, value));
    setVolume(next);
    if (next > 0.01) setLastVolume(next);
    if (audioRef.current) audioRef.current.volume = next;
    try { window.localStorage.setItem(GLOBAL_VOLUME_STORAGE, String(next)); } catch {}
    window.dispatchEvent(new CustomEvent(GLOBAL_VOLUME_EVENT, {
      detail: { volume: next, source: `candidate-${candidate.id}` }
    }));
  };

  const toggleMute = () => {
    if (isMuted) {
      applyVolume(lastVolume > 0.01 ? lastVolume : 0.82);
      return;
    }
    setLastVolume(volume);
    applyVolume(0);
  };

  const percent = duration > 0 ? Math.max(0, Math.min(100, (currentTime / duration) * 100)) : 0;

  return (
    <div className="mt-4 rounded-2xl border border-white/[0.07] bg-black/25 p-3.5 shadow-inner shadow-black/20">
      <audio
        ref={audioRef}
        src={candidate.audioUrl}
        preload="metadata"
        className="hidden"
        data-sonara-custom-audio="true"
        onLoadedMetadata={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onDurationChange={event => setDuration(Number.isFinite(event.currentTarget.duration) ? event.currentTarget.duration : 0)}
        onTimeUpdate={event => setCurrentTime(event.currentTarget.currentTime || 0)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
      />

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void toggle()}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full border border-white/[0.10] bg-white text-black shadow-lg shadow-black/25 transition hover:scale-[1.03] hover:bg-zinc-100"
          aria-label={playing ? `Pausa brano ${candidate.id}` : `Riproduci brano ${candidate.id}`}
        >
          {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black tracking-[0.18em] text-zinc-500">MASTER {candidate.id}</span>
                {chosen && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2 py-0.5 text-[8px] font-black tracking-[0.12em] text-emerald-300">
                    <Check className="h-2.5 w-2.5" /> SELECTED
                  </span>
                )}
              </div>
              <div className="mt-0.5 truncate text-[11px] font-semibold text-zinc-200">SONARA generated track</div>
            </div>
            <div className="shrink-0 font-mono text-[9px] tabular-nums text-zinc-500">
              {formatTime(currentTime)} / {formatTime(duration)}
            </div>
          </div>

          <div className="relative mt-3 h-4">
            <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/[0.08]">
              <div className="h-full rounded-full bg-zinc-200 transition-[width] duration-75" style={{ width: `${percent}%` }} />
            </div>
            <input
              type="range"
              min={0}
              max={Math.max(duration, 0.01)}
              step={0.01}
              value={Math.min(currentTime, Math.max(duration, 0.01))}
              onChange={event => seek(Number(event.target.value))}
              aria-label={`Posizione brano ${candidate.id}`}
              className="absolute inset-0 h-4 w-full cursor-pointer opacity-0"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.06] pt-3">
        <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-zinc-600">
          {candidate.audioFormat.toUpperCase()} · READY
        </span>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <div
            className="flex min-w-[210px] items-center gap-2 rounded-xl border border-violet-400/30 bg-violet-500/10 px-2.5 py-2 shadow-[0_0_22px_rgba(139,92,246,0.10)]"
            data-sonara-candidate-volume={candidate.id}
            aria-label={`Controllo volume brano ${candidate.id}`}
          >
            <span className="shrink-0 text-[9px] font-black tracking-[0.12em] text-violet-200">VOLUME {candidate.id}</span>
            <button
              type="button"
              onClick={toggleMute}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-white/[0.08] bg-black/20 text-violet-100 transition hover:bg-violet-500/20 hover:text-white"
              aria-label={isMuted ? `Riattiva volume brano ${candidate.id}` : `Silenzia volume brano ${candidate.id}`}
              title={`Volume ${candidate.id}: ${Math.round(volume * 100)}%`}
            >
              {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={event => applyVolume(Number(event.target.value))}
              aria-label={`Volume brano ${candidate.id}`}
              className="h-2 min-w-20 flex-1 cursor-pointer accent-violet-500"
            />
            <span className="w-9 shrink-0 text-right font-mono text-[9px] font-bold tabular-nums text-violet-100">{Math.round(volume * 100)}%</span>
          </div>
          <button
            type="button"
            onClick={onChoose}
            className={`rounded-lg px-3 py-2 text-[9px] font-black tracking-[0.08em] transition ${chosen ? 'bg-white text-black' : 'border border-white/[0.09] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08] hover:text-white'}`}
          >
            {chosen ? 'SELECTED' : 'SELECT'}
          </button>
          <button
            type="button"
            onClick={onDownload}
            className="grid h-8 w-8 place-items-center rounded-lg border border-white/[0.09] bg-white/[0.04] text-zinc-400 transition hover:bg-white/[0.08] hover:text-white"
            aria-label={`Scarica brano ${candidate.id}`}
            title={`Scarica ${candidate.audioFormat.toUpperCase()}`}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ElevenMusicGenerationControl() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<CandidateId | null>(null);
  const [error, setError] = useState('');
  const [autoCover, setAutoCover] = useState(true);
  const [coverStyle, setCoverStyle] = useState('auto');
  const [coverTextMode, setCoverTextMode] = useState('none');
  const [candidates, setCandidates] = useState<CandidateState[]>([empty('A'), empty('B')]);

  useEffect(() => {
    let original: HTMLButtonElement | null = null;
    const connect = () => {
      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      const card = textarea?.closest('section');
      if (!textarea || !card) return;
      const button = Array.from(card.querySelectorAll('button')).find(candidate => {
        const cls = String((candidate as HTMLButtonElement).className || '');
        return cls.includes('bg-gradient-to-r') && cls.includes('w-full');
      }) as HTMLButtonElement | undefined;
      if (!button) return;
      original = button;
      button.style.display = 'none';
      let host = card.querySelector('[data-sonara-eleven-generator-host]') as HTMLElement | null;
      if (!host) {
        host = document.createElement('div');
        host.dataset.sonaraElevenGeneratorHost = 'true';
        button.insertAdjacentElement('afterend', host);
      }
      setMountNode(host);
    };
    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (original) original.style.display = '';
    };
  }, []);

  const processing = (jobId: string, progress: number, stage: string) => {
    setCandidates(previous => previous.map(item => item.audioUrl ? item : ({ ...item, status: 'PROCESSING', progress, stage, jobId })));
  };

  const generateCover = async (
    candidateId: CandidateId,
    context: Context,
    generationId: string,
    token: string,
    revision = 0
  ) => {
    setCandidates(previous => previous.map(item => item.id === candidateId
      ? { ...item, coverStatus: 'PROCESSING', coverError: '', coverRevision: revision }
      : item));
    try {
      const response = await fetch('/api/eleven-music/cover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          rawPrompt: context.rawPrompt,
          title: context.title,
          genreFamily: context.genreFamily,
          genre: context.genre,
          subgenre: context.subgenre,
          mood: context.mood,
          bpm: context.bpm,
          keySignature: context.keySignature,
          vocalMode: context.vocalMode,
          variationId: candidateId,
          generationPairId: generationId,
          style: coverStyle,
          textMode: coverTextMode,
          revision
        })
      });
      const payload = await readJson<CoverResponse>(response);
      if (!response.ok || !payload.coverDataUrl) {
        const message = typeof payload.error === 'string'
          ? payload.error
          : payload.error?.message || `Copertina ${candidateId} non generata (HTTP ${response.status}).`;
        throw new Error(message);
      }
      setCandidates(previous => previous.map(item => item.id === candidateId ? {
        ...item,
        coverDataUrl: String(payload.coverDataUrl),
        coverMime: String(payload.coverMime || 'image/webp'),
        coverFormat: String(payload.coverFormat || 'webp'),
        coverPrompt: String(payload.coverPrompt || ''),
        coverStatus: 'COMPLETED',
        coverError: '',
        coverRevision: revision
      } : item));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setCandidates(previous => previous.map(item => item.id === candidateId
        ? { ...item, coverStatus: 'FAILED', coverError: message, coverRevision: revision }
        : item));
    }
  };

  const regenerateCover = async (candidate: CandidateState) => {
    const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
    if (!textarea) return;
    try {
      const context = readContext(textarea);
      const token = await getFirebaseIdToken(true);
      const stored = localStorage.getItem('sonara.lastGenerationPairId');
      const generationId = stored || `cover-${Date.now()}`;
      await generateCover(candidate.id, context, generationId, token, candidate.coverRevision + 1);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setCandidates(previous => previous.map(item => item.id === candidate.id ? { ...item, coverStatus: 'FAILED', coverError: message } : item));
    }
  };

  const downloadCover = (candidate: CandidateState) => {
    if (!candidate.coverDataUrl) return;
    const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
    let title = 'sonara-track';
    try { if (textarea) title = readContext(textarea).title; } catch {}
    const link = document.createElement('a');
    link.href = candidate.coverDataUrl;
    link.download = `${safeFileName(title)}-${candidate.id}-cover.${candidate.coverFormat || 'webp'}`.toLowerCase();
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const applyCompleted = async (jobId: string, response: JobResponse, context: Context, generationId: string, token: string) => {
    const outputs = candidatesFrom(response);
    if (outputs.length < 2 || !outputs[0]?.audioUrl || !outputs[1]?.audioUrl) {
      throw new Error('SONARA ha completato la generazione ma non ha restituito entrambi i brani.');
    }
    const completed = outputs.slice(0, 2).map((output, index) => ({
      id: (index === 0 ? 'A' : 'B') as CandidateId,
      status: 'COMPLETED' as const,
      progress: 100,
      stage: `Master ${index === 0 ? 'A' : 'B'} pronto`,
      audioUrl: String(output.audioUrl),
      audioFormat: String(output.audioFormat || 'mp3').toLowerCase(),
      jobId,
      error: ''
    }));

    // Audio and cover generation are parallel. Preserve any cover that completed
    // while the music engine was rendering instead of overwriting its state here.
    setCandidates(previous => completed.map(candidate => {
      const existing = previous.find(item => item.id === candidate.id) || empty(candidate.id);
      return { ...existing, ...candidate };
    }));
    setBusy(false);

    void Promise.allSettled(completed.map(candidate => archiveGeneratedProject({
      jobId: `${jobId}-${candidate.id}`,
      title: context.title,
      genre: context.genre,
      subgenre: context.subgenre,
      bpm: context.bpm,
      keySignature: context.keySignature,
      durationSec: context.durationSec,
      primaryAudioUrl: candidate.audioUrl,
      audioFormat: candidate.audioFormat,
      primaryImageUrl: candidate.coverDataUrl || undefined,
      imageFormat: candidate.coverFormat || undefined,
      response: {
        generationPairId: generationId,
        variationId: candidate.id,
        completedJob: response,
        performanceProfile: 'sonara-dual-master',
        creativeControls: { weirdness: context.weirdness, styleInfluence: context.styleInfluence }
      }
    })));

    void (async () => {
      try {
        const billing = await fetch('/api/billing/status', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        if (billing.ok) {
          const payload = await billing.json();
          if (payload?.billing) window.dispatchEvent(new CustomEvent('sonara:billing-updated', { detail: payload.billing }));
        }
      } catch {}
    })();
  };

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setSelected(null);
    setError('');
    setCandidates([empty('A'), empty('B')]);
    try {
      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      if (!textarea) throw new Error('Apri il Music Creator prima di generare.');
      const context = readContext(textarea);
      if (!context.rawPrompt) throw new Error('Scrivi o crea prima il prompt musicale.');
      if (context.vocalMode !== 'instrumental' && !context.lyrics) throw new Error('Inserisci il testo prima della generazione vocale.');

      const finalPrompt = buildGenerationPrompt({
        rawPrompt: context.rawPrompt,
        genreFamily: context.genreFamily,
        genre: context.genre,
        subgenre: context.subgenre,
        mood: context.mood,
        bpm: context.bpm,
        key: context.keySignature,
        durationSec: context.durationSec,
        weirdness: context.weirdness,
        styleInfluence: context.styleInfluence,
        vocalMode: context.vocalMode,
        vocalLanguage: context.vocalLanguageName,
        lyrics: context.lyrics,
        title: context.title
      });

      const token = await getFirebaseIdToken(true);
      const generationId = crypto.randomUUID ? crypto.randomUUID() : `generation-${Date.now()}`;
      localStorage.setItem('sonara.lastGenerationPairId', generationId);
      processing('', 8, autoCover ? 'SONARA: audio + copertine A/B in parallelo' : 'SONARA: generazione dei 2 master');

      if (autoCover) {
        void generateCover('A', context, generationId, token, 0);
        void generateCover('B', context, generationId, token, 0);
      }

      const response = await fetch('/api/billing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          prompt: finalPrompt,
          rawPrompt: context.rawPrompt,
          creatorPrompt: context.rawPrompt,
          sonaraCreatorPromptAuthoritative: context.rawPrompt,
          sonaraOriginalCreatorBrief: context.rawPrompt,
          genreFamily: context.genreFamily,
          genre: context.genre,
          subgenre: context.subgenre,
          mood: context.mood,
          vocalMode: context.vocalMode,
          vocalLanguage: context.vocalLanguageCode,
          lyricsLanguage: context.vocalLanguageCode,
          language: context.vocalLanguageCode,
          lyrics: context.lyrics,
          title: context.title,
          bpm: context.bpm,
          requestedBpm: context.bpm,
          key: context.keySignature,
          durationSec: context.durationSec,
          duration: context.durationSec,
          weirdness: context.weirdness,
          styleInfluence: context.styleInfluence,
          provider: 'eleven_music',
          engineProvider: 'eleven_music',
          engineId: 'sonara_eleven_music_v2',
          candidateCount: 2,
          candidate_count: 2,
          generationPairId: generationId
        })
      });
      const payload = normalize(await readJson<JobResponse>(response));
      if (!response.ok) throw new Error(errorText(payload, `SONARA non avviato (HTTP ${response.status}).`));
      const jobId = String(payload.jobId || '');
      if (!jobId) throw new Error('SONARA non ha restituito il job ID.');

      if (String(payload.status || '').toUpperCase() === 'COMPLETED') {
        await applyCompleted(jobId, payload, context, generationId, token);
        return;
      }

      processing(jobId, Math.max(10, Number(payload.progress || 10)), String(payload.metadata?.currentStage || 'SONARA: rendering'));
      const deadline = Date.now() + Math.max(10 * 60_000, context.durationSec * 5000);
      while (Date.now() < deadline) {
        await sleep(2000);
        const poll = await fetch(`/api/music/job/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
        if (!poll.ok) continue;
        const current = normalize(await readJson<JobResponse>(poll));
        const status = String(current.status || 'PROCESSING').toUpperCase();
        if (status === 'FAILED') throw new Error(errorText(current, 'Generazione SONARA fallita.'));
        if (status === 'COMPLETED') {
          await applyCompleted(jobId, current, context, generationId, token);
          return;
        }
        processing(jobId, Math.max(10, Number(current.progress || 10)), String(current.metadata?.currentStage || 'SONARA: rendering'));
      }
      throw new Error('SONARA sta impiegando più del previsto.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setCandidates(previous => previous.map(item => item.audioUrl ? item : ({ ...item, status: 'FAILED', progress: 0, stage: 'Errore', error: message })));
    } finally {
      setBusy(false);
    }
  };

  const choose = (candidate: CandidateState) => {
    if (!candidate.audioUrl) return;
    setSelected(candidate.id);
    const detail = { variationId: candidate.id, jobId: candidate.jobId, audioUrl: candidate.audioUrl, audioFormat: candidate.audioFormat, coverUrl: candidate.coverDataUrl, title: `SONARA Master ${candidate.id}`, selectedAt: new Date().toISOString() };
    localStorage.setItem('sonara.selectedGeneratedTrack', JSON.stringify(detail));
    window.dispatchEvent(new CustomEvent('sonara:generated-track-selected', { detail }));
  };

  const download = async (candidate: CandidateState) => {
    if (!candidate.audioUrl) return;
    const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
    let title = 'sonara-track';
    try { if (textarea) title = readContext(textarea).title; } catch {}
    try {
      const response = await fetch(candidate.audioUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${safeFileName(title)}-${candidate.id}.${candidate.audioFormat || 'mp3'}`.toLowerCase();
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch {
      window.open(candidate.audioUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (!mountNode) return null;
  return createPortal(
    <div className="mt-6 space-y-4">
      <div className="grid gap-3 rounded-2xl border border-violet-400/15 bg-violet-500/[0.04] p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
        <label className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
          <span><strong className="block text-[10px] text-zinc-100">Genera copertine automaticamente</strong><small className="text-[8px] text-zinc-500">A + B insieme all'audio</small></span>
          <input type="checkbox" checked={autoCover} onChange={event => setAutoCover(event.target.checked)} className="h-4 w-4 accent-violet-500" />
        </label>
        <label className="flex items-center gap-2 text-[9px] text-zinc-400">STILE
          <select value={coverStyle} onChange={event => setCoverStyle(event.target.value)} className="rounded-lg border border-white/[0.08] bg-[#111117] px-2 py-2 text-[9px] text-zinc-200">
            <option value="auto">Auto</option><option value="cinematic">Cinematica</option><option value="realistic">Realistica</option><option value="abstract">Astratta</option><option value="minimal">Minimal</option><option value="futuristic">Futuristica</option><option value="dark">Dark</option><option value="tropical">Tropical</option><option value="retro">Retro</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[9px] text-zinc-400">TESTO
          <select value={coverTextMode} onChange={event => setCoverTextMode(event.target.value)} className="rounded-lg border border-white/[0.08] bg-[#111117] px-2 py-2 text-[9px] text-zinc-200">
            <option value="none">Nessuno</option><option value="title">Titolo</option>
          </select>
        </label>
      </div>
      <button type="button" onClick={() => void generate()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 px-6 py-4 font-bold text-white shadow-lg shadow-purple-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <><RefreshCw className="h-5 w-5 animate-spin" />SONARA STA GENERANDO AUDIO + COVER...</> : <><Sparkles className="h-5 w-5" />GENERA A + B · AUDIO + COVER</>}
      </button>
      {error && <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-xs text-rose-300">{error}</div>}
      {candidates.some(candidate => candidate.status !== 'IDLE') && (
        <div className="grid gap-3 lg:grid-cols-2">
          {candidates.map(candidate => {
            const completed = candidate.status === 'COMPLETED' && Boolean(candidate.audioUrl);
            const chosen = selected === candidate.id;
            return (
              <article
                key={candidate.id}
                className={`rounded-[20px] border p-4 transition ${chosen ? 'border-white/20 bg-white/[0.055]' : 'border-white/[0.07] bg-[#101013]'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="grid h-7 w-7 place-items-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-[10px] font-black text-zinc-200">{candidate.id}</span>
                      <div>
                        <div className="text-[11px] font-black tracking-[0.06em] text-white">SONARA MASTER</div>
                        <div className="mt-0.5 truncate text-[9px] text-zinc-600">{candidate.stage}</div>
                      </div>
                    </div>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[8px] font-black tracking-[0.12em] ${completed ? 'bg-emerald-400/10 text-emerald-300' : candidate.status === 'FAILED' ? 'bg-rose-400/10 text-rose-300' : 'bg-white/[0.04] text-zinc-500'}`}>
                    {completed ? 'READY' : candidate.status}
                  </span>
                </div>

                {candidate.status === 'PROCESSING' && (
                  <div className="mt-4">
                    <div className="mb-2 flex items-center justify-between text-[9px] font-semibold text-zinc-600">
                      <span>Rendering</span><span>{candidate.progress}%</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                      <div className="h-full rounded-full bg-zinc-300 transition-all" style={{ width: `${candidate.progress}%` }} />
                    </div>
                  </div>
                )}

                {candidate.error && <div className="mt-4 rounded-xl border border-rose-500/15 bg-rose-500/[0.06] p-3 text-[10px] text-rose-300">{candidate.error}</div>}

                {completed && (
                  <>
                    <div className="mt-4 grid gap-4 sm:grid-cols-[180px_1fr]">
                      <div className="relative aspect-square overflow-hidden rounded-2xl border border-violet-400/20 bg-gradient-to-br from-violet-950/70 via-[#101019] to-blue-950/60 shadow-lg shadow-purple-950/20" data-sonara-candidate-cover={candidate.id}>
                        {candidate.coverDataUrl ? (
                          <img src={candidate.coverDataUrl} alt={`Copertina Master ${candidate.id}`} className="h-full w-full object-cover" />
                        ) : (
                          <div className="grid h-full place-items-center p-4 text-center">
                            {candidate.coverStatus === 'PROCESSING' ? <RefreshCw className="h-7 w-7 animate-spin text-violet-300" /> : <ImageIcon className="h-8 w-8 text-zinc-600" />}
                            <span className="absolute bottom-3 left-3 right-3 text-[8px] font-bold uppercase tracking-[0.12em] text-zinc-500">{candidate.coverStatus === 'PROCESSING' ? 'CREAZIONE COVER' : 'COVER NON DISPONIBILE'}</span>
                          </div>
                        )}
                        <span className="absolute left-2 top-2 rounded-full border border-white/10 bg-black/55 px-2 py-1 text-[8px] font-black tracking-[0.12em] text-white backdrop-blur">MASTER {candidate.id}</span>
                      </div>
                      <div className="flex min-w-0 flex-col justify-between rounded-2xl border border-white/[0.06] bg-black/20 p-4">
                        <div>
                          <div className="text-lg font-black tracking-tight text-white">{(() => { try { const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null; return textarea ? readContext(textarea).title : `SONARA MASTER ${candidate.id}`; } catch { return `SONARA MASTER ${candidate.id}`; } })()}</div>
                          <div className="mt-1 text-[10px] text-zinc-500">AUDIO + COVER · identità visiva coordinata A/B</div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <button type="button" onClick={() => void download(candidate)} className="inline-flex items-center gap-2 rounded-lg border border-white/[0.09] bg-white/[0.04] px-3 py-2 text-[9px] font-black text-zinc-200 hover:bg-white/[0.08]"><Download className="h-3.5 w-3.5" />SCARICA {candidate.audioFormat.toUpperCase()}</button>
                          <button type="button" onClick={() => downloadCover(candidate)} disabled={!candidate.coverDataUrl} className="inline-flex items-center gap-2 rounded-lg border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-[9px] font-black text-violet-100 disabled:opacity-35"><ImageIcon className="h-3.5 w-3.5" />SCARICA COVER</button>
                          <button type="button" onClick={() => void regenerateCover(candidate)} disabled={candidate.coverStatus === 'PROCESSING'} className="inline-flex items-center gap-2 rounded-lg border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-[9px] font-black text-blue-100 disabled:opacity-35"><RefreshCw className={`h-3.5 w-3.5 ${candidate.coverStatus === 'PROCESSING' ? 'animate-spin' : ''}`} />RIGENERA COPERTINA</button>
                        </div>
                        {candidate.coverError && <div className="mt-3 text-[9px] text-amber-300">Cover: {candidate.coverError}</div>}
                      </div>
                    </div>
                    <ProfessionalCandidatePlayer
                      candidate={candidate}
                      chosen={chosen}
                      onChoose={() => choose(candidate)}
                      onDownload={() => void download(candidate)}
                    />
                  </>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>,
    mountNode
  );
}