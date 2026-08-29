import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, Music2, Drum } from 'lucide-react';
import {
  ALL_GLOBAL_INSTRUMENT_SUGGESTIONS,
  ALL_GLOBAL_MUSIC_SUGGESTIONS,
  GLOBAL_INSTRUMENT_SUGGESTIONS,
  GLOBAL_MUSIC_SUGGESTIONS
} from './globalMusicSuggestions';

type Mode = 'music' | 'instruments';

function setControlledTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(textarea, value);
  else textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function togglePromptTag(textarea: HTMLTextAreaElement, tag: string) {
  const current = textarea.value.trim();
  const lower = current.toLocaleLowerCase();
  const tagLower = tag.toLocaleLowerCase();
  let next = current;

  if (lower.includes(tagLower)) {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    next = current
      .replace(new RegExp(`(?:,\\s*)?${escaped}(?:\\s*,)?`, 'i'), ' ')
      .replace(/\s+,/g, ',')
      .replace(/,\s*,/g, ', ')
      .replace(/\s{2,}/g, ' ')
      .replace(/^,\s*|,\s*$/g, '')
      .trim();
  } else {
    next = current ? `${current}${/[.!?;:]$/.test(current) ? ' ' : ', '}${tag}` : tag;
  }

  setControlledTextareaValue(textarea, next);
  textarea.focus();
}

