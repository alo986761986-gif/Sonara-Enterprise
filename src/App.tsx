import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AudioLines,
  Cpu,
  Download,
  Gauge,
  Library,
  Music,
  Pause,
  Play,
  RefreshCw,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Store,
  Zap
} from 'lucide-react';

type JobStatus = 'IDLE' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

interface JobResponse {
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
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const normalizeJob = (value: JobResponse): JobResponse =>
  value?.job || value?.data || value;

const Card = ({ children, className = '' }: any) => (
  <section className={`rounded-2xl border border-slate-800 bg-slate-900/75 shadow-xl ${className}`}>
    {children}
  </section>
);

export default function App() {
  const [prompt, setPrompt] = useState(
    'Deep House, Tech House, Afro House influence, deep rolling bassline, punchy club kick, tribal percussion, warm chords, atmospheric pads, polished professional mix'
  );

  const [genre, setGenre] = useState('Tech House');
  const [mood, setMood] = useState('Energetic');
  const [title, setTitle] = useState('Sonara AI Track');
  const [lyrics, setLyrics] = useState('');
  const [bpm, setBpm] = useState(124);
  const [durationSec, setDurationSec] = useState(30);
  const [keySignature, setKeySignature] = useState('A Minor');

  const [status, setStatus] = useState<JobStatus>('IDLE');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Ready');
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [engine, setEngine] = useState('Sonara LeVo 2 Engine');
  const [health, setHealth] = useState('CHECKING');

  const [eqLow, setEqLow] = useState(0);
  const [eqMid, setEqMid] = useState(0);
  const [eqHigh, setEqHigh] = useState(0);
  const [masterGain, setMasterGain] = useState(0);

  const [dnaCount, setDnaCount] = useState(0);
  const [styleCount, setStyleCount] = useState(0);
  const [workers, setWorkers] = useState<any[]>([]);
  const [trainingStats, setTrainingStats] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<
    'generator' | 'eq' | 'marketplace' | 'pro'
  >('generator');

  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const busy = status === 'QUEUED' || status === 'PROCESSING';

  const statusLabel = useMemo(() => {
    if (health === 'READY') return 'ONLINE';
    if (health === 'CHECKING') return 'CHECKING';
    return health;
  }, [health]);

  useEffect(() => {
    void refreshDashboard();
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

  const refreshDashboard = async () => {
    try {
      const response = await fetch('/api/health', { cache: 'no-store' });
      setHealth(response.ok ? 'READY' : `HTTP ${response.status}`);
    } catch {
      setHealth('OFFLINE');
    }

    try {
      const res = await fetch('/api/music/dna/elements');
      if (res.ok) {
        const data = await res.json();
        setDnaCount(Array.isArray(data.elements) ? data.elements.length : 0);
      }
    } catch {}

    try {
      const res = await fetch('/api/music/style/all');
      if (res.ok) {
        const data = await res.json();
        setStyleCount(Array.isArray(data.styles) ? data.styles.length : 0);
      }
    } catch {}

    try {
      const res = await fetch('/api/music/workers/status');
      if (res.ok) {
        const data = await res.json();
        setWorkers(Array.isArray(data.workers) ? data.workers : []);
      }
    } catch {}

    try {
      const res = await fetch('/api/music/training/dashboard');
      if (res.ok) {
        const data = await res.json();
        setTrainingStats(data);
      }
    } catch {}
  };

  const generate = async () => {
    if (!prompt.trim() || busy) return;

    setStatus('QUEUED');
    setProgress(0);
    setStage('Sending request to LeVo 2...');
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
          mood,
          lyrics,
          title,
          bpm,
          key: keySignature,
          durationSec,
          duration: durationSec,
          engineId: 'sonara_levo_v2'
        })
      });

      const responseData: JobResponse = await response.json();

      if (!response.ok) {
        throw new Error(
          responseData.error ||
            responseData.message ||
            `Generation failed HTTP ${response.status}`
        );
      }

      const initial = normalizeJob(responseData);

      const id =
        responseData.jobId ||
        responseData.result?.jobId ||
        initial.jobId;

      if (!id) throw new Error('No job ID returned.');

      setJobId(id);
      setStatus('PROCESSING');
      setStage('LeVo 2 is generating the track...');

