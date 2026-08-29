import onboardingRuntime from './sonara-onboarding-router.mjs';
import worldTempoRuntime from './sonara-world-tempo-router.mjs';
export { SonaraJobState } from './sonara-onboarding-router.mjs';

const WORLD_TEMPO_VERSION = 'sonara-world-tempo-v1';
const GENERATE_PATHS = new Set(['/api/billing/generate', '/api/engine/generate']);

const WORLD_TEMPO_CLIENT = `<script id="sonara-world-tempo-production-v1">(()=>{
if(window.__sonaraWorldTempoProductionV1)return;window.__sonaraWorldTempoProductionV1=true;
const PROFILE='/api/tempo-profile';
const originalFetch=window.fetch.bind(window);
const prompt=()=>document.getElementById('sonara-prompt');
const section=()=>prompt()?.closest('section')||null;
const bpmInput=()=>section()?.querySelector('input[aria-label="BPM preferiti"]')||null;
const selects=()=>section()?[...section().querySelectorAll('select')]:[];
const mode=()=>{const s=section(),b=bpmInput();return String(b?.dataset?.sonaraBpmMode||s?.dataset?.sonaraBpmMode||'manual').toLowerCase()==='auto'?'auto':'manual'};
const context=()=>{const a=selects();return{family:a[0]?.value||'Electronic / Dance',genre:a[1]?.value||'House',subgenre:a[2]?.value||a[1]?.value||'House',mood:a[3]?.value||'Authentic',prompt:String(prompt()?.value||'')}};
const profileUrl=c=>{const u=new URL(PROFILE,location.origin);Object.entries(c).forEach(([k,v])=>u.searchParams.set(k,String(v||'')));return u.toString()};
const setSilent=(el,value)=>{if(!el)return;const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')?.set;if(setter)setter.call(el,String(value));else el.value=String(value)};
const getProfile=async c=>{const r=await originalFetch(profileUrl(c),{cache:'no-store',headers:{'x-sonara-tempo-probe':WORLD_TEMPO_VERSION}});if(!r.ok)throw new Error('tempo-profile-'+r.status);return r.json()};
let timer=0,seq=0;
const sync=async()=>{if(mode()!=='auto')return;const id=++seq,c=context();try{const p=await getProfile(c);if(id!==seq||mode()!=='auto')return;const b=bpmInput();setSilent(b,p.bpm);if(b){b.dataset.sonaraAutoBpm=String(p.bpm);b.dataset.sonaraAutoBpmReason='World taxonomy: '+p.family+' > '+p.genre+' > '+p.subgenre+' · '+p.minBpm+'-'+p.maxBpm+' BPM';b.dataset.sonaraWorldTempo='true'}window.dispatchEvent(new CustomEvent('sonara:world-tempo-profile',{detail:p}))}catch(e){console.warn('[SONARA][World Tempo Auto]',e instanceof Error?e.message:String(e))}};
const schedule=()=>{clearTimeout(timer);timer=setTimeout(sync,220)};
window.fetch=async(input,init)=>{const req=input instanceof Request?input:new Request(input,init);let u;try{u=new URL(req.url,location.origin)}catch{return originalFetch(input,init)}if(req.method.toUpperCase()==='POST'&&(u.pathname==='/api/billing/generate'||u.pathname==='/api/engine/generate')&&String(req.headers.get('content-type')||'').toLowerCase().includes('application/json')){try{const body=await req.clone().json(),c=context(),m=mode(),headers=new Headers(req.headers);body.sonaraBpmMode=m;body.sonaraSelectedFamily=c.family;body.sonaraSelectedGenre=c.genre;body.sonaraSelectedSubgenre=c.subgenre;body.sonaraSelectedMood=c.mood;headers.set('x-sonara-bpm-mode',m);headers.set('x-sonara-world-tempo',WORLD_TEMPO_VERSION);if(m==='auto'){const p=await getProfile(c);body.bpm=p.bpm;body.requestedBpm=p.bpm;body.targetBpm=p.bpm;body.preferredBpm=p.bpm;body.sonaraAutoTempoProfile=p;setSilent(bpmInput(),p.bpm)}headers.delete('content-length');headers.set('content-type','application/json');return originalFetch(new Request(req.url,{method:req.method,headers,body:JSON.stringify(body),credentials:req.credentials,cache:'no-store',redirect:req.redirect}))}catch(e){console.warn('[SONARA][World Tempo Request]',e instanceof Error?e.message:String(e))}}return originalFetch(input,init)};
document.addEventListener('input',e=>{if(e.target===prompt()||e.target instanceof HTMLSelectElement)schedule()},true);
document.addEventListener('change',e=>{if(e.target===prompt()||e.target instanceof HTMLSelectElement||e.target===bpmInput())schedule()},true);
new MutationObserver(schedule).observe(document.documentElement,{childList:true,subtree:true});
[250,700,1400,2400].forEach(ms=>setTimeout(schedule,ms));
})();</script>`;

function withTempoHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-tempo-taxonomy', WORLD_TEMPO_VERSION);
  headers.set('x-sonara-production-router', 'world-tempo-v1');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function injectTempoClient(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return withTempoHeaders(response);
  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-tempo-taxonomy', WORLD_TEMPO_VERSION);
  headers.set('x-sonara-production-router', 'world-tempo-v1');
  const safe = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter().on('head', { element(el) { el.append(WORLD_TEMPO_CLIENT, { html: true }); } }).transform(safe);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if ((request.method === 'GET' || request.method === 'HEAD') && url.pathname === '/api/tempo-profile') {
      return withTempoHeaders(await worldTempoRuntime.fetch(request, env, ctx));
    }
    if (request.method === 'POST' && GENERATE_PATHS.has(url.pathname)) {
      return withTempoHeaders(await worldTempoRuntime.fetch(request, env, ctx));
    }
    const response = await onboardingRuntime.fetch(request, env, ctx);
    const publicHost = url.hostname === 'sonaraenterprise.com' || url.hostname === 'www.sonaraenterprise.com';
    if (publicHost && request.method === 'GET') return injectTempoClient(response);
    return withTempoHeaders(response);
  }
};
