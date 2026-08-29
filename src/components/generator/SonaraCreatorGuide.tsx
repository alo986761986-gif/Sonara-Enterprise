import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CheckCircle2, HelpCircle, Lightbulb, Search, X } from 'lucide-react';

type GuideItem = {
  id: string;
  title: string;
  summary: string;
  how: string;
  example: string;
  selector?: string;
};

const GUIDE_SEEN_KEY = 'sonara.creator.guide.seen.v1';

const GUIDE_ITEMS: GuideItem[] = [
  {
    id: 'prompt',
    title: 'Prompt musica',
    summary: 'Descrivi il brano che vuoi ottenere: genere, atmosfera, strumenti, struttura, voce e dettagli sonori.',
    how: 'Scrivi in modo naturale. Le istruzioni esplicite nel prompt hanno priorità sui valori generici e puoi indicare anche il BPM, per esempio “Drum & Bass a 170 BPM”.',
    example: 'Melodic techno, 128 BPM, basso profondo, kick deciso, synth analogici e break atmosferico.',
    selector: '#sonara-prompt'
  },
  {
    id: 'world-library',
    title: 'Musica & Strumenti dal mondo',
    summary: 'Apre la libreria globale di generi, tradizioni musicali e strumenti.',
    how: 'Cerca un genere o uno strumento e cliccalo per inserirlo nel prompt. Puoi combinare più elementi per creare fusioni precise.',
    example: 'Afro House + Kora + Analog Synthesizer + Djembe.',
    selector: '.sonara-global-suggestions-toggle'
  },
  {
    id: 'styles',
    title: 'Styles',
    summary: 'Aggiunge caratteristiche di produzione, groove, timbro e arrangiamento al prompt.',
    how: 'Usa i suggerimenti come ingredienti. Un secondo clic rimuove il tag. Il Prompt Intelligente può trasformare pochi tag in una descrizione musicale completa.',
    example: 'deep rolling bassline, warm pads, human groove, release-ready mix.',
    selector: '[data-sonara-suno-prompt="true"]'
  },
  {
    id: 'taxonomy',
    title: 'Famiglia, genere e sottogenere',
    summary: 'Definisce la grammatica musicale di base utilizzata dal motore.',
    how: 'Scegli prima la famiglia, poi il genere e infine il sottogenere. Se nel prompt scrivi esplicitamente un altro stile, il prompt resta l’istruzione autoritativa.',
    example: 'Electronic / Dance → Drum & Bass → Liquid Drum & Bass.',
    selector: '[data-sonara-creator-block="taxonomy"]'
  },
  {
    id: 'musical',
    title: 'Atmosfera, tonalità e durata',
    summary: 'Controlla carattere emotivo, centro armonico e lunghezza della composizione.',
    how: 'L’atmosfera guida energia e colore; la tonalità imposta il centro armonico; la durata indica quanto deve svilupparsi il brano.',
    example: 'Atmosfera: Dark Cinematic · Tonalità: A Minor · Durata: 180 s.',
    selector: '[data-sonara-creator-block="musical"]'
  },
  {
    id: 'bpm',
    title: 'BPM / Tempo',
    summary: 'Imposta la velocità reale della generazione musicale.',
    how: 'In Manuale il BPM è bloccato sul valore scelto. In Auto SONARA propone un tempo coerente con il contesto. Se scrivi un BPM esplicito nel prompt, quel valore diventa autoritativo.',
    example: '170 BPM per Drum & Bass veloce; 124 BPM per House; 72 BPM per una ballata lenta.',
    selector: '[data-sonara-creator-block="bpm"]'
  },
  {
    id: 'weirdness',
    title: 'Weirdness',
    summary: 'Regola quanto il risultato può essere creativo, insolito e meno prevedibile.',
    how: 'Valori bassi mantengono il brano più convenzionale. Valori alti permettono variazioni timbriche, armoniche e strutturali più audaci.',
    example: '25 = tradizionale · 55 = creativo ma controllato · 85 = sperimentale.',
    selector: '#sonara-weirdness'
  },
  {
    id: 'style-influence',
    title: 'Style Influence',
    summary: 'Regola quanto fortemente SONARA deve seguire lo stile, il genere e il DNA musicale selezionati.',
    how: 'Aumentalo quando vuoi un’identità di genere molto riconoscibile. Riducilo quando vuoi più libertà di fusione e interpretazione.',
    example: '90 = forte aderenza allo stile · 50 = equilibrio · 25 = interpretazione più libera.',
    selector: '#sonara-style-influence'
  },
  {
    id: 'vocals',
    title: 'Voce',
    summary: 'Sceglie se il brano deve essere strumentale oppure cantato e con quale configurazione vocale.',
    how: 'Seleziona Instrumental, Male, Female o Duet. Per i brani cantati scegli anche la lingua e usa il box Testo per guidare le parole eseguite.',
    example: 'Female + Italiano per una voce femminile in italiano; Duet per alternanza uomo/donna.',
    selector: 'button[data-sonara-vocal-mode]'
  },
  {
    id: 'lyrics',
    title: 'Testo / Lyrics',
    summary: 'Contiene le parole che devono essere cantate quando la modalità vocale è attiva.',
    how: 'Puoi scrivere il testo manualmente, usare gli strumenti intelligenti oppure generarne una variante. Se fornisci un testo esplicito, SONARA deve trattarlo come contenuto autoritativo.',
    example: '[Verse] … [Chorus] … [Bridge] … per indicare chiaramente le sezioni.',
    selector: '#sonara-lyrics'
  },
  {
    id: 'intelligent',
    title: 'Prompt Intelligente',
    summary: 'Espande una tua idea breve in un brief musicale dettagliato senza sostituire le istruzioni esplicite.',
    how: 'Scrivi prima ciò che vuoi davvero, poi usa Prompt Intelligente per completare strumentazione, groove, armonia, arrangiamento e produzione.',
    example: '“Afro House malinconica con kora” può diventare un brief completo mantenendo quella richiesta come priorità.',
    selector: 'button[title="Prompt Intelligente SONARA"]'
  },
  {
    id: 'random',
    title: 'Random / Inspo',
    summary: 'Crea una nuova direzione creativa e varia realmente mood, armonia, arrangiamento e controlli creativi.',
    how: 'Usalo quando vuoi ispirazione senza partire da zero. Il BPM esplicitamente bloccato resta invariato.',
    example: 'Premi Random più volte per confrontare idee diverse mantenendo la velocità scelta.',
    selector: 'button[title="Random Style"]'
  },
  {
    id: 'workspace',
    title: 'Workspace e risultati',
    summary: 'È l’area dove compaiono le tracce generate e i controlli di ascolto.',
    how: 'Dopo Create, confronta le versioni generate, ascolta il risultato e usa gli strumenti disponibili per continuare il lavoro.',
    example: 'Genera due versioni, ascoltale entrambe e continua dalla migliore.',
    selector: '[data-sonara-creator-workspace-host]'
  }
];