      for (let attempt = 0; attempt < 1200; attempt++) {
        await sleep(500);

        const poll = await fetch(`/api/music/job/${encodeURIComponent(id)}`, {
          cache: 'no-store'
        });

        if (!poll.ok) continue;

        const raw: JobResponse = await poll.json();
        const current = normalizeJob(raw);

        const currentStatus = String(
          current.status || 'PROCESSING'
        ).toUpperCase();

        const metadata = current.metadata || {};

        setProgress(Number(current.progress || 0));
        setStage(
          metadata.currentStage ||
            (currentStatus === 'COMPLETED'
              ? 'Generation complete'
              : 'LeVo 2 processing...')
        );

        if (metadata.engine) setEngine(metadata.engine);

        if (currentStatus === 'COMPLETED') {
          const url =
            current.audioUrl ||
            metadata.audioUrl ||
            responseData.audioUrl ||
            responseData.result?.audioUrl;

          if (!url) throw new Error('Generation finished without audio URL.');

          setAudioUrl(url);
          setProgress(100);
          setStatus('COMPLETED');
          setStage('Audio ready');
          return;
        }

        if (currentStatus === 'FAILED') {
          throw new Error(
            current.error ||
              metadata.error ||
              'LeVo 2 generation failed.'
          );
        }
      }

