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
import {
  buildContextualVariation,
  buildPromptContextChips,
  buildPromptDirectorBrief,
  stripVocalLanguageForInstrumental,
  type PromptDirectorContext,
  type PromptDirectorMode,
  type PromptStudioMode
} from '../../services/promptDirector';

type PromptContext = {
  family: string;
  genre: string;
  subgenre: string;
  mood: string;
  vocalMode: string;
  bpmMode: 'manual' | 'auto';
  bpm: number | null;
  weirdness: number | null;
  styleInfluence: number | null;
};

const SAVED_STYLES_KEY = 'sonara.savedStylePrompts';
const STUDIO_MODE_KEY = 'sonara.promptStudio.mode';
const DIRECTOR_MODE_KEY = 'sonara.promptDirector.mode';
const MAX_SAVED_STYLES = 20;
const MAX_HISTORY = 30;

const GENERIC_TAGS = [
  'warm analog texture', 'wide stereo image', 'dynamic arrangement', 'release-ready mix',
  'human groove', 'subtle ear candy', 'clean low end', 'detailed percussion'
];

const STYLE_TAGS: Array<{ pattern: RegExp; tags: string[] }> = [
  { pattern: /deep house/i, tags: ['deep rolling bassline', 'hypnotic groove', 'warm pads', 'soulful chord voicings', 'late-night atmosphere', 'four-on-the-floor'] },
  { pattern: /tech house/i, tags: ['punchy club drums', 'syncopated bass groove', 'tight percussion', 'minimal vocal chops', 'peak-time energy', 'clean drops'] },
  { pattern: /afro house/i, tags: ['organic percussion', 'tribal groove', 'deep bass pulse', 'polyrhythmic drums', 'earthy textures', 'uplifting phrases'] },
  { pattern: /house/i, tags: ['four-on-the-floor', 'grooving bassline', 'house piano', 'club-ready drums', 'filtered transitions', 'dancefloor energy'] },
  { pattern: /techno/i, tags: ['driving kick', 'hypnotic sequence', 'industrial texture', 'rolling percussion', 'dark warehouse atmosphere', 'evolving automation'] },
  { pattern: /trance/i, tags: ['euphoric supersaws', 'driving bassline', 'long tension build', 'wide atmospheric pads', 'uplifting lead melody', 'festival-scale drop'] },
  { pattern: /drum\s*(?:&|and)\s*bass|\bdnb\b|jungle/i, tags: ['fast breakbeats', 'sub bass pressure', 'syncopated drums', 'cinematic pads', 'energetic bass movement', 'tight transient detail'] },
  { pattern: /hip[- ]?hop|\brap\b|boom bap/i, tags: ['punchy drums', 'deep 808 bass', 'dusty sample texture', 'confident pocket', 'head-nod groove', 'vocal-forward mix'] },
  { pattern: /trap/i, tags: ['hard 808s', 'rolling hi-hats', 'dark melodic loop', 'wide ambience', 'punchy snare', 'modern vocal pocket'] },
  { pattern: /r\s*&\s*b|neo soul/i, tags: ['silky chords', 'warm bass guitar', 'intimate vocals', 'laid-back pocket', 'lush harmonies', 'smooth modern mix'] },
  { pattern: /jazz/i, tags: ['expressive improvisation', 'live-room feel', 'rich extended chords', 'dynamic drums', 'acoustic detail', 'natural performance'] },
  { pattern: /rock|metal/i, tags: ['live drums', 'wide guitars', 'powerful bass', 'dynamic performance', 'anthemic arrangement', 'raw room energy'] },
  { pattern: /city pop|j[- ]?pop|k[- ]?pop|\bpop\b/i, tags: ['bright synth layers', 'catchy hook', 'polished bassline', 'glossy drums', 'radio-ready arrangement', 'memorable chorus'] },
  { pattern: /ambient|downtempo/i, tags: ['slow evolving texture', 'soft atmospheric pads', 'spacious reverb', 'minimal percussion', 'immersive soundscape', 'gentle harmonic motion'] },
  { pattern: /reggae|dub/i, tags: ['offbeat guitar skank', 'deep round bass', 'spring reverb', 'dub echoes', 'laid-back groove', 'organic percussion'] },
  { pattern: /latin|salsa|bachata|reggaeton/i, tags: ['latin percussion', 'syncopated groove', 'warm bass', 'danceable rhythm', 'bright melodic accents', 'energetic phrasing'] }
];

