import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Disc3, Mic2, Music2, Sparkles } from 'lucide-react';

type CreatorMode = 'simple' | 'advanced' | 'sounds';

function directChild(node: Element | null, section: HTMLElement): HTMLElement | null {
  let current = node instanceof HTMLElement ? node : null;
  while (current && current.parentElement && current.parentElement !== section) current = current.parentElement;
  return current?.parentElement === section ? current : null;
}

export default function SonaraCreatorSkin() {
  const [toolbarHost, setToolbarHost] = useState<HTMLElement | null>(null);
  const [workspaceHost, setWorkspaceHost] = useState<HTMLElement | null>(null);
  const [section, setSection] = useState<HTMLElement | null>(null);
  const [mode, setMode] = useState<CreatorMode>('simple');
  const [hasResults, setHasResults] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const prompt = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      const card = prompt?.closest('section') as HTMLElement | null;
      if (!prompt || !card) {
        setSection(null);
        setToolbarHost(null);
        setWorkspaceHost(null);
        setHasResults(false);
        return;
      }

      card.dataset.sonaraCreatorSkin = 'true';
      card.dataset.sonaraCreatorMode = mode;
      setSection(current => current === card ? current : card);

      let toolbar = card.querySelector('[data-sonara-creator-toolbar-host]') as HTMLElement | null;
      if (!toolbar) {
        toolbar = document.createElement('div');
        toolbar.dataset.sonaraCreatorToolbarHost = 'true';
        card.insertBefore(toolbar, card.firstChild);
      }
      setToolbarHost(current => current === toolbar ? current : toolbar);

      let workspace = card.querySelector('[data-sonara-creator-workspace-host]') as HTMLElement | null;
      if (!workspace) {
        workspace = document.createElement('div');
        workspace.dataset.sonaraCreatorWorkspaceHost = 'true';
        card.insertBefore(workspace, toolbar.nextSibling);
      }
      setWorkspaceHost(current => current === workspace ? current : workspace);

      const title = Array.from(card.children).find(child => child !== toolbar && child !== workspace && child.querySelector('h2')) as HTMLElement | undefined;
      if (title) title.dataset.sonaraCreatorLegacyTitle = 'true';

      const promptBlock = directChild(prompt, card);
      if (promptBlock) promptBlock.dataset.sonaraCreatorBlock = 'prompt';

      const creative = document.getElementById('sonara-weirdness')?.closest('div.grid') as HTMLElement | null;
      if (creative) creative.dataset.sonaraCreativeControls = 'true';

      const outsideSelects = Array.from(card.querySelectorAll('select')).filter(select => !select.closest('details')) as HTMLSelectElement[];
      const taxonomy = directChild(outsideSelects[0] || null, card);
      const musical = directChild(outsideSelects[3] || null, card);
      if (taxonomy) taxonomy.dataset.sonaraCreatorBlock = 'taxonomy';
      if (musical) musical.dataset.sonaraCreatorBlock = 'musical';

      const bpmInput = card.querySelector('input[aria-label="BPM preferiti"]');
      const bpmBlock = directChild(bpmInput, card);
      if (bpmBlock) bpmBlock.dataset.sonaraCreatorBlock = 'bpm';

      const lyrics = card.querySelector('details') as HTMLDetailsElement | null;
      if (lyrics) {
        lyrics.dataset.sonaraCreatorBlock = 'lyrics';
        lyrics.open = true;
      }

      const dualHost = card.querySelector('[data-sonara-dual-generator-host]') as HTMLElement | null;
      if (dualHost) {
        dualHost.dataset.sonaraCreatorDual = 'true';
        const candidateGrid = Array.from(dualHost.querySelectorAll('div')).find(div => div.querySelector(':scope > article')) as HTMLElement | undefined;
        if (candidateGrid) candidateGrid.dataset.sonaraCreatorResults = 'true';
        setHasResults(Boolean(candidateGrid?.querySelector('article')));
      } else {
        setHasResults(Boolean(card.querySelector(':scope > div audio')));
      }

      for (const child of Array.from(card.children)) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.querySelector('audio') && child !== dualHost && !child.closest('[data-sonara-dual-generator-host]')) {
          child.dataset.sonaraCreatorSingleResult = 'true';
          setHasResults(true);
        }
      }
    };

    refresh();
    const observer = new MutationObserver(refresh);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('sonara:billing-updated', refresh as EventListener);
    return () => {
      observer.disconnect();
      window.removeEventListener('sonara:billing-updated', refresh as EventListener);
    };
  }, [mode]);

  useEffect(() => {
    if (section) section.dataset.sonaraCreatorMode = mode;
  }, [mode, section]);

  const voice = () => {
    if (!section) return;
    const selected = section.querySelector('button[data-sonara-vocal-mode][aria-pressed="true"]') as HTMLButtonElement | null;
    if (!selected || selected.dataset.sonaraVocalMode === 'instrumental') {
      (section.querySelector('button[data-sonara-vocal-mode="female"]') as HTMLButtonElement | null)?.click();
    }
    const lyrics = section.querySelector('#sonara-lyrics') as HTMLTextAreaElement | null;
    lyrics?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    window.setTimeout(() => lyrics?.focus(), 250);
  };

  const inspire = () => {
    if (!section) return;
    const prompt = section.querySelector('#sonara-prompt') as HTMLTextAreaElement | null;
    const block = prompt ? directChild(prompt, section) : null;
    const randomButton = Array.from(block?.querySelectorAll('button') || []).find(button => {
      const text = `${button.getAttribute('title') || ''} ${button.textContent || ''}`.toLowerCase();
      return text.includes('random');
    }) as HTMLButtonElement | undefined;
    randomButton?.click();
  };

  const toolbar = toolbarHost ? createPortal(
    <div className="sonara-creator-toolbar">
      <div className="sonara-creator-brand">
        <div className="sonara-creator-brand-icon"><Sparkles /></div>
        <div>
          <div className="sonara-creator-title">SONARA CREATE</div>
          <div className="sonara-creator-kicker">AI MUSIC STUDIO</div>
        </div>
      </div>
      <div className="sonara-creator-tabs" role="tablist" aria-label="Modalita Creator">
        {(['simple', 'advanced', 'sounds'] as CreatorMode[]).map(value => (
          <button key={value} type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)}>
            {value === 'simple' ? 'Simple' : value === 'advanced' ? 'Advanced' : 'Sounds'}
          </button>
        ))}
      </div>
      <div className="sonara-creator-actions">
        <button type="button" onClick={() => setMode('sounds')}><Music2 />Audio</button>
        <button type="button" onClick={voice}><Mic2 />Voice</button>
        <button type="button" onClick={inspire}><Sparkles />Inspo</button>
      </div>
    </div>, toolbarHost
  ) : null;

  const workspace = workspaceHost ? createPortal(
    <div className="sonara-creator-workspace-head">
      <div>
        <div className="sonara-creator-workspace-title">Workspace</div>
        <div className="sonara-creator-workspace-kicker">GENERATED TRACKS</div>
      </div>
      <span>LIVE</span>
      {!hasResults && (
        <div className="sonara-creator-empty">
          <div className="sonara-creator-empty-icon"><Disc3 /></div>
          <strong>No tracks yet</strong>
          <p>Descrivi il brano, configura voce e stile, quindi premi Create.</p>
        </div>
      )}
    </div>, workspaceHost
  ) : null;

  return (
    <>
      <style>{`
        section[data-sonara-creator-skin="true"]{display:grid!important;grid-template-columns:minmax(0,1fr) 420px!important;grid-auto-flow:row!important;align-items:start!important;column-gap:0!important;padding:0!important;overflow:hidden!important;border-color:rgba(255,255,255,.06)!important;border-radius:24px!important;background:#09090b!important;box-shadow:0 26px 80px rgba(0,0,0,.38)!important}
        section[data-sonara-creator-skin="true"]>*{min-width:0;grid-column:1}section[data-sonara-creator-skin="true"]>[data-sonara-creator-legacy-title="true"]{display:none!important}
        section[data-sonara-creator-skin="true"]>[data-sonara-creator-toolbar-host]{grid-column:1!important;grid-row:1!important;border-bottom:1px solid rgba(255,255,255,.055);background:#0b0b0e}
        section[data-sonara-creator-skin="true"]>[data-sonara-creator-workspace-host]{grid-column:2!important;grid-row:1/span 40!important;min-height:100%;border-left:1px solid rgba(255,255,255,.055);background:#0c0c0f}
        section[data-sonara-creator-skin="true"]>[data-sonara-creator-block],section[data-sonara-creator-skin="true"]>div:not([data-sonara-creator-toolbar-host]):not([data-sonara-creator-workspace-host]):not([data-sonara-dual-generator-host]):not([data-sonara-creator-single-result]),section[data-sonara-creator-skin="true"]>details,section[data-sonara-creator-skin="true"]>button{margin-left:24px!important;margin-right:24px!important}
        section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="prompt"]{margin-top:20px!important}section[data-sonara-creator-skin="true"]>[data-sonara-creator-block="lyrics"]{margin-bottom:18px!important}
        section[data-sonara-creator-skin="true"] [data-sonara-creator-block="prompt"] textarea#sonara-prompt{border-color:rgba(255,255,255,.07)!important;background:#111114!important;border-radius:18px!important;min-height:170px;padding:18px!important;color:#f4f4f5!important;line-height:1.65!important}
        section[data-sonara-creator-skin="true"] select,section[data-sonara-creator-skin="true"] input[type="text"],section[data-sonara-creator-skin="true"] input[type="number"],section[data-sonara-creator-skin="true"] textarea#sonara-lyrics{border-color:rgba(255,255,255,.075)!important;background:#0a0a0c!important;color:#f4f4f5!important}
        section[data-sonara-creator-skin="true"] details[data-sonara-creator-block="lyrics"]{border-color:rgba(255,255,255,.065)!important;background:#111114!important;border-radius:18px!important}section[data-sonara-creator-skin="true"] details[data-sonara-creator-block="lyrics"] summary{padding:4px 2px;font-weight:900;color:white}section[data-sonara-creator-skin="true"] textarea#sonara-lyrics{min-height:210px;border-radius:14px!important}
        section[data-sonara-creator-mode="simple"]>[data-sonara-creator-block="taxonomy"],section[data-sonara-creator-mode="simple"]>[data-sonara-creator-block="musical"],section[data-sonara-creator-mode="simple"]>[data-sonara-creator-block="bpm"],section[data-sonara-creator-mode="simple"] [data-sonara-creative-controls="true"]{display:none!important}
        section[data-sonara-creator-skin="true"]>[data-sonara-dual-generator-host],section[data-sonara-creator-skin="true"]>[data-sonara-dual-generator-host]>div{display:contents!important}
        section[data-sonara-creator-skin="true"]>[data-sonara-dual-generator-host]>div>button:first-child{grid-column:1!important;margin:4px 24px 26px!important;border:0!important;border-radius:999px!important;min-height:58px;background:linear-gradient(90deg,#e4e4e7,#fff,#d4d4d8)!important;color:#09090b!important;box-shadow:0 12px 38px rgba(0,0,0,.35)!important;font-size:0!important}
        section[data-sonara-creator-skin="true"]>[data-sonara-dual-generator-host]>div>button:first-child::after{content:'Create';font-size:14px;font-weight:950;letter-spacing:.01em}section[data-sonara-creator-skin="true"]>[data-sonara-dual-generator-host]>div>button:first-child svg{width:17px;height:17px}section[data-sonara-creator-skin="true"]>[data-sonara-dual-generator-host]>div>button:first-child+div{display:none!important}
        section[data-sonara-creator-skin="true"] [data-sonara-creator-results="true"]{grid-column:2!important;grid-row:2/span 38!important;align-self:start!important;position:sticky!important;top:88px;z-index:2;margin:82px 18px 20px!important;display:grid!important;grid-template-columns:1fr!important;gap:12px!important;max-height:calc(100vh - 120px);overflow:auto;padding-right:2px}section[data-sonara-creator-skin="true"] [data-sonara-creator-results="true"] article{border-color:rgba(255,255,255,.07)!important;background:#131316!important;border-radius:18px!important}
        section[data-sonara-creator-skin="true"]>[data-sonara-creator-single-result="true"]{grid-column:2!important;grid-row:2/span 38!important;position:sticky;top:88px;margin:82px 18px 20px!important;border-color:rgba(255,255,255,.07)!important;background:#131316!important}
        .sonara-creator-toolbar{padding:18px 24px 16px}.sonara-creator-brand{display:flex;align-items:center;gap:11px}.sonara-creator-brand-icon{width:38px;height:38px;display:flex;align-items:center;justify-content:center;border-radius:12px;background:#fff;color:#09090b}.sonara-creator-brand-icon svg{width:17px;height:17px}.sonara-creator-title{color:#fff;font-size:14px;font-weight:950;letter-spacing:-.02em}.sonara-creator-kicker{color:#52525b;margin-top:2px;font-size:8px;font-weight:850;letter-spacing:.22em}
        .sonara-creator-tabs{margin-top:16px;display:grid;grid-template-columns:repeat(3,1fr);gap:4px;padding:4px;border-radius:13px;background:#111114}.sonara-creator-tabs button{min-height:36px;border-radius:10px;color:#71717a;font-size:10px;font-weight:900;transition:.18s ease}.sonara-creator-tabs button[aria-selected="true"]{background:#29292f;color:#fff;box-shadow:0 4px 18px rgba(0,0,0,.22)}
        .sonara-creator-actions{margin-top:10px;display:grid;grid-template-columns:repeat(3,1fr);gap:7px}.sonara-creator-actions button{min-height:42px;display:flex;align-items:center;justify-content:center;gap:7px;border:1px solid rgba(255,255,255,.065);border-radius:12px;background:#141417;color:#d4d4d8;font-size:10px;font-weight:850;transition:.18s ease}.sonara-creator-actions button:hover{background:#1b1b20;border-color:rgba(255,255,255,.12);color:#fff}.sonara-creator-actions svg{width:14px;height:14px}
        .sonara-creator-workspace-head{min-height:100%;padding:20px 18px;position:relative}.sonara-creator-workspace-title{color:#fff;font-size:13px;font-weight:950}.sonara-creator-workspace-kicker{margin-top:3px;color:#52525b;font-size:8px;font-weight:850;letter-spacing:.18em}.sonara-creator-workspace-head>span{position:absolute;right:18px;top:20px;padding:5px 8px;border:1px solid rgba(255,255,255,.065);border-radius:999px;background:rgba(255,255,255,.035);color:#71717a;font-size:7px;font-weight:900}
        .sonara-creator-empty{margin-top:58px;min-height:320px;display:flex;flex-direction:column;align-items:center;justify-content:center;border:1px dashed rgba(255,255,255,.07);border-radius:18px;background:#101013;text-align:center;padding:28px}.sonara-creator-empty-icon{width:54px;height:54px;display:flex;align-items:center;justify-content:center;border-radius:17px;background:rgba(255,255,255,.035);color:#3f3f46}.sonara-creator-empty-icon svg{width:21px;height:21px}.sonara-creator-empty strong{margin-top:15px;color:#a1a1aa;font-size:11px}.sonara-creator-empty p{max-width:230px;margin-top:8px;color:#52525b;font-size:9px;line-height:1.7}
        @media(max-width:1279px){section[data-sonara-creator-skin="true"]{grid-template-columns:minmax(0,1fr)!important}section[data-sonara-creator-skin="true"]>[data-sonara-creator-workspace-host]{grid-column:1!important;grid-row:auto!important;border-left:0;border-top:1px solid rgba(255,255,255,.055);min-height:380px}section[data-sonara-creator-skin="true"] [data-sonara-creator-results="true"],section[data-sonara-creator-skin="true"]>[data-sonara-creator-single-result="true"]{grid-column:1!important;grid-row:auto!important;position:static!important;margin:18px 24px 26px!important;max-height:none}.sonara-creator-empty{min-height:260px}}
        @media(max-width:640px){.sonara-creator-toolbar{padding:16px}section[data-sonara-creator-skin="true"]>[data-sonara-creator-block],section[data-sonara-creator-skin="true"]>div:not([data-sonara-creator-toolbar-host]):not([data-sonara-creator-workspace-host]):not([data-sonara-dual-generator-host]):not([data-sonara-creator-single-result]),section[data-sonara-creator-skin="true"]>details,section[data-sonara-creator-skin="true"]>button{margin-left:16px!important;margin-right:16px!important}section[data-sonara-creator-skin="true"]>[data-sonara-dual-generator-host]>div>button:first-child{margin-left:16px!important;margin-right:16px!important}.sonara-creator-actions button{font-size:9px}}
      `}</style>
      {toolbar}
      {workspace}
    </>
  );
}
