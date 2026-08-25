import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Download, Music2, RefreshCw, Sparkles } from 'lucide-react';
import { buildGenerationPrompt, type VocalMode } from '../../generationPrompt';
import { getFirebaseIdToken } from '../../lib/firebaseClient';
import { archiveGeneratedProject } from '../../services/generatedAssetVault';

type CandidateId = 'A' | 'B';
type CandidateStatus = 'IDLE' | 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

type JobResponse = {
  jobId?: string;
  status?: string;
  progress?: number;
  audioUrl?: string | null;
  error?: string | { code?: string; message?: string } | null;
  message?: string;
  metadata?: Record<string, any>;
  result?: Record<string, any>;
  job?: JobResponse;
  data?: JobResponse;
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
  title: string;
  vocalMode: VocalMode;
  lyrics: string;
};

type CandidateState = {
  id: CandidateId;
  status: CandidateStatus;
  progress: number;
  stage: string;
  jobId: string;
  audioUrl: string;
  audioFormat: string;
  error: string;
  qualityScore: number | null;
};

const INITIAL_CANDIDATES: CandidateState[] = [
  { id: 'A', status: 'IDLE', progress: 0, stage: 'Pronto', jobId: '', audioUrl: '', audioFormat: 'wav', error: '', qualityScore: null },
  { id: 'B', status: 'IDLE', progress: 0, stage: 'Pronto', jobId: '', audioUrl: '', audioFormat: 'wav', error: '', qualityScore: null }
];

