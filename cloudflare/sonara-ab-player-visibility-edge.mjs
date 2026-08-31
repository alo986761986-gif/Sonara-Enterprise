import runtime, { SonaraJobState } from './sonara-molab-xl-router.mjs';
import { SonaraAuthStore, handleSonaraNativeAuth } from './sonara-native-auth.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-ab-player-playback-edge-v4';
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
const studioRestore=async()=>{
  const match=String(location.hash||'').match(/^#sonara-studio-restore=([^&]+)$/i);
  if(!match)return;
  const code=decodeURIComponent(match[1]||'').trim();
  if(!code)return;
  try{
    const r=await fetch('/api/sonara-auth/restore-studio',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
    const p=await r.json().catch(()=>({}));
    if(r.ok&&p?.ok){
      history.replaceState({},'',location.pathname+location.search);
      window.dispatchEvent(new CustomEvent('sonara:billing-updated',{detail:p.billing||null}));
      setTimeout(()=>location.reload(),250);
    }
  }catch{}
};
const start=()=>{clean();void studioRestore();new MutationObserver(clean).observe(document.body||document.documentElement,{childList:true,subtree:true});setTimeout(clean,700);};
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

async function authorizeNativeMusicGeneration(request, env) {
  const billingUrl = new URL('/api/billing/status', request.url);
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.delete('content-type');

  const statusRequest = new Request(billingUrl.toString(), {
    method: 'GET',
    headers,
    redirect: 'manual'
  });
  const statusResponse = await handleSonaraNativeAuth(statusRequest, env);
  if (!statusResponse) {
    return new Response(JSON.stringify({ error: { code: 'AUTH_STORE_UNAVAILABLE', message: 'Servizio account SONARA non disponibile.' } }), {
      status: 503,
      headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' }
    });
  }
  if (!statusResponse.ok) return statusResponse;

  const payload = await statusResponse.clone().json().catch(() => ({}));
  const billing = payload?.billing || null;
  if (!billing?.planId) {
    return new Response(JSON.stringify({ error: { code: 'AUTH_TOKEN_INVALID', message: 'Accedi con un account SONARA valido.' } }), {
      status: 401,
      headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' }
    });
  }

  try {
    const body = await request.clone().json();
    const requestedSeconds = Math.max(30, Math.min(480, Math.round(Number(body?.durationSec ?? body?.duration ?? 30))));
    const maxTrackSeconds = Math.max(1, Number(billing.maxTrackSeconds || 60));
    const remainingSeconds = Math.max(0, Number(billing.remainingSeconds ?? billing.includedSeconds ?? 0));
    if (requestedSeconds > maxTrackSeconds) {
      return new Response(JSON.stringify({
        error: { code: 'TRACK_DURATION_LIMIT', message: 'La durata richiesta supera il limite del piano attivo.' },
        planId: billing.planId,
        maxTrackSeconds
      }), {
        status: 403,
        headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' }
      });
    }
    if (remainingSeconds > 0 && requestedSeconds > remainingSeconds) {
      return new Response(JSON.stringify({
        error: { code: 'USAGE_LIMIT_REACHED', message: 'Hai terminato i minuti inclusi nel piano corrente.' },
        planId: billing.planId,
        remainingSeconds
      }), {
        status: 402,
        headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' }
      });
    }
  } catch {
    // The downstream generator owns payload validation; authentication is valid.
  }

  return null;
}

async function forwardVerifiedMusicGeneration(request, env, ctx) {
  const target = new URL('/api/engine/generate', request.url);
  const headers = new Headers(request.headers);
  headers.delete('content-length');
  headers.set('content-type', request.headers.get('content-type') || 'application/json');
  headers.set('x-sonara-native-auth', 'verified');

  const internalSecret = String(env?.SONARA_INTERNAL_PROXY_SECRET || '').trim();
  if (internalSecret) headers.set('X-Sonara-Internal-Secret', internalSecret);

  const body = await request.arrayBuffer();
  const engineRequest = new Request(target.toString(), {
    method: 'POST',
    headers,
    body,
    redirect: 'manual'
  });

  const response = await runtime.fetch(engineRequest, env, ctx);
  const out = new Headers(response.headers);
  out.set('x-sonara-billing', 'native-entitlement');
  out.set('x-sonara-generation-route', 'native-to-molab');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: out
  });
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

    if (publicHost && request.method === 'POST' && url.pathname === '/api/billing/generate') {
      const denied = await authorizeNativeMusicGeneration(request, env);
      if (denied) return withVersion(denied);
      const response = await forwardVerifiedMusicGeneration(request, env, ctx);
      return withVersion(response);
    }

    const response = await runtime.fetch(request, env, ctx);
    if (!publicHost) return response;
    if (request.method === 'GET') return inject(response);
    if (request.method === 'HEAD') return withVersion(response);
    return response;
  }
};