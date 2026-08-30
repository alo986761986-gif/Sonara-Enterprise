import runtime from './sonara-studio-intelligence-router.mjs';
export { SonaraJobState } from './sonara-studio-intelligence-router.mjs';

const VERSION = 'sonara-studio-autopilot-v1';
const clean = value => String(value ?? '').trim();

const AUTOPILOT_CSS = String.raw`
#sonara-autopilot-toggle{display:flex;align-items:center;gap:8px;margin-top:10px;padding:9px 10px;border:1px solid rgba(52,211,153,.14);background:rgba(52,211,153,.05);border-radius:10px;color:#a7f3d0;font:800 10px/1.2 system-ui}#sonara-autopilot-toggle input{accent-color:#34d399}
`;

const AUTOPILOT_UI = String.raw`(() => {
  if (window.__sonaraStudioAutopilotV1) return;
  window.__sonaraStudioAutopilotV1 = true;
  const KEY = 'sonara.studio.autoRepair';
  const LAST = 'sonara.studio.autoRepair.last';
  if (localStorage.getItem(KEY) == null) localStorage.setItem(KEY, 'true');

  function mount(){
    const qualityPane = document.querySelector("#sonara-studio-ai-panel [data-pane='quality']");
    if (!qualityPane) { setTimeout(mount, 700); return; }
    if (document.getElementById('sonara-autopilot-toggle')) return;
    const label = document.createElement('label');
    label.id = 'sonara-autopilot-toggle';
    label.innerHTML = "<input type='checkbox'> Autopilot Quality · ripara automaticamente il miglior master se non supera il Judge";
    const box = label.querySelector('input');
    box.checked = localStorage.getItem(KEY) !== 'false';
    box.addEventListener('change', () => localStorage.setItem(KEY, box.checked ? 'true' : 'false'));
    qualityPane.appendChild(label);
  }

  function status(text){
    const box = document.getElementById('sonara-ai-status');
    if (!box) return;
    box.classList.add('sonara-show');
    box.textContent = text;
  }

  let busy = false;
  async function maybeRepair(){
    if (busy || localStorage.getItem(KEY) === 'false') return;
    const results = document.getElementById('sonara-ai-results');
    if (!results || !/Repair consigliato:\s*SI/i.test(results.textContent || '')) return;
    const firstCard = results.querySelector('.sonara-ai-output audio[src]')?.closest('.sonara-ai-output');
    const audio = firstCard?.querySelector('audio[src]');
    const use = firstCard?.querySelector('[data-use]');
    const repair = document.querySelector("#sonara-studio-ai-panel [data-action='repair']");
    const source = audio?.src || '';
    if (!source || !use || !repair) return;
    if (sessionStorage.getItem(LAST) === source) return;
    busy = true;
    sessionStorage.setItem(LAST, source);
    use.click();
    status('Autopilot Quality: il miglior candidato non ha superato il Judge. Avvio riparazione automatica…');
    await new Promise(resolve => setTimeout(resolve, 250));
    repair.click();
    setTimeout(() => { busy = false; }, 4000);
  }

  const observer = new MutationObserver(() => { void maybeRepair(); });
  function watch(){
    const results = document.getElementById('sonara-ai-results');
    if (!results) { setTimeout(watch, 700); return; }
    observer.observe(results, { childList:true, subtree:true, characterData:true });
    void maybeRepair();
  }
  mount();
  watch();
})();`;

async function inject(request, response) {
  if (request.method !== 'GET' || !response.ok) return response;
  const url = new URL(request.url);
  if (!['sonaraenterprise.com','www.sonaraenterprise.com'].includes(url.hostname)) return response;
  if (!clean(response.headers.get('content-type')).toLowerCase().includes('text/html')) return response;
  const html = await response.text();
  if (html.includes('sonara-studio-autopilot-v1')) return new Response(html, response);
  const injection = `<style id="sonara-studio-autopilot-v1-style">${AUTOPILOT_CSS}</style><script id="sonara-studio-autopilot-v1">${AUTOPILOT_UI.replace(/<\/script/gi,'<\\/script')}</script>`;
  const next = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${injection}</body>`) : `${html}${injection}`;
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.set('cache-control','no-store');
  headers.set('x-sonara-studio-autopilot',VERSION);
  return new Response(next,{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    let response = await runtime.fetch(request, env, ctx);
    if (response.ok && ['/api/health','/api/engine/ready','/api/molab/ready','/api/studio/capabilities'].includes(url.pathname)) {
      const type = clean(response.headers.get('content-type')).toLowerCase();
      if (type.includes('application/json')) {
        try {
          const data = await response.json();
          const headers = new Headers(response.headers);
          headers.delete('content-length');
          headers.set('content-type','application/json; charset=UTF-8');
          headers.set('x-sonara-studio-autopilot',VERSION);
          return new Response(JSON.stringify({
            ...data,
            qualityAutopilot: {
              version: VERSION,
              automaticRepair: true,
              bestCandidateFirst: true,
              oneRepairPassPerOutput: true,
              infiniteRepairLoopProtection: true
            }
          }),{status:response.status,statusText:response.statusText,headers});
        } catch {}
      }
    }
    return inject(request, response);
  }
};