function compact(value: string): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function directChild(node: Element | null, section: HTMLElement): HTMLElement | null {
  let current = node instanceof HTMLElement ? node : null;
  while (current && current.parentElement && current.parentElement !== section) current = current.parentElement;
  return current?.parentElement === section ? current : null;
}

function numericValue(element: HTMLInputElement | null): number | null {
  if (!element) return null;
  const value = Number(element.value);
  return Number.isFinite(value) ? value : null;
}

function readPromptContext(textarea: HTMLTextAreaElement): PromptContext {
  const section = textarea.closest('section');
  const selects = section ? Array.from(section.querySelectorAll('select')) as HTMLSelectElement[] : [];
  const valueAt = (index: number, fallback: string) => selects[index]?.value || fallback;
  const vocalButton = section?.querySelector('button[data-sonara-vocal-mode][aria-pressed="true"]') as HTMLButtonElement | null;
  const bpmInput = section?.querySelector('input[aria-label="BPM preferiti"]') as HTMLInputElement | null;
  const weirdnessInput = section?.querySelector('#sonara-weirdness') as HTMLInputElement | null;
  const styleInfluenceInput = section?.querySelector('#sonara-style-influence') as HTMLInputElement | null;
  const bpmMode = bpmInput?.dataset.sonaraBpmMode === 'auto' || (section as HTMLElement | null)?.dataset.sonaraBpmMode === 'auto' ? 'auto' : 'manual';

  return {
    family: valueAt(0, 'Electronic / Dance'),
    genre: valueAt(1, 'House'),
    subgenre: valueAt(2, valueAt(1, 'House')),
    mood: valueAt(3, 'Authentic'),
    vocalMode: vocalButton?.dataset.sonaraVocalMode || 'instrumental',
    bpmMode,
    bpm: numericValue(bpmInput),
    weirdness: numericValue(weirdnessInput),
    styleInfluence: numericValue(styleInfluenceInput)
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
  const values = [context.subgenre, context.mood, ...genreTags, vocalTag, ...GENERIC_TAGS].map(compact).filter(Boolean);
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
  try { window.localStorage.setItem(SAVED_STYLES_KEY, JSON.stringify(prompts.slice(0, MAX_SAVED_STYLES))); } catch { /* optional */ }
}

function initialStudioMode(): PromptStudioMode {
  try { return window.localStorage.getItem(STUDIO_MODE_KEY) === 'pro' ? 'pro' : 'simple'; } catch { return 'simple'; }
}

function initialDirectorMode(): PromptDirectorMode {
  try {
    const saved = window.localStorage.getItem(DIRECTOR_MODE_KEY);
    return saved === 'essential' || saved === 'cinematic' ? saved : 'professional';
  } catch { return 'professional'; }
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
  const [promptVersion, setPromptVersion] = useState(0);
  const [enhancing, setEnhancing] = useState(false);
  const [studioMode, setStudioMode] = useState<PromptStudioMode>(initialStudioMode);
  const [directorMode, setDirectorMode] = useState<PromptDirectorMode>(initialDirectorMode);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const suppressHistoryRef = useRef(false);

  const context = useMemo(() => textarea ? readPromptContext(textarea) : null, [textarea, contextVersion]);
  const styleTags = useMemo(() => context ? makeStyleTags(context) : [], [context]);
  const directorContext = useMemo<PromptDirectorContext | null>(() => context && textarea ? ({
    idea: textarea.value,
    ...context,
    styleTags
  }) : null, [context, textarea, styleTags, promptVersion]);
  const contextChips = useMemo(() => directorContext ? buildPromptContextChips(directorContext, directorMode) : [], [directorContext, directorMode]);

  const refreshSavedState = (target = textarea) => {
    if (!target) return;
    const value = compact(target.value);
    setSaved(Boolean(value && readSavedPrompts().some(item => compact(item) === value)));
  };

  const pushHistory = (value: string) => {
    if (suppressHistoryRef.current) return;
    const current = historyRef.current[historyIndexRef.current];
    if (current === value) return;
    const next = historyRef.current.slice(0, historyIndexRef.current + 1);
    next.push(value);
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
        setHeaderHost(null); setFooterHost(null); setTextarea(null); return;
      }
      block.dataset.sonaraSunoPrompt = 'true';
      block.dataset.sonaraStylesCollapsed = collapsed ? 'true' : 'false';
      block.dataset.sonaraPromptStudioMode = studioMode;

      const legacyHeader = target.previousElementSibling as HTMLElement | null;
      if (legacyHeader && !legacyHeader.dataset.sonaraSunoHeaderHost) legacyHeader.dataset.sonaraLegacyPromptHeader = 'true';

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

      const randomButton = findLegacyButton(target, button => `${button.title || ''} ${button.textContent || ''}`.toLowerCase().includes('random'));
      setDisabled(Boolean(randomButton?.disabled));
      setHeaderHost(current => current === nextHeaderHost ? current : nextHeaderHost);
      setFooterHost(current => current === nextFooterHost ? current : nextFooterHost);
      setTextarea(current => current === target ? current : target);
      if (historyRef.current.length === 0) { historyRef.current = [target.value]; historyIndexRef.current = 0; }
      refreshSavedState(target);
    };

    connect();
    const observer = new MutationObserver(connect);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-pressed', 'data-sonara-bpm-mode'] });
    return () => observer.disconnect();
  }, [collapsed, studioMode]);

  useEffect(() => {
    try { window.localStorage.setItem(STUDIO_MODE_KEY, studioMode); } catch { /* optional */ }
    if (!textarea) return;
    const section = textarea.closest('section') as HTMLElement | null;
    const block = section ? directChild(textarea, section) : null;
    if (block) block.dataset.sonaraPromptStudioMode = studioMode;
  }, [studioMode, textarea]);

  useEffect(() => {
    try { window.localStorage.setItem(DIRECTOR_MODE_KEY, directorMode); } catch { /* optional */ }
  }, [directorMode]);

  useEffect(() => {
    if (!textarea) return;
    const onPromptInput = () => { pushHistory(textarea.value); refreshSavedState(textarea); setPromptVersion(value => value + 1); };
    const onContextChange = (event: Event) => {
      const target = event.target;
      const section = textarea.closest('section');
      if (!section || !(target instanceof Element) || !section.contains(target)) return;
      if (target instanceof HTMLSelectElement || target instanceof HTMLInputElement || target.closest('button[data-sonara-vocal-mode]')) {
        window.setTimeout(() => {
          setContextVersion(value => value + 1);
          const live = readPromptContext(textarea);
          if (live.vocalMode === 'instrumental') {
            const clean = stripVocalLanguageForInstrumental(textarea.value);
            if (clean !== textarea.value) setControlledTextareaValue(textarea, clean);
          }
        }, 0);
      }
    };
    textarea.addEventListener('input', onPromptInput);
    textarea.addEventListener('change', onPromptInput);
    document.addEventListener('change', onContextChange, true);
    document.addEventListener('input', onContextChange, true);
    document.addEventListener('click', onContextChange, true);
    return () => {
      textarea.removeEventListener('input', onPromptInput); textarea.removeEventListener('change', onPromptInput);
      document.removeEventListener('change', onContextChange, true); document.removeEventListener('input', onContextChange, true); document.removeEventListener('click', onContextChange, true);
    };
  }, [textarea]);

  const applyDirector = () => {
    if (!textarea || !directorContext || disabled) return;
    const next = buildPromptDirectorBrief({ ...directorContext, idea: textarea.value }, directorMode);
    setControlledTextareaValue(textarea, next); pushHistory(next); textarea.focus(); setPromptVersion(value => value + 1);
  };

  const clickIntelligent = () => {
    if (!textarea || disabled || !directorContext) return;
    setEnhancing(true);
    const master = buildPromptDirectorBrief({ ...directorContext, idea: textarea.value }, directorMode);
    setControlledTextareaValue(textarea, master);
    const intelligentButton = findLegacyButton(textarea, button => {
      const haystack = `${button.title || ''} ${button.getAttribute('aria-label') || ''} ${button.textContent || ''}`.toLowerCase();
      return haystack.includes('prompt intelligente') || haystack.includes('ottimizzato');
    });
    window.setTimeout(() => {
      if (intelligentButton && !intelligentButton.disabled) intelligentButton.click();
      window.setTimeout(() => { pushHistory(textarea.value); refreshSavedState(textarea); setEnhancing(false); setPromptVersion(value => value + 1); }, 100);
    }, 20);
  };

  const clickRandom = () => {
    if (!textarea || disabled || !directorContext) return;
    const next = buildContextualVariation({ ...directorContext, idea: textarea.value }, directorMode, Math.random());
    setControlledTextareaValue(textarea, next); pushHistory(next); refreshSavedState(textarea); textarea.focus(); setPromptVersion(value => value + 1);
  };

  const clearPrompt = () => {
    if (!textarea || disabled || !textarea.value) return;
    pushHistory(textarea.value); setControlledTextareaValue(textarea, ''); pushHistory(''); textarea.focus(); setPromptVersion(value => value + 1);
  };

  const undoPrompt = () => {
    if (!textarea || disabled) return;
    if (historyRef.current[historyIndexRef.current] !== textarea.value) pushHistory(textarea.value);
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1; suppressHistoryRef.current = true;
    setControlledTextareaValue(textarea, historyRef.current[historyIndexRef.current] || ''); suppressHistoryRef.current = false;
    refreshSavedState(textarea); textarea.focus(); setPromptVersion(value => value + 1);
  };

  const toggleSaved = () => {
    if (!textarea || disabled) return;
    const value = textarea.value.trim(); if (!value) return;
    const savedPrompts = readSavedPrompts(); const normalized = compact(value);
    const exists = savedPrompts.findIndex(item => compact(item) === normalized);
    const next = exists >= 0 ? savedPrompts.filter((_, index) => index !== exists) : [value, ...savedPrompts].slice(0, MAX_SAVED_STYLES);
    writeSavedPrompts(next); setSaved(exists < 0);
  };

  const toggleTag = (tag: string) => {
    if (!textarea || disabled) return;
    const current = textarea.value.trim(); const tagLower = tag.toLowerCase(); let next = current;
    if (current.toLowerCase().includes(tagLower)) {
      const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      next = current.replace(new RegExp(`(?:,\\s*)?${escaped}(?:\\s*,)?`, 'i'), ' ').replace(/\s+,/g, ',').replace(/,\s*,/g, ', ').replace(/\s{2,}/g, ' ').replace(/^,\s*|,\s*$/g, '').trim();
    } else next = current ? `${current}${/[.!?;:]$/.test(current) ? ' ' : ', '}${tag}` : tag;
    if (context?.vocalMode === 'instrumental') next = stripVocalLanguageForInstrumental(next);
    setControlledTextareaValue(textarea, next); pushHistory(next); textarea.focus(); setPromptVersion(value => value + 1);
  };

  if (!headerHost || !footerHost || !textarea) return null;

  const header = createPortal(
    <div className="sonara-suno-style-header">
      <button type="button" className="sonara-suno-style-title" onClick={() => setCollapsed(value => !value)} aria-expanded={!collapsed}>
        {collapsed ? <ChevronRight /> : <ChevronDown />}<span>Prompt Studio</span>
      </button>
      <div className="sonara-prompt-mode-switch" aria-label="Modalità Prompt Studio">
        {(['simple', 'pro'] as PromptStudioMode[]).map(mode => (
          <button key={mode} type="button" data-active={studioMode === mode ? 'true' : 'false'} onClick={() => setStudioMode(mode)}>{mode === 'simple' ? 'SEMPLICE' : 'PRO'}</button>
        ))}
      </div>
      <div className="sonara-suno-style-actions">
        <button type="button" onClick={() => setLibraryOpen(value => !value)} aria-pressed={libraryOpen} title="Libreria stili"><SlidersHorizontal /></button>
        <button type="button" onClick={undoPrompt} disabled={disabled || historyIndexRef.current <= 0} title="Annulla"><Undo2 /></button>
        <button type="button" onClick={toggleSaved} disabled={disabled || !textarea.value.trim()} aria-pressed={saved} title="Salva prompt"><Bookmark className={saved ? 'is-filled' : ''} /></button>
        <button type="button" onClick={clearPrompt} disabled={disabled || !textarea.value} title="Cancella prompt"><Trash2 /></button>
      </div>
    </div>, headerHost
  );

  const footer = createPortal(
    <div className="sonara-suno-style-footer">
      <div className="sonara-prompt-context" aria-label="Contesto musicale attivo">
        {contextChips.map(chip => <span key={chip.key} data-kind={chip.kind}>{chip.label}</span>)}
      </div>

      {studioMode === 'pro' && (
        <div className="sonara-director-row">
          <span>PROMPT DIRECTOR</span>
          {(['essential', 'professional', 'cinematic'] as PromptDirectorMode[]).map(mode => (
            <button key={mode} type="button" data-active={directorMode === mode ? 'true' : 'false'} onClick={() => setDirectorMode(mode)}>
              {mode === 'essential' ? 'ESSENZIALE' : mode === 'cinematic' ? 'CINEMATICO' : 'PROFESSIONALE'}
            </button>
          ))}
          <button type="button" className="sonara-director-apply" onClick={applyDirector} disabled={disabled}>CREA MASTER PROMPT</button>
        </div>
      )}

      <div className="sonara-suno-style-bottom-row">
        <button type="button" className="sonara-suno-round" onClick={() => setLibraryOpen(value => !value)} aria-pressed={libraryOpen} title="Suggerimenti"><SlidersHorizontal /></button>
        <button type="button" className="sonara-suno-round sonara-suno-primary" onClick={clickIntelligent} disabled={disabled} title="Prompt Intelligente SONARA"><Sparkles className={enhancing ? 'sonara-suno-spin' : ''} /></button>
        <button type="button" className="sonara-suno-round" onClick={clickRandom} disabled={disabled} title="Random contestuale"><RefreshCw /></button>
        <div className="sonara-suno-tag-strip" role="list" aria-label="Suggerimenti di stile">
          {styleTags.slice(0, studioMode === 'simple' ? 5 : libraryOpen ? 18 : 9).map(tag => {
            const active = textarea.value.toLowerCase().includes(tag.toLowerCase());
            return <button key={tag} type="button" className="sonara-suno-tag" data-active={active ? 'true' : 'false'} onClick={() => toggleTag(tag)} disabled={disabled} role="listitem">{tag}</button>;
          })}
        </div>
      </div>
    </div>, footerHost
  );

  return <>{header}{footer}<style>{`
    [data-sonara-suno-prompt="true"]{position:relative!important}
    [data-sonara-suno-prompt="true"]>[data-sonara-legacy-prompt-header="true"]{position:absolute!important;width:1px!important;height:1px!important;margin:0!important;padding:0!important;overflow:hidden!important;clip:rect(0 0 0 0)!important;clip-path:inset(50%)!important;white-space:nowrap!important;border:0!important;opacity:0!important;pointer-events:none!important}
    [data-sonara-suno-prompt="true"] textarea#sonara-prompt{display:block!important;width:100%!important;min-height:148px!important;margin:0!important;border:1px solid rgba(255,255,255,.055)!important;border-top:0!important;border-bottom:0!important;border-radius:0!important;background:#171719!important;padding:18px 22px!important;color:#f5f5f7!important;font-size:14px!important;line-height:1.65!important;box-shadow:none!important;resize:vertical!important}
    [data-sonara-suno-prompt="true"] textarea#sonara-prompt:focus{outline:none!important;box-shadow:inset 0 0 0 1px rgba(86,146,255,.2)!important}
    [data-sonara-suno-prompt="true"][data-sonara-styles-collapsed="true"] textarea#sonara-prompt,[data-sonara-suno-prompt="true"][data-sonara-styles-collapsed="true"]>[data-sonara-suno-footer-host]{display:none!important}
    .sonara-suno-style-header{display:flex;align-items:center;gap:12px;min-height:74px;padding:12px 18px;border:1px solid rgba(255,255,255,.055);border-bottom:0;border-radius:22px 22px 0 0;background:#171719}
    .sonara-suno-style-title{display:flex!important;align-items:center!important;gap:10px!important;border:0!important;background:transparent!important;color:#f5f5f7!important;font-size:15px!important;font-weight:750!important;padding:8px 4px!important}
    .sonara-suno-style-title svg{width:18px;height:18px}
    .sonara-prompt-mode-switch{display:flex;gap:4px;padding:4px;border-radius:12px;background:#202024;margin-right:auto}
    .sonara-prompt-mode-switch button,.sonara-director-row button{border:1px solid transparent!important;border-radius:9px!important;background:transparent!important;color:#92929b!important;padding:7px 10px!important;font-size:10px!important;font-weight:850!important;letter-spacing:.06em!important}
    .sonara-prompt-mode-switch button[data-active="true"],.sonara-director-row button[data-active="true"]{background:#303036!important;color:#fff!important;border-color:rgba(255,255,255,.09)!important}
    .sonara-suno-style-actions{display:flex;align-items:center;gap:8px}
    .sonara-suno-style-actions button,.sonara-suno-round{display:flex!important;align-items:center!important;justify-content:center!important;width:46px!important;height:46px!important;min-width:46px!important;border:1px solid transparent!important;border-radius:999px!important;background:#232326!important;color:#e9e9ec!important;padding:0!important}
    .sonara-suno-style-actions button:hover,.sonara-suno-round:hover{background:#2d2d31!important;border-color:rgba(255,255,255,.08)!important}
    .sonara-suno-style-actions svg,.sonara-suno-round svg{width:18px;height:18px}.sonara-suno-style-actions .is-filled{fill:currentColor}
    .sonara-suno-style-footer{padding:12px 16px 15px;border:1px solid rgba(255,255,255,.055);border-top:0;border-radius:0 0 22px 22px;background:#171719}
    .sonara-prompt-context{display:flex;gap:7px;overflow-x:auto;padding:2px 0 10px;scrollbar-width:none}.sonara-prompt-context::-webkit-scrollbar{display:none}
    .sonara-prompt-context span{flex:0 0 auto;border:1px solid rgba(255,255,255,.07);border-radius:999px;background:#202024;padding:6px 9px;color:#b9bac2;font-size:9px;font-weight:850;letter-spacing:.05em}
    .sonara-prompt-context span[data-kind="lock"]{border-color:rgba(75,139,255,.2);color:#b9d0ff}.sonara-prompt-context span[data-kind="creative"]{border-color:rgba(168,85,247,.2);color:#d8b4fe}
    .sonara-director-row{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:0 0 10px;padding:9px;border:1px solid rgba(255,255,255,.05);border-radius:13px;background:#1d1d20}
    .sonara-director-row>span{margin-right:4px;color:#777781;font-size:9px;font-weight:900;letter-spacing:.12em}
    .sonara-director-row .sonara-director-apply{margin-left:auto!important;background:#1f83ff!important;color:#fff!important;border-color:rgba(255,255,255,.12)!important}
    .sonara-suno-style-bottom-row{display:flex;align-items:center;gap:9px;min-width:0}
    .sonara-suno-primary{background:#1f83ff!important;color:white!important;box-shadow:0 7px 22px rgba(31,131,255,.2)!important}
    .sonara-suno-tag-strip{display:flex;align-items:center;gap:8px;min-width:0;overflow-x:auto;scrollbar-width:thin;padding:1px 0 2px}
    .sonara-suno-tag{display:inline-flex!important;align-items:center!important;justify-content:center!important;flex:0 0 auto!important;min-height:46px!important;max-width:250px!important;padding:0 16px!important;border:1px solid rgba(255,255,255,.035)!important;border-radius:14px!important;background:#232326!important;color:#f1f1f3!important;font-size:12px!important;font-weight:650!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
    .sonara-suno-tag[data-active="true"]{border-color:rgba(66,139,255,.35)!important;background:rgba(55,117,226,.13)!important;color:#bcd4ff!important}
    .sonara-suno-style-actions button:disabled,.sonara-suno-round:disabled,.sonara-suno-tag:disabled,.sonara-director-row button:disabled{opacity:.42!important;cursor:not-allowed!important}
    .sonara-suno-spin{animation:sonara-suno-spin .8s linear infinite}@keyframes sonara-suno-spin{to{transform:rotate(360deg)}}
    @media(max-width:760px){.sonara-suno-style-header{flex-wrap:wrap;padding:11px 12px}.sonara-prompt-mode-switch{order:3;width:100%}.sonara-prompt-mode-switch button{flex:1}.sonara-director-row .sonara-director-apply{width:100%;margin-left:0!important}.sonara-suno-style-footer{padding-left:11px;padding-right:11px}.sonara-suno-style-actions button,.sonara-suno-round{width:42px!important;height:42px!important;min-width:42px!important}}
  `}</style></>;
}
