import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Brain,
  CheckCircle2,
  Clock,
  Cpu,
  Database,
  Download,
  FileText,
  Layers,
  Music,
  Play,
  RefreshCw,
  Server,
  Settings,
  ShieldCheck,
  Sliders,
  Sparkles,
  Zap
} from 'lucide-react';
import { GENRE_CATALOG_NAMES, GENRE_FAMILIES } from '../shared/genreCatalog';
import { MusicBrainDashboard } from './components/brain/MusicBrainDashboard';
import { ProfessionalAudioEqualizer } from './components/eq/ProfessionalAudioEqualizer';

type JobStatus = 'IDLE' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
type WorkspaceTab = 'studio' | 'director' | 'brain' | 'production' | 'system';

interface JobResponse {
  jobId?: string;
  status?: JobStatus | string;
  progress?: number;
  audioUrl?: string | null;
  error?: string | null;
  metadata?: Record<string, any>;
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

interface PromptPreview {
  status?: string;
  optimizedPrompt?: string;
  genreLock?: Record<string, any>;
  injectedKeywords?: string[];
  error?: string;
}

const sleep = (milliseconds: number) =>
  new Promise(resolve => setTimeout(resolve, milliseconds));

const normalizeJob = (value: JobResponse): JobResponse =>
  value?.job || value?.data || value;

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};

const toStorageUrl = (filePath: unknown): string => {
  const value = String(filePath || '');
  const markerIndex = value.lastIndexOf('/storage/');
  return markerIndex >= 0 ? value.slice(markerIndex) : value;
};

const formatValue = (value: unknown, fallback = '—'): string => {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value ? 'YES' : 'NO';
  if (typeof value === 'number') return Number.isInteger(value) ? String(value) : value.toFixed(2);
  return String(value);
};

