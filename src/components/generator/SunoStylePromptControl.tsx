import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bookmark, Check, Trash2, Undo2 } from 'lucide-react';

const SAVED_STYLES_KEY = 'sonara.savedStylePrompts';
const PROMPT_MODE_KEY = 'sonara.generation.prompt.mode.v1';
const MAX_SAVED_STYLES = 20;

function savedStyles(): string[] {
  try {
    const items: unknown = JSON.parse(localStorage.getItem(SAVED_STYLES_KEY) || '[]');
    return Array.isArray(items) ? items.filter((item): item is string => typeof item === 'string').slice(0, MAX_SAVED_STYLES) : [];
  } catch { return []; }
}

function updatePrompt(textarea: HTMLTextAreaElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(textarea, text);
  else textarea.value = text;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

export default function SunoStylePromptControl() {
  const [textarea, setTextarea] = useState<HTMLTextAreaElement | null>(null);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);
  const [freeMode, setFreeMode] = useState(() => localStorage.getItem(PROMPT_MODE_KEY) !== 'guided');
  useEffect(() => {
    const update = () => setFreeMode(localStorage.getItem(PROMPT_MODE_KEY) !== 'guided');
    window.addEventListener('sonara:prompt-mode-changed', update);
    window.addEventListener('storage', update);
    return () => {
      window.removeEventListener('sonara:prompt-mode-changed', update);
      window.removeEventListener('storage', update);
    };
  }, []);
  const [value, setValue] = useState('');
  const [saved, setSaved] = useState<string[]>(savedStyles);
  const [previous, setPrevious] = useState<string | null>(null);
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    const connect = () => {
      const target = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      if (!target) return;
      const block = target.parentElement;
      if (!block) return;
      block.dataset.sonaraSunoPrompt = 'true';
      // Preserve the original controlled textarea and the component integrations.
      let node = block.querySelector(':scope > [data-sonara-suno-header-host]') as HTMLElement | null;
      if (!node) {
        node = document.createElement('div');
        node.dataset.sonaraSunoHeaderHost = 'true';
        block.insertBefore(node, block.firstChild);
      }
      setHost(current => current === node ? current : node);
      setTextarea(current => current === target ? current : target);
      setValue(current => current === target.value ? current : target.value);
      const section = target.closest('section');
      const legacyButton = section?.querySelector('button[title="Random prompt"]') as HTMLButtonElement | null;
      setDisabled(Boolean(legacyButton?.disabled || target.disabled));
    };
    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!textarea) return;
    const handle = () => setValue(textarea.value);
    textarea.addEventListener('input', handle);
    return () => textarea.removeEventListener('input', handle);
  }, [textarea]);

  const change = (next: string) => {
    if (!textarea || disabled) return;
    setPrevious(textarea.value);
    updatePrompt(textarea, next);
    setValue(next);
    textarea.focus();
  };

  const save = () => {
    const text = (textarea?.value || '').trim();
    if (!text || disabled) return;
    const next = saved.includes(text) ? saved.filter(item => item !== text) : [text, ...saved].slice(0, MAX_SAVED_STYLES);
    setSaved(next);
    try { localStorage.setItem(SAVED_STYLES_KEY, JSON.stringify(next)); } catch { /* optional */ }
  };

  if (!host || !textarea) return null;

  return <>{createPortal(
    <div className="sonara-suno-simple">
      <div className="sonara-suno-simple-heading">
        <div>
          <label htmlFor="sonara-prompt">{freeMode ? 'Prompt musicale' : 'Stili musicali'}</label>
          <p>{freeMode ? 'Scrivi liberamente cosa vuoi ascoltare: SONARA segue il prompt senza imporre altri stili.' : "Scrivi il genere, l'atmosfera, gli strumenti e il sound desiderato."}</p>
        </div>
        <div className="sonara-suno-simple-actions">
          <button type="button" onClick={() => setOpen(current => !current)} aria-expanded={open} title="Stili salvati"><Bookmark size={16} /> <span>Salvati</span></button>
          <button type="button" onClick={save} disabled={disabled || !value.trim()} title="Salva o rimuovi dagli stili salvati"><Check size={16} /> <span>Salva</span></button>
          <button type="button" onClick={() => previous !== null && change(previous)} disabled={disabled || previous === null} title="Annulla ultima modifica"><Undo2 size={16} /></button>
          <button type="button" onClick={() => change('')} disabled={disabled || !value} title="Svuota stili"><Trash2 size={16} /></button>
        </div>
      </div>
      {open && <div className="sonara-suno-saved" aria-label="Stili musicali salvati">
        {saved.length === 0 ? <p>Nessuno stile salvato.</p> : saved.map((item, index) =>
          <button key={index} type="button" onClick={() => { change(item); setOpen(false); }} disabled={disabled} title="Usa questo stile">{item.length > 100 ? item.slice(0, 100) + '…' : item}</button>)}
      </div>}
    </div>, host
  )}<style>{`
    [data-sonara-suno-prompt="true"]{position:relative}
    [data-sonara-suno-prompt="true"]>[data-sonara-legacy-prompt-header="true"]{display:none!important}
    [data-sonara-suno-prompt="true"]>[data-sonara-suno-header-host]{margin-bottom:10px}
    .sonara-suno-simple{padding:3px 0}
    .sonara-suno-simple-heading{display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:12px}
    .sonara-suno-simple-heading label{display:block!important;font-size:16px!important;font-weight:750!important;color:#f5f5f7!important;letter-spacing:0!important}
    .sonara-suno-simple-heading p{font-size:12px;color:#92929e;margin-top:3px}
    .sonara-suno-simple-actions{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .sonara-suno-simple-actions button{display:flex!important;align-items:center!important;gap:5px!important;justify-content:center!important;min-height:34px!important;border:1px solid #35353a!important;border-radius:10px!important;background:#202024!important;color:#e8e8ee!important;padding:7px 10px!important;font-size:11px!important}
    .sonara-suno-simple-actions button:disabled{opacity:.35!important;cursor:not-allowed}
    .sonara-suno-saved{display:flex;gap:7px;flex-wrap:wrap;max-height:175px;overflow:auto;margin-top:12px;padding:10px;border:1px solid #303035;border-radius:12px;background:#101014}
    .sonara-suno-saved button{display:block!important;max-width:100%;padding:9px 11px!important;border-radius:9px!important;border:1px solid #38383e!important;background:#25252a!important;color:white!important;text-align:left!important;font-size:12px!important}
    .sonara-suno-saved p{font-size:12px;color:#8e8e98}
    [data-sonara-suno-prompt="true"] textarea#sonara-prompt{display:block!important;width:100%!important;min-height:148px!important;resize:vertical!important;background:#121215!important;border:1px solid #37373e!important;border-radius:15px!important;padding:17px!important;color:#f5f5f7!important;font-size:14px!important;line-height:1.65!important}
    [data-sonara-suno-prompt="true"] textarea#sonara-prompt:focus{outline:none!important;border-color:#669eff!important}
    @media(max-width:760px){.sonara-suno-simple-actions button span{display:none}}
  `}</style></>;
}