      throw new Error('Generation timeout.');
    } catch (err: any) {
      setStatus('FAILED');
      setProgress(0);
      setStage('Generation failed');
      setError(err?.message || String(err));
    }
  };

  const processEq = async () => {
    if (!audioUrl) {
      setError('Generate a track before applying EQ.');
      return;
    }

    setStage('Professional EQ processing...');

    try {
      const bands = [
        { type: 'lowshelf', frequency: 100, gain: eqLow, q: 0.7 },
        { type: 'peaking', frequency: 1000, gain: eqMid, q: 1.0 },
        { type: 'highshelf', frequency: 8000, gain: eqHigh, q: 0.7 }
      ];

      const response = await fetch('/api/music/eq/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bands,
          audioUrl,
          masterGain
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'EQ processing failed.');
      }

      if (data.audioUrl) setAudioUrl(data.audioUrl);

      setStage('EQ / Mastering complete');
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  };

  const createStyle = async () => {
    try {
      const response = await fetch('/api/music/style/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creativeIndex: 80 })
      });

      if (response.ok) {
        await refreshDashboard();
      }
    } catch {}
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">

      <header className="sticky top-0 z-20 border-b border-slate-800 bg-[#0b101b]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1500px] items-center justify-between px-6 py-4">

          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600">
              <Music className="h-6 w-6" />
            </div>

            <div>
              <h1 className="text-xl font-black tracking-wide">
                SONARA ENTERPRISE
              </h1>

              <div className="text-xs font-semibold text-purple-300">
                LEVO 2 · SongGeneration-v2-large
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">

            <button
              onClick={() => void refreshDashboard()}
              className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </button>

            <div className="flex items-center gap-2 rounded-lg border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-xs">
              <Activity className="h-4 w-4 text-emerald-400" />
              LeVo Engine {statusLabel}
            </div>

          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 p-6 lg:grid-cols-[230px_1fr]">

        <aside className="space-y-3">

          {[
            ['generator', 'Generator', Zap],
            ['eq', 'EQ / Master', SlidersHorizontal],
            ['marketplace', 'Marketplace', Store],
            ['pro', 'Pro Settings', Settings2]
          ].map(([id, label, Icon]: any) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold ${
                activeTab === id
                  ? 'bg-purple-600 text-white'
                  : 'border border-slate-800 bg-slate-900 text-slate-300'
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          ))}

          <Card className="p-4">
            <div className="mb-3 text-xs uppercase tracking-wider text-slate-500">
              System
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span>DNA Library</span>
                <b>{dnaCount}</b>
              </div>

              <div className="flex justify-between">
                <span>Styles</span>
                <b>{styleCount}</b>
              </div>

              <div className="flex justify-between">
                <span>Workers</span>
                <b>{workers.length}</b>
              </div>
            </div>
          </Card>

        </aside>

        <main className="space-y-6">

          <div className="grid gap-4 md:grid-cols-4">

            <Card className="p-4">
              <Cpu className="mb-2 h-5 w-5 text-purple-400" />
              <div className="text-xs text-slate-500">ENGINE</div>
              <div className="font-bold">LeVo 2</div>
            </Card>

            <Card className="p-4">
              <Gauge className="mb-2 h-5 w-5 text-emerald-400" />
              <div className="text-xs text-slate-500">STATUS</div>
              <div className="font-bold">{statusLabel}</div>
            </Card>

            <Card className="p-4">
              <Library className="mb-2 h-5 w-5 text-blue-400" />
              <div className="text-xs text-slate-500">DNA</div>
              <div className="font-bold">{dnaCount}</div>
            </Card>

            <Card className="p-4">
              <Store className="mb-2 h-5 w-5 text-amber-400" />
              <div className="text-xs text-slate-500">STYLE PACKS</div>
              <div className="font-bold">{styleCount}</div>
            </Card>

          </div>

          {activeTab === 'generator' && (
            <Card className="p-6">

              <div className="mb-5 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-400" />
                <h2 className="text-lg font-bold">LeVo 2 Music Generator</h2>
              </div>

              <textarea
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                rows={5}
                className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4"
              />

              <div className="mt-4 grid gap-4 md:grid-cols-4">

                <label className="text-xs text-slate-400">
                  Genre
                  <select
                    value={genre}
                    onChange={e => setGenre(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 p-2"
                  >
                    <option>Deep House</option>
                    <option>Tech House</option>
                    <option>Afro House</option>
                    <option>Melodic House</option>
                    <option>House</option>
                    <option>Techno</option>
                    <option>Trance</option>
                  </select>
                </label>

                <label className="text-xs text-slate-400">
                  Mood
                  <select
                    value={mood}
                    onChange={e => setMood(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 p-2"
                  >
                    <option>Energetic</option>
                    <option>Dark</option>
                    <option>Hypnotic</option>
                    <option>Emotional</option>
                    <option>Atmospheric</option>
                  </select>
                </label>

                <label className="text-xs text-slate-400">
                  Key
                  <select
                    value={keySignature}
                    onChange={e => setKeySignature(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 p-2"
                  >
                    <option>A Minor</option>
                    <option>E Minor</option>
                    <option>F Minor</option>
                    <option>D Minor</option>
                    <option>C Minor</option>
                    <option>C Major</option>
                  </select>
                </label>

                <label className="text-xs text-slate-400">
                  Duration
                  <select
                    value={durationSec}
                    onChange={e => setDurationSec(Number(e.target.value))}
                    className="mt-1 w-full rounded-lg bg-slate-950 p-2"
                  >
                    <option value={15}>15 sec</option>
                    <option value={30}>30 sec</option>
                    <option value={60}>60 sec</option>
                    <option value={120}>120 sec</option>
                  </select>
                </label>

              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">

                <label className="text-xs text-slate-400">
                  BPM: {bpm}
                  <input
                    type="range"
                    min={60}
                    max={180}
                    value={bpm}
                    onChange={e => setBpm(Number(e.target.value))}
                    className="mt-2 w-full"
                  />
                </label>

                <label className="text-xs text-slate-400">
                  Title
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg bg-slate-950 p-2"
                  />
                </label>

              </div>

              <details className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
                <summary className="cursor-pointer font-semibold">
                  Lyrics / Vocal mode
                </summary>

                <textarea
                  value={lyrics}
                  onChange={e => setLyrics(e.target.value)}
                  rows={4}
                  placeholder="Leave empty for instrumental / BGM"
                  className="mt-3 w-full rounded-lg border border-slate-800 bg-black/30 p-3"
                />
              </details>

              <button
                onClick={() => void generate()}
                disabled={busy}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 font-bold"
              >
                {busy ? (
                  <>
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    LeVo 2 Generating...
                  </>
                ) : (
                  <>
                    <Zap className="h-5 w-5" />
                    Generate with LeVo 2
                  </>
                )}
              </button>

            </Card>
          )}

          {activeTab === 'eq' && (
            <Card className="p-6">

              <div className="mb-6 flex items-center gap-2">
                <SlidersHorizontal className="h-5 w-5 text-purple-400" />
                <h2 className="text-lg font-bold">
                  Professional EQ / Mastering
                </h2>
              </div>

              {[
                ['LOW', eqLow, setEqLow],
                ['MID', eqMid, setEqMid],
                ['HIGH', eqHigh, setEqHigh],
                ['MASTER', masterGain, setMasterGain]
              ].map(([name, value, setter]: any) => (
                <label key={name} className="mb-5 block">
                  <div className="mb-2 flex justify-between text-sm">
                    <span>{name}</span>
                    <span>{value} dB</span>
                  </div>

                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={0.5}
                    value={value}
                    onChange={e => setter(Number(e.target.value))}
                    className="w-full"
                  />
                </label>
              ))}

              <button
                onClick={() => void processEq()}
                className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold"
              >
                Apply EQ + Master
              </button>

            </Card>
          )}

          {activeTab === 'marketplace' && (
            <div className="grid gap-6 md:grid-cols-2">

              <Card className="p-6">
                <Store className="mb-3 h-6 w-6 text-amber-400" />
                <h2 className="text-lg font-bold">Style Marketplace</h2>

                <p className="mt-2 text-sm text-slate-400">
                  Available Sonara styles: {styleCount}
                </p>

                <button
                  onClick={() => void createStyle()}
                  className="mt-5 rounded-lg bg-purple-600 px-4 py-2 text-sm font-semibold"
                >
                  Generate New Style
                </button>
              </Card>

              <Card className="p-6">
                <Library className="mb-3 h-6 w-6 text-blue-400" />
                <h2 className="text-lg font-bold">Music DNA Library</h2>

                <p className="mt-2 text-sm text-slate-400">
                  Registered DNA elements: {dnaCount}
                </p>
              </Card>

            </div>
          )}

          {activeTab === 'pro' && (
            <Card className="p-6">

              <Settings2 className="mb-3 h-6 w-6 text-purple-400" />
              <h2 className="text-lg font-bold">Sonara Pro Settings</h2>

              <div className="mt-6 grid gap-4 md:grid-cols-2">

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="text-xs text-slate-500">MODEL</div>
                  <div className="mt-1 font-bold">
                    SongGeneration-v2-large
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="text-xs text-slate-500">ENGINE ID</div>
                  <div className="mt-1 font-mono text-sm">
                    sonara_levo_v2
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="text-xs text-slate-500">WORKERS</div>
                  <div className="mt-1 font-bold">{workers.length}</div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                  <div className="text-xs text-slate-500">
                    TRAINING / RESEARCH
                  </div>
                  <pre className="mt-2 max-h-32 overflow-auto text-xs text-slate-400">
                    {trainingStats
                      ? JSON.stringify(trainingStats, null, 2)
                      : 'No telemetry'}
                  </pre>
                </div>

              </div>

            </Card>
          )}

          {(busy || status === 'FAILED' || status === 'COMPLETED') && (
            <Card className="p-6">

              <div className="flex items-center justify-between">
                <span className="font-semibold">{stage}</span>
                <span>{progress}%</span>
              </div>

              <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full bg-purple-500 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>

              {jobId && (
                <div className="mt-2 text-xs text-slate-500">
                  Job: {jobId}
                </div>
              )}

              {error && (
                <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-red-950/50 p-3 text-xs text-red-300">
                  {error}
                </pre>
              )}

            </Card>
          )}

          {audioUrl && (
            <Card className="p-6">

              <div className="mb-4 flex items-center gap-2">
                <AudioLines className="h-5 w-5 text-emerald-400" />
                <div className="font-bold">{engine}</div>
              </div>

              <audio
                ref={audioRef}
                controls
                src={audioUrl}
                className="w-full"
                onEnded={() => setIsPlaying(false)}
              />

              <div className="mt-4 flex gap-3">

                <button
                  onClick={() => setIsPlaying(v => !v)}
                  className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2"
                >
                  {isPlaying ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {isPlaying ? 'Pause' : 'Play'}
                </button>

                <a
                  href={audioUrl}
                  download
                  className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>

              </div>

            </Card>
          )}

        </main>
      </div>
    </div>
  );
}

