import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Gauge, Sparkles } from 'lucide-react';

type BpmMode = 'manual' | 'auto';

type TempoContext = {
  family: string;
  genre: string;
  subgenre: string;
  mood: string;
  prompt: string;
};

type AutoTempoSelection = {
  bpm: number;
  reason: string;
};

const BPM_MODE_KEY = 'sonara.bpmMode';
const MIN_BPM = 40;
const MAX_BPM = 220;

const TEMPO_RULES: Array<{ pattern: RegExp; bpm: number; label: string }> = [
  { pattern: /liquid drum|drum\s*(?:&|and)\s*bass|\bdnb\b|jungle/i, bpm: 174, label: 'Drum & Bass / Jungle' },
  { pattern: /black metal/i, bpm: 170, label: 'Black Metal' },
  { pattern: /bebop/i, bpm: 180, label: 'Bebop' },
  { pattern: /bluegrass/i, bpm: 150, label: 'Bluegrass' },
  { pattern: /uk drill|\bdrill\b/i, bpm: 142, label: 'Drill' },
  { pattern: /goa trance|psy(?:chedelic)?\s*trance|psytrance/i, bpm: 142, label: 'Psy / Goa Trance' },
  { pattern: /\btrance\b/i, bpm: 138, label: 'Trance' },
  { pattern: /uk dubstep|\bdubstep\b/i, bpm: 140, label: 'Dubstep' },
  { pattern: /detroit techno/i, bpm: 132, label: 'Detroit Techno' },
  { pattern: /dub techno/i, bpm: 124, label: 'Dub Techno' },
  { pattern: /\btechno\b/i, bpm: 132, label: 'Techno' },
  { pattern: /tech house/i, bpm: 126, label: 'Tech House' },
  { pattern: /deep house/i, bpm: 122, label: 'Deep House' },
  { pattern: /progressive house/i, bpm: 126, label: 'Progressive House' },
  { pattern: /afro house/i, bpm: 123, label: 'Afro House' },
  { pattern: /acid house/i, bpm: 128, label: 'Acid House' },
  { pattern: /\bhouse\b/i, bpm: 124, label: 'House' },
  { pattern: /amapiano/i, bpm: 112, label: 'Amapiano' },
  { pattern: /boom bap/i, bpm: 92, label: 'Boom Bap' },
  { pattern: /lo[- ]?fi hip[- ]?hop/i, bpm: 82, label: 'Lo-Fi Hip-Hop' },
  { pattern: /g[- ]?funk/i, bpm: 96, label: 'G-Funk' },
  { pattern: /\btrap\b/i, bpm: 140, label: 'Trap' },
  { pattern: /hip[- ]?hop|\brap\b/i, bpm: 94, label: 'Hip-Hop / Rap' },
  { pattern: /neo soul/i, bpm: 86, label: 'Neo Soul' },
  { pattern: /r\s*&\s*b|rhythm and blues/i, bpm: 88, label: 'R&B' },
  { pattern: /ambient/i, bpm: 72, label: 'Ambient' },
  { pattern: /downtempo/i, bpm: 88, label: 'Downtempo' },
  { pattern: /roots reggae|\breggae\b/i, bpm: 76, label: 'Reggae' },
  { pattern: /afrobeats/i, bpm: 105, label: 'Afrobeats' },
  { pattern: /afrobeat/i, bpm: 112, label: 'Afrobeat' },
  { pattern: /highlife/i, bpm: 116, label: 'Highlife' },
  { pattern: /bossa nova/i, bpm: 126, label: 'Bossa Nova' },
  { pattern: /samba/i, bpm: 100, label: 'Samba' },
  { pattern: /tango/i, bpm: 124, label: 'Tango' },
  { pattern: /flamenco/i, bpm: 120, label: 'Flamenco' },
  { pattern: /doom metal/i, bpm: 72, label: 'Doom Metal' },
  { pattern: /\bmetal\b/i, bpm: 140, label: 'Metal' },
  { pattern: /post[- ]?rock/i, bpm: 96, label: 'Post-Rock' },
  { pattern: /\brock\b/i, bpm: 120, label: 'Rock' },
  { pattern: /jazz fusion/i, bpm: 126, label: 'Jazz Fusion' },
  { pattern: /\bjazz\b/i, bpm: 120, label: 'Jazz' },
  { pattern: /k[- ]?pop/i, bpm: 122, label: 'K-Pop' },
  { pattern: /dream pop/i, bpm: 108, label: 'Dream Pop' },
  { pattern: /\bpop\b/i, bpm: 116, label: 'Pop' }
];

function clampBpm(value: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(value)));
}

