// Direct native-account gateway for explicitly selected open music models.
//
// The browser's /api/billing/generate is normally processed by a long legacy
// ACE-Step/Dual pipeline. HeartMuLa/Stable Audio must NOT enter that pipeline:
// they own a distinct GPU heartbeat, a single-WAV R2 queue, and signed output.
// All accounts, plan limits, and job ownership are verified server-side here.
import { handleSonaraNativeAuth } from './sonara-native-auth.mjs';
import { deriveRelayGatewayInternalKey } from './sonara-gateway-verifier.mjs';
import {
  selectedCreatorOpenModel, enqueueCreatorOpenModel,
  isCreatorOpenModelJob, pollCreatorOpenModelJob
} from './sonara-creator-open-model-route.mjs';

const MODEL_IDS = new Set(['heartmula-3b','stable-audio-3-medium']);
const JOB_ID = /^sr2_[0-9a-f-]{36}$/;
const JSON_HEADERS = {
  'content-type':'application/json; charset=utf-8',
  'cache-control':'private, no-store',
  'x-content-type-options':'nosniff',
};

function error(code,message,status,stage) {
  return new Response(JSON.stringify({error:{code,message}}),{
    status,
    headers:{...JSON_HEADERS,'x-sonara-open-model-stage':stage}
  });
}
function withStage(response,stage) {
  const headers = new Headers(response.headers);
  headers.set('cache-control','private, no-store');
  headers.set('x-sonara-open-model-stage',stage);
  headers.set('x-content-type-options','nosniff');
  return new Response(response.body,{
    status:response.status,statusText:response.statusText,headers
  });
}
function authRequest(original,pathname,withAuth=true) {
  const headers=new Headers();
  if(withAuth) {
    for (const key of ['cookie','authorization']) {
      const value=original.headers.get(key);
      if(value) headers.set(key,value);
    }
  }
  return new Request(new URL(pathname,original.url),{
    method:'GET',headers,redirect:'manual'
  });
}
async function nativeSession(original,handler,env) {
  const response=await handler(authRequest(original,'/api/sonara-auth/session'),env);
  if (!response) return {error:error('AUTH_STORE_UNAVAILABLE','Servizio account SONARA non disponibile.',503,'session')};
  if (!response.ok) return {error:error('AUTH_TOKEN_INVALID','Accedi nuovamente a SONARA.',401,'session')};
  const data=await response.json().catch(()=>({}));
  const uid=String(data?.user?.uid||'').trim();
  if(data?.authenticated!==true || !uid || uid.length>128) {
    return {error:error('AUTH_TOKEN_INVALID','Accedi nuovamente a SONARA.',401,'session')};
  }
  return {uid};
}
async function checkPlan(original,body,handler,env) {
  const resp=await handler(authRequest(original,'/api/billing/status'),env);
  if(!resp) return error('AUTH_STORE_UNAVAILABLE','Servizio account SONARA non disponibile.',503,'plan');
  if(!resp.ok) return error(
    resp.status===401?'AUTH_TOKEN_INVALID':'PLAN_CHECK_UNAVAILABLE',
    resp.status===401?'Accedi nuovamente a SONARA.':'Verifica del piano SONARA non disponibile.',
    resp.status===401?401:503,'plan'
  );
  const data=await resp.json().catch(()=>({}));
  const billing=data?.billing;
  if(!billing?.planId)return error('AUTH_TOKEN_INVALID','Accedi con un account SONARA valido.',401,'plan');
  // Preserve the existing native plan and included-minute constraints.
  const seconds=Math.max(30,Math.min(480,Math.round(Number(body.durationSec??body.duration??30))));
  const maxSeconds=Math.max(1,Number(billing.maxTrackSeconds||60));
  const remaining=Math.max(0,Number(billing.remainingSeconds??billing.includedSeconds??0));
  if(seconds>maxSeconds)return error('TRACK_DURATION_LIMIT','La durata supera il limite del tuo piano.',403,'plan');
  if(remaining>0 && seconds>remaining)return error('USAGE_LIMIT_REACHED','Hai terminato i minuti inclusi nel piano.',402,'plan');
  return null;
}
function isPublicHost(url) {
  return ['sonaraenterprise.com','www.sonaraenterprise.com'].includes(url.hostname);
}

