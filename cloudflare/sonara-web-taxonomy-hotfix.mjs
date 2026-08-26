import sonaraEngine from './sonara-engine-v14-universal-taxonomy-lock.mjs';

const VERCEL_WEB_ORIGIN = 'https://sonara-enterprise-sonaramusicai86-2765s-projects.vercel.app';
const WEB_HOSTS = new Set(['sonaraenterprise.com', 'www.sonaraenterprise.com']);
const EDGE_LYRICS_SCRIPT_PATH = '/sonara-intelligent-lyrics-edge.js';
const EDGE_VOCAL_SCRIPT_PATH = '/sonara-vocal-character-edge.js';
const ENGINE_PATHS = ['/api/music/job/', '/api/modal/audio', '/api/engine/'];

const INTELLIGENT_LYRICS_EDGE_SCRIPT = String.raw`(() => {
  const BUTTON_ID = 'sonara-testo-intelligente-edge';
  const LENGTH_ID = 'sonara-lyrics-length-edge';
  const STORAGE_KEY = 'sonara-lyrics-length';
  const LENGTHS = {
    short: { label: 'CORTO', durationSec: 60 },
    normal: { label: 'NORMALE', durationSec: 180 },
    long: { label: 'LUNGO', durationSec: 360 }
  };
  let selectedLength = (() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved && LENGTHS[saved] ? saved : 'normal';
    } catch { return 'normal'; }
  })();
  const languageNames = {
    it: 'Italiano', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch',
    pt: 'Português', nap: 'Napulitano', ja: '日本語', ko: '한국어', zh: '中文',
    ar: 'العربية', hi: 'हिन्दी', ru: 'Русский'
  };
  const setLyricsValue = (textarea, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(textarea, value); else textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  };
  const readContext = (textarea) => {
    const card = textarea.closest('section');
    const selects = card ? Array.from(card.querySelectorAll('select')) : [];
    const valueAt = (index, fallback) => selects[index]?.value || fallback;
    const vocalButton = card?.querySelector('button[data-sonara-vocal-mode][aria-pressed="true"]');
    const languageSelect = document.getElementById('sonara-vocal-language');
    const bpmInput = card?.querySelector('input[aria-label="BPM preferiti"]');
    const titleInput = card?.querySelector('input[placeholder="Track title"]');
    const language = languageSelect?.value || 'it';
    return {
      language,
      languageName: languageNames[language] || language,
      genreFamily: valueAt(0, 'Electronic / Dance'),
      genre: valueAt(1, 'House'),
      subgenre: valueAt(2, valueAt(1, 'House')),
      mood: valueAt(3, 'Authentic'),
      vocalMode: vocalButton?.dataset?.sonaraVocalMode || (textarea.disabled ? 'instrumental' : 'male'),
      songDurationSec: Number(valueAt(5, '180')) || 180,
      bpm: Number(bpmInput?.value || 124) || 124,
      title: titleInput?.value || ''
    };
  };
  const setButtonState = (button, textarea, busy = false) => {
    const context = readContext(textarea);
    const blocked = textarea.disabled || context.vocalMode === 'instrumental';
    button.disabled = busy || blocked;
    button.style.opacity = button.disabled ? '0.45' : '1';
    button.style.cursor = button.disabled ? 'not-allowed' : 'pointer';
  };
  const refreshLengthButtons = () => {
    const group = document.getElementById(LENGTH_ID);
    if (!group) return;
    group.querySelectorAll('button[data-lyrics-length]').forEach(button => {
      const active = button.dataset.lyricsLength === selectedLength;
      button.setAttribute('aria-pressed', String(active));
      button.style.background = active ? 'rgba(168,85,247,.30)' : 'rgba(2,6,23,.92)';
      button.style.color = active ? '#f3e8ff' : '#94a3b8';
      button.style.borderColor = active ? 'rgba(168,85,247,.65)' : 'rgba(71,85,105,.75)';
    });
  };
  const createLengthGroup = () => {
    const group = document.createElement('span');
    group.id = LENGTH_ID;
    group.setAttribute('aria-label', 'Lunghezza testo');
    Object.assign(group.style, { display: 'inline-flex', alignItems: 'center', gap: '3px' });
    Object.entries(LENGTHS).forEach(([value, config]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.lyricsLength = value;
      button.textContent = config.label;
      Object.assign(button.style, {
        minHeight: '32px', padding: '6px 9px', borderRadius: '8px', border: '1px solid rgba(71,85,105,.75)',
        background: 'rgba(2,6,23,.92)', color: '#94a3b8', fontSize: '9px', fontWeight: '900', letterSpacing: '.06em', cursor: 'pointer'
      });
      button.addEventListener('click', () => {
        selectedLength = value;
        try { localStorage.setItem(STORAGE_KEY, value); } catch {}
        refreshLengthButtons();
      });
      group.appendChild(button);
    });
    return group;
  };
  const createButton = textarea => {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.textContent = '✨ Testo Intelligente';
    Object.assign(button.style, {
      display: 'inline-flex', alignItems: 'center', minHeight: '32px', padding: '6px 12px', borderRadius: '8px',
      border: '1px solid rgba(168,85,247,.55)', background: 'linear-gradient(135deg, rgba(126,34,206,.28), rgba(217,70,239,.16))',
      color: '#f3e8ff', fontSize: '10px', fontWeight: '900', letterSpacing: '.06em', cursor: 'pointer', whiteSpace: 'nowrap'
    });
    button.addEventListener('click', async () => {
      if (button.disabled) return;
      const context = readContext(textarea);
      if (context.vocalMode === 'instrumental') return;
      setButtonState(button, textarea, true);
      button.textContent = '✨ CREAZIONE...';
      try {
        const lengthConfig = LENGTHS[selectedLength] || LENGTHS.normal;
        const response = await fetch('/api/lyrics', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...context,
            durationSec: lengthConfig.durationSec,
            lyricsLength: selectedLength,
            variant: Date.now() + Math.floor(Math.random() * 1000000),
            smartRandom: true
          })
        });
        if (!response.ok) throw new Error('Lyrics service HTTP ' + response.status);
        const payload = await response.json();
        const nextLyrics = String(payload?.lyrics || '').trim();
        if (!nextLyrics) throw new Error('Lyrics service returned empty content');
        setLyricsValue(textarea, nextLyrics);
        textarea.focus();
        button.textContent = '✓ TESTO CREATO';
      } catch (error) {
        console.error('[SONARA][Testo Intelligente Edge]', error);
        button.textContent = '⚠ RIPROVA';
      }
      window.setTimeout(() => {
        button.textContent = '✨ Testo Intelligente';
        setButtonState(button, textarea, false);
      }, 1300);
    });
    return button;
  };
  const mount = () => {
    const textarea = document.getElementById('sonara-lyrics');
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    let button = document.getElementById(BUTTON_ID);
    let group = document.getElementById(LENGTH_ID);
    if (!(button instanceof HTMLButtonElement)) button = createButton(textarea);
    if (!(group instanceof HTMLElement)) group = createLengthGroup();
    if (!button.isConnected || !group.isConnected) {
      const toolbar = textarea.previousElementSibling?.lastElementChild;
      const wrapper = document.createElement('span');
      wrapper.setAttribute('data-sonara-intelligent-lyrics-edge-host', 'true');
      Object.assign(wrapper.style, { display: 'inline-flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' });
      wrapper.appendChild(group);
      wrapper.appendChild(button);
      if (toolbar instanceof HTMLElement) toolbar.prepend(wrapper);
      else if (textarea.parentElement) textarea.parentElement.insertBefore(wrapper, textarea);
    }
    refreshLengthButtons();
    setButtonState(button, textarea, false);
  };
  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-pressed'] });
  window.addEventListener('pageshow', mount);
})();`;