const VARIATION_DIRECTIVES: Record<CandidateId, string> = {
  A: 'SONARA ALTERNATIVE A — Groove-forward interpretation. Preserve every explicit creator instruction and all technical locks, but choose an original rhythmic pocket, melodic contour, instrumental voicing, transitions and energy arc. This version must feel like a complete authored performance, not a generic template.',
  B: 'SONARA ALTERNATIVE B — Deliberately contrasting interpretation. Preserve every explicit creator instruction and all technical locks, but use a different harmonic voicing path, rhythmic accent pattern, register, sound-palette balance, intro concept, section transitions and climax design from a sibling version. Do not reuse a near-identical arrangement or lead motif.'
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function normalizeJob(value: JobResponse): JobResponse {
  return value?.job || value?.data || value;
}

function jobErrorMessage(value: JobResponse, fallback: string): string {
  if (typeof value.error === 'string') return value.error;
  if (value.error && typeof value.error.message === 'string') return value.error.message;
  return value.message || fallback;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Risposta SONARA non valida (HTTP ${response.status}).`);
  }
}

function readAccountPreferences(): Record<string, any> {
  try {
    return JSON.parse(localStorage.getItem('sonara.accountPreferences') || '{}');
  } catch {
    return {};
  }
}

function readGeneratorContext(textarea: HTMLTextAreaElement): GeneratorContext {
  const card = textarea.closest('section');
  if (!card) throw new Error('Creator SONARA non disponibile.');

  const selects = Array.from(card.querySelectorAll('select')) as HTMLSelectElement[];
  const selectValue = (index: number, fallback: string) => selects[index]?.value || fallback;
  const bpmInput = card.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
  const titleInput = Array.from(card.querySelectorAll('input')).find(input => {
    const element = input as HTMLInputElement;
    return element.type !== 'number' && element.type !== 'range';
  }) as HTMLInputElement | undefined;
  const details = card.querySelector('details');
  const vocalButtons = details ? Array.from(details.querySelectorAll('button[aria-pressed]')) as HTMLButtonElement[] : [];
  const activeVocalIndex = Math.max(0, vocalButtons.findIndex(button => button.getAttribute('aria-pressed') === 'true'));
  const vocalMode = (['instrumental', 'male', 'female', 'duet'][activeVocalIndex] || 'instrumental') as VocalMode;
  const lyricsTextarea = details?.querySelector('textarea') as HTMLTextAreaElement | null;

  return {
    rawPrompt: textarea.value.trim(),
    genreFamily: selectValue(0, 'Electronic / Dance'),
    genre: selectValue(1, 'House'),
    subgenre: selectValue(2, selectValue(1, 'House')),
    mood: selectValue(3, 'Authentic'),
    keySignature: selectValue(4, 'A Minor'),
    bpm: Number(bpmInput?.value || 124),
    durationSec: Number(selectValue(5, '30')),
    title: titleInput?.value?.trim() || `Sonara ${selectValue(2, 'Track')}`,
    vocalMode,
    lyrics: vocalMode === 'instrumental' ? '' : String(lyricsTextarea?.value || '').trim()
  };
}

function extensionFromUrl(url: string, fallback: string): string {
  try {
    const pathname = new URL(url, window.location.origin).pathname;
    return pathname.match(/\.([a-zA-Z0-9]{2,5})$/)?.[1]?.toLowerCase() || fallback;
  } catch {
    return fallback;
  }
}

function safeFileName(value: string): string {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9-_ ]+/g, '').trim().replace(/\s+/g, '-') || 'sonara-track';
}

export default function DualTrackGenerationControl() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [candidates, setCandidates] = useState<CandidateState[]>(INITIAL_CANDIDATES);
  const [globalError, setGlobalError] = useState('');
  const [selected, setSelected] = useState<CandidateId | null>(null);

  useEffect(() => {
    let previousButton: HTMLButtonElement | null = null;

    const connect = () => {
      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      const card = textarea?.closest('section');
      if (!textarea || !card) {
        if (previousButton) previousButton.style.display = '';
        previousButton = null;
        setMountNode(null);
        return;
      }

      const originalButton = Array.from(card.querySelectorAll('button')).find(button => {
        const className = String((button as HTMLButtonElement).className || '');
        return className.includes('bg-gradient-to-r') && className.includes('w-full');
      }) as HTMLButtonElement | undefined;

      if (!originalButton) return;
      if (previousButton && previousButton !== originalButton) previousButton.style.display = '';
      previousButton = originalButton;
      originalButton.style.display = 'none';

      let host = card.querySelector('[data-sonara-dual-generator-host]') as HTMLElement | null;
      if (!host) {
        host = document.createElement('div');
        host.setAttribute('data-sonara-dual-generator-host', 'true');
        originalButton.insertAdjacentElement('afterend', host);
      }
      setMountNode(host);
    };

    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (previousButton) previousButton.style.display = '';
    };
  }, []);

  const updateCandidate = (id: CandidateId, patch: Partial<CandidateState>) => {
    setCandidates(previous => previous.map(candidate => candidate.id === id ? { ...candidate, ...patch } : candidate));
  };

  const refreshBilling = async (token: string) => {
    try {
      const response = await fetch('/api/billing/status', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      if (!response.ok) return null;
      const payload = await response.json();
      if (payload?.billing) {
        window.dispatchEvent(new CustomEvent('sonara:billing-updated', { detail: payload.billing }));
        return payload.billing as Record<string, any>;
      }
    } catch {}
    return null;
  };

  const generateCandidate = async (
    id: CandidateId,
    context: GeneratorContext,
    token: string,
    pairId: string,
    preferences: Record<string, any>
  ) => {
    const variantRawPrompt = `${context.rawPrompt}\n\n${VARIATION_DIRECTIVES[id]}`.trim();
    const variantTitle = `${context.title} · Versione ${id}`;
    const finalPrompt = buildGenerationPrompt({
      rawPrompt: variantRawPrompt,
      genreFamily: context.genreFamily,
      genre: context.genre,
      subgenre: context.subgenre,
      mood: context.mood,
      bpm: context.bpm,
      key: context.keySignature,
      durationSec: context.durationSec,
      vocalMode: context.vocalMode,
      lyrics: context.lyrics,
      title: context.title
    });

    updateCandidate(id, { status: 'QUEUED', progress: 5, stage: `Versione ${id}: creazione job...`, error: '', audioUrl: '', jobId: '', qualityScore: null });

    const response = await fetch('/api/billing/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        prompt: finalPrompt,
        rawPrompt: variantRawPrompt,
        genre: context.genre,
        genreFamily: context.genreFamily,
        subgenre: context.subgenre,
        mood: context.mood,
        vocalMode: context.vocalMode,
        lyrics: context.lyrics,
        title: context.title,
        bpm: context.bpm,
        key: context.keySignature,
        durationSec: context.durationSec,
        duration: context.durationSec,
        outputFormat: preferences.outputFormat || 'wav',
        audioQuality: preferences.audioQuality || 'lossless',
        engineId: 'sonara_ace_step_v15_modal',
        generationPairId: pairId,
        variationId: id,
        variationPolicy: 'distinct-independent-candidate',
        useRandomSeed: true
      })
    });

    const responseData = await readJson<JobResponse>(response);
    if (!response.ok) throw new Error(jobErrorMessage(responseData, `Versione ${id}: generazione non avviata (HTTP ${response.status}).`));

    const initial = normalizeJob(responseData);
    const jobId = responseData.jobId || responseData.result?.jobId || initial.jobId;
    if (!jobId) throw new Error(`Versione ${id}: SONARA non ha restituito un job ID.`);

    updateCandidate(id, { status: 'PROCESSING', progress: 10, stage: `Versione ${id}: generazione in corso`, jobId });

    for (let attempt = 0; attempt < 1200; attempt += 1) {
      await sleep(600);
      const poll = await fetch(`/api/music/job/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
      if (!poll.ok) continue;
      const current = normalizeJob(await readJson<JobResponse>(poll));
      const status = String(current.status || 'PROCESSING').toUpperCase();
      const metadata = current.metadata || {};
      const progress = Math.max(0, Math.min(100, Number(current.progress || 0)));
      updateCandidate(id, {
        status: status === 'COMPLETED' ? 'COMPLETED' : status === 'FAILED' ? 'FAILED' : 'PROCESSING',
        progress,
        stage: status === 'COMPLETED' ? `Versione ${id}: pronta` : String(metadata.currentStage || `Versione ${id}: generazione in corso`)
      });

      if (status === 'FAILED') {
        throw new Error(jobErrorMessage(current, String(metadata.error || `Versione ${id}: generazione fallita.`)));
      }

      if (status === 'COMPLETED') {
        const audioUrl = current.audioUrl || metadata.audioUrl || responseData.audioUrl || responseData.result?.audioUrl;
        if (!audioUrl) throw new Error(`Versione ${id}: generazione completata senza file audio.`);
        const audioFormat = String(metadata.audioFormat || extensionFromUrl(String(audioUrl), 'wav')).toLowerCase();
        const score = Number((metadata.outputQualityGate as Record<string, any> | undefined)?.score);

        updateCandidate(id, {
          status: 'COMPLETED',
          progress: 100,
          stage: `Versione ${id}: pronta per ascolto e download`,
          audioUrl: String(audioUrl),
          audioFormat,
          qualityScore: Number.isFinite(score) ? score : null
        });

        try {
          await archiveGeneratedProject({
            jobId,
            title: variantTitle,
            genre: context.genre,
            subgenre: context.subgenre,
            bpm: context.bpm,
            keySignature: context.keySignature,
            durationSec: context.durationSec,
            primaryAudioUrl: String(audioUrl),
            audioFormat,
            response: {
              generationPairId: pairId,
              variationId: id,
              variationPolicy: 'distinct-independent-candidate',
              initialResponse: responseData,
              completedJob: current
            }
          });
        } catch (archiveError) {
          console.error(`SONARA archive ${id} failed:`, archiveError);
        }
        return;
      }
    }

    throw new Error(`Versione ${id}: timeout di generazione.`);
  };

  const generatePair = async () => {
    if (busy) return;
    setGlobalError('');
    setSelected(null);
    setCandidates(INITIAL_CANDIDATES.map(candidate => ({ ...candidate })));

    try {
      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      if (!textarea) throw new Error('Apri il Music Creator prima di generare.');
      const context = readGeneratorContext(textarea);
      if (!context.rawPrompt) throw new Error('Scrivi o crea prima il prompt musicale.');
      if (context.vocalMode !== 'instrumental' && !context.lyrics) throw new Error('Inserisci il testo prima di generare le due versioni vocali.');

      setBusy(true);
      const token = await getFirebaseIdToken(true);
      const billing = await refreshBilling(token);
      if (billing?.limitsEnforced && Number(billing.remainingSeconds || 0) < context.durationSec * 2) {
        throw new Error(`Per generare due brani servono ${context.durationSec * 2} secondi disponibili nel piano.`);
      }

      const pairId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `pair-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const preferences = readAccountPreferences();

      const outcomes = await Promise.allSettled([
        generateCandidate('A', context, token, pairId, preferences),
        generateCandidate('B', context, token, pairId, preferences)
      ]);

      outcomes.forEach((outcome, index) => {
        if (outcome.status === 'rejected') {
          const id = (index === 0 ? 'A' : 'B') as CandidateId;
          const message = outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason);
          updateCandidate(id, { status: 'FAILED', progress: 0, stage: `Versione ${id}: errore`, error: message });
        }
      });
      await refreshBilling(token);

      if (outcomes.every(outcome => outcome.status === 'rejected')) {
        setGlobalError('Nessuna delle due versioni è stata completata. Controlla gli errori mostrati sotto.');
      }
    } catch (error) {
      setGlobalError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const chooseCandidate = (candidate: CandidateState) => {
    if (!candidate.audioUrl) return;
    setSelected(candidate.id);
    const selection = {
      variationId: candidate.id,
      jobId: candidate.jobId,
      audioUrl: candidate.audioUrl,
      audioFormat: candidate.audioFormat,
      selectedAt: new Date().toISOString()
    };
    localStorage.setItem('sonara.selectedGeneratedTrack', JSON.stringify(selection));
    window.dispatchEvent(new CustomEvent('sonara:generated-track-selected', { detail: selection }));
  };

  const downloadCandidate = async (candidate: CandidateState) => {
    if (!candidate.audioUrl) return;
    const contextTextarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
    let title = `sonara-versione-${candidate.id}`;
    try {
      if (contextTextarea) title = `${readGeneratorContext(contextTextarea).title}-Versione-${candidate.id}`;
    } catch {}
    const format = candidate.audioFormat || extensionFromUrl(candidate.audioUrl, 'wav');

    try {
      const response = await fetch(candidate.audioUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${safeFileName(title)}.${format}`.toLowerCase();
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
      <button
        type="button"
        onClick={() => void generatePair()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 px-6 py-4 font-bold text-white shadow-lg shadow-purple-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <><RefreshCw className="h-5 w-5 animate-spin" />SONARA STA GENERANDO 2 BRANI...</> : <><Sparkles className="h-5 w-5" />GENERA 2 BRANI DIVERSI</>}
      </button>

      <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-3 text-[11px] leading-5 text-slate-400">
        SONARA crea due job indipendenti: <strong className="text-purple-200">Versione A</strong> e <strong className="text-purple-200">Versione B</strong>. Mantengono genere, BPM, tonalità, durata e testo, ma usano interpretazioni e seed differenti.
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
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-purple-500/30 bg-purple-500/10 text-sm font-black text-purple-200">{candidate.id}</div>
                    <div>
                      <div className="font-black text-white">Brano {candidate.id}</div>
                      <div className="mt-1 text-[10px] text-slate-500">{candidate.stage}</div>
                    </div>
                  </div>
                  {chosen && <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[9px] font-black text-emerald-300"><CheckCircle2 className="h-3 w-3" />SCELTO</span>}
                </div>

                {(candidate.status === 'QUEUED' || candidate.status === 'PROCESSING') && (
                  <div className="mt-4">
                    <div className="mb-1 flex justify-between text-[10px] text-slate-500"><span>Generazione</span><span>{candidate.progress}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all" style={{ width: `${candidate.progress}%` }} /></div>
                  </div>
                )}

                {candidate.error && <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-[11px] text-rose-300">{candidate.error}</div>}

                {completed && (
                  <div className="mt-4 space-y-3">
                    <audio controls preload="metadata" src={candidate.audioUrl} className="w-full" />
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => chooseCandidate(candidate)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[11px] font-black text-emerald-200 hover:bg-emerald-500/20">
                        <Music2 className="h-4 w-4" />{chosen ? 'BRANO SCELTO' : 'SCEGLI BRANO'}
                      </button>
                      <button type="button" onClick={() => void downloadCandidate(candidate)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2.5 text-[11px] font-black text-purple-200 hover:bg-purple-500/20">
                        <Download className="h-4 w-4" />SCARICA {candidate.audioFormat.toUpperCase()}
                      </button>
                    </div>
                    {candidate.qualityScore != null && <div className="text-center text-[10px] font-semibold text-slate-500">Quality gate: {candidate.qualityScore}</div>}
                  </div>
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
