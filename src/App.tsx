import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Download,
  History,
  Music,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Zap
} from 'lucide-react';
import { ProfessionalAudioEqualizer } from './components/eq/ProfessionalAudioEqualizer';

type JobStatus = 'IDLE' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
type EngineHealth = 'CHECKING' | 'READY' | 'OFFLINE';

interface JobResponse {
  jobId?: string;
  status?: JobStatus | string;
  progress?: number;
  audioUrl?: string | null;
  error?: string | null;
  metadata?: {
    currentStage?: string;
    engine?: string;
    audioUrl?: string;
    error?: string;
    title?: string;
    genre?: string;
    bpm?: number;
    [key: string]: unknown;
  };
  result?: {
    jobId?: string;
    audioUrl?: string;
    engine?: string;
    [key: string]: unknown;
  };
  data?: JobResponse;
  job?: JobResponse;
  message?: string;
}

interface AceStepHealthResponse {
  status?: string;
  isAvailable?: boolean;
  engineName?: string;
  service?: string;
  version?: string | null;
  apiUrl?: string | null;
  error?: string | null;
}

interface HistoryItem {
  jobId: string;
  fileName: string;
  audioUrl: string;
  title: string;
  genre?: string | null;
  bpm?: number | null;
  durationSec?: number | null;
  engine?: string | null;
  qualityScore?: number | null;
  sizeBytes?: number;
  createdAt: string;
}

interface HistoryResponse {
  status?: string;
  total?: number;
  items?: HistoryItem[];
}

const sleep = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

const normalizeJob = (value: JobResponse): JobResponse =>
  value?.job || value?.data || value;

