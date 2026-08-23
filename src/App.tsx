import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AudioLines,
  BarChart3,
  Bot,
  Building2,
  Cloud,
  Cpu,
  Disc3,
  Download,
  Gauge,
  Globe2,
  Handshake,
  Library,
  Music,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Rocket,
  Settings2,
  Share2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Store,
  UploadCloud,
  Users,
  Zap
} from 'lucide-react';

type JobStatus = 'IDLE' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
type View =
  | 'overview'
  | 'generator'
  | 'production'
  | 'eq'
  | 'publishing'
  | 'marketplace'
  | 'discovery'
  | 'analytics'
  | 'assistant'
  | 'cloud'
  | 'collaboration'
  | 'enterprise'
  | 'settings';

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
const normalizeJob = (value: JobResponse): JobResponse => value?.job || value?.data || value;

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Invalid server response (HTTP ${response.status}).`);
  }
}

const Card = ({ children, className = '' }: any) => (
  <section className={`rounded-2xl border border-slate-800 bg-slate-900/75 shadow-xl ${className}`}>
    {children}
  </section>
);

const SectionTitle = ({ icon: Icon, title, subtitle }: any) => (
  <div className="mb-5 flex items-start gap-3">
    <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-2 text-purple-300">
      <Icon className="h-5 w-5" />
    </div>
    <div>
      <h2 className="text-lg font-black tracking-tight text-white">{title}</h2>
      {subtitle && <p className="mt-1 text-xs text-slate-400">{subtitle}</p>}
    </div>
  </div>
);

const StatusPill = ({ ok, children }: any) => (
  <span className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
    ok
      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
      : 'border-slate-700 bg-slate-950 text-slate-400'
  }`}>
    {children}
  </span>
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
  const [engine, setEngine] = useState('ACE-Step 1.5 / Modal L4');
  const [health, setHealth] = useState('CHECKING');

  const [eqLow, setEqLow] = useState(0);
  const [eqMid, setEqMid] = useState(0);
  const [eqHigh, setEqHigh] = useState(0);
  const [masterGain, setMasterGain] = useState(0);

  const [dnaCount, setDnaCount] = useState(0);
  const [styleCount, setStyleCount] = useState(0);
  const [workers, setWorkers] = useState<any[]>([]);
  const [trainingStats, setTrainingStats] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<View>('overview');
  const [isPlaying, setIsPlaying] = useState(false);
  const [assistantNote, setAssistantNote] = useState(
    'ACE-Step is ready. I can help you refine prompt, arrangement, BPM, mood and production choices.'
  );

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const busy = status === 'QUEUED' || status === 'PROCESSING';

  const statusLabel = useMemo(() => {
    if (health === 'READY') return 'ONLINE';
    if (health === 'CHECKING') return 'CHECKING';
    return health;
  }, [health]);

  const navigation: Array<[View, string, any]> = [
    ['overview', 'Overview', Gauge],
    ['generator', 'Generator', Zap],
    ['production', 'Production', Cpu],
    ['eq', 'EQ / Master', SlidersHorizontal],
    ['publishing', 'Publishing', Rocket],
    ['marketplace', 'Marketplace', Store],
    ['discovery', 'Discovery', Globe2],
    ['analytics', 'Analytics', BarChart3],
    ['assistant', 'AI Assistant', Bot],
    ['cloud', 'Sonara Cloud', Cloud],
    ['collaboration', 'Collaboration', Handshake],
    ['enterprise', 'Enterprise', Building2],
    ['settings', 'Settings', Settings2]
  ];

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

    const optionalJson = async (url: string) => {
      try {
        const response = await fetch(url, { cache: 'no-store' });
        if (!response.ok) return null;
        return await readJson<any>(response);
      } catch {
        return null;
      }
    };

    const dna = await optionalJson('/api/music/dna/elements');
    if (dna) setDnaCount(Array.isArray(dna.elements) ? dna.elements.length : 0);

    const styles = await optionalJson('/api/music/style/all');
    if (styles) setStyleCount(Array.isArray(styles.styles) ? styles.styles.length : 0);

    const workerData = await optionalJson('/api/music/workers/status');
    if (workerData) setWorkers(Array.isArray(workerData.workers) ? workerData.workers : []);

    const training = await optionalJson('/api/music/training/dashboard');
    if (training) setTrainingStats(training);
  };

  const generate = async () => {
    if (!prompt.trim() || busy) return;

    setStatus('QUEUED');
    setProgress(0);
    setStage('Sending request to ACE-Step...');
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
          engineId: 'sonara_ace_step_v15_modal'
        })
      });

      const responseData = await readJson<JobResponse>(response);
      if (!response.ok) {
        throw new Error(
          responseData.error || responseData.message || `Generation failed HTTP ${response.status}`
        );
      }

      const initial = normalizeJob(responseData);
      const id = responseData.jobId || responseData.result?.jobId || initial.jobId;
      if (!id) throw new Error('ACE-Step did not return a job ID.');

      setJobId(id);
      setStatus('PROCESSING');
      setStage('ACE-Step 1.5 is generating the track on Modal L4...');

      for (let attempt = 0; attempt < 1200; attempt += 1) {
        await sleep(500);
        const poll = await fetch(`/api/music/job/${encodeURIComponent(id)}`, { cache: 'no-store' });
        if (!poll.ok) continue;

        const raw = await readJson<JobResponse>(poll);
        const current = normalizeJob(raw);
        const currentStatus = String(current.status || 'PROCESSING').toUpperCase();
        const metadata = current.metadata || {};

        setProgress(Number(current.progress || 0));
        setStage(
          metadata.currentStage ||
            (currentStatus === 'COMPLETED' ? 'Generation complete' : 'ACE-Step processing...')
        );
        if (metadata.engine) setEngine(String(metadata.engine));

        if (currentStatus === 'COMPLETED') {
          const url = current.audioUrl || metadata.audioUrl || responseData.audioUrl || responseData.result?.audioUrl;
          if (!url) throw new Error('ACE-Step completed without an audio URL.');
          setAudioUrl(String(url));
          setProgress(100);
          setStatus('COMPLETED');
          setStage('Audio ready');
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
    }
  };

  const processEq = async () => {
    if (!audioUrl) {
      setError('Generate a track before applying EQ / Mastering.');
      return;
    }

    setStage('Sonara EQ / Master processing...');
    setError('');

    try {
      const bands = [
        { type: 'lowshelf', frequency: 100, gain: eqLow, q: 0.7 },
        { type: 'peaking', frequency: 1000, gain: eqMid, q: 1.0 },
        { type: 'highshelf', frequency: 8000, gain: eqHigh, q: 0.7 }
      ];

      const response = await fetch('/api/music/eq/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bands, audioUrl, masterGain })
      });
      const data = await readJson<any>(response);
      if (!response.ok) throw new Error(data.error || `EQ processing HTTP ${response.status}`);
      if (data.audioUrl) setAudioUrl(data.audioUrl);
      setStage('EQ / Mastering complete');
    } catch (err: any) {
      setError(err?.message || String(err));
      setStage('EQ / Mastering unavailable');
    }
  };

  const askAssistant = () => {
    const note = `${genre} · ${mood} · ${bpm} BPM · ${keySignature}: keep the kick and bass separated, build contrast before the main drop, and use the prompt to specify arrangement, sound palette and mix character. ACE-Step will receive the exact production brief.`;
    setAssistantNote(note);
  };

  const renderOverview = () => (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ['ENGINE', 'ACE-Step 1.5', Cpu, true],
          ['GPU', 'Modal L4', Activity, health === 'READY'],
          ['GENERATION', status === 'IDLE' ? 'READY' : status, Zap, status !== 'FAILED'],
          ['OUTPUT', audioUrl ? 'AUDIO READY' : 'WAITING', AudioLines, Boolean(audioUrl)]
        ].map(([label, value, Icon, ok]: any) => (
          <Card key={label} className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{label}</div>
                <div className="mt-2 text-lg font-black text-white">{value}</div>
              </div>
              <Icon className={`h-6 w-6 ${ok ? 'text-emerald-400' : 'text-purple-400'}`} />
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-6">
        <SectionTitle icon={Sparkles} title="Sonara Enterprise Workspace" subtitle="All principal Sonara areas restored in one production dashboard." />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {navigation.slice(1, 12).map(([id, label, Icon]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-left transition hover:border-purple-500/40 hover:bg-slate-900"
            >
              <Icon className="h-5 w-5 text-purple-400" />
              <div>
                <div className="font-bold text-slate-100">{label}</div>
                <div className="mt-1 text-[11px] text-slate-500">Open Sonara {label}</div>
              </div>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <SectionTitle icon={ShieldCheck} title="Production Stack" subtitle="Current live generation path." />
          <div className="space-y-3 text-sm">
            {['sonaraenterprise.com', 'Cloudflare API routing', 'Modal Proxy Auth', 'ACE-Step 1.5', 'NVIDIA L4', 'MP3 audio delivery'].map((item, index) => (
              <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-500/15 text-xs font-black text-purple-300">{index + 1}</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <SectionTitle icon={Radio} title="Current Session" subtitle="Live generator state." />
          <div className="space-y-3 text-sm text-slate-300">
            <div className="flex justify-between border-b border-slate-800 pb-3"><span>Genre</span><b>{genre}</b></div>
            <div className="flex justify-between border-b border-slate-800 pb-3"><span>Mood</span><b>{mood}</b></div>
            <div className="flex justify-between border-b border-slate-800 pb-3"><span>BPM</span><b>{bpm}</b></div>
            <div className="flex justify-between border-b border-slate-800 pb-3"><span>Duration</span><b>{durationSec}s</b></div>
            <div className="flex justify-between"><span>Job</span><b className="max-w-[240px] truncate font-mono text-xs">{jobId || '—'}</b></div>
          </div>
        </Card>
      </div>
    </div>
  );

  const renderGenerator = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <SectionTitle icon={Sparkles} title="ACE-Step 1.5 Music Generator" subtitle="Sonara production generation powered exclusively by ACE-Step on Modal L4." />

        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          rows={5}
          className="w-full rounded-xl border border-slate-700 bg-slate-950 p-4 outline-none focus:border-purple-500"
        />

        <div className="mt-4 grid gap-4 md:grid-cols-4">
          <label className="text-xs text-slate-400">Genre
            <select value={genre} onChange={e => setGenre(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2">
              <option>Deep House</option><option>Tech House</option><option>Afro House</option><option>Melodic House</option><option>House</option><option>Techno</option><option>Trance</option><option>Hip Hop</option><option>Rap</option><option>Pop</option><option>Rock</option><option>Jazz</option><option>Blues</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">Mood
            <select value={mood} onChange={e => setMood(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2">
              <option>Energetic</option><option>Dark</option><option>Hypnotic</option><option>Emotional</option><option>Atmospheric</option><option>Romantic</option><option>Aggressive</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">Key
            <select value={keySignature} onChange={e => setKeySignature(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2">
              <option>A Minor</option><option>E Minor</option><option>F Minor</option><option>D Minor</option><option>C Minor</option><option>C Major</option><option>G Major</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">Duration
            <select value={durationSec} onChange={e => setDurationSec(Number(e.target.value))} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2">
              <option value={15}>15 sec</option><option value={30}>30 sec</option><option value={60}>60 sec</option><option value={120}>120 sec</option>
            </select>
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-xs text-slate-400">BPM: {bpm}
            <input type="range" min={60} max={180} value={bpm} onChange={e => setBpm(Number(e.target.value))} className="mt-3 w-full" />
          </label>
          <label className="text-xs text-slate-400">Title
            <input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-2" />
          </label>
        </div>

        <details className="mt-4 rounded-xl border border-slate-800 bg-slate-950 p-4">
          <summary className="cursor-pointer font-semibold">Lyrics / Vocal mode</summary>
          <textarea value={lyrics} onChange={e => setLyrics(e.target.value)} rows={5} placeholder="Leave empty for instrumental / BGM" className="mt-3 w-full rounded-lg border border-slate-800 bg-black/30 p-3" />
        </details>

        <button onClick={() => void generate()} disabled={busy} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-4 font-black disabled:opacity-60">
          {busy ? <><RefreshCw className="h-5 w-5 animate-spin" /> ACE-Step Generating...</> : <><Zap className="h-5 w-5" /> Generate with ACE-Step</>}
        </button>
      </Card>

      {(busy || status === 'FAILED' || status === 'COMPLETED') && (
        <Card className="p-6">
          <div className="flex items-center justify-between"><span className="font-semibold">{stage}</span><span>{progress}%</span></div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-purple-500 transition-all" style={{ width: `${progress}%` }} /></div>
          {jobId && <div className="mt-2 text-xs text-slate-500">Job: {jobId}</div>}
          {error && <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-red-950/50 p-3 text-xs text-red-300">{error}</pre>}
        </Card>
      )}

      {audioUrl && (
        <Card className="p-6">
          <SectionTitle icon={AudioLines} title="Generated Audio" subtitle={engine} />
          <audio ref={audioRef} controls src={audioUrl} className="w-full" onEnded={() => setIsPlaying(false)} />
          <div className="mt-4 flex flex-wrap gap-3">
            <button onClick={() => setIsPlaying(v => !v)} className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2">
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}{isPlaying ? 'Pause' : 'Play'}
            </button>
            <a href={audioUrl} download className="flex items-center gap-2 rounded-lg bg-slate-800 px-4 py-2"><Download className="h-4 w-4" />Download</a>
            <button onClick={() => setActiveTab('production')} className="rounded-lg border border-slate-700 bg-slate-950 px-4 py-2">Send to Production</button>
          </div>
        </Card>
      )}
    </div>
  );

  const renderProduction = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <SectionTitle icon={Cpu} title="Production Center" subtitle="Mixing, stems, mastering and export workspace." />
        {!audioUrl && <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4 text-sm text-amber-200">Generate a track first to populate the production chain.</div>}
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Mixing Console', 'Balance levels, space and stereo field.', SlidersHorizontal],
            ['Stem Manager', 'Organize kick, bass, vocals, instruments and FX.', Disc3],
            ['Mastering Chain', 'Final dynamics, tone and loudness preparation.', Gauge],
            ['Export Center', 'Prepare the final audio for download and publishing.', Download]
          ].map(([name, desc, Icon]: any) => (
            <div key={name} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
              <Icon className="mb-3 h-5 w-5 text-purple-400" /><div className="font-bold">{name}</div><p className="mt-2 text-xs leading-relaxed text-slate-500">{desc}</p>
            </div>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <SectionTitle icon={AudioLines} title="Current Production Asset" subtitle={audioUrl ? 'ACE-Step output loaded.' : 'No audio loaded yet.'} />
        {audioUrl ? <audio controls src={audioUrl} className="w-full" /> : <button onClick={() => setActiveTab('generator')} className="rounded-xl bg-purple-600 px-4 py-3 font-bold">Open Generator</button>}
      </Card>
    </div>
  );

  const renderEq = () => (
    <Card className="p-6">
      <SectionTitle icon={SlidersHorizontal} title="Professional EQ / Mastering" subtitle="Tone shaping and final gain controls for the current Sonara track." />
      {[
        ['LOW', eqLow, setEqLow], ['MID', eqMid, setEqMid], ['HIGH', eqHigh, setEqHigh], ['MASTER', masterGain, setMasterGain]
      ].map(([name, value, setter]: any) => (
        <label key={name} className="mb-5 block">
          <div className="mb-2 flex justify-between text-sm"><span>{name}</span><span>{value} dB</span></div>
          <input type="range" min={-12} max={12} step={0.5} value={value} onChange={e => setter(Number(e.target.value))} className="w-full" />
        </label>
      ))}
      <button onClick={() => void processEq()} className="w-full rounded-xl bg-indigo-600 px-4 py-3 font-bold">Apply EQ + Master</button>
      {error && <pre className="mt-4 whitespace-pre-wrap rounded-lg bg-red-950/40 p-3 text-xs text-red-300">{error}</pre>}
    </Card>
  );

  const renderPublishing = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <SectionTitle icon={Rocket} title="Publishing Studio" subtitle="Prepare releases, metadata and distribution from the Sonara workspace." />
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs text-slate-400">Release title<input value={title} onChange={e => setTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-3" /></label>
          <label className="text-xs text-slate-400">Primary genre<input value={genre} onChange={e => setGenre(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-950 p-3" /></label>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {['Spotify', 'Apple Music', 'YouTube Music', 'Sonara Network'].map(platform => (
            <div key={platform} className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 p-4"><span className="font-bold">{platform}</span><StatusPill ok={Boolean(audioUrl)}>{audioUrl ? 'Ready' : 'Waiting'}</StatusPill></div>
          ))}
        </div>
        <div className="mt-5 rounded-xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-400">Audio asset: <b className="text-white">{audioUrl ? 'Loaded and ready for release preparation' : 'Generate or load a track first'}</b></div>
      </Card>
    </div>
  );

  const renderMarketplace = () => (
    <Card className="p-6">
      <SectionTitle icon={Store} title="Sonara Marketplace" subtitle="Creator assets, styles, samples, presets and production resources." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          ['Samples & Loops', 'Curated audio material for production.'],
          ['Presets', 'Synth, mix and mastering presets.'],
          ['Vocal Packs', 'Voice and vocal production resources.'],
          ['Templates', 'DAW and arrangement templates.'],
          ['AI Styles', 'Sonara style packs for creative direction.'],
          ['Creator Library', 'Purchased and saved marketplace content.']
        ].map(([name, desc]) => (
          <div key={name} className="rounded-xl border border-slate-800 bg-slate-950 p-5"><Store className="mb-3 h-5 w-5 text-amber-400" /><div className="font-bold">{name}</div><p className="mt-2 text-xs text-slate-500">{desc}</p></div>
        ))}
      </div>
    </Card>
  );

  const renderDiscovery = () => (
    <Card className="p-6">
      <SectionTitle icon={Globe2} title="Worldwide Discovery" subtitle="Explore creative directions, genres, creators and scenes." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {['House / Europe', 'Afro House / Global', 'Hip Hop / USA', 'Techno / Berlin', 'Pop / Global', 'Latin / Americas', 'Jazz / Worldwide', 'Electronic / Asia'].map(item => (
          <button key={item} onClick={() => { setPrompt(`${item}, professional production, modern arrangement, polished mix`); setActiveTab('generator'); }} className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-left hover:border-purple-500/40">
            <Globe2 className="mb-3 h-5 w-5 text-cyan-400" /><div className="font-bold">{item}</div><div className="mt-2 text-[11px] text-slate-500">Use as generator direction</div>
          </button>
        ))}
      </div>
    </Card>
  );

  const renderAnalytics = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <SectionTitle icon={BarChart3} title="Analytics Center" subtitle="Live session and Sonara workspace telemetry." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['ENGINE STATUS', statusLabel], ['DNA ELEMENTS', dnaCount], ['STYLE PACKS', styleCount], ['WORKERS', workers.length]
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-xl border border-slate-800 bg-slate-950 p-5"><div className="text-[10px] font-bold tracking-wider text-slate-500">{label}</div><div className="mt-2 text-2xl font-black text-white">{value}</div></div>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <SectionTitle icon={Activity} title="Generation Telemetry" subtitle="Current production job information." />
        <div className="space-y-3 text-sm">
          <div className="flex justify-between border-b border-slate-800 pb-3"><span>State</span><b>{status}</b></div>
          <div className="flex justify-between border-b border-slate-800 pb-3"><span>Progress</span><b>{progress}%</b></div>
          <div className="flex justify-between border-b border-slate-800 pb-3"><span>Engine</span><b>{engine}</b></div>
          <div className="flex justify-between"><span>Training telemetry</span><b>{trainingStats ? 'Available' : 'Not connected'}</b></div>
        </div>
      </Card>
    </div>
  );

  const renderAssistant = () => (
    <Card className="p-6">
      <SectionTitle icon={Bot} title="Sonara AI Assistant" subtitle="Production guidance connected to the current generator context." />
      <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 text-sm leading-relaxed text-slate-300">{assistantNote}</div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <button onClick={askAssistant} className="rounded-xl bg-purple-600 px-4 py-3 font-bold">Analyze current track</button>
        <button onClick={() => { setPrompt(`${prompt}, stronger arrangement contrast, professional transitions, detailed club mix, clean master`); setAssistantNote('I enhanced the current prompt with arrangement, transition and mix direction.'); }} className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-bold">Enhance prompt</button>
        <button onClick={() => setActiveTab('generator')} className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-bold">Open Generator</button>
      </div>
    </Card>
  );

  const renderCloud = () => (
    <Card className="p-6">
      <SectionTitle icon={Cloud} title="Sonara Cloud" subtitle="Production infrastructure and generation services." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {[
          ['Cloudflare Edge', 'API routing and protected public gateway', true],
          ['Modal GPU', 'NVIDIA L4 inference runtime', health === 'READY'],
          ['ACE-Step 1.5', 'Music generation engine', health === 'READY'],
          ['Proxy Auth', 'Secure Modal credential layer', health === 'READY'],
          ['Audio Delivery', audioUrl ? 'Generated audio available' : 'Waiting for output', Boolean(audioUrl)],
          ['Production Domain', 'sonaraenterprise.com', true]
        ].map(([name, desc, ok]: any) => (
          <div key={name} className="rounded-xl border border-slate-800 bg-slate-950 p-5"><div className="flex items-center justify-between"><b>{name}</b><StatusPill ok={ok}>{ok ? 'Online' : 'Standby'}</StatusPill></div><p className="mt-3 text-xs text-slate-500">{desc}</p></div>
        ))}
      </div>
    </Card>
  );

  const renderCollaboration = () => (
    <Card className="p-6">
      <SectionTitle icon={Handshake} title="Collaboration Hub" subtitle="Project rooms, creator handoff and production workflow." />
      <div className="grid gap-4 md:grid-cols-3">
        {[
          ['Studio Room', 'Share prompt, track and production notes.', Users],
          ['Stem Exchange', 'Prepare stems and production assets for collaborators.', Share2],
          ['Release Team', 'Coordinate publishing and release preparation.', Rocket]
        ].map(([name, desc, Icon]: any) => (
          <div key={name} className="rounded-xl border border-slate-800 bg-slate-950 p-5"><Icon className="mb-3 h-5 w-5 text-cyan-400" /><div className="font-bold">{name}</div><p className="mt-2 text-xs text-slate-500">{desc}</p></div>
        ))}
      </div>
    </Card>
  );

  const renderEnterprise = () => (
    <div className="space-y-6">
      <Card className="p-6">
        <SectionTitle icon={Building2} title="Sonara Enterprise" subtitle="Central control plane for the complete Sonara production ecosystem." />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Music AI', 'ACE-Step 1.5'], ['Compute', 'Modal NVIDIA L4'], ['Edge', 'Cloudflare'], ['Frontend', 'Vercel + Sonara Domain']
          ].map(([name, value]) => (
            <div key={name} className="rounded-xl border border-slate-800 bg-slate-950 p-5"><div className="text-xs text-slate-500">{name}</div><div className="mt-2 font-black text-white">{value}</div></div>
          ))}
        </div>
      </Card>
      <Card className="p-6">
        <SectionTitle icon={ShieldCheck} title="Enterprise Readiness" subtitle="Current production configuration." />
        <div className="space-y-3">
          {['ACE-Step only production generation', 'Protected Modal Proxy Auth', 'Dedicated Cloudflare Worker', 'Production domain routing', 'GitHub connected automatic deployments'].map(item => (
            <div key={item} className="flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3"><ShieldCheck className="h-4 w-4 text-emerald-400" /><span className="text-sm">{item}</span></div>
          ))}
        </div>
      </Card>
    </div>
  );

  const renderSettings = () => (
    <Card className="p-6">
      <SectionTitle icon={Settings2} title="Sonara Settings" subtitle="Production engine and workspace configuration." />
      <div className="grid gap-4 md:grid-cols-2">
        {[
          ['Production Engine', 'ACE-Step 1.5'],
          ['Model', 'acestep-v15-turbo'],
          ['Compute', 'Modal NVIDIA L4'],
          ['Audio Format', 'MP3'],
          ['API Gateway', 'Cloudflare Worker'],
          ['Generation Endpoint', '/api/engine/generate']
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</div><div className="mt-2 font-mono text-sm text-slate-100">{value}</div></div>
        ))}
      </div>
      <div className="mt-5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-sm text-emerald-200">ACE-Step is the only production music engine shown and used by this dashboard.</div>
    </Card>
  );

  const content = () => {
    switch (activeTab) {
      case 'overview': return renderOverview();
      case 'generator': return renderGenerator();
      case 'production': return renderProduction();
      case 'eq': return renderEq();
      case 'publishing': return renderPublishing();
      case 'marketplace': return renderMarketplace();
      case 'discovery': return renderDiscovery();
      case 'analytics': return renderAnalytics();
      case 'assistant': return renderAssistant();
      case 'cloud': return renderCloud();
      case 'collaboration': return renderCollaboration();
      case 'enterprise': return renderEnterprise();
      case 'settings': return renderSettings();
      default: return renderOverview();
    }
  };

  return (
    <div className="min-h-screen bg-[#070b12] text-slate-100">
      <header className="sticky top-0 z-30 border-b border-slate-800 bg-[#0b101b]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1700px] items-center justify-between px-5 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600"><Music className="h-6 w-6" /></div>
            <div>
              <h1 className="text-xl font-black tracking-wide">SONARA ENTERPRISE</h1>
              <div className="text-xs font-semibold text-purple-300">ACE-Step 1.5 · Modal NVIDIA L4</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => void refreshDashboard()} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs"><RefreshCw className="h-4 w-4" />Refresh</button>
            <div className="flex items-center gap-2 rounded-lg border border-emerald-900 bg-emerald-950/40 px-3 py-2 text-xs"><Activity className="h-4 w-4 text-emerald-400" />ACE-Step {statusLabel}</div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1700px] gap-6 p-5 lg:grid-cols-[245px_minmax(0,1fr)]">
        <aside className="space-y-2 lg:sticky lg:top-[92px] lg:self-start">
          {navigation.map(([id, label, Icon]) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${activeTab === id ? 'bg-gradient-to-r from-purple-600 to-violet-600 text-white shadow-lg shadow-purple-950/20' : 'border border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:bg-slate-800'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}

          <Card className="mt-4 p-4">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">System</div>
            <div className="space-y-3 text-xs">
              <div className="flex justify-between"><span>ACE-Step</span><b className={health === 'READY' ? 'text-emerald-400' : 'text-slate-400'}>{statusLabel}</b></div>
              <div className="flex justify-between"><span>DNA Library</span><b>{dnaCount}</b></div>
              <div className="flex justify-between"><span>Styles</span><b>{styleCount}</b></div>
              <div className="flex justify-between"><span>Workers</span><b>{workers.length}</b></div>
            </div>
          </Card>
        </aside>

        <main className="min-w-0 space-y-6">{content()}</main>
      </div>
    </div>
  );
}
