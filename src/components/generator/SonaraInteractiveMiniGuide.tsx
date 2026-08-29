import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type GuideStep = {
  id: string;
  title: string;
  text: string;
  selector?: string;
};

type Position = { left: number; top: number };

const STORAGE_KEY = 'sonara-create-mini-guide-v1-complete';

const STEPS: GuideStep[] = [
  {
    id: 'prompt',
    title: '1. Descrivi il brano',
    text: 'Scrivi qui cosa vuoi creare: genere, atmosfera, strumenti, voce e anche il BPM. Più sei preciso, più SONARA seguirà la tua idea.',
    selector: '#sonara-prompt'
  },
  {
    id: 'style',
    title: '2. Scegli stile e strumenti',
    text: 'Usa Styles e Universo Musica & Strumenti per aggiungere generi, sottogeneri, timbri e strumenti al tuo prompt.',
    selector: '.sonara-global-suggestions-toggle, #sonara-world-suggestions-edge .swe-toggle, [data-sonara-suno-prompt="true"]'
  },
  {
    id: 'bpm',
    title: '3. Imposta il BPM',
    text: 'Puoi lasciare il BPM in automatico oppure scegliere Manuale. Se scrivi un BPM preciso nel prompt, quel valore ha priorità.',
    selector: '[data-sonara-creator-block="bpm"], input[aria-label="BPM preferiti"]'
  },
  {
    id: 'voice',
    title: '4. Voce e testo',
    text: 'Scegli se il brano sarà strumentale o cantato. Se usi una voce, puoi scrivere il testo oppure generarlo con gli strumenti intelligenti.',
    selector: '#sonara-lyrics, button[data-sonara-vocal-mode]'
  },
  {
    id: 'create',
    title: '5. Crea la musica',
    text: 'Quando tutto è pronto, premi Create. SONARA userà insieme prompt, stile, BPM, voce, durata e testo per generare il brano.'
  }
];

function findSection(): HTMLElement | null {
  return document.getElementById('sonara-prompt')?.closest('section') as HTMLElement | null;
}

function findCreateButton(section: HTMLElement): HTMLButtonElement | null {
  return Array.from(section.querySelectorAll('button')).find(button => {
    const value = `${button.textContent || ''} ${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`.trim().toLocaleLowerCase();
    return value === 'create' || value.includes('genera') || value.includes('generate music');
  }) as HTMLButtonElement | null || null;
}

function findTarget(step: GuideStep): HTMLElement | null {
  const section = findSection();
  if (!section) return null;
  if (step.id === 'create') return findCreateButton(section);
  if (!step.selector) return null;
  return section.querySelector(step.selector) as HTMLElement | null || document.querySelector(step.selector) as HTMLElement | null;
}

function place(target: HTMLElement): Position {
  const rect = target.getBoundingClientRect();
  const width = Math.min(300, window.innerWidth - 20);
  const height = 155;
  let left = rect.left;
  if (left + width > window.innerWidth - 10) left = window.innerWidth - width - 10;
  if (left < 10) left = 10;
  let top = rect.bottom + 10;
  if (top + height > window.innerHeight - 10 && rect.top > height + 10) top = rect.top - height - 10;
  return { left, top: Math.max(10, Math.min(top, window.innerHeight - height - 10)) };
}

function isComplete(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function markComplete() {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // The guide still works even when storage is unavailable.
  }
}

export default function SonaraInteractiveMiniGuide() {
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [position, setPosition] = useState<Position>({ left: 10, top: 10 });
  const activeStep = useMemo(() => stepIndex === null ? null : STEPS[stepIndex] || null, [stepIndex]);

  useEffect(() => {
    if (isComplete()) return;
    let cancelled = false;
    const tryStart = () => {
      if (cancelled || isComplete()) return;
      const target = findTarget(STEPS[0]);
      if (!target) return;
      setPosition(place(target));
      setStepIndex(0);
    };
    const timers = [250, 700, 1400, 2400].map(ms => window.setTimeout(tryStart, ms));
    return () => {
      cancelled = true;
      timers.forEach(window.clearTimeout);
    };
  }, []);

  useEffect(() => {
    if (!activeStep) return;
    const target = findTarget(activeStep);
    if (!target) return;
    target.dataset.sonaraGuideFocus = 'true';
    target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    const update = () => setPosition(place(target));
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      delete target.dataset.sonaraGuideFocus;
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [activeStep]);

  const advance = () => {
    if (stepIndex === null) return;
    const next = stepIndex + 1;
    if (next >= STEPS.length) {
      markComplete();
      setStepIndex(null);
      return;
    }
    const target = findTarget(STEPS[next]);
    if (!target) {
      setStepIndex(next);
      return;
    }
    setPosition(place(target));
    setStepIndex(next);
  };

  return (
    <>
      {activeStep && createPortal(
        <aside className="sonara-interactive-mini-guide" style={{ left: position.left, top: position.top }} role="dialog" aria-live="polite">
          <div className="sonara-interactive-mini-guide-progress">{stepIndex! + 1} / {STEPS.length}</div>
          <strong>{activeStep.title}</strong>
          <p>{activeStep.text}</p>
          <button type="button" onClick={advance}>OK</button>
        </aside>,
        document.body
      )}
      <style>{`
        [data-sonara-guide-focus="true"]{position:relative!important;z-index:2147482000!important;outline:2px solid rgba(83,150,255,.75)!important;outline-offset:4px!important;border-radius:10px!important;box-shadow:0 0 0 6px rgba(61,128,231,.12)!important}
        .sonara-interactive-mini-guide{position:fixed;z-index:2147483600;width:min(300px,calc(100vw - 20px));padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:#14151a;color:#f7f8fb;box-shadow:0 16px 42px rgba(0,0,0,.48);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .sonara-interactive-mini-guide-progress{margin-bottom:5px;color:#7eaef4;font-size:9px;font-weight:900;letter-spacing:.08em}
        .sonara-interactive-mini-guide strong{display:block;font-size:12px;font-weight:900;line-height:1.25}
        .sonara-interactive-mini-guide p{margin:7px 0 10px;color:#b9c0cb;font-size:10.5px;line-height:1.45}
        .sonara-interactive-mini-guide button{display:block!important;width:100%!important;min-height:34px!important;margin:0!important;padding:0 12px!important;border:1px solid rgba(91,151,246,.45)!important;border-radius:9px!important;background:#236dc9!important;color:#fff!important;font-size:10.5px!important;font-weight:900!important;cursor:pointer!important}
        .sonara-interactive-mini-guide button:hover{background:#2d7de2!important}
        @media(max-width:760px){.sonara-interactive-mini-guide{width:min(280px,calc(100vw - 20px));padding:11px}.sonara-interactive-mini-guide p{font-size:10px}}
      `}</style>
    </>
  );
}