function findCreateButton(section: HTMLElement | null): HTMLButtonElement | null {
  if (!section) return null;
  return Array.from(section.querySelectorAll('button')).find(button => {
    const text = `${button.textContent || ''} ${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`.trim().toLowerCase();
    return text === 'create' || text.includes('genera') || text.includes('generate music');
  }) as HTMLButtonElement | null || null;
}

function targetFor(item: GuideItem, section: HTMLElement | null): HTMLElement | null {
  if (item.id === 'create') return findCreateButton(section);
  if (!item.selector) return null;
  const root = item.selector.startsWith('#') ? document : section || document;
  return root.querySelector(item.selector) as HTMLElement | null;
}

function addContextTitles(section: HTMLElement) {
  const title = (selector: string, value: string) => {
    section.querySelectorAll(selector).forEach(node => {
      if (!(node instanceof HTMLElement)) return;
      node.dataset.sonaraGuideEnabled = 'true';
      if (!node.getAttribute('title')) node.setAttribute('title', value);
    });
  };

  title('#sonara-prompt', 'Guida: descrivi genere, BPM, strumenti, atmosfera, struttura e voce. Le istruzioni esplicite hanno priorità.');
  title('input[aria-label="BPM preferiti"]', 'Guida BPM: velocità reale del brano. Manuale = valore bloccato; Auto = scelta intelligente.');
  title('#sonara-weirdness', 'Guida Weirdness: aumenta o riduce sperimentazione e imprevedibilità musicale.');
  title('#sonara-style-influence', 'Guida Style Influence: controlla quanto fortemente seguire lo stile selezionato.');
  title('#sonara-lyrics', 'Guida Testo: parole autoritative da cantare quando la voce è attiva.');
  title('button[data-sonara-vocal-mode]', 'Guida Voce: scegli strumentale, maschile, femminile o duetto.');
  title('.sonara-global-suggestions-toggle', 'Guida: cerca generi e strumenti da tutto il mondo e aggiungili al prompt.');
}