export default function GlobalMusicSuggestionControl() {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [textarea, setTextarea] = useState<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('music');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const connect = () => {
      const target = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      if (!target) {
        setHost(null);
        setTextarea(null);
        return;
      }

      const block = target.parentElement;
      if (!block) return;

      let nextHost = block.querySelector(':scope > [data-sonara-global-suggestions-host]') as HTMLElement | null;
      if (!nextHost) {
        nextHost = document.createElement('div');
        nextHost.dataset.sonaraGlobalSuggestionsHost = 'true';
        target.insertAdjacentElement('afterend', nextHost);
      }

      setHost(current => current === nextHost ? current : nextHost);
      setTextarea(current => current === target ? current : target);
    };

    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const activeGroups = mode === 'music' ? GLOBAL_MUSIC_SUGGESTIONS : GLOBAL_INSTRUMENT_SUGGESTIONS;
  const totalCount = mode === 'music' ? ALL_GLOBAL_MUSIC_SUGGESTIONS.length : ALL_GLOBAL_INSTRUMENT_SUGGESTIONS.length;
  const normalizedQuery = query.trim().toLocaleLowerCase();

  const visibleGroups = useMemo(() => {
    if (!normalizedQuery) return activeGroups;
    return activeGroups
      .map(group => ({
        ...group,
        items: group.items.filter(item => item.toLocaleLowerCase().includes(normalizedQuery))
      }))
      .filter(group => group.items.length > 0);
  }, [activeGroups, normalizedQuery]);

  if (!host || !textarea) return null;

  return createPortal(
    <div className="sonara-global-suggestions">
      <button
        type="button"
        className="sonara-global-suggestions-toggle"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
      >
        <Music2 />
        <span>Musica & Strumenti dal mondo</span>
        <small>{ALL_GLOBAL_MUSIC_SUGGESTIONS.length} stili · {ALL_GLOBAL_INSTRUMENT_SUGGESTIONS.length} strumenti</small>
      </button>

      {open && (
        <div className="sonara-global-suggestions-panel">
          <div className="sonara-global-suggestions-tabs">
            <button type="button" data-active={mode === 'music'} onClick={() => setMode('music')}>
              <Music2 /> Generi & Stili
            </button>
            <button type="button" data-active={mode === 'instruments'} onClick={() => setMode('instruments')}>
              <Drum /> Strumenti
            </button>
          </div>

          <label className="sonara-global-suggestions-search">
            <Search />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={mode === 'music' ? 'Cerca qualsiasi genere, stile o tradizione musicale…' : 'Cerca qualsiasi strumento musicale…'}
              aria-label={mode === 'music' ? 'Cerca generi musicali' : 'Cerca strumenti musicali'}
            />
          </label>

          <div className="sonara-global-suggestions-count">
            {normalizedQuery ? `${visibleGroups.reduce((sum, group) => sum + group.items.length, 0)} risultati` : `${totalCount} suggerimenti disponibili`}
          </div>

          <div className="sonara-global-suggestions-scroll">
            {visibleGroups.map(group => (
              <section key={group.label} className="sonara-global-suggestions-group">
                <h4>{group.label}</h4>
                <div>
                  {group.items.map(item => {
                    const active = textarea.value.toLocaleLowerCase().includes(item.toLocaleLowerCase());
                    return (
                      <button
                        key={item}
                        type="button"
                        data-active={active}
                        onClick={() => togglePromptTag(textarea, item)}
                        title={active ? `Rimuovi ${item}` : `Aggiungi ${item} al prompt`}
                      >
                        {item}
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
            {visibleGroups.length === 0 && <p className="sonara-global-suggestions-empty">Nessun risultato. Prova un altro nome o una tradizione musicale diversa.</p>}
          </div>
        </div>
      )}

      <style>{`
        .sonara-global-suggestions{border-left:1px solid rgba(255,255,255,.055);border-right:1px solid rgba(255,255,255,.055);background:#171719;padding:0 16px 12px}
        .sonara-global-suggestions-toggle{width:100%!important;display:flex!important;align-items:center!important;gap:10px!important;min-height:44px!important;border:1px solid rgba(92,151,255,.18)!important;border-radius:13px!important;background:rgba(51,107,208,.08)!important;color:#eef4ff!important;padding:8px 12px!important;text-align:left!important}
        .sonara-global-suggestions-toggle svg{width:17px;height:17px;color:#75a8ff;flex:0 0 auto}
        .sonara-global-suggestions-toggle span{font-size:12px;font-weight:800;letter-spacing:.01em}
        .sonara-global-suggestions-toggle small{margin-left:auto;color:#8f98a9;font-size:10px;font-weight:700;white-space:nowrap}
        .sonara-global-suggestions-panel{margin-top:10px;border:1px solid rgba(255,255,255,.07);border-radius:15px;background:#111114;padding:12px;box-shadow:0 18px 45px rgba(0,0,0,.26)}
        .sonara-global-suggestions-tabs{display:flex;gap:8px;margin-bottom:10px}
        .sonara-global-suggestions-tabs button{display:inline-flex!important;align-items:center!important;gap:7px!important;border:1px solid rgba(255,255,255,.06)!important;border-radius:10px!important;background:#1f1f22!important;color:#afb2bb!important;padding:9px 12px!important;font-size:11px!important;font-weight:800!important}
        .sonara-global-suggestions-tabs button[data-active="true"]{background:#1e6fe7!important;border-color:rgba(97,160,255,.55)!important;color:white!important}
        .sonara-global-suggestions-tabs svg{width:15px;height:15px}
        .sonara-global-suggestions-search{display:flex;align-items:center;gap:9px;border:1px solid rgba(255,255,255,.08);border-radius:11px;background:#19191c;padding:0 11px}
        .sonara-global-suggestions-search svg{width:16px;height:16px;color:#818895;flex:0 0 auto}
        .sonara-global-suggestions-search input{width:100%;height:42px;border:0!important;background:transparent!important;color:#f5f7fb!important;outline:0!important;font-size:12px!important}
        .sonara-global-suggestions-search input::placeholder{color:#6f7682}
        .sonara-global-suggestions-count{padding:8px 2px 5px;color:#747b88;font-size:10px;font-weight:700}
        .sonara-global-suggestions-scroll{max-height:320px;overflow:auto;padding-right:3px}
        .sonara-global-suggestions-group{padding:8px 0 4px}
        .sonara-global-suggestions-group h4{margin:0 0 7px;color:#9ba4b4;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}
        .sonara-global-suggestions-group>div{display:flex;flex-wrap:wrap;gap:6px}
        .sonara-global-suggestions-group button{min-height:32px!important;border:1px solid rgba(255,255,255,.055)!important;border-radius:9px!important;background:#202024!important;color:#e7e9ee!important;padding:6px 10px!important;font-size:11px!important;font-weight:650!important}
        .sonara-global-suggestions-group button:hover{background:#29292e!important;border-color:rgba(104,158,255,.28)!important}
        .sonara-global-suggestions-group button[data-active="true"]{background:rgba(45,112,220,.18)!important;border-color:rgba(82,145,255,.42)!important;color:#bdd6ff!important}
        .sonara-global-suggestions-empty{margin:18px 0;color:#858b96;font-size:12px;text-align:center}
        @media(max-width:760px){.sonara-global-suggestions{padding-left:12px;padding-right:12px}.sonara-global-suggestions-toggle small{display:none}.sonara-global-suggestions-scroll{max-height:280px}.sonara-global-suggestions-group button{font-size:10.5px!important;padding:6px 9px!important}}
      `}</style>
    </div>,
    host
  );
}
