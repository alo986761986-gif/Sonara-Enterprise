import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Download, Music2, RefreshCw, Sparkles } from 'lucide-react';
import { buildGenerationPrompt, type VocalMode } from '../../generationPrompt';
import { getFirebaseIdToken } from '../../lib/firebaseClient';
import { archiveGeneratedProject } from '../../services/generatedAssetVault';

type CandidateId = 'A' | 'B';
type CandidateStatus = 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

type CandidateState = {
  id: CandidateId;
  status: CandidateStatus;
  progress: number;
  stage: string;
  audioUrl: string;
  audioFormat: string;
  jobId: string;
  error: string;
};

type GeneratorContext = {
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
  lyrics: string;
};

type JobResponse = {
  jobId?: string;
  status?: string;
  progress?: number;
  audioUrl?: string;
  audioUrls?: string[];
  candidates?: Array<{ id?: string; audioUrl?: string; audioFormat?: string }>;
  error?: string | { message?: string };
  message?: string;
  metadata?: Record<string, any>;
  result?: JobResponse;
  job?: JobResponse;
  data?: JobResponse;
};

const INITIAL: CandidateState[] = [
  { id: 'A', status: 'IDLE', progress: 0, stage: 'Pronto', audioUrl: '', audioFormat: 'wav', jobId: '', error: '' },
  { id: 'B', status: 'IDLE', progress: 0, stage: 'Pronto', audioUrl: '', audioFormat: 'wav', jobId: '', error: '' }
];

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const JOB_POLL_INTERVAL_MS = 2_000;
const MIN_JOB_TIMEOUT_MS = 30 * 60 * 1_000;

function generationTimeoutMs(durationSec: number): number {
  // Long-form audio can legitimately take several times its playback duration,
  // especially after a cold GPU start. Never expire an active 4-8 minute job
  // at the old fixed eight-minute client boundary.
  return Math.max(MIN_JOB_TIMEOUT_MS, Math.round(durationSec * 6 * 1_000));
}

function normalizeJob(value: JobResponse): JobResponse {
  return value?.job || value?.data || value;
}

function readError(value: JobResponse, fallback: string): string {
  if (typeof value.error === 'string') return value.error;
  if (value.error && typeof value.error.message === 'string') return value.error.message;
  return value.message || fallback;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

function readGeneratorContext(textarea: HTMLTextAreaElement): GeneratorContext {
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
  const vocalButtons = details ? Array.from(details.querySelectorAll('button[aria-pressed]')) as HTMLButtonElement[] : [];
  const activeIndex = Math.max(0, vocalButtons.findIndex(button => button.getAttribute('aria-pressed') === 'true'));
  const vocalMode = (['instrumental', 'male', 'female', 'duet'][activeIndex] || 'instrumental') as VocalMode;
  const lyricsTextarea = details?.querySelector('textarea') as HTMLTextAreaElement | null;
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
    lyrics: vocalMode === 'instrumental' ? '' : String(lyricsTextarea?.value || '').trim()
  };
}

function safeFileName(value: string): string {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9-_ ]+/g, '').trim().replace(/\s+/g, '-') || 'sonara-track';
}

