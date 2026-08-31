import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Loader2,
  Play,
  Redo2,
  Scissors,
  Sparkles,
  Undo2,
  WandSparkles
} from 'lucide-react';

type SessionOperation = 'replace' | 'inpaint' | 'extend';
type SessionVariation = 'A' | 'B';

type SessionSelection = {
  timelineStart: number;
  timelineEnd: number;
  sourceStart: number;
  sourceEnd: number;
  clipStart: number;
  clipDuration: number;
  sourceOffset: number;
  clipName: string;
};

type SessionCandidate = {
  variation: SessionVariation;
  jobId: string;
  audioUrl: string;
  title: string;
  score: number | null;
  detectedBpm: number | null;
};

type JobOutput = {
  audioUrl?: string;
  label?: string;
  quality?: {
    qualityScore?: number;
    professionalScore?: number;
    detectedBpm?: number;
  } | null;
};

type JobResponse = {
  jobId?: string;
  status?: string;
  progress?: number;
  error?: string;
  outputs?: JobOutput[];
  qualityJudge?: {
    bestScore?: number;
    bestDetectedBpm?: number;
  };
};

interface SonaraSessions2TimelineProps {
  sourceAudioUrl?: string;
  bpm: number;
  keySignature: string;
}

const API = 'https://api.sonaraenterprise.com';
const SOURCE_KEY = 'sonara.studio.sourceAudioUrl';
const POLL_MS = 1800;
const MAX_POLLS = 220;

const sleep = (milliseconds: number) => new Promise<void>(resolve => window.setTimeout(resolve, milliseconds));
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const cleanFileStem = (value: string) => value.replace(/\.[^.]+$/, '').trim().toLowerCase();
const formatTime = (seconds: number) => {
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const wholeSeconds = Math.floor(safe % 60);
  const tenths = Math.floor((safe - Math.floor(safe)) * 10);
  return `${minutes}:${String(wholeSeconds).padStart(2, '0')}.${tenths}`;
};

function parseLeft(element: HTMLElement | null) {
  if (!element) return Number.NaN;
  const value = Number.parseFloat(element.style.left || '');
  return Number.isFinite(value) ? value : Number.NaN;
}

function studioRoot() {
  return document.querySelector<HTMLElement>('[data-sonara-studio-section="true"] .sonara-pro-studio');
}

function exactButton(root: HTMLElement, pattern: RegExp) {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(button => pattern.test((button.textContent || '').trim()));
}

function timelinePixelsPerSecond(root: HTMLElement) {
  const positioned = Array.from(root.querySelectorAll<HTMLElement>('[style*="left"]'));
  const tick0 = positioned.find(element => (element.textContent || '').trim() === '0:00' && Number.isFinite(parseLeft(element)));
  const tick10 = positioned.find(element => (element.textContent || '').trim() === '0:10' && Number.isFinite(parseLeft(element)));
  if (tick0 && tick10) {
    const distance = parseLeft(tick10) - parseLeft(tick0);
    if (distance > 5) return distance / 10;
  }
  return 7;
}

function selectedClipName(button: HTMLButtonElement) {
  const firstText = button.querySelector<HTMLElement>('div > div')?.textContent?.trim();
  if (firstText) return firstText;
  return (button.textContent || 'SONARA Session').trim().split(/\d+:\d{2}/)[0].trim() || 'SONARA Session';
}

function sourceOffsetFromClip(button: HTMLButtonElement) {
  const match = (button.textContent || '').match(/slip\s+([0-9.]+)s/i);
  const value = Number(match?.[1] || 0);
  return Number.isFinite(value) ? value : 0;
}

function playerPlay(candidate: SessionCandidate) {
  window.dispatchEvent(new CustomEvent('sonara:global-player-play-track', {
    detail: {
      id: `studio-session-${candidate.jobId}-${candidate.variation}`,
      audioUrl: candidate.audioUrl,
      audioFormat: candidate.audioUrl.split('?')[0].split('.').pop()?.toLowerCase() || 'wav',
      title: candidate.title,
      variationId: candidate.variation,
      jobId: candidate.jobId,
      source: 'generated',
      toggle: true
    }
  }));
}

