import runtime, { SonaraJobState } from './sonara-studio-ai-router.mjs';
import { SonaraAuthStore, handleSonaraNativeAuth } from './sonara-native-auth.mjs';
import relayRuntime from './sonara-r2-https-relay.mjs';
import { proCapabilities } from './sonara-remix-pro-r2.mjs';
import { parseV6Controls, v6PreviewBrief } from './sonara-remix-pro-v6-controls.mjs';
import { prepareMolabR2RelayPayload } from './sonara-molab-xl-router.mjs';
import { deriveRelayGatewayInternalKey } from './sonara-gateway-verifier.mjs';
import { REMIX_PRO_DURATION_EDGE_SCRIPT } from './sonara-remix-pro-duration-edge.mjs';

export { SonaraJobState, SonaraAuthStore };

const VERSION = 'sonara-ab-player-playback-edge-v5-r2';
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
      element.append(REMIX_PRO_DURATION_EDGE_SCRIPT, { html: true });
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
  if (!statusResponse.ok) return readableGenerationFailure(
    statusResponse, 'Verifica dell\'account SONARA non riuscita. Riprova dopo aver effettuato l\'accesso.'
  );

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
    if (body?.sonaraRemixPro !== true && requestedSeconds > maxTrackSeconds) {
      return new Response(JSON.stringify({
        error: { code: 'TRACK_DURATION_LIMIT', message: 'La durata richiesta supera il limite del piano attivo.' },
        planId: billing.planId,
        maxTrackSeconds
      }), {
        status: 403,
        headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' }
      });
    }
    if (body?.sonaraRemixPro !== true && remainingSeconds > 0 && requestedSeconds > remainingSeconds) {
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

function nativeGenerationError(code, message, status) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' }
  });
}

// The native account/quota service sometimes returns {code, message} instead
// of {error:{code,message}}. Normalize those denials for existing Remix Pro UI:
// otherwise it falsely shows "Job Remix Pro non autorizzato" for every failure.
// Preserve Set-Cookie, especially the server's expired-session clearing cookie.
// Never bypass authentication, active-job locking, billing, or GPU permissions.
async function readableGenerationFailure(response, fallback) {
  const payload = await response.clone().json().catch(() => ({}));
  const body = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const detail = body.error && typeof body.error === 'object' ? body.error : {};
  const code = String(detail.code || body.code || 'GENERATION_REQUEST_FAILED').slice(0, 64);
  const messages = {
    AUTH_REQUIRED: 'Sessione SONARA non valida o scaduta. Accedi nuovamente prima di creare un Remix Pro.',
    AUTH_TOKEN_INVALID: 'Sessione SONARA non valida o scaduta. Accedi nuovamente.',
    PRO_JOB_ALREADY_ACTIVE: 'Hai gia un job Remix Pro in corso. Controlla il job precedente e attendi che termini prima di crearne un altro.',
    PRO_RESERVATION_CONFLICT: 'Esiste una prenotazione Remix Pro ancora aperta. Verifica il job precedente prima di riprovare.',
    PRO_USAGE_UNAUTHORIZED: 'La verifica privata del server Remix Pro e fallita. Controlla il collegamento Cloudflare; non disattivare la protezione della GPU.'
  };
  const explicit = [
    detail.message,
    body.message,
    typeof body.error === 'string' ? body.error : null
  ].find(value => typeof value === 'string' && value.trim() && value.length <= 250);
  const result = nativeGenerationError(code, messages[code] || explicit || fallback, response.status);
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) result.headers.set('set-cookie', setCookie);
  return result;
}

async function relayAgentAvailable(env) {
  if (!env.SONARA_AUDIO_BUCKET) return false;
  try {
    const obj = await env.SONARA_AUDIO_BUCKET.get('relay-v1/agent/heartbeat.json');
    const heartbeat = obj ? await obj.json() : null;
    const lastSeen = Number(heartbeat?.lastSeen || 0);
    return lastSeen > 0 && Date.now() - lastSeen <= 15000;
  } catch {
    return false;
  }
}

