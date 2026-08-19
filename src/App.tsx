import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AudioLines,
  Download,
  Gauge,
  Music,
  Pause,
  Play,
  RefreshCw,
  Sparkles,
  Zap
} from 'lucide-react';

type JobStatus = 'IDLE' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

type JobResponse = {
  jobId?: string;
  status?: JobStatus | string;
  progress?: number;
  audioUrl?: string | null;
  error?: string | null;
  metadata?: Record<string, any>;
  result?: Record<string, any>;
  job?: JobResponse;
  data?: JobResponse;
  message?: string;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const normalizeJob = (value: JobResponse): JobResponse =>
  value?.job || value?.data || value;

async function readJson(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Server returned invalid JSON (HTTP ${response.status}).`);
  }
}

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{children}</div>
);

export default function App() {
  const [prompt, setPrompt] = useState(
    'Deep House and Tech House club track, deep warm rolling bassline, punchy four-on-the-floor kick, tight groovy drums, crisp shuffled hi-hats, atmospheric Rhodes chords, hypnotic synth textures, clean powerful low end, professional DJ-friendly club mix'
  );
  const [genre, setGenre] = useState('Deep House');
  const [mood, setMood] = useState('Energetic');
  const [title, setTitle] = useState('Sonara ACE Track');
  const [lyrics, setLyrics] = useState('');
  const [bpm, setBpm] = useState(124);
  const [keySignature, setKeySignature] = useState('F Minor');
  const [durationSec, setDurationSec] = useState(30);

  const [health, setHealth] = useState<'CHECKING' | 'READY' | 'OFFLINE'>('CHECKING');
  const [healthMessage, setHealthMessage] = useState('Checking ACE-Step...');
  const [status, setStatus] = useState<JobStatus>('IDLE');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Ready');
  const [jobId, setJobId] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [error, setError] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const busy = status === 'QUEUED' || status === 'PROCESSING';
  const online = health === 'READY';

  const statusLabel = useMemo(() => {
    if (health === 'READY') return 'ONLINE';
    if (health === 'CHECKING') return 'CHECKING';
    return 'OFFLINE';
  }, [health]);

  const refreshHealth = async () => {
    setHealth('CHECKING');
    try {
      const response = await fetch('/api/engine/diagnostic', { cache: 'no-store' });
      const data = await readJson(response);
      const ready = response.ok && data?.isReady === true && data?.aceStep?.isAvailable === true;
      setHealth(ready ? 'READY' : 'OFFLINE');
      setHealthMessage(
        ready
          ? 'ACE-Step 1.5 connected'
          : data?.aceStep?.error || data?.notReadyReason || 'ACE-Step unavailable'
      );
    } catch (err: any) {
      setHealth('OFFLINE');
      setHealthMessage(err?.message || String(err));
    }
  };

  useEffect(() => {
    void refreshHealth();
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !audioUrl) return;
    if (isPlaying) {
      void audio.play().catch(() => setIsPlaying(false));
    } else {
      audio.pause();
    }
  }, [isPlaying, audioUrl]);

  const generate = async () => {
    if (!prompt.trim() || busy) return;

    setError('');
    setAudioUrl('');
    setIsPlaying(false);
    setJobId('');
    setProgress(0);
    setStatus('QUEUED');
    setStage('Sending request to ACE-Step 1.5...');

    try {
      const response = await fetch('/api/engine/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          genre,
          mood,
          lyrics,
          title,
          bpm,
          key: keySignature,
          durationSec,
          engineId: 'sonara_acestep_v15'
        })
      });

      const responseData: JobResponse = await readJson(response);
      if (!response.ok) {
        throw new Error(
          responseData.error || responseData.message || `Generation failed (HTTP ${response.status})`
        );
      }

      const initial = normalizeJob(responseData);
      const id = responseData.jobId || responseData.result?.jobId || initial.jobId;
      if (!id) throw new Error('ACE-Step generation started without a job ID.');

      setJobId(id);
      setStatus('PROCESSING');
      setStage('ACE-Step 1.5 is generating real audio...');

      for (let attempt = 0; attempt < 600; attempt++) {
        await sleep(1000);
        const pollResponse = await fetch(`/api/music/job/${encodeURIComponent(id)}`, {
          cache: 'no-store'
        });
        if (!pollResponse.ok) continue;

        const current = normalizeJob(await readJson(pollResponse));
        const currentStatus = String(current.status || 'PROCESSING').toUpperCase();
        const metadata = current.metadata || {};

        setProgress(Number(current.progress || 0));
        setStage(
          metadata.currentStage ||
            (currentStatus === 'COMPLETED'
              ? 'Audio ready'
              : 'ACE-Step 1.5 processing...')
        );

        if (currentStatus === 'COMPLETED') {
          const url = current.audioUrl || metadata.audioUrl;
          if (!url) throw new Error('ACE-Step completed but no audio URL was returned.');
          setAudioUrl(url);
          setProgress(100);
          setStatus('COMPLETED');
          setStage('Generation complete');
          return;
        }

        if (currentStatus === 'FAILED') {
          throw new Error(current.error || metadata.error || 'ACE-Step generation failed.');
        }
      }

      throw new Error('ACE-Step generation timeout.');
    } catch (err: any) {
      setStatus('FAILED');
      setProgress(0);
      setStage('Generation failed');
      setError(err?.message || String(err));
      void refreshHealth();
    }
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      <header className="border-b border-slate-800 bg-[#0b101b]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600">
              <Music className="h-6 w-6" />
            </div>
            <div>
              <div className="text-xl font-black tracking-wide">SONARA ENTERPRISE</div>
              <div className="text-xs font-semibold text-purple-300">ACE-Step 1.5 · acestep-v15-turbo</div>
            </div>
          </div>

          <button
            onClick={() => void refreshHealth()}
            className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs"
          >
            <RefreshCw className="h-4 w-4" />
            ACE-Step {statusLabel}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl p-5">
        <div className="mb-5 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
            <Activity className="mb-2 h-5 w-5 text-emerald-400" />
            <div className="text-xs text-slate-500">ENGINE STATUS</div>
            <div className="font-bold">{statusLabel}</div>
            <div className="mt-1 text-xs text-slate-400">{healthMessage}</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
            <Gauge className="mb-2 h-5 w-5 text-purple-400" />
            <div className="text-xs text-slate-500">MODEL</div>
            <div className="font-bold">acestep-v15-turbo</div>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/75 p-4">
            <AudioLines className="mb-2 h-5 w-5 text-blue-400" />
            <div className="text-xs text-slate-500">PIPELINE</div>
            <div className="font-bold">Sonara → ACE-Step → WAV</div>
          </div>
        </div>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/75 p-6 shadow-xl">
          <div className="mb-5 flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-400" />
            <h1 className="text-lg font-bold">ACE-Step Music Generator</h1>
          </div>

          <FieldLabel>Prompt</FieldLabel>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            rows={6}
            className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 outline-none focus:border-purple-500"
          />

          <div className="mt-4 grid gap-4 md:grid-cols-5">
            <label>
              <FieldLabel>Genre</FieldLabel>
              <select value={genre} onChange={e => setGenre(e.target.value)} className="w-full rounded-lg bg-slate-950 p-3">
                <option>Deep House</option>
                <option>Tech House</option>
                <option>House</option>
                <option>Afro House</option>
                <option>Melodic House</option>
                <option>Techno</option>
                <option>Trance</option>
              </select>
            </label>

            <label>
              <FieldLabel>Mood</FieldLabel>
              <select value={mood} onChange={e => setMood(e.target.value)} className="w-full rounded-lg bg-slate-950 p-3">
                <option>Energetic</option>
                <option>Dark</option>
                <option>Hypnotic</option>
                <option>Atmospheric</option>
                <option>Emotional</option>
              </select>
            </label>

            <label>
              <FieldLabel>Key</FieldLabel>
              <select value={keySignature} onChange={e => setKeySignature(e.target.value)} className="w-full rounded-lg bg-slate-950 p-3">
                <option>F Minor</option>
                <option>A Minor</option>
                <option>E Minor</option>
                <option>D Minor</option>
                <option>C Minor</option>
                <option>C Major</option>
              </select>
            </label>

            <label>
              <FieldLabel>BPM</FieldLabel>
              <input
                type="number"
                min={60}
                max={180}
                value={bpm}
                onChange={e => setBpm(Number(e.target.value))}
                className="w-full rounded-lg bg-slate-950 p-3"
              />
            </label>

            <label>
              <FieldLabel>Duration</FieldLabel>
              <select value={durationSec} onChange={e => setDurationSec(Number(e.target.value))} className="w-full rounded-lg bg-slate-950 p-3">
                <option value={15}>15 sec</option>
                <option value={30}>30 sec</option>
                <option value={60}>60 sec</option>
                <option value={120}>120 sec</option>
              </select>
            </label>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label>
              <FieldLabel>Title</FieldLabel>
              <input value={title} onChange={e => setTitle(e.target.value)} className="w-full rounded-lg bg-slate-950 p-3" />
            </label>
            <label>
              <FieldLabel>Lyrics (empty = instrumental)</FieldLabel>
              <input value={lyrics} onChange={e => setLyrics(e.target.value)} className="w-full rounded-lg bg-slate-950 p-3" />
            </label>
          </div>

          <button
            onClick={() => void generate()}
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 font-bold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
            {busy ? 'ACE-Step Generating...' : 'Generate with ACE-Step 1.5'}
          </button>

          {!online && health !== 'CHECKING' && (
            <div className="mt-3 rounded-lg border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-300">
              ACE-Step is offline. Check the Lightning API endpoint before generating.
            </div>
          )}
        </section>

        {(busy || status === 'FAILED' || status === 'COMPLETED') && (
          <section className="mt-5 rounded-2xl border border-slate-800 bg-slate-900/75 p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">{stage}</div>
              <div>{progress}%</div>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
              <div className="h-full bg-purple-500 transition-all" style={{ width: `${progress}%` }} />
            </div>
            {jobId && <div className="mt-2 text-xs text-slate-500">Job: {jobId}</div>}
            {error && (
              <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-red-950/50 p-3 text-xs text-red-300">{error}</pre>
            )}
          </section>
        )}

        {audioUrl && (
          <section className="mt-5 rounded-2xl border border-emerald-900 bg-slate-900/75 p-6">
            <div className="mb-4 flex items-center gap-2 font-bold">
              <AudioLines className="h-5 w-5 text-emerald-400" />
              ACE-Step generated WAV
            </div>
            <audio ref={audioRef} controls src={audioUrl} className="w-full" onEnded={() => setIsPlaying(false)} />
            <div className="mt-4 flex gap-3">
              <button onClick={() => setIsPlaying(v => !v)} className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2">
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <a href={audioUrl} download className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2">
                <Download className="h-4 w-4" />
                Download WAV
              </a>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
