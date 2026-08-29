import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BookOpen, CircleHelp, X } from 'lucide-react';

type GuideItem = {
  id: string;
  title: string;
  summary: string;
  how: string;
  example: string;
  selector?: string;
};

type AnchorPosition = {
  left: number;
  top: number;
};

const GUIDE_ITEMS: GuideItem[] = [
  {
    id: 'prompt',
    title: 'Prompt musica',
    summary: 'È la descrizione principale del brano che SONARA deve creare.',
    how: 'Scrivi genere, sottogenere, strumenti, atmosfera, struttura, voce e anche il BPM. Le richieste esplicite che scrivi qui hanno priorità sui valori generici.',
    example: 'Jungle / Drum & Bass aggressiva, breakbeat velocissimi, rolling sub bass, rave dark, 170 BPM.',
    selector: '#sonara-prompt'
  },
  {
    id: 'world-library',
    title: 'Universo Musica & Strumenti',
    summary: 'Libreria ricercabile di generi, tradizioni musicali e strumenti da tutto il mondo.',
    how: 'Cerca uno stile o uno strumento e cliccalo per aggiungerlo al prompt. Puoi combinarne più di uno e creare fusioni.',
    example: 'Afro House + Kora + Djembe + Analog Synthesizer.',
    selector: '.sonara-global-suggestions-toggle, #sonara-world-suggestions-edge .swe-toggle'
  },
  {
    id: 'styles',
    title: 'Styles',
    summary: 'Aggiunge dettagli su groove, timbro, arrangiamento e produzione.',
    how: 'Usa gli Style come ingredienti sonori. Puoi combinarli e poi usare Prompt Intelligente per trasformarli in un brief musicale completo.',
    example: 'deep rolling bassline, warm pads, punchy drums, human groove, club-ready mix.',
    selector: '[data-sonara-suno-prompt="true"]'
  },
  {
    id: 'taxonomy',
    title: 'Famiglia, genere e sottogenere',
    summary: 'Definisce la grammatica musicale di base della generazione.',
    how: 'Scegli famiglia, genere e sottogenere per dare al motore una direzione precisa. Se nel prompt scrivi uno stile esplicito differente, il prompt resta prioritario.',
    example: 'Electronic / Dance → Drum & Bass → Jungle.',
    selector: '[data-sonara-creator-block="taxonomy"]'
  },
  {
    id: 'musical',
    title: 'Atmosfera, tonalità e durata',
    summary: 'Controlla emozione, centro armonico e sviluppo temporale del brano.',
    how: 'Atmosfera definisce il carattere; tonalità guida l’armonia; durata stabilisce quanto deve svilupparsi la composizione.',
    example: 'Dark Cinematic · A Minor · 240 secondi.',
    selector: '[data-sonara-creator-block="musical"]'
  },
  {
    id: 'bpm',
    title: 'BPM Auto / Manuale',
    summary: 'Determina la velocità reale del brano.',
    how: 'Manuale blocca il valore scelto. Auto propone un BPM coerente con genere e contesto. Se scrivi un BPM esplicito nel Prompt Musica, quel valore diventa autoritativo.',
    example: '170 BPM per Jungle/DnB, 124 BPM per House, 72 BPM per una ballata lenta.',
    selector: '[data-sonara-creator-block="bpm"]'
  },
  {
    id: 'weirdness',
    title: 'Weirdness',
    summary: 'Regola quanto il risultato può essere creativo, insolito e imprevedibile.',
    how: 'Valori bassi mantengono la composizione più convenzionale. Valori alti permettono scelte timbriche, armoniche e strutturali più audaci.',
    example: '25 = tradizionale · 55 = creativo controllato · 85 = sperimentale.',
    selector: '#sonara-weirdness'
  },
  {
    id: 'style-influence',
    title: 'Style Influence',
    summary: 'Regola quanto fortemente SONARA deve seguire lo stile selezionato.',
    how: 'Aumentalo per un’identità di genere più riconoscibile. Riducilo per dare più libertà a fusioni e interpretazioni.',
    example: '90 = stile molto fedele · 50 = equilibrio · 25 = interpretazione libera.',
    selector: '#sonara-style-influence'
  },
  {
    id: 'vocals',
    title: 'Voce',
    summary: 'Sceglie se il brano sarà strumentale o cantato e quale configurazione vocale usare.',
    how: 'Seleziona Instrumental, Male, Female o Duet. Quando abiliti la voce, lingua e testo guidano l’esecuzione vocale.',
    example: 'Female + Italiano oppure Duet per alternanza uomo/donna.',
    selector: 'button[data-sonara-vocal-mode]'
  },
  {
    id: 'lyrics',
    title: 'Testo / Lyrics',
    summary: 'Contiene le parole che devono essere cantate.',
    how: 'Scrivi il testo manualmente o usa gli strumenti intelligenti. Puoi indicare sezioni come Verse, Chorus, Bridge e Outro per guidare la struttura.',
    example: '[Verse] … [Chorus] … [Bridge] … [Outro] …',
    selector: '#sonara-lyrics'
  },
  {
    id: 'intelligent',
    title: 'Prompt Intelligente',
    summary: 'Espande una tua idea breve in un prompt musicale professionale e dettagliato.',
    how: 'Scrivi prima l’idea fondamentale. Poi premi Intelligente: SONARA completa strumentazione, groove, armonia, arrangiamento e produzione senza cancellare le istruzioni esplicite.',
    example: '“Afro House malinconica con kora” → brief completo mantenendo Afro House e kora come priorità.',
    selector: 'button[title="Prompt Intelligente SONARA"], button[data-sonara-intelligent-prompt]'
  },
  {
    id: 'random',
    title: 'Random / Inspo',
    summary: 'Genera una nuova direzione creativa quando vuoi ispirazione immediata.',
    how: 'Varia stile, atmosfera e ingredienti musicali. Un BPM esplicitamente bloccato resta invariato.',
    example: 'Premi Random più volte e scegli l’idea che preferisci prima di generare.',
    selector: 'button[title="Random Style"], button[data-sonara-random-style]'
  },
  {
    id: 'create',
    title: 'Create / Genera',
    summary: 'Avvia la generazione usando tutte le impostazioni attive.',
    how: 'Prima di premere Create controlla Prompt, BPM, stile, voce, durata e testo. SONARA invia questi parametri al motore musicale.',
    example: 'Prompt pronto + 128 BPM + Female + 180 s → Create.',
  },
  {
    id: 'workspace',
    title: 'Workspace e risultati',
    summary: 'È l’area dove compaiono le tracce generate.',
    how: 'Ascolta le versioni, confrontale e continua il lavoro dalla migliore. Il Workspace resta separato dai controlli di creazione.',
    example: 'Genera due versioni, ascoltale entrambe e scegli quella da scaricare o rifinire.',
    selector: '[data-sonara-creator-workspace-host]'
  }
];

