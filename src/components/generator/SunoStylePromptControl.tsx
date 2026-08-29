import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Bookmark,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Undo2
} from 'lucide-react';

type PromptContext = {
  family: string;
  genre: string;
  subgenre: string;
  mood: string;
  vocalMode: string;
};

const SAVED_STYLES_KEY = 'sonara.savedStylePrompts';
const MAX_SAVED_STYLES = 20;
const MAX_HISTORY = 30;

const GENERIC_TAGS = [
  'warm analog texture',
  'wide stereo image',
  'dynamic arrangement',
  'release-ready mix',
  'human groove',
  'subtle ear candy',
  'clean low end',
  'detailed percussion'
];

const STYLE_TAGS: Array<{ pattern: RegExp; tags: string[] }> = [
  {
    pattern: /deep house/i,
    tags: ['deep rolling bassline', 'hypnotic groove', 'warm pads', 'soulful chord voicings', 'late-night atmosphere', 'four-on-the-floor']
  },
  {
    pattern: /tech house/i,
    tags: ['punchy club drums', 'syncopated bass groove', 'tight percussion', 'minimal vocal chops', 'peak-time energy', 'clean drops']
  },
  {
    pattern: /afro house/i,
    tags: ['organic percussion', 'tribal groove', 'deep bass pulse', 'polyrhythmic drums', 'earthy textures', 'uplifting vocal phrases']
  },
  {
    pattern: /house/i,
    tags: ['four-on-the-floor', 'grooving bassline', 'house piano', 'club-ready drums', 'filtered transitions', 'dancefloor energy']
  },
  {
    pattern: /techno/i,
    tags: ['driving kick', 'hypnotic sequence', 'industrial texture', 'rolling percussion', 'dark warehouse atmosphere', 'evolving automation']
  },
  {
    pattern: /trance/i,
    tags: ['euphoric supersaws', 'driving bassline', 'long tension build', 'wide atmospheric pads', 'uplifting lead melody', 'festival-scale drop']
  },
  {
    pattern: /drum\s*(?:&|and)\s*bass|\bdnb\b|jungle/i,
    tags: ['fast breakbeats', 'sub bass pressure', 'syncopated drums', 'cinematic pads', 'energetic bass movement', 'tight transient detail']
  },
  {
    pattern: /hip[- ]?hop|\brap\b|boom bap/i,
    tags: ['punchy drums', 'deep 808 bass', 'dusty sample texture', 'confident pocket', 'head-nod groove', 'vocal-forward mix']
  },
  {
    pattern: /trap/i,
    tags: ['hard 808s', 'rolling hi-hats', 'dark melodic loop', 'wide ambience', 'punchy snare', 'modern vocal pocket']
  },
  {
    pattern: /r\s*&\s*b|neo soul/i,
    tags: ['silky chords', 'warm bass guitar', 'intimate vocals', 'laid-back pocket', 'lush harmonies', 'smooth modern mix']
  },
  {
    pattern: /jazz/i,
    tags: ['expressive improvisation', 'live-room feel', 'rich extended chords', 'dynamic drums', 'acoustic detail', 'natural performance']
  },
  {
    pattern: /rock|metal/i,
    tags: ['live drums', 'wide guitars', 'powerful bass', 'dynamic performance', 'anthemic arrangement', 'raw room energy']
  },
  {
    pattern: /city pop|j[- ]?pop|k[- ]?pop|\bpop\b/i,
    tags: ['80s city-pop sheen', 'bright synth layers', 'catchy hook', 'polished bassline', 'glossy drums', 'radio-ready arrangement']
  },
  {
    pattern: /ambient|downtempo/i,
    tags: ['slow evolving texture', 'soft atmospheric pads', 'spacious reverb', 'minimal percussion', 'immersive soundscape', 'gentle harmonic motion']
  },
  {
    pattern: /reggae|dub/i,
    tags: ['offbeat guitar skank', 'deep round bass', 'spring reverb', 'dub echoes', 'laid-back groove', 'organic percussion']
  },
  {
    pattern: /latin|salsa|bachata|reggaeton/i,
    tags: ['latin percussion', 'syncopated groove', 'warm bass', 'danceable rhythm', 'bright melodic accents', 'energetic vocal phrasing']
  }
];

