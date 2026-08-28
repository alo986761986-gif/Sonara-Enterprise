import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BrainCircuit, Download, Film, Loader2, Play, Shuffle, Sparkles, WandSparkles, X } from 'lucide-react';
import { getFirebaseIdToken } from '../../lib/firebaseClient';
import type { SonaraPlanId, SonaraVideoResolution } from '../../billing/plans';
import { buildIntelligentVideoPrompt, buildRandomVideoPrompt } from '../../videoPromptIntelligence';

type AspectRatio = '16:9' | '9:16';
type VideoStatus = {
  planId: SonaraPlanId;
  planName: string;
  videoCreditsPerMonth: number;
  videoCreditsUsed: number;
  videoCreditsRemaining: number;
  videoClipSeconds: number;
  videoResolutions: SonaraVideoResolution[];
  providerConfigured: boolean;
};

type JobPayload = {
  jobId?: string;
  status?: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress?: number;
  stage?: string;
  videoUrl?: string;
  error?: string | { message?: string };
};

const NAV_HOST_ID = 'sonara-video-ai-nav-host';
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function errorMessage(payload: JobPayload, fallback: string) {
  if (typeof payload.error === 'string') return payload.error;
  if (payload.error && typeof payload.error.message === 'string') return payload.error.message;
  return fallback;
}

async function readApiJson<T>(response: Response, fallback: string): Promise<T> {
  const text = await response.text();
  const trimmed = text.trim();
  if (!trimmed) {
    if (!response.ok) throw new Error(`${fallback} (HTTP ${response.status}).`);
    return {} as T;
  }
  if (/^<!doctype\s+html/i.test(trimmed) || /^<html/i.test(trimmed)) {
    throw new Error(`${fallback} Il server Video AI ha restituito una pagina HTML invece di JSON (HTTP ${response.status}).`);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`${fallback} Risposta non valida dal server Video AI (HTTP ${response.status}).`);
  }
}