export default function App() {
  const [prompt, setPrompt] = useState(
    'Deep House and Tech House with Afro House influence, 124 BPM, deep rolling bassline, punchy four-on-the-floor kick, organic tribal percussion, congas, bongos, shakers, hypnotic groove, warm piano chords, atmospheric pads and a polished club mix.'
  );
  const [genre, setGenre] = useState('Tech House');
  const [bpm, setBpm] = useState(124);
  const [durationSec, setDurationSec] = useState(15);

  const [status, setStatus] = useState<JobStatus>('IDLE');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Ready');
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [engine, setEngine] = useState('Sonara V12 ACE-Step Engine');
  const [health, setHealth] = useState<EngineHealth>('CHECKING');
  const [healthDetails, setHealthDetails] = useState<AceStepHealthResponse | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void checkHealth();
    void loadHistory();

    const timer = window.setInterval(() => {
      void checkHealth();
    }, 15000);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;

    if (isPlaying) {
      void audio.play().catch(playError => {
        console.error('Playback failed:', playError);
        setIsPlaying(false);
      });
    } else {
      audio.pause();
    }
  }, [isPlaying, audioUrl]);

  const checkHealth = async () => {
    setHealth(previous => previous === 'READY' ? previous : 'CHECKING');

    try {
      const response = await fetch('/api/engine/ace-step/health', { cache: 'no-store' });
      const data: AceStepHealthResponse = await response.json();
      setHealthDetails(data);
      setHealth(response.ok && data.isAvailable ? 'READY' : 'OFFLINE');
    } catch (healthError) {
      console.error('ACE-Step health check failed:', healthError);
      setHealthDetails({
        isAvailable: false,
        service: 'ACE-Step',
        error: healthError instanceof Error ? healthError.message : String(healthError)
      });
      setHealth('OFFLINE');
    }
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    setHistoryError('');

    try {
      const response = await fetch('/api/engine/history', { cache: 'no-store' });
      const data: HistoryResponse = await response.json();

      if (!response.ok) {
        throw new Error('Could not load generation history.');
      }

      setHistory(Array.isArray(data.items) ? data.items : []);
    } catch (historyLoadError) {
      console.error('History load failed:', historyLoadError);
      setHistoryError(
        historyLoadError instanceof Error
          ? historyLoadError.message
          : String(historyLoadError)
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const openHistoryItem = (item: HistoryItem) => {
    setAudioUrl(item.audioUrl);
    setJobId(item.jobId);
    setEngine(item.engine || 'ACE-Step 1.5');
    setStatus('COMPLETED');
    setProgress(100);
    setStage('Loaded from generation history.');
    setError('');
    setIsPlaying(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const generate = async () => {
    if (!prompt.trim() || status === 'QUEUED' || status === 'PROCESSING') return;

    if (health !== 'READY') {
      setError(
        healthDetails?.error ||
        'ACE-Step is offline. Start the Colab/API service and refresh the engine status.'
      );
      setStatus('FAILED');
      setStage('ACE-Step offline');
      return;
    }

    setStatus('QUEUED');
    setProgress(0);
    setStage('Sending generation request...');
    setError('');
    setAudioUrl('');
    setJobId('');
    setIsPlaying(false);

    try {
      const response = await fetch('/api/engine/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          genre,
          mood: 'Energetic',
          lyrics: '',
          title: 'Sonara AI Track',
          bpm,
          durationSec,
          duration: durationSec,
          engineId: 'sonara_ace_step_v12'
        })
      });

      let responseData: JobResponse;
      try {
        responseData = await response.json();
      } catch {
        throw new Error(`The server returned invalid JSON (HTTP ${response.status}).`);
      }

      if (!response.ok) {
        throw new Error(
          responseData.error ||
          responseData.message ||
          `Generation request failed with HTTP ${response.status}.`
        );
      }

      const initial = normalizeJob(responseData);
      const id = responseData.jobId || responseData.result?.jobId || initial.jobId;

      if (!id) {
        throw new Error('The server did not return a job ID.');
      }

      setJobId(id);
      setStatus('PROCESSING');
      setStage('ACE-Step is generating the track...');

      // Up to 15 minutes of polling so long 4-minute renders can finish on slower GPUs.
      const maximumAttempts = 3000;

      for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
        await sleep(300);

        const pollResponse = await fetch(`/api/music/job/${encodeURIComponent(id)}`, {
          cache: 'no-store'
        });

        if (!pollResponse.ok) continue;

        const rawPollData: JobResponse = await pollResponse.json();
        const current = normalizeJob(rawPollData);
        const currentStatus = String(current.status || 'PROCESSING').toUpperCase();
        const currentMetadata = current.metadata || {};
        const currentAudioUrl =
          current.audioUrl ||
          currentMetadata.audioUrl ||
          responseData.audioUrl ||
          responseData.result?.audioUrl ||
          '';

        setProgress(Number(current.progress || 0));
        setStage(
          currentMetadata.currentStage ||
          (currentStatus === 'COMPLETED' ? 'Generation complete' : 'Processing...')
        );

        if (currentMetadata.engine) setEngine(currentMetadata.engine);

        if (currentStatus === 'COMPLETED') {
          if (!currentAudioUrl) {
            throw new Error('The job completed but no audio URL was returned.');
          }

          setAudioUrl(currentAudioUrl);
          setProgress(100);
          setStatus('COMPLETED');
          setStage('Generation complete — audio ready.');
          void loadHistory();
          return;
        }

        if (currentStatus === 'FAILED') {
          throw new Error(
            current.error ||
            currentMetadata.error ||
            'The generation job failed.'
          );
        }
      }

      throw new Error('Generation timed out while waiting for the audio file.');
    } catch (generationError) {
      const message = generationError instanceof Error ? generationError.message : String(generationError);

      console.error('Generation failed:', generationError);
      setError(message);
      setStatus('FAILED');
      setProgress(0);
      setStage('Generation failed');
      void checkHealth();
    }
  };

  const busy = status === 'QUEUED' || status === 'PROCESSING';
  const engineReady = health === 'READY';

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      <header className="border-b border-slate-800 bg-[#0d1322] px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600">
              <Music className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">SONARA AI</h1>
              <p className="text-xs text-slate-400">ACE-Step 1.5 Remote Generator</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void checkHealth()}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs ${
              engineReady
                ? 'border-emerald-800 bg-emerald-950/40 text-emerald-300'
                : health === 'CHECKING'
                  ? 'border-amber-800 bg-amber-950/40 text-amber-300'
                  : 'border-red-900 bg-red-950/40 text-red-300'
            }`}
            title={healthDetails?.apiUrl || 'ACE-Step API status'}
          >
            <Activity className="h-3.5 w-3.5" />
            ACE-Step {health}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-6">
        {health === 'OFFLINE' && (
          <section className="rounded-xl border border-red-900 bg-red-950/30 p-4 text-sm text-red-200">
            <div className="font-semibold">ACE-Step is offline</div>
            <div className="mt-1 text-xs text-red-300/80">
              {healthDetails?.error || 'The remote ACE-Step API cannot be reached.'}
            </div>
            <button type="button" onClick={() => void checkHealth()} className="mt-3 rounded-lg border border-red-800 px-3 py-1.5 text-xs font-medium">
              Retry connection
            </button>
          </section>
        )}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
          <div className="mb-5 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-400" />
            <h2 className="font-semibold">Generate Music</h2>
          </div>

          <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={5} placeholder="Describe the track..." className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm outline-none focus:border-purple-500" />

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <label className="space-y-1 text-xs text-slate-400">
              <span>Genre</span>
              <select value={genre} onChange={event => setGenre(event.target.value)} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100">
                <option>Deep House</option><option>Tech House</option><option>Afro House</option><option>Melodic House</option><option>Pop EDM</option>
              </select>
            </label>

            <label className="space-y-1 text-xs text-slate-400">
              <span>BPM: {bpm}</span>
              <input type="range" min={60} max={180} value={bpm} onChange={event => setBpm(Number(event.target.value))} className="w-full accent-purple-500" />
            </label>

            <label className="space-y-1 text-xs text-slate-400">
              <span>Duration</span>
              <select value={durationSec} onChange={event => setDurationSec(Number(event.target.value))} className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100">
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>1 minute</option>
                <option value={120}>2 minutes</option>
                <option value={180}>3 minutes</option>
                <option value={240}>4 minutes</option>
              </select>
            </label>
          </div>

          <button type="button" onClick={() => void generate()} disabled={busy || !prompt.trim() || !engineReady} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 px-6 py-3.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? <><RefreshCw className="h-5 w-5 animate-spin" />Generating...</> : <><Zap className="h-5 w-5" />Generate Track</>}
          </button>
        </section>

        {(busy || status === 'FAILED') && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between text-sm"><span>{stage}</span><span className="font-mono text-purple-300">{progress}%</span></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>
            {jobId && <p className="mt-2 text-[11px] text-slate-500">Job: {jobId}</p>}
            {error && <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">{error}</pre>}
          </section>
        )}

        {status === 'COMPLETED' && audioUrl && (
          <>
            <section className="rounded-2xl border border-emerald-800/60 bg-slate-900/80 p-6 shadow-xl">
              <div className="mb-5 flex items-center justify-between">
                <div><h2 className="font-semibold text-emerald-300">Generation Complete</h2><p className="mt-1 text-xs text-slate-400">{engine}</p></div>
                <span className="rounded-full border border-emerald-800 bg-emerald-950 px-3 py-1 text-xs text-emerald-300">WAV READY</span>
              </div>

              <audio ref={audioRef} controls preload="metadata" src={audioUrl} onEnded={() => setIsPlaying(false)} className="w-full">Your browser does not support audio playback.</audio>

              <div className="mt-5 flex flex-wrap gap-3">
                <button type="button" onClick={() => setIsPlaying(previous => !previous)} className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium">
                  {isPlaying ? <><Pause className="h-4 w-4" />Pause</> : <><Play className="h-4 w-4" />Play</>}
                </button>
                <a href={audioUrl} download={`Sonara-${jobId || 'track'}.wav`} className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium"><Download className="h-4 w-4" />Download WAV</a>
              </div>
            </section>

            <section className="overflow-hidden rounded-2xl border border-purple-800/50 bg-slate-900/80 shadow-xl">
              <div className="border-b border-slate-800 px-6 py-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-purple-200">Professional EQ & Mastering</h2>
                    <p className="mt-1 text-xs text-slate-400">26-band realtime EQ with presets, metering and processed WAV export.</p>
                  </div>
                  <span className="rounded-full border border-purple-800 bg-purple-950/40 px-3 py-1 text-xs text-purple-300">EQ LIVE</span>
                </div>
              </div>

              <ProfessionalAudioEqualizer
                audioUrl={audioUrl}
                isEmbedded
                onProcessedAudio={(processedAudioUrl) => {
                  setAudioUrl(processedAudioUrl);
                  setIsPlaying(false);
                  setStage('EQ processed — mastered audio ready.');
                  void loadHistory();
                }}
              />
            </section>
          </>
        )}

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2"><History className="h-5 w-5 text-purple-400" /><h2 className="font-semibold">Generation History</h2></div>
            <button type="button" onClick={() => void loadHistory()} disabled={historyLoading} className="flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-xs disabled:opacity-50">
              <RefreshCw className={`h-3.5 w-3.5 ${historyLoading ? 'animate-spin' : ''}`} />Refresh
            </button>
          </div>

          {historyError && <div className="mb-4 rounded-lg border border-red-900 bg-red-950/30 p-3 text-xs text-red-300">{historyError}</div>}

          {!historyLoading && history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-700 p-6 text-center text-sm text-slate-500">No generated tracks found yet.</div>
          ) : (
            <div className="space-y-3">
              {history.map(item => (
                <div key={item.jobId} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{item.title || 'Sonara Track'}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                      {item.genre && <span>{item.genre}</span>}
                      {item.bpm && <span>{item.bpm} BPM</span>}
                      {item.durationSec && <span>{item.durationSec >= 60 ? `${item.durationSec / 60} min` : `${item.durationSec}s`}</span>}
                      {typeof item.qualityScore === 'number' && <span>Score {item.qualityScore.toFixed(2)}</span>}
                      <span>{new Date(item.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <button type="button" onClick={() => openHistoryItem(item)} className="flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-xs font-medium"><Play className="h-3.5 w-3.5" />Open</button>
                    <a href={item.audioUrl} download={item.fileName} className="flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-medium"><Download className="h-3.5 w-3.5" />WAV</a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
