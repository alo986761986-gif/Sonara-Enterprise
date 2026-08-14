import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  Download,
  Music,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Zap
} from 'lucide-react';

type JobStatus = 'IDLE' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface EngineModel {
  id: string;
  name: string;
  version?: string;
  maxDurationSec?: number;
  stemsSupport?: boolean;
}

interface EngineModelsResponse {
  activeEngineId?: string;
  models?: EngineModel[];
}

interface JobResponse {
  jobId?: string;
  status?: JobStatus | string;
  progress?: number;
  audioUrl?: string | null;
  error?: string | null;
  metadata?: {
    currentStage?: string;
    engine?: string;
    engineId?: string;
    audioUrl?: string;
    audioFormat?: string;
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

const sleep = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

const normalizeJob = (value: JobResponse): JobResponse =>
  value?.job || value?.data || value;

const inferAudioFormat = (url: string, metadataFormat?: string): string => {
  if (metadataFormat) return metadataFormat.toLowerCase();
  const clean = url.split('?')[0].toLowerCase();
  if (clean.endsWith('.flac')) return 'flac';
  if (clean.endsWith('.mp3')) return 'mp3';
  return 'wav';
};

export default function App() {
  const [prompt, setPrompt] = useState(
    'Deep House and Tech House with Afro House influence, 124 BPM, deep rolling bassline, punchy four-on-the-floor kick, organic tribal percussion, congas, bongos, shakers, hypnotic groove, warm piano chords, atmospheric pads and a polished club mix.'
  );
  const [genre, setGenre] = useState('Tech House');
  const [bpm, setBpm] = useState(124);
  const [durationSec, setDurationSec] = useState(15);
  const [selectedEngineId, setSelectedEngineId] = useState('sonara_ace_step_v12');
  const [engineModels, setEngineModels] = useState<EngineModel[]>([]);

  const [status, setStatus] = useState<JobStatus>('IDLE');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Ready');
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [audioFormat, setAudioFormat] = useState('wav');
  const [engine, setEngine] = useState('Sonara Multi-Engine');
  const [health, setHealth] = useState('CHECKING');
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    void checkHealth();
    void loadEngines();
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
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      setHealth(response.ok ? 'READY' : `HTTP ${response.status}`);
    } catch (healthError) {
      console.error('Health check failed:', healthError);
      setHealth('OFFLINE');
    }
  };

  const loadEngines = async () => {
    try {
      const response = await fetch('/api/engine/models', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json() as EngineModelsResponse;
      const models = Array.isArray(data.models) ? data.models : [];
      setEngineModels(models);

      if (data.activeEngineId && models.some(model => model.id === data.activeEngineId)) {
        setSelectedEngineId(data.activeEngineId);
      }
    } catch (engineError) {
      console.error('Engine registry load failed:', engineError);
    }
  };

  const selectEngine = async (engineId: string) => {
    setSelectedEngineId(engineId);
    const selected = engineModels.find(model => model.id === engineId);
    if (selected) setEngine(selected.name);

    try {
      await fetch('/api/engine/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ engineId })
      });
    } catch (selectionError) {
      console.error('Engine selection sync failed:', selectionError);
    }
  };

