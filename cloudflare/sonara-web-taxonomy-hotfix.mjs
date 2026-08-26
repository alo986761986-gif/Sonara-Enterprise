import sonaraEngine from './sonara-engine-v14-universal-taxonomy-lock.mjs';

const VERCEL_WEB_ORIGIN = 'https://sonara-enterprise-sonaramusicai86-2765s-projects.vercel.app';
const WEB_HOSTS = new Set(['sonaraenterprise.com', 'www.sonaraenterprise.com']);
const EDGE_LYRICS_SCRIPT_PATH = '/sonara-intelligent-lyrics-edge.js';
const ENGINE_PATHS = [
  '/api/music/job/',
  '/api/modal/audio',
  '/api/engine/'
];

const INTELLIGENT_LYRICS_EDGE_SCRIPT = String.raw`(() => {
  const BUTTON_ID = 'sonara-testo-intelligente-edge';
  const BUTTON_TEXT = 'Testo Intelligente';

  const languageNames = {
    it: 'Italiano', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch',
    pt: 'Português', nap: 'Napulitano', ja: '日本語', ko: '한국어', zh: '中文',
    ar: 'العربية', hi: 'हिन्दी', ru: 'Русский'
  };

  const setLyricsValue = (textarea, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(textarea, value);
    else textarea.value = value;
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
      durationSec: Number(valueAt(5, '180')) || 180,
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
    button.title = blocked
      ? 'Seleziona prima una voce'
      : 'Crea un testo intelligente professionale coerente con genere, atmosfera, BPM, durata e lingua';
  };

  const createButton = (textarea) => {
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.type = 'button';
    button.setAttribute('aria-label', BUTTON_TEXT);
    button.textContent = '✨ ' + BUTTON_TEXT;
    Object.assign(button.style, {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '6px',
      minHeight: '32px',
      padding: '6px 12px',
      borderRadius: '8px',
      border: '1px solid rgba(168,85,247,.55)',
      background: 'linear-gradient(135deg, rgba(126,34,206,.28), rgba(217,70,239,.16))',
      color: '#f3e8ff',
      fontSize: '10px',
      fontWeight: '900',
      letterSpacing: '.06em',
      whiteSpace: 'nowrap',
      boxShadow: '0 0 0 1px rgba(168,85,247,.08) inset'
    });

    button.addEventListener('mouseenter', () => {
      if (!button.disabled) button.style.borderColor = 'rgba(232,121,249,.9)';
    });
    button.addEventListener('mouseleave', () => {
      button.style.borderColor = 'rgba(168,85,247,.55)';
    });

    button.addEventListener('click', async () => {
      if (button.disabled) return;
      const context = readContext(textarea);
      if (context.vocalMode === 'instrumental') return;

      setButtonState(button, textarea, true);
      button.textContent = '✨ CREAZIONE...';
      try {
        const response = await fetch('/api/lyrics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...context,
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
      } catch (error) {
        console.error('[SONARA][Testo Intelligente Edge]', error);
        button.textContent = '⚠ RIPROVA';
        window.setTimeout(() => {
          button.textContent = '✨ ' + BUTTON_TEXT;
          setButtonState(button, textarea, false);
        }, 1600);
        return;
      }

      button.textContent = '✓ TESTO CREATO';
      window.setTimeout(() => {
        button.textContent = '✨ ' + BUTTON_TEXT;
        setButtonState(button, textarea, false);
      }, 1200);
    });

    return button;
  };

  const mount = () => {
    const textarea = document.getElementById('sonara-lyrics');
    if (!(textarea instanceof HTMLTextAreaElement)) return;

    let button = document.getElementById(BUTTON_ID);
    if (!(button instanceof HTMLButtonElement)) {
      button = createButton(textarea);
      const header = textarea.previousElementSibling;
      const toolbar = header?.lastElementChild;
      if (toolbar instanceof HTMLElement) {
        toolbar.prepend(button);
      } else if (textarea.parentElement) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'flex-end';
        row.style.marginBottom = '8px';
        row.appendChild(button);
        textarea.parentElement.insertBefore(row, textarea);
      }
    }

    setButtonState(button, textarea, false);
  };

  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-pressed']
  });
  window.addEventListener('pageshow', mount);
})();`;

function isEngineRequest(url) {
  return ENGINE_PATHS.some(prefix => url.pathname.startsWith(prefix));
}

function intelligentLyricsEdgeScriptResponse() {
  return new Response(INTELLIGENT_LYRICS_EDGE_SCRIPT, {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-sonara-edge-feature': 'testo-intelligente-v1'
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

  const init = {
    method: request.method,
    headers,
    redirect: 'manual'
  };
  if (request.method !== 'GET' && request.method !== 'HEAD') init.body = request.body;

  const response = await fetch(upstream.toString(), init);
  const responseHeaders = new Headers(response.headers);
  responseHeaders.set('x-sonara-edge-proxy', 'universal-taxonomy-lock-v14');
  responseHeaders.delete('x-sonara-taxonomy-hotfix');

  if (request.method === 'GET' && (response.headers.get('content-type') || '').includes('text/html')) {
    responseHeaders.set('cache-control', 'no-store, max-age=0');
    responseHeaders.delete('content-length');
    const proxied = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
    return new HTMLRewriter()
      .on('body', {
        element(element) {
          element.append(`<script src="${EDGE_LYRICS_SCRIPT_PATH}?v=1" defer></script>`, { html: true });
        }
      })
      .transform(proxied);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (WEB_HOSTS.has(url.hostname) && url.pathname === EDGE_LYRICS_SCRIPT_PATH) {
      return intelligentLyricsEdgeScriptResponse();
    }
    if (WEB_HOSTS.has(url.hostname) && !isEngineRequest(url)) {
      return proxyWeb(request);
    }
    return sonaraEngine.fetch(request, env, ctx);
  }
};