export default function DualTrackGenerationControl() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<CandidateState[]>(INITIAL);
  const [selected, setSelected] = useState<CandidateId | null>(null);
  const [globalError, setGlobalError] = useState('');

  useEffect(() => {
    let originalButton: HTMLButtonElement | null = null;
    const connect = () => {
      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      const card = textarea?.closest('section');
      if (!textarea || !card) return;
      const button = Array.from(card.querySelectorAll('button')).find(candidate => {
        const className = String((candidate as HTMLButtonElement).className || '');
        return className.includes('bg-gradient-to-r') && className.includes('w-full');
      }) as HTMLButtonElement | undefined;
      if (!button) return;
      originalButton = button;
      button.style.display = 'none';
      let host = card.querySelector('[data-sonara-dual-generator-host]') as HTMLElement | null;
      if (!host) {
        host = document.createElement('div');
        host.setAttribute('data-sonara-dual-generator-host', 'true');
        button.insertAdjacentElement('afterend', host);
      }
      setMountNode(host);
    };
    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (originalButton) originalButton.style.display = '';
    };
  }, []);

  const setAllProcessing = (jobId: string, progress: number, stage: string) => {
    setCandidates(previous => previous.map(candidate => ({ ...candidate, status: 'PROCESSING', progress, stage, jobId, error: '' })));
  };

  const refreshBilling = async (token: string) => {
    try {
      const response = await fetch('/api/billing/status', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json();
      if (payload?.billing) window.dispatchEvent(new CustomEvent('sonara:billing-updated', { detail: payload.billing }));
    } catch {}
  };

  const generatePair = async () => {
    if (busy) return;
    setBusy(true);
    setSelected(null);
    setGlobalError('');
    setCandidates(INITIAL.map(candidate => ({ ...candidate })));

    try {
      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      if (!textarea) throw new Error('Apri il Music Creator prima di generare.');
      const context = readGeneratorContext(textarea);
      if (!context.rawPrompt) throw new Error('Scrivi o crea prima il prompt musicale.');
      if (context.vocalMode !== 'instrumental' && !context.lyrics) throw new Error('Inserisci il testo prima della generazione vocale.');

      const finalPrompt = buildGenerationPrompt({
        rawPrompt: `${context.rawPrompt}\n\nSONARA DUAL VARIATION ORDER: Generate two clearly distinct musical interpretations in the same batch. Candidate A and Candidate B must preserve genre, subgenre, BPM, key, duration, vocal mode and supplied lyrics, but must differ materially in melodic contour, groove details, voicing, transitions, sound-palette balance and arrangement development. Never return near-duplicates.`,
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
        lyrics: context.lyrics,
        title: context.title
      });

      const token = await getFirebaseIdToken(true);
      const pairId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `pair-${Date.now()}`;
      setAllProcessing('', 5, 'SONARA: avvio batch doppio ultra-fast');

      const response = await fetch('/api/billing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          prompt: finalPrompt,
          rawPrompt: context.rawPrompt,
          genreFamily: context.genreFamily,
          genre: context.genre,
          subgenre: context.subgenre,
          mood: context.mood,
          vocalMode: context.vocalMode,
          lyrics: context.lyrics,
          title: context.title,
          bpm: context.bpm,
          key: context.keySignature,
          durationSec: context.durationSec,
          duration: context.durationSec,
          weirdness: context.weirdness,
          styleInfluence: context.styleInfluence,
          outputFormat: 'wav',
          audioQuality: 'lossless',
          engineId: 'sonara_ace_step_v15_modal',
          dualFast: true,
          candidateCount: 2,
          generationPairId: pairId,
          variationPolicy: 'native-batch-distinct-candidates'
        })
      });

      const initialResponse = await readJson<JobResponse>(response);
      if (!response.ok) throw new Error(readError(initialResponse, `Generazione doppia non avviata (HTTP ${response.status}).`));
      const initial = normalizeJob(initialResponse);
      const jobId = initialResponse.jobId || initialResponse.result?.jobId || initial.jobId;
      if (!jobId) throw new Error('SONARA non ha restituito il job ID doppio.');
      setAllProcessing(jobId, Math.max(10, Number(initial.progress || 10)), String(initial.metadata?.currentStage || 'SONARA: 2 brani nello stesso batch GPU'));

      const pollDeadline = Date.now() + generationTimeoutMs(context.durationSec);
      while (Date.now() < pollDeadline) {
        await sleep(JOB_POLL_INTERVAL_MS);
        const poll = await fetch(`/api/music/job/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
        if (!poll.ok && poll.status !== 410) continue;
        const current = normalizeJob(await readJson<JobResponse>(poll));
        const status = String(current.status || 'PROCESSING').toUpperCase();
        if (status === 'FAILED') throw new Error(readError(current, 'Generazione doppia fallita.'));
        if (status !== 'COMPLETED') {
          setAllProcessing(jobId, Math.max(10, Number(current.progress || 10)), String(current.metadata?.currentStage || 'SONARA: rendering A + B insieme'));
          continue;
        }

        const outputCandidates = Array.isArray(current.candidates) && current.candidates.length >= 2
          ? current.candidates.slice(0, 2)
          : (current.audioUrls || current.metadata?.audioUrls || []).slice(0, 2).map((audioUrl: string, index: number) => ({ id: index === 0 ? 'A' : 'B', audioUrl, audioFormat: 'wav' }));
        if (outputCandidates.length < 2 || outputCandidates.some(candidate => !candidate.audioUrl)) {
          throw new Error('SONARA ha completato il batch ma non ha restituito entrambi i brani.');
        }

        const completed = outputCandidates.map((candidate, index) => ({
          id: (index === 0 ? 'A' : 'B') as CandidateId,
          status: 'COMPLETED' as CandidateStatus,
          progress: 100,
          stage: `Brano ${index === 0 ? 'A' : 'B'} pronto`,
          audioUrl: String(candidate.audioUrl),
          audioFormat: String(candidate.audioFormat || 'wav').toLowerCase(),
          jobId,
          error: ''
        }));
        setCandidates(completed);

        await Promise.allSettled(completed.map(candidate => archiveGeneratedProject({
          jobId: `${jobId}-${candidate.id}`,
          title: `${context.title} · Versione ${candidate.id}`,
          genre: context.genre,
          subgenre: context.subgenre,
          bpm: context.bpm,
          keySignature: context.keySignature,
          durationSec: context.durationSec,
          primaryAudioUrl: candidate.audioUrl,
          audioFormat: candidate.audioFormat,
          response: {
            generationPairId: pairId,
            variationId: candidate.id,
            completedJob: current,
            performanceProfile: 'dual-ultra-fast-v9',
            creativeControls: { weirdness: context.weirdness, styleInfluence: context.styleInfluence }
          }
        })));
        await refreshBilling(token);
        return;
      }
      throw new Error('La generazione sta impiegando più del previsto. Riprova il controllo del brano senza avviare un nuovo addebito.');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setGlobalError(message);
      setCandidates(previous => previous.map(candidate => ({ ...candidate, status: 'FAILED', progress: 0, stage: 'Errore', error: message })));
    } finally {
      setBusy(false);
    }
  };

  const chooseCandidate = (candidate: CandidateState) => {
    if (!candidate.audioUrl) return;
    setSelected(candidate.id);
    const selection = { variationId: candidate.id, jobId: candidate.jobId, audioUrl: candidate.audioUrl, audioFormat: candidate.audioFormat, selectedAt: new Date().toISOString() };
    localStorage.setItem('sonara.selectedGeneratedTrack', JSON.stringify(selection));
    window.dispatchEvent(new CustomEvent('sonara:generated-track-selected', { detail: selection }));
  };

  const downloadCandidate = async (candidate: CandidateState) => {
    if (!candidate.audioUrl) return;
    const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
    let title = `sonara-versione-${candidate.id}`;
    try { if (textarea) title = `${readGeneratorContext(textarea).title}-Versione-${candidate.id}`; } catch {}
    try {
      const response = await fetch(candidate.audioUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${safeFileName(title)}.${candidate.audioFormat || 'wav'}`.toLowerCase();
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch {
      window.open(candidate.audioUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (!mountNode) return null;

  return createPortal(
    <div className="mt-6 space-y-4">
      <button type="button" onClick={() => void generatePair()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 px-6 py-4 font-bold text-white shadow-lg shadow-purple-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <><RefreshCw className="h-5 w-5 animate-spin" />GENERAZIONE ULTRA-FAST A + B...</> : <><Sparkles className="h-5 w-5" />GENERA 2 BRANI VELOCISSIMI</>}
      </button>
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-[11px] leading-5 text-slate-400">
        Modalità <strong className="text-cyan-200">Dual Ultra-Fast</strong>: un solo job, un solo passaggio GPU, due brani differenti prodotti nello stesso batch ACE-Step XL-Turbo.
      </div>
      {globalError && <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-xs text-rose-300">{globalError}</div>}
      {candidates.some(candidate => candidate.status !== 'IDLE') && (
        <div className="grid gap-4 lg:grid-cols-2">
          {candidates.map(candidate => {
            const completed = candidate.status === 'COMPLETED' && Boolean(candidate.audioUrl);
            const chosen = selected === candidate.id;
            return (
              <article key={candidate.id} className={`rounded-2xl border p-4 transition ${chosen ? 'border-emerald-400/60 bg-emerald-500/10' : 'border-slate-800 bg-slate-950/70'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div><div className="font-black text-white">Brano {candidate.id}</div><div className="mt-1 text-[10px] text-slate-500">{candidate.stage}</div></div>
                  {chosen && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-black text-emerald-300"><CheckCircle2 className="h-3 w-3" />SCELTO</span>}
                </div>
                {candidate.status === 'PROCESSING' && <div className="mt-4"><div className="mb-1 flex justify-between text-[10px] text-slate-500"><span>Batch unico</span><span>{candidate.progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all" style={{ width: `${candidate.progress}%` }} /></div></div>}
                {candidate.error && <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-[11px] text-rose-300">{candidate.error}</div>}
                {completed && <div className="mt-4 space-y-3"><audio controls preload="metadata" src={candidate.audioUrl} className="w-full" /><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => chooseCandidate(candidate)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[11px] font-black text-emerald-200"><Music2 className="h-4 w-4" />{chosen ? 'BRANO SCELTO' : 'SCEGLI BRANO'}</button><button type="button" onClick={() => void downloadCandidate(candidate)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2.5 text-[11px] font-black text-purple-200"><Download className="h-4 w-4" />SCARICA {candidate.audioFormat.toUpperCase()}</button></div></div>}
              </article>
            );
          })}
        </div>
      )}
    </div>,
    mountNode
  );
}