function findCreateButton(section: HTMLElement): HTMLButtonElement | null {
  return Array.from(section.querySelectorAll('button')).find(button => {
    const value = `${button.textContent || ''} ${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`.trim().toLocaleLowerCase();
    return value === 'create' || value.includes('genera') || value.includes('generate music');
  }) as HTMLButtonElement | null || null;
}

function directChild(node: Element | null, section: HTMLElement): HTMLElement | null {
  let current = node instanceof HTMLElement ? node : null;
  while (current && current.parentElement && current.parentElement !== section) current = current.parentElement;
  return current?.parentElement === section ? current : null;
}

function targetFor(item: GuideItem, section: HTMLElement): HTMLElement | null {
  if (item.id === 'create') return findCreateButton(section);
  if (!item.selector) return null;
  return section.querySelector(item.selector) as HTMLElement | null || document.querySelector(item.selector) as HTMLElement | null;
}

function containerFor(item: GuideItem, target: HTMLElement, section: HTMLElement): HTMLElement {
  if (['prompt', 'taxonomy', 'musical', 'bpm'].includes(item.id)) return directChild(target, section) || target;
  if (item.id === 'world-library') return target.closest('[data-sonara-global-suggestions-host], #sonara-world-suggestions-edge') as HTMLElement || target.parentElement || target;
  if (item.id === 'styles') return target.closest('[data-sonara-suno-prompt="true"]') as HTMLElement || target;
  if (item.id === 'workspace') return target;
  if (item.id === 'vocals') return target.parentElement || target;
  if (item.id === 'lyrics') return target.parentElement || target;
  if (item.id === 'weirdness' || item.id === 'style-influence') return target.closest('label') as HTMLElement || target.parentElement || target;
  return target.parentElement || target;
}