function directChild(node: Element | null, section: HTMLElement): HTMLElement | null {
  let current = node instanceof HTMLElement ? node : null;
  while (current && current.parentElement && current.parentElement !== section) current = current.parentElement;
  return current?.parentElement === section ? current : null;
}

function compact(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function readPromptContext(textarea: HTMLTextAreaElement): PromptContext {
  const section = textarea.closest('section');
  const selects = section ? Array.from(section.querySelectorAll('select')) as HTMLSelectElement[] : [];
  const valueAt = (index: number, fallback: string) => selects[index]?.value || fallback;
  const vocalButton = section?.querySelector('button[data-sonara-vocal-mode][aria-pressed="true"]') as HTMLButtonElement | null;

  return {
    family: valueAt(0, 'Electronic / Dance'),
    genre: valueAt(1, 'House'),
    subgenre: valueAt(2, valueAt(1, 'House')),
    mood: valueAt(3, 'Authentic'),
    vocalMode: vocalButton?.dataset.sonaraVocalMode || 'instrumental'
  };
}

function makeStyleTags(context: PromptContext): string[] {
  const identity = `${context.family} ${context.genre} ${context.subgenre}`;
  const genreTags = STYLE_TAGS.find(entry => entry.pattern.test(identity))?.tags || [];
  const vocalTag = context.vocalMode === 'male'
    ? 'gentle male vocals'
    : context.vocalMode === 'female'
      ? 'expressive female vocals'
      : context.vocalMode === 'duet'
        ? 'male and female duet'
        : 'instrumental focus';

  const values = [
    context.subgenre,
    context.mood,
    ...genreTags,
    vocalTag,
    ...GENERIC_TAGS
  ].map(compact).filter(Boolean);

  return Array.from(new Set(values.map(value => value.toLowerCase())))
    .map(lower => values.find(value => value.toLowerCase() === lower) || lower)
    .slice(0, 18);
}

function setControlledTextareaValue(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
  if (setter) setter.call(textarea, value);
  else textarea.value = value;
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function readSavedPrompts(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_STYLES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(value => typeof value === 'string').slice(0, MAX_SAVED_STYLES) : [];
  } catch {
    return [];
  }
}

function writeSavedPrompts(prompts: string[]) {
  try {
    window.localStorage.setItem(SAVED_STYLES_KEY, JSON.stringify(prompts.slice(0, MAX_SAVED_STYLES)));
  } catch {
    // Local persistence is optional.
  }
}

function findLegacyButton(textarea: HTMLTextAreaElement, matcher: (button: HTMLButtonElement) => boolean): HTMLButtonElement | null {
  const block = textarea.parentElement;
  if (!block) return null;
  return Array.from(block.querySelectorAll('button')).find(button => matcher(button as HTMLButtonElement)) as HTMLButtonElement | null;
}

export default function SunoStylePromptControl() {
  const [headerHost, setHeaderHost] = useState<HTMLElement | null>(null);
  const [footerHost, setFooterHost] = useState<HTMLElement | null>(null);
  const [textarea, setTextarea] = useState<HTMLTextAreaElement | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [disabled, setDisabled] = useState(false);
  const [contextVersion, setContextVersion] = useState(0);
  const [enhancing, setEnhancing] = useState(false);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const suppressHistoryRef = useRef(false);

  const styleTags = useMemo(() => textarea ? makeStyleTags(readPromptContext(textarea)) : [], [textarea, contextVersion]);

  const refreshSavedState = (target = textarea) => {
    if (!target) return;
    const value = compact(target.value);
    setSaved(Boolean(value && readSavedPrompts().some(item => compact(item) === value)));
  };

  const pushHistory = (value: string) => {
    if (suppressHistoryRef.current) return;
    const normalized = String(value ?? '');
    const current = historyRef.current[historyIndexRef.current];
    if (current === normalized) return;

    const next = historyRef.current.slice(0, historyIndexRef.current + 1);
    next.push(normalized);
    if (next.length > MAX_HISTORY) next.shift();
    historyRef.current = next;
    historyIndexRef.current = next.length - 1;
  };

  useEffect(() => {
    const connect = () => {
      const target = document.getElementById('sonara-prompt') as HTMLTextAreaElement | null;
      const section = target?.closest('section') as HTMLElement | null;
      const block = section && target ? directChild(target, section) : null;
      if (!target || !section || !block) {
        setHeaderHost(null);
        setFooterHost(null);
        setTextarea(null);
        return;
      }

      block.dataset.sonaraSunoPrompt = 'true';
      block.dataset.sonaraStylesCollapsed = collapsed ? 'true' : 'false';

      const legacyHeader = target.previousElementSibling as HTMLElement | null;
      if (legacyHeader && !legacyHeader.dataset.sonaraSunoHeaderHost) {
        legacyHeader.dataset.sonaraLegacyPromptHeader = 'true';
      }

      let nextHeaderHost = block.querySelector(':scope > [data-sonara-suno-header-host]') as HTMLElement | null;
      if (!nextHeaderHost) {
        nextHeaderHost = document.createElement('div');
        nextHeaderHost.dataset.sonaraSunoHeaderHost = 'true';
        block.insertBefore(nextHeaderHost, block.firstChild);
      }

      let nextFooterHost = block.querySelector(':scope > [data-sonara-suno-footer-host]') as HTMLElement | null;
      if (!nextFooterHost) {
        nextFooterHost = document.createElement('div');
        nextFooterHost.dataset.sonaraSunoFooterHost = 'true';
        target.insertAdjacentElement('afterend', nextFooterHost);
      }

      const randomButton = findLegacyButton(target, button => {
        const haystack = `${button.title || ''} ${button.textContent || ''}`.toLowerCase();
        return haystack.includes('random');
      });

      setDisabled(Boolean(randomButton?.disabled));
      setHeaderHost(current => current === nextHeaderHost ? current : nextHeaderHost);
      setFooterHost(current => current === nextFooterHost ? current : nextFooterHost);
      setTextarea(current => current === target ? current : target);

      if (historyRef.current.length === 0) {
        historyRef.current = [target.value];
        historyIndexRef.current = 0;
      }
      refreshSavedState(target);
    };

    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-pressed'] });
    return () => observer.disconnect();
  }, [collapsed]);

  useEffect(() => {
    if (!textarea) return;
    const section = textarea.closest('section') as HTMLElement | null;
    const block = section ? directChild(textarea, section) : null;
    if (block) block.dataset.sonaraStylesCollapsed = collapsed ? 'true' : 'false';
  }, [collapsed, textarea]);

  useEffect(() => {
    if (!textarea) return;

    const onPromptInput = () => {
      pushHistory(textarea.value);
      refreshSavedState(textarea);
    };
    const onContextChange = (event: Event) => {
      const target = event.target;
      const section = textarea.closest('section');
      if (!section || !(target instanceof Element) || !section.contains(target)) return;
      if (target instanceof HTMLSelectElement || target.closest('button[data-sonara-vocal-mode]')) {
        setContextVersion(value => value + 1);
      }
    };

    textarea.addEventListener('input', onPromptInput);
    textarea.addEventListener('change', onPromptInput);
    document.addEventListener('change', onContextChange, true);
    document.addEventListener('click', onContextChange, true);
    return () => {
      textarea.removeEventListener('input', onPromptInput);
      textarea.removeEventListener('change', onPromptInput);
      document.removeEventListener('change', onContextChange, true);
      document.removeEventListener('click', onContextChange, true);
    };
  }, [textarea]);

  const clickIntelligent = () => {
    if (!textarea || disabled) return;
    const intelligentButton = findLegacyButton(textarea, button => {
      const haystack = `${button.title || ''} ${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`.toLowerCase();
      return haystack.includes('prompt intelligente') || haystack.includes('ottimizzato');
    });
    if (!intelligentButton || intelligentButton.disabled) return;
    setEnhancing(true);
    intelligentButton.click();
    window.setTimeout(() => {
      pushHistory(textarea.value);
      refreshSavedState(textarea);
      setEnhancing(false);
    }, 80);
  };

  const clickRandom = () => {
    if (!textarea || disabled) return;
    const randomButton = findLegacyButton(textarea, button => {
      const haystack = `${button.title || ''} ${button.textContent || ''}`.toLowerCase();
      return haystack.includes('random');
    });
    randomButton?.click();
    window.setTimeout(() => {
      pushHistory(textarea.value);
      refreshSavedState(textarea);
      setContextVersion(value => value + 1);
    }, 30);
  };

  const clearPrompt = () => {
    if (!textarea || disabled || !textarea.value) return;
    pushHistory(textarea.value);
    setControlledTextareaValue(textarea, '');
    pushHistory('');
    textarea.focus();
  };

  const undoPrompt = () => {
    if (!textarea || disabled) return;
    const currentValue = textarea.value;
    if (historyRef.current[historyIndexRef.current] !== currentValue) pushHistory(currentValue);
    if (historyIndexRef.current <= 0) return;

    historyIndexRef.current -= 1;
    suppressHistoryRef.current = true;
    setControlledTextareaValue(textarea, historyRef.current[historyIndexRef.current] || '');
    suppressHistoryRef.current = false;
    refreshSavedState(textarea);
    textarea.focus();
  };

  const toggleSaved = () => {
    if (!textarea || disabled) return;
    const value = textarea.value.trim();
    if (!value) return;

    const savedPrompts = readSavedPrompts();
    const normalized = compact(value);
    const exists = savedPrompts.findIndex(item => compact(item) === normalized);
    const next = exists >= 0
      ? savedPrompts.filter((_, index) => index !== exists)
      : [value, ...savedPrompts].slice(0, MAX_SAVED_STYLES);
    writeSavedPrompts(next);
    setSaved(exists < 0);
  };

  const toggleTag = (tag: string) => {
    if (!textarea || disabled) return;
    const current = textarea.value.trim();
    const lower = current.toLowerCase();
    const tagLower = tag.toLowerCase();
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
    pushHistory(next);
    textarea.focus();
  };

  if (!headerHost || !footerHost || !textarea) return null;

  const header = createPortal(
    <div className="sonara-suno-style-header">
      <button
        type="button"
        className="sonara-suno-style-title"
        onClick={() => setCollapsed(value => !value)}
        aria-expanded={!collapsed}
        title={collapsed ? 'Apri Styles' : 'Chiudi Styles'}
      >
        {collapsed ? <ChevronRight /> : <ChevronDown />}
        <span>Styles</span>
      </button>
      <div className="sonara-suno-style-actions">
        <button type="button" onClick={() => setLibraryOpen(value => !value)} aria-pressed={libraryOpen} title="Libreria stili">
          <SlidersHorizontal />
        </button>
        <button type="button" onClick={undoPrompt} disabled={disabled || historyIndexRef.current <= 0} title="Annulla modifica prompt">
          <Undo2 />
        </button>
        <button type="button" onClick={toggleSaved} disabled={disabled || !textarea.value.trim()} aria-pressed={saved} title={saved ? 'Rimuovi dai prompt salvati' : 'Salva prompt'}>
          <Bookmark className={saved ? 'is-filled' : ''} />
        </button>
        <button type="button" onClick={clearPrompt} disabled={disabled || !textarea.value} title="Cancella prompt">
          <Trash2 />
        </button>
      </div>
    </div>,
    headerHost
  );

  const footer = createPortal(
    <div className="sonara-suno-style-footer">
      <button
        type="button"
        className="sonara-suno-floating-ai"
        onClick={() => setLibraryOpen(value => !value)}
        aria-pressed={libraryOpen}
        title="Assistente AI Styles"
      >
        <span><Sparkles /></span>
      </button>

      <div className="sonara-suno-style-bottom-row">
        <button type="button" className="sonara-suno-round" onClick={() => setLibraryOpen(value => !value)} aria-pressed={libraryOpen} title="Apri suggerimenti Styles">
          <SlidersHorizontal />
        </button>
        <button type="button" className="sonara-suno-round sonara-suno-primary" onClick={clickIntelligent} disabled={disabled} title="Prompt Intelligente SONARA">
          <Sparkles className={enhancing ? 'sonara-suno-spin' : ''} />
        </button>
        <button type="button" className="sonara-suno-round" onClick={clickRandom} disabled={disabled} title="Random Style">
          <RefreshCw />
        </button>

        <div className="sonara-suno-tag-strip" role="list" aria-label="Suggerimenti di stile">
          {styleTags.slice(0, libraryOpen ? 18 : 8).map(tag => {
            const active = textarea.value.toLowerCase().includes(tag.toLowerCase());
            return (
              <button
                key={tag}
                type="button"
                className="sonara-suno-tag"
                data-active={active ? 'true' : 'false'}
                onClick={() => toggleTag(tag)}
                disabled={disabled}
                title={active ? `Rimuovi ${tag}` : `Aggiungi ${tag}`}
                role="listitem"
              >
                {tag}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    footerHost
  );

  return (
    <>
      {header}
      {footer}
      <style>{`
        [data-sonara-suno-prompt="true"]{position:relative!important}
        [data-sonara-suno-prompt="true"]>[data-sonara-legacy-prompt-header="true"]{position:absolute!important;width:1px!important;height:1px!important;margin:0!important;padding:0!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important;opacity:0!important;pointer-events:none!important}
        [data-sonara-suno-prompt="true"]>[data-sonara-suno-header-host]{margin:0!important}
        [data-sonara-suno-prompt="true"]>[data-sonara-suno-footer-host]{margin:0!important}
        [data-sonara-suno-prompt="true"] textarea#sonara-prompt{display:block!important;width:100%!important;min-height:148px!important;margin:0!important;border:1px solid rgba(255,255,255,.055)!important;border-top:0!important;border-bottom:0!important;border-radius:0!important;background:#171719!important;padding:18px 22px!important;color:#f5f5f7!important;font-size:14px!important;line-height:1.65!important;box-shadow:none!important;resize:vertical!important}
        [data-sonara-suno-prompt="true"] textarea#sonara-prompt:focus{border-color:rgba(255,255,255,.095)!important;outline:none!important;box-shadow:inset 0 0 0 1px rgba(86,146,255,.16)!important}
        [data-sonara-suno-prompt="true"][data-sonara-styles-collapsed="true"] textarea#sonara-prompt,[data-sonara-suno-prompt="true"][data-sonara-styles-collapsed="true"]>[data-sonara-suno-footer-host]{display:none!important}
        [data-sonara-suno-prompt="true"][data-sonara-styles-collapsed="true"] .sonara-suno-style-header{border-radius:22px!important}
        .sonara-suno-style-header{display:flex;align-items:center;justify-content:space-between;gap:14px;min-height:74px;padding:12px 18px 12px 20px;border:1px solid rgba(255,255,255,.055);border-bottom:0;border-radius:22px 22px 0 0;background:#171719}
        .sonara-suno-style-title{display:inline-flex!important;align-items:center!important;gap:12px!important;min-width:0!important;border:0!important;background:transparent!important;padding:8px 4px!important;color:#f5f5f7!important;font-size:15px!important;font-weight:700!important;letter-spacing:-.01em!important;overflow:visible!important}
        .sonara-suno-style-title svg{width:18px;height:18px;stroke-width:2.4;color:#f3f3f4}
        .sonara-suno-style-actions{display:flex;align-items:center;gap:10px;flex-shrink:0}
        .sonara-suno-style-actions button,.sonara-suno-round{display:inline-flex!important;align-items:center!important;justify-content:center!important;width:50px!important;height:50px!important;min-width:50px!important;border:1px solid transparent!important;border-radius:999px!important;background:#232326!important;color:#e9e9ec!important;padding:0!important;transition:background .16s ease,border-color .16s ease,transform .16s ease,color .16s ease!important;overflow:visible!important}
        .sonara-suno-style-actions button{width:48px!important;height:48px!important;min-width:48px!important}
        .sonara-suno-style-actions button:hover,.sonara-suno-round:hover{background:#2d2d31!important;border-color:rgba(255,255,255,.08)!important;transform:translateY(-1px)}
        .sonara-suno-style-actions button:disabled,.sonara-suno-round:disabled,.sonara-suno-tag:disabled{opacity:.42!important;cursor:not-allowed!important;transform:none!important}
        .sonara-suno-style-actions button[aria-pressed="true"]{color:#7da9ff!important;border-color:rgba(90,145,255,.34)!important;background:rgba(61,116,226,.15)!important}
        .sonara-suno-style-actions svg,.sonara-suno-round svg{width:19px;height:19px;stroke-width:2.2}
        .sonara-suno-style-actions .is-filled{fill:currentColor}
        .sonara-suno-style-footer{position:relative;min-height:78px;padding:13px 16px 14px 18px;border:1px solid rgba(255,255,255,.055);border-top:0;border-radius:0 0 22px 22px;background:#171719}
        .sonara-suno-style-bottom-row{display:flex;align-items:center;gap:10px;min-width:0}
        .sonara-suno-round{width:52px!important;height:52px!important;min-width:52px!important;background:#222225!important;color:#cfcfd3!important}
        .sonara-suno-primary{background:#1f83ff!important;color:white!important;box-shadow:0 7px 22px rgba(31,131,255,.2)!important}
        .sonara-suno-primary:hover{background:#2d8dff!important;border-color:rgba(255,255,255,.14)!important}
        .sonara-suno-tag-strip{display:flex;align-items:center;gap:10px;min-width:0;overflow-x:auto;overflow-y:hidden;scrollbar-width:thin;padding:1px 0 3px 2px;scroll-snap-type:x proximity}
        .sonara-suno-tag-strip::-webkit-scrollbar{height:5px}.sonara-suno-tag-strip::-webkit-scrollbar-thumb{background:rgba(255,255,255,.16);border-radius:999px}.sonara-suno-tag-strip::-webkit-scrollbar-track{background:transparent}
        .sonara-suno-tag{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;min-height:50px!important;max-width:290px!important;padding:0 20px!important;border:1px solid rgba(255,255,255,.035)!important;border-radius:15px!important;background:#232326!important;color:#f1f1f3!important;font-size:13px!important;font-weight:650!important;line-height:1.2!important;white-space:nowrap!important;text-overflow:ellipsis!important;overflow:hidden!important;scroll-snap-align:start;transition:background .16s ease,border-color .16s ease,color .16s ease!important}
        .sonara-suno-tag:hover{background:#2a2a2e!important;border-color:rgba(255,255,255,.08)!important}
        .sonara-suno-tag[data-active="true"]{border-color:rgba(66,139,255,.35)!important;background:rgba(55,117,226,.13)!important;color:#bcd4ff!important}
        .sonara-suno-floating-ai{position:absolute!important;right:22px!important;top:-66px!important;z-index:4!important;display:flex!important;align-items:center!important;justify-content:center!important;width:48px!important;height:48px!important;min-width:48px!important;padding:0!important;border:5px solid #f4f4f6!important;border-radius:999px!important;background:#f4f4f6!important;box-shadow:0 8px 22px rgba(0,0,0,.28)!important;overflow:visible!important}
        .sonara-suno-floating-ai>span{display:flex;align-items:center;justify-content:center;width:100%;height:100%;border-radius:999px;background:#173552;color:#dff1ff}
        .sonara-suno-floating-ai svg{width:20px;height:20px;stroke-width:2.4}
        .sonara-suno-floating-ai[aria-pressed="true"]>span{background:#1f83ff;color:white}
        .sonara-suno-spin{animation:sonara-suno-spin .8s linear infinite}@keyframes sonara-suno-spin{to{transform:rotate(360deg)}}
        @media (max-width:760px){.sonara-suno-style-header{padding-left:14px;padding-right:12px}.sonara-suno-style-actions{gap:7px}.sonara-suno-style-actions button{width:42px!important;height:42px!important;min-width:42px!important}.sonara-suno-style-bottom-row{gap:8px}.sonara-suno-round{width:46px!important;height:46px!important;min-width:46px!important}.sonara-suno-tag{min-height:46px!important;padding:0 15px!important;font-size:12px!important}.sonara-suno-style-footer{padding-left:12px;padding-right:12px}.sonara-suno-floating-ai{right:16px!important}}
      `}</style>
    </>
  );
}