export default function VideoAISectionControl() {
  const [navHost, setNavHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState('Cinematic music video, dramatic lighting, elegant camera movement, premium production design, realistic textures, atmospheric depth.');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [resolution, setResolution] = useState<SonaraVideoResolution>('720p');
  const [durationSeconds, setDurationSeconds] = useState(8);
  const [status, setStatus] = useState<VideoStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('Pronto');
  const [error, setError] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [promptVariant, setPromptVariant] = useState(0);
  const [smartPromptActive, setSmartPromptActive] = useState(false);

  const nextPromptVariant = () => {
    const next = promptVariant + 1;
    setPromptVariant(next);
    return next;
  };

  const clearPrompt = () => {
    if (busy) return;
    setPrompt('');
    setSmartPromptActive(false);
  };

  const randomizePrompt = () => {
    if (busy) return;
    const variant = nextPromptVariant();
    setPrompt(buildRandomVideoPrompt({ aspectRatio, durationSeconds, variant }));
    setSmartPromptActive(false);
  };

  const improvePrompt = () => {
    if (busy) return;
    const variant = nextPromptVariant();
    setPrompt(buildIntelligentVideoPrompt(prompt, { aspectRatio, durationSeconds, variant }));
    setSmartPromptActive(true);
  };

  useEffect(() => {
    const mountNav = () => {
      const aside = document.querySelector('aside');
      if (!(aside instanceof HTMLElement)) return;
      let host = document.getElementById(NAV_HOST_ID);
      if (!host) {
        host = document.createElement('div');
        host.id = NAV_HOST_ID;
        const studio = document.getElementById('sonara-studio-nav-host');
        if (studio?.nextSibling) aside.insertBefore(host, studio.nextSibling);
        else if (studio) aside.appendChild(host);
        else aside.prepend(host);
      }
      setNavHost(host);
    };
    mountNav();
    const timer = window.setInterval(mountNav, 900);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const refreshStatus = async () => {
    try {
      const token = await getFirebaseIdToken(true);
      const response = await fetch('/api/video/status', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      const payload = await readApiJson<any>(response, 'Impossibile leggere il piano Video AI.');
      if (!response.ok) throw new Error(payload?.error?.message || payload?.error || `Impossibile leggere il piano Video AI (HTTP ${response.status}).`);
      setStatus(payload as VideoStatus);
      if (!payload.videoResolutions?.includes(resolution)) setResolution(payload.videoResolutions?.[0] || '720p');
      if (durationSeconds > Number(payload.videoClipSeconds || 8)) setDurationSeconds(8);
    } catch (cause) {
      setStatus(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  useEffect(() => { if (open) void refreshStatus(); }, [open]);

  const generate = async () => {
    if (busy || !prompt.trim()) return;
    setBusy(true);
    setError('');
    setVideoUrl('');
    setProgress(5);
    setStage('SONARA Video AI: avvio generazione');
    try {
      const token = await getFirebaseIdToken(true);
      const response = await fetch('/api/video/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prompt: prompt.trim(), aspectRatio, resolution, durationSeconds })
      });
      const started = await readApiJson<JobPayload>(response, 'Video non avviato.');
      if (!response.ok || !started.jobId) throw new Error(errorMessage(started, `Video non avviato (HTTP ${response.status}).`));

      for (let attempt = 0; attempt < 360; attempt += 1) {
        await sleep(5_000);
        const poll = await fetch(`/api/video/job/${encodeURIComponent(started.jobId)}`, {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store'
        });
        const current = await readApiJson<JobPayload>(poll, 'Controllo Video AI non disponibile.');
        if (!poll.ok) throw new Error(errorMessage(current, `Controllo video fallito (HTTP ${poll.status}).`));
        setProgress(Number(current.progress || Math.min(95, 12 + attempt)));
        setStage(current.stage || 'SONARA Video AI: rendering');
        if (current.status === 'FAILED') throw new Error(errorMessage(current, 'Generazione video fallita.'));
        if (current.status === 'COMPLETED' && current.videoUrl) {
          setVideoUrl(current.videoUrl);
          setProgress(100);
          setStage('Video pronto');
          await refreshStatus();
          return;
        }
      }
      throw new Error('Il rendering video sta richiedendo più tempo del previsto.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setProgress(0);
      setStage('Errore');
    } finally {
      setBusy(false);
    }
  };

  const overlay = useMemo(() => !open ? null : (
    <div className="fixed inset-0 z-[2147482050] overflow-auto bg-[#06070a] text-slate-100" data-sonara-video-ai="true">
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#06070a]/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1700px] items-center gap-3 px-4 py-3 sm:px-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-black"><Film className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><span className="font-black text-white">SONARA VIDEO AI</span><span className="rounded-full border border-violet-400/20 bg-violet-400/10 px-2 py-0.5 text-[8px] font-black tracking-wider text-violet-200">GENERATIVE VIDEO</span></div>
            <div className="mt-0.5 text-[9px] font-bold uppercase tracking-[0.18em] text-slate-600">Text to Video · Native AI Audio · 16:9 / 9:16</div>
          </div>
          {status && <div className="hidden rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2 text-right sm:block"><div className="text-[9px] font-black text-white">{status.planName}</div><div className="text-[8px] text-slate-500">{status.videoCreditsRemaining}/{status.videoCreditsPerMonth} crediti</div></div>}
          <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.03] text-slate-400 hover:text-white" aria-label="Chiudi Video AI"><X className="h-4 w-4" /></button>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1700px] gap-5 p-4 sm:p-6 xl:grid-cols-[minmax(0,1fr)_520px]">
        <section className="rounded-3xl border border-white/[0.07] bg-[#0b0c10] p-5 sm:p-6">
          <div className="mb-5"><div className="text-xs font-black uppercase tracking-[0.18em] text-violet-300">AI Director</div><h2 className="mt-2 text-2xl font-black tracking-tight text-white">Descrivi il video che vuoi creare</h2><p className="mt-2 max-w-2xl text-xs leading-6 text-slate-500">SONARA trasforma il prompt in una clip cinematografica. Specifica scena, soggetto, camera, luce, atmosfera e movimento.</p></div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" onClick={clearPrompt} disabled={busy || !prompt} title="Cancella tutto il prompt" aria-label="Cancella tutto il prompt" className="inline-flex items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[10px] font-black text-slate-300 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-200 disabled:opacity-30"><X className="h-3.5 w-3.5" />CANCELLA</button>
            <button type="button" onClick={randomizePrompt} disabled={busy} title="Crea un prompt video casuale professionale" aria-label="Prompt video Random" className="inline-flex items-center gap-2 rounded-xl border border-fuchsia-400/25 bg-fuchsia-400/[0.08] px-3 py-2 text-[10px] font-black text-fuchsia-200 transition hover:border-fuchsia-300/45 hover:bg-fuchsia-400/15 disabled:opacity-30"><Shuffle className="h-3.5 w-3.5" />RANDOM</button>
            <button type="button" onClick={improvePrompt} disabled={busy} title="Trasforma il prompt con SONARA Video Intelligence" aria-label="Prompt Video Intelligente" className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[10px] font-black transition disabled:opacity-30 ${smartPromptActive ? 'border-cyan-300/50 bg-cyan-400/20 text-cyan-100' : 'border-cyan-400/25 bg-cyan-400/[0.08] text-cyan-200 hover:border-cyan-300/45 hover:bg-cyan-400/15'}`}><BrainCircuit className="h-3.5 w-3.5" />{smartPromptActive ? 'OTTIMIZZATO' : 'INTELLIGENTE'}</button>
            <span className="ml-auto text-[8px] font-bold uppercase tracking-[0.16em] text-slate-700">Regia · Musica · Montaggio · Continuità</span>
          </div>
          <textarea value={prompt} onChange={event => { setPrompt(event.target.value); setSmartPromptActive(false); }} rows={10} disabled={busy} className="w-full resize-y rounded-2xl border border-white/[0.08] bg-black/40 p-5 text-sm leading-6 text-white outline-none focus:border-violet-400/40 disabled:opacity-50" placeholder="Es. Una cantante su un tetto di Napoli al tramonto, camera orbitale lenta, vento nei capelli, look cinematografico..." />

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Formato</div><div className="mt-3 grid grid-cols-2 gap-2">{(['16:9','9:16'] as AspectRatio[]).map(value => <button key={value} type="button" disabled={busy} onClick={() => setAspectRatio(value)} className={`rounded-xl px-3 py-3 text-xs font-black ${aspectRatio === value ? 'bg-white text-black' : 'border border-white/[0.07] bg-black/30 text-slate-400'}`}>{value === '16:9' ? 'Landscape 16:9' : 'Vertical 9:16'}</button>)}</div></div>
            <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4"><div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Qualità piano</div><div className="mt-3 grid grid-cols-3 gap-2">{(['720p','1080p','4k'] as SonaraVideoResolution[]).map(value => { const allowed = Boolean(status?.videoResolutions.includes(value)); return <button key={value} type="button" disabled={busy || !allowed} onClick={() => setResolution(value)} className={`rounded-xl px-2 py-3 text-[10px] font-black ${resolution === value && allowed ? 'bg-violet-500 text-white' : 'border border-white/[0.07] bg-black/30 text-slate-500 disabled:opacity-25'}`}>{value.toUpperCase()}</button>; })}</div></div>
          </div>

          <div className="mt-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
            <div className="flex items-center justify-between gap-3"><div className="text-[9px] font-black uppercase tracking-widest text-slate-500">Durata video</div>{status?.planId === 'studio' && <div className="text-[9px] font-black text-violet-300">STUDIO · FINO A 2 MINUTI</div>}</div>
            <div className="mt-3 grid grid-cols-4 gap-2">{([8, 30, 60, 120] as const).map(value => { const allowed = value <= Number(status?.videoClipSeconds || 8); return <button key={value} type="button" disabled={busy || !allowed} onClick={() => setDurationSeconds(value)} className={`rounded-xl px-2 py-3 text-[10px] font-black ${durationSeconds === value && allowed ? 'bg-violet-500 text-white' : 'border border-white/[0.07] bg-black/30 text-slate-500 disabled:opacity-25'}`}>{value < 60 ? `${value}s` : `${value / 60} min`}</button>; })}</div>
            {durationSeconds > 8 && <p className="mt-3 text-[9px] leading-5 text-slate-500">SONARA crea {Math.ceil(durationSeconds / 8)} scene coerenti e le monta automaticamente in un unico video MP4.</p>}
          </div>

          {status && <div className="mt-4 grid gap-3 sm:grid-cols-3"><div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="text-[8px] uppercase tracking-widest text-slate-600">Piano</div><div className="mt-1 text-xs font-black text-white">SONARA {status.planName}</div></div><div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="text-[8px] uppercase tracking-widest text-slate-600">Crediti rimasti</div><div className="mt-1 text-xs font-black text-white">{status.videoCreditsRemaining}</div></div><div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"><div className="text-[8px] uppercase tracking-widest text-slate-600">Durata clip</div><div className="mt-1 text-xs font-black text-white">{status.videoClipSeconds}s</div></div></div>}

          {!status?.providerConfigured && <div className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/[0.07] p-3 text-[10px] leading-5 text-amber-200">Motore Video AI non ancora configurato sul server. L'interfaccia e i limiti piano sono attivi; per generare serve la chiave provider lato Vercel.</div>}
          {error && <div className="mt-4 rounded-xl border border-rose-500/20 bg-rose-500/[0.07] p-3 text-xs text-rose-300">{error}</div>}

          <button type="button" onClick={() => void generate()} disabled={busy || !prompt.trim() || !status?.providerConfigured || !status.videoCreditsRemaining} className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-pink-600 px-5 py-4 text-sm font-black text-white shadow-xl shadow-violet-950/30 disabled:cursor-not-allowed disabled:opacity-35">
            {busy ? <><Loader2 className="h-5 w-5 animate-spin" />GENERAZIONE VIDEO...</> : <><WandSparkles className="h-5 w-5" />GENERA VIDEO AI</>}
          </button>
          {(busy || progress > 0) && <div className="mt-4"><div className="mb-2 flex justify-between text-[9px] text-slate-500"><span>{stage}</span><span>{progress}%</span></div><div className="h-1.5 overflow-hidden rounded-full bg-black"><div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-400 transition-all" style={{ width: `${progress}%` }} /></div></div>}
        </section>

        <aside className="rounded-3xl border border-white/[0.07] bg-[#0b0c10] p-5">
          <div className="flex items-center justify-between"><div><div className="text-sm font-black text-white">Preview</div><div className="mt-1 text-[8px] font-bold uppercase tracking-[0.18em] text-slate-600">SONARA VIDEO OUTPUT</div></div><Sparkles className="h-4 w-4 text-violet-300" /></div>
          {videoUrl ? <div className="mt-5"><video src={videoUrl} controls playsInline className="aspect-video w-full rounded-2xl bg-black object-contain" /><a href={videoUrl} download className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-3 text-xs font-black text-white"><Download className="h-4 w-4" />SCARICA MP4</a></div> : <div className="mt-5 flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed border-white/[0.07] bg-black/20 p-6 text-center"><div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04]"><Play className="h-6 w-6 text-slate-700" /></div><div className="mt-4 text-xs font-black text-slate-400">Nessun video ancora</div><p className="mt-2 max-w-xs text-[10px] leading-5 text-slate-600">Il video generato comparirà qui con player e download MP4.</p></div>}
        </aside>
      </main>
    </div>
  ), [open, prompt, aspectRatio, resolution, durationSeconds, status, busy, progress, stage, error, videoUrl, promptVariant, smartPromptActive]);

  return <>{navHost && createPortal(<button type="button" onClick={() => setOpen(true)} className="group flex w-full items-center gap-3 rounded-xl border border-violet-400/20 bg-violet-400/[0.05] px-4 py-3 text-left text-sm font-semibold text-violet-100 transition hover:border-violet-300/40 hover:bg-violet-400/[0.09]" aria-label="Apri SONARA Video AI"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-white"><Film className="h-3.5 w-3.5" /></span><span>VIDEO AI</span><span className="ml-auto rounded-md border border-violet-400/20 bg-violet-400/10 px-1.5 py-0.5 text-[8px] font-black tracking-wider text-violet-200">AI</span></button>, navHost)}{overlay && createPortal(overlay, document.body)}</>;
}