export default function SonaraSessions2Timeline({ sourceAudioUrl = '', bpm, keySignature }: SonaraSessions2TimelineProps) {
  const [operation, setOperation] = useState<SessionOperation>('replace');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selection, setSelection] = useState<SessionSelection | null>(null);
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [notice, setNotice] = useState('Trascina direttamente sulla waveform per selezionare la regione da modificare.');
  const [candidates, setCandidates] = useState<SessionCandidate[]>([]);
  const [applying, setApplying] = useState<SessionVariation | null>(null);

  const importedFilesRef = useRef(new Map<string, File>());
  const selectedLocalFileRef = useRef<File | null>(null);
  const activeSourceUrlRef = useRef(sourceAudioUrl);
  const dragRef = useRef<{
    button: HTMLButtonElement;
    startTime: number;
    clipStart: number;
    clipDuration: number;
    sourceOffset: number;
    clipName: string;
  } | null>(null);

  useEffect(() => {
    if (sourceAudioUrl) activeSourceUrlRef.current = sourceAudioUrl;
  }, [sourceAudioUrl]);

  useEffect(() => {
    const onFileChange = (event: Event) => {
      const input = event.target;
      if (!(input instanceof HTMLInputElement) || input.type !== 'file') return;
      const root = studioRoot();
      if (!root || !root.contains(input)) return;
      for (const file of Array.from(input.files || [])) {
        importedFilesRef.current.set(cleanFileStem(file.name), file);
      }
    };
    document.addEventListener('change', onFileChange, true);
    return () => document.removeEventListener('change', onFileChange, true);
  }, []);

  const setStudioPunchRange = async (button: HTMLButtonElement, start: number, end: number) => {
    const root = studioRoot();
    const timeline = button.parentElement as HTMLElement | null;
    if (!root || !timeline) return;
    const pixelsPerSecond = timelinePixelsPerSecond(root);
    const timelineRect = timeline.getBoundingClientRect();
    const clickAt = async (time: number, action: 'in' | 'out') => {
      timeline.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: timelineRect.left + time * pixelsPerSecond,
        clientY: timelineRect.top + Math.min(20, timelineRect.height / 2)
      }));
      await sleep(35);
      const control = exactButton(root, action === 'in' ? /^IN\s+\d/i : /^OUT\s+\d/i);
      control?.click();
      await sleep(35);
    };
    await clickAt(start, 'in');
    await clickAt(end, 'out');
  };

  useEffect(() => {
    if (!selectionMode) return;

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest<HTMLButtonElement>('button[draggable="true"]');
      const root = studioRoot();
      if (!button || !root || !root.contains(button)) return;

      const pixelsPerSecond = timelinePixelsPerSecond(root);
      const clipLeft = Number.parseFloat(button.style.left || '0');
      const clipWidth = Number.parseFloat(button.style.width || '0');
      if (!Number.isFinite(clipLeft) || !Number.isFinite(clipWidth) || pixelsPerSecond <= 0) return;
      const clipStart = Math.max(0, clipLeft / pixelsPerSecond);
      const clipDuration = Math.max(0.5, clipWidth / pixelsPerSecond);
      const rect = button.getBoundingClientRect();
      const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const startTime = clipStart + ratio * clipDuration;
      const clipName = selectedClipName(button);
      const localFile = importedFilesRef.current.get(cleanFileStem(clipName)) || null;
      selectedLocalFileRef.current = localFile;
      button.click();
      dragRef.current = {
        button,
        startTime,
        clipStart,
        clipDuration,
        sourceOffset: sourceOffsetFromClip(button),
        clipName
      };
      setSelection({
        timelineStart: startTime,
        timelineEnd: Math.min(clipStart + clipDuration, startTime + 0.5),
        sourceStart: sourceOffsetFromClip(button) + Math.max(0, startTime - clipStart),
        sourceEnd: sourceOffsetFromClip(button) + Math.max(0.5, startTime - clipStart + 0.5),
        clipStart,
        clipDuration,
        sourceOffset: sourceOffsetFromClip(button),
        clipName
      });
      event.preventDefault();
      event.stopPropagation();
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const rect = drag.button.getBoundingClientRect();
      const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const currentTime = drag.clipStart + ratio * drag.clipDuration;
      let start = Math.min(drag.startTime, currentTime);
      let end = Math.max(drag.startTime, currentTime);
      if (end - start < 0.5) end = Math.min(drag.clipStart + drag.clipDuration, start + 0.5);
      start = clamp(start, drag.clipStart, drag.clipStart + drag.clipDuration);
      end = clamp(end, start + 0.05, drag.clipStart + drag.clipDuration);
      setSelection({
        timelineStart: start,
        timelineEnd: end,
        sourceStart: drag.sourceOffset + (start - drag.clipStart),
        sourceEnd: drag.sourceOffset + (end - drag.clipStart),
        clipStart: drag.clipStart,
        clipDuration: drag.clipDuration,
        sourceOffset: drag.sourceOffset,
        clipName: drag.clipName
      });
      event.preventDefault();
      event.stopPropagation();
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      const rect = drag.button.getBoundingClientRect();
      const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
      const currentTime = drag.clipStart + ratio * drag.clipDuration;
      let start = Math.min(drag.startTime, currentTime);
      let end = Math.max(drag.startTime, currentTime);
      if (end - start < 0.5) end = Math.min(drag.clipStart + drag.clipDuration, start + 0.5);
      start = clamp(start, drag.clipStart, drag.clipStart + drag.clipDuration);
      end = clamp(end, start + 0.05, drag.clipStart + drag.clipDuration);
      const nextSelection: SessionSelection = {
        timelineStart: start,
        timelineEnd: end,
        sourceStart: drag.sourceOffset + (start - drag.clipStart),
        sourceEnd: drag.sourceOffset + (end - drag.clipStart),
        clipStart: drag.clipStart,
        clipDuration: drag.clipDuration,
        sourceOffset: drag.sourceOffset,
        clipName: drag.clipName
      };
      setSelection(nextSelection);
      setSelectionMode(false);
      setCandidates([]);
      setNotice(`Regione selezionata: ${formatTime(start)} → ${formatTime(end)} su ${drag.clipName}.`);
      void setStudioPunchRange(drag.button, start, end);
      event.preventDefault();
      event.stopPropagation();
    };

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointermove', onPointerMove, true);
    document.addEventListener('pointerup', onPointerUp, true);
    document.addEventListener('pointercancel', onPointerUp, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointermove', onPointerMove, true);
      document.removeEventListener('pointerup', onPointerUp, true);
      document.removeEventListener('pointercancel', onPointerUp, true);
      dragRef.current = null;
    };
  }, [selectionMode]);

  const activeSource = () => {
    const stored = window.localStorage.getItem(SOURCE_KEY) || '';
    return activeSourceUrlRef.current || sourceAudioUrl || stored;
  };

  const submitJob = async (variation: SessionVariation) => {
    if (!selection && operation !== 'extend') throw new Error('Seleziona prima una regione della waveform.');
    const source = activeSource();
    const localFile = selectedLocalFileRef.current;
    if (!source && !localFile) throw new Error('Nessun audio sorgente disponibile nello Studio.');

    const endpoint = `${API}/api/studio/${operation}`;
    const selectionStart = selection?.sourceStart ?? 0;
    const selectionEnd = selection?.sourceEnd ?? Math.max(8, selectionStart + 16);
    const durationSec = Math.min(600, Math.max(selection?.sourceOffset ? selection.sourceOffset + (selection?.clipDuration || 60) : selection?.clipDuration || 60, selectionEnd + 2));
    const instruction = [
      `SONARA Sessions 2.0 variation ${variation}.`,
      operation === 'replace' ? 'Replace the selected passage only and preserve every surrounding musical detail.' : '',
      operation === 'inpaint' ? 'Inpaint the selected passage seamlessly with inaudible boundaries.' : '',
      operation === 'extend' ? 'Extend the arrangement naturally while preserving singer, motif, BPM, key and production identity.' : '',
      prompt.trim()
    ].filter(Boolean).join(' ');

    let response: Response;
    if (localFile && !activeSourceUrlRef.current) {
      const form = new FormData();
      form.append('src_audio', localFile, localFile.name || 'sonara-session-source.wav');
      form.append('prompt', instruction);
      form.append('bpm', String(bpm));
      form.append('key', keySignature);
      form.append('start', String(selectionStart));
      form.append('end', String(selectionEnd));
      form.append('durationSec', String(durationSec));
      response = await fetch(endpoint, { method: 'POST', body: form, cache: 'no-store' });
    } else {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceAudioUrl: source,
          prompt: instruction,
          bpm,
          key: keySignature,
          start: selectionStart,
          end: selectionEnd,
          durationSec,
          sonaraSessionsVersion: '2.0',
          sonaraVariation: variation
        }),
        cache: 'no-store'
      });
    }

    const data = await response.json().catch(() => ({})) as JobResponse;
    if (!response.ok || !data.jobId) throw new Error(data.error || `Avvio Session ${variation} non riuscito (HTTP ${response.status}).`);
    return data.jobId;
  };

  const pollJob = async (jobId: string, variation: SessionVariation, index: number) => {
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      const response = await fetch(`${API}/api/studio/job/${encodeURIComponent(jobId)}?session=2.0-${variation}-${attempt}`, {
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache' }
      });
      const data = await response.json().catch(() => ({})) as JobResponse;
      if (!response.ok && data.status !== 'PROCESSING') throw new Error(data.error || `Session ${variation} HTTP ${response.status}.`);
      const localProgress = clamp(Number(data.progress || 0), 0, 100);
      setProgress(current => Math.max(current, Math.round((index * 5 + localProgress) / 2)));
      if (data.status === 'FAILED') throw new Error(data.error || `Session ${variation} non riuscita.`);
      if (data.status === 'COMPLETED') {
        const output = data.outputs?.find(item => item.audioUrl) || data.outputs?.[0];
        if (!output?.audioUrl) throw new Error(`Session ${variation} completata senza audio.`);
        const score = Number(output.quality?.professionalScore ?? output.quality?.qualityScore ?? data.qualityJudge?.bestScore);
        const detectedBpm = Number(output.quality?.detectedBpm ?? data.qualityJudge?.bestDetectedBpm);
        return {
          variation,
          jobId,
          audioUrl: output.audioUrl,
          title: `SONARA Session ${operation.toUpperCase()} ${variation}`,
          score: Number.isFinite(score) ? score : null,
          detectedBpm: Number.isFinite(detectedBpm) ? detectedBpm : null
        } satisfies SessionCandidate;
      }
      await sleep(POLL_MS);
    }
    throw new Error(`Session ${variation}: tempo massimo di elaborazione superato.`);
  };

  const generateAB = async () => {
    if (busy) return;
    if (!selection && operation !== 'extend') {
      setNotice('Attiva SELEZIONA REGIONE e trascina sulla waveform prima di generare.');
      return;
    }
    setBusy(true);
    setProgress(1);
    setCandidates([]);
    setNotice(`Sessions 2.0: creo due versioni ${operation.toUpperCase()} A/B…`);
    try {
      const [jobA, jobB] = await Promise.all([submitJob('A'), submitJob('B')]);
      setProgress(8);
      setNotice('A/B avviate. SONARA sta mantenendo BPM, tonalità, identità e continuità fuori dalla regione.');
      const [candidateA, candidateB] = await Promise.all([
        pollJob(jobA, 'A', 0),
        pollJob(jobB, 'B', 1)
      ]);
      setCandidates([candidateA, candidateB]);
      setProgress(100);
      const scores = [candidateA, candidateB].filter(candidate => candidate.score !== null).sort((a, b) => Number(b.score) - Number(a.score));
      setNotice(scores[0]?.score !== null && scores[0] ? `A/B pronte. Quality ranking: ${scores[0].variation} migliore con ${scores[0].score}/100.` : 'A/B pronte. Ascolta entrambe nel player fisso e scegli quale applicare.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const applyCandidate = async (candidate: SessionCandidate) => {
    if (applying) return;
    const root = studioRoot();
    if (!root) {
      setNotice('Timeline Studio non disponibile.');
      return;
    }
    const audioInput = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="file"]'))[0];
    if (!audioInput) {
      setNotice('Import audio della timeline non disponibile.');
      return;
    }

    setApplying(candidate.variation);
    setNotice(`Applico la versione ${candidate.variation} come nuova take non distruttiva nella timeline…`);
    try {
      const response = await fetch(candidate.audioUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Audio Session ${candidate.variation} non leggibile (HTTP ${response.status}).`);
      const blob = await response.blob();
      const extension = /mpeg|mp3/i.test(blob.type) ? 'mp3' : /flac/i.test(blob.type) ? 'flac' : /ogg/i.test(blob.type) ? 'ogg' : 'wav';
      const file = new File([blob], `SONARA-Session-${operation}-${candidate.variation}.${extension}`, { type: blob.type || 'audio/wav' });
      importedFilesRef.current.set(cleanFileStem(file.name), file);
      const soloBefore = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).filter(button => (button.textContent || '').trim() === 'S').length;
      const transfer = new DataTransfer();
      transfer.items.add(file);
      audioInput.files = transfer.files;
      audioInput.dispatchEvent(new Event('change', { bubbles: true }));
      activeSourceUrlRef.current = candidate.audioUrl;
      selectedLocalFileRef.current = null;
      window.localStorage.setItem(SOURCE_KEY, candidate.audioUrl);

      for (let attempt = 0; attempt < 50; attempt += 1) {
        await sleep(60);
        const soloButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('button')).filter(button => (button.textContent || '').trim() === 'S');
        if (soloButtons.length > soloBefore) {
          soloButtons.at(-1)?.click();
          break;
        }
      }
      setNotice(`Versione ${candidate.variation} applicata come nuova take/track e messa in SOLO. UNDO torna allo stato precedente; REDO la ripristina.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setApplying(null);
    }
  };

  const clickUndoRedo = (kind: 'undo' | 'redo') => {
    const root = studioRoot();
    if (!root) return;
    const button = root.querySelector<HTMLButtonElement>(`button[title="${kind === 'undo' ? 'Undo' : 'Redo'}"]`);
    button?.click();
    setNotice(kind === 'undo' ? 'Undo eseguito sulla sessione Studio.' : 'Redo eseguito sulla sessione Studio.');
  };

  const bestVariation = useMemo(() => {
    const scored = candidates.filter(candidate => candidate.score !== null).sort((a, b) => Number(b.score) - Number(a.score));
    return scored[0]?.variation || null;
  }, [candidates]);

  return (
    <section className="sticky top-[104px] z-[55] border-b border-white/[0.07] bg-[#080b12]/95 px-3 py-2.5 backdrop-blur-2xl sm:px-5" data-sonara-sessions-timeline="2.0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-1 flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.18em] text-violet-300">
          <Sparkles className="h-3.5 w-3.5" /> Sessions 2.0
        </div>

        {(['replace', 'inpaint', 'extend'] as SessionOperation[]).map(value => (
          <button
            key={value}
            type="button"
            onClick={() => { setOperation(value); setCandidates([]); }}
            className={`rounded-lg border px-2.5 py-1.5 text-[8px] font-black uppercase tracking-wider ${operation === value ? 'border-violet-400/35 bg-violet-400/[0.12] text-violet-100' : 'border-white/[0.07] bg-white/[0.025] text-slate-500 hover:text-white'}`}
          >
            {value}
          </button>
        ))}

        <button
          type="button"
          onClick={() => { setSelectionMode(value => !value); setCandidates([]); }}
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[8px] font-black ${selectionMode ? 'border-cyan-400/45 bg-cyan-400/[0.12] text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,.12)]' : 'border-cyan-400/20 bg-cyan-400/[0.05] text-cyan-300'}`}
        >
          <Scissors className="h-3.5 w-3.5" /> {selectionMode ? 'TRASCINA SULLA WAVEFORM' : 'SELEZIONA REGIONE'}
        </button>

        <div className="min-w-[150px] rounded-lg border border-white/[0.07] bg-black/20 px-2.5 py-1.5 font-mono text-[8px] text-slate-400">
          {selection ? `${formatTime(selection.timelineStart)} → ${formatTime(selection.timelineEnd)}` : operation === 'extend' ? 'EXTEND DAL SOURCE' : 'NESSUNA REGIONE'}
        </div>

        <input
          value={prompt}
          onChange={event => setPrompt(event.target.value)}
          placeholder="Istruzione opzionale: cosa deve cambiare nella regione…"
          className="min-w-[220px] flex-1 rounded-lg border border-white/[0.08] bg-black/25 px-3 py-2 text-[9px] text-white outline-none placeholder:text-slate-700 focus:border-violet-400/40"
        />

        <button
          type="button"
          onClick={() => void generateAB()}
          disabled={busy || (!selection && operation !== 'extend')}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 px-3 py-2 text-[9px] font-black text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <WandSparkles className="h-3.5 w-3.5" />}
          GENERA A/B
        </button>

        <button type="button" onClick={() => clickUndoRedo('undo')} className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-2 text-slate-400 hover:text-white" title="Sessions Undo"><Undo2 className="h-3.5 w-3.5" /></button>
        <button type="button" onClick={() => clickUndoRedo('redo')} className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-2 text-slate-400 hover:text-white" title="Sessions Redo"><Redo2 className="h-3.5 w-3.5" /></button>
      </div>

      {(busy || candidates.length > 0) && (
        <div className="mt-2 grid gap-2 lg:grid-cols-[180px_1fr_1fr]">
          <div className="rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
            <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-wider text-slate-600"><span>Session progress</span><span>{progress}%</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.05]"><div className="h-full rounded-full bg-violet-400 transition-all" style={{ width: `${progress}%` }} /></div>
          </div>

          {(['A', 'B'] as SessionVariation[]).map(variation => {
            const candidate = candidates.find(item => item.variation === variation);
            return (
              <div key={variation} className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 ${candidate && bestVariation === variation ? 'border-emerald-400/25 bg-emerald-400/[0.05]' : 'border-white/[0.06] bg-black/20'}`}>
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-white/[0.05] text-[10px] font-black text-white">{variation}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[8px] font-black text-slate-300">{candidate ? candidate.title : busy ? `GENERAZIONE ${variation}…` : `SESSION ${variation}`}</div>
                  <div className="mt-0.5 text-[7px] text-slate-600">{candidate ? `${candidate.score !== null ? `Quality ${candidate.score}/100` : 'Quality n/d'}${candidate.detectedBpm !== null ? ` · ${candidate.detectedBpm} BPM` : ''}${bestVariation === variation ? ' · BEST' : ''}` : 'in attesa'}</div>
                </div>
                <button type="button" disabled={!candidate} onClick={() => candidate && playerPlay(candidate)} className="rounded-md border border-white/[0.08] bg-white/[0.03] p-1.5 text-slate-300 disabled:opacity-30" title={`Ascolta ${variation} nel player fisso`}><Play className="h-3 w-3 fill-current" /></button>
                <button type="button" disabled={!candidate || applying !== null} onClick={() => candidate && void applyCandidate(candidate)} className="flex items-center gap-1 rounded-md border border-violet-400/25 bg-violet-400/[0.08] px-2 py-1.5 text-[7px] font-black text-violet-200 disabled:opacity-30">{applying === variation ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} APPLICA</button>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-1.5 text-[8px] leading-4 text-slate-600">{notice}</div>
    </section>
  );
}
