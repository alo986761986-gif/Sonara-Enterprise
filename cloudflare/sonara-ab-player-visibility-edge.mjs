import runtime, { SonaraJobState } from './sonara-molab-xl-router.mjs';

export { SonaraJobState };

const VERSION = 'sonara-ab-player-playback-edge-v2';
const AUTH_VERSION = 'sonara-auth-email-password-only-v1';

const AB_VISIBILITY_SCRIPT = `<script id="sonara-ab-player-playback-edge-v2">(()=>{
if(window.__sonaraABPlayerPlaybackEdgeV2)return;
window.__sonaraABPlayerPlaybackEdgeV2=true;
window.__sonaraAudioGestureUnlockV1=true;
let scheduled=false;
const force=()=>{
  scheduled=false;
  const hosts=document.querySelectorAll('[data-sonara-eleven-generator-host],[data-sonara-dual-generator-host]');
  hosts.forEach(host=>{
    host.setAttribute('data-sonara-dual-generator-host','true');
    host.setAttribute('data-sonara-creator-dual','true');
    let grid=host.querySelector('[data-sonara-creator-results="true"]');
    if(!grid){grid=[...host.querySelectorAll('div')].find(node=>[...node.children].some(child=>child.tagName==='ARTICLE'))||null;}
    if(!grid)return;
    grid.setAttribute('data-sonara-creator-results','true');
    grid.style.setProperty('display','grid','important');
    grid.style.setProperty('visibility','visible','important');
    grid.style.setProperty('opacity','1','important');
    grid.style.setProperty('pointer-events','auto','important');
    [...grid.children].filter(child=>child.tagName==='ARTICLE').forEach(article=>{
      article.style.setProperty('display','block','important');
      article.style.setProperty('visibility','visible','important');
      article.style.setProperty('opacity','1','important');
      article.style.setProperty('pointer-events','auto','important');
      const audio=article.querySelector('audio[data-sonara-custom-audio="true"]');
      if(audio){
        audio.controls=false;
        audio.playsInline=true;
        audio.preload='metadata';
        audio.style.setProperty('display','none','important');
        audio.style.setProperty('visibility','hidden','important');
        audio.style.setProperty('width','0','important');
        audio.style.setProperty('height','0','important');
        audio.style.setProperty('pointer-events','none','important');
      }
    });
  });
};
const schedule=()=>{if(!scheduled){scheduled=true;queueMicrotask(force);}setTimeout(force,60);setTimeout(force,220);setTimeout(force,700);};
const start=()=>{schedule();new MutationObserver(schedule).observe(document.body||document.documentElement,{childList:true,subtree:true});['sonara:billing-updated','sonara:generated-track-selected'].forEach(name=>window.addEventListener(name,schedule));window.addEventListener('resize',schedule);setTimeout(force,1500);setTimeout(force,3000);};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();</script>`;

const AUTH_EMAIL_ONLY_SCRIPT = `<script id="sonara-auth-email-password-only-v1">(()=>{
if(window.__sonaraAuthEmailPasswordOnlyV1)return;
window.__sonaraAuthEmailPasswordOnlyV1=true;
const google=/google/i;
const suspended=/consumer[^\n]*api-key|api-key[^\n]*suspend|has-been-suspended/i;
const clean=()=>{
  document.documentElement.setAttribute('data-sonara-auth-mode','email-password-only');
  document.querySelectorAll('button,a').forEach(node=>{
    const text=String(node.textContent||'').trim();
    const aria=String(node.getAttribute('aria-label')||'');
    const title=String(node.getAttribute('title')||'');
    if(google.test(text)||google.test(aria)||google.test(title)){
      const parent=node.parentElement;
      node.remove();
      if(parent&&parent.children.length===0&&/^(DIV|SECTION)$/.test(parent.tagName))parent.remove();
    }
  });
  document.querySelectorAll('div,p,span').forEach(node=>{
    const text=String(node.textContent||'').trim();
    if(suspended.test(text)&&node.children.length===0){
      node.textContent='Servizio di autenticazione temporaneamente non disponibile. Usa email e password; la configurazione Firebase e in aggiornamento.';
    }
    if((/^or$/i.test(text)||/^oppure$/i.test(text))&&node.children.length<=2){
      const around=node.parentElement?.textContent||'';
      if(google.test(around))node.remove();
    }
  });
};
let queued=false;
const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;clean();});setTimeout(clean,80);setTimeout(clean,300);};
const start=()=>{clean();new MutationObserver(schedule).observe(document.body||document.documentElement,{childList:true,subtree:true,characterData:true});setTimeout(clean,1000);setTimeout(clean,2500);};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();</script>`;

function withVersion(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-ab-player-fix', VERSION);
  headers.set('x-sonara-ab-playback-fix', 'native-react-v2');
  headers.set('x-sonara-auth-edge', AUTH_VERSION);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function inject(response) {
  const type = String(response.headers.get('content-type') || '').toLowerCase();
  if (!type.includes('text/html')) return withVersion(response);

  const headers = new Headers(response.headers);
  headers.delete('content-length');
  headers.delete('content-encoding');
  headers.set('cache-control', 'no-store, max-age=0');
  headers.set('x-sonara-ab-player-fix', VERSION);
  headers.set('x-sonara-ab-playback-fix', 'native-react-v2');
  headers.set('x-sonara-auth-edge', AUTH_VERSION);

  const safe = new Response(response.body, { status: response.status, statusText: response.statusText, headers });

  return new HTMLRewriter()
    .on('head', {
      element(element) {
        element.append(AUTH_EMAIL_ONLY_SCRIPT, { html: true });
        element.append(AB_VISIBILITY_SCRIPT, { html: true });
      }
    })
    .transform(safe);
}

export default {
  async fetch(request, env, ctx) {
    const response = await runtime.fetch(request, env, ctx);
    const url = new URL(request.url);
    const publicHost = url.hostname === 'sonaraenterprise.com' || url.hostname === 'www.sonaraenterprise.com';

    if (!publicHost) return response;
    if (request.method === 'GET') return inject(response);
    if (request.method === 'HEAD') return withVersion(response);
    return response;
  }
};