function computePosition(button: HTMLElement): AnchorPosition {
  const rect = button.getBoundingClientRect();
  const width = Math.min(360, Math.max(300, window.innerWidth - 24));
  const left = Math.max(12, Math.min(rect.right - width, window.innerWidth - width - 12));
  const estimatedHeight = 270;
  const placeAbove = rect.bottom + estimatedHeight > window.innerHeight - 12 && rect.top > estimatedHeight;
  const top = placeAbove ? Math.max(12, rect.top - estimatedHeight - 8) : Math.min(window.innerHeight - estimatedHeight - 12, rect.bottom + 8);
  return { left, top: Math.max(12, top) };
}

export default function SonaraInlineHelpSystem() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [position, setPosition] = useState<AnchorPosition>({ left: 12, top: 12 });
  const active = useMemo(() => GUIDE_ITEMS.find(item => item.id === activeId) || null, [activeId]);

  useEffect(() => {
    const connect = () => {
      const prompt = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      const section = prompt?.closest('section') as HTMLElement | null;
      if (!section) return;

      for (const item of GUIDE_ITEMS) {
        const target = targetFor(item, section);
        if (!target) continue;
        const container = containerFor(item, target, section);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        container.dataset.sonaraInlineHelpContainer = item.id;
        target.dataset.sonaraInlineHelpTarget = item.id;

        let trigger = container.querySelector(`:scope > button[data-sonara-inline-help-tip="${item.id}"]`) as HTMLButtonElement | null;
        if (!trigger) {
          trigger = document.createElement('button');
          trigger.type = 'button';
          trigger.className = 'sonara-suno-help-tip';
          trigger.dataset.sonaraInlineHelpTip = item.id;
          trigger.textContent = '?';
          trigger.setAttribute('aria-label', `Che cos’è ${item.title}?`);
          trigger.setAttribute('title', `${item.title}: ${item.summary}`);
          container.appendChild(trigger);
        }
      }
    };

    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const element = event.target instanceof Element ? event.target : null;
      const trigger = element?.closest('button[data-sonara-inline-help-tip]') as HTMLButtonElement | null;
      if (trigger) {
        event.preventDefault();
        event.stopPropagation();
        const id = trigger.dataset.sonaraInlineHelpTip || null;
        setActiveId(id);
        setPosition(computePosition(trigger));
        return;
      }
      if (element?.closest('.sonara-suno-help-popover')) return;
      setActiveId(null);
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setActiveId(null);
    };

    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, []);

  const openFullGuide = () => {
    setActiveId(null);
    (document.querySelector('.sonara-guide-open-button') as HTMLButtonElement | null)?.click();
  };

  return (
    <>
      {active && createPortal(
        <aside
          className="sonara-suno-help-popover"
          style={{ left: position.left, top: position.top }}
          role="dialog"
          aria-label={`Guida ${active.title}`}
        >
          <header>
            <span className="sonara-suno-help-icon"><CircleHelp /></span>
            <div>
              <small>COME FUNZIONA</small>
              <strong>{active.title}</strong>
            </div>
            <button type="button" className="sonara-suno-help-close" onClick={() => setActiveId(null)} aria-label="Chiudi"><X /></button>
          </header>
          <p className="sonara-suno-help-summary">{active.summary}</p>
          <div className="sonara-suno-help-box">
            <b>Come si usa</b>
            <p>{active.how}</p>
          </div>
          <div className="sonara-suno-help-example">
            <b>Esempio</b>
            <p>{active.example}</p>
          </div>
          <button type="button" className="sonara-suno-help-full" onClick={openFullGuide}>
            <BookOpen /> Guida completa SONARA
          </button>
        </aside>,
        document.body
      )}
      <style>{`
        section[data-sonara-creator-skin="true"] .sonara-inline-guide-tip{display:none!important}
        .sonara-suno-help-tip{position:absolute!important;z-index:25!important;right:8px!important;top:8px!important;display:flex!important;align-items:center!important;justify-content:center!important;width:24px!important;height:24px!important;min-width:24px!important;max-width:24px!important;padding:0!important;border:1px solid rgba(115,169,255,.34)!important;border-radius:999px!important;background:#171a22!important;color:#9fc4ff!important;font:900 11px/1 system-ui,sans-serif!important;box-shadow:0 5px 14px rgba(0,0,0,.24)!important;cursor:help!important;overflow:visible!important}
        .sonara-suno-help-tip:hover,.sonara-suno-help-tip:focus-visible{background:#236bc2!important;border-color:#6faaff!important;color:#fff!important;outline:none!important;box-shadow:0 0 0 3px rgba(61,139,238,.16),0 7px 18px rgba(0,0,0,.28)!important}
        [data-sonara-inline-help-container="weirdness"]>.sonara-suno-help-tip,[data-sonara-inline-help-container="style-influence"]>.sonara-suno-help-tip{right:3px!important;top:-2px!important}
        [data-sonara-inline-help-container="vocals"]>.sonara-suno-help-tip,[data-sonara-inline-help-container="intelligent"]>.sonara-suno-help-tip,[data-sonara-inline-help-container="random"]>.sonara-suno-help-tip,[data-sonara-inline-help-container="create"]>.sonara-suno-help-tip{right:-7px!important;top:-7px!important}
        .sonara-suno-help-popover{position:fixed;z-index:2147483200;width:min(360px,calc(100vw - 24px));padding:0;overflow:hidden;border:1px solid rgba(255,255,255,.1);border-radius:16px;background:#111217;color:#f4f6fa;box-shadow:0 24px 70px rgba(0,0,0,.52);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
        .sonara-suno-help-popover>header{display:flex;align-items:center;gap:10px;padding:13px 14px;border-bottom:1px solid rgba(255,255,255,.065);background:#15171d}
        .sonara-suno-help-icon{display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:10px;background:rgba(45,119,225,.16);color:#79b2ff}.sonara-suno-help-icon svg{width:17px;height:17px}
        .sonara-suno-help-popover header>div{display:flex;flex-direction:column;gap:1px;min-width:0}.sonara-suno-help-popover header small{color:#6da8ff;font-size:8px;font-weight:950;letter-spacing:.11em}.sonara-suno-help-popover header strong{font-size:13px;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .sonara-suno-help-close{margin-left:auto!important;display:flex!important;align-items:center!important;justify-content:center!important;width:30px!important;height:30px!important;min-width:30px!important;padding:0!important;border:1px solid rgba(255,255,255,.065)!important;border-radius:9px!important;background:#1b1d23!important;color:#aab0bc!important}.sonara-suno-help-close svg{width:15px;height:15px}
        .sonara-suno-help-summary{margin:0;padding:13px 14px 7px;color:#c4c9d2;font-size:11.5px;line-height:1.55}
        .sonara-suno-help-box,.sonara-suno-help-example{margin:8px 12px;padding:10px 11px;border:1px solid rgba(255,255,255,.06);border-radius:11px;background:#181a20}.sonara-suno-help-box b,.sonara-suno-help-example b{display:block;margin-bottom:3px;color:#eef1f6;font-size:10px}.sonara-suno-help-box p,.sonara-suno-help-example p{margin:0;color:#9fa7b4;font-size:10.5px;line-height:1.5}.sonara-suno-help-example{border-color:rgba(96,126,255,.16);background:rgba(60,75,160,.08)}
        .sonara-suno-help-full{display:flex!important;align-items:center!important;justify-content:center!important;gap:7px!important;width:calc(100% - 24px)!important;min-height:38px!important;margin:10px 12px 12px!important;padding:0 12px!important;border:1px solid rgba(87,149,255,.25)!important;border-radius:10px!important;background:rgba(41,105,204,.13)!important;color:#cfe1ff!important;font-size:10.5px!important;font-weight:850!important}.sonara-suno-help-full:hover{background:#2169c7!important;color:white!important}.sonara-suno-help-full svg{width:14px;height:14px}
        @media(max-width:760px){.sonara-suno-help-tip{width:23px!important;height:23px!important;min-width:23px!important}.sonara-suno-help-popover{width:calc(100vw - 20px);left:10px!important;top:auto!important;bottom:10px!important;border-radius:15px}.sonara-suno-help-summary{font-size:11px}.sonara-suno-help-box p,.sonara-suno-help-example p{font-size:10px}}
      `}</style>
    </>
  );
}
