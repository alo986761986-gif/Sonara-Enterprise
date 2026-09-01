import runtime, { SonaraJobState, SonaraAuthStore } from './sonara-studio-key-pitch-guard.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-studio-native-pitch-bridge-1';
const BRIDGE_CSS = String.raw`
#sonara-native-studio-pitch-host{margin-top:14px;padding-top:14px;border-top:1px solid rgba(255,255,255,.07)}
#sonara-native-studio-pitch-host #sonara-studio-pitch-key-pro{margin-top:0;padding-top:0;border-top:0}
#sonara-native-studio-pitch-host #sonara-studio-pitch-key-pro .spk-grid{grid-template-columns:1fr}
#sonara-native-studio-pitch-host #sonara-studio-pitch-key-pro .spk-actions{grid-template-columns:1fr}
#sonara-native-studio-pitch-host #sonara-studio-pitch-key-pro .spk-title{align-items:flex-start;flex-direction:column}
`;

const BRIDGE_JS = String.raw`(() => {
  if (window.__sonaraNativeStudioPitchBridgeV1) return;
  window.__sonaraNativeStudioPitchBridgeV1 = true;

  const text = el => String(el?.textContent || '').replace(/\s+/g,' ').trim();
  const buttons = () => Array.from(document.querySelectorAll('button'));

  function findNativeAside(){
    const mix = buttons().find(button => /^Mix\s*\/\s*Master$/i.test(text(button)));
    if (mix?.closest('aside')) return mix.closest('aside');
    const market = buttons().find(button => /MUSIC MARKET/i.test(text(button)));
    if (market?.closest('aside')) return market.closest('aside');
    const audio = buttons().find(button => /^AUDIO$/i.test(text(button)));
    if (audio?.closest('aside')) return audio.closest('aside');
    return null;
  }

  function ensureHost(){
    const aside = findNativeAside();
    if (!aside) return false;
    let host = document.querySelector('#sonara-native-studio-pitch-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'sonara-native-studio-pitch-host';
      host.setAttribute('data-sonara-studio-pro', 'pitch-key');
      const compat = document.createElement('div');
      compat.id = 'sonara-intelligence-box';
      compat.setAttribute('data-sonara-native-bridge', 'pitch-key');
      host.appendChild(compat);
      aside.appendChild(host);
    } else if (!aside.contains(host)) {
      aside.appendChild(host);
    }

    const panel = document.querySelector('#sonara-studio-pitch-key-pro');
    if (panel && !host.contains(panel)) host.appendChild(panel);
    return true;
  }

  function pulse(){
    if (!ensureHost()) return;
    setTimeout(() => {
      const host = document.querySelector('#sonara-native-studio-pitch-host');
      const panel = document.querySelector('#sonara-studio-pitch-key-pro');
      if (host && panel && !host.contains(panel)) host.appendChild(panel);
    }, 120);
  }

  pulse();
  const observer = new MutationObserver(pulse);
  observer.observe(document.documentElement, { childList:true, subtree:true });
  window.addEventListener('hashchange', () => setTimeout(pulse, 80));
  window.addEventListener('popstate', () => setTimeout(pulse, 80));
})();`;

async function injectBridge(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('sonara-studio-native-pitch-bridge-v1')) {
    return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
  }
  const injection = `<style id="sonara-studio-native-pitch-bridge-v1-style">${BRIDGE_CSS}</style><script id="sonara-studio-native-pitch-bridge-v1">${BRIDGE_JS.replace(/<\/script/gi,'<\\/script')}</script>`;
  const next = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${injection}</body>`) : `${html}${injection}`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('x-sonara-studio-native-pitch-bridge', VERSION);
  return new Response(next, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const response = await runtime.fetch(request, env, ctx);
    if (request.method !== 'GET' || response.status >= 400) return response;
    return injectBridge(response);
  }
};
