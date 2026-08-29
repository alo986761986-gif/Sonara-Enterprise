import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gauge, Sparkles } from 'lucide-react';
import { inferProfessionalAutomaticBpm } from '../../musicTempoIntelligence';

type BpmMode = 'manual' | 'auto';
type TempoContext = { family: string; genre: string; subgenre: string; mood: string; prompt: string };
type AutoTempoSelection = { bpm: number; reason: string };

const BPM_MODE_KEY = 'sonara.bpmMode';
const MIN_BPM = 40;
const MAX_BPM = 220;

function clampBpm(value: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value)));
}

function initialMode(): BpmMode {
  try { return window.localStorage.getItem(BPM_MODE_KEY) === 'auto' ? 'auto' : 'manual'; }
  catch { return 'manual'; }
}

function directChild(node: Element | null, section: HTMLElement): HTMLElement | null {
  let current = node instanceof HTMLElement ? node : null;
  while (current && current.parentElement && current.parentElement !== section) current = current.parentElement;
  return current?.parentElement === section ? current : null;
}

function readTempoContext(): TempoContext | null {
  const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
  const section = textarea?.closest('section') as HTMLElement | null;
  if (!textarea || !section) return null;
  const selects = Array.from(section.querySelectorAll('select')) as HTMLSelectElement[];
  const valueAt = (index: number, fallback: string) => selects[index]?.value || fallback;
  return {
    family: valueAt(0, 'Electronic / Dance'),
    genre: valueAt(1, 'House'),
    subgenre: valueAt(2, valueAt(1, 'House')),
    mood: valueAt(3, 'Authentic'),
    prompt: String(textarea.value || '')
  };
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value); else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function markMode(mode: BpmMode, selection?: AutoTempoSelection) {
  const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
  const section = textarea?.closest('section') as HTMLElement | null;
  const bpmInput = section?.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
  if (!section || !bpmInput) return;
  const block = directChild(bpmInput, section);
  section.dataset.sonaraBpmMode = mode;
  bpmInput.dataset.sonaraBpmMode = mode;
  if (block) block.dataset.sonaraBpmMode = mode;
  if (selection) {
    bpmInput.dataset.sonaraAutoBpm = String(selection.bpm);
    bpmInput.dataset.sonaraAutoBpmReason = selection.reason;
  } else {
    delete bpmInput.dataset.sonaraAutoBpm;
    delete bpmInput.dataset.sonaraAutoBpmReason;
  }
}

