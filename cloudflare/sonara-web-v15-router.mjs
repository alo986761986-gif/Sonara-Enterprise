import webRuntime from './sonara-web-generator-stability.mjs';
import engineV15 from './sonara-engine-v15-authoritative-prompt.mjs';
import { isVideoApiRequest, recoverVideoApi } from './sonara-video-api-recovery.mjs';

const API_HOST = 'api.sonaraenterprise.com';

const VIDEO_PROMPT_EDGE_CONTROLS = String.raw`(() => {
  if (window.__sonaraVideoPromptEdgeControlsV1) return;
  window.__sonaraVideoPromptEdgeControlsV1 = true;

  const subjects = [
    'Una vocalist magnetica su un rooftop bagnato dalla pioggia sopra una citta luminosa',
    'Un ballerino solitario in un enorme spazio brutalista al blue hour',
    'Un duo elettronico underground dentro una centrale industriale abbandonata',
    'Una corsa notturna cinematografica attraverso una metropoli futuristica'
  ];
  const cameras = [
    'camera orbitale lenta, dolly cinematografico e close-up controllati',
    'steadycam immersiva, travelling laterale e profondita di campo anamorfica',
    'drone establishing shot, push-in progressivo e dettagli macro ritmici',
    'handheld elegante, movimenti fluidi e transizioni motivate dal soggetto'
  ];
  const moods = [
    'luce volumetrica, contrasto profondo, atmosfera dark premium',
    'neon cinematico, foschia sottile, riflessi realistici e texture filmiche',
    'golden hour drammatica, controluce, lens flare discreto e pelle naturale',
    'notte blu profonda, practical lights, ombre morbide e look editoriale'
  ];
  let variant = 0;

  const setValue = (textarea, value) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    if (setter) setter.call(textarea, value);
    else textarea.value = value;
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
    textarea.focus();
  };

  const isVideoPrompt = textarea => {
    if (!(textarea instanceof HTMLTextAreaElement)) return false;
    const placeholder = String(textarea.getAttribute('placeholder') || '').toLowerCase();
    if (placeholder.includes('cantante') && placeholder.includes('cinematograf')) return true;
    let node = textarea.parentElement;
    for (let depth = 0; depth < 5 && node; depth += 1, node = node.parentElement) {
      const text = String(node.textContent || '').toLowerCase();
      if (text.includes('descrivi il video che vuoi creare') || text.includes('ai director')) return true;
    }
    return false;
  };

  const makeButton = (label, title, accent) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.title = title;
    Object.assign(button.style, {
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: '34px',
      padding: '8px 12px', borderRadius: '11px', border: '1px solid ' + accent,
      background: 'rgba(255,255,255,.035)', color: '#e2e8f0', fontSize: '10px',
      fontWeight: '900', letterSpacing: '.035em', cursor: 'pointer', transition: 'all .18s ease'
    });
    return button;
  };

  const randomPrompt = () => {
    variant += 1;
    return [
      subjects[variant % subjects.length] + '.',
      cameras[(variant + 1) % cameras.length] + '.',
      moods[(variant + 2) % moods.length] + '.',
      'Regia da music video internazionale, continuita visiva tra le scene, performance naturale, fisica credibile.',
      'Montaggio sincronizzato musicalmente: intro atmosferica, sviluppo dinamico, climax visivo e chiusura memorabile.',
      'Qualita cinematografica premium, dettagli realistici, nessun testo o watermark nel fotogramma.'
    ].join(' ');
  };

  const intelligentPrompt = current => {
    const base = String(current || '').trim() || randomPrompt();
    if (base.includes('[SONARA VIDEO INTELLIGENCE]')) return base;
    return base + '\n\n[SONARA VIDEO INTELLIGENCE]\n' +
      'Regia: costruisci una progressione cinematografica coerente con establishing shot, medium shot, close-up e reveal finale. ' +
      'Camera: movimenti motivati, stabilizzati e continui; evita salti spaziali casuali. ' +
      'Luce: mantieni palette, direzione e contrasto coerenti tra tutte le scene. ' +
      'Musica e montaggio: sincronizza cambi scena, energia, gesti e transizioni alla struttura musicale; intro, build, drop/climax e outro. ' +
      'Continuita: conserva identita del soggetto, abiti, ambiente, props e stile fotografico. ' +
      'Output: look da videoclip internazionale premium, realistico, cinematografico, senza testo o watermark.';
  };

  const mount = () => {
    for (const textarea of document.querySelectorAll('textarea')) {
      if (!isVideoPrompt(textarea) || textarea.dataset.sonaraVideoEdgeControls === 'true') continue;
      const existingText = String(textarea.parentElement?.textContent || '').toUpperCase();
      if (existingText.includes('RANDOM') && existingText.includes('INTELLIGENTE')) {
        textarea.dataset.sonaraVideoEdgeControls = 'native';
        continue;
      }

      textarea.dataset.sonaraVideoEdgeControls = 'true';
      const bar = document.createElement('div');
      bar.dataset.sonaraVideoPromptEdgeBar = 'true';
      Object.assign(bar.style, { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '10px', alignItems: 'center' });

      const clear = makeButton('✕  CANCELLA', 'Cancella tutto il prompt', 'rgba(251,113,133,.28)');
      const random = makeButton('↻  RANDOM', 'Genera un prompt video professionale casuale', 'rgba(232,121,249,.30)');
      const smart = makeButton('✦  INTELLIGENTE', 'Ottimizza regia, musica, montaggio e continuita', 'rgba(34,211,238,.32)');

      clear.addEventListener('click', () => setValue(textarea, ''));
      random.addEventListener('click', () => setValue(textarea, randomPrompt()));
      smart.addEventListener('click', () => {
        setValue(textarea, intelligentPrompt(textarea.value));
        smart.textContent = '✓  OTTIMIZZATO';
      });

      bar.append(clear, random, smart);
      textarea.parentElement?.insertBefore(bar, textarea);
    }
  };

  mount();
  const observer = new MutationObserver(mount);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
})();`;

async function injectVideoPromptEdgeControls(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('__sonaraVideoPromptEdgeControlsV1')) {
    return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const script = `<script>${VIDEO_PROMPT_EDGE_CONTROLS}</script>`;
  const transformed = html.includes('</body>') ? html.replace('</body>', `${script}</body>`) : `${html}${script}`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-video-ui-edge', 'prompt-controls-v1');
  return new Response(transformed, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.hostname !== API_HOST && isVideoApiRequest(request)) {
      return recoverVideoApi(request);
    }
    if (url.hostname === API_HOST) {
      return engineV15.fetch(request, env, ctx);
    }
    const response = await webRuntime.fetch(request, env, ctx);
    if (request.method === 'GET' && url.pathname !== '/api' && !url.pathname.startsWith('/api/')) {
      return injectVideoPromptEdgeControls(response);
    }
    return response;
  }
};