const VOCAL_CHARACTER_EDGE_SCRIPT = String.raw`(() => {
  const ROOT_ID = 'sonara-vocal-character-edge';
  const STORAGE_KEY = 'sonara-vocal-character';
  const GENERATE_PATH = '/api/billing/generate';
  const LOCK_PREFIX = 'VOCAL CHARACTER LOCK —';
  const PROFILES = {
    warm: {
      label: 'CALDA', timbre: 'WARM', description: 'Corposa, morbida e naturale',
      instruction: 'Use a genuinely warm WARM vocal timbre with rounded chest resonance, soft upper mids, intimate but clear microphone proximity, natural breath and human dynamics. Keep the voice full and smooth; avoid thin, metallic, nasal or harsh coloration.'
    },
    sensual: {
      label: 'SENSUALE', timbre: 'BREATHY', description: 'Intima, vellutata e ariosa',
      instruction: 'Use a sensual BREATHY vocal timbre with intimate close-mic delivery, silky attacks, controlled air, soft phrasing and subtle dynamic movement while preserving clear intelligibility. Keep it tasteful and human; do not turn the performance into whisper-only vocals or exaggerated breath noise.'
    },
    romantic: {
      label: 'ROMANTICA', timbre: 'WARM', description: 'Dolce, emotiva e legata',
      instruction: 'Use a romantic WARM and highly expressive vocal character with tender legato, emotional phrasing, smooth register transitions, tasteful vibrato and intimate dynamics. The delivery must feel sincere and emotionally connected to the lyrics; avoid theatrical over-singing or artificial melodrama.'
    },
    studio: {
      label: 'STUDIO', timbre: 'CLEAN', description: 'Pulita, precisa e professionale',
      instruction: 'Use a CLEAN professional studio vocal character: pristine close-mic capture, precise diction, stable pitch, controlled sibilance, balanced dynamics, low noise and release-ready presence. Preserve natural human articulation and expression while avoiding synthetic artifacts, phasey doubling or brittle processing.'
    }
  };
  let selected = (() => {
    try { const saved = localStorage.getItem(STORAGE_KEY); return PROFILES[saved] ? saved : 'studio'; }
    catch { return 'studio'; }
  })();
  const getVocalMode = textarea => {
    const selectedButton = textarea?.closest('section')?.querySelector('button[data-sonara-vocal-mode][aria-pressed="true"]');
    return selectedButton?.dataset?.sonaraVocalMode || (textarea?.disabled ? 'instrumental' : 'male');
  };
  const updateButton = button => {
    const profile = PROFILES[selected] || PROFILES.studio;
    button.textContent = '🎙 VOCE: ' + profile.label + ' ▾';
    button.title = profile.description + ' · ' + profile.timbre;
  };
  const makeMenu = button => {
    const menu = document.createElement('span');
    menu.setAttribute('data-sonara-vocal-character-menu', 'true');
    Object.assign(menu.style, {
      display: 'none', position: 'absolute', right: '0', top: '38px', zIndex: '1000', width: '245px',
      padding: '6px', borderRadius: '12px', border: '1px solid rgba(71,85,105,.9)', background: 'rgba(2,6,23,.98)',
      boxShadow: '0 16px 38px rgba(0,0,0,.55)'
    });
    Object.entries(PROFILES).forEach(([value, profile]) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.textContent = profile.label + ' — ' + profile.description;
      option.setAttribute('data-vocal-character', value);
      Object.assign(option.style, {
        display: 'block', width: '100%', padding: '9px 10px', border: '0', borderRadius: '8px',
        background: 'transparent', color: '#cbd5e1', textAlign: 'left', fontSize: '10px', fontWeight: '800', cursor: 'pointer'
      });
      option.addEventListener('mouseenter', () => { option.style.background = 'rgba(217,70,239,.12)'; option.style.color = '#fff'; });
      option.addEventListener('mouseleave', () => { option.style.background = 'transparent'; option.style.color = '#cbd5e1'; });
      option.addEventListener('click', () => {
        selected = value;
        try { localStorage.setItem(STORAGE_KEY, value); } catch {}
        updateButton(button);
        menu.style.display = 'none';
      });
      menu.appendChild(option);
    });
    return menu;
  };
  const mount = () => {
    const textarea = document.getElementById('sonara-lyrics');
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    const toolbar = textarea.previousElementSibling?.lastElementChild;
    if (!(toolbar instanceof HTMLElement)) return;
    let root = document.getElementById(ROOT_ID);
    if (!(root instanceof HTMLElement)) {
      root = document.createElement('span');
      root.id = ROOT_ID;
      Object.assign(root.style, { position: 'relative', display: 'inline-flex', alignItems: 'center' });
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('aria-label', 'Carattere voce');
      Object.assign(button.style, {
        minHeight: '32px', padding: '6px 10px', borderRadius: '8px', border: '1px solid rgba(217,70,239,.45)',
        background: 'rgba(217,70,239,.10)', color: '#fae8ff', fontSize: '10px', fontWeight: '900', letterSpacing: '.04em', cursor: 'pointer'
      });
      const menu = makeMenu(button);
      button.addEventListener('click', () => { menu.style.display = menu.style.display === 'none' ? 'block' : 'none'; });
      root.appendChild(button);
      root.appendChild(menu);
      toolbar.prepend(root);
      updateButton(button);
    }
    const button = root.querySelector('button[aria-label="Carattere voce"]');
    if (button instanceof HTMLButtonElement) {
      const disabled = textarea.disabled || getVocalMode(textarea) === 'instrumental';
      button.disabled = disabled;
      button.style.opacity = disabled ? '.42' : '1';
      button.style.cursor = disabled ? 'not-allowed' : 'pointer';
      if (disabled) {
        const menu = root.querySelector('[data-sonara-vocal-character-menu]');
        if (menu instanceof HTMLElement) menu.style.display = 'none';
      }
      updateButton(button);
    }
  };
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = String(init?.method || 'GET').toUpperCase();
      if ((url === GENERATE_PATH || url.includes(GENERATE_PATH + '?')) && method === 'POST' && typeof init?.body === 'string') {
        const payload = JSON.parse(init.body);
        const vocalMode = String(payload?.vocalMode || '').toLowerCase();
        if (payload && vocalMode !== 'instrumental') {
          const profile = PROFILES[selected] || PROFILES.studio;
          payload.vocalCharacter = selected;
          payload.vocalTimbre = profile.timbre;
          payload.vocalCharacterLabel = profile.label;
          if (typeof payload.prompt === 'string' && payload.prompt.trim()) {
            payload.prompt = payload.prompt.replace(/\n*VOCAL CHARACTER LOCK —[^\n]*\n[^\n]*/gi, '').trimEnd()
              + '\n\n' + LOCK_PREFIX + ' ' + profile.label + ' / ' + profile.timbre + '\n' + profile.instruction;
          }
          init = { ...init, body: JSON.stringify(payload) };
        }
      }
    } catch (error) {
      console.error('[SONARA][Vocal Character Edge]', error);
    }
    return originalFetch(input, init);
  };
  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled', 'aria-pressed'] });
  window.addEventListener('pageshow', mount);
})();`;