  const generate = async () => {
    if (!prompt.trim() || status === 'QUEUED' || status === 'PROCESSING') return;

    const selectedModel = engineModels.find(model => model.id === selectedEngineId);
    const selectedEngineName = selectedModel?.name || selectedEngineId;

    setStatus('QUEUED');
    setProgress(0);
    setStage('Sending generation request...');
    setError('');
    setAudioUrl('');
    setAudioFormat('wav');
    setJobId('');
    setIsPlaying(false);
    setEngine(selectedEngineName);

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
          engineId: selectedEngineId
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
      setStage(`${selectedEngineName} is generating the track...`);

      const maximumAttempts = 720; // 12 minutes at one check per second.

      for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
        await sleep(1000);

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
          setAudioFormat(inferAudioFormat(currentAudioUrl, currentMetadata.audioFormat));
          setProgress(100);
          setStatus('COMPLETED');
          setStage('Generation complete — audio ready.');
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
      const message = generationError instanceof Error
        ? generationError.message
        : String(generationError);

      console.error('Generation failed:', generationError);
      setError(message);
      setStatus('FAILED');
      setProgress(0);
      setStage('Generation failed');
    }
  };

  const busy = status === 'QUEUED' || status === 'PROCESSING';
  const availableEngines = engineModels.length > 0
    ? engineModels
    : [
        { id: 'sonara_ace_step_v12', name: 'Sonara ACE-Step' },
        { id: 'sonara_levo_v2', name: 'Sonara LeVo Music Engine' }
      ];

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      <header className="border-b border-slate-800 bg-[#0d1322] px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600">
              <Music className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">SONARA AI</h1>
              <p className="text-xs text-slate-400">Multi-Engine Music Generator</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => { void checkHealth(); void loadEngines(); }}
            className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs"
          >
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            Engine {health}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-6 p-6">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6 shadow-xl">
          <div className="mb-5 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-400" />
            <h2 className="font-semibold">Generate Music</h2>
          </div>

          <textarea
            value={prompt}
            onChange={event => setPrompt(event.target.value)}
            rows={5}
            placeholder="Describe the track..."
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm outline-none focus:border-purple-500"
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <label className="space-y-1 text-xs text-slate-400">
              <span>Engine</span>
              <select
                value={selectedEngineId}
                onChange={event => void selectEngine(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100"
              >
                {availableEngines.map(model => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))}
              </select>
            </label>

            <label className="space-y-1 text-xs text-slate-400">
              <span>Genre</span>
              <select
                value={genre}
                onChange={event => setGenre(event.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100"
              >
                <option>Deep House</option>
                <option>Tech House</option>
                <option>Afro House</option>
                <option>Melodic House</option>
                <option>Pop EDM</option>
              </select>
            </label>

            <label className="space-y-1 text-xs text-slate-400">
              <span>BPM: {bpm}</span>
              <input
                type="range"
                min={60}
                max={180}
                value={bpm}
                onChange={event => setBpm(Number(event.target.value))}
                className="w-full accent-purple-500"
              />
            </label>

            <label className="space-y-1 text-xs text-slate-400">
              <span>Duration</span>
              <select
                value={durationSec}
                onChange={event => setDurationSec(Number(event.target.value))}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-2 text-slate-100"
              >
                <option value={15}>15 seconds</option>
                <option value={30}>30 seconds</option>
                <option value={60}>60 seconds</option>
              </select>
            </label>
          </div>

          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy || !prompt.trim()}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-pink-600 px-6 py-3.5 font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="h-5 w-5" />
                Generate Track
              </>
            )}
          </button>
        </section>

        {(busy || status === 'FAILED') && (
          <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-6">
            <div className="flex items-center justify-between text-sm">
              <span>{stage}</span>
              <span className="font-mono text-purple-300">{progress}%</span>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all"
                style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
              />
            </div>

            {jobId && (
              <p className="mt-2 text-[11px] text-slate-500">Job: {jobId}</p>
            )}

            {error && (
              <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
                {error}
              </pre>
            )}
          </section>
        )}

        {status === 'COMPLETED' && audioUrl && (
          <section className="rounded-2xl border border-emerald-800/60 bg-slate-900/80 p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-emerald-300">Generation Complete</h2>
                <p className="mt-1 text-xs text-slate-400">{engine}</p>
              </div>

              <span className="rounded-full border border-emerald-800 bg-emerald-950 px-3 py-1 text-xs text-emerald-300">
                {audioFormat.toUpperCase()} READY
              </span>
            </div>

            <audio
              ref={audioRef}
              controls
              preload="metadata"
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              className="w-full"
            >
              Your browser does not support audio playback.
            </audio>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setIsPlaying(previous => !previous)}
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium"
              >
                {isPlaying ? (
                  <>
                    <Pause className="h-4 w-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Play
                  </>
                )}
              </button>

              <a
                href={audioUrl}
                download={`Sonara-${jobId || 'track'}.${audioFormat}`}
                className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium"
              >
                <Download className="h-4 w-4" />
                Download {audioFormat.toUpperCase()}
              </a>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