// Pro quota mutations must go through the single native-auth Durable Object.
// The signed internal route is never exposed by the public auth router.
async function mutateRemixProUsage(request, env, action, jobId, seconds, ownerUid) {
  if (!env.SONARA_AUTH) return nativeGenerationError('AUTH_STORE_UNAVAILABLE', 'Archivio quote non disponibile.', 503);
  const secret = await deriveRelayGatewayInternalKey(env);
  const headers = new Headers({
    'content-type': 'application/json',
    'X-Sonara-Internal-Secret': secret
  });
  const cookie = request.headers.get('cookie');
  if (cookie && action === 'reserve') headers.set('cookie', cookie);
  const stub = env.SONARA_AUTH.get(env.SONARA_AUTH.idFromName('sonara-auth-global-v1'));
  try {
    return await stub.fetch(new Request(
      'https://sonara.internal/__sonara_internal/remix-pro-usage',
      { method: 'POST', headers, body: JSON.stringify({action,jobId,seconds,ownerUid}) }
    ));
  } catch {
    return nativeGenerationError('PRO_USAGE_UNAVAILABLE', 'Contabilizzazione Remix Pro temporaneamente non disponibile.', 503);
  }
}

async function forwardVerifiedRelayGeneration(request, env, ctx) {
  // Remix Pro has its own heartbeat and does not depend on the classic relay.
  const requested=(await request.clone().json().catch(()=>({})));
  const proRequested=requested?.sonaraRemixPro===true;
  if(proRequested) {
    const caps=await proCapabilities(env);
    if(!caps.available)return nativeGenerationError(
      'REMIX_PRO_NOT_ENABLED', 'Remix Pro non ancora disponibile: quote o GPU da verificare.',503);
    if(requested.sonaraRemixProV6===true && !caps.v6Available)
      return nativeGenerationError('REMIX_V6_WORKER_NOT_READY',
        'Il nuovo motore V6 non e ancora installato su MoLab. Usa la modalita V5 Creative DNA Preview.',503);
    if(requested.sonaraRemixProV6===true &&
       requested.sonaraRemixProV6Controls?.mode==='explosive' && !caps.explosiveAvailable)
      return nativeGenerationError('REMIX_EXPLOSIVE_WORKER_NOT_READY',
        'Explosive Fusion A+B richiede la versione GPU dedicata aggiornata.',503);
  } else if (!(await relayAgentAvailable(env))) {
    return nativeGenerationError(
      'MOLAB_RELAY_OFFLINE',
      'MoLab RTX PRO 6000 non è collegato. Il relay SONARA si sta ripristinando: riprova tra pochi secondi.',
      503
    );
  }
  // Entitlements were checked above. Resolve ownership from the same native
  // session authority used by the Vercel job-polling gateway, never from input.
  const sessionHeaders = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) sessionHeaders.set('cookie', cookie);
  const sessionResponse = await handleSonaraNativeAuth(new Request(
    new URL('/api/sonara-auth/session', request.url),
    { method: 'GET', headers: sessionHeaders, redirect: 'manual' }
  ), env);
  if (!sessionResponse) {
    return nativeGenerationError('AUTH_STORE_UNAVAILABLE', 'Servizio account SONARA non disponibile.', 503);
  }
  if (!sessionResponse.ok) return readableGenerationFailure(
    sessionResponse, 'Sessione SONARA non verificabile. Accedi nuovamente prima di creare il Remix Pro.'
  );
  const session = await sessionResponse.json().catch(() => ({}));
  const uid = String(session?.user?.uid || '').trim();
  if (session?.authenticated !== true || !uid || uid.length > 128) {
    return nativeGenerationError('AUTH_TOKEN_INVALID', 'Accedi con un account SONARA valido.', 401);
  }

  let source;
  try { source = await request.json(); }
  catch { return nativeGenerationError('INVALID_JSON', 'Corpo JSON non valido.', 400); }
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return nativeGenerationError('INVALID_JSON', 'Corpo JSON non valido.', 400);
  }
  if (!env.SONARA_AUDIO_BUCKET || String(env.SONARA_RELAY_TOKEN || '').length < 32) {
    return nativeGenerationError('R2_RELAY_UNAVAILABLE', 'Collegamento MoLab R2 non disponibile.', 503);
  }

  try {
    const internalSecret = await deriveRelayGatewayInternalKey(env);
    const isPro = source.sonaraRemixPro === true;
    let creativeControls=null;
    if(isPro && source.sonaraRemixProV5===true && source.sonaraRemixProV6Controls!==undefined) {
      try { creativeControls=parseV6Controls(source.sonaraRemixProV6Controls); }
      catch {return nativeGenerationError('REMIX_V6_CONTROLS_INVALID',
        'Controlli Creative DNA V6 non validi.',400);}
    }
    if(isPro && source.sonaraRemixProV6===true && !creativeControls)
      return nativeGenerationError('REMIX_V6_CONTROLS_REQUIRED',
        'Controlli Creative DNA V6 obbligatori.',400);
    // Resolve the V5 GPU budget before billing reservation, so the public
    // request and private queue agree even for older cached site assets.
    const proSeconds=Number(source.durationSec);
    const rawProCandidates=source.sonaraRemixProCandidates;
    const requestedProCandidates=rawProCandidates===undefined?1:Number(rawProCandidates);
    if(isPro && source.sonaraRemixProV5===true &&
       (!Number.isInteger(requestedProCandidates) ||
        requestedProCandidates<1 || requestedProCandidates>3))
      return nativeGenerationError('REMIX_PRO_CANDIDATES_INVALID',
        'Seleziona da 1 a 3 candidati musicali.',400);
    const safeProCandidates=Math.min(
      requestedProCandidates,
      proSeconds<=90?3:proSeconds<=180?2:1
    );
    // Existing billing entitlement and duration checks ran before this point.
    // Pro uses a separate, feature-flagged R2 queue; nothing can bypass billing.
    const payload = isPro
      ? {
          sourceA: source.sonaraRemixProSourceA,
          sourceB: source.sonaraRemixProSourceB,
          title: String(source.sonaraRemixProTitle||'').slice(0,96),
          ...(source.sonaraRemixProParentJobId?{parentJobId:String(source.sonaraRemixProParentJobId)}:{}),
          rightsConfirmed: source.sonaraRemixProRightsConfirmed === true,
          prompt: (String(source.prompt || '').slice(0, 4300) +
            (creativeControls && source.sonaraRemixProV6!==true
              ? '\n' + v6PreviewBrief(creativeControls) : '')).slice(0, 6500),
          durationSec: source.durationSec,
          bpmA: source.sonaraRemixProBpmA,
          bpmB: source.sonaraRemixProBpmB,
          bassFrom: source.sonaraRemixProBassFrom,
          coverStrength: source.audio_cover_strength,
          coverNoise: source.cover_noise_strength,
          key: source.key_scale,
          v5: source.sonaraRemixProV5 === true,
          v6: source.sonaraRemixProV6 === true,
          v7: source.sonaraRemixProV7 === true,
          ...(creativeControls ? {v6Controls:creativeControls} : {}),
          genre: source.sonaraRemixProGenre,
          bInfluence: source.sonaraRemixProBInfluence,
          candidateCount: source.sonaraRemixProV5===true?safeProCandidates:undefined,
          durationMode: source.sonaraRemixProDurationMode
        }
      : await prepareMolabR2RelayPayload({ ...source, sonaraUserUid: uid });
    // Rebuild the internal request: client-supplied owner and gateway headers
    // must never authorize a different user or survive this trust boundary.
    const headers = new Headers({
      'content-type': 'application/json',
      'X-Sonara-Internal-Secret': internalSecret,
      'X-Sonara-User-Uid': uid
    });
    let proJobId = null;
    if (isPro) {
      const seconds = Number(source.durationSec);
      if (!Number.isInteger(seconds) || seconds < 30 || seconds > 480) {
        return nativeGenerationError('INVALID_PRO_DURATION', 'Durata Remix Pro non valida.', 400);
      }
      // Remix Pro does not deduct any Studio minutes; the authenticated
      // private job reservation still prevents duplicate or cross-user jobs.
      proJobId = 'srpro_' + crypto.randomUUID();
      const reservation = await mutateRemixProUsage(request, env, 'reserve', proJobId, seconds, uid);
      if (!reservation.ok) return readableGenerationFailure(
        reservation, 'Impossibile registrare il job Remix Pro. Controlla lo stato del job precedente.'
      );
      payload.jobId = proJobId;
    }
    const target = new URL(isPro ? '/api/sonara-relay/pro-enqueue' : '/api/sonara-relay/enqueue', request.url);
    let response;
    try {
      response = await relayRuntime.fetch(new Request(target, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        redirect: 'manual'
      }), { ...env, SONARA_INTERNAL_PROXY_SECRET: internalSecret }, ctx);
    } catch {
      response = nativeGenerationError('R2_RELAY_UNAVAILABLE', 'Coda Remix Pro non disponibile.', 503);
    }
    if (proJobId && !response.ok) {
      // The request can be written to R2 even if the HTTPS acknowledgement
      // gets lost. Read the exact server-generated job ID and authenticate
      // owner/duration before reporting "enqueue unconfirmed". Never create
      // another reservation or a second GPU job.
      try {
        const obj=await env.SONARA_AUDIO_BUCKET.get('relay-v1/pro/jobs/'+proJobId+'.json');
        const live=obj?await obj.json():null;
        if(live?.id===proJobId && live?.ownerUid===uid &&
           live?.kind==='sonara-remix-pro' &&
           Number(live?.durationSeconds)===Number(source.durationSec)) {
          if(['QUEUED','LEASED','COMPLETE'].includes(live.status)) {
            return new Response(JSON.stringify({
              jobId:proJobId,
              status:live.status==='COMPLETE'?'COMPLETED':'PROCESSING',
              requestedDurationSeconds:Number(live.durationSeconds),
              recovered:true
            }),{status:live.status==='COMPLETE'?200:202,
                 headers:{'content-type':'application/json; charset=UTF-8',
                          'cache-control':'no-store'}});
          }
          if(live.status==='PREPARING') {
            // The same signed job and reservation may be activated again.
            // A CAS in the queue ensures this is not a new task.
            const retry=await relayRuntime.fetch(new Request(target,{
              method:'POST',headers,body:JSON.stringify(payload),redirect:'manual'
            }),{...env,SONARA_INTERNAL_PROXY_SECRET:internalSecret},ctx);
            if(retry.ok)return retry;
          }
        }
      } catch { /* Fall through to conservative private reconciliation. */ }
      // A deterministic 4xx is an actual rejection, not an ambiguous enqueue.
      // The private ledger reconciler still owns all refunds and cross-service
      // settlement; preserve the job ID only when submission is uncertain.
      if ([400,401,403,404,413,422].includes(response.status)) {
        // Validation failed synchronously before R2 ever wrote a job. Release
        // this reserved slot now; never force a user to wait for an alarm.
        // Network timeouts/409/5xx remain ambiguous and require reconciliation.
        const settled=await mutateRemixProUsage(request,env,'refund',proJobId,0,uid);
        if (!settled.ok) return nativeGenerationError(
          'REMIX_SLOT_RECONCILIATION_PENDING',
          'Richiesta rifiutata. La prenotazione è in verifica; non avviare un doppio job.',
          503
        );
        return readableGenerationFailure(response,
          'Remix Pro non accodato: controlla i parametri e riprova.');
      }
      // A failed response does NOT prove the R2 write failed. Refunding here
      // can race a job already queued/leased on MoLab. Keep the reservation
      // until the Durable Object alarm verifies absence or terminal state.
      return new Response(JSON.stringify({
        jobId: proJobId,
        recoveryPending: true,
        error: {
          code: 'REMIX_PRO_ENQUEUE_UNCONFIRMED',
          message: 'Accodamento Remix Pro non confermato. Il job privato resta in verifica automatica, senza consumo di minuti Studio. ID: ' + proJobId
        }
      }), { status: 503, headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' } });
    }
    return response;
  } catch {
    // When the relay is enabled, fail closed; never retry through a Quick Tunnel.
    return nativeGenerationError('R2_RELAY_UNAVAILABLE', 'Collegamento MoLab R2 non disponibile.', 503);
  }
}

async function forwardVerifiedMusicGeneration(request, env, ctx) {
  const relayEnabled = env.SONARA_R2_RELAY_ENABLED === 'true';
  let response;
  if (relayEnabled) {
    response = await forwardVerifiedRelayGeneration(request, env, ctx);
  } else {
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

    response = await runtime.fetch(engineRequest, env, ctx);
  }
  const out = new Headers(response.headers);
  out.set('x-sonara-billing', 'native-entitlement');
  out.set('x-sonara-generation-route', relayEnabled ? 'native-to-molab-r2' : 'native-to-molab');
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
    const nativeAuthHost = publicHost || url.hostname === 'api.sonaraenterprise.com';

    if (
      nativeAuthHost && (
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