const MetricCard: React.FC<{
  label: string;
  value: string | number;
  detail: string;
  tone?: 'purple' | 'emerald' | 'cyan' | 'amber';
}> = ({ label, value, detail, tone = 'purple' }) => {
  const toneClasses = {
    purple: 'border-purple-500/30 text-purple-300',
    emerald: 'border-emerald-500/30 text-emerald-300',
    cyan: 'border-cyan-500/30 text-cyan-300',
    amber: 'border-amber-500/30 text-amber-300'
  }[tone];

  return (
    <div className={`rounded-2xl border bg-slate-900/70 p-4 ${toneClasses}`}>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-black text-white">{value}</p>
      <p className="mt-1 text-[11px] text-slate-400">{detail}</p>
    </div>
  );
};

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('studio');
  const [title, setTitle] = useState('Sonara AI Track');
  const [prompt, setPrompt] = useState(
    'Deep House with warm sub-bass, atmospheric Rhodes chords, a mellow four-on-the-floor groove, smooth shuffle hats and a polished club mix.'
  );
  const [genre, setGenre] = useState('Deep House');
  const [mood, setMood] = useState('Energetic');
  const [lyrics, setLyrics] = useState('');
  const [bpm, setBpm] = useState(124);
  const [durationSec, setDurationSec] = useState(30);

  const [status, setStatus] = useState<JobStatus>('IDLE');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Ready for a real ACE-Step generation');
  const [error, setError] = useState('');
  const [jobId, setJobId] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [processedAudioUrl, setProcessedAudioUrl] = useState('');
  const [engine, setEngine] = useState('Sonara V12 ACE-Step Engine');
  const [jobMetadata, setJobMetadata] = useState<Record<string, any> | null>(null);

  const [healthData, setHealthData] = useState<Record<string, any> | null>(null);
  const [brainStats, setBrainStats] = useState<Record<string, any> | null>(null);
  const [learningStats, setLearningStats] = useState<Record<string, any> | null>(null);
  const [researchMetrics, setResearchMetrics] = useState<Record<string, any> | null>(null);
  const [platformLoading, setPlatformLoading] = useState(false);

  const [preview, setPreview] = useState<PromptPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  useEffect(() => {
    void refreshPlatformData();
  }, []);

  const fetchJson = async (url: string, options?: RequestInit) => {
    const response = await fetch(url, { cache: 'no-store', ...options });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data?.error || data?.message || `HTTP ${response.status}`);
    }
    return data;
  };

  const refreshPlatformData = async () => {
    setPlatformLoading(true);
    const results = await Promise.allSettled([
      fetchJson('/api/health'),
      fetchJson('/api/music/brain/stats'),
      fetchJson('/api/music/learning/stats'),
      fetchJson('/api/music/research/metrics')
    ]);

    if (results[0].status === 'fulfilled') setHealthData(results[0].value);
    if (results[1].status === 'fulfilled') {
      setBrainStats(results[1].value.brainStats || results[1].value.stats || results[1].value);
    }
    if (results[2].status === 'fulfilled') {
      setLearningStats(results[2].value.stats || results[2].value);
    }
    if (results[3].status === 'fulfilled') {
      setResearchMetrics(results[3].value.metrics || results[3].value);
    }
    setPlatformLoading(false);
  };

  const analyzePrompt = async () => {
    if (!prompt.trim() || !genre.trim()) return;
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const data = await fetchJson('/api/engine/prompt-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim(), genre: genre.trim(), bpm })
      });
      setPreview(data);
    } catch (analysisError) {
      setPreviewError(
        analysisError instanceof Error ? analysisError.message : String(analysisError)
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  const generate = async () => {
    if (!prompt.trim() || !genre.trim() || status === 'QUEUED' || status === 'PROCESSING') return;

    setStatus('QUEUED');
    setProgress(0);
    setStage('Sending production brief to Sonara Director...');
    setError('');
    setAudioUrl('');
    setProcessedAudioUrl('');
    setJobId('');
    setJobMetadata(null);

    try {
      const responseData: JobResponse = await fetchJson('/api/engine/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt.trim(),
          genre: genre.trim(),
          mood: mood.trim(),
          lyrics,
          title: title.trim() || 'Sonara AI Track',
          bpm,
          durationSec,
          duration: durationSec,
          engineId: 'sonara_ace_step_v12'
        })
      });

      const initial = normalizeJob(responseData);
      const id = responseData.jobId || responseData.result?.jobId || initial.jobId;
      if (!id) throw new Error('The server did not return a job ID.');

      setJobId(id);
      setStatus('PROCESSING');
      setStage(
        durationSec > 90
          ? 'Fast Long-Form: generating the neural core and phrase-aligned arrangement...'
          : 'ACE-Step is rendering the neural audio...'
      );

      const maximumAttempts = 2400;
      for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
        await sleep(1000);
        let current: JobResponse;
        try {
          current = normalizeJob(
            await fetchJson(`/api/music/job/${encodeURIComponent(id)}`)
          );
        } catch {
          continue;
        }

        const currentStatus = String(current.status || 'PROCESSING').toUpperCase();
        const currentMetadata = asRecord(current.metadata);
        const currentAudioUrl =
          current.audioUrl ||
          currentMetadata.audioUrl ||
          responseData.audioUrl ||
          responseData.result?.audioUrl ||
          '';

        setProgress(Number(current.progress || 0));
        setStage(
          currentMetadata.currentStage ||
          (currentStatus === 'COMPLETED' ? 'Production complete' : 'Processing...')
        );
        setJobMetadata(currentMetadata);

        if (currentMetadata.engine) setEngine(String(currentMetadata.engine));

        if (currentStatus === 'COMPLETED') {
          if (!currentAudioUrl) throw new Error('The job completed but returned no audio URL.');
          setAudioUrl(String(currentAudioUrl));
          setProgress(100);
          setStatus('COMPLETED');
          setStage('Master, audit and stems completed.');
          setActiveTab('production');
          void refreshPlatformData();
          return;
        }

        if (currentStatus === 'FAILED') {
          throw new Error(
            current.error || currentMetadata.error || 'The generation job failed.'
          );
        }
      }

      throw new Error('Generation timed out while waiting for the audio file.');
    } catch (generationError) {
      const message = generationError instanceof Error
        ? generationError.message
        : String(generationError);
      setError(message);
      setStatus('FAILED');
      setProgress(0);
      setStage('Generation failed');
    }
  };

  const busy = status === 'QUEUED' || status === 'PROCESSING';
  const healthTelemetry = asRecord(healthData?.telemetry);
  const systemTelemetry = asRecord(healthTelemetry.system);
  const audioTelemetry = asRecord(healthTelemetry.audioEngine);
  const genreLock = asRecord(jobMetadata?.genreLock || preview?.genreLock);
  const arrangement = asRecord(jobMetadata?.arrangement);
  const mastering = asRecord(jobMetadata?.dspMastering);
  const generationStrategy = asRecord(jobMetadata?.generationStrategy);
  const separation = asRecord(jobMetadata?.stemSeparation);
  const stems = asRecord(separation.stems);

  const catalogCount = GENRE_CATALOG_NAMES.length;
  const analyzedTracks = Number(brainStats?.totalAnalyzedTracks || learningStats?.totalAnalyzed || 0);
  const averageScore = brainStats?.averageOverallScore ?? learningStats?.averageScore ?? '—';

  const navigation = useMemo(() => [
    { id: 'studio' as const, label: 'Production Studio', icon: Music },
    { id: 'director' as const, label: 'AI Director', icon: Sparkles },
    { id: 'brain' as const, label: 'Music Brain', icon: Brain },
    { id: 'production' as const, label: 'Mix, Master & Stems', icon: Sliders },
    { id: 'system' as const, label: 'System Intelligence', icon: Cpu }
  ], []);

  return (
    <div className="min-h-screen bg-[#070a12] text-slate-100">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-[#0b101d]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-500 via-indigo-600 to-cyan-500 shadow-lg shadow-purple-950">
              <Music className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-[0.08em]">SONARA AI</h1>
                <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[9px] font-black text-purple-300">V12</span>
              </div>
              <p className="text-[11px] text-slate-400">Creative Operating System · Real ACE-Step Production</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-bold ${
              healthData?.status === 'HEALTHY'
                ? 'border-emerald-700 bg-emerald-950/60 text-emerald-300'
                : 'border-amber-700 bg-amber-950/60 text-amber-300'
            }`}>
              <span className={`h-2 w-2 rounded-full ${healthData?.status === 'HEALTHY' ? 'bg-emerald-400' : 'bg-amber-400'}`} />
              ENGINE {healthData?.status || 'CHECKING'}
            </span>
            <button
              type="button"
              onClick={() => void refreshPlatformData()}
              className="rounded-xl border border-slate-700 bg-slate-900 p-2 text-slate-300 hover:border-purple-500 hover:text-white"
              aria-label="Refresh live platform data"
            >
              <RefreshCw className={`h-4 w-4 ${platformLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <nav className="mx-auto flex max-w-[1600px] gap-1 overflow-x-auto px-4 pb-3 sm:px-6">
          {navigation.map(item => {
            const Icon = item.icon;
            const selected = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition ${
                  selected
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-950/40'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-white'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      {busy && (
        <div className="sticky top-[112px] z-30 border-b border-purple-800/50 bg-purple-950/90 px-4 py-2 backdrop-blur">
          <div className="mx-auto flex max-w-[1560px] items-center gap-3 text-xs">
            <RefreshCw className="h-4 w-4 animate-spin text-purple-300" />
            <span className="min-w-0 flex-1 truncate text-purple-100">{stage}</span>
            <span className="font-mono font-bold text-purple-300">{progress}%</span>
          </div>
          <div className="absolute bottom-0 left-0 h-0.5 bg-gradient-to-r from-purple-500 to-cyan-400 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <main className="mx-auto max-w-[1600px] p-4 sm:p-6">
        <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard label="Music taxonomy" value={catalogCount} detail={`${GENRE_FAMILIES.length} families + open custom styles`} />
          <MetricCard label="Music Brain" value={analyzedTracks} detail="Real productions analyzed" tone="cyan" />
          <MetricCard label="Average quality" value={averageScore} detail="Continuous-learning score" tone="emerald" />
          <MetricCard label="Current job" value={status} detail={jobId || 'No active job'} tone={status === 'FAILED' ? 'amber' : 'purple'} />
        </div>

        {activeTab === 'studio' && (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.55fr)]">
            <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5 shadow-2xl sm:p-7">
              <div className="mb-6 flex items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-purple-400">Production Studio</p>
                  <h2 className="mt-1 text-2xl font-black">Build the complete musical brief</h2>
                  <p className="mt-1 text-xs text-slate-400">Every field below is sent to the real neural pipeline.</p>
                </div>
                <span className="rounded-full border border-emerald-800 bg-emerald-950/50 px-3 py-1 text-[10px] font-bold text-emerald-300">NO DEMO MODE</span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5 text-xs text-slate-400">
                  <span>Track title</span>
                  <input value={title} onChange={event => setTitle(event.target.value)} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-slate-100 outline-none focus:border-purple-500" />
                </label>
                <label className="space-y-1.5 text-xs text-slate-400">
                  <span>Mood / direction</span>
                  <input value={mood} onChange={event => setMood(event.target.value)} placeholder="Energetic, intimate, dark..." className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-slate-100 outline-none focus:border-purple-500" />
                </label>
              </div>

              <label className="mt-4 block space-y-1.5 text-xs text-slate-400">
                <span>Creative prompt</span>
                <textarea value={prompt} onChange={event => setPrompt(event.target.value)} rows={6} placeholder="Describe the instruments, rhythm, harmony, atmosphere and production..." className="w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 text-sm leading-relaxed text-slate-100 outline-none focus:border-purple-500" />
              </label>

              <div className="mt-4 grid gap-4 md:grid-cols-3">
                <label className="space-y-1.5 text-xs text-slate-400">
                  <span>Exact genre or subgenre</span>
                  <input list="sonara-genre-catalog" value={genre} onChange={event => setGenre(event.target.value)} placeholder="Type any genre exactly..." autoComplete="off" className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-slate-100 outline-none focus:border-purple-500" />
                  <datalist id="sonara-genre-catalog">
                    {GENRE_FAMILIES.flatMap(family => family.subgenres.map(subgenre => (
                      <option key={`${family.id}-${subgenre}`} value={subgenre} label={family.name} />
                    )))}
                  </datalist>
                  <span className="block text-[10px] text-purple-300">Exact selection lock · custom genres accepted</span>
                </label>

                <label className="space-y-1.5 text-xs text-slate-400">
                  <span className="flex justify-between"><span>Tempo</span><strong className="font-mono text-white">{bpm} BPM</strong></span>
                  <input type="range" min={40} max={240} value={bpm} onChange={event => setBpm(Number(event.target.value))} className="mt-3 w-full accent-purple-500" />
                  <div className="flex justify-between text-[9px] text-slate-600"><span>40</span><span>240</span></div>
                </label>

                <label className="space-y-1.5 text-xs text-slate-400">
                  <span>Duration</span>
                  <select value={durationSec} onChange={event => setDurationSec(Number(event.target.value))} className="w-full rounded-xl border border-slate-700 bg-slate-950 p-3 text-slate-100">
                    <option value={15}>15 seconds</option>
                    <option value={30}>30 seconds</option>
                    <option value={60}>1 minute</option>
                    <option value={120}>2 minutes</option>
                    <option value={180}>3 minutes</option>
                    <option value={240}>4 minutes</option>
                  </select>
                  <span className="block text-[10px] text-emerald-400">{durationSec > 90 ? 'Fast Long-Form active' : 'Full neural render'}</span>
                </label>
              </div>

              <label className="mt-4 block space-y-1.5 text-xs text-slate-400">
                <span>Lyrics (optional)</span>
                <textarea value={lyrics} onChange={event => setLyrics(event.target.value)} rows={4} placeholder="Leave empty for an instrumental track, or enter the real lyrics..." className="w-full rounded-2xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-100 outline-none focus:border-purple-500" />
              </label>

              <div className="mt-5 grid gap-3 sm:grid-cols-[0.38fr_0.62fr]">
                <button type="button" onClick={() => { setActiveTab('director'); void analyzePrompt(); }} disabled={previewLoading || !prompt.trim() || !genre.trim()} className="flex items-center justify-center gap-2 rounded-xl border border-purple-500/50 bg-purple-950/40 px-5 py-3.5 font-bold text-purple-200 disabled:opacity-50">
                  <Sparkles className="h-4 w-4" /> Analyze with AI Director
                </button>
                <button type="button" onClick={() => void generate()} disabled={busy || !prompt.trim() || !genre.trim()} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 via-indigo-600 to-cyan-600 px-6 py-3.5 font-black shadow-lg shadow-purple-950/50 disabled:cursor-not-allowed disabled:opacity-50">
                  {busy ? <RefreshCw className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
                  {busy ? 'Real production in progress...' : 'Generate Real Track'}
                </button>
              </div>

              {error && <pre className="mt-4 whitespace-pre-wrap rounded-xl border border-red-900 bg-red-950/40 p-4 text-xs text-red-300">{error}</pre>}
            </section>

            <aside className="space-y-4">
              <section className="rounded-3xl border border-purple-800/50 bg-gradient-to-b from-purple-950/40 to-slate-900/70 p-5">
                <div className="flex items-center gap-2 text-purple-300"><Brain className="h-5 w-5" /><h3 className="font-black">Visible AI Pipeline</h3></div>
                <div className="mt-5 space-y-3">
                  {[
                    ['01', 'Genre Lock & Prompt Intelligence'],
                    ['02', 'Music DNA Recall'],
                    ['03', 'Pattern & Arrangement Planner'],
                    ['04', 'ACE-Step Neural Rendering'],
                    ['05', '14-Stage DSP Mastering'],
                    ['06', 'Demucs GPU Stem Separation'],
                    ['07', 'Continuous Learning Audit']
                  ].map(([number, label]) => (
                    <div key={number} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
                      <span className="font-mono text-[10px] font-black text-purple-400">{number}</span>
                      <span className="text-xs font-semibold text-slate-200">{label}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5">
                <div className="flex items-center gap-2"><Clock className="h-4 w-4 text-cyan-400" /><h3 className="text-sm font-black">Live job state</h3></div>
                <p className="mt-4 text-sm text-slate-300">{stage}</p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} /></div>
                <div className="mt-3 flex justify-between text-[10px] text-slate-500"><span>{jobId || 'No job ID yet'}</span><span>{progress}%</span></div>
              </section>
            </aside>
          </div>
        )}

        {activeTab === 'director' && (
          <div className="grid gap-6 xl:grid-cols-[0.62fr_1.38fr]">
            <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-purple-400">AI Director</p>
              <h2 className="mt-1 text-2xl font-black">Prompt Intelligence</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">Inspect exactly what reaches ACE-Step before spending GPU time. Genre, tempo, key and meter come from the real backend.</p>
              <button type="button" onClick={() => void analyzePrompt()} disabled={previewLoading || !prompt.trim() || !genre.trim()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 px-5 py-3 font-black disabled:opacity-50">
                {previewLoading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Analyze current brief
              </button>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <MetricCard label="Locked genre" value={formatValue(genreLock.subgenre, genre)} detail={formatValue(genreLock.primaryGenre, 'Awaiting analysis')} />
                <MetricCard label="Target tempo" value={`${formatValue(genreLock.targetBpm, bpm)} BPM`} detail={formatValue(genreLock.timeSignature, 'Meter pending')} tone="cyan" />
                <MetricCard label="Key" value={formatValue(genreLock.keySignature)} detail={`Family: ${formatValue(genreLock.familyId)}`} tone="emerald" />
                <MetricCard label="Fidelity lock" value={formatValue(genreLock.fidelityScore)} detail={genreLock.locked ? 'Hard constraint active' : 'Awaiting analysis'} tone="amber" />
              </div>
            </section>

            <section className="rounded-3xl border border-purple-800/40 bg-slate-900/70 p-6">
              <div className="flex items-center justify-between gap-3"><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-400">ACE-Step payload</p><h3 className="mt-1 text-lg font-black">Optimized production prompt</h3></div><FileText className="h-6 w-6 text-slate-600" /></div>
              {preview?.optimizedPrompt ? (
                <pre className="mt-5 max-h-[430px] overflow-auto whitespace-pre-wrap rounded-2xl border border-slate-800 bg-slate-950 p-5 text-xs leading-relaxed text-slate-300">{preview.optimizedPrompt}</pre>
              ) : (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-700 p-12 text-center text-sm text-slate-500">Run the AI Director analysis to reveal the real optimized prompt.</div>
              )}
              {preview?.injectedKeywords && preview.injectedKeywords.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">{preview.injectedKeywords.map(keyword => <span key={keyword} className="rounded-full border border-purple-800 bg-purple-950/40 px-3 py-1 text-[10px] text-purple-200">{keyword}</span>)}</div>
              )}
              {previewError && <p className="mt-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-xs text-red-300">{previewError}</p>}
            </section>
          </div>
        )}

        {activeTab === 'brain' && (
          <section className="rounded-3xl border border-slate-800 bg-slate-950/40 p-3 sm:p-5">
            <MusicBrainDashboard />
          </section>
        )}

        {activeTab === 'production' && (
          <div className="space-y-6">
            {!audioUrl ? (
              <section className="rounded-3xl border border-dashed border-slate-700 bg-slate-900/40 p-12 text-center">
                <Layers className="mx-auto h-10 w-10 text-slate-600" />
                <h2 className="mt-4 text-xl font-black">No completed production yet</h2>
                <p className="mt-2 text-sm text-slate-400">Generate a track to reveal the real master audit, arrangement, stems and DSP controls.</p>
                <button type="button" onClick={() => setActiveTab('studio')} className="mt-5 rounded-xl bg-purple-600 px-5 py-2.5 text-sm font-bold">Open Production Studio</button>
              </section>
            ) : (
              <>
                <section className="rounded-3xl border border-emerald-800/60 bg-gradient-to-r from-emerald-950/30 to-slate-900/80 p-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div><div className="flex items-center gap-2 text-emerald-300"><CheckCircle2 className="h-5 w-5" /><span className="text-xs font-black uppercase tracking-widest">Production complete</span></div><h2 className="mt-2 text-2xl font-black">{formatValue(jobMetadata?.title, title)}</h2><p className="mt-1 text-xs text-slate-400">{engine} · Job {jobId}</p></div>
                    <div className="flex flex-wrap gap-2"><a href={audioUrl} download={`Sonara-${jobId}.wav`} className="flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2.5 text-xs font-bold"><Download className="h-4 w-4" />Original master</a>{processedAudioUrl && <a href={processedAudioUrl} download={`Sonara-${jobId}-equalized.wav`} className="flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold"><Download className="h-4 w-4" />EQ master</a>}</div>
                  </div>
                </section>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <MetricCard label="Arrangement" value={`${formatValue(arrangement.totalBars)} bars`} detail={`${formatValue(arrangement.timeSignature)} · ${formatValue(jobMetadata?.bpm)} BPM`} />
                  <MetricCard label="Loudness" value={`${formatValue(mastering.integratedLufs)} LUFS`} detail={`True Peak ${formatValue(mastering.truePeakDbtp)} dBTP`} tone="cyan" />
                  <MetricCard label="Generation" value={formatValue(generationStrategy.mode)} detail={`${formatValue(generationStrategy.finalDurationSec)} seconds`} tone="emerald" />
                  <MetricCard label="Stem engine" value={formatValue(separation.status)} detail={`${formatValue(separation.engine)} · ${formatValue(separation.device)}`} tone="amber" />
                </div>

                {Object.keys(stems).length > 0 && (
                  <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
                    <div className="flex items-center gap-2"><Layers className="h-5 w-5 text-cyan-400" /><h3 className="font-black">Real GPU stems</h3></div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {Object.entries(stems).map(([name, stemValue]) => {
                        const stem = asRecord(stemValue);
                        const stemUrl = toStorageUrl(stem.path);
                        return <a key={name} href={stemUrl} download className="group rounded-2xl border border-slate-800 bg-slate-950 p-4 hover:border-cyan-500"><div className="flex items-center justify-between"><span className="font-black capitalize text-white">{name}</span><Download className="h-4 w-4 text-slate-500 group-hover:text-cyan-300" /></div><p className="mt-2 text-[10px] text-slate-500">{formatValue(stem.bytes)} bytes · WAV</p></a>;
                      })}
                    </div>
                  </section>
                )}
              </>
            )}

            <section id="professional-equalizer" className="rounded-3xl border border-purple-800/60 bg-slate-950/70 p-3 shadow-2xl shadow-purple-950/20 sm:p-5">
              <ProfessionalAudioEqualizer audioUrl={audioUrl} isEmbedded onProcessedAudio={setProcessedAudioUrl} />
            </section>
          </div>
        )}

        {activeTab === 'system' && (
          <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
            <section className="rounded-3xl border border-slate-800 bg-slate-900/70 p-6">
              <div className="flex items-center justify-between"><div><p className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">Live backend</p><h2 className="mt-1 text-2xl font-black">System Intelligence</h2></div><Server className="h-8 w-8 text-slate-600" /></div>
              <div className="mt-6 space-y-3">
                {[
                  [ShieldCheck, 'Backend service', formatValue(healthData?.status)],
                  [Activity, 'Audio engine', formatValue(audioTelemetry.status)],
                  [Cpu, 'Runtime architecture', formatValue(systemTelemetry.arch)],
                  [Database, 'Music Brain records', formatValue(analyzedTracks)],
                  [Settings, 'Memory usage', `${formatValue(systemTelemetry.memoryUsagePercent)}%`]
                ].map(([IconValue, label, value]) => {
                  const Icon = IconValue as typeof Activity;
                  return <div key={String(label)} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-3"><div className="flex items-center gap-3"><Icon className="h-4 w-4 text-purple-400" /><span className="text-xs text-slate-300">{String(label)}</span></div><span className="font-mono text-[11px] font-bold text-emerald-300">{String(value)}</span></div>;
                })}
              </div>
              <button type="button" onClick={() => void refreshPlatformData()} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-xs font-bold hover:border-purple-500"><RefreshCw className={`h-4 w-4 ${platformLoading ? 'animate-spin' : ''}`} />Refresh real telemetry</button>
            </section>

            <section className="space-y-4">
              <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5"><div className="flex items-center gap-2"><Brain className="h-4 w-4 text-purple-400" /><h3 className="text-sm font-black">Continuous Learning</h3></div><pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-[10px] leading-relaxed text-slate-400">{learningStats ? JSON.stringify(learningStats, null, 2) : 'No learning telemetry returned yet.'}</pre></div>
              <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-5"><div className="flex items-center gap-2"><Play className="h-4 w-4 text-cyan-400" /><h3 className="text-sm font-black">Research Engine Metrics</h3></div><pre className="mt-4 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-[10px] leading-relaxed text-slate-400">{researchMetrics ? JSON.stringify(researchMetrics, null, 2) : 'No research metrics returned yet.'}</pre></div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