function normalize(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function initialMode(): BpmMode {
  try {
    return window.localStorage.getItem(BPM_MODE_KEY) === 'auto' ? 'auto' : 'manual';
  } catch {
    return 'manual';
  }
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

function inferAutomaticBpm(context: TempoContext): AutoTempoSelection {
  const taxonomy = `${context.family} ${context.genre} ${context.subgenre}`;
  const normalizedTaxonomy = normalize(taxonomy);
  const match = TEMPO_RULES.find(rule => rule.pattern.test(normalizedTaxonomy));
  let bpm = match?.bpm ?? 120;

  const expression = normalize(`${context.mood} ${context.prompt}`);
  const verySlow = /\b(very slow|molto lento|lentissimo|adagio|largo)\b/.test(expression);
  const slow = /\b(slow|lento|relaxed|rilassato|laid[- ]?back|meditative|meditativo|intimate|intimo)\b/.test(expression);
  const veryFast = /\b(very fast|molto veloce|velocissimo|relentless|furious|frenetic|frenetico)\b/.test(expression);
  const fast = /\b(fast|veloce|uptempo|up[- ]tempo|driving|energetic|energico|peak[- ]?time|aggressive|aggressivo)\b/.test(expression);

  if (verySlow) bpm -= 12;
  else if (slow) bpm -= 6;

  if (veryFast) bpm += 12;
  else if (fast) bpm += 6;

  bpm = clampBpm(bpm);
  return {
    bpm,
    reason: `${match?.label || context.subgenre || context.genre} · ${context.mood || 'Auto'}`
  };
}

function setNativeInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
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

    const next = inferAutomaticBpm(context);
    setSelection(next);
    markMode('auto', next);

    const current = clampBpm(Number(bpmInput.value || 124));
    if (current !== next.bpm) {
      automaticUpdateRef.current = true;
      setNativeInputValue(bpmInput, String(next.bpm));
      window.setTimeout(() => {
        automaticUpdateRef.current = false;
      }, 40);
    }

    window.dispatchEvent(new CustomEvent('sonara:bpm-mode', {
      detail: { mode: 'auto', bpm: next.bpm, reason: next.reason }
    }));
  };

  useEffect(() => {
    const connect = () => {
      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      const section = textarea?.closest('section') as HTMLElement | null;
      const bpmInput = section?.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
      if (!section || !bpmInput) {
        setMountNode(null);
        return;
      }

      const block = directChild(bpmInput, section);
      if (!block) {
        setMountNode(null);
        return;
      }

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
    try {
      window.localStorage.setItem(BPM_MODE_KEY, mode);
    } catch {
      // Local persistence is optional.
    }

    if (mode === 'auto') {
      window.setTimeout(applyAutomaticTempo, 0);
    } else {
      setSelection(null);
      markMode('manual');
      const bpmInput = document.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
      window.dispatchEvent(new CustomEvent('sonara:bpm-mode', {
        detail: { mode: 'manual', bpm: clampBpm(Number(bpmInput?.value || 124)) }
      }));
    }
  }, [mode, mountNode]);

  useEffect(() => {
    const scheduleAutomaticTempo = () => {
      if (mode !== 'auto') return;
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(applyAutomaticTempo, 120);
    };

    const handleInteraction = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const textarea = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      const section = textarea?.closest('section') as HTMLElement | null;
      const bpmInput = section?.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
      const block = section && bpmInput ? directChild(bpmInput, section) : null;
      if (!section || !block) return;

      const insideModeUi = Boolean(target.closest('[data-sonara-bpm-mode-host]'));
      const manualBpmInteraction = block.contains(target) && !insideModeUi && (
        target instanceof HTMLInputElement || Boolean(target.closest('button'))
      );

      if (mode === 'auto' && manualBpmInteraction && !automaticUpdateRef.current) {
        setMode('manual');
        return;
      }

      if (mode === 'auto' && section.contains(target)) {
        if (target.id === 'sonara-prompt' || target instanceof HTMLSelectElement) {
          scheduleAutomaticTempo();
        }
      }
    };

    document.addEventListener('input', handleInteraction, true);
    document.addEventListener('change', handleInteraction, true);
    document.addEventListener('click', handleInteraction, true);
    return () => {
      document.removeEventListener('input', handleInteraction, true);
      document.removeEventListener('change', handleInteraction, true);
      document.removeEventListener('click', handleInteraction, true);
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
          {mode === 'auto'
            ? `Automatico SONARA: ${selection?.bpm ?? '—'} BPM · ${selection?.reason || 'analisi musicale in corso'}`
            : 'Manuale: scegli e blocca il BPM esatto con i controlli qui sotto.'}
        </div>
      </div>
      <div className="inline-flex shrink-0 rounded-lg border border-slate-700 bg-slate-950 p-1" role="group" aria-label="Modalità BPM">
        <button
          type="button"
          aria-pressed={mode === 'manual'}
          onClick={() => setMode('manual')}
          className={`rounded-md px-3 py-1.5 text-[10px] font-black tracking-wider transition ${mode === 'manual' ? 'bg-purple-500/25 text-white' : 'text-slate-500 hover:text-slate-200'}`}
          title="BPM manuale"
        >
          MANUALE
        </button>
        <button
          type="button"
          aria-pressed={mode === 'auto'}
          onClick={() => setMode('auto')}
          className={`rounded-md px-3 py-1.5 text-[10px] font-black tracking-wider transition ${mode === 'auto' ? 'bg-cyan-400/20 text-cyan-100' : 'text-slate-500 hover:text-slate-200'}`}
          title="BPM automatico intelligente SONARA"
        >
          AUTOMATICO
        </button>
      </div>
    </div>,
    mountNode
  );
}