/**
 * Intercept only explicitly marked Music Creator jobs.
 * All other routes return null and continue through the original Worker.
 * DI for the native auth handler enables isolated high-confidence tests.
 */
export async function handleNativeOpenModelCreator(request,env,ctx,authHandler=handleSonaraNativeAuth) {
  const url=new URL(request.url);
  if(!isPublicHost(url))return null;
  const generate=url.pathname==='/api/billing/generate' && request.method==='POST';
  const poll=url.pathname==='/api/billing/job' && request.method==='GET';
  if(!generate&&!poll)return null;
  let stage='initial';
  try {
    if(generate) {
      const type=String(request.headers.get('content-type')||'').toLowerCase();
      if(!type.includes('application/json'))return null;
      stage='request';
      let body;
      try {
        const raw=await request.clone().text();
        if(raw.length>80_000)return error('INVALID_CREATOR_REQUEST','Richiesta troppo grande.',413,stage);
        body=JSON.parse(raw);
      } catch {
        // Non-multi requests retain their original legacy behavior.
        return null;
      }
      if(!body||typeof body!=='object'||Array.isArray(body))return null;
      if(body.sonaraMultiEngineCreatorRequest!==true)return null;
      if(body.sonaraRemixPro===true)return null;
      // ACE-Step is the only supported Creator engine. Ignore stale UI
      // selections before they can reach a retired GPU queue.
      if(env.SONARA_MULTI_ENGINE_ENABLED!=='true') {
        return error('CREATOR_MODEL_RETIRED',
          'SONARA utilizza solo ACE-Step XL Turbo. Aggiorna la pagina e riprova.',410,stage);
      }
      const model=selectedCreatorOpenModel(body);
      if(!MODEL_IDS.has(model)) {
        // Fail closed; do not silently fall back to legacy ACE-Step.
        return error('INVALID_CREATOR_MODEL','Modello Music Creator non supportato.',400,stage);
      }
      stage='plan';
      const denied=await checkPlan(request,body,authHandler,env);
      if(denied)return denied;
      stage='session';
      const session=await nativeSession(request,authHandler,env);
      if(session.error)return session.error;
      stage='gateway';
      const secret=await deriveRelayGatewayInternalKey(env);
      // SONARA Music Creator resolves its world-music catalog in the
      // frontend bundle, which is already compiled by Vite. Keep the server
      // protected by native account, plan, owner and length validation.
      // This style metadata affects only model conditioning, not privilege.
      const conditioned={...body};
      stage='enqueue';
      // Important: NEVER retry this POST through a legacy router. An R2
      // queue write can succeed even when the acknowledgement is lost.
      const result=await enqueueCreatorOpenModel(conditioned,env,ctx,session.uid,secret,request.url);
      if(!result)return error('INVALID_CREATOR_MODEL','Modello Music Creator non supportato.',400,stage);
      return withStage(result,'native-open-model-enqueue');
    }
    // The ACE-Step relay shares the sr2_ ID prefix. Only intercept jobs
    // proven to exist in the new multi-engine R2 namespace.
    const id=String(url.searchParams.get('jobId')||'').trim();
    if(!JOB_ID.test(id))return null;
    stage='job-lookup';
    const ours=await isCreatorOpenModelJob(request,env);
    if(!ours)return null;
    stage='session';
    const session=await nativeSession(request,authHandler,env);
    if(session.error)return session.error;
    stage='gateway';
    const secret=await deriveRelayGatewayInternalKey(env);
    stage='poll';
    const result=await pollCreatorOpenModelJob(request,env,ctx,session.uid,secret);
    return withStage(result,'native-open-model-poll');
  } catch (cause) {
    // Do not log request bodies, cookies, tokens, audio, or signatures.
    console.warn('SONARA_OPEN_MODEL_ERROR',stage,String(cause?.name||'Error').slice(0,48));
    return error(
      stage==='enqueue'?'OPEN_MODEL_SUBMISSION_UNCONFIRMED':'OPEN_MODEL_GATEWAY_UNAVAILABLE',
      stage==='enqueue'
        ? 'Conferma della richiesta non riuscita. Verifica i tuoi lavori prima di riprovare.'
        : 'Servizio SONARA temporaneamente non disponibile.',
      503,stage
    );
  }
}