export default function BpmModeControl() {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<BpmMode>(initialMode);
  const [selection, setSelection] = useState<AutoTempoSelection | null>(null);
  const automaticUpdateRef = useRef(false);
  const debounceRef = useRef<number | null>(null);

  const applyAutomaticTempo = () => {
    const context = readTempoContext();
    if (!context) return;
    const bpmInput = document.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
    if (!bpmInput) return;

    const resolved = inferProfessionalAutomaticBpm(context);
    const next = { bpm: resolved.bpm, reason: resolved.reason };
    setSelection(next);
    markMode('auto', next);

    const current = clampBpm(Number(bpmInput.value || 124));
    if (current !== next.bpm) {
      automaticUpdateRef.current = true;
      setNativeInputValue(bpmInput, String(next.bpm));
      window.setTimeout(() => { automaticUpdateRef.current = false; }, 80);
    }

    window.dispatchEvent(new CustomEvent('sonara:bpm-mode', {
      detail: {
        mode: 'auto',
        bpm: next.bpm,
        reason: next.reason,
        family: resolved.profile.family,
        genre: resolved.profile.genre,
        subgenre: resolved.profile.subgenre,
        minBpm: resolved.profile.minBpm,
        maxBpm: resolved.profile.maxBpm,
        tempoClass: resolved.profile.energy,
        rhythmicDensity: resolved.profile.rhythmicDensity,
        source: resolved.profile.source,
        promptBpmAuthoritative: resolved.profile.source === 'explicit-prompt'
      }
    }));
  };

  useEffect(() => {
    const connect = () => {
      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      const section = textarea?.closest('section') as HTMLElement | null;
      const bpmInput = section?.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
      if (!section || !bpmInput) return setMountNode(null);
      const block = directChild(bpmInput, section);
      if (!block) return setMountNode(null);
      let host = block.querySelector('[data-sonara-bpm-mode-host]') as HTMLElement | null;
      if (!host) {
        host = document.createElement('div');
        host.dataset.sonaraBpmModeHost = 'true';
        block.insertBefore(host, block.firstChild);
      }
      setMountNode(current => current === host ? current : host);
    };
    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try { window.localStorage.setItem(BPM_MODE_KEY, mode); } catch {}
    if (mode === 'auto') {
      window.setTimeout(applyAutomaticTempo, 0);
    } else {
      setSelection(null);
      markMode('manual');
      const bpmInput = document.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
      const bpm = clampBpm(Number(bpmInput?.value || 124));
      window.dispatchEvent(new CustomEvent('sonara:bpm-mode', { detail: { mode: 'manual', bpm } }));
    }
  }, [mode, mountNode]);

  useEffect(() => {
    const schedule = () => {
      if (mode !== 'auto') return;
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(applyAutomaticTempo, 120);
    };
    const handle = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      const section = textarea?.closest('section') as HTMLElement | null;
      const bpmInput = section?.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
      const block = section && bpmInput ? directChild(bpmInput, section) : null;
      if (!section || !block) return;
      const insideModeUi = Boolean(target.closest('[data-sonara-bpm-mode-host]'));
      const manualBpmInteraction = event.isTrusted && block.contains(target) && !insideModeUi && (target instanceof HTMLInputElement || Boolean(target.closest('button')));
      if (mode === 'auto' && manualBpmInteraction && !automaticUpdateRef.current) return setMode('manual');
      if (mode === 'auto' && section.contains(target) && (target.id === 'sonara-prompt' || target instanceof HTMLSelectElement)) schedule();
    };
    document.addEventListener('input', handle, true);
    document.addEventListener('change', handle, true);
    document.addEventListener('click', handle, true);
    return () => {
      document.removeEventListener('input', handle, true);
      document.removeEventListener('change', handle, true);
      document.removeEventListener('click', handle, true);
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, [mode, mountNode]);

  if (!mountNode) return null;

  return createPortal(
    <div className="mb-4 flex flex-col gap-3 rounded-xl border border-cyan-400/20 bg-cyan-400/5 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200">
          {mode === 'auto' ? <Sparkles className="h-3.5 w-3.5" /> : <Gauge className="h-3.5 w-3.5" />}
          BPM · Modalità
        </div>
        <div className="mt-1 text-[11px] leading-5 text-slate-400">
          {mode === 'auto' ? `Automatico SONARA: ${selection?.bpm ?? '—'} BPM · ${selection?.reason || 'analisi tassonomia musicale in corso'}` : 'Manuale: scegli e blocca il BPM esatto con i controlli qui sotto.'}
        </div>
      </div>
      <div className="inline-flex shrink-0 rounded-lg border border-slate-700 bg-slate-950 p-1" role="group" aria-label="Modalità BPM">
        <button type="button" aria-pressed={mode === 'manual'} onClick={() => setMode('manual')} className={`rounded-md px-3 py-1.5 text-[10px] font-black tracking-wider transition ${mode === 'manual' ? 'bg-purple-500/25 text-white' : 'text-slate-500 hover:text-slate-200'}`} title="BPM manuale">MANUALE</button>
        <button type="button" aria-pressed={mode === 'auto'} onClick={() => setMode('auto')} className={`rounded-md px-3 py-1.5 text-[10px] font-black tracking-wider transition ${mode === 'auto' ? 'bg-cyan-400/20 text-cyan-100' : 'text-slate-500 hover:text-slate-200'}`} title="BPM automatico intelligente SONARA">AUTOMATICO</button>
      </div>
    </div>,
    mountNode
  );
}
