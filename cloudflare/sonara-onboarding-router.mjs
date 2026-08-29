import brandRuntime from './sonara-brand-router.mjs';
export { SonaraJobState } from './sonara-brand-router.mjs';

const GUIDE_VERSION = 'creator-onboarding-v1';

const GUIDE_SCRIPT = `<script id="sonara-onboarding-guide-v1">(()=>{
const KEY='sonara-create-onboarding-v1-complete';
const steps=[
{id:'prompt',title:'Descrivi il brano',text:'Scrivi qui genere, atmosfera, strumenti, voce e BPM. Più sei preciso, più SONARA seguirà la tua idea.',selectors:['#sonara-prompt']},
{id:'style',title:'Scegli stile e strumenti',text:'Usa Styles e Universo Musica & Strumenti per aggiungere generi, timbri e strumenti.',selectors:['.sonara-global-suggestions-toggle','#sonara-world-suggestions-edge .swe-toggle','[data-sonara-suno-prompt="true"]']},
{id:'bpm',title:'Imposta il BPM',text:'Puoi lasciare Auto oppure usare Manuale. Se scrivi un BPM preciso nel prompt, quel valore ha priorità.',selectors:['[data-sonara-creator-block="bpm"]','input[aria-label="BPM preferiti"]']},
{id:'voice',title:'Voce e testo',text:'Scegli se il brano sarà strumentale o cantato. Se usi una voce, puoi scrivere o generare il testo.',selectors:['#sonara-lyrics','button[data-sonara-vocal-mode]']},
{id:'create',title:'Crea la musica',text:'Quando tutto è pronto premi Create. SONARA userà insieme prompt, stile, BPM, voce, durata e testo.',selectors:[]}
];
const section=()=>document.getElementById('sonara-prompt')?.closest('section')||null;
const createButton=s=>[...s.querySelectorAll('button')].find(b=>{const t=((b.textContent||'')+' '+(b.title||'')+' '+(b.getAttribute('aria-label')||'')).trim().toLowerCase();return t==='create'||t.includes('genera')||t.includes('generate music')})||null;
const target=(step)=>{const s=section();if(!s)return null;if(step.id==='create')return createButton(s);for(const q of step.selectors){const n=s.querySelector(q)||document.querySelector(q);if(n)return n}return null};
let index=-1,pop=null,current=null;
const cleanupFocus=()=>{if(current){current.removeAttribute('data-sonara-onboarding-focus');current=null}};
const close=()=>{pop?.remove();pop=null;cleanupFocus()};
const done=()=>{try{localStorage.setItem(KEY,'1')}catch{}close()};
const completed=()=>{try{return localStorage.getItem(KEY)==='1'}catch{return false}};
const esc=v=>String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const place=(node)=>{const r=node.getBoundingClientRect(),w=Math.min(300,innerWidth-20);let left=Math.max(10,Math.min(r.left,innerWidth-w-10));let top=r.bottom+10;const h=150;if(top+h>innerHeight-10&&r.top>h+10)top=r.top-h-10;return{left,top:Math.max(10,Math.min(top,innerHeight-h-10))}};
const show=()=>{close();if(completed())return;if(index<0||index>=steps.length){done();return}const step=steps[index],node=target(step);if(!node){index++;show();return}current=node;node.setAttribute('data-sonara-onboarding-focus','true');node.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});pop=document.createElement('aside');pop.className='sonara-onboarding-pop';pop.innerHTML='<div class="sog-step">'+(index+1)+' / '+steps.length+'</div><strong>'+esc(step.title)+'</strong><p>'+esc(step.text)+'</p><button type="button">OK</button>';document.body.appendChild(pop);const pos=place(node);pop.style.left=pos.left+'px';pop.style.top=pos.top+'px';pop.querySelector('button').onclick=()=>{index++;show()}};
const start=()=>{if(completed()||pop)return;const p=target(steps[0]);if(!p)return;index=0;show()};
const css=document.createElement('style');css.id='sonara-onboarding-guide-css-v1';css.textContent='.sonara-mini-help-tip,.sonara-suno-help-tip,.sonara-edge-help-tip,.sonara-inline-guide-tip,.sonara-guide-open-button{display:none!important}[data-sonara-onboarding-focus="true"]{position:relative!important;z-index:2147482000!important;outline:2px solid rgba(83,150,255,.78)!important;outline-offset:4px!important;border-radius:10px!important;box-shadow:0 0 0 6px rgba(61,128,231,.12)!important}.sonara-onboarding-pop{position:fixed;z-index:2147483600;width:min(300px,calc(100vw - 20px));padding:12px;border:1px solid rgba(255,255,255,.1);border-radius:13px;background:#14151a;color:#f7f8fb;box-shadow:0 16px 42px rgba(0,0,0,.48);font-family:Inter,system-ui,sans-serif}.sog-step{margin-bottom:5px;color:#7eaef4;font-size:9px;font-weight:900;letter-spacing:.08em}.sonara-onboarding-pop strong{display:block;font-size:12px;font-weight:900}.sonara-onboarding-pop p{margin:7px 0 10px;color:#b9c0cb;font-size:10.5px;line-height:1.45}.sonara-onboarding-pop button{display:block;width:100%;min-height:34px;border:1px solid rgba(91,151,246,.45);border-radius:9px;background:#236dc9;color:#fff;font-size:10.5px;font-weight:900;cursor:pointer}.sonara-onboarding-pop button:hover{background:#2d7de2}@media(max-width:760px){.sonara-onboarding-pop{width:min(280px,calc(100vw - 20px));padding:11px}}';document.head.appendChild(css);
const boot=()=>{document.querySelectorAll('.sonara-mini-help-tip,.sonara-suno-help-tip,.sonara-edge-help-tip,.sonara-mini-help-pop,.sonara-suno-help-popover,.sonara-edge-help-pop,.sonara-guide-backdrop').forEach(n=>n.remove());[300,800,1500,2600].forEach(ms=>setTimeout(start,ms));new MutationObserver(()=>{document.querySelectorAll('.sonara-mini-help-tip,.sonara-suno-help-tip,.sonara-edge-help-tip').forEach(n=>n.remove());if(!completed()&&!pop&&index<0)start()}).observe(document.body||document.documentElement,{childList:true,subtree:true})};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();</script>`;

function withGuideHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-guide', GUIDE_VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function injectGuide(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return withGuideHeaders(response);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-guide', GUIDE_VERSION);
  const safe = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter().on('head', { element(el) { el.append(GUIDE_SCRIPT, { html: true }); } }).transform(safe);
}

export default {
  async fetch(request, env, ctx) {
    const response = await brandRuntime.fetch(request, env, ctx);
    const url = new URL(request.url);
    const publicHost = url.hostname === 'sonaraenterprise.com' || url.hostname === 'www.sonaraenterprise.com';
    if (!publicHost) return response;
    if (request.method === 'GET') return injectGuide(response);
    if (request.method === 'HEAD') return withGuideHeaders(response);
    return response;
  }
};
