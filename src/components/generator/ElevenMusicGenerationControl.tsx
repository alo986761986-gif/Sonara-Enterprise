import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Download, Music2, RefreshCw, Sparkles } from 'lucide-react';
import { buildGenerationPrompt, type VocalMode } from '../../generationPrompt';
import { getFirebaseIdToken } from '../../lib/firebaseClient';
import { archiveGeneratedProject } from '../../services/generatedAssetVault';

type CandidateId = 'A' | 'B';
type CandidateState = {
  id: CandidateId;
  status: 'IDLE' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  progress: number;
  stage: string;
  audioUrl: string;
  audioFormat: string;
  jobId: string;
  error: string;
};

type Context = {
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
  vocalLanguageCode: string;
  vocalLanguageName: string;
  lyrics: string;
};

type JobResponse = {
  jobId?: string;
  status?: string;
  progress?: number;
  audioUrl?: string | null;
  audioUrls?: string[];
  candidates?: Array<{ id?: string; audioUrl?: string; audioFormat?: string }>;
  error?: string | { message?: string } | null;
  message?: string;
  metadata?: Record<string, any>;
  job?: JobResponse;
  data?: JobResponse;
  result?: JobResponse;
};

const empty = (id: CandidateId): CandidateState => ({
  id,
  status: 'IDLE',
  progress: 0,
  stage: 'Pronto',
  audioUrl: '',
  audioFormat: 'mp3',
  jobId: '',
  error: ''
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function normalize(value: JobResponse): JobResponse {
  return value?.job || value?.data || value;
}

function errorText(value: JobResponse, fallback: string) {
  if (typeof value.error === 'string') return value.error;
  if (value.error && typeof value.error.message === 'string') return value.error.message;
  return value.message || fallback;
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text) return {} as T;
  try { return JSON.parse(text) as T; }
  catch { throw new Error(`Risposta SONARA non valida (HTTP ${response.status}).`); }
}

function readContext(textarea: HTMLTextAreaElement): Context {
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
  const activeVocalButton = details?.querySelector('button[data-sonara-vocal-mode][aria-pressed="true"]') as HTMLButtonElement | null;
  const rawVocalMode = String(activeVocalButton?.dataset.sonaraVocalMode || 'instrumental');
  const vocalMode = (['instrumental', 'male', 'female', 'duet'].includes(rawVocalMode) ? rawVocalMode : 'instrumental') as VocalMode;
  const lyricsTextarea = details?.querySelector('textarea') as HTMLTextAreaElement | null;
  const vocalLanguageSelect = details?.querySelector('#sonara-vocal-language') as HTMLSelectElement | null;
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
    vocalLanguageCode: vocalLanguageSelect?.value || 'en',
    vocalLanguageName: vocalLanguageSelect?.selectedOptions?.[0]?.textContent?.split(' — ').pop()?.trim() || 'English',
    lyrics: vocalMode === 'instrumental' ? '' : String(lyricsTextarea?.value || '').trim()
  };
}

function candidatesFrom(value: JobResponse) {
  if (Array.isArray(value.candidates) && value.candidates.length) return value.candidates.slice(0, 2);
  const urls = value.audioUrls || (value.audioUrl ? [value.audioUrl] : []);
  return urls.slice(0, 2).map((audioUrl, index) => ({ id: index === 0 ? 'A' : 'B', audioUrl, audioFormat: 'mp3' }));
}

function safeFileName(value: string) {
  return value.normalize('NFKD').replace(/[^a-zA-Z0-9-_ ]+/g, '').trim().replace(/\s+/g, '-') || 'sonara-track';
}

