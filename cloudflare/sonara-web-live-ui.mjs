import sonaraWeb from './sonara-web-taxonomy-hotfix.mjs';

const VOCAL_SCRIPT_PATH = '/sonara-vocal-character-edge.js';
const MISSPELLED_HOSTS = new Map([
  ['sonaraenterprice.com', 'sonaraenterprise.com'],
  ['www.sonaraenterprice.com', 'www.sonaraenterprise.com']
]);

const VOCAL_BUTTON_SCRIPT = String.raw`(() => {
  if (window.__sonaraVocalButtonV2) return;
  window.__sonaraVocalButtonV2 = true;

  const ROOT_ID = 'sonara-vocal-character-visible';
  const STORAGE_KEY = 'sonara-vocal-character';
  const GENERATE_PATH = '/api/billing/generate';
  const PROFILES = {
    warm: {
      label: 'CALDA',
      timbre: 'WARM',
      description: 'Corposa, morbida e naturale',
      instruction: 'Use a genuinely warm WARM vocal timbre with rounded chest resonance, soft upper mids, intimate but clear microphone proximity, natural breath and human dynamics. Keep the voice full and smooth; avoid thin, metallic, nasal or harsh coloration.'
    },
    sensual: {
      label: 'SENSUALE',
      timbre: 'BREATHY',
      description: 'Intima, vellutata e ariosa',
      instruction: 'Use a sensual BREATHY vocal timbre with intimate close-mic delivery, silky attacks, controlled air, soft phrasing and subtle dynamic movement while preserving clear intelligibility. Keep it tasteful and human; avoid whisper-only vocals and exaggerated breath noise.'
    },
    romantic: {
      label: 'ROMANTICA',
      timbre: 'WARM',
      description: 'Dolce, emotiva e legata',
      instruction: 'Use a romantic WARM and highly expressive vocal character with tender legato, emotional phrasing, smooth register transitions, tasteful vibrato and intimate dynamics. The delivery must feel sincere and emotionally connected to the lyrics; avoid theatrical over-singing.'
    },
    studio: {
      label: 'STUDIO',
      timbre: 'CLEAN',
      description: 'Pulita, precisa e professionale',
      instruction: 'Use a CLEAN professional studio vocal character with pristine close-mic capture, precise diction, stable pitch, controlled sibilance, balanced dynamics, low noise and release-ready presence. Preserve natural human articulation and expression while avoiding synthetic artifacts.'
    }
  };

  let selected = (() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return PROFILES[saved] ? saved : 'studio';
    } catch {
      return 'studio';
    }
  })();

  const profile = () => PROFILES[selected] || PROFILES.studio;

  const updateButton = button => {
    const current = profile();
    button.textContent = '🎙 VOCE: ' + current.label + ' ▾';
    button.title = current.description + ' · ' + current.timbre;
  };

  const createControl = textarea => {
    const row = document.createElement('div');
    row.id = ROOT_ID;
    row.setAttribute('data-sonara-visible-vocal-control', 'true');
    Object.assign(row.style, {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: '10px',
      flexWrap: 'wrap',
      margin: '0 0 10px 0',
      padding: '10px 12px',
      borderRadius: '12px',
      border: '1px solid rgba(217,70,239,.30)',
      background: 'rgba(15,23,42,.72)'
    });

    const label = document.createElement('span');
    label.textContent = 'CARATTERE VOCE';
    Object.assign(label.style, {
      color: '#94a3b8',
      fontSize: '10px',
      fontWeight: '900',
      letterSpacing: '.14em'
    });

    const holder = document.createElement('span');
    Object.assign(holder.style, { position: 'relative', display: 'inline-flex' });

    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('aria-label', 'Scegli carattere voce');
    Object.assign(button.style, {
      minHeight: '36px',
      padding: '7px 12px',
      borderRadius: '9px',
      border: '1px solid rgba(217,70,239,.58)',
      background: 'linear-gradient(135deg, rgba(168,85,247,.22), rgba(217,70,239,.14))',
      color: '#fae8ff',
      fontSize: '10px',
      fontWeight: '900',
      letterSpacing: '.04em',
      cursor: 'pointer',
      whiteSpace: 'nowrap'
    });

    const menu = document.createElement('div');
    menu.setAttribute('role', 'listbox');
    Object.assign(menu.style, {
      display: 'none',
      position: 'absolute',
      right: '0',
      top: '42px',
      zIndex: '2147483000',
      width: '260px',
      padding: '6px',
      borderRadius: '12px',
      border: '1px solid rgba(71,85,105,.95)',
      background: 'rgba(2,6,23,.99)',
      boxShadow: '0 18px 44px rgba(0,0,0,.60)'
    });

    Object.entries(PROFILES).forEach(([value, item]) => {
      const option = document.createElement('button');
      option.type = 'button';
      option.setAttribute('role', 'option');
      option.textContent = item.label + ' — ' + item.description;
      Object.assign(option.style, {
        display: 'block',
        width: '100%',
        padding: '10px',
        margin: '0',
        border: '0',
        borderRadius: '8px',
        background: 'transparent',
        color: '#cbd5e1',
        textAlign: 'left',
        fontSize: '10px',
        fontWeight: '800',
        cursor: 'pointer'
      });
      option.addEventListener('click', () => {
        selected = value;
        try { localStorage.setItem(STORAGE_KEY, value); } catch {}
        updateButton(button);
        menu.style.display = 'none';
      });
      menu.appendChild(option);
    });

    button.addEventListener('click', () => {
      menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    });

    updateButton(button);
    holder.appendChild(button);
    holder.appendChild(menu);
    row.appendChild(label);
    row.appendChild(holder);

    textarea.parentElement?.insertBefore(row, textarea);
  };

  const mount = () => {
    const textarea = document.getElementById('sonara-lyrics');
    if (!(textarea instanceof HTMLTextAreaElement)) return;
    if (document.getElementById(ROOT_ID)) return;
    if (document.querySelector('[data-sonara-vocal-character-control="true"]')) return;
    createControl(textarea);
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
          const current = profile();
          payload.vocalCharacter = selected;
          payload.vocalTimbre = current.timbre;
          payload.vocalCharacterLabel = current.label;
          if (typeof payload.prompt === 'string' && payload.prompt.trim()) {
            payload.prompt = payload.prompt.replace(/\n*VOCAL CHARACTER LOCK —[^\n]*\n[^\n]*/gi, '').trimEnd()
              + '\n\nVOCAL CHARACTER LOCK — ' + current.label + ' / ' + current.timbre + '\n' + current.instruction;
          }
          init = { ...init, body: JSON.stringify(payload) };
        }
      }
    } catch (error) {
      console.error('[SONARA][Visible Vocal Button]', error);
    }
    return originalFetch(input, init);
  };

  mount();
  const timer = window.setInterval(mount, 700);
  window.addEventListener('pagehide', () => window.clearInterval(timer), { once: true });
})();`;

function vocalScriptResponse() {
  return new Response(VOCAL_BUTTON_SCRIPT, {
    status: 200,
    headers: {
      'content-type': 'application/javascript; charset=utf-8',
      'cache-control': 'no-store, max-age=0',
      'x-sonara-edge-feature': 'visible-vocal-character-button-v2'
    }
  });
}

function canonicalRequest(request, canonicalHost) {
  const url = new URL(request.url);
  url.hostname = canonicalHost;
  return new Request(url.toString(), request);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === VOCAL_SCRIPT_PATH) {
      return vocalScriptResponse();
    }

    const canonicalHost = MISSPELLED_HOSTS.get(url.hostname);
    if (canonicalHost) {
      return sonaraWeb.fetch(canonicalRequest(request, canonicalHost), env, ctx);
    }

    return sonaraWeb.fetch(request, env, ctx);
  }
};
