import React, { useEffect, useState } from 'react';
import {
  Activity,
  Download,
  Music,
  RefreshCw,
  Sparkles,
  Zap
} from 'lucide-react';
import { ProfessionalAudioEqualizer } from './components/eq/ProfessionalAudioEqualizer';

type JobStatus = 'IDLE' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

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
  const [processedAudioUrl, setProcessedAudioUrl] = useState('');
  const [engine, setEngine] = useState('Sonara V12 ACE-Step Engine');
  const [health, setHealth] = useState('CHECKING');

  useEffect(() => {
    void checkHealth();
  }, []);

  const checkHealth = async () => {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      setHealth(response.ok ? 'READY' : `HTTP ${response.status}`);
    } catch (healthError) {
      console.error('Health check failed:', healthError);
      setHealth('OFFLINE');
    }
  };

  const generate = async () => {
    if (!prompt.trim() || status === 'QUEUED' || status === 'PROCESSING') return;

    setStatus('QUEUED');
    setProgress(0);
    setStage('Sending generation request...');
    setError('');
    setAudioUrl('');
    setProcessedAudioUrl('');
    setJobId('');

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
      const id =
        responseData.jobId ||
        responseData.result?.jobId ||
        initial.jobId;

      if (!id) {
        throw new Error('The server did not return a job ID.');
      }

      setJobId(id);
      setStatus('PROCESSING');
      setStage(
        durationSec > 90
          ? 'Fast long-form mode: generating the neural production core...'
          : 'ACE-Step is generating the track...'
      );

      const maximumAttempts = 2400; // Up to 40 minutes for four-minute GPU renders and stem separation.

      for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
        await sleep(1000);

        const pollResponse = await fetch(`/api/music/job/${encodeURIComponent(id)}`, {
          cache: 'no-store'
        });

        if (!pollResponse.ok) {
          continue;
        }

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

        if (currentMetadata.engine) {
          setEngine(currentMetadata.engine);
        }

        if (currentStatus === 'COMPLETED') {
          if (!currentAudioUrl) {
            throw new Error('The job completed but no audio URL was returned.');
          }

          setAudioUrl(currentAudioUrl);
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
      const message =
        generationError instanceof Error
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

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      <header className="border-b border-slate-800 bg-[#0d1322] px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600">
              <Music className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold">SONARA AI</h1>
              <p className="text-xs text-slate-400">
                Clean ACE-Step Generator
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => void checkHealth()}
            className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs"
          >
            <Activity className="h-3.5 w-3.5 text-emerald-400" />
            Engine {health}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
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

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
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
                <option value={60}>1 minute</option>
                <option value={120}>2 minutes</option>
                <option value={180}>3 minutes</option>
                <option value={240}>4 minutes</option>
              </select>
              {durationSec > 90 && (
                <span className="block text-[10px] text-emerald-400">
                  Fast long-form: neural core + phrase-aligned arrangement
                </span>
              )}
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
              <p className="mt-2 text-[11px] text-slate-500">
                Job: {jobId}
              </p>
            )}

            {error && (
              <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">
                {error}
              </pre>
            )}
          </section>
        )}

        {status === 'COMPLETED' && audioUrl && (
          <section className="rounded-2xl border border-emerald-800/60 bg-slate-900/80 p-4 shadow-xl sm:p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-emerald-300">
                  Generation Complete
                </h2>
                <p className="mt-1 text-xs text-slate-400">
                  {engine}
                </p>
              </div>

              <span className="rounded-full border border-emerald-800 bg-emerald-950 px-3 py-1 text-xs text-emerald-300">
                WAV READY
              </span>
            </div>

            <div className="rounded-xl border border-purple-500/30 bg-purple-950/20 p-4 text-sm text-purple-100">
              The generated master is connected to the Live DSP Monitor below. Use that player to hear every EQ change in real time.
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <a
                href="#professional-equalizer"
                className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium"
              >
                Open Live Equalizer
              </a>

              <a
                href={audioUrl}
                download={`Sonara-${jobId || 'track'}.wav`}
                className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium"
              >
                <Download className="h-4 w-4" />
                Download WAV
              </a>

              {processedAudioUrl && (
                <a
                  href={processedAudioUrl}
                  download={`Sonara-${jobId || 'track'}-equalized.wav`}
                  className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium"
                >
                  <Download className="h-4 w-4" />
                  Download Equalized WAV
                </a>
              )}
            </div>
          </section>
        )}

        <section
          id="professional-equalizer"
          className="scroll-mt-6 rounded-2xl border border-purple-800/60 bg-slate-950/60 p-3 shadow-2xl shadow-purple-950/20 sm:p-5"
        >
          <ProfessionalAudioEqualizer
            audioUrl={audioUrl}
            isEmbedded
            onProcessedAudio={newProcessedAudioUrl => {
              setProcessedAudioUrl(newProcessedAudioUrl);
            }}
          />
        </section>
      </main>
    </div>
  );
}