export default function ElevenMusicGenerationControl() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<CandidateId | null>(null);
  const [error, setError] = useState('');
  const [candidates, setCandidates] = useState<CandidateState[]>([empty('A'), empty('B')]);

  useEffect(() => {
    let original: HTMLButtonElement | null = null;
    const connect = () => {
      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      const card = textarea?.closest('section');
      if (!textarea || !card) return;
      const button = Array.from(card.querySelectorAll('button')).find(candidate => {
        const cls = String((candidate as HTMLButtonElement).className || '');
        return cls.includes('bg-gradient-to-r') && cls.includes('w-full');
      }) as HTMLButtonElement | undefined;
      if (!button) return;
      original = button;
      button.style.display = 'none';
      let host = card.querySelector('[data-sonara-eleven-generator-host]') as HTMLElement | null;
      if (!host) {
        host = document.createElement('div');
        host.dataset.sonaraElevenGeneratorHost = 'true';
        button.insertAdjacentElement('afterend', host);
      }
      setMountNode(host);
    };
    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (original) original.style.display = '';
    };
  }, []);

  const processing = (jobId: string, progress: number, stage: string) => {
    setCandidates(previous => previous.map(item => item.audioUrl ? item : ({ ...item, status: 'PROCESSING', progress, stage, jobId })));
  };

  const applyCompleted = async (jobId: string, response: JobResponse, context: Context, generationId: string, token: string) => {
    const outputs = candidatesFrom(response);
    if (outputs.length < 2 || !outputs[0]?.audioUrl || !outputs[1]?.audioUrl) {
      throw new Error('SONARA Eleven Music ha completato la generazione ma non ha restituito entrambi i brani.');
    }
    const completed = outputs.slice(0, 2).map((output, index) => ({
      id: (index === 0 ? 'A' : 'B') as CandidateId,
      status: 'COMPLETED' as const,
      progress: 100,
      stage: `Brano ${index === 0 ? 'A' : 'B'} Eleven Music v2 pronto`,
      audioUrl: String(output.audioUrl),
      audioFormat: String(output.audioFormat || 'mp3').toLowerCase(),
      jobId,
      error: ''
    }));
    setCandidates(completed);
    await Promise.allSettled(completed.map(candidate => archiveGeneratedProject({
      jobId: `${jobId}-${candidate.id}`,
      title: context.title,
      genre: context.genre,
      subgenre: context.subgenre,
      bpm: context.bpm,
      keySignature: context.keySignature,
      durationSec: context.durationSec,
      primaryAudioUrl: candidate.audioUrl,
      audioFormat: candidate.audioFormat,
      response: {
        generationPairId: generationId,
        variationId: candidate.id,
        completedJob: response,
        performanceProfile: 'eleven-music-v2',
        creativeControls: { weirdness: context.weirdness, styleInfluence: context.styleInfluence }
      }
    })));
    try {
      const billing = await fetch('/api/billing/status', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (billing.ok) {
        const payload = await billing.json();
        if (payload?.billing) window.dispatchEvent(new CustomEvent('sonara:billing-updated', { detail: payload.billing }));
      }
    } catch {}
  };

  const generate = async () => {
    if (busy) return;
    setBusy(true);
    setSelected(null);
    setError('');
    setCandidates([empty('A'), empty('B')]);
    try {
      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      if (!textarea) throw new Error('Apri il Music Creator prima di generare.');
      const context = readContext(textarea);
      if (!context.rawPrompt) throw new Error('Scrivi o crea prima il prompt musicale.');
      if (context.vocalMode !== 'instrumental' && !context.lyrics) throw new Error('Inserisci il testo prima della generazione vocale.');

      const finalPrompt = buildGenerationPrompt({
        rawPrompt: context.rawPrompt,
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
        vocalLanguage: context.vocalLanguageName,
        lyrics: context.lyrics,
        title: context.title
      });

      const token = await getFirebaseIdToken(true);
      const generationId = crypto.randomUUID ? crypto.randomUUID() : `generation-${Date.now()}`;
      processing('', 8, 'Eleven Music v2: generazione dei 2 brani in parallelo');

      const response = await fetch('/api/billing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          prompt: finalPrompt,
          rawPrompt: context.rawPrompt,
          creatorPrompt: context.rawPrompt,
          sonaraCreatorPromptAuthoritative: context.rawPrompt,
          sonaraOriginalCreatorBrief: context.rawPrompt,
          genreFamily: context.genreFamily,
          genre: context.genre,
          subgenre: context.subgenre,
          mood: context.mood,
          vocalMode: context.vocalMode,
          vocalLanguage: context.vocalLanguageCode,
          lyricsLanguage: context.vocalLanguageCode,
          language: context.vocalLanguageCode,
          lyrics: context.lyrics,
          title: context.title,
          bpm: context.bpm,
          requestedBpm: context.bpm,
          key: context.keySignature,
          durationSec: context.durationSec,
          duration: context.durationSec,
          weirdness: context.weirdness,
          styleInfluence: context.styleInfluence,
          provider: 'eleven_music',
          engineProvider: 'eleven_music',
          engineId: 'sonara_eleven_music_v2',
          candidateCount: 2,
          candidate_count: 2,
          generationPairId: generationId
        })
      });
      const payload = normalize(await readJson<JobResponse>(response));
      if (!response.ok) throw new Error(errorText(payload, `Eleven Music non avviato (HTTP ${response.status}).`));
      const jobId = String(payload.jobId || '');
      if (!jobId) throw new Error('SONARA non ha restituito il job ID Eleven Music.');

      if (String(payload.status || '').toUpperCase() === 'COMPLETED') {
        await applyCompleted(jobId, payload, context, generationId, token);
        return;
      }

      processing(jobId, Math.max(10, Number(payload.progress || 10)), String(payload.metadata?.currentStage || 'Eleven Music v2: rendering'));
      const deadline = Date.now() + Math.max(10 * 60_000, context.durationSec * 5000);
      while (Date.now() < deadline) {
        await sleep(2000);
        const poll = await fetch(`/api/music/job/${encodeURIComponent(jobId)}`, { cache: 'no-store' });
        if (!poll.ok) continue;
        const current = normalize(await readJson<JobResponse>(poll));
        const status = String(current.status || 'PROCESSING').toUpperCase();
        if (status === 'FAILED') throw new Error(errorText(current, 'Generazione Eleven Music fallita.'));
        if (status === 'COMPLETED') {
          await applyCompleted(jobId, current, context, generationId, token);
          return;
        }
        processing(jobId, Math.max(10, Number(current.progress || 10)), String(current.metadata?.currentStage || 'Eleven Music v2: rendering'));
      }
      throw new Error('Eleven Music sta impiegando più del previsto.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      setCandidates(previous => previous.map(item => item.audioUrl ? item : ({ ...item, status: 'FAILED', progress: 0, stage: 'Errore', error: message })));
    } finally {
      setBusy(false);
    }
  };

  const choose = (candidate: CandidateState) => {
    if (!candidate.audioUrl) return;
    setSelected(candidate.id);
    const detail = { variationId: candidate.id, jobId: candidate.jobId, audioUrl: candidate.audioUrl, audioFormat: candidate.audioFormat, selectedAt: new Date().toISOString() };
    localStorage.setItem('sonara.selectedGeneratedTrack', JSON.stringify(detail));
    window.dispatchEvent(new CustomEvent('sonara:generated-track-selected', { detail }));
  };

  const download = async (candidate: CandidateState) => {
    if (!candidate.audioUrl) return;
    const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
    let title = 'sonara-track';
    try { if (textarea) title = readContext(textarea).title; } catch {}
    try {
      const response = await fetch(candidate.audioUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${safeFileName(title)}-${candidate.id}.${candidate.audioFormat || 'mp3'}`.toLowerCase();
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
    } catch {
      window.open(candidate.audioUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (!mountNode) return null;
  return createPortal(
    <div className="mt-6 space-y-4">
      <button type="button" onClick={() => void generate()} disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-fuchsia-600 via-purple-600 to-indigo-600 px-6 py-4 font-bold text-white shadow-lg shadow-purple-950/30 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50">
        {busy ? <><RefreshCw className="h-5 w-5 animate-spin" />ELEVEN MUSIC STA GENERANDO...</> : <><Sparkles className="h-5 w-5" />GENERA 2 BRANI</>}
      </button>
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-3 text-[11px] leading-5 text-slate-400">
        Motore <strong className="text-cyan-200">Eleven Music v2</strong>: due variazioni generate in parallelo usando prompt, durata, genere, BPM, voce, lingua e testo del Creator SONARA.
      </div>
      {error && <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4 text-xs text-rose-300">{error}</div>}
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
                {candidate.status === 'PROCESSING' && <div className="mt-4"><div className="mb-1 flex justify-between text-[10px] text-slate-500"><span>Generazione</span><span>{candidate.progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-900"><div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all" style={{ width: `${candidate.progress}%` }} /></div></div>}
                {candidate.error && <div className="mt-4 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-[11px] text-rose-300">{candidate.error}</div>}
                {completed && <div className="mt-4 space-y-3"><audio controls preload="metadata" src={candidate.audioUrl} className="w-full" /><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => choose(candidate)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2.5 text-[11px] font-black text-emerald-200"><Music2 className="h-4 w-4" />{chosen ? 'BRANO SCELTO' : 'SCEGLI BRANO'}</button><button type="button" onClick={() => void download(candidate)} className="inline-flex items-center justify-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-3 py-2.5 text-[11px] font-black text-purple-200"><Download className="h-4 w-4" />SCARICA {candidate.audioFormat.toUpperCase()}</button></div></div>}
              </article>
            );
          })}
        </div>
      )}
    </div>,
    mountNode
  );
}
