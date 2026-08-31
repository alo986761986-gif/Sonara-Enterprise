import runtime, { SonaraJobState } from './sonara-molab-xl-router.mjs';
import { SonaraAuthStore, handleSonaraNativeAuth } from './sonara-native-auth.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-ab-player-playback-edge-v2';
const AUTH_VERSION = 'sonara-native-auth-v2';

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
  });
};
const schedule=()=>{if(!scheduled){scheduled=true;queueMicrotask(force);}setTimeout(force,60);setTimeout(force,220);setTimeout(force,700);};
const start=()=>{schedule();new MutationObserver(schedule).observe(document.body||document.documentElement,{childList:true,subtree:true});window.addEventListener('resize',schedule);setTimeout(force,1500);};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();</script>`;

const AUTH_EMAIL_ONLY_SCRIPT = `<script id="sonara-native-auth-v2-ui">(()=>{
if(window.__sonaraNativeAuthUiV2)return;
window.__sonaraNativeAuthUiV2=true;
const clean=()=>{
  document.documentElement.setAttribute('data-sonara-auth-mode','native-email-password');
  document.querySelectorAll('button,a,[role="button"]').forEach(node=>{
    const text=String(node.textContent||'').trim();
    const aria=String(node.getAttribute('aria-label')||'');
    const title=String(node.getAttribute('title')||'');
    if(/google/i.test(text)||/google/i.test(aria)||/google/i.test(title)) node.remove();
  });
};
const start=()=>{clean();new MutationObserver(clean).observe(document.body||document.documentElement,{childList:true,subtree:true});setTimeout(clean,700);};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();</script>`;

function withVersion(response) {
  const headers = new Headers(response.headers);
  headers.set('x-sonara-ab-player-fix', VERSION);
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
  headers.set('x-sonara-auth-edge', AUTH_VERSION);
  const safe = new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  return new HTMLRewriter().on('head', {
    element(element) {
      element.append(AUTH_EMAIL_ONLY_SCRIPT, { html: true });
      element.append(AB_VISIBILITY_SCRIPT, { html: true });
    }
  }).transform(safe);
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const publicHost = url.hostname === 'sonaraenterprise.com' || url.hostname === 'www.sonaraenterprise.com';

    if (
      publicHost && (
        url.pathname.startsWith('/api/sonara-auth/') ||
        url.pathname === '/api/billing/status' ||
        url.pathname === '/api/video/status'
      )
    ) {
      const authResponse = await handleSonaraNativeAuth(request, env);
      if (authResponse) return authResponse;
    }

    const response = await runtime.fetch(request, env, ctx);
    if (!publicHost) return response;
    if (request.method === 'GET') return inject(response);
    if (request.method === 'HEAD') return withVersion(response);
    return response;
  }
};