function ensureTip(block: HTMLElement | null, id: string, label: string) {
  if (!block) return;
  if (getComputedStyle(block).position === 'static') block.style.position = 'relative';
  let tip = block.querySelector(`:scope > button[data-sonara-guide-tip="${id}"]`) as HTMLButtonElement | null;
  if (!tip) {
    tip = document.createElement('button');
    tip.type = 'button';
    tip.dataset.sonaraGuideTip = id;
    tip.className = 'sonara-inline-guide-tip';
    tip.textContent = '?';
    tip.setAttribute('aria-label', `Apri guida ${label}`);
    tip.setAttribute('title', `Guida: ${label}`);
    block.appendChild(tip);
  }
}

export default function SonaraCreatorGuide() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [section, setSection] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState('prompt');
  const [autoOpened, setAutoOpened] = useState(false);

  useEffect(() => {
    const connect = () => {
      const prompt = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      const creator = prompt?.closest('section') as HTMLElement | null;
      if (!prompt || !creator) {
        setHost(null);
        setSection(null);
        return;
      }

      setSection(current => current === creator ? current : creator);
      addContextTitles(creator);

      const actions = creator.querySelector('.sonara-creator-actions') as HTMLElement | null;
      const toolbar = creator.querySelector('[data-sonara-creator-toolbar-host]') as HTMLElement | null;
      const parent = actions || toolbar || creator;
      let nextHost = creator.querySelector('[data-sonara-creator-guide-host]') as HTMLElement | null;
      if (!nextHost) {
        nextHost = document.createElement('span');
        nextHost.dataset.sonaraCreatorGuideHost = 'true';
        nextHost.className = 'sonara-creator-guide-host';
        parent.appendChild(nextHost);
      }
      setHost(current => current === nextHost ? current : nextHost);

      const promptBlock = creator.querySelector('[data-sonara-creator-block="prompt"]') as HTMLElement | null;
      const bpmBlock = creator.querySelector('[data-sonara-creator-block="bpm"]') as HTMLElement | null;
      const lyricsBlock = creator.querySelector('[data-sonara-creator-block="lyrics"]') as HTMLElement | null;
      const creativeBlock = creator.querySelector('[data-sonara-creative-controls="true"]') as HTMLElement | null;
      ensureTip(promptBlock, 'prompt', 'Prompt musica');
      ensureTip(bpmBlock, 'bpm', 'BPM / Tempo');
      ensureTip(lyricsBlock, 'lyrics', 'Testo / Lyrics');
      ensureTip(creativeBlock, 'weirdness', 'Controlli creativi');
    };

    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onTip = (event: Event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const tip = target.closest('button[data-sonara-guide-tip]') as HTMLButtonElement | null;
      if (!tip) return;
      setActiveId(tip.dataset.sonaraGuideTip || 'prompt');
      setOpen(true);
    };
    document.addEventListener('click', onTip, true);
    return () => document.removeEventListener('click', onTip, true);
  }, []);

  useEffect(() => {
    if (!host || autoOpened) return;
    setAutoOpened(true);
    try {
      if (window.localStorage.getItem(GUIDE_SEEN_KEY) === 'true') return;
    } catch {
      // Local storage is optional.
    }
    const timer = window.setTimeout(() => setOpen(true), 900);
    return () => window.clearTimeout(timer);
  }, [host, autoOpened]);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return GUIDE_ITEMS;
    return GUIDE_ITEMS.filter(item => `${item.title} ${item.summary} ${item.how} ${item.example}`.toLocaleLowerCase().includes(normalized));
  }, [query]);

  const active = GUIDE_ITEMS.find(item => item.id === activeId) || GUIDE_ITEMS[0];

  const closeGuide = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(GUIDE_SEEN_KEY, 'true');
    } catch {
      // Local storage is optional.
    }
  };

  const reveal = (item: GuideItem) => {
    setActiveId(item.id);
    const target = targetFor(item, section);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('sonara-guide-highlight');
    window.setTimeout(() => target.classList.remove('sonara-guide-highlight'), 1800);
  };

  if (!host) return null;

  const guideButton = createPortal(
    <button
      type="button"
      className="sonara-guide-open-button"
      onClick={() => setOpen(true)}
      title="Apri la guida di SONARA Create"
      aria-label="Apri guida SONARA Create"
    >
      <HelpCircle />
      <span>Guida</span>
    </button>,
    host
  );

  const guidePanel = open ? createPortal(
    <div className="sonara-guide-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) closeGuide();
    }}>
      <section className="sonara-guide-panel" role="dialog" aria-modal="true" aria-label="Guida SONARA Create">
        <header className="sonara-guide-header">
          <div className="sonara-guide-mark"><Lightbulb /></div>
          <div>
            <strong>Guida SONARA Create</strong>
            <span>Capisci ogni controllo prima di generare</span>
          </div>
          <button type="button" onClick={closeGuide} className="sonara-guide-close" aria-label="Chiudi guida"><X /></button>
        </header>

        <div className="sonara-guide-quickstart">
          <CheckCircle2 />
          <div>
            <strong>Partenza rapida</strong>
            <span>1. Descrivi il brano → 2. scegli stile e strumenti → 3. imposta BPM/voce → 4. premi Create → 5. confronta le versioni nel Workspace.</span>
          </div>
        </div>

        <label className="sonara-guide-search">
          <Search />
          <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cerca una funzione: BPM, Weirdness, voce, strumenti…" />
        </label>

        <div className="sonara-guide-body">
          <nav className="sonara-guide-nav" aria-label="Funzioni SONARA">
            {visibleItems.map(item => (
              <button key={item.id} type="button" data-active={active.id === item.id} onClick={() => setActiveId(item.id)}>
                <span>{item.title}</span>
                <ArrowRight />
              </button>
            ))}
            {visibleItems.length === 0 && <p>Nessuna funzione trovata.</p>}
          </nav>

          <article className="sonara-guide-detail">
            <small>COME FUNZIONA</small>
            <h3>{active.title}</h3>
            <p>{active.summary}</p>
            <div className="sonara-guide-how">
              <strong>Come si usa</strong>
              <p>{active.how}</p>
            </div>
            <div className="sonara-guide-example">
              <strong>Esempio</strong>
              <p>{active.example}</p>
            </div>
            <button type="button" className="sonara-guide-show-control" onClick={() => reveal(active)}>
              Mostra questa funzione nell’interfaccia <ArrowRight />
            </button>
          </article>
        </div>

        <footer className="sonara-guide-footer">
          <span>I pulsanti <b>?</b> vicino ai controlli riaprono direttamente la spiegazione relativa.</span>
          <button type="button" onClick={closeGuide}>Ho capito</button>
        </footer>
      </section>
    </div>,
    document.body
  ) : null;

  return (
    <>
      {guideButton}
      {guidePanel}
      <style>{`
        .sonara-creator-guide-host{display:inline-flex!important;align-items:center!important}
        .sonara-guide-open-button{display:inline-flex!important;align-items:center!important;gap:7px!important;min-height:40px!important;padding:0 13px!important;border:1px solid rgba(91,153,255,.24)!important;border-radius:11px!important;background:rgba(45,105,210,.11)!important;color:#cfe0ff!important;font-size:11px!important;font-weight:850!important;letter-spacing:.02em!important;overflow:visible!important}
        .sonara-guide-open-button:hover{background:rgba(52,119,233,.2)!important;border-color:rgba(104,165,255,.46)!important;color:white!important}
        .sonara-guide-open-button svg{width:16px;height:16px;stroke-width:2.2}
        .sonara-inline-guide-tip{position:absolute!important;z-index:8!important;right:8px!important;top:8px!important;display:flex!important;align-items:center!important;justify-content:center!important;width:25px!important;height:25px!important;min-width:25px!important;padding:0!important;border:1px solid rgba(109,166,255,.36)!important;border-radius:999px!important;background:#171d29!important;color:#9fc4ff!important;font-size:12px!important;font-weight:950!important;line-height:1!important;box-shadow:0 4px 14px rgba(0,0,0,.22)!important;overflow:visible!important}
        .sonara-inline-guide-tip:hover{background:#1d5fae!important;color:white!important}
        .sonara-guide-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:24px;background:rgba(0,0,0,.66);backdrop-filter:blur(9px)}
        .sonara-guide-panel{width:min(1040px,96vw);max-height:min(760px,92vh);display:flex;flex-direction:column;overflow:hidden;border:1px solid rgba(255,255,255,.1);border-radius:24px;background:#0d0e12;color:#f6f7fb;box-shadow:0 30px 100px rgba(0,0,0,.58)}
        .sonara-guide-header{display:flex;align-items:center;gap:13px;padding:18px 20px;border-bottom:1px solid rgba(255,255,255,.07);background:#111217}
        .sonara-guide-mark{display:flex;align-items:center;justify-content:center;width:42px;height:42px;border-radius:13px;background:linear-gradient(145deg,#1c79ed,#8258ff);color:white;box-shadow:0 9px 25px rgba(50,111,234,.25)}
        .sonara-guide-mark svg{width:20px;height:20px}.sonara-guide-header>div:nth-child(2){display:flex;flex-direction:column;gap:2px}.sonara-guide-header strong{font-size:16px;font-weight:900}.sonara-guide-header span{font-size:11px;color:#8d95a5}
        .sonara-guide-close{margin-left:auto!important;display:flex!important;align-items:center!important;justify-content:center!important;width:38px!important;height:38px!important;min-width:38px!important;border:1px solid rgba(255,255,255,.07)!important;border-radius:11px!important;background:#1a1b20!important;color:#c9ccd5!important;padding:0!important}.sonara-guide-close svg{width:18px;height:18px}
        .sonara-guide-quickstart{display:flex;align-items:flex-start;gap:10px;margin:14px 18px 0;padding:12px 14px;border:1px solid rgba(65,160,255,.18);border-radius:14px;background:rgba(36,104,203,.09)}
        .sonara-guide-quickstart>svg{width:18px;height:18px;margin-top:1px;color:#61a8ff;flex:0 0 auto}.sonara-guide-quickstart>div{display:flex;flex-direction:column;gap:3px}.sonara-guide-quickstart strong{font-size:11px}.sonara-guide-quickstart span{font-size:10.5px;line-height:1.5;color:#a7b0bf}
        .sonara-guide-search{display:flex;align-items:center;gap:9px;margin:12px 18px;padding:0 12px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:#16171c}.sonara-guide-search svg{width:16px;height:16px;color:#747d8e}.sonara-guide-search input{width:100%;height:42px;border:0!important;background:transparent!important;color:#f6f7fb!important;outline:0!important;font-size:12px!important}.sonara-guide-search input::placeholder{color:#646d7b}
        .sonara-guide-body{min-height:0;display:grid;grid-template-columns:310px minmax(0,1fr);gap:0;overflow:hidden;border-top:1px solid rgba(255,255,255,.055);border-bottom:1px solid rgba(255,255,255,.055)}
        .sonara-guide-nav{min-height:0;overflow:auto;padding:12px;border-right:1px solid rgba(255,255,255,.06);background:#0f1014}.sonara-guide-nav button{width:100%!important;display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;min-height:42px!important;margin:2px 0!important;padding:8px 10px!important;border:1px solid transparent!important;border-radius:10px!important;background:transparent!important;color:#aeb4c0!important;text-align:left!important;font-size:11px!important;font-weight:760!important}.sonara-guide-nav button:hover{background:#191b21!important;color:#f4f6fa!important}.sonara-guide-nav button[data-active="true"]{background:rgba(48,114,224,.17)!important;border-color:rgba(83,148,255,.24)!important;color:#d7e6ff!important}.sonara-guide-nav button svg{width:14px;height:14px;flex:0 0 auto}.sonara-guide-nav p{padding:15px;color:#727988;font-size:11px}
        .sonara-guide-detail{min-height:0;overflow:auto;padding:26px 30px 30px;background:linear-gradient(180deg,#111217,#0d0e12)}.sonara-guide-detail>small{font-size:9px;font-weight:950;letter-spacing:.12em;color:#5f9cff}.sonara-guide-detail h3{margin:7px 0 8px;font-size:24px;line-height:1.15}.sonara-guide-detail>p{margin:0 0 20px;max-width:680px;color:#b8bdc8;font-size:13px;line-height:1.65}.sonara-guide-how,.sonara-guide-example{margin-top:12px;padding:15px 16px;border:1px solid rgba(255,255,255,.06);border-radius:14px;background:#16171c}.sonara-guide-how strong,.sonara-guide-example strong{display:block;margin-bottom:5px;color:#f1f3f7;font-size:11px}.sonara-guide-how p,.sonara-guide-example p{margin:0;color:#a7aeba;font-size:12px;line-height:1.58}.sonara-guide-example{border-color:rgba(116,83,255,.16);background:rgba(76,52,166,.08)}
        .sonara-guide-show-control{display:inline-flex!important;align-items:center!important;gap:8px!important;margin-top:18px!important;min-height:42px!important;padding:0 15px!important;border:1px solid rgba(84,148,255,.35)!important;border-radius:11px!important;background:#1d67c9!important;color:white!important;font-size:11px!important;font-weight:850!important}.sonara-guide-show-control svg{width:15px;height:15px}
        .sonara-guide-footer{display:flex;align-items:center;gap:15px;padding:13px 18px;background:#101116}.sonara-guide-footer span{color:#747d8b;font-size:10.5px}.sonara-guide-footer button{margin-left:auto!important;min-height:38px!important;padding:0 16px!important;border:0!important;border-radius:10px!important;background:#2d7ceb!important;color:white!important;font-size:11px!important;font-weight:850!important}
        .sonara-guide-highlight{outline:3px solid rgba(65,147,255,.92)!important;outline-offset:5px!important;box-shadow:0 0 0 9px rgba(45,121,237,.14),0 0 42px rgba(48,132,255,.32)!important;transition:outline .2s ease,box-shadow .2s ease!important}
        @media(max-width:800px){.sonara-guide-backdrop{padding:8px}.sonara-guide-panel{width:100%;max-height:96vh;border-radius:18px}.sonara-guide-body{grid-template-columns:1fr}.sonara-guide-nav{display:flex;gap:6px;overflow-x:auto;overflow-y:hidden;border-right:0;border-bottom:1px solid rgba(255,255,255,.06);padding:9px}.sonara-guide-nav button{width:auto!important;min-width:max-content!important;padding:8px 11px!important}.sonara-guide-nav button svg{display:none}.sonara-guide-detail{padding:20px 18px}.sonara-guide-footer span{display:none}.sonara-guide-open-button span{display:none}.sonara-guide-open-button{width:40px!important;min-width:40px!important;padding:0!important;justify-content:center!important}.sonara-inline-guide-tip{right:6px!important;top:6px!important}}
      `}</style>
    </>
  );
}