function isEngineRequest(url) {
  return ENGINE_PATHS.some(prefix => url.pathname.startsWith(prefix));
}

function scriptResponse(body, feature) {
  return new Response(body, {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-sonara-edge-feature': feature
    }
  });
}

async function proxyWeb(request) {
  const incoming = new URL(request.url);
  const upstream = new URL(incoming.pathname + incoming.search, VERCEL_WEB_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('content-length');
  headers.set('x-sonara-edge-proxy', 'universal-taxonomy-lock-v14');
  const init = { method: request.method, headers, redirect: 'manual' };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;
  const response = await fetch(upstream.toString(), init);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('x-sonara-edge-proxy', 'universal-taxonomy-lock-v14');
  responseHeaders.delete('x-sonara-taxonomy-hotfix');

  if (request.method === 'GET' && (response.headers.get('content-type') || '').includes('text/html')) {
    responseHeaders.set('cache-control', 'no-store, max-age=0');
    responseHeaders.delete('content-length');
    const proxied = new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
    return new HTMLRewriter().on('body', {
      element(element) {
        element.append(`<script src="${EDGE_LYRICS_SCRIPT_PATH}?v=2" defer></script>`, { html: true });
        element.append(`<script src="${EDGE_VOCAL_SCRIPT_PATH}?v=1" defer></script>`, { html: true });
      }
    }).transform(proxied);
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (WEB_HOSTS.has(url.hostname) && url.pathname === EDGE_LYRICS_SCRIPT_PATH) {
      return scriptResponse(INTELLIGENT_LYRICS_EDGE_SCRIPT, 'testo-intelligente-v2-lengths');
    }
    if (WEB_HOSTS.has(url.hostname) && url.pathname === EDGE_VOCAL_SCRIPT_PATH) {
      return scriptResponse(VOCAL_CHARACTER_EDGE_SCRIPT, 'vocal-character-v1');
    }
    if (WEB_HOSTS.has(url.hostname) && !isEngineRequest(url)) return proxyWeb(request);
    return sonaraEngine.fetch(request, env, ctx);
  }
};
